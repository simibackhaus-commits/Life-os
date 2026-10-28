/**
 * KI-Anbieter hinter einer gemeinsamen Schnittstelle.
 * Standard: Ollama (lokal, kostenlos). Optional: Gemini Free Tier (nur nach ausdrücklicher Zustimmung).
 * Kostenpflichtige Anbieter sind hier bewusst nicht wählbar.
 */

export type FetchFn = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiRequest {
  system: string;
  messages: AiMessage[];
  /** JSON-Schema: Antwort muss ein passendes JSON-Objekt sein. */
  schema?: Record<string, unknown>;
  temperature?: number;
}

export interface AiStatus {
  ok: boolean;
  detail: string;
  models?: string[];
}

export interface AiProvider {
  readonly id: "ollama" | "gemini";
  readonly label: string;
  /** true, wenn Daten das eigene Gerät/Netz verlassen. */
  readonly external: boolean;
  generate(req: AiRequest): Promise<string>;
  status(): Promise<AiStatus>;
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

function withTimeout(ms: number) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

function schemaHint(schema?: Record<string, unknown>) {
  return schema ? `\n\nAntworte ausschließlich mit einem JSON-Objekt nach diesem Schema, ohne Text davor oder danach:\n${JSON.stringify(schema)}` : "";
}

// ───────────── Ollama ─────────────

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "qwen3:8b";

export class OllamaProvider implements AiProvider {
  readonly id = "ollama" as const;
  readonly label: string;
  readonly external = false;

  constructor(
    private fetchFn: FetchFn,
    private baseUrl = DEFAULT_OLLAMA_URL,
    private model = DEFAULT_OLLAMA_MODEL,
    private timeoutMs = 180_000,
  ) {
    this.label = `Ollama · ${model}`;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async generate(req: AiRequest): Promise<string> {
    const t = withTimeout(this.timeoutMs);
    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: t.signal,
        body: JSON.stringify({
          model: this.model,
          stream: false,
          think: false,
          ...(req.schema ? { format: req.schema } : {}),
          options: { temperature: req.temperature ?? 0.4 },
          messages: [{ role: "system", content: req.system + schemaHint(req.schema) }, ...req.messages],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (res.status === 404) throw new AiUnavailableError(`Modell „${this.model}“ ist nicht installiert. Im Terminal: ollama pull ${this.model}`);
        throw new AiUnavailableError(`Ollama antwortet mit Fehler ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
      }
      const data = (await res.json()) as { message?: { content?: string } };
      return stripThinking(data.message?.content ?? "");
    } catch (e) {
      if (e instanceof AiUnavailableError) throw e;
      throw new AiUnavailableError(`Ollama nicht erreichbar (${this.baseUrl}). Läuft Ollama?`);
    } finally {
      t.done();
    }
  }

  async status(): Promise<AiStatus> {
    const t = withTimeout(5000);
    try {
      const res = await this.fetchFn(`${this.baseUrl}/api/tags`, { signal: t.signal });
      if (!res.ok) return { ok: false, detail: `Ollama antwortet mit Fehler ${res.status}` };
      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const models = (data.models ?? []).map((m) => m.name);
      const installed = models.some((m) => m === this.model || m === `${this.model}:latest`);
      return installed
        ? { ok: true, detail: `Verbunden – ${this.model} bereit`, models }
        : { ok: false, detail: `Ollama läuft, aber „${this.model}“ fehlt. Im Terminal: ollama pull ${this.model}`, models };
    } catch {
      return { ok: false, detail: `Ollama nicht erreichbar (${this.baseUrl}). Ist Ollama installiert und gestartet?` };
    } finally {
      t.done();
    }
  }
}

/** Manche Modelle (z. B. Qwen3) schreiben Denkschritte in <think>…</think>. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// ───────────── Gemini (Free Tier) ─────────────

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

export class GeminiProvider implements AiProvider {
  readonly id = "gemini" as const;
  readonly label: string;
  readonly external = true;

  constructor(
    private fetchFn: FetchFn,
    private apiKey: string,
    private model = DEFAULT_GEMINI_MODEL,
    private timeoutMs = 60_000,
  ) {
    this.label = `Gemini Free Tier · ${model}`;
  }

  private headers() {
    return { "Content-Type": "application/json", "x-goog-api-key": this.apiKey };
  }

  async generate(req: AiRequest): Promise<string> {
    const t = withTimeout(this.timeoutMs);
    try {
      const res = await this.fetchFn(`${GEMINI_BASE}/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: this.headers(),
        signal: t.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system + schemaHint(req.schema) }] },
          contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: { temperature: req.temperature ?? 0.4, ...(req.schema ? { responseMimeType: "application/json" } : {}) },
        }),
      });
      if (!res.ok) throw new AiUnavailableError(geminiError(res.status));
      const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    } catch (e) {
      if (e instanceof AiUnavailableError) throw e;
      throw new AiUnavailableError("Gemini nicht erreichbar (keine Internetverbindung?)");
    } finally {
      t.done();
    }
  }

  async status(): Promise<AiStatus> {
    const t = withTimeout(8000);
    try {
      const res = await this.fetchFn(`${GEMINI_BASE}/models?pageSize=200`, { headers: this.headers(), signal: t.signal });
      if (!res.ok) return { ok: false, detail: geminiError(res.status) };
      const data = (await res.json()) as { models?: Array<{ name: string; supportedGenerationMethods?: string[] }> };
      const models = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""));
      const known = models.includes(this.model) || this.model.endsWith("-latest");
      return known ? { ok: true, detail: `Verbunden – ${this.model}`, models } : { ok: false, detail: `Modell „${this.model}“ nicht gefunden`, models };
    } catch {
      return { ok: false, detail: "Gemini nicht erreichbar (keine Internetverbindung?)" };
    } finally {
      t.done();
    }
  }
}

function geminiError(status: number): string {
  if (status === 429) return "Kostenloses Gemini-Kontingent ist erschöpft – später erneut versuchen.";
  if (status === 400 || status === 401 || status === 403) return `Gemini lehnt den Schlüssel oder das Modell ab (Fehler ${status}).`;
  return `Gemini antwortet mit Fehler ${status}`;
}
