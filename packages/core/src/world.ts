import { z } from "zod";
import { AttributeSchema, type Attribute, type Quest, type QuestInstance } from "./schemas.ts";
import { computeStreak } from "./streaks.ts";
import { titleForLevel } from "./leveling.ts";
import type { AchievementStatus } from "./achievements.ts";

// ───────────── Fokus-Dungeons ─────────────
/**
 * Konzentrationssitzungen. Belohnung erst, wenn der Server bestätigt, dass die Zeit abgelaufen ist
 * (public.finish_focus_session). Werte müssen mit der Migration übereinstimmen.
 */
export interface DungeonDef {
  id: string;
  title: string;
  minutes: number;
  xp: number;
  coins: number;
  description: string;
  icon: string;
}

export const DUNGEONS: DungeonDef[] = [
  { id: "hoehle", title: "Höhle der Ablenkung", minutes: 25, xp: 30, coins: 6, icon: "🕯️", description: "Ein Pomodoro – 25 Minuten ohne Handy." },
  { id: "turm", title: "Turm der Konzentration", minutes: 50, xp: 70, coins: 14, icon: "🗼", description: "50 Minuten Deep Work." },
  { id: "abgrund", title: "Abgrund der Tiefe", minutes: 90, xp: 140, coins: 28, icon: "🌌", description: "90 Minuten volle Hingabe – nur für Erfahrene." },
];
export const DUNGEON_BY_ID = new Map(DUNGEONS.map((d) => [d.id, d]));
/** Toleranz für Uhr-Abweichungen zwischen Gerät und Server. */
export const FOCUS_TOLERANCE_SECONDS = 30;

export const FocusStartSchema = z.object({
  dungeonId: z.enum(["hoehle", "turm", "abgrund"]),
  attribute: AttributeSchema,
  intent: z.string().trim().max(120).default(""),
});
export type FocusStartInput = z.input<typeof FocusStartSchema>;

export interface FocusSession {
  id: string;
  dungeonId: string;
  attribute: Attribute;
  intent: string;
  minutes: number;
  startedAt: string;
  finishedAt: string | null;
  status: "laufend" | "geschafft" | "abgebrochen";
}

/** Sekunden bis zum Ende (negativ = überzogen). */
export function focusRemaining(session: Pick<FocusSession, "startedAt" | "minutes">, now: number = Date.now()): number {
  return Math.ceil((Date.parse(session.startedAt) + session.minutes * 60_000 - now) / 1000);
}

export type FocusFinishResult =
  | { applied: true; xp: number; coins: number }
  | { applied: false; reason: "too_early" | "not_running" | "not_found" | "duplicate_event" };

// ───────────── Habit Garden ─────────────
export interface PlantStage {
  icon: string;
  name: string;
  /** Mindest-Serie für diese Stufe */
  minStreak: number;
}

export const PLANT_STAGES: PlantStage[] = [
  { icon: "🟫", name: "Saatbeet", minStreak: 0 },
  { icon: "🌱", name: "Keimling", minStreak: 1 },
  { icon: "🌿", name: "Jungpflanze", minStreak: 3 },
  { icon: "🪴", name: "Busch", minStreak: 7 },
  { icon: "🌳", name: "Baum", minStreak: 14 },
  { icon: "🌸", name: "Blühender Baum", minStreak: 30 },
];

export interface GardenPlant {
  quest: Quest;
  stage: PlantStage;
  current: number;
  best: number;
  /** Serie gerissen, nachdem es schon eine gab */
  wilted: boolean;
  /** Fortschritt bis zur nächsten Stufe (0–1) */
  growth: number;
  next: PlantStage | null;
}

export function gardenPlants(quests: Quest[], instances: QuestInstance[], today: string): GardenPlant[] {
  return quests
    .filter((q) => q.status === "aktiv" && q.recurrence)
    .map((q) => {
      const keys = new Set(instances.filter((i) => i.questId === q.id && (i.status === "erledigt" || i.status === "entschuldigt")).map((i) => i.occurrenceKey));
      const { current, best } = computeStreak(q.recurrence!, keys, today);
      const idx = PLANT_STAGES.reduce((acc, st, i) => (current >= st.minStreak ? i : acc), 0);
      const stage = PLANT_STAGES[idx]!;
      const next = PLANT_STAGES[idx + 1] ?? null;
      const growth = next ? (current - stage.minStreak) / (next.minStreak - stage.minStreak) : 1;
      return { quest: q, stage, current, best, wilted: current === 0 && best > 0, growth, next };
    })
    .sort((a, b) => b.current - a.current);
}

// ───────────── Titel ─────────────
export interface TitleOption {
  title: string;
  source: string;
}

/** Wählbare Titel: Level-Titel bis zum aktuellen Level + Titel freigeschalteter Gold-/Legendär-Achievements. */
export function availableTitles(level: number, achievements: AchievementStatus[]): TitleOption[] {
  const levels = [1, 5, 10, 20, 35, 50, 75, 100].filter((l) => l <= level).map((l) => ({ title: titleForLevel(l), source: `Level ${l}` }));
  const fromAchievements = achievements
    .filter((a) => a.unlocked && (a.def.tier === "gold" || a.def.tier === "legendär" || a.def.tier === "silber"))
    .map((a) => ({ title: a.def.title, source: `Achievement ${a.def.icon}` }));
  const seen = new Set<string>();
  return [...levels, ...fromAchievements].filter((t) => (seen.has(t.title) ? false : (seen.add(t.title), true)));
}
