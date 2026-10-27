/**
 * Levelkurve: XP bis zum nächsten Level = round(base * level^exponent).
 * Muss mit public.xp_to_next() in supabase/migrations übereinstimmen.
 */
export interface LevelCurve {
  base: number;
  exponent: number;
  maxLevel: number;
}

export const DEFAULT_CURVE: LevelCurve = { base: 100, exponent: 1.5, maxLevel: 200 };

export function xpToNext(level: number, curve: LevelCurve = DEFAULT_CURVE): number {
  return Math.round(curve.base * Math.pow(level, curve.exponent));
}

export interface LevelInfo {
  level: number;
  /** XP innerhalb des aktuellen Levels. */
  xpInLevel: number;
  /** XP, die für dieses Level insgesamt nötig sind. */
  xpForLevel: number;
  /** 0–1 */
  progress: number;
}

export function levelFromXp(totalXp: number, curve: LevelCurve = DEFAULT_CURVE): LevelInfo {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (level < curve.maxLevel) {
    const need = xpToNext(level, curve);
    if (remaining < need) break;
    remaining -= need;
    level++;
  }
  const xpForLevel = xpToNext(level, curve);
  return { level, xpInLevel: remaining, xpForLevel, progress: Math.min(1, remaining / xpForLevel) };
}

/** Attribut-Level verwenden eine flachere Kurve. */
export const ATTRIBUTE_CURVE: LevelCurve = { base: 50, exponent: 1.3, maxLevel: 100 };

const TITLES: Array<[number, string]> = [
  [1, "Neuling"],
  [5, "Abenteurer"],
  [10, "Wegbereiter"],
  [20, "Veteran"],
  [35, "Meister"],
  [50, "Champion"],
  [75, "Legende"],
  [100, "Mythos"],
];

export function titleForLevel(level: number): string {
  let title = TITLES[0]![1];
  for (const [min, t] of TITLES) if (level >= min) title = t;
  return title;
}
