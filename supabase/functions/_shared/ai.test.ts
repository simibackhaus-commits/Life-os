import { describe, expect, it } from "vitest";
import { checkVerdict, parseDraft, transcriptToMessages } from "./ai.ts";

describe("parseDraft", () => {
  it("akzeptiert einen typischen KI-Entwurf und vergibt Teilaufgaben-IDs", () => {
    const r = parseDraft({
      title: "Laufen",
      type: "weekly",
      difficulty: "mittel",
      attributes: ["ausdauer"],
      recurrence: { freq: "weekly", interval: 1, byWeekday: [1, 3, 5], startDate: "2026-10-27" },
      subtasks: [{ title: "Schuhe bereitstellen" }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.draft.subtasks[0]!.id).toMatch(/[0-9a-f-]{36}/);
  });
  it("lehnt ungültige Attribute ab", () => {
    expect(parseDraft({ title: "x", type: "side", difficulty: "mittel", attributes: ["magie"] }).ok).toBe(false);
  });
});

describe("checkVerdict", () => {
  const ctx = { questXp: 50, questCoins: 10 };
  const base = { prosecution: "p", defense: "d", reasoning: "Pflicht ohne nachvollziehbaren Grund versäumt.", protectedReason: null };
  const k = (type: string, extra: Record<string, unknown>) => ({ type, amount: null, description: null, questTitle: null, estimatedMinutes: null, prompt: null, ...extra });

  it("normalisiert flache Konsequenzen und kappt Beträge", () => {
    const r = checkVerdict({ ...base, verdict: "schuldig", consequences: [k("coins_verlust", { amount: 999 })] }, ctx);
    expect(r.ok).toBe(true);
    expect(r.sanitized?.consequences).toEqual([{ type: "coins_verlust", amount: 10 }]);
  });
  it("blockiert Strafe bei Krankheit", () => {
    const r = checkVerdict({ ...base, verdict: "schuldig", protectedReason: "krankheit", consequences: [k("xp_abzug", { amount: 5 })] }, ctx);
    expect(r.ok).toBe(false);
  });
});

describe("transcriptToMessages", () => {
  it("führt gleiche Rollen zusammen und endet mit dem Nutzer", () => {
    const m = transcriptToMessages("Akte", [
      { role: "system", content: "eröffnet" },
      { role: "angeklagter", content: "a" },
      { role: "angeklagter", content: "b" },
      { role: "richter", content: "Warum?" },
    ]);
    expect(m.map((x) => x.role)).toEqual(["user", "assistant", "user"]);
    expect(m[0]!.content).toContain("Angeklagter: b");
  });
});
