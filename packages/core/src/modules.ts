import { z } from "zod";
import { addDays } from "./dates.ts";
import type { Quest, QuestDraftInput } from "./schemas.ts";

/**
 * Lebensbereich-Module (Business, Sport, Finanzen).
 * Sie haben selbst keine Spielwirkung – XP/Coins entstehen nur über verknüpfte Quests (serverseitig validiert).
 */

const ISODate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT");

// ───────────── Ziele & Projekte (Tabelle goals) ─────────────

export const GOAL_AREAS = ["business", "sport", "finanzen", "allgemein"] as const;
export type GoalArea = (typeof GOAL_AREAS)[number];

export const GoalDraftSchema = z.object({
  title: z.string().trim().min(1, "Titel fehlt").max(160),
  description: z.string().max(2000).default(""),
  area: z.enum(GOAL_AREAS).default("allgemein"),
  /** Zielwert, z. B. 3000 (€) oder 42 (km). Bei Projekten leer – Fortschritt kommt aus den Quests. */
  targetValue: z.number().positive().nullable().default(null),
  currentValue: z.number().min(0).default(0),
  unit: z.string().max(20).nullable().default(null),
  dueDate: ISODate.nullable().default(null),
  status: z.enum(["aktiv", "pausiert", "erledigt", "archiviert"]).default("aktiv"),
});
export type GoalDraft = z.infer<typeof GoalDraftSchema>;
export type GoalDraftInput = z.input<typeof GoalDraftSchema>;
export interface Goal extends GoalDraft {
  id: string;
  createdAt: string;
}

export interface GoalProgress {
  /** 0–1 */
  ratio: number;
  label: string;
  /** Erreichte Meilensteine in Prozent (25/50/75/100). */
  milestones: number[];
  /** Benötigte Rate pro Woche bis zur Frist (nur bei Zielwert + Frist). */
  perWeekNeeded: number | null;
}

export const MILESTONES = [25, 50, 75, 100] as const;

/** Fortschritt eines Ziels: über Zielwert, sonst über verknüpfte Quests (Projekte). */
export function goalProgress(goal: Goal, linkedQuests: Pick<Quest, "status">[], today: string): GoalProgress {
  let ratio: number;
  let label: string;
  if (goal.targetValue) {
    ratio = Math.min(1, goal.currentValue / goal.targetValue);
    const u = goal.unit ? ` ${goal.unit}` : "";
    label = `${fmt(goal.currentValue)}${u} von ${fmt(goal.targetValue)}${u}`;
  } else {
    const relevant = linkedQuests.filter((q) => q.status !== "archiviert");
    const done = relevant.filter((q) => q.status === "erledigt").length;
    ratio = relevant.length ? done / relevant.length : 0;
    label = `${done} von ${relevant.length} Aufgaben`;
  }
  const pct = Math.floor(ratio * 100);
  let perWeekNeeded: number | null = null;
  if (goal.targetValue && goal.dueDate && goal.dueDate > today && ratio < 1) {
    const weeks = Math.max(1, Math.ceil((Date.parse(goal.dueDate) - Date.parse(today)) / (7 * 86_400_000)));
    perWeekNeeded = Math.ceil(((goal.targetValue - goal.currentValue) / weeks) * 100) / 100;
  }
  return { ratio, label, milestones: MILESTONES.filter((m) => pct >= m), perWeekNeeded };
}

const fmt = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });

// ───────────── Finanzen ─────────────

export const FINANCE_KINDS = ["einzahlung", "ausgabe", "einnahme"] as const;
export const FinanceEntrySchema = z.object({
  kind: z.enum(FINANCE_KINDS),
  amount: z.number().positive("Betrag muss größer als 0 sein").max(10_000_000),
  category: z.string().trim().max(40).default("sonstiges"),
  note: z.string().max(200).default(""),
  date: ISODate,
  /** Bei Einzahlungen: Sparziel, auf das gebucht wird. */
  goalId: z.string().uuid().nullable().default(null),
});
export type FinanceEntryDraft = z.infer<typeof FinanceEntrySchema>;
export type FinanceEntryInput = z.input<typeof FinanceEntrySchema>;
export interface FinanceEntry extends FinanceEntryDraft {
  id: string;
  createdAt: string;
}

export const BUDGET_CATEGORIES = ["wohnen", "lebensmittel", "mobilität", "freizeit", "abos", "gesundheit", "sonstiges"] as const;

