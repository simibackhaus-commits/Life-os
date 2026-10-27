import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  QuestDraftSchema,
  computeReward,
  levelFromXp,
  localToday,
  parseQuickAdd,
  ShopItemDraftSchema,
  type PurchaseResult,
  type Quest,
  type ShopItem,
  type ShopItemDraftInput,
  type LifetimeStats,
  type DaySettlement,
  GoalDraftSchema,
  FinanceEntrySchema,
  WorkoutSchema,
  type Goal,
  type GoalDraft,
  type GoalDraftInput,
  type FinanceEntry,
  type FinanceEntryInput,
  type Workout,
  type WorkoutInput,
  FocusStartSchema,
  type FocusSession,
  type FocusStartInput,
  type FocusFinishResult,
  type UnlockCheck,
} from "@life-os/core";

interface ShopItemRow {
  id: string;
  title: string;
  description: string;
  cost: number;
  icon: string;
  active: boolean;
  created_at: string;
}

interface GoalRow {
  id: string;
  title: string;
  description: string;
  area: Goal["area"];
  target_value: number | string | null;
  current_value: number | string;
  unit: string | null;
  due_date: string | null;
  status: Goal["status"];
  created_at: string;
}
const goalFromRow = (r: GoalRow): Goal => ({
  id: r.id,
  title: r.title,
  description: r.description,
  area: (["business", "sport", "finanzen"].includes(r.area) ? r.area : "allgemein") as Goal["area"],
  targetValue: r.target_value === null ? null : Number(r.target_value),
  currentValue: Number(r.current_value),
  unit: r.unit,
  dueDate: r.due_date,
  status: r.status,
  createdAt: r.created_at,
});
const goalToRow = (d: GoalDraft) => ({
  title: d.title,
  description: d.description,
  area: d.area,
  target_value: d.targetValue,
  current_value: d.currentValue,
  unit: d.unit,
  due_date: d.dueDate,
  status: d.status,
});

interface WorkoutRow {
  id: string;
  date: string;
  kind: Workout["kind"];
  duration_min: number;
  distance_km: number | string | null;
  intensity: number;
  exercises: Workout["exercises"];
  note: string;
  created_at: string;
}
const workoutFromRow = (r: WorkoutRow): Workout => ({
  id: r.id,
  date: r.date,
  kind: r.kind,
  durationMin: r.duration_min,
  distanceKm: r.distance_km === null ? null : Number(r.distance_km),
  intensity: r.intensity,
  exercises: r.exercises,
  note: r.note,
  createdAt: r.created_at,
});

interface FinanceRow {
  id: string;
  kind: FinanceEntry["kind"];
  amount: number | string;
  category: string;
  note: string;
  date: string;
  goal_id: string | null;
  created_at: string;
}
const financeFromRow = (r: FinanceRow): FinanceEntry => ({
  id: r.id,
  kind: r.kind,
  amount: Number(r.amount),
  category: r.category,
  note: r.note,
  date: r.date,
  goalId: r.goal_id,
  createdAt: r.created_at,
});

interface FocusRow {
  id: string;
  dungeon: string;
  attribute: FocusSession["attribute"];
  intent: string;
  minutes: number;
  started_at: string;
  finished_at: string | null;
  status: FocusSession["status"];
}
const focusFromRow = (r: FocusRow): FocusSession => ({
  id: r.id,
  dungeonId: r.dungeon,
  attribute: r.attribute,
  intent: r.intent,
  minutes: r.minutes,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  status: r.status,
});

interface PurchaseRow {
  id: string;
  item_id: string | null;
  title: string;
  cost: number;
  event_id: string;
  purchased_at: string;
}
import {
  characterFromRow,
  eventFromRow,
  instanceFromRow,
  questDraftToRow,
  questFromRow,
  type CharacterRow,
  type EventRow,
  type InstanceRow,
  type QuestRow,
} from "@life-os/database";
import { DAY_CLOSED_MESSAGE, type KeyValueStorage } from "./local-store.ts";
import { Outbox, isNetworkError, type OutboxItem } from "./outbox.ts";
import { FeatureUnavailableError, type ChatReply, type CompletionOutcome, type CourtCase, type CourtMessage, type DataStore, type QuestPatch, type Snapshot, type SyncState } from "./types.ts";

