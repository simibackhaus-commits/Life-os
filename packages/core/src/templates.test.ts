import { describe, expect, it } from "vitest";
import { QuestDraftSchema, TEMPLATE_PACKS, newFromPack, occurrencesBetween } from "./index.ts";

describe("Vorlagenpaket Alltag & Training", () => {
  const pack = TEMPLATE_PACKS[0]!;
  const groups = pack.groups("2026-10-26"); // Montag
  const all = groups.flatMap((g) => g.quests);

  it("alle Quests sind gültig und eindeutig benannt", () => {
    for (const q of all) expect(QuestDraftSchema.safeParse(q).success, q.title).toBe(true);
    expect(new Set(all.map((q) => q.title)).size).toBe(all.length);
    expect(all.length).toBeGreaterThan(40);
  });

  it("Trainingswoche wie gewünscht", () => {
    const week = (title: string) =>
      occurrencesBetween(QuestDraftSchema.parse(all.find((q) => q.title.startsWith(title))!).recurrence!, "2026-10-26", "2026-11-01").map((o) => new Date(`${o.date}T12:00:00`).getDay());
    expect(week("Gym")).toEqual([1, 2, 4, 5]); // Mo, Di, Do, Fr
    expect(week("Easy Run")).toEqual([1]); // Mo
    expect(week("Quality Run")).toEqual([3]); // Mi
    expect(week("Long Run")).toEqual([5]); // Fr
  });

  it("Zähneputzen morgens und abends getrennt", () => {
    const z = QuestDraftSchema.parse(all.find((q) => q.title === "Zähne putzen")!);
    expect(occurrencesBetween(z.recurrence!, "2026-10-26", "2026-10-26").map((o) => o.key)).toEqual(["2026-10-26T07:00", "2026-10-26T22:00"]);
  });

  it("bereits vorhandene Quests werden markiert", () => {
    const r = newFromPack(pack, "2026-10-26", ["zähne putzen", "Gym: Krafttraining "]);
    const flat = r.flatMap((g) => g.quests);
    expect(flat.filter((q) => q.exists).map((q) => q.quest.title)).toEqual(["Gym: Krafttraining", "Zähne putzen"]);
  });
});
