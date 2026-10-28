import {
  QuestDraftSchema,
  applyVerdictEvent,
  completeInstance,
  consequenceDeltas,
  localToday,
  parseQuickAdd,
  purchaseItem,
  unlockSkill,
  uncompleteInstance,
  settleDays,
  RULEBOOK_VERSION,
  EXCUSE_LABELS,
  type VerdictProposal,
  ShopItemDraftSchema,
  GoalDraftSchema,
  FinanceEntrySchema,
  WorkoutSchema,
  FocusStartSchema,
  DUNGEON_BY_ID,
  FOCUS_TOLERANCE_SECONDS,
  completeFocus,
  focusRemaining,
  type FocusSession,
  type FocusStartInput,
  type FocusFinishResult,
  type Goal,
  type GoalDraftInput,
  type FinanceEntry,
  type FinanceEntryInput,
  type Workout,
  type WorkoutInput,
  type Character,
  type Quest,
  type ShopItem,
  type ShopItemDraftInput,
  type ShopPurchase,
} from "@life-os/core";
import { AiUnavailableError, aiChat, aiCouncil, aiJudge, aiQuickAdd, fallbackVerdict, type AiMessage, type JudgeOutcome, type RoleId } from "@life-os/ai";
import { gameContext, judgeInput, pleaMessage } from "./ai-support.ts";
import {
  FeatureUnavailableError,
  type AiRuntime,
  type CourtCase,
  type CourtMessage,
  type DataStore,
  type Snapshot,
  type SyncState,
} from "./types.ts";

export const AI_OFF_MESSAGE = "Die KI ist aus. Unter Einstellungen → KI lässt sich Ollama (kostenlos, lokal) einrichten.";
export const DAY_CLOSED_MESSAGE ="Dieser Tag ist bereits abgeschlossen – Rücknahme nicht mehr möglich.";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = "life-os/local/v1";

function emptySnapshot(): Snapshot {
  const character: Character = {
    userId: "local",
    name: "Held",
    title: "Neuling",
    className: "Abenteurer",
    avatar: "",
    totalXp: 0,
    coins: 0,
    attributeXp: {} as Character["attributeXp"],
  };
  return { character, quests: [], instances: [], events: [], cases: [], courtMessages: [], shopItems: [], purchases: [], skills: [], goals: [], workouts: [], financeEntries: [], focusSessions: [] };
}

/**
 * Vollständig lokaler Spielstand (Gerät-lokal, ohne Konto).
 * Nutzt dieselbe Engine wie der Server; KI-Funktionen sind hier nicht verfügbar.
 */
export class LocalStore implements DataStore {
  readonly mode = "local" as const;
  private listeners = new Set<() => void>();
  private snap: Snapshot;

  constructor(
    private storage: KeyValueStorage,
    private uuid: () => string = () => crypto.randomUUID(),
    private now: () => Date = () => new Date(),
  ) {
    const raw = storage.getItem(KEY);
    this.snap = raw ? { ...emptySnapshot(), ...(JSON.parse(raw) as Snapshot) } : emptySnapshot();
  }

  private commit(next: Snapshot) {
    this.snap = next;
    this.storage.setItem(KEY, JSON.stringify(next));
    this.listeners.forEach((l) => l());
  }

  async load() {
    return this.snap;
  }

  subscribe(onChange: () => void) {
    this.listeners.add(onChange);
    return () => void this.listeners.delete(onChange);
  }

  onSyncState(cb: (s: SyncState, pending: number) => void) {
    cb("lokal", 0);
    return () => {};
  }

  async createQuest(input: Parameters<DataStore["createQuest"]>[0]) {
    const draft = QuestDraftSchema.parse(input);
    const ts = this.now().toISOString();
    const quest: Quest = { ...draft, id: this.uuid(), status: "aktiv", progress: 0, createdAt: ts, updatedAt: ts };
    this.commit({ ...this.snap, quests: [...this.snap.quests, quest] });
    return quest;
  }

  async updateQuest(id: string, patch: Parameters<DataStore["updateQuest"]>[1]) {
    const q = this.snap.quests.find((x) => x.id === id);
    if (!q) throw new Error("Quest nicht gefunden");
    const { status, progress, ...draftPatch } = patch;
    const merged = QuestDraftSchema.parse({ ...q, ...draftPatch });
    const next: Quest = {
      ...q,
      ...merged,
      status: status ?? q.status,
      progress: progress ?? q.progress,
      updatedAt: this.now().toISOString(),
    };
    this.commit({ ...this.snap, quests: this.snap.quests.map((x) => (x.id === id ? next : x)) });
  }

