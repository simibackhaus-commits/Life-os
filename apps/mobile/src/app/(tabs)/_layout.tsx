import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { missedMandatory } from "@life-os/api";
import { colors } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

type IconName = keyof typeof Ionicons.glyphMap;
const icon =
  (name: IconName) =>
  ({ color, size }: { color: unknown; size: number }) => <Ionicons name={name} size={size} color={color as string} />;

export default function TabsLayout() {
  const { snap, today } = useGame();
  const courtBadge = missedMandatory(snap, today).length + snap.cases.filter((c) => c.status === "offen" || c.status === "verhandlung").length;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Heute", tabBarIcon: icon("flash") }} />
      <Tabs.Screen name="quests" options={{ title: "Quests", tabBarIcon: icon("list") }} />
      <Tabs.Screen name="character" options={{ title: "Charakter", tabBarIcon: icon("person") }} />
      <Tabs.Screen name="court" options={{ title: "Gericht", tabBarIcon: icon("hammer"), tabBarBadge: courtBadge || undefined }} />
      <Tabs.Screen name="settings" options={{ title: "Mehr", tabBarIcon: icon("settings") }} />
    </Tabs>
  );
}
