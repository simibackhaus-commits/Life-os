import { addDays, isoWeekday } from "./dates.ts";
import type { Attribute, QuestDraftInput, QuestType, RecurrenceRule } from "./schemas.ts";

/**
 * Regelbasierter Offline-Parser für Quick-Add (deutsch).
 * Ohne KI erzeugt er den Entwurf allein; mit KI liefert detectSchedule() den Zeitplan,
 * weil Wochentage, Intervalle und Fristen deterministisch zuverlässiger erkannt werden als von kleinen Modellen.
 * Ergebnis ist immer nur ein bearbeitbarer Entwurf.
 */
const WEEKDAYS: Record<string, number> = {
  montag: 1,
  dienstag: 2,
  mittwoch: 3,
  donnerstag: 4,
  freitag: 5,
  samstag: 6,
  sonntag: 7,
};

const NUMWORDS: Record<string, number> = {
  ein: 1,
  eine: 1,
  einem: 1,
  einer: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  zwölf: 12,
  fünfzehn: 15,
  zwanzig: 20,
  dreißig: 30,
  vierzig: 40,
  fünfzig: 50,
  sechzig: 60,
  neunzig: 90,
};
const NUM = `(\\d+|${Object.keys(NUMWORDS).join("|")})`;
const toNum = (s: string) => Number(s) || NUMWORDS[s] || 1;
const ORDINALS: Record<string, number> = { zweiten: 2, dritten: 3, vierten: 4, fünften: 5 };

const CATEGORY_RULES: Array<{ re: RegExp; category: string; attributes: Attribute[] }> = [
  { re: /\b(lauf|jogg|rennen|km\b|marathon|halbmarathon)/i, category: "sport", attributes: ["ausdauer", "gesundheit"] },
  { re: /\b(training|trainieren|gym|kraft|workout|fußball|fussball)/i, category: "sport", attributes: ["staerke", "disziplin"] },
  { re: /\b(spar|euro|€|geld|budget|finanz|rechnung)/i, category: "finanzen", attributes: ["finanzen", "disziplin"] },
  { re: /\b(arbeit|schicht|bestellung|meeting|projekt|kunde|präsentation|planen|arbeitswoche|büro)/i, category: "business", attributes: ["karriere", "ordnung"] },
  { re: /\b(lesen|lernen|buch|kurs|studier)/i, category: "wissen", attributes: ["intelligenz"] },
  { re: /\b(zähne|zahn|duschen|schlaf|wasser|arzt|meditier|rasier)/i, category: "gesundheit", attributes: ["gesundheit", "disziplin"] },
  { re: /\b(aufräum|putzen|wäsche|haushalt|einkauf)/i, category: "haushalt", attributes: ["ordnung"] },
  { re: /\b(freund|familie|anrufen|treffen|mama|papa)/i, category: "soziales", attributes: ["soziales"] },
];

export interface QuickAddResult {
  draft: QuestDraftInput;
  /** Was der Parser erkannt hat – wird in der Vorschau angezeigt. */
  notes: string[];
}

export interface DetectedSchedule {
  freq: RecurrenceRule["freq"] | null;
  interval: number;
  byWeekday: number[];
  times: string[];
  /** Einmalige Fälligkeit (JJJJ-MM-TT), nur ohne Wiederholung */
  date: string | null;
  estimatedMinutes: number | null;
  /** Ausdrücklich genannter Questtyp („Hauptquest“, „Bosskampf“ …) */
  type: QuestType | null;
  notes: string[];
}

