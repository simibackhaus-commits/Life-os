import { addDays, diffDays, isoWeekday, parseDate } from "./dates.ts";
import type { RecurrenceRule } from "./schemas.ts";

export interface Occurrence {
  /** Eindeutig pro Quest, z. B. "2026-10-27" oder "2026-10-27T07:00". */
  key: string;
  date: string;
  time: string | null;
}

/** Schlüssel der einzigen Instanz einer nicht wiederkehrenden Quest. */
export const ONCE_KEY = "once";

function isScheduledDay(rule: RecurrenceRule, date: string): boolean {
  if (date < rule.startDate) return false;
  if (rule.endDate && date > rule.endDate) return false;
  const interval = rule.interval ?? 1;
  switch (rule.freq) {
    case "daily":
      return diffDays(date, rule.startDate) % interval === 0;
    case "weekly": {
      const days = rule.byWeekday?.length ? rule.byWeekday : [isoWeekday(rule.startDate)];
      if (!days.includes(isoWeekday(date))) return false;
      // Wochen relativ zum Montag der Startwoche zählen.
      const startMonday = addDays(rule.startDate, 1 - isoWeekday(rule.startDate));
      const week = Math.floor(diffDays(date, startMonday) / 7);
      return week % interval === 0;
    }
    case "monthly": {
      const d = new Date(parseDate(date));
      const s = new Date(parseDate(rule.startDate));
      const days = rule.byMonthDay?.length ? rule.byMonthDay : [s.getUTCDate()];
      if (!days.includes(d.getUTCDate())) return false;
      const months = (d.getUTCFullYear() - s.getUTCFullYear()) * 12 + d.getUTCMonth() - s.getUTCMonth();
      return months % interval === 0;
    }
  }
}

/** Alle Vorkommen im geschlossenen Intervall [from, to]. */
export function occurrencesBetween(rule: RecurrenceRule, from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  const span = diffDays(to, from);
  if (span < 0 || span > 3660) return out;
  const times = rule.times?.length ? [...rule.times].sort() : null;
  for (let i = 0; i <= span; i++) {
    const date = addDays(from, i);
    if (!isScheduledDay(rule, date)) continue;
    if (times) for (const t of times) out.push({ key: `${date}T${t}`, date, time: t });
    else out.push({ key: date, date, time: null });
  }
  return out;
}

export function occurrencesOn(rule: RecurrenceRule, date: string): Occurrence[] {
  return occurrencesBetween(rule, date, date);
}

const WEEKDAY_SHORT = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function describeRule(rule: RecurrenceRule): string {
  const every = rule.interval > 1 ? `alle ${rule.interval} ` : "";
  let base: string;
  if (rule.freq === "daily") base = rule.interval > 1 ? `${every}Tage` : "täglich";
  else if (rule.freq === "weekly") {
    const days = (rule.byWeekday?.length ? rule.byWeekday : [isoWeekday(rule.startDate)])
      .map((d) => WEEKDAY_SHORT[d])
      .join(", ");
    base = rule.interval > 1 ? `${every}Wochen (${days})` : `wöchentlich (${days})`;
  } else base = rule.interval > 1 ? `${every}Monate` : "monatlich";
  return rule.times?.length ? `${base} um ${rule.times.join(" & ")}` : base;
}
