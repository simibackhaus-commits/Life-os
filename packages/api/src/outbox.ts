import type { KeyValueStorage } from "./local-store.ts";

/**
 * Offline-Warteschlange für spielrelevante Aktionen.
 * Jede Aktion trägt ihre Event-ID; der Server dedupliziert darüber, daher sind Wiederholungen sicher.
 */
export type OutboxItem =
  | { kind: "complete"; eventId: string; questId: string; occurrenceKey: string; dueAt: string | null; queuedAt: string }
  | { kind: "uncomplete"; eventId: string; instanceId: string; queuedAt: string };

const KEY = "life-os/outbox/v1";

export class Outbox {
  constructor(private storage: KeyValueStorage) {}

  list(): OutboxItem[] {
    try {
      return JSON.parse(this.storage.getItem(KEY) ?? "[]") as OutboxItem[];
    } catch {
      return [];
    }
  }

  push(item: OutboxItem) {
    const items = this.list();
    if (items.some((i) => i.eventId === item.eventId)) return; // bereits eingereiht, Position behalten
    this.storage.setItem(KEY, JSON.stringify([...items, item]));
  }

  remove(eventId: string) {
    this.storage.setItem(KEY, JSON.stringify(this.list().filter((i) => i.eventId !== eventId)));
  }

  /**
   * Arbeitet die Warteschlange der Reihe nach ab. Bei einem Netzwerkfehler wird abgebrochen
   * (Reihenfolge bleibt erhalten); fachliche Ablehnungen werden verworfen.
   */
  async flush(send: (item: OutboxItem) => Promise<"ok" | "rejected">): Promise<{ sent: number; remaining: number }> {
    let sent = 0;
    for (const item of this.list()) {
      try {
        await send(item);
        this.remove(item.eventId);
        sent++;
      } catch {
        break;
      }
    }
    return { sent, remaining: this.list().length };
  }
}

/** Unterscheidet Netzwerkprobleme (=> später erneut senden) von Serverablehnungen. */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true; // fetch failed
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
  return /failed to fetch|network|load failed|fetch failed|timeout/i.test(msg);
}
