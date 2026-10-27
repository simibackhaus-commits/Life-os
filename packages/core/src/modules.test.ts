import { describe, expect, it } from "vitest";
import {
  FinanceEntrySchema,
  GoalDraftSchema,
  TRAINING_PLANS,
  QuestDraftSchema,
  WorkoutSchema,
  deadlines,
  goalProgress,
  monthSummary,
  personalRecords,
  trainingLoad,
  type FinanceEntry,
  type Goal,
  type Quest,
  type Workout,
} from "./index.ts";

const goal = (g: Partial<Goal>): Goal => ({ ...GoalDraftSchema.parse({ title: "Ziel", ...g }), id: "g", createdAt: "" });
const workout = (w: Partial<Workout> & Pick<Workout, "date" | "kind" | "durationMin">): Workout => ({ ...WorkoutSchema.parse(w), id: w.date + w.kind, createdAt: "" });

describe("Ziele", () => {
  it("Sparziel: Fortschritt, Meilensteine, Wochenrate", () => {
    const p = goalProgress(goal({ area: "finanzen", targetValue: 3000, currentValue: 1600, unit: "€", dueDate: "2027-01-26" }), [], "2026-10-27");
    expect(p.ratio).toBeCloseTo(0.5333, 3);
    expect(p.milestones).toEqual([25, 50]);
    expect(p.label).toBe("1.600 € von 3.000 €");
    expect(p.perWeekNeeded).toBeCloseTo(107.69, 1); // 1400 € in 13 Wochen
  });
  it("Projekt ohne Zielwert: Fortschritt aus verknüpften Quests", () => {
    const qs = [{ status: "erledigt" }, { status: "aktiv" }, { status: "erledigt" }, { status: "archiviert" }] as Pick<Quest, "status">[];
    const p = goalProgress(goal({ area: "business" }), qs, "2026-10-27");
    expect(p.label).toBe("2 von 3 Aufgaben");
    expect(p.milestones).toEqual([25, 50]);
    expect(p.perWeekNeeded).toBeNull();
  });
});

describe("Finanzen", () => {
  it("Monatsübersicht", () => {
    const e = (x: Partial<FinanceEntry>): FinanceEntry => ({ ...FinanceEntrySchema.parse({ kind: "ausgabe", amount: 1, date: "2026-10-01", ...x }), id: Math.random().toString(), createdAt: "" });
    const list = [
      e({ kind: "einnahme", amount: 3000 }),
      e({ kind: "ausgabe", amount: 900, category: "wohnen" }),
      e({ kind: "ausgabe", amount: 120.5, category: "lebensmittel" }),
      e({ kind: "einzahlung", amount: 500 }),
      e({ kind: "ausgabe", amount: 50, date: "2026-11-01" }),
    ];
    const m = monthSummary(list, "2026-10");
    expect(m).toMatchObject({ income: 3000, expenses: 1020.5, saved: 500, balance: 1479.5 });
    expect(m.byCategory[0]).toEqual({ category: "wohnen", amount: 900 });
  });
  it("validiert Beträge", () => {
    expect(FinanceEntrySchema.safeParse({ kind: "ausgabe", amount: 0, date: "2026-10-01" }).success).toBe(false);
  });
});

describe("Sport", () => {
  const ws = [
    workout({ date: "2026-10-20", kind: "laufen", durationMin: 30, distanceKm: 5, intensity: 6 }),
    workout({ date: "2026-10-22", kind: "laufen", durationMin: 70, distanceKm: 12, intensity: 7 }),
    workout({ date: "2026-10-24", kind: "kraft", durationMin: 50, intensity: 8, exercises: [{ name: "Kniebeuge", sets: 3, reps: 5, weightKg: 80 }, { name: "kniebeuge", sets: 3, reps: 5, weightKg: 85 }] }),
  ];
  it("persönliche Rekorde", () => {
    const pr = personalRecords(ws);
    expect(pr.find((r) => r.label === "Längster Lauf")?.value).toBe("12 km");
    expect(pr.find((r) => r.label.startsWith("Schnellste"))?.value).toBe("5:50 min/km");
    expect(pr.find((r) => r.label === "Kniebeuge")?.value).toBe("85 kg");
  });
  it("Belastung und Regenerationsempfehlung", () => {
    const calm = trainingLoad(ws, "2026-10-27");
    // Fenster 21.–27.10.: der Lauf vom 20.10. zählt nicht mehr
    expect(calm.week).toBe(70 * 7 + 50 * 8);
    const heavy = trainingLoad([...ws, workout({ date: "2026-10-25", kind: "fussball", durationMin: 90, intensity: 9 }), workout({ date: "2026-10-26", kind: "laufen", durationMin: 60, intensity: 8 })], "2026-10-27");
    expect(heavy.recoveryRecommended).toBe(true);
  });
  it("Trainingspläne erzeugen gültige Quests", () => {
    for (const plan of TRAINING_PLANS) for (const q of plan.quests("2026-10-27")) expect(QuestDraftSchema.safeParse(q).success, `${plan.id}: ${q.title}`).toBe(true);
  });
});

describe("Business", () => {
  it("Fristen: überfällig und demnächst", () => {
    const base = QuestDraftSchema.parse({ title: "x" });
    const q = (id: string, dueAt: string | null, status: Quest["status"] = "aktiv"): Quest => ({ ...base, id, title: id, dueAt, status, progress: 0, createdAt: "", updatedAt: "" });
    const d = deadlines([q("alt", "2026-10-20T10:00:00.000Z"), q("bald", "2026-10-30T10:00:00.000Z"), q("spaeter", "2026-12-01T10:00:00.000Z"), q("fertig", "2026-10-20T10:00:00.000Z", "erledigt")], "2026-10-27T10:00:00.000Z");
    expect(d.overdue.map((x) => x.id)).toEqual(["alt"]);
    expect(d.upcoming.map((x) => x.id)).toEqual(["bald"]);
  });
});
