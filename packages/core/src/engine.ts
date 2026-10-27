import { consequenceDeltas, type Consequence } from "./court.ts";
import { levelFromXp } from "./leveling.ts";
import { ONCE_KEY } from "./recurrence.ts";
import { computeReward, type Reward } from "./rewards.ts";
import type { Attribute, Character, GameEvent, Quest, QuestInstance } from "./schemas.ts";
import { checkPurchase, type PurchaseResult, type ShopItem } from "./shop.ts";
import { canUnlock, type UnlockCheck } from "./skills.ts";

/**
 * Reine Spiel-Engine für den lokalen/Offline-Modus.
 * Der Server (complete_quest_instance in der Migration) implementiert dieselben Regeln in SQL.
 */
export interface GameState {
  character: Character;
  quests: Quest[];
  instances: QuestInstance[];
  events: GameEvent[];
  /** Freigeschaltete Skills (IDs wie "ausdauer_1"). */
  skills?: string[];
}

/** Questkette: gesperrt, solange die Voraussetzung existiert und nicht erledigt ist. */
export function isQuestLocked(quests: Quest[], q: Pick<Quest, "requiresQuestId">): boolean {
  if (!q.requiresQuestId) return false;
  const req = quests.find((x) => x.id === q.requiresQuestId);
  return !!req && req.status !== "erledigt";
}

export interface CompletionInput {
  eventId: string;
  instanceId: string;
  questId: string;
  occurrenceKey: string;
  dueAt: string | null;
  now: string;
}

export type CompletionResult =
  | { applied: true; reward: Reward; levelBefore: number; levelAfter: number }
  | { applied: false; reason: "duplicate_event" | "already_completed" | "quest_not_found" | "quest_inactive" | "quest_locked" };

function addAttributeXp(
  base: Character["attributeXp"],
  delta: Partial<Record<Attribute, number>>,
): Character["attributeXp"] {
  const out = { ...base };
  for (const [k, v] of Object.entries(delta) as [Attribute, number][]) out[k] = Math.max(0, (out[k] ?? 0) + v);
  return out;
}

function applyDeltas(c: Character, xp: number, coins: number, attr: Partial<Record<Attribute, number>>): Character {
  return {
    ...c,
    totalXp: Math.max(0, c.totalXp + xp),
    coins: Math.max(0, c.coins + coins),
    attributeXp: addAttributeXp(c.attributeXp, attr),
  };
}

export function completeInstance(state: GameState, input: CompletionInput): { state: GameState; result: CompletionResult } {
  if (state.events.some((e) => e.id === input.eventId)) {
    return { state, result: { applied: false, reason: "duplicate_event" } };
  }
  const quest = state.quests.find((q) => q.id === input.questId);
  if (!quest) return { state, result: { applied: false, reason: "quest_not_found" } };
  if (quest.status !== "aktiv") return { state, result: { applied: false, reason: "quest_inactive" } };
  if (isQuestLocked(state.quests, quest)) return { state, result: { applied: false, reason: "quest_locked" } };

  const existing = state.instances.find((i) => i.questId === quest.id && i.occurrenceKey === input.occurrenceKey);
  if (existing?.status === "erledigt") return { state, result: { applied: false, reason: "already_completed" } };

  const reward = computeReward(quest, new Set(state.skills ?? []));
  const levelBefore = levelFromXp(state.character.totalXp).level;
  const character = applyDeltas(state.character, reward.xp, reward.coins, reward.attributeXp);
  const levelAfter = levelFromXp(character.totalXp).level;

  const instance: QuestInstance = {
    id: existing?.id ?? input.instanceId,
    questId: quest.id,
    occurrenceKey: input.occurrenceKey,
    dueAt: input.dueAt,
    status: "erledigt",
    completedAt: input.now,
    eventId: input.eventId,
  };
  const event: GameEvent = {
    id: input.eventId,
    kind: "quest_completed",
    xpDelta: reward.xp,
    coinDelta: reward.coins,
    attributeXp: reward.attributeXp,
    refId: instance.id,
    note: quest.title,
    createdAt: input.now,
  };

  const quests =
    input.occurrenceKey === ONCE_KEY
      ? state.quests.map((q) => (q.id === quest.id ? { ...q, status: "erledigt" as const, progress: 100, updatedAt: input.now } : q))
      : state.quests;

  return {
    state: {
      character,
      quests,
      instances: existing ? state.instances.map((i) => (i.id === existing.id ? instance : i)) : [...state.instances, instance],
      events: [...state.events, event],
    },
    result: { applied: true, reward, levelBefore, levelAfter },
  };
}

