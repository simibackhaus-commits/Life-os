import { ATTRIBUTES, ATTRIBUTE_LABELS, type Attribute } from "./schemas.ts";
import { ATTRIBUTE_CURVE, levelFromXp } from "./leveling.ts";

/**
 * Skilltree: Pro Attribut drei Fähigkeiten. Skillpunkte eines Attributs = Attribut-Level − 1.
 * Wirkung (muss mit public.skill_bonus_pct() in der Migration übereinstimmen):
 *  Stufe 1: +5 % XP, Stufe 2: +10 % XP auf Quests mit diesem Attribut,
 *  Stufe 3: +10 % Coins auf Quests mit diesem Attribut.
 * Boni mehrerer Attribute werden addiert und gedeckelt.
 */
export const SKILL_CAPS = { xpPct: 25, coinPct: 20 } as const;

export interface SkillDef {
  id: string;
  attribute: Attribute;
  tier: 1 | 2 | 3;
  title: string;
  effect: string;
  requiredLevel: number;
  xpPct: number;
  coinPct: number;
}

const TIERS: Array<{ tier: 1 | 2 | 3; requiredLevel: number; xpPct: number; coinPct: number; effect: string }> = [
  { tier: 1, requiredLevel: 2, xpPct: 5, coinPct: 0, effect: "+5 % XP" },
  { tier: 2, requiredLevel: 5, xpPct: 10, coinPct: 0, effect: "+10 % XP" },
  { tier: 3, requiredLevel: 10, xpPct: 0, coinPct: 10, effect: "+10 % Coins" },
];

const NAMES: Record<Attribute, [string, string, string]> = {
  disziplin: ["Routine", "Eiserner Wille", "Meister der Gewohnheit"],
  staerke: ["Grundkraft", "Kraftpaket", "Titan"],
  ausdauer: ["Zweiter Atem", "Langstrecke", "Unermüdlich"],
  intelligenz: ["Wissbegier", "Analytiker", "Gelehrter"],
  karriere: ["Macher", "Stratege", "Anführer"],
  finanzen: ["Sparsam", "Investor", "Schatzmeister"],
  gesundheit: ["Achtsam", "Vital", "Unverwüstlich"],
  soziales: ["Zuhörer", "Netzwerker", "Herz der Runde"],
  ordnung: ["Aufgeräumt", "Organisator", "Architekt des Alltags"],
  willenskraft: ["Standhaft", "Unbeirrbar", "Unbeugsam"],
};

export const SKILLS: SkillDef[] = ATTRIBUTES.flatMap((attribute) =>
  TIERS.map((t, i) => ({
    id: `${attribute}_${t.tier}`,
    attribute,
    tier: t.tier,
    title: NAMES[attribute][i]!,
    effect: `${t.effect} auf ${ATTRIBUTE_LABELS[attribute]}-Quests`,
    requiredLevel: t.requiredLevel,
    xpPct: t.xpPct,
    coinPct: t.coinPct,
  })),
);

export const SKILL_BY_ID = new Map(SKILLS.map((s) => [s.id, s]));

export function attributeLevel(attributeXp: Partial<Record<Attribute, number>>, a: Attribute): number {
  return levelFromXp(attributeXp[a] ?? 0, ATTRIBUTE_CURVE).level;
}

export function skillPoints(attributeXp: Partial<Record<Attribute, number>>, unlocked: ReadonlySet<string>, a: Attribute) {
  const total = attributeLevel(attributeXp, a) - 1;
  const spent = SKILLS.filter((s) => s.attribute === a && unlocked.has(s.id)).length;
  return { total, spent, available: total - spent };
}

export type UnlockCheck = { ok: true } | { ok: false; reason: "unknown" | "already" | "level" | "previous" | "points" };

/** Gleiche Prüfung wie public.unlock_skill() auf dem Server. */
export function canUnlock(skillId: string, attributeXp: Partial<Record<Attribute, number>>, unlocked: ReadonlySet<string>): UnlockCheck {
  const s = SKILL_BY_ID.get(skillId);
  if (!s) return { ok: false, reason: "unknown" };
  if (unlocked.has(skillId)) return { ok: false, reason: "already" };
  if (s.tier > 1 && !unlocked.has(`${s.attribute}_${s.tier - 1}`)) return { ok: false, reason: "previous" };
  if (attributeLevel(attributeXp, s.attribute) < s.requiredLevel) return { ok: false, reason: "level" };
  if (skillPoints(attributeXp, unlocked, s.attribute).available < 1) return { ok: false, reason: "points" };
  return { ok: true };
}

/** Bonusprozente für eine Quest mit den gegebenen Attributen. */
export function skillBonus(attributes: readonly Attribute[], unlocked: ReadonlySet<string>): { xpPct: number; coinPct: number } {
  let xpPct = 0;
  let coinPct = 0;
  for (const a of new Set(attributes)) {
    for (const s of SKILLS) {
      if (s.attribute !== a || !unlocked.has(s.id)) continue;
      xpPct += s.xpPct;
      coinPct += s.coinPct;
    }
  }
  return { xpPct: Math.min(xpPct, SKILL_CAPS.xpPct), coinPct: Math.min(coinPct, SKILL_CAPS.coinPct) };
}
