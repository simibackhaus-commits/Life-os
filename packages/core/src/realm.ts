import { gameDateOf } from "./dates.ts";
import { ATTRIBUTE_CURVE, levelFromXp } from "./leveling.ts";
import type { Attribute, Character, GameEvent, Quest, QuestInstance } from "./schemas.ts";
import type { AchievementStatus } from "./achievements.ts";

/**
 * Lebendige Spielwelt: Hauptquartier, Story, Saison-Events, Jahresrückblick.
 * Alles wird aus vorhandenen Daten berechnet – keine eigene Speicherung, keine Spielwirkung.
 */

// ───────────── Hauptquartier ─────────────

export const ROOM_TIERS = [
  { name: "Ruine", minLevel: 1 },
  { name: "Einfach", minLevel: 2 },
  { name: "Ausgebaut", minLevel: 4 },
  { name: "Prachtvoll", minLevel: 7 },
  { name: "Legendär", minLevel: 10 },
] as const;

export interface RoomDef {
  id: string;
  name: string;
  attribute: Attribute;
  /** Ein Symbol je Ausbaustufe (Ruine → Legendär) */
  icons: [string, string, string, string, string];
  flavor: string;
}

export const ROOMS: RoomDef[] = [
  { id: "halle", name: "Trainingshalle", attribute: "staerke", icons: ["🪨", "🏋️", "💪", "🏟️", "⚡"], flavor: "Hier wird Kraft geschmiedet." },
  { id: "laufbahn", name: "Laufbahn", attribute: "ausdauer", icons: ["🪨", "👟", "🏃", "🛤️", "🌠"], flavor: "Jede Runde zählt." },
  { id: "bibliothek", name: "Bibliothek", attribute: "intelligenz", icons: ["🪨", "📖", "📚", "🏛️", "🔮"], flavor: "Wissen ist die mächtigste Waffe." },
  { id: "kommando", name: "Kommandozentrale", attribute: "karriere", icons: ["🪨", "🗂️", "💼", "🖥️", "🛰️"], flavor: "Von hier aus wird das Reich geführt." },
  { id: "schatzkammer", name: "Schatzkammer", attribute: "finanzen", icons: ["🪨", "🪙", "💰", "🏦", "💎"], flavor: "Jede Münze ein Baustein." },
  { id: "heilhaus", name: "Heilhaus", attribute: "gesundheit", icons: ["🪨", "🌿", "🧘", "⛲", "✨"], flavor: "Ein gesunder Held ist ein starker Held." },
  { id: "taverne", name: "Taverne", attribute: "soziales", icons: ["🪨", "🍵", "🍻", "🎪", "🎉"], flavor: "Gemeinsam ist jede Quest leichter." },
  { id: "werkstatt", name: "Werkstatt", attribute: "ordnung", icons: ["🪨", "🧹", "🧰", "⚙️", "🏗️"], flavor: "Ordnung schafft Freiraum." },
  { id: "wachturm", name: "Wachturm", attribute: "disziplin", icons: ["🪨", "🕯️", "🗼", "🏰", "👁️"], flavor: "Disziplin hält die Mauern aufrecht." },
  { id: "schrein", name: "Schrein des Willens", attribute: "willenskraft", icons: ["🪨", "🔥", "⛩️", "🌋", "☀️"], flavor: "Hier brennt die innere Flamme." },
];

export interface RoomState {
  room: RoomDef;
  level: number;
  tierIndex: number;
  tier: string;
  icon: string;
  /** Attribut-Level bis zur nächsten Ausbaustufe, null bei Maximum */
  nextAt: number | null;
}

export function headquarters(character: Pick<Character, "attributeXp">): RoomState[] {
  return ROOMS.map((room) => {
    const level = levelFromXp(character.attributeXp?.[room.attribute] ?? 0, ATTRIBUTE_CURVE).level;
    const tierIndex = ROOM_TIERS.reduce((acc, t, i) => (level >= t.minLevel ? i : acc), 0);
    const next = ROOM_TIERS[tierIndex + 1];
    return { room, level, tierIndex, tier: ROOM_TIERS[tierIndex]!.name, icon: room.icons[tierIndex]!, nextAt: next ? next.minLevel : null };
  });
}