/** Monatsübersicht: Einnahmen, Ausgaben je Kategorie, gespart, Saldo. */
export function monthSummary(entries: FinanceEntry[], month: string) {
  const inMonth = entries.filter((e) => e.date.startsWith(month));
  const sum = (k: FinanceEntry["kind"]) => inMonth.filter((e) => e.kind === k).reduce((s, e) => s + e.amount, 0);
  const byCategory = new Map<string, number>();
  for (const e of inMonth) if (e.kind === "ausgabe") byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  const income = sum("einnahme");
  const expenses = sum("ausgabe");
  const saved = sum("einzahlung");
  return {
    income,
    expenses,
    saved,
    balance: Math.round((income - expenses - saved) * 100) / 100,
    byCategory: [...byCategory].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
  };
}

// ───────────── Sport ─────────────

export const WORKOUT_KINDS = ["laufen", "kraft", "fussball", "radfahren", "schwimmen", "mobilität", "sonstiges"] as const;
export type WorkoutKind = (typeof WORKOUT_KINDS)[number];

export const WORKOUT_LABELS: Record<WorkoutKind, string> = {
  laufen: "Laufen",
  kraft: "Krafttraining",
  fussball: "Fußball",
  radfahren: "Radfahren",
  schwimmen: "Schwimmen",
  mobilität: "Mobilität",
  sonstiges: "Sonstiges",
};

export const ExerciseSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sets: z.number().int().min(1).max(50),
  reps: z.number().int().min(1).max(500),
  weightKg: z.number().min(0).max(1000).default(0),
});

export const WorkoutSchema = z.object({
  date: ISODate,
  kind: z.enum(WORKOUT_KINDS),
  durationMin: z.number().int().min(1, "Dauer fehlt").max(1440),
  distanceKm: z.number().min(0).max(1000).nullable().default(null),
  /** Gefühlte Anstrengung 1–10 */
  intensity: z.number().int().min(1).max(10).default(5),
  exercises: z.array(ExerciseSchema).max(30).default([]),
  note: z.string().max(300).default(""),
});
export type WorkoutDraft = z.infer<typeof WorkoutSchema>;
export type WorkoutInput = z.input<typeof WorkoutSchema>;
export interface Workout extends WorkoutDraft {
  id: string;
  createdAt: string;
}

export interface PersonalRecord {
  label: string;
  value: string;
  date: string;
}

/** Persönliche Rekorde: längster Lauf, schnellste Pace (≥ 3 km), längste Einheit, schwerstes Gewicht je Übung. */
export function personalRecords(workouts: Workout[]): PersonalRecord[] {
  const out: PersonalRecord[] = [];
  const runs = workouts.filter((w) => w.kind === "laufen" && w.distanceKm);
  const longest = maxBy(runs, (w) => w.distanceKm!);
  if (longest) out.push({ label: "Längster Lauf", value: `${fmt(longest.distanceKm!)} km`, date: longest.date });
  const pace = minBy(runs.filter((w) => w.distanceKm! >= 3), (w) => w.durationMin / w.distanceKm!);
  if (pace) {
    const p = pace.durationMin / pace.distanceKm!;
    out.push({ label: "Schnellste Pace (ab 3 km)", value: `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, "0")} min/km`, date: pace.date });
  }
  const longSession = maxBy(workouts, (w) => w.durationMin);
  if (longSession) out.push({ label: "Längste Einheit", value: `${longSession.durationMin} min (${WORKOUT_LABELS[longSession.kind]})`, date: longSession.date });
  const best = new Map<string, { weight: number; date: string; name: string }>();
  for (const w of workouts)
    for (const e of w.exercises) {
      const key = e.name.trim().toLowerCase();
      const prev = best.get(key);
      // Anzeigename der ersten Schreibweise behalten, Rekord aktualisieren
      if (e.weightKg > (prev?.weight ?? 0)) best.set(key, { weight: e.weightKg, date: w.date, name: prev?.name ?? e.name.trim() });
    }
  for (const b of [...best.values()].sort((a, c) => c.weight - a.weight).slice(0, 5)) out.push({ label: b.name, value: `${fmt(b.weight)} kg`, date: b.date });
  return out;
}

/**
 * Trainingsbelastung (Minuten × Intensität) der letzten 7 Tage im Vergleich zum 4-Wochen-Mittel.
 * Deutlich erhöhte Belastung → Regeneration empfehlen (vor Gericht ein geschützter Grund).
 */
