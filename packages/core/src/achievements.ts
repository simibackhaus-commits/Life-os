import { ATTRIBUTES, type Attribute } from "./schemas.ts";
import { ATTRIBUTE_CURVE, levelFromXp } from "./leveling.ts";
import { computeStreak } from "./streaks.ts";
import type { GameState } from "./engine.ts";

/**
 * Achievements werden rein aus dem Spielstand berechnet (keine eigene Tabelle, keine Spielwirkung).
 * Dadurch sind sie automatisch auf allen Geräten gleich und können nicht „verloren“ gehen.
 */
export interface AchievementInput extends GameState {
  cases?: Array<{ verdict: string | null; plea: string | null }>;
  today: string;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  tier: "bronze" | "silber" | "gold" | "legendär";
  /** Liefert aktuellen Fortschritt und Ziel. */
  measure(input: AchievementInput, ctx: Derived): { current: number; target: number };
}

export interface AchievementStatus {
  def: AchievementDef;
  current: number;
  target: number;
  unlocked: boolean;
  /** 0–1 */
  progress: number;
}

interface Derived {
  completions: number;
  bestStreak: number;
  level: number;
  completedTypes: Set<string>;
  earlyBird: number;
  purchases: number;
  attributeLevels: Record<Attribute, number>;
}

function derive(input: AchievementInput): Derived {
  const done = input.instances.filter((i) => i.status === "erledigt");
  let bestStreak = 0;
  for (const q of input.quests) {
    if (!q.recurrence) continue;
    const keys = new Set(
      input.instances.filter((i) => i.questId === q.id && (i.status === "erledigt" || i.status === "entschuldigt")).map((i) => i.occurrenceKey),
    );
    bestStreak = Math.max(bestStreak, computeStreak(q.recurrence, keys, input.today).best);
  }
  const typeOf = new Map(input.quests.map((q) => [q.id, q.type]));
  const attributeLevels = Object.fromEntries(
    ATTRIBUTES.map((a) => [a, levelFromXp(input.character.attributeXp?.[a] ?? 0, ATTRIBUTE_CURVE).level]),
  ) as Record<Attribute, number>;
  return {
    completions: done.length,
    bestStreak,
    level: levelFromXp(input.character.totalXp).level,
    completedTypes: new Set(done.map((i) => typeOf.get(i.questId)).filter((t): t is NonNullable<typeof t> => !!t)),
    earlyBird: done.filter((i) => i.completedAt && new Date(i.completedAt).getHours() < 7).length,
    purchases: input.events.filter((e) => e.kind === "shop_purchase").length,
    attributeLevels,
  };
}

const count = (target: number, pick: (d: Derived) => number) => (_: AchievementInput, d: Derived) => ({ current: pick(d), target });
const flag = (ok: (i: AchievementInput, d: Derived) => boolean) => (i: AchievementInput, d: Derived) => ({ current: ok(i, d) ? 1 : 0, target: 1 });

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "erste_quest", title: "Der erste Schritt", description: "Schließe deine erste Quest ab.", icon: "🌱", tier: "bronze", measure: count(1, (d) => d.completions) },
  { id: "quests_10", title: "Fleißiger Abenteurer", description: "Schließe 10 Quests ab.", icon: "📜", tier: "bronze", measure: count(10, (d) => d.completions) },
  { id: "quests_100", title: "Questmeister", description: "Schließe 100 Quests ab.", icon: "🏆", tier: "gold", measure: count(100, (d) => d.completions) },
  { id: "serie_7", title: "Eine Woche stark", description: "Halte eine Serie 7 Tage lang.", icon: "🔥", tier: "silber", measure: count(7, (d) => d.bestStreak) },
  { id: "serie_30", title: "Unaufhaltsam", description: "Halte eine Serie 30 Tage lang.", icon: "☄️", tier: "gold", measure: count(30, (d) => d.bestStreak) },
  { id: "level_5", title: "Aufsteiger", description: "Erreiche Level 5.", icon: "⭐", tier: "bronze", measure: count(5, (d) => d.level) },
  { id: "level_10", title: "Wegbereiter", description: "Erreiche Level 10.", icon: "🌟", tier: "silber", measure: count(10, (d) => d.level) },
  { id: "level_25", title: "Veteran des Lebens", description: "Erreiche Level 25.", icon: "👑", tier: "gold", measure: count(25, (d) => d.level) },
  { id: "boss", title: "Bezwinger", description: "Besiege einen Bosskampf.", icon: "🐉", tier: "silber", measure: flag((_, d) => d.completedTypes.has("boss")) },
  { id: "legende", title: "Legende", description: "Schließe eine legendäre Quest ab.", icon: "🗡️", tier: "legendär", measure: flag((_, d) => d.completedTypes.has("legendary")) },
  { id: "fruehaufsteher", title: "Früher Vogel", description: "Erledige 5 Quests vor 7 Uhr.", icon: "🌅", tier: "silber", measure: count(5, (d) => d.earlyBird) },
  { id: "sparfuchs", title: "Sparfuchs", description: "Besitze 500 LIFE COINS gleichzeitig.", icon: "💰", tier: "silber", measure: (i) => ({ current: i.character.coins, target: 500 }) },
  { id: "belohnt", title: "Gönn dir", description: "Löse eine Belohnung im Shop ein.", icon: "🎁", tier: "bronze", measure: count(1, (d) => d.purchases) },
  { id: "freispruch", title: "Im Zweifel für den Angeklagten", description: "Werde vor Gericht freigesprochen.", icon: "⚖️", tier: "bronze", measure: flag((i) => !!i.cases?.some((c) => c.verdict === "freispruch")) },
  { id: "gestaendnis", title: "Ehrlich währt am längsten", description: "Bekenne dich vor Gericht schuldig.", icon: "🤝", tier: "bronze", measure: flag((i) => !!i.cases?.some((c) => c.plea === "schuldig")) },
  {
    id: "allrounder",
    title: "Allrounder",
    description: "Bringe alle 10 Attribute auf Level 3.",
    icon: "🧭",
    tier: "gold",
    measure: (_, d) => ({ current: ATTRIBUTES.filter((a) => d.attributeLevels[a] >= 3).length, target: ATTRIBUTES.length }),
  },
];

export function evaluateAchievements(input: AchievementInput): AchievementStatus[] {
  const d = derive(input);
  return ACHIEVEMENTS.map((def) => {
    const { current, target } = def.measure(input, d);
    const capped = Math.min(current, target);
    return { def, current: capped, target, unlocked: current >= target, progress: target ? capped / target : 0 };
  });
}