/** Stufe des gesamten Hauptquartiers: Summe der Raumstufen → Burgtitel. */
export function headquartersRank(rooms: RoomState[]): { score: number; title: string; icon: string } {
  const score = rooms.reduce((s, r) => s + r.tierIndex, 0); // 0 … 40
  const ranks: Array<[number, string, string]> = [
    [0, "Lagerfeuer", "🔥"],
    [5, "Hütte", "🛖"],
    [12, "Gehöft", "🏡"],
    [20, "Festung", "🏯"],
    [30, "Zitadelle", "🏰"],
    [38, "Himmelsburg", "🌌"],
  ];
  const [, title, icon] = ranks.reduce((acc, r) => (score >= r[0] ? r : acc), ranks[0]!);
  return { score, title, icon };
}

/** Trophäen im HQ: freigeschaltete Achievements. */
export function trophies(achievements: AchievementStatus[]) {
  return achievements.filter((a) => a.unlocked).map((a) => ({ icon: a.def.icon, title: a.def.title, tier: a.def.tier }));
}

// ───────────── Story ─────────────

export interface Chapter {
  number: number;
  level: number;
  title: string;
  text: (c: Pick<Character, "name" | "className">) => string;
}

export const CHAPTERS: Chapter[] = [
  { number: 1, level: 1, title: "Das Erwachen", text: (c) => `${c.name} erwacht in einer Welt, die sich anfühlt wie die eigene – nur klarer. Jede Gewohnheit ist ein Pfad, jede Aufgabe ein Tor. Eine Stimme flüstert: „Dein Leben ist das größte Abenteuer. Beginne mit einem Schritt.“` },
  { number: 2, level: 3, title: "Der erste Funke", text: (c) => `Die ersten Quests sind geschafft. ${c.name} spürt, wie aus Pflicht langsam Rhythmus wird. Am Lagerfeuer des Hauptquartiers glimmt ein Funke: Beständigkeit.` },
  { number: 3, level: 5, title: "Die Wahl der Klasse", text: (c) => `Als ${c.className} hat ${c.name} einen eigenen Weg gewählt. Doch jede Klasse wird an ihren Taten gemessen – nicht an ihrem Namen. Die Räume des Hauptquartiers beginnen zu wachsen.` },
  { number: 4, level: 8, title: "Der Drache der Prokrastination", text: (c) => `Ein Schatten legt sich über das Reich: der Drache der Prokrastination. Er nährt sich von „Morgen“. ${c.name} weiß nun: Er fällt nicht in einem Schlag, sondern Treffer um Treffer – Teilaufgabe um Teilaufgabe.` },
  { number: 5, level: 12, title: "Die Bibliothek der Möglichkeiten", text: (c) => `In der Bibliothek findet ${c.name} alte Karten. Sie zeigen keine Länder, sondern Fähigkeiten. Jeder Skillpunkt öffnet einen neuen Gang. Wissen wird zu Werkzeug.` },
  { number: 6, level: 16, title: "Der Rat der Gefährten", text: (c) => `Kein Held besteht allein. ${c.name} erkennt, dass Freunde, Familie und Team Teil jeder großen Quest sind. In der Taverne wird gelacht, geplant und Kraft getankt.` },
  { number: 7, level: 20, title: "Die Prüfung des Gerichts", text: (c) => `Vor dem Court of Life wird nicht Perfektion verlangt, sondern Ehrlichkeit. ${c.name} lernt, Fehler anzuerkennen, ohne sich selbst zu verurteilen – und Regeneration als Stärke zu sehen.` },
  { number: 8, level: 25, title: "Veteran des Alltags", text: (c) => `Was einst Überwindung war, ist heute Selbstverständlichkeit. ${c.name} wird von anderen um Rat gefragt. Die Festung steht – doch die Karte zeigt noch weiße Flecken.` },
  { number: 9, level: 30, title: "Die Himmelsleiter", text: (c) => `Neue Ziele erscheinen am Horizont, größer als je zuvor. ${c.name} weiß: Legendäre Quests entstehen nicht aus Mut allein, sondern aus tausend kleinen erledigten Tagen.` },
  { number: 10, level: 40, title: "Meister seiner selbst", text: (c) => `${c.name} hat gelernt, dass das wahre Endgegner-Level im eigenen Kopf liegt. Disziplin ist keine Kette mehr, sondern Freiheit.` },
  { number: 11, level: 50, title: "Legende", text: (c) => `Lieder werden über ${c.name} gesungen – nicht wegen eines einzigen Sieges, sondern wegen der Treue zu sich selbst. Und doch: Die Geschichte ist nicht zu Ende. Sie wird jeden Tag neu geschrieben.` },
];