  async completeOccurrence(input: { questId: string; occurrenceKey: string; dueAt: string | null }) {
    const { state, result } = completeInstance(this.snap, {
      ...input,
      eventId: this.uuid(),
      instanceId: this.uuid(),
      now: this.now().toISOString(),
    });
    if (result.applied) this.commit({ ...this.snap, ...state });
    return result;
  }

  async uncomplete(instanceId: string) {
    const r = uncompleteInstance(this.snap, { instanceId, now: this.now().toISOString() });
    if (r.reason === "day_closed") throw new Error(DAY_CLOSED_MESSAGE);
    if (r.applied) this.commit({ ...this.snap, ...r.state });
    return r.applied;
  }

  async settleDays() {
    const { state, settlements } = settleDays(this.snap, localToday(this.now()), this.now().toISOString());
    if (settlements.length) this.commit({ ...this.snap, ...state });
    return settlements;
  }

  async updateCharacter(patch: { name?: string; className?: string; avatar?: string; title?: string }) {
    this.commit({ ...this.snap, character: { ...this.snap.character, ...patch } });
  }

  async openCase(input: { questId: string; occurrenceKey: string; charge: string; questXp: number; questCoins: number }) {
    const existing = this.snap.cases.find(
      (c) => c.questId === input.questId && c.occurrenceKey === input.occurrenceKey && c.status !== "aufgehoben",
    );
    if (existing) return existing;
    const c: CourtCase = {
      id: this.uuid(),
      questId: input.questId,
      occurrenceKey: input.occurrenceKey,
      charge: input.charge,
      status: "offen",
      plea: null,
      excuse: null,
      verdict: null,
      reasoning: null,
      protectedReason: null,
      consequences: [],
      rulebookVersion: null,
      questXp: input.questXp,
      questCoins: input.questCoins,
      appealCount: 0,
      createdAt: this.now().toISOString(),
      decidedAt: null,
    };
    const msg = this.message(c.id, "system", `Verfahren eröffnet: ${input.charge}`);
    this.commit({ ...this.snap, cases: [c, ...this.snap.cases], courtMessages: [...this.snap.courtMessages, msg] });
    return c;
  }

  private message(caseId: string, role: CourtMessage["role"], content: string): CourtMessage {
    return { id: this.uuid(), caseId, role, content, createdAt: this.now().toISOString() };
  }

  private caseById(caseId: string): CourtCase {
    const c = this.snap.cases.find((x) => x.id === caseId);
    if (!c) throw new Error("Verfahren nicht gefunden");
    return c;
  }

  private patchCase(caseId: string, patch: Partial<CourtCase>, msgs: CourtMessage[] = []) {
    this.commit({
      ...this.snap,
      cases: this.snap.cases.map((x) => (x.id === caseId ? { ...x, ...patch } : x)),
      courtMessages: [...this.snap.courtMessages, ...msgs],
    });
  }

