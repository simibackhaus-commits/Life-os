import { describe, expect, it } from "vitest";
import {
  completeInstance,
  computeReward,
  computeStreak,
  levelFromXp,
  occurrencesBetween,
  occurrencesOn,
  ShopItemDraftSchema,
  bossHp,
  canUnlock,
  isQuestLocked,
  skillPoints,
  evaluateAchievements,
  parseQuickAdd,
  purchaseItem,
  simpleJudge,
  uncompleteInstance,
  validateVerdict,
  xpToNext,
  type GameState,
  type Quest,
} from "./index.ts";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("Levelkurve", () => {
  it("steigt progressiv", () => {
    expect(xpToNext(1)).toBe(100);
    expect(xpToNext(2)).toBe(283);
    expect(xpToNext(10)).toBeGreaterThan(xpToNext(9));
  });
  it("berechnet Level aus Gesamt-XP", () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(383).level).toBe(3);
    expect(levelFromXp(382).xpInLevel).toBe(282);
  });
});

describe("Belohnungen", () => {
  it("multipliziert Schwierigkeit und Questtyp und verteilt Attribut-XP vollständig", () => {
    const r = computeReward({ difficulty: "schwer", type: "boss", attributes: ["staerke", "ausdauer", "disziplin"] });
    expect(r.xp).toBe(200);
    expect(r.coins).toBe(40);
    expect(Object.values(r.attributeXp).reduce((a, b) => a + b, 0)).toBe(200);
  });
});

describe("Wiederholungen", () => {
  it("erzeugt morgens und abends getrennte Instanzen", () => {
    const occ = occurrencesOn({ freq: "daily", interval: 1, times: ["21:00", "07:00"], startDate: "2026-10-01" }, "2026-10-27");
    expect(occ.map((o) => o.key)).toEqual(["2026-10-27T07:00", "2026-10-27T21:00"]);
  });
  it("respektiert Wochentage (Mo/Mi/Fr)", () => {
    // 2026-10-26 ist ein Montag
    const occ = occurrencesBetween({ freq: "weekly", interval: 1, byWeekday: [1, 3, 5], startDate: "2026-10-26" }, "2026-10-26", "2026-11-01");
    expect(occ.map((o) => o.date)).toEqual(["2026-10-26", "2026-10-28", "2026-10-30"]);
  });
  it("respektiert Intervalle und Startdatum", () => {
    const occ = occurrencesBetween({ freq: "daily", interval: 2, startDate: "2026-10-27" }, "2026-10-25", "2026-10-31");
    expect(occ.map((o) => o.date)).toEqual(["2026-10-27", "2026-10-29", "2026-10-31"]);
  });
});

