import { addDays } from "./dates.ts";
import { occurrencesOn } from "./recurrence.ts";
import type { RecurrenceRule } from "./schemas.ts";

export interface StreakInfo {
  current: number;
  best: number;
}

/**
 * Streak = Anzahl aufeinanderfolgender geplanter Tage, an denen alle Vorkommen erfüllt wurden.
 * Ein heute noch offener Tag unterbricht die Serie nicht. Entschuldigte Vorkommen zählen als erfüllt.
 */
export function computeStreak(
  rule: RecurrenceRule,
  fulfilledKeys: ReadonlySet<string>,
  today: string,
  lookbackDays = 400,
): StreakInfo {
  let current = 0;
  let best = 0;
  let run = 0;
  let currentOpen = true;
  for (let i = 0; i <= lookbackDays; i++) {
    const date = addDays(today, -i);
    if (date < rule.startDate) break;
    const occ = occurrencesOn(rule, date);
    if (occ.length === 0) continue;
    const allDone = occ.every((o) => fulfilledKeys.has(o.key));
    if (allDone) {
      run++;
      if (currentOpen) current = run;
    } else {
      if (i === 0) continue; // heute ist noch nicht vorbei
      currentOpen = false;
      run = 0;
    }
    best = Math.max(best, run);
  }
  return { current, best };
}