interface CaseRow {
  id: string;
  quest_id: string | null;
  occurrence_key: string | null;
  charge: string;
  status: CourtCase["status"];
  plea: CourtCase["plea"];
  verdict: CourtCase["verdict"];
  reasoning: string | null;
  protected_reason: CourtCase["protectedReason"];
  consequences: CourtCase["consequences"];
  rulebook_version: string | null;
  quest_xp: number;
  quest_coins: number;
  appeal_count: number;
  created_at: string;
  decided_at: string | null;
}

const caseFromRow = (r: CaseRow): CourtCase => ({
  id: r.id,
  questId: r.quest_id,
  occurrenceKey: r.occurrence_key,
  charge: r.charge,
  status: r.status,
  plea: r.plea,
  verdict: r.verdict,
  reasoning: r.reasoning,
  protectedReason: r.protected_reason,
  consequences: r.consequences,
  rulebookVersion: r.rulebook_version,
  questXp: r.quest_xp,
  questCoins: r.quest_coins,
  appealCount: r.appeal_count,
  createdAt: r.created_at,
  decidedAt: r.decided_at,
});

/** Liest die { error }-Meldung aus der Antwort einer Edge Function, falls vorhanden. */
async function functionErrorMessage(err: { message: string; context?: unknown }): Promise<string> {
  const ctx = err.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const body = (await (ctx as Response).clone().json()) as { error?: string };
      if (body.error) return body.error;
    } catch {
      // kein JSON
    }
  }
  return err.message;
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export function createSupabase(url: string, anonKey: string, storage?: KeyValueStorage): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storage, storageKey: "life-os-auth" },
  });
}

/**
 * Supabase-gestützter Spielstand. Alle XP/Coin-Änderungen laufen über RPCs (serverseitig validiert).
 * Abschlüsse ohne Netz landen in der Outbox und werden mit derselben Event-ID nachgesendet.
 */
export class CloudStore implements DataStore {
  readonly mode = "cloud" as const;
  private listeners = new Set<() => void>();
  private syncListeners = new Set<(s: SyncState, pending: number) => void>();
  private outbox: Outbox;
  private last: Snapshot | null = null;
  private syncState: SyncState = "synchron";

