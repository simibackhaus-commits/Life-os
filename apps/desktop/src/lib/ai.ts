import { useCallback, useEffect, useMemo, useState } from "react";
import { createProvider, mayShareGameData, parseAiSettings, type AiProvider, type AiSettings, type AiStatus, type FetchFn } from "@life-os/ai";
import type { DataStore } from "@life-os/api";

/** Nur auf diesem Gerät gespeichert – wird nie synchronisiert (Gemini-Schlüssel bleibt lokal). */
const KEY = "life-os/ai-settings";

function loadSettings(): AiSettings {
  try {
    return parseAiSettings(JSON.parse(window.localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return parseAiSettings({});
  }
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * In der Desktop-App laufen KI-Anfragen über das Tauri-HTTP-Plugin (Rust, ohne CORS, nur freigegebene Adressen).
 * Im Browser (Entwicklung) über fetch – Ollama erlaubt localhost-Ursprünge standardmäßig.
 */
const aiFetch: FetchFn = async (url, init) => {
  if (isTauri()) {
    const { fetch } = await import("@tauri-apps/plugin-http");
    return fetch(url, init);
  }
  return window.fetch(url, init);
};

export interface AiState {
  settings: AiSettings;
  save(next: AiSettings): void;
  provider: AiProvider | null;
  status: AiStatus | null;
  checking: boolean;
  check(): Promise<AiStatus | null>;
}

export function useAi(store: DataStore): AiState {
  const [settings, setSettings] = useState<AiSettings>(loadSettings);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const provider = useMemo(() => createProvider(settings, aiFetch), [settings]);

  useEffect(() => {
    store.setAi(provider ? { provider, shareGameData: mayShareGameData(settings, provider) } : null);
  }, [store, provider, settings]);

  const check = useCallback(async () => {
    if (!provider) {
      setStatus(null);
      return null;
    }
    setChecking(true);
    try {
      const s = await provider.status();
      setStatus(s);
      return s;
    } finally {
      setChecking(false);
    }
  }, [provider]);

  useEffect(() => {
    void check();
  }, [check]);

  const save = useCallback((next: AiSettings) => {
    const parsed = parseAiSettings(next);
    window.localStorage.setItem(KEY, JSON.stringify(parsed));
    setSettings(parsed);
  }, []);

  return { settings, save, provider, status, checking, check };
}
