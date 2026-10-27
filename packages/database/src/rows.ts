import type { Character, GameEvent, Quest, QuestDraft, QuestInstance } from "@life-os/core";

/** Zeilentypen der Supabase-Tabellen (snake_case), passend zu supabase/migrations. */
export interface QuestRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  type: Quest["type"];
  category: string;
  difficulty: Quest["difficulty"];
  priority: number;
  attributes: Quest["attributes"];
  due_at: string | null;
  recurrence: Quest["recurrence"];
  estimated_minutes: number | null;
  subtasks: Quest["subtasks"];
  goal_id: string | null;
  requires_quest_id: string | null;
  proof_required: boolean;
  mandatory: boolean;
  consequences: string;
  status: Quest["status"];
  progress: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CharacterRow {
  user_id: string;
  name: string;
  title: string;
  class_name: string;
  avatar: string;
  total_xp: number;
  coins: number;
  attribute_xp: Character["attributeXp"];
}

export interface InstanceRow {
  id: string;
  quest_id: string;
  occurrence_key: string;
  due_at: string | null;
  status: QuestInstance["status"];
  completed_at: string | null;
  event_id: string | null;
}

export interface EventRow {
  id: string;
  kind: GameEvent["kind"];
  xp_delta: number;
  coin_delta: number;
  attribute_xp: GameEvent["attributeXp"];
  ref_id: string | null;
  note: string;
  created_at: string;
}

export const questFromRow = (r: QuestRow): Quest => ({
  id: r.id,
  title: r.title,
  description: r.description,
  type: r.type,
  category: r.category,
  difficulty: r.difficulty,
  priority: r.priority,
  attributes: r.attributes,
  dueAt: r.due_at,
  recurrence: r.recurrence,
  estimatedMinutes: r.estimated_minutes,
  subtasks: r.subtasks,
  goalId: r.goal_id,
  requiresQuestId: r.requires_quest_id ?? null,
  proofRequired: r.proof_required,
  mandatory: r.mandatory,
  consequences: r.consequences,
  status: r.status,
  progress: r.progress,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Nur clientseitig beschreibbare Felder (status 'erledigt' setzt ausschließlich der Server). */
export const questDraftToRow = (d: QuestDraft) => ({
  title: d.title,
  description: d.description,
  type: d.type,
  category: d.category,
  difficulty: d.difficulty,
  priority: d.priority,
  attributes: d.attributes,
  due_at: d.dueAt,
  recurrence: d.recurrence,
  estimated_minutes: d.estimatedMinutes,
  subtasks: d.subtasks,
  goal_id: d.goalId,
  requires_quest_id: d.requiresQuestId,
  proof_required: d.proofRequired,
  mandatory: d.mandatory,
  consequences: d.consequences,
});

export const characterFromRow = (r: CharacterRow): Character => ({
  userId: r.user_id,
  name: r.name,
  title: r.title,
  className: r.class_name,
  avatar: r.avatar,
  totalXp: Number(r.total_xp),
  coins: Number(r.coins),
  attributeXp: r.attribute_xp,
});

export const instanceFromRow = (r: InstanceRow): QuestInstance => ({
  id: r.id,
  questId: r.quest_id,
  occurrenceKey: r.occurrence_key,
  dueAt: r.due_at,
  status: r.status,
  completedAt: r.completed_at,
  eventId: r.event_id,
});

export const eventFromRow = (r: EventRow): GameEvent => ({
  id: r.id,
  kind: r.kind,
  xpDelta: r.xp_delta,
  coinDelta: r.coin_delta,
  attributeXp: r.attribute_xp,
  refId: r.ref_id,
  note: r.note,
  createdAt: r.created_at,
});
