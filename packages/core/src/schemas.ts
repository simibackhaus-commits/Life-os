import { z } from "zod";

/** Die zehn Charakterattribute. Reihenfolge = Anzeige-Reihenfolge. */
export const ATTRIBUTES = [
  "disziplin",
  "staerke",
  "ausdauer",
  "intelligenz",
  "karriere",
  "finanzen",
  "gesundheit",
  "soziales",
  "ordnung",
  "willenskraft",
] as const;
export const AttributeSchema = z.enum(ATTRIBUTES);
export type Attribute = z.infer<typeof AttributeSchema>;

export const ATTRIBUTE_LABELS: Record<Attribute, string> = {
  disziplin: "Disziplin",
  staerke: "Stärke",
  ausdauer: "Ausdauer",
  intelligenz: "Intelligenz",
  karriere: "Karriere",
  finanzen: "Finanzen",
  gesundheit: "Gesundheit",
  soziales: "Soziales",
  ordnung: "Ordnung",
  willenskraft: "Willenskraft",
};

export const QUEST_TYPES = ["daily", "weekly", "main", "side", "epic", "legendary", "hidden", "boss"] as const;
export const QuestTypeSchema = z.enum(QUEST_TYPES);
export type QuestType = z.infer<typeof QuestTypeSchema>;

export const QUEST_TYPE_LABELS: Record<QuestType, string> = {
  daily: "Daily Quest",
  weekly: "Weekly Quest",
  main: "Hauptquest",
  side: "Nebenquest",
  epic: "Epische Quest",
  legendary: "Legendäre Quest",
  hidden: "Versteckte Quest",
  boss: "Bosskampf",
};

export const DIFFICULTIES = ["trivial", "leicht", "mittel", "schwer", "episch"] as const;
export const DifficultySchema = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const QuestStatusSchema = z.enum(["aktiv", "pausiert", "erledigt", "archiviert"]);
export type QuestStatus = z.infer<typeof QuestStatusSchema>;

export const InstanceStatusSchema = z.enum(["offen", "erledigt", "verpasst", "entschuldigt"]);
export type InstanceStatus = z.infer<typeof InstanceStatusSchema>;

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Uhrzeit im Format HH:MM");
const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT");

/**
 * Wiederholungsregel. `times` erzeugt pro Tag mehrere getrennte Instanzen
 * (z. B. Zähneputzen 07:00 und 21:00 = zwei Abschlüsse).
 * `byWeekday`: 1 = Montag … 7 = Sonntag (ISO).
 */
export const RecurrenceRuleSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().min(1).max(365).default(1),
  byWeekday: z.array(z.number().int().min(1).max(7)).optional(),
  byMonthDay: z.array(z.number().int().min(1).max(31)).optional(),
  times: z.array(HHMM).optional(),
  startDate: ISODate,
  endDate: ISODate.optional(),
});
export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;

export const SubtaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  done: z.boolean().default(false),
});
export type Subtask = z.infer<typeof SubtaskSchema>;

/** Eingabe beim Anlegen/Bearbeiten einer Quest (ohne serverseitig vergebene Felder). */
export const QuestDraftSchema = z.object({
  title: z.string().trim().min(1, "Titel fehlt").max(160),
  description: z.string().max(4000).default(""),
  type: QuestTypeSchema.default("side"),
  category: z.string().max(60).default("allgemein"),
  difficulty: DifficultySchema.default("mittel"),
  priority: z.number().int().min(1).max(5).default(3),
  attributes: z.array(AttributeSchema).max(4).default([]),
  dueAt: z.string().datetime({ offset: true }).nullable().default(null),
  recurrence: RecurrenceRuleSchema.nullable().default(null),
  estimatedMinutes: z.number().int().min(0).max(24 * 60).nullable().default(null),
  subtasks: z.array(SubtaskSchema).default([]),
  goalId: z.string().uuid().nullable().default(null),
  /** Questkette: Diese Quest wird erst freigeschaltet, wenn die Voraussetzung erledigt ist. */
  requiresQuestId: z.string().uuid().nullable().default(null),
  proofRequired: z.boolean().default(false),
  /** Verpflichtende Quests können bei Versäumnis vor Gericht kommen. */
  mandatory: z.boolean().default(false),
  consequences: z.string().max(500).default(""),
});
export type QuestDraft = z.infer<typeof QuestDraftSchema>;
export type QuestDraftInput = z.input<typeof QuestDraftSchema>;

export const QuestSchema = QuestDraftSchema.extend({
  id: z.string().uuid(),
  status: QuestStatusSchema,
  /** Fortschritt 0–100 für nicht wiederkehrende Quests mit Teilaufgaben. */
  progress: z.number().min(0).max(100),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Quest = z.infer<typeof QuestSchema>;

export const QuestInstanceSchema = z.object({
  id: z.string().uuid(),
  questId: z.string().uuid(),
  /** Eindeutiger Schlüssel je Vorkommen, z. B. "2026-10-27T07:00" oder "once". */
  occurrenceKey: z.string().min(1).max(40),
  dueAt: z.string().nullable(),
  status: InstanceStatusSchema,
  completedAt: z.string().nullable(),
  eventId: z.string().uuid().nullable(),
});
export type QuestInstance = z.infer<typeof QuestInstanceSchema>;

export const CharacterSchema = z.object({
  userId: z.string(),
  name: z.string().min(1).max(60),
  title: z.string().max(60),
  className: z.string().max(40),
  avatar: z.string().max(200),
  totalXp: z.number().int().min(0),
  coins: z.number().int(),
  attributeXp: z.record(AttributeSchema, z.number().int().min(0)),
});
export type Character = z.infer<typeof CharacterSchema>;

export const GameEventKindSchema = z.enum([
  "quest_completed",
  "quest_uncompleted",
  "court_verdict",
  "court_verdict_reverted",
  "shop_purchase",
  "manual_adjustment",
]);
export type GameEventKind = z.infer<typeof GameEventKindSchema>;

/** Unveränderlicher Ledger-Eintrag. Die id kommt vom Client und macht Wiederholungen idempotent. */
export const GameEventSchema = z.object({
  id: z.string().uuid(),
  kind: GameEventKindSchema,
  xpDelta: z.number().int(),
  coinDelta: z.number().int(),
  attributeXp: z.record(AttributeSchema, z.number().int()).default({}),
  refId: z.string().nullable(),
  note: z.string().max(300).default(""),
  createdAt: z.string(),
});
export type GameEvent = z.infer<typeof GameEventSchema>;