  /** Urteil buchen (Konsequenzen, Wiedergutmachung, Schutzgrund). Bei Berufung nur zugunsten des Angeklagten. */
  private finish(caseId: string, verdict: VerdictProposal, msgs: CourtMessage[], note: string) {
    const c = this.caseById(caseId);
    const isAppeal = c.status === "berufung";
    let state = { ...this.snap, courtMessages: [...this.snap.courtMessages, ...msgs] };

    if (isAppeal && c.consequences.length) {
      const oldD = consequenceDeltas(c.consequences);
      const newD = consequenceDeltas(verdict.consequences);
      if (newD.coins < oldD.coins || newD.xp < oldD.xp) {
        this.commit({
          ...state,
          cases: state.cases.map((x) => (x.id === caseId ? { ...x, status: "urteil" } : x)),
          courtMessages: [...state.courtMessages, this.message(caseId, "richter", "Die Berufung wird zurückgewiesen. Das ursprüngliche Urteil bleibt bestehen.")],
        });
        return;
      }
      state = { ...state, ...applyVerdictEvent(state, { eventId: this.uuid(), caseId, consequences: c.consequences, now: this.now().toISOString(), revert: true }).state };
    }

    state = { ...state, ...applyVerdictEvent(state, { eventId: this.uuid(), caseId, consequences: verdict.consequences, now: this.now().toISOString() }).state };

    // Wiedergutmachungsquest anlegen
    const quests = [...state.quests];
    for (const k of verdict.consequences) {
      if (k.type !== "wiedergutmachung") continue;
      const ts = this.now().toISOString();
      const draft = QuestDraftSchema.parse({
        title: k.questTitle,
        type: "side",
        category: "gericht",
        difficulty: "leicht",
        estimatedMinutes: k.estimatedMinutes,
        description: "Vom Court of Life verhängte Wiedergutmachung.",
      });
      quests.push({ ...draft, id: this.uuid(), status: "aktiv", progress: 0, createdAt: ts, updatedAt: ts });
    }
    // Geschützter Grund: Instanz als entschuldigt markieren (zählt für Streaks).
    let instances = state.instances;
    if (verdict.protectedReason && c.questId && c.occurrenceKey) {
      const found = instances.find((i) => i.questId === c.questId && i.occurrenceKey === c.occurrenceKey);
      instances = found
        ? instances.map((i) => (i === found && i.status !== "erledigt" ? { ...i, status: "entschuldigt" as const } : i))
        : [...instances, { id: this.uuid(), questId: c.questId, occurrenceKey: c.occurrenceKey, dueAt: null, status: "entschuldigt" as const, completedAt: null, eventId: null }];
    }

    // Die Begründung steht im Urteil selbst; im Verlauf nur ein kurzer Vermerk.
    this.commit({
      ...state,
      quests,
      instances,
      cases: state.cases.map((x) =>
        x.id === caseId
          ? {
              ...x,
              status: "urteil",
              verdict: verdict.verdict,
              reasoning: verdict.reasoning,
              protectedReason: verdict.protectedReason,
              consequences: verdict.consequences,
              rulebookVersion: RULEBOOK_VERSION,
              decidedAt: this.now().toISOString(),
            }
          : x,
      ),
      courtMessages: [...state.courtMessages, this.message(caseId, "system", note)],
    });
  }

  /** Regelrichter: entscheidet sofort und immer regelkonform. */
  async ruleJudge(caseId: string) {
    const c = this.caseById(caseId);
    if (c.status !== "verhandlung" && c.status !== "berufung") throw new Error("Keine laufende Verhandlung.");
    this.finish(caseId, fallbackVerdict(judgeInput(this.snap, c)), [], `${c.status === "berufung" ? "Berufungsurteil" : "Urteil"} verkündet – Regelrichter (ohne KI).`);
  }

  /** Ein Verhandlungsschritt des KI-Richters: Rückfrage oder Urteil. KI offline → Verfahren bleibt offen. */
  private async hearing(caseId: string) {
    if (!this.ai) return this.ruleJudge(caseId);
    const label = this.ai.provider.label;
    const c = this.caseById(caseId);
    let outcome: JudgeOutcome;
    try {
      outcome = await aiJudge(this.ai.provider, judgeInput(this.snap, c));
    } catch (e) {
      if (!(e instanceof AiUnavailableError)) throw e;
      this.patchCase(caseId, {}, [this.message(caseId, "system", `${e.message} Das Verfahren bleibt offen – später fortsetzen oder den Regelrichter entscheiden lassen.`)]);
      return;
    }
    if (outcome.kind === "frage") {
      this.patchCase(caseId, {}, [this.message(caseId, "richter", outcome.question)]);
      return;
    }
    const msgs: CourtMessage[] = [];
    if (outcome.prosecution) msgs.push(this.message(caseId, "staatsanwalt", outcome.prosecution));
    if (outcome.defense) msgs.push(this.message(caseId, "verteidiger", outcome.defense));
    const who = outcome.viaFallback ? "Regelrichter (KI-Vorschlag verletzte die Regelbasis)" : `KI-Richter (${label})`;
    this.finish(caseId, outcome.verdict, msgs, `${c.status === "berufung" ? "Berufungsurteil" : "Urteil"} verkündet – ${who}.`);
  }

  async plead(caseId: string, input: Parameters<DataStore["plead"]>[1]) {
    const c = this.caseById(caseId);
    if (c.status !== "offen" || c.plea) throw new Error("Plädoyer bereits abgegeben.");
    this.patchCase(caseId, { plea: input.plea, excuse: input.excuse, status: "verhandlung" }, [this.message(caseId, "angeklagter", pleaMessage(input.plea, input.excuse, input.statement))]);
    await this.hearing(caseId);
  }

  async sendCourtMessage(caseId: string, content: string): Promise<void> {
    this.requireAi();
    const c = this.caseById(caseId);
    if (c.status !== "verhandlung" && c.status !== "berufung") throw new Error("Keine laufende Verhandlung.");
    if (content.trim()) this.patchCase(caseId, {}, [this.message(caseId, "angeklagter", content.trim())]);
    await this.hearing(caseId);
  }

