import { CloudStore, LocalStore, createSupabase, type DataStore } from "@life-os/api";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Ist Supabase konfiguriert, läuft die App im Cloud-Modus (mit Login), sonst lokal. */
export const supabase: SupabaseClient | null = url && anonKey ? createSupabase(url, anonKey, window.localStorage) : null;

export function createLocalStore(): DataStore {
  return new LocalStore(window.localStorage);
}

export function createCloudStore(userId: string): DataStore {
  if (!supabase) throw new Error("Supabase ist nicht konfiguriert");
  return new CloudStore(supabase, userId, window.localStorage);
}
