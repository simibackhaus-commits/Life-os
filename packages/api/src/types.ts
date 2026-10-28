import type { AiProvider, RoleId } from "@life-os/ai";
import type {
  CompletionResult,
  Consequence,
  Excuse,
  GameState,
  DaySettlement,
  FocusSession,
  FocusStartInput,
  FocusFinishResult,
  Goal,
  GoalDraftInput,
  FinanceEntry,
  FinanceEntryInput,
  Workout,
  WorkoutInput,
  LifetimeStats,
  UnlockCheck,
  Plea,
  ProtectedReason,
  PurchaseResult,
  Quest,
  QuestDraftInput,
  ShopItem,
  ShopItemDraftInput,
  ShopPurchase,
  Verdict,
} from "@life-os/core";

export type CaseStatus = "offen" | "verhandlung" | "urteil" | "berufung" | "aufgehoben";

export interface CourtCase {
  id: string;
  questId: string | null;
  occurrenceKey: string | null;
  charge: string;
  status: CaseStatus;
  plea: Plea | null;
  /** Geltend gemachter Grund (für Schutzgründe und den Regelrichter). */
  excuse: Excuse | null;
  verdict: Verdict | null;
  reasoning: string | null;
  protectedReason: ProtectedReason | null;
  consequences: Consequence[];
  rulebookVersion: string | null;
  questXp: number;
  questCoins: number;
  appealCount: number;
  createdAt: string;
  decidedAt: string | null;
}

export type CourtRole = "angeklagter" | "richter" | "staatsanwalt" | "verteidiger" | "system";

export interface CourtMessage {
  id: string;
  caseId: string;
  role: CourtRole;
  content: string;
  createdAt: string;
}

export interface Snapshot extends GameState {
  cases: CourtCase[];
  courtMessages: CourtMessage[];
  shopItems: ShopItem[];
  purchases: ShopPurchase[];
  skills: string[];
  goals: Goal[];
  workouts: Workout[];
  financeEntries: FinanceEntry[];
  /** Letzte Fokus-Sitzungen (neueste zuerst). */
  focusSessions: FocusSession[];
  /** Gesamtzähler vom Server (nur Cloud). */
  lifetime?: LifetimeStats;
}

export type QuestPatch = Partial<QuestDraftInput> & {
  status?: "aktiv" | "pausiert" | "archiviert";
  progress?: number;
};

export type CompletionOutcome = CompletionResult & { queued?: boolean };

export interface ChatReply {
  reply: string;
  /** Vom Spielleiter vorgeschlagene Quests – werden erst nach Bestätigung gespeichert. */
  proposals: QuestDraftInput[];
}

export interface QuickAddDraft {
  draft: QuestDraftInput;
  notes: string[];
  source: "ki" | "offline";
}

export type SyncState = "lokal" | "synchron" | "synchronisiere" | "offline" | "fehler";

export interface AiRuntime {
  provider: AiProvider;
  /** Spieldaten als Kontext freigegeben (bei externen Anbietern zusätzlich Gemini-Zustimmung). */
  shareGameData: boolean;
}

export class FeatureUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeatureUnavailableError";
  }
}

export interface DataStore {
  readonly mode: "local" | "cloud";
  load(): Promise<Snapshot>;
  /** Benachrichtigt bei Änderungen (lokal oder per Realtime von einem anderen Gerät). */
  subscribe(onChange: () => void): () => void;
  onSyncState(cb: (s: SyncState, pending: number) => void): () => void;

  createQuest(draft: QuestDraftInput): Promise<Quest>;
  updateQuest(id: string, patch: QuestPatch): Promise<void>;
  completeOccurrence(input: { questId: string; occurrenceKey: string; dueAt: string | null }): Promise<CompletionOutcome>;
  /** Nimmt einen Abschluss zurück – nur bis zum Tagesabschluss möglich. */
  uncomplete(instanceId: string): Promise<boolean>;
  /** Bucht vorgemerkte Belohnungen vergangener Spieltage (Tagesabschluss). */
  settleDays(): Promise<DaySettlement[]>;
  updateCharacter(patch: { name?: string; className?: string; avatar?: string; title?: string }): Promise<void>;

  openCase(input: { questId: string; occurrenceKey: string; charge: string; questXp: number; questCoins: number }): Promise<CourtCase>;
  /**
   * Plädoyer + Aussage. Mit Geräte-KI verhandelt der KI-Richter (Rückfragen möglich),
   * ohne KI entscheidet sofort der Regelrichter.
   */
  plead(caseId: string, input: { plea: Plea; excuse: Excuse; statement: string }): Promise<void>;
  /** Weitere Aussage in der laufenden Verhandlung (nur mit KI). */
  sendCourtMessage(caseId: string, content: string): Promise<void>;
  appeal(caseId: string, input: { excuse: Excuse; statement: string }): Promise<void>;
  /** Laufende Verhandlung (z. B. KI offline) vom Regelrichter entscheiden lassen. */
  ruleJudge(caseId: string): Promise<void>;

  /** Geräte-KI setzen (Ollama/Gemini) – null = aus. Wird nie synchronisiert. */
  setAi(ai: AiRuntime | null): void;
  chat(message: string, role?: RoleId): Promise<ChatReply>;
  /** Ratssitzung: eine Frage, mehrere Rollen desselben Modells nacheinander. */
  council(question: string, roles: RoleId[]): Promise<Array<{ role: RoleId; reply: string }>>;
  quickAdd(text: string): Promise<QuickAddDraft>;

  createShopItem(input: ShopItemDraftInput): Promise<ShopItem>;
  updateShopItem(id: string, patch: Partial<ShopItemDraftInput>): Promise<void>;
  /** Kauft eine Belohnung. Coins werden serverseitig geprüft und abgezogen. */
  purchase(itemId: string): Promise<PurchaseResult>;
  unlockSkill(skillId: string): Promise<UnlockCheck>;

  createGoal(input: GoalDraftInput): Promise<Goal>;
  updateGoal(id: string, patch: Partial<GoalDraftInput>): Promise<void>;
  /** Einzahlungen mit goalId erhöhen den Stand des Sparziels. */
  addFinanceEntry(input: FinanceEntryInput): Promise<FinanceEntry>;
  deleteFinanceEntry(id: string): Promise<void>;
  logWorkout(input: WorkoutInput): Promise<Workout>;
  deleteWorkout(id: string): Promise<void>;

  /** Startet einen Fokus-Dungeon (Startzeit setzt der Server). */
  startFocus(input: FocusStartInput): Promise<FocusSession>;
  /** Beendet den Dungeon; Belohnung nur, wenn die Zeit laut Server abgelaufen ist. */
  finishFocus(id: string): Promise<FocusFinishResult>;
  abandonFocus(id: string): Promise<void>;

  exportData(): Promise<unknown>;
  deleteAllData(): Promise<void>;
}
