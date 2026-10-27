import type {
  CompletionResult,
  Consequence,
  Excuse,
  GameState,
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
  uncomplete(instanceId: string): Promise<boolean>;
  updateCharacter(patch: { name?: string; className?: string; avatar?: string }): Promise<void>;

  openCase(input: { questId: string; occurrenceKey: string; charge: string; questXp: number; questCoins: number }): Promise<CourtCase>;
  /** Plädoyer + Aussage. Lokal entscheidet der Regelrichter sofort, in der Cloud verhandelt die KI. */
  plead(caseId: string, input: { plea: Plea; excuse: Excuse; statement: string }): Promise<void>;
  /** Weitere Aussage in der laufenden Verhandlung (nur KI). */
  sendCourtMessage(caseId: string, content: string): Promise<void>;
  appeal(caseId: string, input: { excuse: Excuse; statement: string }): Promise<void>;

  chat(message: string): Promise<ChatReply>;
  quickAdd(text: string): Promise<QuickAddDraft>;

  createShopItem(input: ShopItemDraftInput): Promise<ShopItem>;
  updateShopItem(id: string, patch: Partial<ShopItemDraftInput>): Promise<void>;
  /** Kauft eine Belohnung. Coins werden serverseitig geprüft und abgezogen. */
  purchase(itemId: string): Promise<PurchaseResult>;
  unlockSkill(skillId: string): Promise<UnlockCheck>;

  exportData(): Promise<unknown>;
  deleteAllData(): Promise<void>;
}
