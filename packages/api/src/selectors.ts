import {
  ONCE_KEY,
  addDays,
  computeReward,
  computeStreak,
  evaluateAchievements,
  gameDateOf,
  isoWeekday,
  occurrenceDueAt,
  isQuestLocked,
  occurrencesBetween,
  occurrencesOn,
  type InstanceStatus,
  type Quest,
  type QuestInstance,
} from "@life-os/core";
import type { Snapshot } from "./types.ts";

export interface OccurrenceItem {
  quest: Quest;
  key: string;
  date: string | null;
  time: string | null;
  dueAt: string | null;
  status: InstanceStatus;
  instance: QuestInstance | null;
}

function instanceIndex(instances: QuestInstance[]) {
  const m = new Map<string, QuestInstance>();
  for (const i of instances) m.set(`${i.questId}|${i.occurrenceKey}`, i);
  return m;
}

export { occurrenceDueAt };

/** Heute fällige Vorkommen aller aktiven Quests + offene einmalige Quests, die heute oder früher fällig sind. */
export function todaysItems(s: Snapshot, today: string): OccurrenceItem[] {
  const idx = instanceIndex(s.instances);
  const out: OccurrenceItem[] = [];
  for (const q of s.quests) {
    if (q.status !== "aktiv" || isQuestLocked(s.quests, q)) continue;
    if (q.recurrence) {
      for (const o of occurrencesOn(q.recurrence, today)) {
        const inst = idx.get(`${q.id}|${o.key}`) ?? null;
        out.push({ quest: q, key: o.key, date: o.date, time: o.time, dueAt: occurrenceDueAt(o.date, o.time), status: inst?.status ?? "offen", instance: inst });
      }
    } else if (q.type === "daily" || (q.dueAt && gameDateOf(q.dueAt) <= today)) {
      out.push({ quest: q, key: ONCE_KEY, date: (q.dueAt ? gameDateOf(q.dueAt) : today), time: null, dueAt: q.dueAt, status: "offen", instance: null });
    }
  }
  // Heute erledigte einmalige Quests weiterhin anzeigen
  for (const i of s.instances) {
    if (i.occurrenceKey !== ONCE_KEY || i.status !== "erledigt" || !i.completedAt) continue;
    const q = s.quests.find((x) => x.id === i.questId);
    if (q && gameDateOf(i.completedAt) === today) {
      out.push({ quest: q, key: ONCE_KEY, date: today, time: null, dueAt: q.dueAt, status: "erledigt", instance: i });
    }
  }
  return out.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99") || b.quest.priority - a.quest.priority);
}

/** Verpasste Pflicht-Vorkommen der letzten 7 Tage ohne Verfahren – Kandidaten für das Gericht. */
export function missedMandatory(s: Snapshot, today: string): OccurrenceItem[] {
  const idx = instanceIndex(s.instances);
  const caseKeys = new Set(s.cases.map((c) => `${c.questId}|${c.occurrenceKey}`));
  const out: OccurrenceItem[] = [];
  const nowIso = new Date().toISOString();
  for (const q of s.quests) {
    if (!q.mandatory || q.status !== "aktiv" || isQuestLocked(s.quests, q)) continue;
    if (q.recurrence) {
      const from = addDays(today, -7) > q.recurrence.startDate ? addDays(today, -7) : q.recurrence.startDate;
      for (const o of occurrencesBetween(q.recurrence, from, today)) {
        const dueAt = occurrenceDueAt(o.date, o.time);
        if (dueAt > nowIso) continue;
        const inst = idx.get(`${q.id}|${o.key}`);
        if (inst && inst.status !== "offen") continue;
        if (caseKeys.has(`${q.id}|${o.key}`)) continue;
        out.push({ quest: q, key: o.key, date: o.date, time: o.time, dueAt, status: "verpasst", instance: inst ?? null });
      }
    } else if (q.dueAt && q.dueAt < nowIso && !caseKeys.has(`${q.id}|${ONCE_KEY}`)) {
      out.push({ quest: q, key: ONCE_KEY, date: gameDateOf(q.dueAt), time: null, dueAt: q.dueAt, status: "verpasst", instance: null });
    }
  }
  return out;
}

export function upcoming(s: Snapshot, today: string, days = 7): OccurrenceItem[] {
  const out: OccurrenceItem[] = [];
  const to = addDays(today, days);
  for (const q of s.quests) {
    if (q.status !== "aktiv" || isQuestLocked(s.quests, q)) continue;
    if (q.recurrence) {
      for (const o of occurrencesBetween(q.recurrence, addDays(today, 1), to).slice(0, 3)) {
        out.push({ quest: q, key: o.key, date: o.date, time: o.time, dueAt: occurrenceDueAt(o.date, o.time), status: "offen", instance: null });
      }
    } else if (q.dueAt && gameDateOf(q.dueAt) > today && gameDateOf(q.dueAt) <= to) {
      out.push({ quest: q, key: ONCE_KEY, date: gameDateOf(q.dueAt), time: null, dueAt: q.dueAt, status: "offen", instance: null });
    }
  }
  return out.sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "")).slice(0, 8);
}

export function questStreak(s: Snapshot, q: Quest, today: string) {
  if (!q.recurrence) return null;
  const keys = new Set(
    s.instances.filter((i) => i.questId === q.id && (i.status === "erledigt" || i.status === "entschuldigt")).map((i) => i.occurrenceKey),
  );
  return computeStreak(q.recurrence, keys, today);
}

