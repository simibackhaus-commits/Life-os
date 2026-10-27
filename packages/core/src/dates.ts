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

/** Lokales Datum des Geräts als JJJJ-MM-TT. */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