/** Macht einen Abschluss rückgängig (z. B. versehentlich abgehakt). Gegenbuchung statt Löschen. */
export function uncompleteInstance(
  state: GameState,
  input: { eventId: string; instanceId: string; now: string },
): { state: GameState; applied: boolean } {
  if (state.events.some((e) => e.id === input.eventId)) return { state, applied: false };
  const inst = state.instances.find((i) => i.id === input.instanceId);
  if (!inst || inst.status !== "erledigt" || !inst.eventId) return { state, applied: false };
  const original = state.events.find((e) => e.id === inst.eventId);
  if (!original) return { state, applied: false };

  const negAttr = Object.fromEntries(Object.entries(original.attributeXp).map(([k, v]) => [k, -v]));
  const event: GameEvent = {
    id: input.eventId,
    kind: "quest_uncompleted",
    xpDelta: -original.xpDelta,
    coinDelta: -original.coinDelta,
    attributeXp: negAttr,
    refId: inst.id,
    note: original.note,
    createdAt: input.now,
  };
  return {
    applied: true,
    state: {
      character: applyDeltas(state.character, event.xpDelta, event.coinDelta, negAttr),
      quests: state.quests.map((q) =>
        q.id === inst.questId && inst.occurrenceKey === ONCE_KEY ? { ...q, status: "aktiv" as const, progress: 0 } : q,
      ),
      instances: state.instances.map((i) =>
        i.id === inst.id ? { ...i, status: "offen" as const, completedAt: null, eventId: null } : i,
      ),
      events: [...state.events, event],
    },
  };
}

/** Kauf im Belohnungsshop: Coins abziehen, Ereignis buchen. Idempotent über die Event-ID. */
export function purchaseItem(
  state: GameState,
  input: { eventId: string; item: Pick<ShopItem, "id" | "title" | "cost" | "active"> | undefined; now: string },
): { state: GameState; result: PurchaseResult } {
  if (state.events.some((e) => e.id === input.eventId)) return { state, result: { applied: false, reason: "duplicate_event" } };
  const blocked = checkPurchase(state.character.coins, input.item);
  if (blocked) return { state, result: blocked };
  const item = input.item!;
  const event: GameEvent = {
    id: input.eventId,
    kind: "shop_purchase",
    xpDelta: 0,
    coinDelta: -item.cost,
    attributeXp: {},
    refId: item.id,
    note: item.title,
    createdAt: input.now,
  };
  const character = applyDeltas(state.character, 0, -item.cost, {});
  return { state: { ...state, character, events: [...state.events, event] }, result: { applied: true, coinsAfter: character.coins } };
}

/** Bucht die Konsequenzen eines Urteils (oder deren Rücknahme mit sign = -1). */
export function applyVerdictEvent(
  state: GameState,
  input: { eventId: string; caseId: string; consequences: Consequence[]; now: string; revert?: boolean },
): { state: GameState; applied: boolean } {
  if (state.events.some((e) => e.id === input.eventId)) return { state, applied: false };
  const d = consequenceDeltas(input.consequences);
  const sign = input.revert ? -1 : 1;
  const event: GameEvent = {
    id: input.eventId,
    kind: input.revert ? "court_verdict_reverted" : "court_verdict",
    xpDelta: d.xp * sign,
    coinDelta: d.coins * sign,
    attributeXp: {},
    refId: input.caseId,
    note: "",
    createdAt: input.now,
  };
  return {
    applied: true,
    state: { ...state, character: applyDeltas(state.character, event.xpDelta, event.coinDelta, {}), events: [...state.events, event] },
  };
}

/** Schaltet einen Skill frei (lokaler Modus). Server: public.unlock_skill(). */
export function unlockSkill(state: GameState, skillId: string): { state: GameState; result: UnlockCheck } {
  const unlocked = new Set(state.skills ?? []);
  const check = canUnlock(skillId, state.character.attributeXp, unlocked);
  if (!check.ok) return { state, result: check };
  return { state: { ...state, skills: [...unlocked, skillId] }, result: check };
}

/** Bosskampf: Trefferpunkte = Teilaufgaben. Jede erledigte Teilaufgabe ist ein Treffer. */
export function bossHp(q: Pick<Quest, "type" | "subtasks" | "status">): { max: number; current: number } | null {
  if (q.type !== "boss") return null;
  const max = Math.max(1, q.subtasks.length);
  if (q.status === "erledigt") return { max, current: 0 };
  const hits = q.subtasks.filter((s) => s.done).length;
  return { max, current: q.subtasks.length ? max - hits : max };
}