describe("Streaks", () => {
  const rule = { freq: "daily" as const, interval: 1, startDate: "2026-10-01" };
  it("zählt Serie, heute offen bricht nicht", () => {
    const keys = new Set(["2026-10-24", "2026-10-25", "2026-10-26"]);
    expect(computeStreak(rule, keys, "2026-10-27")).toEqual({ current: 3, best: 3 });
  });
  it("Lücke beendet die aktuelle Serie, beste bleibt", () => {
    const keys = new Set(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27"]);
    expect(computeStreak(rule, keys, "2026-10-27")).toEqual({ current: 2, best: 4 });
  });
});

function baseState(): GameState {
  const quest: Quest = {
    id: uuid(1),
    title: "Zähneputzen",
    description: "",
    type: "daily",
    category: "gesundheit",
    difficulty: "trivial",
    priority: 3,
    attributes: ["gesundheit"],
    dueAt: null,
    recurrence: { freq: "daily", interval: 1, times: ["07:00", "21:00"], startDate: "2026-10-01" },
    estimatedMinutes: 3,
    subtasks: [],
    goalId: null,
    requiresQuestId: null,
    delegatedTo: null,
    proofRequired: false,
    mandatory: true,
    consequences: "",
    status: "aktiv",
    progress: 0,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
  return {
    character: { userId: "local", name: "Held", title: "Neuling", className: "Abenteurer", avatar: "", totalXp: 0, coins: 0, attributeXp: {} as never },
    quests: [quest],
    instances: [],
    events: [],
  };
}

describe("Engine – idempotente Abschlüsse", () => {
  const input = { eventId: uuid(100), instanceId: uuid(200), questId: uuid(1), occurrenceKey: "2026-10-27T07:00", dueAt: null, now: "2026-10-27T07:05:00Z" };

  it("vergibt XP und Coins genau einmal pro Event", () => {
    const a = completeInstance(baseState(), input);
    expect(a.result.applied).toBe(true);
    expect(a.state.character.totalXp).toBe(5);
    const b = completeInstance(a.state, input);
    expect(b.result).toEqual({ applied: false, reason: "duplicate_event" });
    expect(b.state.character.totalXp).toBe(5);
  });

  it("verhindert doppelten Abschluss derselben Instanz mit neuer Event-ID", () => {
    const a = completeInstance(baseState(), input);
    const b = completeInstance(a.state, { ...input, eventId: uuid(101) });
    expect(b.result).toEqual({ applied: false, reason: "already_completed" });
  });

  it("Morgen und Abend sind getrennte Abschlüsse", () => {
    const a = completeInstance(baseState(), input);
    const b = completeInstance(a.state, { ...input, eventId: uuid(101), instanceId: uuid(201), occurrenceKey: "2026-10-27T21:00" });
    expect(b.result.applied).toBe(true);
    expect(b.state.character.totalXp).toBe(10);
  });

  it("Rückgängig bucht gegen", () => {
    const a = completeInstance(baseState(), input);
    const u = uncompleteInstance(a.state, { eventId: uuid(102), instanceId: uuid(200), now: input.now });
    expect(u.applied).toBe(true);
    expect(u.state.character.totalXp).toBe(0);
    expect(u.state.character.coins).toBe(0);
    expect(u.state.events).toHaveLength(2);
  });
});

describe("Gericht – Regelvalidierung", () => {
  const ctx = { questXp: 50, questCoins: 10 };
  it("Krankheit darf nicht bestraft werden", () => {
    const r = validateVerdict(
      { verdict: "schuldig", reasoning: "Der Angeklagte war krank, aber trotzdem schuldig.", protectedReason: "krankheit", consequences: [{ type: "coins_verlust", amount: 5 }] },
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.sanitized?.consequences).toEqual([]);
  });
  it("kappt Beträge auf die Grenzen", () => {
    const r = validateVerdict(
      { verdict: "schuldig", reasoning: "Keine Entschuldigung vorgebracht, Pflicht klar versäumt.", consequences: [{ type: "coins_verlust", amount: 500 }, { type: "xp_abzug", amount: 500 }] },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(r.sanitized?.consequences).toEqual([{ type: "coins_verlust", amount: 10 }, { type: "xp_abzug", amount: 25 }]);
  });
  it("lehnt gesundheitsschädliche Wiedergutmachung ab", () => {
    const r = validateVerdict(
      { verdict: "schuldig", reasoning: "Pflicht versäumt ohne nachvollziehbaren Grund.", consequences: [{ type: "wiedergutmachung", questTitle: "24 Stunden fasten", estimatedMinutes: 30 }] },
      ctx,
    );
    expect(r.ok).toBe(false);
  });
  it("Verwarnung erlaubt keine Coin-Strafe", () => {
    const r = validateVerdict({ verdict: "verwarnung", reasoning: "Erstes Versäumnis, glaubhafte Reue gezeigt.", consequences: [{ type: "coins_verlust", amount: 3 }] }, ctx);
    expect(r.ok).toBe(false);
  });
});

describe("Belohnungsshop", () => {
  const item = { id: uuid(500), title: "Serie", cost: 30, active: true };
  it("zieht Coins ab und ist idempotent", () => {
    const s = { ...baseState(), character: { ...baseState().character, coins: 50 } };
    const a = purchaseItem(s, { eventId: uuid(600), item, now: "2026-10-27T10:00:00Z" });
    expect(a.result).toEqual({ applied: true, coinsAfter: 20 });
    expect(a.state.events.at(-1)?.kind).toBe("shop_purchase");
    expect(purchaseItem(a.state, { eventId: uuid(600), item, now: "x" }).result).toEqual({ applied: false, reason: "duplicate_event" });
  });
  it("verweigert Kauf ohne genug Coins oder bei inaktiver Belohnung", () => {
    const s = { ...baseState(), character: { ...baseState().character, coins: 10 } };
    expect(purchaseItem(s, { eventId: uuid(601), item, now: "x" }).result).toEqual({ applied: false, reason: "insufficient_coins" });
    expect(purchaseItem(s, { eventId: uuid(602), item: { ...item, cost: 5, active: false }, now: "x" }).result).toEqual({ applied: false, reason: "inactive" });
  });
  it("validiert Belohnungen", () => {
    expect(ShopItemDraftSchema.safeParse({ title: "x", cost: 0 }).success).toBe(false);
    expect(ShopItemDraftSchema.parse({ title: "Pizza", cost: 150 }).icon).toBe("🎁");
  });
});

describe("Achievements", () => {
  it("erste Quest und Fortschritt", () => {
    const s = baseState();
    let list = evaluateAchievements({ ...s, today: "2026-10-27" });
    expect(list.find((a) => a.def.id === "erste_quest")?.unlocked).toBe(false);
    const done = completeInstance(s, { eventId: uuid(700), instanceId: uuid(701), questId: uuid(1), occurrenceKey: "2026-10-27T07:00", dueAt: null, now: "2026-10-27T06:30:00" }).state;
    list = evaluateAchievements({ ...done, today: "2026-10-27" });
    expect(list.find((a) => a.def.id === "erste_quest")?.unlocked).toBe(true);
    const ten = list.find((a) => a.def.id === "quests_10")!;
    expect(ten.current).toBe(1);
    expect(ten.progress).toBeCloseTo(0.1);
  });
  it("Serie aus wiederkehrender Quest", () => {
    const s = baseState();
    const instances = Array.from({ length: 7 }, (_, i) => ["07:00", "21:00"].map((t, j) => ({
      id: uuid(800 + i * 2 + j), questId: uuid(1), occurrenceKey: `2026-10-${String(20 + i).padStart(2, "0")}T${t}`, dueAt: null, status: "erledigt" as const, completedAt: "2026-10-20T12:00:00Z", eventId: null,
    }))).flat();
    const list = evaluateAchievements({ ...s, instances, today: "2026-10-27" });
    expect(list.find((a) => a.def.id === "serie_7")?.unlocked).toBe(true);
  });
  it("Gerichts-Achievements", () => {
    const list = evaluateAchievements({ ...baseState(), today: "2026-10-27", cases: [{ verdict: "freispruch", plea: "nicht_schuldig" }] });
    expect(list.find((a) => a.def.id === "freispruch")?.unlocked).toBe(true);
    expect(list.find((a) => a.def.id === "gestaendnis")?.unlocked).toBe(false);
  });
});

describe("Skilltree", () => {
  const xpFor = (level: number) => {
    let xp = 0;
    for (let l = 1; l < level; l++) xp += Math.round(50 * Math.pow(l, 1.3));
    return xp;
  };
  it("Skillpunkte, Reihenfolge und Levelvoraussetzung", () => {
    const attr = { ausdauer: xpFor(5) };
    const none = new Set<string>();
    expect(skillPoints(attr, none, "ausdauer")).toEqual({ total: 4, spent: 0, available: 4 });
    expect(canUnlock("ausdauer_2", attr, none)).toEqual({ ok: false, reason: "previous" });
    expect(canUnlock("ausdauer_1", attr, none)).toEqual({ ok: true });
    expect(canUnlock("ausdauer_3", attr, new Set(["ausdauer_1", "ausdauer_2"]))).toEqual({ ok: false, reason: "level" });
    expect(canUnlock("ausdauer_1", { ausdauer: 0 }, none)).toEqual({ ok: false, reason: "level" });
    expect(canUnlock("magie_1", attr, none)).toEqual({ ok: false, reason: "unknown" });
  });
  it("Boni erhöhen XP und Coins und sind gedeckelt", () => {
    const q = { difficulty: "schwer" as const, type: "side" as const, attributes: ["ausdauer", "staerke"] as const };
    expect(computeReward({ ...q, attributes: [...q.attributes] }).xp).toBe(50);
    const r = computeReward({ ...q, attributes: [...q.attributes] }, new Set(["ausdauer_1", "ausdauer_2", "staerke_1", "staerke_2", "staerke_3"]));
    expect(r.bonus).toEqual({ xpPct: 25, coinPct: 10 });
    expect(r.xp).toBe(63); // 50 * 1.25 = 62.5 → 63
    expect(r.coins).toBe(11); // 10 * 1.10
  });
  it("Engine nutzt Skills bei Abschlüssen", () => {
    const s = { ...baseState(), skills: ["gesundheit_1"] };
    s.quests = s.quests.map((q) => ({ ...q, difficulty: "episch" as const }));
    const r = completeInstance(s, { eventId: uuid(900), instanceId: uuid(901), questId: uuid(1), occurrenceKey: "2026-10-27T07:00", dueAt: null, now: "x" });
    expect(r.result.applied && r.result.reward.xp).toBe(105);
  });
});

describe("Questketten und Bosse", () => {
  it("gesperrte Folgequest kann nicht abgeschlossen werden", () => {
    const s = baseState();
    const first = { ...s.quests[0]!, id: uuid(2), recurrence: null, title: "Teil 1" };
    const second = { ...s.quests[0]!, id: uuid(3), recurrence: null, title: "Teil 2", requiresQuestId: uuid(2) };
    const state = { ...s, quests: [first, second] };
    expect(isQuestLocked(state.quests, second)).toBe(true);
    const blocked = completeInstance(state, { eventId: uuid(910), instanceId: uuid(911), questId: uuid(3), occurrenceKey: "once", dueAt: null, now: "x" });
    expect(blocked.result).toEqual({ applied: false, reason: "quest_locked" });
    const done1 = completeInstance(state, { eventId: uuid(912), instanceId: uuid(913), questId: uuid(2), occurrenceKey: "once", dueAt: null, now: "x" }).state;
    expect(isQuestLocked(done1.quests, second)).toBe(false);
  });
  it("Boss-Trefferpunkte aus Teilaufgaben", () => {
    const boss = { type: "boss" as const, status: "aktiv" as const, subtasks: [{ id: uuid(1), title: "a", done: true }, { id: uuid(2), title: "b", done: false }, { id: uuid(3), title: "c", done: false }] };
    expect(bossHp(boss)).toEqual({ max: 3, current: 2 });
    expect(bossHp({ ...boss, status: "erledigt" })).toEqual({ max: 3, current: 0 });
    expect(bossHp({ ...boss, type: "side" })).toBeNull();
  });
  it("Langzeitzähler fließen in Achievements ein", () => {
    const list = evaluateAchievements({ ...baseState(), today: "2026-10-27", lifetime: { completions: 120, completedTypes: ["boss"], earlyBird: 0, purchases: 0 } });
    expect(list.find((a) => a.def.id === "quests_100")?.unlocked).toBe(true);
    expect(list.find((a) => a.def.id === "boss")?.unlocked).toBe(true);
  });
});

describe("Offline-Richter", () => {
  const ctx = { questXp: 50, questCoins: 10 };
  it("jedes Urteil besteht die Regelvalidierung", () => {
    for (const plea of ["schuldig", "nicht_schuldig", "teilweise_schuldig"] as const)
      for (const excuse of ["keine", "vergessen", "keine_zeit", "keine_motivation", "krankheit", "verletzung", "regeneration", "notfall"] as const)
        for (const priorConvictions of [0, 3]) {
          const p = simpleJudge({ plea, excuse, priorConvictions, questTitle: "Laufen" });
          expect(validateVerdict(p, ctx).ok, `${plea}/${excuse}/${priorConvictions}`).toBe(true);
        }
  });
  it("Krankheit => Freispruch ohne Konsequenzen", () => {
    const p = simpleJudge({ plea: "nicht_schuldig", excuse: "krankheit", priorConvictions: 5, questTitle: "Laufen" });
    expect(p.verdict).toBe("freispruch");
    expect(p.consequences).toEqual([]);
  });
});

describe("Quick-Add-Parser", () => {
  const today = "2026-10-27"; // Dienstag
  it("Mo/Mi/Fr 30 Minuten laufen", () => {
    const { draft } = parseQuickAdd("Jeden Montag, Mittwoch und Freitag 30 Minuten laufen.", today);
    expect(draft.recurrence?.freq).toBe("weekly");
    expect(draft.recurrence?.byWeekday).toEqual([1, 3, 5]);
    expect(draft.estimatedMinutes).toBe(30);
    expect(draft.category).toBe("sport");
    expect(draft.title).toBe("Laufen");
  });
  it("Jeden Tag morgens und abends Zähne putzen", () => {
    const { draft } = parseQuickAdd("Jeden Tag morgens und abends Zähne putzen", today);
    expect(draft.title).toBe("Zähne putzen");
    expect(draft.recurrence?.freq).toBe("daily");
    expect(draft.recurrence?.times).toEqual(["07:00", "21:00"]);
  });
  it("Morgen um 14 Uhr Bestellung", () => {
    const { draft } = parseQuickAdd("Ich muss morgen um 14 Uhr eine Bestellung auslösen.", today);
    expect(draft.recurrence).toBeNull();
    expect(draft.dueAt).toBe(new Date("2026-10-28T14:00:00").toISOString());
    expect(draft.title).toBe("Eine Bestellung auslösen");
  });
  it("Sonntags Woche planen", () => {
    const { draft } = parseQuickAdd("Erinnere mich jeden Sonntag daran, meine kommende Arbeitswoche zu planen.", today);
    expect(draft.recurrence?.byWeekday).toEqual([7]);
    expect(draft.category).toBe("business");
  });
  it("Sparziel wird Hauptquest mit Frist", () => {
    const { draft } = parseQuickAdd("Ich möchte in drei Monaten 3.000 Euro sparen.", today);
    expect(draft.type).toBe("main");
    expect(draft.category).toBe("finanzen");
    expect(draft.dueAt?.slice(0, 10)).toBe("2027-01-25");
  });
});
