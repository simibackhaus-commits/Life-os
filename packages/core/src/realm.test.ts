import { describe, expect, it } from "vitest";
import { CHAPTERS, QuestDraftSchema, SEASON_EVENTS, headquarters, headquartersRank, seasonEvent, seasonHistory, storyProgress, yearReview, type Quest, type SeasonData } from "./index.ts";

const empty: SeasonData = { quests: [], instances: [], events: [], workouts: [], focusSessions: [], financeEntries: [] };

describe("Hauptquartier", () => {
  it("Räume wachsen mit dem Attribut-Level", () => {
    const rooms = headquarters({ attributeXp: { ausdauer: 1000 } });
    const lauf = rooms.find((r) => r.room.attribute === "ausdauer")!;
    expect(lauf.level).toBe(5);
    expect(lauf.tier).toBe("Ausgebaut");
    expect(lauf.nextAt).toBe(7);
    expect(rooms.find((r) => r.room.attribute === "finanzen")!.tier).toBe("Ruine");
    expect(headquartersRank(rooms)).toEqual({ score: 2, title: "Lagerfeuer", icon: "🔥" });
  });
});

describe("Story", () => {
  it("Kapitel schalten mit dem Level frei", () => {
    expect(storyProgress(1).unlocked.map((c) => c.number)).toEqual([1]);
    const p = storyProgress(9);
    expect(p.unlocked).toHaveLength(4);
    expect(p.next?.level).toBe(12);
    expect(CHAPTERS[0]!.text({ name: "Simi", className: "Paladin" })).toContain("Simi");
  });
});

describe("Saison-Events", () => {
  it("jeder Monat hat ein Event", () => {
    expect(SEASON_EVENTS.map((e) => e.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it("Oktober: Trainings zählen, Restlaufzeit", () => {
    const d = { ...empty, workouts: ["2026-10-01", "2026-10-05", "2026-09-30"].map((date) => ({ date })) };
    const e = seasonEvent(d, "2026-10-27");
    expect(e.def.title).toBe("Herbststurm");
    expect(e.current).toBe(2);
    expect(e.daysLeft).toBe(4);
    expect(e.completed).toBe(false);
  });
  it("August: Sparbeträge, Historie vergangener Monate", () => {
    const d = { ...empty, financeEntries: [{ kind: "einzahlung", amount: 200, date: "2026-08-02" }, { kind: "einzahlung", amount: 150, date: "2026-08-20" }, { kind: "ausgabe", amount: 999, date: "2026-08-21" }] };
    const h = seasonHistory(d, "2026-10-27");
    expect(h).toHaveLength(9);
    expect(h.find((x) => x.def.month === 8)).toMatchObject({ current: 350, completed: true });
  });
});

describe("Jahresrückblick", () => {
  it("fasst das Jahr zusammen", () => {
    const q: Quest = { ...QuestDraftSchema.parse({ title: "Laufen" }), id: "q1", status: "aktiv", progress: 0, createdAt: "", updatedAt: "" };
    const inst = (id: string, at: string) => ({ id, questId: "q1", occurrenceKey: id, dueAt: null, status: "erledigt" as const, completedAt: at, eventId: null });
    const r = yearReview(
      { ...empty, quests: [q], instances: [inst("a", "2026-03-10T10:00:00"), inst("b", "2026-03-11T10:00:00"), inst("c", "2026-05-01T10:00:00"), inst("d", "2025-12-31T10:00:00")] },
      "2026",
    );
    expect(r.completions).toBe(3);
    expect(r.bestMonth).toBe(3);
    expect(r.topQuests).toEqual([{ title: "Laufen", count: 3 }]);
  });
});