  constructor(
    private sb: SupabaseClient,
    private userId: string,
    storage: KeyValueStorage,
  ) {
    this.outbox = new Outbox(storage);
    this.sb
      .channel(`life-os-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", filter: `user_id=eq.${userId}` }, () => this.emit())
      .subscribe();
    // Browser/Tauri: bei Netzrückkehr nachsenden. React Native ruft flush() selbst (NetInfo) auf.
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("online", () => void this.flush());
    }
    void this.flush();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  private setSync(s: SyncState) {
    this.syncState = s;
    const pending = this.outbox.list().length;
    this.syncListeners.forEach((cb) => cb(s, pending));
  }

  subscribe(onChange: () => void) {
    this.listeners.add(onChange);
    return () => void this.listeners.delete(onChange);
  }

  onSyncState(cb: (s: SyncState, pending: number) => void) {
    this.syncListeners.add(cb);
    cb(this.syncState, this.outbox.list().length);
    return () => void this.syncListeners.delete(cb);
  }

  private async send(item: OutboxItem): Promise<"ok" | "rejected"> {
    const res =
      item.kind === "complete"
        ? await this.sb.rpc("complete_quest_instance", {
            p_event_id: item.eventId,
            p_quest_id: item.questId,
            p_occurrence_key: item.occurrenceKey,
            p_due_at: item.dueAt,
          })
        : await this.sb.rpc("uncomplete_quest_instance", { p_event_id: item.eventId, p_instance_id: item.instanceId });
    if (res.error) {
      if (isNetworkError(res.error)) throw res.error;
      return "rejected";
    }
    return "ok";
  }

  async flush() {
    if (this.outbox.list().length === 0) return;
    this.setSync("synchronisiere");
    const { remaining } = await this.outbox.flush((i) => this.send(i));
    this.setSync(remaining ? "offline" : "synchron");
    this.emit();
  }

  async load(): Promise<Snapshot> {
    try {
      const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
      const [ch, quests, inst, events, cases, msgs, items, buys, skills, lifetime, goals, workouts, finance, focus] = await Promise.all([
        this.sb.from("characters").select("*").eq("user_id", this.userId).single(),
        this.sb.from("quests").select("*").neq("status", "archiviert").order("created_at"),
        this.sb.from("quest_instances").select("*").or(`completed_at.gte.${since},completed_at.is.null`),
        this.sb.from("game_events").select("*").order("created_at", { ascending: false }).limit(200),
        this.sb.from("court_cases").select("*").order("created_at", { ascending: false }).limit(50),
        this.sb.from("court_messages").select("*").order("created_at").limit(500),
        this.sb.from("shop_items").select("*").order("cost"),
        this.sb.from("shop_purchases").select("*").order("purchased_at", { ascending: false }).limit(100),
        this.sb.from("skills_unlocked").select("skill_id"),
        this.sb.rpc("lifetime_stats"),
        this.sb.from("goals").select("*").neq("status", "archiviert").order("created_at"),
        this.sb.from("workouts").select("*").order("date", { ascending: false }).limit(300),
        this.sb.from("finance_entries").select("*").order("date", { ascending: false }).limit(500),
        this.sb.from("focus_sessions").select("*").order("started_at", { ascending: false }).limit(50),
      ]);
      this.last = {
        character: characterFromRow(unwrap<CharacterRow>(ch)),
        quests: unwrap<QuestRow[]>(quests).map(questFromRow),
        instances: unwrap<InstanceRow[]>(inst).map(instanceFromRow),
        events: unwrap<EventRow[]>(events).map(eventFromRow).reverse(),
        cases: unwrap<CaseRow[]>(cases).map(caseFromRow),
        courtMessages: unwrap<Array<{ id: string; case_id: string; role: CourtMessage["role"]; content: string; created_at: string }>>(msgs).map(
          (m) => ({ id: m.id, caseId: m.case_id, role: m.role, content: m.content, createdAt: m.created_at }),
        ),
        // Shop-Tabellen kommen aus einer späteren Migration – fehlen sie, bleibt der Rest nutzbar.
        shopItems: (items.data ?? []).map((r: ShopItemRow) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          cost: r.cost,
          icon: r.icon,
          active: r.active,
          createdAt: r.created_at,
        })),
        purchases: (buys.data ?? []).map((r: PurchaseRow) => ({
          id: r.id,
          itemId: r.item_id,
          title: r.title,
          cost: r.cost,
          eventId: r.event_id,
          purchasedAt: r.purchased_at,
        })),
        skills: ((skills.data ?? []) as Array<{ skill_id: string }>).map((r) => r.skill_id),
        lifetime: (lifetime.data as LifetimeStats | null) ?? undefined,
        // Modul-Tabellen aus späteren Migrationen: fehlen sie, bleibt der Rest nutzbar.
        goals: ((goals.data ?? []) as GoalRow[]).map(goalFromRow),
        workouts: ((workouts.data ?? []) as WorkoutRow[]).map(workoutFromRow),
        financeEntries: ((finance.data ?? []) as FinanceRow[]).map(financeFromRow),
        focusSessions: ((focus.data ?? []) as FocusRow[]).map(focusFromRow),
      };
      if (this.syncState === "offline" && this.outbox.list().length === 0) this.setSync("synchron");
      return this.last;
    } catch (e) {
      if (isNetworkError(e) && this.last) {
        this.setSync("offline");
        return this.last;
      }
      throw e;
    }
  }

  async createQuest(input: Parameters<DataStore["createQuest"]>[0]): Promise<Quest> {
    const draft = QuestDraftSchema.parse(input);
    const row = unwrap<QuestRow>(await this.sb.from("quests").insert(questDraftToRow(draft)).select().single());
    this.emit();
    return questFromRow(row);
  }

  async updateQuest(id: string, patch: QuestPatch) {
    const current = this.last?.quests.find((q) => q.id === id);
    if (!current) throw new Error("Quest nicht gefunden");
    const { status, progress, ...draftPatch } = patch;
    const merged = QuestDraftSchema.parse({ ...current, ...draftPatch });
    unwrap(
      await this.sb
        .from("quests")
        .update({ ...questDraftToRow(merged), ...(status ? { status } : {}), ...(progress !== undefined ? { progress } : {}) })
        .eq("id", id),
    );
    this.emit();
  }

  async completeOccurrence(input: { questId: string; occurrenceKey: string; dueAt: string | null }): Promise<CompletionOutcome> {
    const eventId = crypto.randomUUID();
    const res = await this.sb.rpc("complete_quest_instance", {
      p_event_id: eventId,
      p_quest_id: input.questId,
      p_occurrence_key: input.occurrenceKey,
      p_due_at: input.dueAt,
    });
    if (res.error) {
      if (!isNetworkError(res.error)) throw new Error(res.error.message);
      // Offline: vormerken und optimistisch melden. Gutschrift erfolgt erst serverseitig.
      this.outbox.push({ kind: "complete", eventId, ...input, queuedAt: new Date().toISOString() });
      this.setSync("offline");
      const quest = this.last?.quests.find((q) => q.id === input.questId);
      const reward = quest ? computeReward(quest, new Set(this.last?.skills ?? [])) : { xp: 0, coins: 0, attributeXp: {}, bonus: { xpPct: 0, coinPct: 0 } };
      const lvl = levelFromXp(this.last?.character.totalXp ?? 0).level;
      return { applied: true, reward, levelBefore: lvl, levelAfter: levelFromXp((this.last?.character.totalXp ?? 0) + reward.xp).level, queued: true };
    }
    const r = res.data as { applied: boolean; reason?: string; xp?: number; coins?: number; attribute_xp?: Record<string, number>; level_before?: number; level_after?: number; bonus?: { xpPct: number; coinPct: number } };
    this.emit();
    if (!r.applied) return { applied: false, reason: (r.reason ?? "already_completed") as "already_completed" };
    return {
      applied: true,
      pending: true,
      reward: { xp: r.xp ?? 0, coins: r.coins ?? 0, attributeXp: (r.attribute_xp ?? {}) as never, bonus: r.bonus ?? { xpPct: 0, coinPct: 0 } },
      levelBefore: r.level_before ?? 1,
      levelAfter: r.level_after ?? 1,
    };
  }

  async uncomplete(instanceId: string) {
    const r = unwrap<{ applied: boolean; reason?: string }>(
      await this.sb.rpc("uncomplete_quest_instance", { p_event_id: crypto.randomUUID(), p_instance_id: instanceId }),
    );
    if (r.reason === "day_closed") throw new Error(DAY_CLOSED_MESSAGE);
    this.emit();
    return r.applied;
  }

  async settleDays(): Promise<DaySettlement[]> {
    const res = await this.sb.rpc("settle_days");
    if (res.error) {
      // Server noch ohne Tagesabschluss-Migration: nichts zu tun
      if (/settle_days/.test(res.error.message)) return [];
      throw new Error(res.error.message);
    }
    const list = (res.data ?? []) as DaySettlement[];
    if (list.length) this.emit();
    return list;
  }

  async updateCharacter(patch: { name?: string; className?: string; avatar?: string; title?: string }) {
    const row: Record<string, string> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.className !== undefined) row.class_name = patch.className;
    if (patch.avatar !== undefined) row.avatar = patch.avatar;
    if (patch.title !== undefined) row.title = patch.title;
    unwrap(await this.sb.from("characters").update(row).eq("user_id", this.userId));
    this.emit();
  }

  async openCase(input: { questId: string; occurrenceKey: string; charge: string; questXp: number; questCoins: number }) {
    const existing = this.last?.cases.find(
      (c) => c.questId === input.questId && c.occurrenceKey === input.occurrenceKey && c.status !== "aufgehoben",
    );
    if (existing) return existing;
    const row = unwrap<CaseRow>(
      await this.sb
        .from("court_cases")
        .insert({
          quest_id: input.questId,
          occurrence_key: input.occurrenceKey,
          charge: input.charge,
          quest_xp: input.questXp,
          quest_coins: input.questCoins,
        })
        .select()
        .single(),
    );
    this.emit();
    return caseFromRow(row);
  }

  private async court(caseId: string, action: "plead" | "message" | "appeal", body: Record<string, unknown>) {
    const res = await this.sb.functions.invoke("court", { body: { caseId, action, ...body } });
    if (res.error) throw new Error(`Gericht: ${await functionErrorMessage(res.error)}`);
    this.emit();
  }

  async plead(caseId: string, input: Parameters<DataStore["plead"]>[1]) {
    await this.court(caseId, "plead", input);
  }

  async sendCourtMessage(caseId: string, content: string) {
    await this.court(caseId, "message", { statement: content });
  }

  async appeal(caseId: string, input: Parameters<DataStore["appeal"]>[1]) {
    await this.court(caseId, "appeal", input);
  }

  async chat(message: string): Promise<ChatReply> {
    const res = await this.sb.functions.invoke("game-master", { body: { message, today: localToday() } });
    if (res.error) {
      const msg = await functionErrorMessage(res.error);
      if (/KI ist nicht eingerichtet/.test(msg)) throw new FeatureUnavailableError(msg);
      throw new Error(`Spielleiter: ${msg}`);
    }
    return res.data as ChatReply;
  }

  async quickAdd(text: string) {
    const today = localToday();
    const res = await this.sb.functions.invoke("quick-add", { body: { text, today } });
    if (res.error || !res.data?.draft) return { ...parseQuickAdd(text, today), source: "offline" as const };
    return { draft: res.data.draft, notes: res.data.notes ?? [], source: "ki" as const };
  }

  async createShopItem(input: ShopItemDraftInput): Promise<ShopItem> {
    const d = ShopItemDraftSchema.parse(input);
    const r = unwrap<ShopItemRow>(await this.sb.from("shop_items").insert(d).select().single());
    this.emit();
    return { id: r.id, title: r.title, description: r.description, cost: r.cost, icon: r.icon, active: r.active, createdAt: r.created_at };
  }

  async updateShopItem(id: string, patch: Partial<ShopItemDraftInput>) {
    const cur = this.last?.shopItems.find((i) => i.id === id);
    if (!cur) throw new Error("Belohnung nicht gefunden");
    const d = ShopItemDraftSchema.parse({ ...cur, ...patch });
    unwrap(await this.sb.from("shop_items").update(d).eq("id", id));
    this.emit();
  }

  async purchase(itemId: string): Promise<PurchaseResult> {
    const r = unwrap<{ applied: boolean; reason?: string; coins_after?: number }>(
      await this.sb.rpc("purchase_shop_item", { p_event_id: crypto.randomUUID(), p_item_id: itemId }),
    );
    this.emit();
    return r.applied ? { applied: true, coinsAfter: r.coins_after ?? 0 } : { applied: false, reason: (r.reason ?? "not_found") as "not_found" };
  }

  async unlockSkill(skillId: string): Promise<UnlockCheck> {
    const r = unwrap<{ ok: boolean; reason?: string }>(await this.sb.rpc("unlock_skill", { p_skill_id: skillId }));
    this.emit();
    return r.ok ? { ok: true } : { ok: false, reason: (r.reason ?? "unknown") as "unknown" };
  }

  async createGoal(input: GoalDraftInput): Promise<Goal> {
    const row = unwrap<GoalRow>(await this.sb.from("goals").insert(goalToRow(GoalDraftSchema.parse(input))).select().single());
    this.emit();
    return goalFromRow(row);
  }

  async updateGoal(id: string, patch: Partial<GoalDraftInput>) {
    const cur = this.last?.goals.find((g) => g.id === id);
    if (!cur) throw new Error("Ziel nicht gefunden");
    // current_value pflegt bei Sparzielen der Datenbank-Trigger; hier nur mitschicken, wenn ausdrücklich geändert
    const d = GoalDraftSchema.parse({ ...cur, ...patch });
    const row = goalToRow(d);
    if (patch.currentValue === undefined) delete (row as Partial<typeof row>).current_value;
    unwrap(await this.sb.from("goals").update(row).eq("id", id));
    this.emit();
  }

  async addFinanceEntry(input: FinanceEntryInput): Promise<FinanceEntry> {
    const d = FinanceEntrySchema.parse(input);
    const row = unwrap<FinanceRow>(
      await this.sb.from("finance_entries").insert({ kind: d.kind, amount: d.amount, category: d.category, note: d.note, date: d.date, goal_id: d.goalId }).select().single(),
    );
    this.emit();
    return financeFromRow(row);
  }

  async deleteFinanceEntry(id: string) {
    unwrap(await this.sb.from("finance_entries").delete().eq("id", id));
    this.emit();
  }

  async logWorkout(input: WorkoutInput): Promise<Workout> {
    const d = WorkoutSchema.parse(input);
    const row = unwrap<WorkoutRow>(
      await this.sb
        .from("workouts")
        .insert({ date: d.date, kind: d.kind, duration_min: d.durationMin, distance_km: d.distanceKm, intensity: d.intensity, exercises: d.exercises, note: d.note })
        .select()
        .single(),
    );
    this.emit();
    return workoutFromRow(row);
  }

  async deleteWorkout(id: string) {
    unwrap(await this.sb.from("workouts").delete().eq("id", id));
    this.emit();
  }

  async startFocus(input: FocusStartInput): Promise<FocusSession> {
    const d = FocusStartSchema.parse(input);
    const id = crypto.randomUUID();
    const r = unwrap<{ ok: boolean; reason?: string; started_at?: string; minutes?: number }>(
      await this.sb.rpc("start_focus_session", { p_id: id, p_dungeon: d.dungeonId, p_attribute: d.attribute, p_intent: d.intent }),
    );
    if (!r.ok) throw new Error(r.reason === "already_running" ? "Es läuft bereits ein Dungeon." : "Dungeon konnte nicht gestartet werden.");
    this.emit();
    return { id, dungeonId: d.dungeonId, attribute: d.attribute, intent: d.intent, minutes: r.minutes!, startedAt: r.started_at!, finishedAt: null, status: "laufend" };
  }

  async finishFocus(id: string): Promise<FocusFinishResult> {
    const r = unwrap<{ applied: boolean; reason?: string; xp?: number; coins?: number }>(
      await this.sb.rpc("finish_focus_session", { p_id: id, p_event_id: crypto.randomUUID() }),
    );
    this.emit();
    return r.applied ? { applied: true, xp: r.xp ?? 0, coins: r.coins ?? 0 } : { applied: false, reason: (r.reason ?? "not_found") as "not_found" };
  }

  async abandonFocus(id: string) {
    unwrap(await this.sb.rpc("abandon_focus_session", { p_id: id }));
    this.emit();
  }

  async exportData() {
    const tables = ["characters", "user_settings", "goals", "quests", "quest_instances", "game_events", "court_cases", "court_messages", "ai_messages", "shop_items", "shop_purchases", "skills_unlocked", "workouts", "finance_entries", "focus_sessions"];
    const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), version: 1 };
    for (const t of tables) out[t] = unwrap(await this.sb.from(t).select("*"));
    return out;
  }

  async deleteAllData() {
    unwrap(await this.sb.rpc("delete_my_account"));
    await this.sb.auth.signOut();
  }
}