  async appeal(caseId: string, input: { excuse: Parameters<DataStore["plead"]>[1]["excuse"]; statement: string }) {
    const c = this.caseById(caseId);
    if (c.status !== "urteil") throw new Error("Nur gefällte Urteile können angefochten werden.");
    if (c.appealCount >= 1) throw new Error("Pro Verfahren ist eine Berufung möglich.");
    this.patchCase(caseId, { status: "berufung", appealCount: c.appealCount + 1, excuse: input.excuse }, [
      this.message(caseId, "angeklagter", `Berufung. Grund: ${EXCUSE_LABELS[input.excuse]}.${input.statement.trim() ? `\n${input.statement.trim()}` : ""}`),
      this.message(caseId, "system", "Berufungsverfahren eröffnet. Das Gericht prüft das Urteil erneut."),
    ]);
    await this.hearing(caseId);
  }

  // ───────────── Geräte-KI (kostenlos: Ollama / Gemini Free Tier) ─────────────

  private ai: AiRuntime | null = null;
  private chatHistory: AiMessage[] = [];

  setAi(ai: AiRuntime | null) {
    this.ai = ai;
  }

  private requireAi(): AiRuntime {
    if (!this.ai) throw new FeatureUnavailableError(AI_OFF_MESSAGE);
    return this.ai;
  }

  async chat(message: string, role: RoleId = "spielleiter") {
    const ai = this.requireAi();
    const today = localToday(this.now());
    try {
      const r = await aiChat(ai.provider, { role, message, history: this.chatHistory, today, context: ai.shareGameData ? gameContext(this.snap, today) : null }, this.uuid);
      this.chatHistory = [...this.chatHistory, { role: "user" as const, content: message }, { role: "assistant" as const, content: r.reply }].slice(-16);
      return r;
    } catch (e) {
      if (e instanceof AiUnavailableError) throw new FeatureUnavailableError(e.message);
      throw e;
    }
  }

  async council(question: string, roles: RoleId[]) {
    const ai = this.requireAi();
    const today = localToday(this.now());
    try {
      return await aiCouncil(ai.provider, { question, roles, today, context: ai.shareGameData ? gameContext(this.snap, today) : null }, this.uuid);
    } catch (e) {
      if (e instanceof AiUnavailableError) throw new FeatureUnavailableError(e.message);
      throw e;
    }
  }

  async quickAdd(text: string) {
    const today = localToday(this.now());
    if (!this.ai) return { ...parseQuickAdd(text, today), source: "offline" as const };
    try {
      return { ...(await aiQuickAdd(this.ai.provider, text, today, this.uuid)), source: "ki" as const };
    } catch (e) {
      const offline = parseQuickAdd(text, today);
      return { ...offline, notes: [`KI nicht verfügbar (${e instanceof Error ? e.message : String(e)}) – Offline-Erkennung verwendet.`, ...offline.notes], source: "offline" as const };
    }
  }

  async createShopItem(input: ShopItemDraftInput) {
    const item: ShopItem = { ...ShopItemDraftSchema.parse(input), id: this.uuid(), createdAt: this.now().toISOString() };
    this.commit({ ...this.snap, shopItems: [...this.snap.shopItems, item] });
    return item;
  }

  async updateShopItem(id: string, patch: Partial<ShopItemDraftInput>) {
    const cur = this.snap.shopItems.find((i) => i.id === id);
    if (!cur) throw new Error("Belohnung nicht gefunden");
    const next: ShopItem = { ...cur, ...ShopItemDraftSchema.parse({ ...cur, ...patch }) };
    this.commit({ ...this.snap, shopItems: this.snap.shopItems.map((i) => (i.id === id ? next : i)) });
  }

  async purchase(itemId: string) {
    const item = this.snap.shopItems.find((i) => i.id === itemId);
    const eventId = this.uuid();
    const now = this.now().toISOString();
    const { state, result } = purchaseItem(this.snap, { eventId, item, now });
    if (result.applied && item) {
      const p: ShopPurchase = { id: this.uuid(), itemId: item.id, title: item.title, cost: item.cost, eventId, purchasedAt: now };
      this.commit({ ...this.snap, ...state, purchases: [p, ...this.snap.purchases] });
    }
    return result;
  }

  async unlockSkill(skillId: string) {
    const { state, result } = unlockSkill(this.snap, skillId);
    if (result.ok) this.commit({ ...this.snap, skills: state.skills ?? [] });
    return result;
  }

