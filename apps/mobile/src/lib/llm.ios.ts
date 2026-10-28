import { initLlama, type LlamaContext } from "llama.rn";
import type { OnDeviceEngine } from "@life-os/ai";

/** llama.cpp (Metal) über llama.rn – nur im nativen iOS-Build verfügbar, nicht in Expo Go. */
class LlamaEngine implements OnDeviceEngine {
  private ctx: LlamaContext | null = null;
  loadedPath: string | null = null;

  async load(path: string, opts: { contextTokens: number; gpuLayers: number }) {
    this.ctx = await initLlama({ model: path, n_ctx: opts.contextTokens, n_gpu_layers: opts.gpuLayers, use_mlock: false });
    this.loadedPath = path;
  }

  async complete(input: Parameters<OnDeviceEngine["complete"]>[0]) {
    if (!this.ctx) throw new Error("Kein Modell geladen");
    const r = await this.ctx.completion({
      messages: input.messages,
      n_predict: input.maxTokens,
      temperature: input.temperature,
      // Qwen3: Denkmodus aus – spart Zeit und Akku
      enable_thinking: false,
      jinja: true,
      ...(input.jsonSchema ? { response_format: { type: "json_schema" as const, json_schema: { strict: true, schema: input.jsonSchema } } } : {}),
    });
    return { text: r.text, tokensPredicted: r.tokens_predicted, tokensPerSecond: r.timings?.predicted_per_second ?? 0 };
  }

  async release() {
    await this.ctx?.release();
    this.ctx = null;
    this.loadedPath = null;
  }
}

export const ENGINE_AVAILABLE = true;
let engine: LlamaEngine | null = null;
/** Eine Instanz für die ganze App – es ist immer höchstens ein Modell im Speicher. */
export function getEngine(): OnDeviceEngine {
  engine ??= new LlamaEngine();
  return engine;
}
