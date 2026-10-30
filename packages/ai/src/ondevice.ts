/**
 * KI direkt auf dem iPhone (llama.cpp über llama.rn). Diese Datei ist plattformneutral:
 * die native Laufzeit wird als `OnDeviceEngine` hereingereicht, damit Katalog, Empfehlung
 * und Provider ohne iPhone testbar sind.
 */
import { AiUnavailableError, stripThinking, type AiProvider, type AiRequest, type AiStatus } from "./providers.ts";

export type AiProfile = "eco" | "balanced" | "intelligence";

export interface ModelSpec {
  id: string;
  name: string;
  profile: AiProfile;
  /** Download-Adresse (Hugging Face, ohne Anmeldung) */
  url: string;
  fileName: string;
  sizeBytes: number;
  /** SHA-256 laut Hugging Face (LFS) – zur Kontrolle; die App prüft nach dem Download die exakte Dateigröße */
  sha256: string;
  /** Mindest-Arbeitsspeicher des Geräts */
  minRamBytes: number;
  contextTokens: number;
  license: string;
  description: string;
}

const GB = 1024 ** 3;
const HF = "https://huggingface.co/unsloth";

/** Alle Modelle: Qwen3 (Apache-2.0), Quantisierung Q4_K_M. */
export const MODEL_CATALOG: ModelSpec[] = [
  {
    id: "qwen3-0.6b",
    name: "Qwen3 0.6B",
    profile: "eco",
    url: `${HF}/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf`,
    fileName: "Qwen3-0.6B-Q4_K_M.gguf",
    sizeBytes: 396_705_472,
    sha256: "ac2d97712095a558e31573f62f466a3f9d93990898b0ec79d7c974c1780d524a",
    minRamBytes: 3 * GB,
    contextTokens: 4096,
    license: "Apache-2.0",
    description: "Sehr schnell und sparsam. Gut für Quick-Add und kurze Antworten, schwächer bei Gericht und Rat.",
  },
  {
    id: "qwen3-1.7b",
    name: "Qwen3 1.7B",
    profile: "balanced",
    url: `${HF}/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf`,
    fileName: "Qwen3-1.7B-Q4_K_M.gguf",
    sizeBytes: 1_107_409_472,
    sha256: "b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897",
    minRamBytes: 3.5 * GB,
    contextTokens: 4096,
    license: "Apache-2.0",
    description: "Ausgewogen: brauchbares Deutsch, strukturierte Ausgaben, moderater Akkuverbrauch.",
  },
  {
    id: "qwen3-4b",
    name: "Qwen3 4B",
    profile: "intelligence",
    url: `${HF}/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf`,
    fileName: "Qwen3-4B-Q4_K_M.gguf",
    sizeBytes: 2_497_281_312,
    sha256: "f6f851777709861056efcdad3af01da38b31223a3ba26e61a4f8bf3a2195813a",
    minRamBytes: 5.5 * GB,
    contextTokens: 4096,
    license: "Apache-2.0",
    description: "Beste Qualität für Gericht und Rat. Nur auf Geräten mit 6 GB RAM, langsamer und wärmer.",
  },
];

export const PROFILE_LABELS: Record<AiProfile, string> = { eco: "Eco", balanced: "Balanced", intelligence: "Intelligence" };

export interface ModelAdvice {
  model: ModelSpec;
  fits: boolean;
  recommended: boolean;
  reason: string;
}

/**
 * Bewertet jedes Modell für ein Gerät. iOS gibt einer App ohne Sonder-Berechtigung grob die Hälfte des RAM;
 * deshalb zählt das Mindest-RAM, nicht nur die Dateigröße.
 */
export function adviseModels(ramBytes: number | null, freeDiskBytes: number | null): ModelAdvice[] {
  const ram = ramBytes ?? 4 * GB;
  const fitting = MODEL_CATALOG.filter((m) => ram >= m.minRamBytes);
  // Empfehlung: Balanced, wenn es passt – sonst das größte passende Modell.
  const rec = fitting.find((m) => m.profile === "balanced") ?? fitting.at(-1) ?? null;
  return MODEL_CATALOG.map((m) => {
    const ramOk = ram >= m.minRamBytes;
    const diskOk = freeDiskBytes === null || freeDiskBytes > m.sizeBytes * 1.1;
    const reason = !ramOk
      ? `Braucht mind. ${(m.minRamBytes / GB).toFixed(1)} GB RAM (Gerät: ${(ram / GB).toFixed(1)} GB).`
      : !diskOk
        ? `Zu wenig freier Speicher (${(m.sizeBytes / GB).toFixed(1)} GB nötig).`
        : m === rec
          ? "Empfohlen für dieses Gerät."
          : m.profile === "intelligence"
            ? "Möglich, aber langsamer und wärmer."
            : "Passt.";
    return { model: m, fits: ramOk && diskOk, recommended: m === rec && diskOk, reason };
  });
}

/** Die native Laufzeit (llama.rn) in minimaler Form. */
export interface OnDeviceEngine {
  load(path: string, opts: { contextTokens: number; gpuLayers: number }): Promise<void>;
  complete(input: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    jsonSchema?: Record<string, unknown>;
    temperature: number;
    maxTokens: number;
  }): Promise<{ text: string; tokensPredicted: number; tokensPerSecond: number }>;
  release(): Promise<void>;
  readonly loadedPath: string | null;
}

