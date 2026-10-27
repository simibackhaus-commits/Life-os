import NetInfo from "@react-native-community/netinfo";
import * as Haptics from "expo-haptics";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { localToday, type DaySettlement } from "@life-os/core";
import { CloudStore, type CompletionOutcome, type DataStore, type Snapshot, type SyncState } from "@life-os/api";
import { colors, s } from "@/lib/theme";

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
  toast: Toast | null;
  levelUp: number | null;
  dismissLevelUp(): void;
  settlement: DaySettlement[] | null;
  dismissSettlement(): void;
  notify(kind: Toast["kind"], text: string): void;
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

const haptic = (fn: () => Promise<void>) => {
  if (Platform.OS !== "web") void fn().catch(() => {});
};

export function GameProvider({ store, children }: { store: DataStore; children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sync, setSync] = useState<{ state: SyncState; pending: number }>({ state: "lokal", pending: 0 });
  const [toast, setToast] = useState<Toast | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [settlement, setSettlement] = useState<DaySettlement[] | null>(null);
  const [today, setToday] = useState(localToday());
  const id = useRef(0);

  const notify = useCallback((kind: Toast["kind"], text: string) => {
    const t = { id: ++id.current, kind, text };
    setToast(t);
    setTimeout(() => setToast((cur) => (cur?.id === t.id ? null : cur)), kind === "error" ? 6000 : 2800);
  }, []);

  const reload = useCallback(async () => {
    try {
      setSnap(await store.load());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [store]);

  // Tagesabschluss beim Start und bei neuem Spieltag (04:00)
  useEffect(() => {
    void store
      .settleDays()
      .then((list) => {
        if (list.length === 0) return;
        haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
        setSettlement(list);
      })
      .catch(() => {});
  }, [store, today]);

  useEffect(() => {
    void reload();
    const unsub = store.subscribe(() => void reload());
    const unsync = store.onSyncState((state, pending) => setSync({ state, pending }));
    // Offline-Warteschlange senden, sobald das Netz zurück ist
    const unnet = NetInfo.addEventListener((n) => {
      if (n.isConnected && store instanceof CloudStore) void store.flush();
    });
    const t = setInterval(() => setToday(localToday()), 60_000);
    return () => {
      unsub();
      unsync();
      unnet();
      clearInterval(t);
    };
  }, [store, reload]);

  const run = useCallback(
    async <T,>(fn: (s: DataStore) => Promise<T>) => {
      try {
        return await fn(store);
      } catch (e) {
        haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
        notify("error", e instanceof Error ? e.message : String(e));
        return undefined;
      }
    },
    [store, notify],
  );

  const complete = useCallback(
    async (input: { questId: string; occurrenceKey: string; dueAt: string | null }) => {
      haptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
      const r = await run((s) => s.completeOccurrence(input));
      if (!r) return r;
      if (r.applied) {
        haptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
        notify("xp", `+${r.reward.xp} XP · +${r.reward.coins} Coins vorgemerkt${r.queued ? " (offline gespeichert)" : ""}`);
        if (r.levelAfter > r.levelBefore) setLevelUp(r.levelAfter);
      } else if (r.reason === "already_completed") notify("info", "Bereits erledigt.");
      return r;
    },
    [run, notify],
  );

  const value = useMemo<GameCtx | null>(
    () => snap && { store, snap, today, sync, toast, levelUp, dismissLevelUp: () => setLevelUp(null), settlement, dismissSettlement: () => setSettlement(null), notify, run, complete, reload },
    [store, snap, today, sync, toast, levelUp, settlement, notify, run, complete, reload],
  );

  if (loadError && !snap)
    return (
      <View style={[s.screen, { justifyContent: "center", padding: 24 }]}>
        <Text style={[s.h1, { fontSize: 18 }]}>Spielstand konnte nicht geladen werden</Text>
        <Text style={[s.muted, { marginVertical: 12 }]}>{loadError}</Text>
        <Pressable onPress={() => void reload()}>
          <Text style={{ color: colors.blue }}>Erneut versuchen</Text>
        </Pressable>
      </View>
    );
  if (!value)
    return (
      <View style={[s.screen, { justifyContent: "center" }]}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
