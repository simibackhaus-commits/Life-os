import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MODEL_CATALOG, OnDeviceProvider, createProvider, mayShareGameData, parseAiSettings, type AiProvider, type AiSettings, type AiStatus, type FetchFn } from "@life-os/ai";
import type { DataStore } from "@life-os/api";
import { getEngine } from "./llm";
import { modelExists, modelPath } from "./models";

/** Nur auf diesem iPhone gespeichert – wird nie synchronisiert. */
const KEY = "life-os/ai-settings";

const fetchFn: FetchFn = (url, init) => fetch(url, init);

export interface AiState {
  settings: AiSettings;
  save(next: AiSettings): Promise<void>;
  provider: AiProvider | null;
  status: AiStatus | null;
  check(): Promise<AiStatus | null>;
}

/** Erzeugt den aktiven Anbieter. Standard auf dem iPhone: Geräte-KI (offline). */
export function buildProvider(s: AiSettings): AiProvider | null {
  if (s.provider === "geraet") {
    const model = MODEL_CATALOG.find((m) => m.id === s.deviceModel) ?? MODEL_CATALOG[1]!;
    return new OnDeviceProvider(getEngine(), model, modelPath(model), () => modelExists(model));
  }
  return createProvider(s, fetchFn);
}

export function useAi(store: DataStore): AiState {
  const [settings, setSettings] = useState<AiSettings>(parseAiSettings({}));
  const [status, setStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(KEY).then((raw) => {
      if (raw) setSettings(parseAiSettings(JSON.parse(raw)));
    });
  }, []);

  const provider = useMemo(() => buildProvider(settings), [settings]);

  useEffect(() => {
    store.setAi(provider ? { provider, shareGameData: mayShareGameData(settings, provider) } : null);
  }, [store, provider, settings]);

  const check = useCallback(async () => {
    if (!provider) {
      setStatus(null);
      return null;
    }
    const s = await provider.status();
    setStatus(s);
    return s;
  }, [provider]);

  useEffect(() => {
    void check();
  }, [check]);

  const save = useCallback(async (next: AiSettings) => {
    const parsed = parseAiSettings(next);
    await AsyncStorage.setItem(KEY, JSON.stringify(parsed));
    setSettings(parsed);
  }, []);

  return { settings, save, provider, status, check };
}
