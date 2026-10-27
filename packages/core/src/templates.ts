import type { QuestDraftInput, RecurrenceRule } from "./schemas.ts";

/**
 * Vorlagenpakete: fertige Quest-Sammlungen, die der Spieler in einer Vorschau auswählt und anlegt.
 * Wochentage: 1 = Montag … 7 = Sonntag.
 */

export interface TemplateGroup {
  name: string;
  icon: string;
  quests: QuestDraftInput[];
}

export interface TemplatePack {
  id: string;
  title: string;
  description: string;
  groups: (startDate: string) => TemplateGroup[];
}

const daily = (startDate: string, times?: string[]): RecurrenceRule => ({ freq: "daily", interval: 1, startDate, ...(times ? { times } : {}) });
const weekly = (startDate: string, byWeekday: number[], times?: string[], interval = 1): RecurrenceRule => ({ freq: "weekly", interval, byWeekday, startDate, ...(times ? { times } : {}) });
const monthly = (startDate: string, byMonthDay: number[]): RecurrenceRule => ({ freq: "monthly", interval: 1, byMonthDay, startDate });

const WERKTAGE = [1, 2, 3, 4, 5];

export const TEMPLATE_PACKS: TemplatePack[] = [
  {
    id: "alltag-athlet",
    title: "Alltag & Training",
    description: "Gym Mo/Di/Do/Fr, Easy Run Mo, Quality Run Mi, Long Run Fr – plus Körperpflege, Haushalt, Gesundheit, Organisation, Finanzen und Soziales.",
    groups: (s) => [
      {
        name: "Training",
        icon: "🏋️",
        quests: [
          {
            title: "Gym: Krafttraining",
            description: "Aufwärmen, Hauptübungen, Gewichte im Fitness-Modul notieren.",
            type: "weekly",
            category: "sport",
            difficulty: "schwer",
            priority: 5,
            attributes: ["staerke", "disziplin"],
            estimatedMinutes: 75,
            mandatory: true,
            recurrence: weekly(s, [1, 2, 4, 5]),
          },
          {
            title: "Easy Run (locker, Zone 2)",
            description: "Ruhiges Tempo, du kannst dich noch unterhalten.",
            type: "weekly",
            category: "sport",
            difficulty: "mittel",
            priority: 4,
            attributes: ["ausdauer", "gesundheit"],
            estimatedMinutes: 40,
            mandatory: true,
            recurrence: weekly(s, [1]),
          },
          {
            title: "Quality Run (Intervalle / Tempo)",
            description: "Einlaufen, Intervall- oder Tempoblock, Auslaufen.",
            type: "weekly",
            category: "sport",
            difficulty: "schwer",
            priority: 5,
            attributes: ["ausdauer", "willenskraft"],
            estimatedMinutes: 60,
            mandatory: true,
            recurrence: weekly(s, [3]),
          },
          {
            title: "Long Run",
            description: "Lange, ruhige Einheit. Trinken und Verpflegung mitnehmen.",
            type: "weekly",
            category: "sport",
            difficulty: "schwer",
            priority: 5,
            attributes: ["ausdauer", "willenskraft"],
            estimatedMinutes: 90,
            mandatory: true,
            recurrence: weekly(s, [5]),
          },
          {
            title: "Mobilität & Dehnen (10 min)",
            type: "daily",
            category: "sport",
            difficulty: "leicht",
            attributes: ["gesundheit"],
            estimatedMinutes: 10,
            recurrence: daily(s, ["20:30"]),
          },
          {
            title: "Faszienrolle nach dem Long Run",
            type: "weekly",
            category: "sport",
            difficulty: "trivial",
            attributes: ["gesundheit"],
            estimatedMinutes: 10,
            recurrence: weekly(s, [5]),
          },
          {
            title: "Aktive Regeneration: Spaziergang (30 min)",
            type: "weekly",
            category: "sport",
            difficulty: "leicht",
            attributes: ["gesundheit", "ausdauer"],
            estimatedMinutes: 30,
            recurrence: weekly(s, [6, 7]),
          },
          {
            title: "Trainingswoche planen & Wochenkilometer prüfen",
            type: "weekly",
            category: "sport",
            difficulty: "leicht",
            attributes: ["ausdauer", "ordnung"],
            estimatedMinutes: 15,
            recurrence: weekly(s, [7], ["17:30"]),
          },
          {
            title: "Gym-Tasche packen",
            type: "weekly",
            category: "sport",
            difficulty: "trivial",
            attributes: ["ordnung"],
            estimatedMinutes: 5,
            recurrence: weekly(s, [7, 1, 3, 4], ["21:00"]),
          },
        ],
      },
      {
        name: "Körperpflege",
        icon: "🪥",
        quests: [
          { title: "Zähne putzen", type: "daily", category: "gesundheit", difficulty: "trivial", attributes: ["gesundheit", "disziplin"], estimatedMinutes: 3, mandatory: true, recurrence: daily(s, ["07:00", "22:00"]) },
          { title: "Zahnseide", type: "daily", category: "gesundheit", difficulty: "trivial", attributes: ["gesundheit"], estimatedMinutes: 2, recurrence: daily(s, ["22:00"]) },
          { title: "Duschen", type: "daily", category: "gesundheit", difficulty: "trivial", attributes: ["gesundheit"], estimatedMinutes: 10, recurrence: daily(s) },
          { title: "Hautpflege (eincremen)", type: "daily", category: "gesundheit", difficulty: "trivial", attributes: ["gesundheit"], estimatedMinutes: 2, recurrence: daily(s, ["07:15"]) },
          { title: "Rasieren", type: "weekly", category: "gesundheit", difficulty: "trivial", attributes: ["gesundheit", "ordnung"], estimatedMinutes: 10, recurrence: weekly(s, [1, 3, 5]) },
          { title: "Nägel schneiden", type: "weekly", category: "gesundheit", difficulty: "trivial", attributes: ["gesundheit"], estimatedMinutes: 5, recurrence: weekly(s, [7]) },
          { title: "Friseurtermin vereinbaren", type: "side", category: "gesundheit", difficulty: "leicht", attributes: ["ordnung", "soziales"], recurrence: monthly(s, [1]) },
        ],
      },
      {
        name: "Gesundheit & Schlaf",
        icon: "💧",
        quests: [
          { title: "2,5 Liter Wasser trinken", type: "daily", category: "gesundheit", difficulty: "leicht", attributes: ["gesundheit", "disziplin"], recurrence: daily(s) },
          { title: "Vitamine / Supplements nehmen", type: "daily", category: "gesundheit", difficulty: "trivial", attributes: ["gesundheit"], recurrence: daily(s, ["08:00"]) },
          { title: "Proteinziel erreichen", type: "daily", category: "gesundheit", difficulty: "leicht", attributes: ["gesundheit", "staerke"], recurrence: daily(s) },
          { title: "Meditation (10 min)", type: "daily", category: "gesundheit", difficulty: "leicht", attributes: ["willenskraft", "gesundheit"], estimatedMinutes: 10, recurrence: daily(s, ["07:30"]) },
          { title: "Handy weg – 30 min vor dem Schlafen", type: "daily", category: "gesundheit", difficulty: "leicht", attributes: ["willenskraft"], recurrence: daily(s, ["22:30"]) },
          { title: "Um 23:00 im Bett", type: "daily", category: "gesundheit", difficulty: "leicht", attributes: ["gesundheit", "disziplin"], mandatory: true, recurrence: daily(s, ["23:00"]) },
          { title: "Gewicht notieren", type: "weekly", category: "gesundheit", difficulty: "trivial", attributes: ["gesundheit"], recurrence: weekly(s, [1], ["07:00"]) },
          { title: "Meal Prep für die Woche", type: "weekly", category: "gesundheit", difficulty: "mittel", attributes: ["gesundheit", "ordnung"], estimatedMinutes: 90, recurrence: weekly(s, [7]) },
        ],
      },
      {
        name: "Haushalt",
        icon: "🧹",
        quests: [
          { title: "Bett machen", type: "daily", category: "haushalt", difficulty: "trivial", attributes: ["ordnung", "disziplin"], estimatedMinutes: 2, recurrence: daily(s, ["07:05"]) },
          { title: "Stoßlüften", type: "daily", category: "haushalt", difficulty: "trivial", attributes: ["gesundheit"], estimatedMinutes: 5, recurrence: daily(s, ["07:10"]) },
          { title: "Spülmaschine ein- / ausräumen", type: "daily", category: "haushalt", difficulty: "trivial", attributes: ["ordnung"], estimatedMinutes: 10, recurrence: daily(s, ["20:00"]) },
          { title: "Wohnung aufräumen (10-Minuten-Reset)", type: "daily", category: "haushalt", difficulty: "leicht", attributes: ["ordnung"], estimatedMinutes: 10, recurrence: daily(s, ["21:30"]) },
          { title: "Staubsaugen", type: "weekly", category: "haushalt", difficulty: "leicht", attributes: ["ordnung"], estimatedMinutes: 30, recurrence: weekly(s, [3, 6]) },
          { title: "Böden wischen", type: "weekly", category: "haushalt", difficulty: "mittel", attributes: ["ordnung"], estimatedMinutes: 30, recurrence: weekly(s, [6]) },
          { title: "Bad putzen (WC, Waschbecken, Dusche, Spiegel)", type: "weekly", category: "haushalt", difficulty: "mittel", attributes: ["ordnung", "gesundheit"], estimatedMinutes: 40, recurrence: weekly(s, [6]) },
          { title: "Küche putzen (Herd, Arbeitsflächen, Spüle)", type: "weekly", category: "haushalt", difficulty: "mittel", attributes: ["ordnung"], estimatedMinutes: 30, recurrence: weekly(s, [4]) },
          { title: "Wäsche waschen, aufhängen & zusammenlegen", type: "weekly", category: "haushalt", difficulty: "leicht", attributes: ["ordnung"], estimatedMinutes: 30, recurrence: weekly(s, [2, 6]) },
          { title: "Handtücher wechseln", type: "weekly", category: "haushalt", difficulty: "trivial", attributes: ["ordnung", "gesundheit"], recurrence: weekly(s, [3]) },
          { title: "Bettwäsche wechseln", type: "weekly", category: "haushalt", difficulty: "leicht", attributes: ["ordnung", "gesundheit"], estimatedMinutes: 15, recurrence: weekly(s, [6], undefined, 2) },
          { title: "Müll & Altpapier rausbringen", type: "weekly", category: "haushalt", difficulty: "trivial", attributes: ["ordnung"], estimatedMinutes: 5, recurrence: weekly(s, [1, 4]) },
          { title: "Kühlschrank ausmisten", type: "weekly", category: "haushalt", difficulty: "leicht", attributes: ["ordnung", "gesundheit"], estimatedMinutes: 10, recurrence: weekly(s, [7]) },
          { title: "Einkaufen (vorher Liste schreiben)", type: "weekly", category: "haushalt", difficulty: "leicht", attributes: ["ordnung", "finanzen"], estimatedMinutes: 45, recurrence: weekly(s, [6]) },
          { title: "Pflanzen gießen", type: "weekly", category: "haushalt", difficulty: "trivial", attributes: ["ordnung"], estimatedMinutes: 5, recurrence: weekly(s, [3, 7]) },
          { title: "Staub wischen", type: "weekly", category: "haushalt", difficulty: "leicht", attributes: ["ordnung"], estimatedMinutes: 20, recurrence: weekly(s, [7], undefined, 2) },
          { title: "Fenster putzen", type: "side", category: "haushalt", difficulty: "mittel", attributes: ["ordnung"], estimatedMinutes: 45, recurrence: monthly(s, [15]) },
        ],
      },
      {
        name: "Organisation & Kopf",
        icon: "🧠",
        quests: [
          { title: "Top 3 des Tages festlegen", type: "weekly", category: "business", difficulty: "trivial", attributes: ["ordnung", "karriere"], estimatedMinutes: 5, recurrence: weekly(s, WERKTAGE, ["07:45"]) },
          { title: "Posteingang abarbeiten", type: "weekly", category: "business", difficulty: "leicht", attributes: ["ordnung", "karriere"], estimatedMinutes: 20, recurrence: weekly(s, WERKTAGE, ["17:00"]) },
          { title: "Wochenreview: Was lief gut, was nicht?", type: "weekly", category: "business", difficulty: "leicht", attributes: ["willenskraft", "karriere"], estimatedMinutes: 15, recurrence: weekly(s, [5], ["18:00"]) },
          { title: "Kommende Woche planen", type: "weekly", category: "business", difficulty: "mittel", attributes: ["ordnung", "karriere"], estimatedMinutes: 30, mandatory: true, recurrence: weekly(s, [7], ["18:00"]) },
          { title: "Lesen (20 min)", type: "daily", category: "wissen", difficulty: "leicht", attributes: ["intelligenz"], estimatedMinutes: 20, recurrence: daily(s, ["21:45"]) },
          { title: "Tagesnotiz im Second Brain schreiben", type: "daily", category: "wissen", difficulty: "trivial", attributes: ["willenskraft", "intelligenz"], estimatedMinutes: 5, recurrence: daily(s, ["22:15"]) },
          { title: "Second Brain: Inbox leeren & Notizen einsortieren", type: "weekly", category: "wissen", difficulty: "leicht", attributes: ["ordnung", "intelligenz"], estimatedMinutes: 20, recurrence: weekly(s, [7]) },
        ],
      },
      {
        name: "Finanzen",
        icon: "💶",
        quests: [
          { title: "Ausgaben der Woche prüfen", type: "weekly", category: "finanzen", difficulty: "leicht", attributes: ["finanzen"], estimatedMinutes: 10, recurrence: weekly(s, [7]) },
          { title: "Budget & Sparrate des Monats prüfen", type: "side", category: "finanzen", difficulty: "leicht", attributes: ["finanzen", "disziplin"], estimatedMinutes: 20, recurrence: monthly(s, [1]) },
          { title: "Abos & Verträge prüfen", type: "side", category: "finanzen", difficulty: "leicht", attributes: ["finanzen", "ordnung"], estimatedMinutes: 15, recurrence: monthly(s, [15]) },
        ],
      },
      {
        name: "Soziales",
        icon: "🤝",
        quests: [
          { title: "Familie anrufen", type: "weekly", category: "soziales", difficulty: "leicht", attributes: ["soziales"], recurrence: weekly(s, [7]) },
          { title: "Zeit mit Freunden", type: "weekly", category: "soziales", difficulty: "leicht", attributes: ["soziales"], recurrence: weekly(s, [6]) },
          { title: "Jemandem eine nette Nachricht schreiben", type: "weekly", category: "soziales", difficulty: "trivial", attributes: ["soziales"], recurrence: weekly(s, [3]) },
        ],
      },
    ],
  },
];

/** Vorhandene Quests, die aus dem Paket stammen (gleicher Titel) und wiederkehrend sind. */
export function packQuestsIn<Q extends { title: string; recurrence: RecurrenceRule | null; status: string }>(pack: TemplatePack, quests: Q[]): Q[] {
  const titles = new Set(pack.groups("2000-01-01").flatMap((g) => g.quests.map((q) => q.title.trim().toLowerCase())));
  return quests.filter((q) => q.recurrence && (q.status === "aktiv" || q.status === "pausiert") && titles.has(q.title.trim().toLowerCase()));
}

/** Alle Quests eines Pakets, ohne Titel, die bereits als aktive/pausierte Quest existieren. */
export function newFromPack(pack: TemplatePack, startDate: string, existingTitles: Iterable<string>) {
  const existing = new Set([...existingTitles].map((t) => t.trim().toLowerCase()));
  return pack.groups(startDate).map((g) => ({
    ...g,
    quests: g.quests.map((q) => ({ quest: q, exists: existing.has(q.title.trim().toLowerCase()) })),
  }));
}