export function storyProgress(level: number) {
  const unlocked = CHAPTERS.filter((c) => level >= c.level);
  const next = CHAPTERS.find((c) => level < c.level) ?? null;
  return { unlocked, next };
}

// ───────────── Saison-Events ─────────────

export interface SeasonData {
  quests: Quest[];
  instances: QuestInstance[];
  events: GameEvent[];
  workouts: Array<{ date: string }>;
  focusSessions: Array<{ status: string; startedAt: string }>;
  financeEntries: Array<{ kind: string; amount: number; date: string }>;
}

export interface SeasonEventDef {
  month: number; // 1–12
  title: string;
  icon: string;
  description: string;
  target: number;
  unit: string;
  /** Fortschritt im angegebenen Monat (JJJJ-MM) */
  measure: (d: SeasonData, month: string) => number;
}

const completionsIn = (d: SeasonData, month: string, filter?: (q: Quest) => boolean) => {
  const byId = new Map(d.quests.map((q) => [q.id, q]));
  return d.instances.filter((i) => {
    if (i.status !== "erledigt" || !i.completedAt) return false;
    if (localMonth(i.completedAt) !== month) return false;
    const q = byId.get(i.questId);
    return filter ? !!q && filter(q) : true;
  }).length;
};
const hasAttr = (a: Attribute) => (q: Quest) => q.attributes.includes(a);
/** Monat des Spieltags (Tageswechsel um 04:00). */
const localMonth = (iso: string) => gameDateOf(iso).slice(0, 7);

export const SEASON_EVENTS: SeasonEventDef[] = [
  { month: 1, title: "Vorsätze der Eisfeste", icon: "❄️", description: "Starte das Jahr stark: Schließe 30 Quests ab.", target: 30, unit: "Quests", measure: (d, m) => completionsIn(d, m) },
  { month: 2, title: "Fest der Verbundenheit", icon: "💌", description: "Pflege Beziehungen: 6 Quests mit Soziales.", target: 6, unit: "soziale Quests", measure: (d, m) => completionsIn(d, m, hasAttr("soziales")) },
  { month: 3, title: "Großer Frühjahrsputz", icon: "🧹", description: "Schaffe Ordnung: 10 Quests mit Ordnung.", target: 10, unit: "Ordnungs-Quests", measure: (d, m) => completionsIn(d, m, hasAttr("ordnung")) },
  { month: 4, title: "Erwachen der Kräfte", icon: "🌱", description: "10 Trainings im April.", target: 10, unit: "Trainings", measure: (d, m) => d.workouts.filter((w) => w.date.startsWith(m)).length },
  { month: 5, title: "Mai der Gesundheit", icon: "🌿", description: "15 Quests mit Gesundheit.", target: 15, unit: "Gesundheits-Quests", measure: (d, m) => completionsIn(d, m, hasAttr("gesundheit")) },
  { month: 6, title: "Sonnwend-Ausdauer", icon: "☀️", description: "12 Trainings bis zur längsten Nacht.", target: 12, unit: "Trainings", measure: (d, m) => d.workouts.filter((w) => w.date.startsWith(m)).length },
  { month: 7, title: "Sommer der Weisheit", icon: "📚", description: "8 Fokus-Dungeons bezwingen.", target: 8, unit: "Dungeons", measure: (d, m) => d.focusSessions.filter((f) => f.status === "geschafft" && localMonth(f.startedAt) === m).length },
  { month: 8, title: "Schatzsucher-Sommer", icon: "💰", description: "Lege 300 € auf deine Sparziele.", target: 300, unit: "€ gespart", measure: (d, m) => d.financeEntries.filter((e) => e.kind === "einzahlung" && e.date.startsWith(m)).reduce((s, e) => s + e.amount, 0) },
  { month: 9, title: "Erntezeit der Karriere", icon: "🌾", description: "12 Quests mit Karriere.", target: 12, unit: "Karriere-Quests", measure: (d, m) => completionsIn(d, m, hasAttr("karriere")) },
  { month: 10, title: "Herbststurm", icon: "🍂", description: "Trotze dem Wetter: 8 Trainings.", target: 8, unit: "Trainings", measure: (d, m) => d.workouts.filter((w) => w.date.startsWith(m)).length },
  { month: 11, title: "Nebel-Fokus", icon: "🌫️", description: "Wenn die Tage kurz werden: 10 Fokus-Dungeons.", target: 10, unit: "Dungeons", measure: (d, m) => d.focusSessions.filter((f) => f.status === "geschafft" && localMonth(f.startedAt) === m).length },
  { month: 12, title: "Jahresfinale", icon: "🎆", description: "Beende das Jahr würdig: 25 Quests.", target: 25, unit: "Quests", measure: (d, m) => completionsIn(d, m) },
];

