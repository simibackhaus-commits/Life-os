import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { AppState, Platform } from "react-native";
import { CloudStore, HydratedStorage, LocalStore, STORAGE_KEYS, type DataStore } from "@life-os/api";

const extra = (Constants.expoConfig?.extra ?? {}) as { supabaseUrl?: string; supabaseAnonKey?: string };

/**
 * Supabase-Sitzung im iOS-Schlüsselbund (SecureStore). SecureStore-Werte sind auf ~2 KB begrenzt,
 * daher wird die Sitzung in Teile zerlegt. Im Web (Vorschau) dient localStorage als Ersatz.
 */
const CHUNK = 1800;
const secureSession = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(key) ?? null;
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!count) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) parts.push((await SecureStore.getItemAsync(`${key}.${i}`)) ?? "");
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") return void globalThis.localStorage?.setItem(key, value);
    await this.removeItem(key);
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(`${key}.n`, String(n));
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") return void globalThis.localStorage?.removeItem(key);
    const count = Number(await SecureStore.getItemAsync(`${key}.n`));
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

// SecureStore erlaubt nur [A-Za-z0-9._-] in Schlüsseln
const SESSION_KEY = "life-os-auth";

export const supabase: SupabaseClient | null =
  extra.supabaseUrl && extra.supabaseAnonKey
    ? createClient(extra.supabaseUrl, extra.supabaseAnonKey, {
        auth: { storage: secureSession, storageKey: SESSION_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null;

// Token nur auffrischen, solange die App im Vordergrund ist (Empfehlung von Supabase für React Native).
if (supabase && Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

async function storage() {
  return HydratedStorage.create(AsyncStorage, STORAGE_KEYS);
}

export async function createLocalStore(): Promise<DataStore> {
  return new LocalStore(await storage());
}

export async function createCloudStore(userId: string): Promise<CloudStore> {
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert");
  return new CloudStore(supabase, userId, await storage());
}