  async createGoal(input: GoalDraftInput) {
    const goal: Goal = { ...GoalDraftSchema.parse(input), id: this.uuid(), createdAt: this.now().toISOString() };
    this.commit({ ...this.snap, goals: [...this.snap.goals, goal] });
    return goal;
  }

  async updateGoal(id: string, patch: Partial<GoalDraftInput>) {
    const cur = this.snap.goals.find((g) => g.id === id);
    if (!cur) throw new Error("Ziel nicht gefunden");
    const next: Goal = { ...cur, ...GoalDraftSchema.parse({ ...cur, ...patch }) };
    this.commit({ ...this.snap, goals: this.snap.goals.map((g) => (g.id === id ? next : g)) });
  }

  async addFinanceEntry(input: FinanceEntryInput) {
    const entry: FinanceEntry = { ...FinanceEntrySchema.parse(input), id: this.uuid(), createdAt: this.now().toISOString() };
    if (entry.goalId && !this.snap.goals.some((g) => g.id === entry.goalId)) throw new Error("Sparziel nicht gefunden");
    this.commit({
      ...this.snap,
      financeEntries: [entry, ...this.snap.financeEntries],
      goals: this.adjustGoal(entry, 1),
    });
    return entry;
  }

  async deleteFinanceEntry(id: string) {
    const entry = this.snap.financeEntries.find((e) => e.id === id);
    if (!entry) return;
    this.commit({ ...this.snap, financeEntries: this.snap.financeEntries.filter((e) => e.id !== id), goals: this.adjustGoal(entry, -1) });
  }

  /** Spiegel des Triggers sync_goal_from_finance(). */
  private adjustGoal(entry: FinanceEntry, sign: 1 | -1): Goal[] {
    if (entry.kind !== "einzahlung" || !entry.goalId) return this.snap.goals;
    return this.snap.goals.map((g) =>
      g.id === entry.goalId ? { ...g, currentValue: Math.max(0, Math.round((g.currentValue + sign * entry.amount) * 100) / 100) } : g,
    );
  }

  async logWorkout(input: WorkoutInput) {
    const w: Workout = { ...WorkoutSchema.parse(input), id: this.uuid(), createdAt: this.now().toISOString() };
    this.commit({ ...this.snap, workouts: [w, ...this.snap.workouts] });
    return w;
  }

  async deleteWorkout(id: string) {
    this.commit({ ...this.snap, workouts: this.snap.workouts.filter((w) => w.id !== id) });
  }

  async startFocus(input: FocusStartInput) {
    const d = FocusStartSchema.parse(input);
    if (this.snap.focusSessions.some((f) => f.status === "laufend")) throw new Error("Es läuft bereits ein Dungeon.");
    const spec = DUNGEON_BY_ID.get(d.dungeonId)!;
    const s: FocusSession = { id: this.uuid(), dungeonId: d.dungeonId, attribute: d.attribute, intent: d.intent, minutes: spec.minutes, startedAt: this.now().toISOString(), finishedAt: null, status: "laufend" };
    this.commit({ ...this.snap, focusSessions: [s, ...this.snap.focusSessions].slice(0, 50) });
    return s;
  }

  async finishFocus(id: string): Promise<FocusFinishResult> {
    const s = this.snap.focusSessions.find((f) => f.id === id);
    if (!s) return { applied: false, reason: "not_found" };
    if (s.status !== "laufend") return { applied: false, reason: "not_running" };
    if (focusRemaining(s, this.now().getTime()) > FOCUS_TOLERANCE_SECONDS) return { applied: false, reason: "too_early" };
    const spec = DUNGEON_BY_ID.get(s.dungeonId)!;
    const now = this.now().toISOString();
    const { state } = completeFocus(this.snap, { eventId: this.uuid(), xp: spec.xp, coins: spec.coins, attribute: s.attribute, title: spec.title, now });
    this.commit({ ...this.snap, ...state, focusSessions: this.snap.focusSessions.map((f) => (f.id === id ? { ...f, status: "geschafft" as const, finishedAt: now } : f)) });
    return { applied: true, xp: spec.xp, coins: spec.coins };
  }

  async abandonFocus(id: string) {
    const now = this.now().toISOString();
    this.commit({ ...this.snap, focusSessions: this.snap.focusSessions.map((f) => (f.id === id && f.status === "laufend" ? { ...f, status: "abgebrochen" as const, finishedAt: now } : f)) });
  }

  async exportData() {
    return { exportedAt: this.now().toISOString(), version: 1, ...this.snap };
  }

  async deleteAllData() {
    this.storage.removeItem(KEY);
    this.commit(emptySnapshot());
  }
}
