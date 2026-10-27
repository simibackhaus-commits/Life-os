import { addDays, isoWeekday } from "./dates.ts";
import type { Attribute, QuestDraftInput, RecurrenceRule } from "./schemas.ts";

/**
 * Regelbasierter Offline-Parser für Quick-Add (deutsch).
 * Die KI (Edge Function "quick-add") liefert bessere Ergebnisse; dieser Parser ist der Fallback
 * ohne Netz/ohne Server und erzeugt immer nur einen bearbeitbaren Entwurf.
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

const CATEGORY_RULES: Array<{ re: RegExp; category: string; attributes: Attribute[] }> = [
  { re: /\b(lauf|jogg|rennen|km\b)/i, category: "sport", attributes: ["ausdauer", "gesundheit"] },
  { re: /\b(training|trainieren|gym|kraft|workout|fußball|fussball)/i, category: "sport", attributes: ["staerke", "disziplin"] },
  { re: /\b(spar|euro|€|geld|budget|finanz|rechnung)/i, category: "finanzen", attributes: ["finanzen", "disziplin"] },
  { re: /\b(arbeit|bestellung|meeting|projekt|kunde|präsentation|planen|arbeitswoche|büro)/i, category: "business", attributes: ["karriere", "ordnung"] },
  { re: /\b(lesen|lernen|buch|kurs|studier)/i, category: "wissen", attributes: ["intelligenz"] },
  { re: /\b(zähne|zahn|duschen|schlaf|wasser|arzt|meditier)/i, category: "gesundheit", attributes: ["gesundheit", "disziplin"] },
  { re: /\b(aufräum|putzen|wäsche|haushalt|einkauf)/i, category: "haushalt", attributes: ["ordnung"] },
  { re: /\b(freund|familie|anrufen|treffen|mama|papa)/i, category: "soziales", attributes: ["soziales"] },
];

export interface QuickAddResult {
  draft: QuestDraftInput;
  /** Was der Parser erkannt hat – wird in der Vorschau angezeigt. */
  notes: string[];
}

function cap(s: string): string {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function parseQuickAdd(text: string, today: string): QuickAddResult {
  const notes: string[] = [];
  const lower = text.toLowerCase();
  let rest = text;
  const strip = (re: RegExp) => (rest = rest.replace(re, " "));

  // Wochentage
  const days = Object.entries(WEEKDAYS)
    .filter(([name]) => new RegExp(`\\b${name}s?\\b`, "i").test(lower))
    .map(([, n]) => n)
    .sort((a, b) => a - b);

  let freq: RecurrenceRule["freq"] | null = null;
  if (/\b(täglich|jeden tag|jeden morgen|jeden abend|morgens und abends)\b/i.test(lower)) freq = "daily";
  else if (/\b(jeden|jede|immer)\b/i.test(lower) && days.length > 0) freq = "weekly";
  else if (/\b(wöchentlich|jede woche)\b/i.test(lower)) freq = "weekly";
  else if (/\b(monatlich|jeden monat)\b/i.test(lower)) freq = "monthly";

  // Uhrzeiten
  const times: string[] = [];
  const timeMatch = lower.match(/\bum (\d{1,2})(?::(\d{2}))?\s*(uhr)?/);
  if (timeMatch) {
    times.push(`${timeMatch[1]!.padStart(2, "0")}:${timeMatch[2] ?? "00"}`);
    strip(/\bum \d{1,2}(:\d{2})?\s*(uhr)?/i);
  }
  if (/\bmorgens\b|\bjeden morgen\b/.test(lower)) times.push("07:00");
  if (/\babends\b|\bjeden abend\b/.test(lower)) times.push("21:00");

  // Dauer
  let estimatedMinutes: number | null = null;
  const dur = lower.match(/(\d+)\s*(minuten|min\b|stunden?|std\b)/);
  if (dur) {
    const n = Number(dur[1]);
    estimatedMinutes = /^(stunde|std)/.test(dur[2]!) ? n * 60 : n;
    strip(/\d+\s*(minuten|min\b|stunden?|std\b)/i);
  }

  // Einmaliges Datum
  let date: string | null = null;
  if (/\bübermorgen\b/.test(lower)) date = addDays(today, 2);
  else if (/\bmorgen\b/.test(lower)) date = addDays(today, 1);
  else if (/\bheute\b/.test(lower)) date = today;
  else if (!freq && days.length === 1) {
    const diff = (days[0]! - isoWeekday(today) + 7) % 7 || 7;
    date = addDays(today, diff);
  }

  // Frist in Monaten/Wochen ("in drei Monaten")
  const NUMWORDS: Record<string, number> = { einem: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, zwölf: 12 };
  const inMatch = lower.match(/\bin (\d+|einem|einer|zwei|drei|vier|fünf|sechs|zwölf) (monat(en)?|wochen?|tag(en)?)\b/);
  if (inMatch && !date) {
    const n = Number(inMatch[1]) || NUMWORDS[inMatch[1]!] || 1;
    const unit = inMatch[2]!;
    date = addDays(today, unit.startsWith("monat") ? n * 30 : unit.startsWith("woche") ? n * 7 : n);
    strip(/\bin \S+ (monat(en)?|wochen?|tag(en)?)\b/i);
  }

  // Kategorie & Attribute
  let category = "allgemein";
  let attributes: Attribute[] = ["disziplin"];
  const hit = CATEGORY_RULES.find((r) => r.re.test(lower));
  if (hit) {
    category = hit.category;
    attributes = hit.attributes;
  }

  // Titel aus dem Rest bauen
  strip(/\b(jeden tag|jede woche|jeden monat|jeden morgen|jeden abend)\b/gi);
  strip(/\b(erinnere mich|ich muss|ich möchte|ich will|bitte|daran,?|jeden|jede|jedem|immer|täglich|wöchentlich|monatlich|und|am|um|uhr)\b/gi);
  strip(/\b(übermorgen|morgen|heute|morgens|abends)\b/gi);
  for (const name of Object.keys(WEEKDAYS)) strip(new RegExp(`\\b${name}s?\\b`, "gi"));
  strip(/[,.!]/g);
  const title = cap(rest.replace(/\s+/g, " ")) || cap(text);

  let recurrence: RecurrenceRule | null = null;
  if (freq) {
    recurrence = {
      freq,
      interval: 1,
      byWeekday: freq === "weekly" ? (days.length ? days : [isoWeekday(today)]) : undefined,
      times: times.length ? [...new Set(times)].sort() : undefined,
      startDate: today,
    };
    notes.push(`Wiederkehrend: ${freq}${days.length ? ` (Tage ${days.join(",")})` : ""}`);
  }
  let dueAt: string | null = null;
  if (!recurrence && date) {
    const t = times[0] ?? "23:59";
    dueAt = new Date(`${date}T${t}:00`).toISOString();
    notes.push(`Fällig: ${date} ${t}`);
  }
  if (estimatedMinutes) notes.push(`Dauer: ${estimatedMinutes} min`);
  notes.push(`Kategorie: ${category}`);

  const isGoal = /\b(spar|ziel|erreichen|abnehmen|marathon)/i.test(lower) && !recurrence;
  return {
    draft: {
      title,
      type: recurrence ? (freq === "daily" ? "daily" : "weekly") : isGoal ? "main" : "side",
      category,
      difficulty: isGoal ? "schwer" : estimatedMinutes && estimatedMinutes >= 45 ? "schwer" : "mittel",
      attributes,
      dueAt,
      recurrence,
      estimatedMinutes,
      mandatory: Boolean(recurrence),
    },
    notes,
  };
}
