import { describe, expect, it } from "vitest";
import { LocalStore, type KeyValueStorage } from "./local-store.ts";
import { Outbox, type OutboxItem } from "./outbox.ts";
import { HydratedStorage, STORAGE_KEYS } from "./storage.ts";
import { achievementsFor, totals } from "./selectors.ts";

class MemoryStorage implements KeyValueStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe("LocalStore", () => {
  it("Quest anlegen, abschließen, persistieren", async () => {
    const storage = new MemoryStorage();
    const store = new LocalStore(storage);
    const q = await store.createQuest({ title: "Laufen", difficulty: "schwer", attributes: ["ausdauer"] });
    const r = await store.completeOccurrence({ questId: q.id, occurrenceKey: "once", dueAt: null });
    expect(r.applied).toBe(true);
    const again = await store.completeOccurrence({ questId: q.id, occurrenceKey: "once", dueAt: null });
    expect(again.applied).toBe(false);

    const reloaded = await new LocalStore(storage).load();
    expect(reloaded.character.totalXp).toBe(50);
    expect(reloaded.quests[0]!.status).toBe("erledigt");
  });

  it("Gericht: Krankheit wird freigesprochen, Wiederholungstäter verliert Coins, Berufung hebt auf", async () => {
    const store = new LocalStore(new MemoryStorage());
    const q = await store.createQuest({ title: "Training", difficulty: "schwer", mandatory: true });
    await store.completeOccurrence({ questId: q.id, occurrenceKey: "once", dueAt: null });
    await store.updateQuest(q.id, { status: "aktiv" });

    const c1 = await store.openCase({ questId: q.id, occurrenceKey: "2026-10-20", charge: "Training versäumt", questXp: 50, questCoins: 10 });
    await store.plead(c1.id, { plea: "nicht_schuldig", excuse: "krankheit", statement: "Fieber" });
    let s = await store.load();
    expect(s.cases.find((c) => c.id === c1.id)!.verdict).toBe("freispruch");
    expect(s.character.coins).toBe(10);

    const c2 = await store.openCase({ questId: q.id, occurrenceKey: "2026-10-21", charge: "Training versäumt", questXp: 50, questCoins: 10 });
    await store.plead(c2.id, { plea: "schuldig", excuse: "keine", statement: "" });
    const c3 = await store.openCase({ questId: q.id, occurrenceKey: "2026-10-22", charge: "Training versäumt", questXp: 50, questCoins: 10 });
    await store.plead(c3.id, { plea: "nicht_schuldig", excuse: "keine_motivation", statement: "" });
    s = await store.load();
    expect(s.cases.find((c) => c.id === c3.id)!.verdict).toBe("schuldig");
    const coinsAfter = s.character.coins;
    expect(coinsAfter).toBeLessThan(10);

    await store.appeal(c3.id, { excuse: "notfall", statement: "Familiennotfall" });
    s = await store.load();
    const appealed = s.cases.find((c) => c.id === c3.id)!;
    expect(appealed.verdict).toBe("freispruch");
    expect(s.character.coins).toBe(10);
    await expect(store.appeal(c3.id, { excuse: "notfall", statement: "" })).rejects.toThrow(/eine Berufung/);
  });

  it("Shop: Belohnung anlegen, kaufen, Guthaben prüfen", async () => {
    const store = new LocalStore(new MemoryStorage());
    const item = await store.createShopItem({ title: "Pizza", cost: 30 });
    expect(await store.purchase(item.id)).toEqual({ applied: false, reason: "insufficient_coins" });
    const q = await store.createQuest({ title: "Großprojekt", type: "legendary", difficulty: "episch" });
    await store.completeOccurrence({ questId: q.id, occurrenceKey: "once", dueAt: null });
    const r = await store.purchase(item.id);
    expect(r).toEqual({ applied: true, coinsAfter: 70 });
    const s = await store.load();
    expect(s.purchases).toHaveLength(1);
    expect(totals(s).coinsSpent).toBe(30);
    expect(achievementsFor(s, "2026-10-27").find((a) => a.def.id === "belohnt")?.unlocked).toBe(true);
    await store.updateShopItem(item.id, { active: false });
    expect(await store.purchase(item.id)).toEqual({ applied: false, reason: "inactive" });
  });

  it("Quick-Add nutzt offline den Parser", async () => {
    const store = new LocalStore(new MemoryStorage());
    const r = await store.quickAdd("Jeden Tag morgens und abends Zähne putzen");
    expect(r.source).toBe("offline");
    expect(r.draft.recurrence?.times).toEqual(["07:00", "21:00"]);
  });
});

describe("HydratedStorage", () => {
  it("liest beim Start ein und schreibt asynchron durch", async () => {
    const backend = new Map<string, string>([["life-os/outbox/v1", "[1]"]]);
    const async = {
      getItem: async (k: string) => backend.get(k) ?? null,
      setItem: async (k: string, v: string) => void backend.set(k, v),
      removeItem: async (k: string) => void backend.delete(k),
    };
    const s = await HydratedStorage.create(async, STORAGE_KEYS);
    expect(s.getItem("life-os/outbox/v1")).toBe("[1]");
    s.setItem("life-os/local/v1", "x");
    expect(s.getItem("life-os/local/v1")).toBe("x");
    await s.flushWrites();
    expect(backend.get("life-os/local/v1")).toBe("x");
  });
});

describe("Outbox", () => {
  const item = (n: number): OutboxItem => ({ kind: "complete", eventId: `e${n}`, questId: "q", occurrenceKey: "once", dueAt: null, queuedAt: "" });

  it("sendet in Reihenfolge und stoppt beim ersten Netzwerkfehler", async () => {
    const box = new Outbox(new MemoryStorage());
    box.push(item(1));
    box.push(item(2));
    box.push(item(3));
    box.push(item(1)); // gleiche Event-ID wird nicht doppelt eingereiht
    const sent: string[] = [];
    const r = await box.flush(async (i) => {
      if (i.eventId === "e3") throw new TypeError("fetch failed");
      sent.push(i.eventId);
      return "ok";
    });
    expect(sent).toEqual(["e1", "e2"]);
    expect(r).toEqual({ sent: 2, remaining: 1 });
  });
});
