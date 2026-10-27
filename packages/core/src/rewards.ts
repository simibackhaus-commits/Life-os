import type { Attribute, Difficulty, QuestType } from "./schemas.ts";
import { skillBonus } from "./skills.ts";

/** Muss mit public.quest_reward_xp() / complete_quest_instance() in den Migrationen übereinstimmen. */
export const DIFFICULTY_XP: Record<Difficulty, number> = {
  trivial: 5,
  leicht: 10,
  mittel: 25,
  schwer: 50,
  episch: 100,
};

export const TYPE_MULTIPLIER: Record<QuestType, number> = {
  daily: 1,
  weekly: 1.5,
  main: 2,
  side: 1,
  epic: 3,
  legendary: 5,
  hidden: 1.5,
  boss: 4,
};

export interface Reward {
  xp: number;
  coins: number;
  attributeXp: Partial<Record<Attribute, number>>;
  /** Angewandte Skill-Boni in Prozent. */
  bonus: { xpPct: number; coinPct: number };
}

/**
 * Basis: XP = Schwierigkeit × Questtyp, Coins = XP / 5 (mind. 1).
 * Skill-Boni erhöhen XP bzw. Coins prozentual (siehe skills.ts).
 */
export function computeReward(
  q: { difficulty: Difficulty; type: QuestType; attributes: Attribute[] },
  unlockedSkills: ReadonlySet<string> = new Set(),
): Reward {
  const baseXp = Math.round(DIFFICULTY_XP[q.difficulty] * TYPE_MULTIPLIER[q.type]);
  const baseCoins = Math.max(1, Math.round(baseXp / 5));
  const bonus = skillBonus(q.attributes, unlockedSkills);
  const xp = Math.round((baseXp * (100 + bonus.xpPct)) / 100);
  const coins = Math.round((baseCoins * (100 + bonus.coinPct)) / 100);
  const attributeXp: Partial<Record<Attribute, number>> = {};
  const attrs = [...new Set(q.attributes)];
  if (attrs.length > 0) {
    // Ganzzahlig aufteilen; der Rest geht an das erste Attribut.
    const share = Math.floor(xp / attrs.length);
    attrs.forEach((a, i) => (attributeXp[a] = share + (i === 0 ? xp - share * attrs.length : 0)));
  }
  return { xp, coins, attributeXp, bonus };
}