function cap(s: string): string {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Erkennt Wiederholung, Wochentage, Uhrzeiten, Fristen und Dauer in einem deutschen Satz. */
export function detectSchedule(text: string, today: string): DetectedSchedule {
  const lower = text.toLowerCase();
  const notes: string[] = [];

  // Wochentage („montags“, „am Montag“), Arbeitstage, Wochenende
  let days = Object.entries(WEEKDAYS)
    .filter(([name]) => new RegExp(`\\b${name}s?\\b`, "i").test(lower))
    .map(([, n]) => n);
  const plural = Object.keys(WEEKDAYS).some((name) => new RegExp(`\\b${name}s\\b`, "i").test(lower));
  const workdays = /\b(arbeitstag(en?)?|werktag(en?)?|wochentags|unter der woche|montags? bis freitags?)\b/.test(lower);
  const weekend = /\b(am )?wochenende\b/.test(lower) && !/\bnächste[sn]? wochenende\b/.test(lower);
  if (workdays) days = [1, 2, 3, 4, 5];
  if (weekend) days = [...days, 6, 7];
  days = [...new Set(days)].sort((a, b) => a - b);

  // Häufigkeit und Intervall
  let freq: RecurrenceRule["freq"] | null = null;
  let interval = 1;
  const every = lower.match(new RegExp(`\\balle ${NUM} (tage|wochen|monate)\\b`));
  const everyNth = lower.match(/\bjeden (zweiten|dritten|vierten|fünften) (tag|woche|monat)\b/);
  const perDay = lower.match(new RegExp(`\\b(zweimal|dreimal|${NUM} ?mal) (täglich|am tag|pro tag|jeden tag)\\b|\\b(jeden tag|täglich) (zweimal|dreimal)\\b`));
  if (every) {
    interval = toNum(every[1]!);
    freq = every[2] === "tage" ? "daily" : every[2] === "wochen" ? "weekly" : "monthly";
  } else if (everyNth) {
    interval = ORDINALS[everyNth[1]!] ?? 2;
    freq = everyNth[2] === "tag" ? "daily" : everyNth[2] === "woche" ? "weekly" : "monthly";
  } else if (days.length > 0 && (plural || workdays || /\b(jeden|jede|immer|wöchentlich)\b/.test(lower))) freq = "weekly";
  else if (perDay || /\b(täglich|jeden tag|jeden morgen|jeden abend|morgens und abends)\b/.test(lower)) freq = "daily";
  else if (/\b(wöchentlich|jede woche|einmal pro woche)\b/.test(lower)) freq = "weekly";
  else if (/\b(monatlich|jeden monat)\b/.test(lower)) freq = "monthly";
  if (freq === "weekly" && days.length === 0) days = [isoWeekday(today)];

  // Uhrzeiten
  const times: string[] = [];
  for (const m of lower.matchAll(/\b(?:um |ab |gegen )(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?|\b(\d{1,2})[:.](\d{2})\s*uhr\b|\b(\d{1,2}):(\d{2})\b/g)) {
    const h = Number(m[1] ?? m[3] ?? m[5]);
    const min = Number(m[2] ?? m[4] ?? m[6] ?? 0);
    if (h <= 23 && min <= 59) times.push(`${pad(h)}:${pad(min)}`);
  }
  if (/\bmorgens\b|\bjeden morgen\b/.test(lower)) times.push("07:00");
  if (/\babends\b|\bjeden abend\b/.test(lower)) times.push("21:00");
  if (times.length === 0 && perDay) {
    const n = /drei/.test(perDay[0]!) ? 3 : 2;
    times.push(...(n === 3 ? ["07:00", "13:00", "21:00"] : ["07:00", "21:00"]));
    notes.push(`${n}× täglich – Uhrzeiten angenommen, bitte anpassen`);
  }

  // Dauer
  let estimatedMinutes: number | null = null;
  const dur = lower.match(new RegExp(`${NUM}\\s*(minuten|min\\b|stunden?|std\\b)`));
  if (dur) {
    const n = toNum(dur[1]!);
    estimatedMinutes = /^(stunde|std)/.test(dur[2]!) ? n * 60 : n;
  }
  if (/\bvor (schichtbeginn|arbeitsbeginn|dienstbeginn)\b/.test(lower)) estimatedMinutes = null; // „zehn Minuten vor …“ ist keine Dauer

  // Einmaliges Datum / Frist
  let date: string | null = null;
  const year = Number(today.slice(0, 4));
  const dm = lower.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/);
  if (/\bübermorgen\b/.test(lower)) date = addDays(today, 2);
  else if (/\bmorgen\b/.test(lower) && !/\bjeden morgen\b/.test(lower)) date = addDays(today, 1);
  else if (/\bheute\b/.test(lower)) date = today;
  else if (/\b(ende des jahres|jahresende|bis silvester|ende \d{4})\b/.test(lower)) date = `${lower.match(/ende (\d{4})/)?.[1] ?? year}-12-31`;
  else if (/\b(ende des monats|monatsende)\b/.test(lower)) {
    const d = new Date(`${today}T12:00:00`);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    date = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
  } else if (dm) {
    const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : year;
    let cand = `${y}-${pad(Number(dm[2]))}-${pad(Number(dm[1]))}`;
    if (!dm[3] && cand < today) cand = `${y + 1}${cand.slice(4)}`;
    date = cand;
  } else if (!freq && days.length === 1) {
    const diff = (days[0]! - isoWeekday(today) + 7) % 7 || 7;
    date = addDays(today, diff);
  }
  const inMatch = lower.match(new RegExp(`\\bin ${NUM} (monat(en)?|wochen?|tag(en)?)\\b`));
  if (inMatch && !date) {
    const n = toNum(inMatch[1]!);
    const unit = inMatch[2]!;
    date = addDays(today, unit.startsWith("monat") ? n * 30 : unit.startsWith("woche") ? n * 7 : n);
  }
  if (freq) date = null;

  // Ausdrücklicher Questtyp
  const type: QuestType | null = /\bhauptquest\b/.test(lower)
    ? "main"
    : /\b(epische quest|epic quest|epos)\b/.test(lower)
      ? "epic"
      : /\blegendäre quest\b/.test(lower)
        ? "legendary"
        : /\bbosskampf|boss\b/.test(lower)
          ? "boss"
          : /\bnebenquest\b/.test(lower)
            ? "side"
            : null;

  if (freq) notes.push(`Wiederkehrend: ${freq}${interval > 1 ? ` alle ${interval}` : ""}${freq === "weekly" ? ` (Tage ${days.join(",")})` : ""}`);
  if (date) notes.push(`Fällig: ${date}${times[0] ? ` ${times[0]}` : ""}`);
  return { freq, interval, byWeekday: freq === "weekly" ? days : [], times: [...new Set(times)].sort(), date, estimatedMinutes, type, notes };
}

/** Wandelt erkannte Zeitangaben in Wiederholungsregel bzw. Fälligkeit um. */
export function scheduleToDraft(s: DetectedSchedule, today: string): Pick<QuestDraftInput, "recurrence" | "dueAt"> {
  if (s.freq) {
    return {
      dueAt: null,
      recurrence: {
        freq: s.freq,
        interval: s.interval,
        byWeekday: s.freq === "weekly" ? s.byWeekday : undefined,
        times: s.times.length ? s.times : undefined,
        startDate: today,
      },
    };
  }
  if (s.date) return { recurrence: null, dueAt: new Date(`${s.date}T${s.times[0] ?? "23:59"}:00`).toISOString() };
  return { recurrence: null, dueAt: null };
}

export function parseQuickAdd(text: string, today: string): QuickAddResult {
  const lower = text.toLowerCase();
  const s = detectSchedule(text, today);
  const notes = [...s.notes];
  let rest = text;
  const strip = (re: RegExp) => (rest = rest.replace(re, " "));

  // Kategorie & Attribute
  let category = "allgemein";
  let attributes: Attribute[] = ["disziplin"];
  const hit = CATEGORY_RULES.find((r) => r.re.test(lower));
  if (hit) {
    category = hit.category;
    attributes = hit.attributes;
  }

  // Titel aus dem Rest bauen
  strip(/\b(erstelle|lege) (mir )?(eine )?(hauptquest|nebenquest|quest|epische quest)( für)?\b/gi);
  strip(new RegExp(`\\balle ${NUM} (tage|wochen|monate)\\b`, "gi"));
  strip(/\bjeden (zweiten|dritten|vierten|fünften) (tag|woche|monat)\b/gi);
  strip(/\b(jeden tag|jede woche|jeden monat|jeden morgen|jeden abend|jeden arbeitstag|jeden werktag|unter der woche|am wochenende)\b/gi);
  strip(/\b(bis )?(ende des jahres|jahresende|ende des monats|monatsende)\b/gi);
  strip(new RegExp(`\\bin ${NUM} (monat(en)?|wochen?|tag(en)?)\\b`, "gi"));
  strip(new RegExp(`\\b${NUM}\\s*(minuten|min\\b|stunden?|std\\b)(?! vor)`, "gi"));
  strip(/\b(?:um |ab |gegen )\d{1,2}([:.]\d{2})?\s*(uhr)?|\b\d{1,2}:\d{2}\b/gi);
  strip(/\b(erinnere mich|ich muss|ich möchte|ich will|bitte|daran,?|jeden|jede|jedem|immer|täglich|wöchentlich|monatlich|zweimal|dreimal|und|am|um|uhr|meinen|meine)\b/gi);
  strip(/\b(übermorgen|morgen|heute|morgens|abends|arbeitstage?|werktage?|wochentags)\b/gi);
  for (const name of Object.keys(WEEKDAYS)) strip(new RegExp(`\\b${name}s?\\b`, "gi"));
  strip(/[,.!]/g);
  const title = cap(rest.replace(/\s+/g, " ")) || cap(text);

  const { recurrence, dueAt } = scheduleToDraft(s, today);
  if (s.estimatedMinutes) notes.push(`Dauer: ${s.estimatedMinutes} min`);
  notes.push(`Kategorie: ${category}`);

  const isGoal = /\b(spar|ziel|erreichen|abnehmen|marathon)/i.test(lower) && !recurrence;
  const type: QuestType = s.type ?? (recurrence ? (recurrence.freq === "daily" ? "daily" : "weekly") : isGoal ? "main" : "side");
  return {
    draft: {
      title,
      type,
      category,
      difficulty: isGoal || type === "main" ? "schwer" : s.estimatedMinutes && s.estimatedMinutes >= 45 ? "schwer" : "mittel",
      attributes,
      dueAt,
      recurrence,
      estimatedMinutes: s.estimatedMinutes,
      mandatory: Boolean(recurrence),
    },
    notes,
  };
}
