import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  QuestDraftSchema,
  computeReward,
  levelFromXp,
  localToday,
  parseQuickAdd,
  type Quest,
} from "@life-os/core";
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
import type { KeyValueStorage } from "./local-store.ts";
import { Outbox, isNetworkError, type OutboxItem } from "./outbox.ts";
import type { ChatReply, CompletionOutcome, CourtCase, CourtMessage, DataStore, QuestPatch, Snapshot, SyncState } from "./types.ts";

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
    if (typeof window !== "undefined") window.addEventListener("online", () => void this.flush());
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
      const [ch, quests, inst, events, cases, msgs] = await Promise.all([
        this.sb.from("characters").select("*").eq("user_id", this.userId).single(),
        this.sb.from("quests").select("*").neq("status", "archiviert").order("created_at"),
        this.sb.from("quest_instances").select("*").or(`completed_at.gte.${since},completed_at.is.null`),
        this.sb.from("game_events").select("*").order("created_at", { ascending: false }).limit(200),
        this.sb.from("court_cases").select("*").order("created_at", { ascending: false }).limit(50),
        this.sb.from("court_messages").select("*").order("created_at").limit(500),
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
      const reward = quest ? computeReward(quest) : { xp: 0, coins: 0, attributeXp: {} };
      const lvl = levelFromXp(this.last?.character.totalXp ?? 0).level;
      return { applied: true, reward, levelBefore: lvl, levelAfter: levelFromXp((this.last?.character.totalXp ?? 0) + reward.xp).level, queued: true };
    }
    const r = res.data as { applied: boolean; reason?: string; xp?: number; coins?: number; attribute_xp?: Record<string, number>; level_before?: number; level_after?: number };
    this.emit();
    if (!r.applied) return { applied: false, reason: (r.reason ?? "already_completed") as "already_completed" };
    return {
      applied: true,
      reward: { xp: r.xp ?? 0, coins: r.coins ?? 0, attributeXp: (r.attribute_xp ?? {}) as never },
      levelBefore: r.level_before ?? 1,
      levelAfter: r.level_after ?? 1,
    };
  }

  async uncomplete(instanceId: string) {
    const r = unwrap<{ applied: boolean }>(
      await this.sb.rpc("uncomplete_quest_instance", { p_event_id: crypto.randomUUID(), p_instance_id: instanceId }),
    );
    this.emit();
    return r.applied;
  }

  async updateCharacter(patch: { name?: string; className?: string; avatar?: string }) {
    const row: Record<string, string> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.className !== undefined) row.class_name = patch.className;
    if (patch.avatar !== undefined) row.avatar = patch.avatar;
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
    if (res.error) throw new Error(`Gericht nicht erreichbar: ${res.error.message}`);
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
    if (res.error) throw new Error(`Spielleiter nicht erreichbar: ${res.error.message}`);
    return res.data as ChatReply;
  }

  async quickAdd(text: string) {
    const today = localToday();
    const res = await this.sb.functions.invoke("quick-add", { body: { text, today } });
    if (res.error || !res.data?.draft) return { ...parseQuickAdd(text, today), source: "offline" as const };
    return { draft: res.data.draft, notes: res.data.notes ?? [], source: "ki" as const };
  }

  async exportData() {
    const tables = ["characters", "user_settings", "goals", "quests", "quest_instances", "game_events", "court_cases", "court_messages", "ai_messages"];
    const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), version: 1 };
    for (const t of tables) out[t] = unwrap(await this.sb.from(t).select("*"));
    return out;
  }

  async deleteAllData() {
    unwrap(await this.sb.rpc("delete_my_account"));
    await this.sb.auth.signOut();
  }
}