export function trainingLoad(workouts: Workout[], today: string) {
  const load = (from: string, to: string) => workouts.filter((w) => w.date >= from && w.date <= to).reduce((s, w) => s + w.durationMin * w.intensity, 0);
  const week = load(addDays(today, -6), today);
  const fourWeekAvg = load(addDays(today, -27), today) / 4;
  const ratio = fourWeekAvg > 0 ? week / fourWeekAvg : week > 0 ? 2 : 0;
  const lastDays = new Set(workouts.filter((w) => w.date > addDays(today, -3)).map((w) => w.date)).size;
  const advice =
    ratio >= 1.5 || lastDays >= 3
      ? "Regeneration empfohlen – hohe Belastung in den letzten Tagen."
      : ratio < 0.5 && fourWeekAvg > 0
        ? "Belastung deutlich unter deinem Schnitt – Zeit für eine Einheit."
        : "Belastung im grünen Bereich.";
  return { week, fourWeekAvg: Math.round(fourWeekAvg), ratio: Math.round(ratio * 100) / 100, advice, recoveryRecommended: ratio >= 1.5 || lastDays >= 3 };
}

/** Trainingspläne als Quest-Vorlagen (werden als wiederkehrende Quests angelegt). */
export const TRAINING_PLANS: Array<{ id: string; title: string; description: string; quests: (start: string) => QuestDraftInput[] }> = [
  {
    id: "lauf-einsteiger",
    title: "Laufen – Einsteiger (3×/Woche)",
    description: "Mo/Mi/Fr locker laufen, Sonntag Mobilität.",
    quests: (start) => [
      { title: "Lockerer Lauf (30 min)", type: "weekly", category: "sport", difficulty: "mittel", attributes: ["ausdauer", "gesundheit"], estimatedMinutes: 30, recurrence: { freq: "weekly", interval: 1, byWeekday: [1, 3, 5], startDate: start } },
      { title: "Mobilität & Dehnen (15 min)", type: "weekly", category: "sport", difficulty: "leicht", attributes: ["gesundheit"], estimatedMinutes: 15, recurrence: { freq: "weekly", interval: 1, byWeekday: [7], startDate: start } },
    ],
  },
  {
    id: "kraft-ganzkoerper",
    title: "Kraft – Ganzkörper (2×/Woche)",
    description: "Di/Do Ganzkörpertraining.",
    quests: (start) => [
      { title: "Ganzkörper-Krafttraining", type: "weekly", category: "sport", difficulty: "schwer", attributes: ["staerke", "disziplin"], estimatedMinutes: 50, recurrence: { freq: "weekly", interval: 1, byWeekday: [2, 4], startDate: start } },
    ],
  },
  {
    id: "fussball-saison",
    title: "Fußball – Saison",
    description: "Di/Do Training, Sa Spiel, So Regeneration.",
    quests: (start) => [
      { title: "Fußballtraining", type: "weekly", category: "sport", difficulty: "schwer", attributes: ["ausdauer", "soziales"], estimatedMinutes: 90, recurrence: { freq: "weekly", interval: 1, byWeekday: [2, 4], startDate: start } },
      { title: "Spieltag", type: "weekly", category: "sport", difficulty: "schwer", attributes: ["ausdauer", "willenskraft"], recurrence: { freq: "weekly", interval: 1, byWeekday: [6], startDate: start } },
      { title: "Regeneration (Faszienrolle, Spaziergang)", type: "weekly", category: "sport", difficulty: "leicht", attributes: ["gesundheit"], estimatedMinutes: 20, recurrence: { freq: "weekly", interval: 1, byWeekday: [7], startDate: start } },
    ],
  },
];

// ───────────── Business ─────────────

/** Überfällige und bald fällige Aufgaben eines Bereichs. */
export function deadlines(quests: Quest[], nowIso: string, days = 7) {
  const horizon = new Date(Date.parse(nowIso) + days * 86_400_000).toISOString();
  const open = quests.filter((q) => q.status === "aktiv" && !q.recurrence && q.dueAt);
  return {
    overdue: open.filter((q) => q.dueAt! < nowIso).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!)),
    upcoming: open.filter((q) => q.dueAt! >= nowIso && q.dueAt! <= horizon).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!)),
  };
}

function maxBy<T>(xs: T[], f: (x: T) => number): T | undefined {
  return xs.reduce<T | undefined>((m, x) => (m === undefined || f(x) > f(m) ? x : m), undefined);
}
function minBy<T>(xs: T[], f: (x: T) => number): T | undefined {
  return xs.reduce<T | undefined>((m, x) => (m === undefined || f(x) < f(m) ? x : m), undefined);
}
