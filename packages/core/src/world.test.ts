import { describe, expect, it } from "vitest";
import { DUNGEONS, QuestDraftSchema, availableTitles, evaluateAchievements, focusRemaining, gardenPlants, type Quest, type QuestInstance } from "./index.ts";

describe("Fokus-Dungeons", () => {
  it("Restzeit", () => {
    const start = "2026-10-27T10:00:00.000Z";
    expect(focusRemaining({ startedAt: start, minutes: 25 }, Date.parse("2026-10-27T10:20:00.000Z"))).toBe(300);
    expect(focusRemaining({ startedAt: start, minutes: 25 }, Date.parse("2026-10-27T10:26:00.000Z"))).toBe(-60);
  });
  it("Belohnung wächst mit der Dauer", () => {
    expect(DUNGEONS.map((d) => d.xp / d.minutes).every((r, i, a) => i === 0 || r >= a[i - 1]!)).toBe(true);
  });
});

describe("Habit Garden", () => {
  const q = (id: string): Quest => ({
    ...QuestDraftSchema.parse({ title: id, type: "daily", recurrence: { freq: "daily", interval: 1, startDate: "2026-09-01" } }),
    id,
    status: "aktiv",
    progress: 0,
    createdAt: "",
    updatedAt: "",
  });
  const done = (questId: string, dates: string[]): QuestInstance[] =>
    dates.map((d, i) => ({ id: `${questId}${i}`, questId, occurrenceKey: d, dueAt: null, status: "erledigt", completedAt: null, eventId: null }));
  const days = (n: number, endDay = 26) => Array.from({ length: n }, (_, i) => `2026-10-${String(endDay - i).padStart(2, "0")}`);

  it("Pflanzenstufen nach Serie, welke Pflanzen nach Abbruch", () => {
    const plants = gardenPlants([q("a"), q("b"), q("c")], [...done("a", days(8)), ...done("b", days(2, 20))], "2026-10-27");
    const by = Object.fromEntries(plants.map((p) => [p.quest.id, p]));
    expect(by.a!.stage.name).toBe("Busch");
    expect(by.a!.next?.name).toBe("Baum");
    expect(by.a!.growth).toBeCloseTo(1 / 7);
    expect(by.b!.wilted).toBe(true);
    expect(by.c!.stage.name).toBe("Saatbeet");
    expect(by.c!.wilted).toBe(false);
  });
});

describe("Titel", () => {
  it("Level-Titel und Achievement-Titel", () => {
    const base = {
      character: { userId: "x", name: "x", title: "", className: "", avatar: "", totalXp: 0, coins: 600, attributeXp: {} as never },
      quests: [],
      instances: [],
      events: [],
      today: "2026-10-27",
    };
    const t = availableTitles(12, evaluateAchievements(base));
    expect(t.map((x) => x.title)).toEqual(["Neuling", "Abenteurer", "Wegbereiter", "Sparfuchs"]);
  });
});