/** XP pro Tag der letzten n Tage (für das Diagramm). */
export function xpPerDay(s: Snapshot, today: string, n = 14) {
  const days = Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
  const sums = new Map(days.map((d) => [d, 0]));
  for (const e of s.events) {
    const key = gameDateOf(e.createdAt);
    if (sums.has(key)) sums.set(key, sums.get(key)! + e.xpDelta);
  }
  return days.map((d) => ({ day: d.slice(5).split("-").reverse().join("."), xp: sums.get(d)! }));
}

/** Belohnung inkl. Skill-Boni des Spielers. */
export const rewardOf = (q: Quest, skills: readonly string[] = []) => computeReward(q, new Set(skills));

/** Achievements für den aktuellen Spielstand. */
export function achievementsFor(s: Snapshot, today: string) {
  return evaluateAchievements({ ...s, today, lifetime: s.lifetime });
}

const WEEKDAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Abschlüsse je Wochentag in den letzten n Tagen. */
export function completionsByWeekday(s: Snapshot, today: string, days = 30) {
  const from = addDays(today, -days + 1);
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const i of s.instances) {
    if (i.status !== "erledigt" || !i.completedAt) continue;
    const key = gameDateOf(i.completedAt);
    if (key < from || key > today) continue;
    counts[isoWeekday(key) - 1]!++;
  }
  return WEEKDAY_NAMES.map((day, i) => ({ day, count: counts[i]! }));
}

/** Erfüllungsquote je wiederkehrender Quest (vergangene Vorkommen der letzten n Tage, heute ausgenommen). */
export function questCompletionRates(s: Snapshot, today: string, days = 14) {
  const done = new Set(
    s.instances.filter((i) => i.status === "erledigt" || i.status === "entschuldigt").map((i) => `${i.questId}|${i.occurrenceKey}`),
  );
  return s.quests
    .filter((q) => q.status === "aktiv" && q.recurrence)
    .map((q) => {
      const from = addDays(today, -days) > q.recurrence!.startDate ? addDays(today, -days) : q.recurrence!.startDate;
      const occ = occurrencesBetween(q.recurrence!, from, addDays(today, -1));
      const fulfilled = occ.filter((o) => done.has(`${q.id}|${o.key}`)).length;
      return { quest: q, scheduled: occ.length, fulfilled, rate: occ.length ? fulfilled / occ.length : null };
    })
    .sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2));
}

/** Summen für Kennzahlen-Kacheln. */
export function totals(s: Snapshot) {
  const completions = s.instances.filter((i) => i.status === "erledigt").length;
  const coinsSpent = s.purchases.reduce((sum, p) => sum + p.cost, 0);
  const convictions = s.cases.filter((c) => c.verdict && !["freispruch", "einstellung"].includes(c.verdict)).length;
  return { completions, coinsSpent, convictions, activeQuests: s.quests.filter((q) => q.status === "aktiv").length };
}

/** Alle Termine eines Kalendertags: Vorkommen wiederkehrender Quests + einmalige Quests mit Fälligkeit an diesem Tag. */
export function calendarDay(s: Snapshot, date: string): OccurrenceItem[] {
  const idx = new Map(s.instances.map((i) => [`${i.questId}|${i.occurrenceKey}`, i]));
  const out: OccurrenceItem[] = [];
  for (const q of s.quests) {
    if (q.status === "archiviert" || q.status === "pausiert") continue;
    if (q.recurrence) {
      for (const o of occurrencesOn(q.recurrence, date)) {
        const inst = idx.get(`${q.id}|${o.key}`) ?? null;
        out.push({ quest: q, key: o.key, date, time: o.time, dueAt: occurrenceDueAt(date, o.time), status: inst?.status ?? "offen", instance: inst });
      }
    } else if (q.dueAt && localDateOf(q.dueAt) === date) {
      const inst = idx.get(`${q.id}|${ONCE_KEY}`) ?? null;
      out.push({ quest: q, key: ONCE_KEY, date, time: new Date(q.dueAt).toTimeString().slice(0, 5), dueAt: q.dueAt, status: q.status === "erledigt" ? "erledigt" : inst?.status ?? "offen", instance: inst });
    }
  }
  return out.sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
}

/** Spieltag (JJJJ-MM-TT) eines ISO-Zeitpunkts – Tageswechsel um 04:00. */
export const localDateOf = (iso: string): string => gameDateOf(iso);

/** Monatsraster (Mo–So) mit Anzahl offener/erledigter Termine je Tag. */
export function calendarMonth(s: Snapshot, year: number, month: number) {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const startOffset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<{ date: string; inMonth: boolean; open: number; done: number }> = [];
  const gridStart = addDays(first, -startOffset);
  const total = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  for (let i = 0; i < total; i++) {
    const date = addDays(gridStart, i);
    const items = calendarDay(s, date);
    cells.push({
      date,
      inMonth: date.slice(0, 7) === first.slice(0, 7),
      open: items.filter((x) => x.status === "offen" || x.status === "verpasst").length,
      done: items.filter((x) => x.status === "erledigt" || x.status === "entschuldigt").length,
    });
  }
  return cells;
}