export interface SeasonStatus {
  def: SeasonEventDef;
  month: string;
  current: number;
  progress: number;
  completed: boolean;
  daysLeft: number;
}

export function seasonEvent(d: SeasonData, today: string): SeasonStatus {
  const month = today.slice(0, 7);
  const def = SEASON_EVENTS[Number(today.slice(5, 7)) - 1]!;
  const current = Math.round(def.measure(d, month) * 100) / 100;
  const [y, mo] = month.split("-").map(Number) as [number, number];
  const daysLeft = new Date(y, mo, 0).getDate() - Number(today.slice(8, 10));
  return { def, month, current, progress: Math.min(1, current / def.target), completed: current >= def.target, daysLeft };
}

/** Vergangene Monate des laufenden Jahres: geschafft oder nicht (soweit Daten vorhanden). */
export function seasonHistory(d: SeasonData, today: string): SeasonStatus[] {
  const year = today.slice(0, 4);
  const current = Number(today.slice(5, 7));
  return SEASON_EVENTS.filter((e) => e.month < current).map((def) => {
    const month = `${year}-${String(def.month).padStart(2, "0")}`;
    const value = Math.round(def.measure(d, month) * 100) / 100;
    return { def, month, current: value, progress: Math.min(1, value / def.target), completed: value >= def.target, daysLeft: 0 };
  });
}

// ───────────── Jahresrückblick ─────────────

export function yearReview(d: SeasonData, year: string) {
  const inYear = (iso: string) => localMonth(iso).startsWith(year);
  const done = d.instances.filter((i) => i.status === "erledigt" && i.completedAt && inYear(i.completedAt));
  const byMonth = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, count: 0 }));
  for (const i of done) byMonth[Number(gameDateOf(i.completedAt!).slice(5, 7)) - 1]!.count++;
  const best = byMonth.reduce((a, b) => (b.count > a.count ? b : a), byMonth[0]!);
  const quests = new Map(d.quests.map((q) => [q.id, q]));
  const counts = new Map<string, number>();
  for (const i of done) counts.set(i.questId, (counts.get(i.questId) ?? 0) + 1);
  const topQuests = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, n]) => ({ title: quests.get(id)?.title ?? "–", count: n }));
  const xp = d.events.filter((e) => inYear(e.createdAt)).reduce((s, e) => s + Math.max(0, e.xpDelta), 0);
  return {
    year,
    completions: done.length,
    xp,
    workouts: d.workouts.filter((w) => w.date.startsWith(year)).length,
    dungeons: d.focusSessions.filter((f) => f.status === "geschafft" && inYear(f.startedAt)).length,
    saved: d.financeEntries.filter((e) => e.kind === "einzahlung" && e.date.startsWith(year)).reduce((s, e) => s + e.amount, 0),
    bestMonth: best.count ? best.month : null,
    byMonth,
    topQuests,
  };
}
