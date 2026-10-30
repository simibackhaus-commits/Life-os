import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
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

  // Nur bei Änderungen, die den Anbieter betreffen, neu erzeugen – sonst würde das Modell unnötig neu geladen.
  const { provider: kind, deviceModel, ollamaUrl, ollamaModel, geminiKey, geminiModel, geminiConsent } = settings;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const provider = useMemo(() => buildProvider(settings), [kind, deviceModel, ollamaUrl, ollamaModel, geminiKey, geminiModel, geminiConsent]);

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

  // Geräte-KI: kurz nach dem Start vorladen (sonst ~20 s Wartezeit bei der ersten Frage),
  // im Hintergrund freigeben, damit iOS die App wegen des Speichers nicht beendet.
  useEffect(() => {
    if (!(provider instanceof OnDeviceProvider)) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const warm = () => {
      timer = setTimeout(() => void provider.preload(), 3000);
    };
    warm();
    const sub = AppState.addEventListener("change", (state) => {
      if (timer) clearTimeout(timer);
      if (state === "active") warm();
      else if (state === "background") void provider.unload();
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
      void provider.unload();
    };
  }, [provider]);

  const save = useCallback(async (next: AiSettings) => {
    const parsed = parseAiSettings(next);
    await AsyncStorage.setItem(KEY, JSON.stringify(parsed));
    setSettings(parsed);
  }, []);

  return { settings, save, provider, status, check };
}
