import type { KeyValueStorage } from "./local-store.ts";

export interface AsyncKeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Synchroner Speicher über einem asynchronen (z. B. AsyncStorage in React Native).
 * Liest beim Start die benötigten Schlüssel ein und schreibt Änderungen im Hintergrund durch.
 */
export class HydratedStorage implements KeyValueStorage {
  private cache = new Map<string, string>();
  private pending: Promise<unknown> = Promise.resolve();

  private constructor(private backend: AsyncKeyValueStorage) {}

  static async create(backend: AsyncKeyValueStorage, keys: string[]): Promise<HydratedStorage> {
    const s = new HydratedStorage(backend);
    for (const k of keys) {
      const v = await backend.getItem(k);
      if (v !== null) s.cache.set(k, v);
    }
    return s;
  }

  getItem(key: string) {
    return this.cache.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.cache.set(key, value);
    this.pending = this.pending.then(() => this.backend.setItem(key, value)).catch(() => {});
  }

  removeItem(key: string) {
    this.cache.delete(key);
    this.pending = this.pending.then(() => this.backend.removeItem(key)).catch(() => {});
  }

  /** Wartet, bis alle Schreibvorgänge im Hintergrund abgeschlossen sind. */
  flushWrites() {
    return this.pending;
  }
}

/** Alle Schlüssel, die LocalStore und Outbox verwenden. */
export const STORAGE_KEYS = ["life-os/local/v1", "life-os/outbox/v1"];
