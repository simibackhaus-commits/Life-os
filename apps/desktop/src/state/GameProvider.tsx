import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { localToday } from "@life-os/core";
import type { CompletionOutcome, DataStore, Snapshot, SyncState } from "@life-os/api";

export interface Toast {
  id: number;
  kind: "xp" | "info" | "error";
  text: string;
}

interface GameCtx {
  store: DataStore;
  snap: Snapshot;
  today: string;
  sync: { state: SyncState; pending: number };
  toasts: Toast[];
  levelUp: number | null;
  dismissLevelUp(): void;
  notify(kind: Toast["kind"], text: string): void;
  /** Führt eine Store-Aktion aus, meldet Fehler als Toast und lädt neu. */
  run<T>(fn: (s: DataStore) => Promise<T>): Promise<T | undefined>;
  complete(input: { questId: string; occurrenceKey: string; dueAt: string | null }): Promise<CompletionOutcome | undefined>;
  reload(): Promise<void>;
}

const Ctx = createContext<GameCtx | null>(null);

export function useGame(): GameCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useGame außerhalb von GameProvider");
  return c;
}

export function GameProvider({ store, children }: { store: DataStore; children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sync, setSync] = useState<{ state: SyncState; pending: number }>({ state: "lokal", pending: 0 });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [today, setToday] = useState(localToday());
  const toastId = useRef(0);

  const notify = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);

  const reload = useCallback(async () => {
    try {
      setSnap(await store.load());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [store]);

  useEffect(() => {
    void reload();
    const unsub = store.subscribe(() => void reload());
    const unsync = store.onSyncState((state, pending) => setSync({ state, pending }));
    // Tageswechsel erkennen (App läuft oft über Mitternacht)
    const t = setInterval(() => setToday(localToday()), 60_000);
    return () => {
      unsub();
      unsync();
      clearInterval(t);
    };
  }, [store, reload]);

  const run = useCallback(
    async <T,>(fn: (s: DataStore) => Promise<T>) => {
      try {
        return await fn(store);
      } catch (e) {
        notify("error", e instanceof Error ? e.message : String(e));
        return undefined;
      }
    },
    [store, notify],
  );

  const complete = useCallback(
    async (input: { questId: string; occurrenceKey: string; dueAt: string | null }) => {
      const r = await run((s) => s.completeOccurrence(input));
      if (!r) return r;
      if (r.applied) {
        notify("xp", `+${r.reward.xp} XP · +${r.reward.coins} Coins${r.queued ? " (wird synchronisiert)" : ""}`);
        if (r.levelAfter > r.levelBefore) setLevelUp(r.levelAfter);
      } else if (r.reason === "already_completed") notify("info", "Bereits erledigt.");
      return r;
    },
    [run, notify],
  );

  const value = useMemo<GameCtx | null>(
    () =>
      snap && {
        store,
        snap,
        today,
        sync,
        toasts,
        levelUp,
        dismissLevelUp: () => setLevelUp(null),
        notify,
        run,
        complete,
        reload,
      },
    [store, snap, today, sync, toasts, levelUp, notify, run, complete, reload],
  );

  if (loadError && !snap)
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div className="panel max-w-md p-6">
          <p className="heading mb-2">Spielstand konnte nicht geladen werden</p>
          <p className="text-sm text-muted">{loadError}</p>
          <button className="mt-4 text-electric underline" onClick={() => void reload()}>
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  if (!value) return <div className="grid h-full place-items-center text-muted">Lade Spielstand…</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
