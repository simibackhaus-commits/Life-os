import type { OnDeviceEngine } from "@life-os/ai";

/**
 * Platzhalter für Web-Vorschau und Expo Go: Die Geräte-KI gibt es nur im nativen iOS-Build (llm.ios.ts).
 * Metro wählt auf iOS automatisch llm.ios.ts.
 */
export const ENGINE_AVAILABLE = false;

export function getEngine(): OnDeviceEngine {
  return {
    loadedPath: null,
    async load() {
      throw new Error("Die Geräte-KI läuft nur in der installierten iPhone-App (nicht im Browser oder in Expo Go).");
    },
    async complete() {
      throw new Error("Keine Geräte-KI verfügbar");
    },
    async release() {},
  };
}
