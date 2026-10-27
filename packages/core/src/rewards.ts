import type { Attribute, Difficulty, QuestType } from "./schemas.ts";

/** Muss mit public.quest_reward() in der Migration übereinstimmen. */
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
}

export function computeReward(q: { difficulty: Difficulty; type: QuestType; attributes: Attribute[] }): Reward {
  const xp = Math.round(DIFFICULTY_XP[q.difficulty] * TYPE_MULTIPLIER[q.type]);
  const coins = Math.max(1, Math.round(xp / 5));
  const attributeXp: Partial<Record<Attribute, number>> = {};
  const attrs = [...new Set(q.attributes)];
  if (attrs.length > 0) {
    // Ganzzahlig aufteilen; der Rest geht an das erste Attribut.
    const share = Math.floor(xp / attrs.length);
    attrs.forEach((a, i) => (attributeXp[a] = share + (i === 0 ? xp - share * attrs.length : 0)));
  }
  return { xp, coins, attributeXp };
}
