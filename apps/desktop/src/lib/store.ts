import { CloudStore, LocalStore, createSupabase, type DataStore } from "@life-os/api";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// VITE_LIFE_OS_LOCAL=1 erzwingt den lokalen Modus (ohne Konto), z. B. für UI-Tests.
const forceLocal = import.meta.env.VITE_LIFE_OS_LOCAL === "1";

/** Ist Supabase konfiguriert, läuft die App im Cloud-Modus (mit Login), sonst lokal. */
export const supabase: SupabaseClient | null = url && anonKey && !forceLocal ? createSupabase(url, anonKey, window.localStorage) : null;

export function createLocalStore(): DataStore {
  return new LocalStore(window.localStorage);
}

export function createCloudStore(userId: string): DataStore {
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert");
  return new CloudStore(supabase, userId, window.localStorage);
}
