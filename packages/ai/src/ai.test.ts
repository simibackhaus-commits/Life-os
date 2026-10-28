import { describe, expect, it } from "vitest";
import {
  AiUnavailableError,
  GeminiProvider,
  OllamaProvider,
  aiChat,
  aiJudge,
  aiQuickAdd,
  createProvider,
  mayShareGameData,
  parseAiSettings,
  stripThinking,
  type AiProvider,
  type AiRequest,
  type FetchFn,
} from "./index.ts";

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

/** Anbieter mit vorgegebenen Antworten; merkt sich die Anfragen. */
function scripted(...answers: string[]): AiProvider & { calls: AiRequest[] } {
  const calls: AiRequest[] = [];
  return {
    id: "ollama",
    label: "Test",
    external: false,
    calls,
    async generate(req) {
      calls.push(req);
      const a = answers.shift();
      if (a === undefined) throw new AiUnavailableError("keine Antwort mehr");
      return a;
    },
    async status() {
      return { ok: true, detail: "ok" };
    },
  };
}

function fakeFetch(handler: (url: string, body: unknown, headers: Record<string, string>) => { status: number; body: unknown }): FetchFn & { urls: string[] } {
  const urls: string[] = [];
  const f = (async (url: string, init?: { body?: string; headers?: Record<string, string> }) => {
    urls.push(url);
    const r = handler(url, init?.body ? JSON.parse(init.body) : null, init?.headers ?? {});
    return { ok: r.status < 400, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  }) as FetchFn & { urls: string[] };
  f.urls = urls;
  return f;
}

const caseInput = {
  caseFile: "Anklage: Krafttraining nicht erledigt",
  caseCtx: { questXp: 40, questCoins: 20 },
  plea: "schuldig" as const,
  excuse: "keine_motivation" as const,
  priorConvictions: 0,
  questTitle: "Krafttraining",
};

describe("Anbieter", () => {
  it("Ollama: sendet Modell, Schema und Systemprompt; entfernt Denkschritte", async () => {
    const f = fakeFetch((url, body) => {
      expect(url).toBe("http://localhost:11434/api/chat");
      const b = body as { model: string; format: unknown; stream: boolean; messages: Array<{ role: string }> };
      expect(b.model).toBe("qwen3:8b");
      expect(b.stream).toBe(false);
      expect(b.format).toEqual({ type: "object" });
      expect(b.messages[0]!.role).toBe("system");
      return { status: 200, body: { message: { content: "<think>hm</think>{\"a\":1}" } } };
    });
    const p = new OllamaProvider(f);
    expect(await p.generate({ system: "s", messages: [{ role: "user", content: "x" }], schema: { type: "object" } })).toBe('{"a":1}');
  });

  it("Ollama: fehlendes Modell und nicht erreichbar → verständliche Meldung", async () => {
    const missing = new OllamaProvider(fakeFetch(() => ({ status: 200, body: { models: [{ name: "llama3.2:3b" }] } })));
    const s = await missing.status();
    expect(s.ok).toBe(false);
    expect(s.detail).toContain("ollama pull qwen3:8b");
    const down = new OllamaProvider((async () => {
      throw new TypeError("fetch failed");
    }) as FetchFn);
    expect((await down.status()).ok).toBe(false);
    await expect(down.generate({ system: "s", messages: [] })).rejects.toThrow(/nicht erreichbar/);
  });

  it("Gemini: Schlüssel im Header (nicht in der URL), Rollen gemappt, 429 verständlich", async () => {
    const f = fakeFetch((url, body, headers) => {
      expect(url).not.toContain("key=");
      expect(headers["x-goog-api-key"]).toBe("k");
      const b = body as { contents: Array<{ role: string }> };
      expect(b.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
      return { status: 200, body: { candidates: [{ content: { parts: [{ text: "Hallo" }] } }] } };
    });
    const p = new GeminiProvider(f, "k", "gemini-flash-latest");
    const msgs = [
      { role: "user" as const, content: "a" },
      { role: "assistant" as const, content: "b" },
      { role: "user" as const, content: "c" },
    ];
    expect(await p.generate({ system: "s", messages: msgs })).toBe("Hallo");
    const limited = new GeminiProvider(fakeFetch(() => ({ status: 429, body: {} })), "k");
    await expect(limited.generate({ system: "s", messages: msgs })).rejects.toThrow(/Kontingent/);
  });

  it("Einstellungen: aus = keine KI, Gemini nur mit Zustimmung, Spieldaten nur mit Freigabe", () => {
    const f = fakeFetch(() => ({ status: 200, body: {} }));
    expect(createProvider(parseAiSettings({}), f)).toBeNull();
    expect(createProvider(parseAiSettings({ provider: "gemini", geminiKey: "k" }), f)).toBeNull();
    const g = createProvider(parseAiSettings({ provider: "gemini", geminiKey: "k", geminiConsent: true }), f);
    expect(g?.id).toBe("gemini");
    const o = createProvider(parseAiSettings({ provider: "ollama" }), f);
    expect(mayShareGameData(parseAiSettings({ provider: "ollama" }), o)).toBe(false);
    expect(mayShareGameData(parseAiSettings({ provider: "ollama", shareGameData: true }), o)).toBe(true);
    expect(parseAiSettings({ provider: "openai" }).provider).toBe("aus");
    expect(stripThinking("<think>x</think> ok")).toBe("ok");
  });
});

describe("Quick-Add per KI", () => {
  it("erstellt einen gültigen Entwurf aus JSON (auch mit Zäunen und null-Feldern)", async () => {
    const json = {
      title: "Zähne putzen",
      type: "daily",
      difficulty: "trivial",
      attributes: ["gesundheit", "ordnung", "quatsch"],
      dueAt: null,
      recurrence: { freq: "daily", interval: 1, startDate: "2026-10-28", times: ["7:00", "21:00"], byWeekday: [] },
    };
    const p = scripted("```json\n" + JSON.stringify(json) + "\n```");
    const r = await aiQuickAdd(p, "Jeden Tag zweimal Zähne putzen", "2026-10-28", uuid);
    expect(r.draft.recurrence?.times).toEqual(["07:00", "21:00"]);
    expect(r.draft.attributes).toEqual(["gesundheit", "ordnung"]);
    expect(p.calls[0]!.system).toContain("Mittwoch, 2026-10-28");
  });

  it("korrigiert einmal und gibt dann auf", async () => {
    const p = scripted('{"title":""}', '{"title":"x","type":"quatsch"}');
    await expect(aiQuickAdd(p, "irgendwas", "2026-10-28", uuid)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(p.calls).toHaveLength(2);
  });
});

describe("Chat", () => {
  it("liefert Antwort und nur gültige Questvorschläge; ohne Freigabe keine Spieldaten", async () => {
    const p = scripted(JSON.stringify({ reply: "Los geht's", quests: [{ title: "Lesen", type: "daily", difficulty: "leicht", attributes: ["intelligenz"] }, { title: "" }] }));
    const r = await aiChat(p, { role: "stratege", message: "Plane meinen Tag", history: [], today: "2026-10-28", context: null }, uuid);
    expect(r.reply).toBe("Los geht's");
    expect(r.proposals.map((q) => q.title)).toEqual(["Lesen"]);
    expect(p.calls[0]!.system).toContain("NICHT freigegeben");
  });

  it("nutzt Freitext, wenn das Modell kein JSON liefert", async () => {
    const r = await aiChat(scripted("Einfach so."), { role: "mentor", message: "?", history: [], today: "2026-10-28", context: "x" }, uuid);
    expect(r).toEqual({ reply: "Einfach so.", proposals: [] });
  });
});

describe("KI-Richter", () => {
  it("stellt Rückfragen bis zum Limit", async () => {
    const r = await aiJudge(scripted('{"aktion":"frage","frage":"Warum?"}'), { ...caseInput, log: [] });
    expect(r).toEqual({ kind: "frage", question: "Warum?" });
  });

  it("kappt Beträge auf die Regelbasis", async () => {
    const v = { aktion: "urteil", verdict: "schuldig", reasoning: "Ohne triftigen Grund ausgelassen. Das Gericht verhängt eine kleine Strafe.", protectedReason: "keiner", consequences: [{ type: "coins_verlust", amount: 999 }] };
    const r = await aiJudge(scripted(JSON.stringify(v)), { ...caseInput, log: [{ role: "richter", content: "a" }, { role: "richter", content: "b" }, { role: "richter", content: "c" }] });
    expect(r.kind).toBe("urteil");
    if (r.kind === "urteil") {
      expect(r.viaFallback).toBe(false);
      expect(r.verdict.consequences).toEqual([{ type: "coins_verlust", amount: 20 }]);
    }
  });

  it("bestraft nie trotz Schutzgrund: Korrektur, sonst Regelrichter", async () => {
    const bad = JSON.stringify({ aktion: "urteil", verdict: "schuldig", reasoning: "Krankheit ist keine Ausrede, so sieht es das Gericht.", protectedReason: "keiner", consequences: [] });
    const p = scripted(bad, bad, bad);
    const r = await aiJudge(p, { ...caseInput, excuse: "krankheit", log: [] });
    expect(p.calls).toHaveLength(3);
    expect(r.kind === "urteil" && r.viaFallback && r.verdict.verdict === "freispruch" && r.verdict.protectedReason === "krankheit").toBe(true);
  });

  it("verbotene Konsequenz → Korrektur wird übernommen", async () => {
    const bad = JSON.stringify({ aktion: "urteil", verdict: "schuldig", reasoning: "Das Gericht sieht die Schuld als erwiesen an.", consequences: [{ type: "wiedergutmachung", questTitle: "Eisbad nehmen", estimatedMinutes: 10 }] });
    const good = JSON.stringify({ aktion: "urteil", verdict: "verwarnung", reasoning: "Das Gericht belässt es bei einer Verwarnung.", protectedReason: "keiner", consequences: [] });
    const p = scripted(bad, good);
    const r = await aiJudge(p, { ...caseInput, log: [] });
    expect(r.kind === "urteil" && !r.viaFallback && r.verdict.verdict === "verwarnung").toBe(true);
    expect(p.calls[1]!.messages.at(-1)!.content).toContain("Regelbasis verletzt");
  });

  it("KI nicht erreichbar → Fehler, Verfahren bleibt offen", async () => {
    await expect(aiJudge(scripted(), { ...caseInput, log: [] })).rejects.toBeInstanceOf(AiUnavailableError);
  });
});
