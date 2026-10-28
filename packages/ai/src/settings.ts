import { z } from "zod";
import { DEFAULT_GEMINI_MODEL, DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL, GeminiProvider, OllamaProvider, type AiProvider, type FetchFn } from "./providers.ts";

/**
 * KI-Einstellungen. Werden nur auf dem jeweiligen Gerät gespeichert (nie synchronisiert),
 * damit ein Gemini-Schlüssel das Gerät nicht verlässt.
 */
export const AiSettingsSchema = z.object({
  provider: z.enum(["aus", "ollama", "gemini"]).default("aus"),
  ollamaUrl: z.string().url().default(DEFAULT_OLLAMA_URL),
  ollamaModel: z.string().min(1).default(DEFAULT_OLLAMA_MODEL),
  geminiKey: z.string().default(""),
  geminiModel: z.string().min(1).default(DEFAULT_GEMINI_MODEL),
  /** Zustimmung: Im Free Tier darf Google Ein- und Ausgaben zur Produktverbesserung nutzen. */
  geminiConsent: z.boolean().default(false),
  /** Darf die KI Spieldaten (Quests, Level, Abschlüsse) als Kontext erhalten? */
  shareGameData: z.boolean().default(false),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

export const DEFAULT_AI_SETTINGS: AiSettings = AiSettingsSchema.parse({});

export function parseAiSettings(raw: unknown): AiSettings {
  const r = AiSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : DEFAULT_AI_SETTINGS;
}

/** Erzeugt den Anbieter – oder null, wenn die KI aus ist oder eine Zustimmung fehlt. */
export function createProvider(s: AiSettings, fetchFn: FetchFn): AiProvider | null {
  if (s.provider === "ollama") return new OllamaProvider(fetchFn, s.ollamaUrl, s.ollamaModel);
  if (s.provider === "gemini" && s.geminiConsent && s.geminiKey.trim()) return new GeminiProvider(fetchFn, s.geminiKey.trim(), s.geminiModel);
  return null;
}

/** Externe Anbieter bekommen Spieldaten nur, wenn beides freigegeben ist. */
export function mayShareGameData(s: AiSettings, provider: AiProvider | null): boolean {
  if (!provider || !s.shareGameData) return false;
  return provider.external ? s.geminiConsent : true;
}