export interface OnDeviceStats {
  loadMs: number | null;
  lastTokensPerSecond: number | null;
  lastTokens: number | null;
  lastMs: number | null;
}

/**
 * Provider für die Geräte-KI. Lädt das Modell beim ersten Aufruf (dauert einige Sekunden),
 * kürzt lange Verläufe (kleiner Kontext) und erzwingt JSON per Grammatik, wenn ein Schema verlangt ist.
 */
export class OnDeviceProvider implements AiProvider {
  readonly id = "geraet" as const;
  readonly external = false;
  readonly label: string;
  readonly stats: OnDeviceStats = { loadMs: null, lastTokensPerSecond: null, lastTokens: null, lastMs: null };
  private loading: Promise<void> | null = null;

  constructor(
    private engine: OnDeviceEngine,
    readonly model: ModelSpec,
    private modelPath: string,
    private exists: () => Promise<boolean>,
    private now: () => number = () => Date.now(),
  ) {
    this.label = `Auf dem iPhone · ${model.name}`;
  }

  private async ensureLoaded() {
    if (this.engine.loadedPath === this.modelPath) return;
    if (!this.loading) {
      this.loading = (async () => {
        if (!(await this.exists())) throw new AiUnavailableError(`Modell „${this.model.name}“ ist nicht heruntergeladen.`);
        if (this.engine.loadedPath) await this.engine.release();
        const t = this.now();
        await this.engine.load(this.modelPath, { contextTokens: this.model.contextTokens, gpuLayers: 99 });
        this.stats.loadMs = this.now() - t;
      })().finally(() => (this.loading = null));
    }
    await this.loading;
  }

  /** true, wenn das Modell schon im Speicher liegt (Antworten ohne Ladezeit). */
  get loaded(): boolean {
    return this.engine.loadedPath === this.modelPath;
  }

  /**
   * Lädt das Modell vorab (z. B. kurz nach App-Start), damit die erste Frage nicht ~20 s wartet.
   * Fehler werden verschluckt – generate() meldet sie später verständlich.
   */
  async preload(): Promise<boolean> {
    try {
      await this.ensureLoaded();
      return true;
    } catch {
      return false;
    }
  }

  /** Gibt den Arbeitsspeicher frei (App im Hintergrund), damit iOS die App nicht beendet. */
  async unload(): Promise<void> {
    if (this.loading) await this.loading.catch(() => {});
    if (this.loaded) await this.engine.release();
  }

  async generate(req: AiRequest): Promise<string> {
    try {
      await this.ensureLoaded();
    } catch (e) {
      if (e instanceof AiUnavailableError) throw e;
      throw new AiUnavailableError(`Modell konnte nicht geladen werden (${e instanceof Error ? e.message : String(e)}). Evtl. zu wenig Arbeitsspeicher – kleineres Modell wählen.`);
    }
    const messages = fitToContext(req, this.model.contextTokens);
    const t = this.now();
    try {
      const out = await this.engine.complete({ messages, jsonSchema: req.schema, temperature: req.temperature ?? 0.4, maxTokens: req.schema ? 700 : 400 });
      Object.assign(this.stats, { lastTokensPerSecond: out.tokensPerSecond, lastTokens: out.tokensPredicted, lastMs: this.now() - t });
      return stripThinking(out.text);
    } catch (e) {
      throw new AiUnavailableError(`Geräte-KI-Fehler: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async status(): Promise<AiStatus> {
    const ok = await this.exists();
    return ok ? { ok: true, detail: `${this.model.name} bereit (offline)`, models: [this.model.id] } : { ok: false, detail: `${this.model.name} ist nicht heruntergeladen.` };
  }
}

/** Grobe Token-Schätzung (deutsch ≈ 3,5 Zeichen/Token). */
export const estimateTokens = (s: string) => Math.ceil(s.length / 3.5);

/**
 * Hält Systemprompt + Verlauf im Kontextfenster: älteste Nachrichten fallen zuerst weg,
 * die letzte Nutzernachricht bleibt immer erhalten. Reserve für die Antwort: 800 Token.
 */
export function fitToContext(req: AiRequest, contextTokens: number): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const schemaHint = req.schema ? `\n\nAntworte ausschließlich mit JSON nach diesem Schema:\n${JSON.stringify(req.schema)}` : "";
  const budget = contextTokens - 800;
  let system = req.system + schemaHint;
  if (estimateTokens(system) > budget * 0.7) system = system.slice(0, Math.floor(budget * 0.7 * 3.5));
  let used = estimateTokens(system);
  const kept: AiRequest["messages"] = [];
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i]!;
    const cost = estimateTokens(m.content);
    if (kept.length > 0 && used + cost > budget) break;
    kept.unshift(kept.length === 0 && used + cost > budget ? { ...m, content: m.content.slice(-Math.floor((budget - used) * 3.5)) } : m);
    used += cost;
  }
  if (kept[0]?.role === "assistant") kept.shift();
  return [{ role: "system", content: system }, ...kept];
}
