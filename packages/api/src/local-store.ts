import {
  QuestDraftSchema,
  applyVerdictEvent,
  completeInstance,
  consequenceDeltas,
  localToday,
  parseQuickAdd,
  purchaseItem,
  simpleJudge,
  uncompleteInstance,
  validateVerdict,
  RULEBOOK_VERSION,
  ShopItemDraftSchema,
  type Character,
  type Quest,
  type ShopItem,
  type ShopItemDraftInput,
  type ShopPurchase,
} from "@life-os/core";
import {
  FeatureUnavailableError,
  type CourtCase,
  type CourtMessage,
  type DataStore,
  type Snapshot,
  type SyncState,
} from "./types.ts";

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
  return { character, quests: [], instances: [], events: [], cases: [], courtMessages: [], shopItems: [], purchases: [] };
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
    const r = uncompleteInstance(this.snap, { eventId: this.uuid(), instanceId, now: this.now().toISOString() });
    if (r.applied) this.commit({ ...this.snap, ...r.state });
    return r.applied;
  }

  async updateCharacter(patch: { name?: string; className?: string; avatar?: string }) {
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

  private judge(caseId: string, plea: CourtCase["plea"] & string, excuse: Parameters<DataStore["plead"]>[1]["excuse"], statement: string, isAppeal: boolean) {
    const c = this.snap.cases.find((x) => x.id === caseId);
    if (!c) throw new Error("Verfahren nicht gefunden");
    const quest = this.snap.quests.find((q) => q.id === c.questId);
    const prior = this.snap.cases.filter(
      (x) => x.id !== caseId && x.status === "urteil" && x.verdict && !["freispruch", "einstellung"].includes(x.verdict),
    ).length;
    const proposal = simpleJudge({ plea, excuse, priorConvictions: prior, questTitle: quest?.title ?? c.charge });
    const v = validateVerdict(proposal, { questXp: c.questXp, questCoins: c.questCoins });
    if (!v.ok || !v.sanitized) throw new Error(`Urteil verletzt Regelbasis: ${v.errors.join("; ")}`);
    const verdict = v.sanitized;

    let state = this.snap;
    const msgs: CourtMessage[] = [];
    if (statement.trim()) msgs.push(this.message(caseId, "angeklagter", statement.trim()));

    if (isAppeal && c.consequences.length) {
      // Berufung nur zugunsten des Angeklagten: neues Urteil gilt, wenn es nicht härter ist.
      const oldD = consequenceDeltas(c.consequences);
      const newD = consequenceDeltas(verdict.consequences);
      if (newD.coins < oldD.coins || newD.xp < oldD.xp) {
        msgs.push(this.message(caseId, "richter", "Die Berufung wird zurückgewiesen. Das ursprüngliche Urteil bleibt bestehen."));
        this.commit({
          ...state,
          cases: state.cases.map((x) => (x.id === caseId ? { ...x, status: "urteil", appealCount: x.appealCount + 1 } : x)),
          courtMessages: [...state.courtMessages, ...msgs],
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
    msgs.push(this.message(caseId, "system", isAppeal ? "Berufungsurteil verkündet." : "Urteil verkündet."));
    this.commit({
      ...state,
      quests,
      instances,
      cases: state.cases.map((x) =>
        x.id === caseId
          ? {
              ...x,
              status: "urteil",
              plea,
              verdict: verdict.verdict,
              reasoning: verdict.reasoning,
              protectedReason: verdict.protectedReason,
              consequences: verdict.consequences,
              rulebookVersion: RULEBOOK_VERSION,
              decidedAt: this.now().toISOString(),
              appealCount: x.appealCount + (isAppeal ? 1 : 0),
            }
          : x,
      ),
      courtMessages: [...state.courtMessages, ...msgs],
    });
  }

  async plead(caseId: string, input: Parameters<DataStore["plead"]>[1]) {
    this.judge(caseId, input.plea, input.excuse, input.statement, false);
  }

  async sendCourtMessage(): Promise<void> {
    throw new FeatureUnavailableError("Die KI-Verhandlung braucht Supabase + Anthropic-Key. Lokal entscheidet der Regelrichter.");
  }

  async appeal(caseId: string, input: { excuse: Parameters<DataStore["plead"]>[1]["excuse"]; statement: string }) {
    const c = this.snap.cases.find((x) => x.id === caseId);
    if (!c || c.status !== "urteil") throw new Error("Nur gefällte Urteile können angefochten werden.");
    if (c.appealCount >= 1) throw new Error("Pro Verfahren ist eine Berufung möglich.");
    this.judge(caseId, "nicht_schuldig", input.excuse, input.statement, true);
  }

  async chat(): Promise<never> {
    throw new FeatureUnavailableError(
      "Der KI-Spielleiter ist im lokalen Modus nicht verfügbar. Verbinde Supabase und hinterlege den Anthropic-Key als Secret (siehe README).",
    );
  }

  async quickAdd(text: string) {
    return { ...parseQuickAdd(text, localToday(this.now())), source: "offline" as const };
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

  async exportData() {
    return { exportedAt: this.now().toISOString(), version: 1, ...this.snap };
  }

  async deleteAllData() {
    this.storage.removeItem(KEY);
    this.commit(emptySnapshot());
  }
}
