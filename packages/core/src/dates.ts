/** Reine Datums-Arithmetik auf "JJJJ-MM-TT"-Strings (zeitzonenfrei, via UTC). */
const DAY = 86_400_000;

export function parseDate(d: string): number {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day);
}

export function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  return formatDate(parseDate(d) + n * DAY);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseDate(a) - parseDate(b)) / DAY);
}

/** ISO-Wochentag: 1 = Montag … 7 = Sonntag */
export function isoWeekday(d: string): number {
  const wd = new Date(parseDate(d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/**
 * Der Spieltag beginnt um 04:00 Ortszeit, nicht um Mitternacht.
 * Alles zwischen 00:00 und 03:59 zählt noch zum Vortag (späte Abende brechen keine Serie).
 */
export const DAY_START_HOUR = 4;

/** Kalenderdatum (Ortszeit) eines Zeitpunkts, ohne Verschiebung. */
export function calendarDateOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Spieltag eines Zeitpunkts als JJJJ-MM-TT (Tageswechsel um DAY_START_HOUR). */
export function gameDateOf(at: Date | string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return calendarDateOf(new Date(d.getTime() - DAY_START_HOUR * 3_600_000));
}

/** Heutiger Spieltag des Geräts. */
export function localToday(now: Date = new Date()): string {
  return gameDateOf(now);
}

/**
 * Fälligkeitszeitpunkt eines Vorkommens: Uhrzeiten vor DAY_START_HOUR gehören zur Nacht
 * nach dem Spieltag (z. B. 01:30 am Spieltag Dienstag = Mittwoch 01:30).
 */
export function occurrenceDueAt(date: string, time: string | null): string {
  const t = time ?? "23:59";
  const day = Number(t.slice(0, 2)) < DAY_START_HOUR ? addDays(date, 1) : date;
  return new Date(`${day}T${t}:00`).toISOString();
}
