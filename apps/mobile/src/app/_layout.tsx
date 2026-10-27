import type { Session } from "@supabase/supabase-js";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { DataStore } from "@life-os/api";
import { LevelUp, Toast } from "@/components/ui";
import { LockScreen, LoginScreen } from "@/components/gates";
import { createCloudStore, createLocalStore, supabase } from "@/lib/backend";
import { getPref, rescheduleReminders } from "@/lib/device";
import { colors, s } from "@/lib/theme";
import { GameProvider, useGame } from "@/state/GameProvider";

function Loading() {
  return (
    <View style={[s.screen, { justifyContent: "center" }]}>
      <ActivityIndicator color={colors.gold} />
    </View>
  );
}

/** Plant Erinnerungen neu, sobald sich der Spielstand ändert. */
function ReminderSync() {
  const { snap, today } = useGame();
  useEffect(() => {
    void rescheduleReminders(snap, today).catch(() => {});
  }, [snap, today]);
  return null;
}

function Shell({ store }: { store: DataStore }) {
  return (
    <GameProvider store={store}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        {(
          [
            ["shop", "Belohnungsshop"],
            ["skills", "Skilltree"],
            ["calendar", "Kalender"],
            ["stats", "Statistiken"],
            ["career", "Karriere"],
            ["fitness", "Fitness"],
            ["finance", "Finanzen"],
          ] as const
        ).map(([name, title]) => (
          <Stack.Screen key={name} name={name} options={{ headerShown: true, title, headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.gold }} />
        ))}
        <Stack.Screen
          name="quick-add"
          options={{ presentation: "modal", headerShown: true, title: "Quick-Add", headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.gold }}
        />
      </Stack>
      <ReminderSync />
      <Toast />
      <LevelUp />
    </GameProvider>
  );
}

function App() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  const [store, setStore] = useState<DataStore | null>(null);
  const [locked, setLocked] = useState<boolean | null>(null);

  useEffect(() => {
    void getPref("biometric").then(setLocked);
    if (!supabase) {
      void createLocalStore().then(setStore);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!supabase) return;
    setStore(null);
    if (userId) void createCloudStore(userId).then(setStore);
  }, [userId]);

  if (locked === null || session === undefined) return <Loading />;
  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />;
  if (supabase && !session) return <LoginScreen />;
  if (!store) return <Loading />;
  return <Shell key={userId ?? "local"} store={store} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <App />
    </SafeAreaProvider>
  );
}
