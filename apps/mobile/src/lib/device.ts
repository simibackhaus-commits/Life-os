import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { addDays } from "@life-os/core";
import { todaysItems, type Snapshot } from "@life-os/api";

const PREF_REMINDERS = "life-os/pref/reminders";
const PREF_BIOMETRIC = "life-os/pref/biometric";
const PREF_OFFLINE = "life-os/pref/offline";

/** „Ohne Konto spielen“ – Spielstand nur auf diesem Gerät. */
export async function getOfflineMode(): Promise<boolean> {
  return (await AsyncStorage.getItem(PREF_OFFLINE)) === "1";
}

export async function setOfflineMode(on: boolean) {
  await AsyncStorage.setItem(PREF_OFFLINE, on ? "1" : "0");
}
/** iOS erlaubt höchstens 64 geplante Benachrichtigungen pro App. */
const MAX_SCHEDULED = 40;

export async function getPref(key: "reminders" | "biometric"): Promise<boolean> {
  return (await AsyncStorage.getItem(key === "reminders" ? PREF_REMINDERS : PREF_BIOMETRIC)) === "1";
}

export async function setPref(key: "reminders" | "biometric", on: boolean) {
  await AsyncStorage.setItem(key === "reminders" ? PREF_REMINDERS : PREF_BIOMETRIC, on ? "1" : "0");
}

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const r = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
  return r.granted;
}

/**
 * Plant lokale Erinnerungen für alle offenen Quests mit Uhrzeit (heute + 2 Tage).
 * Wird nach jeder Änderung neu berechnet; funktioniert in Expo Go ohne Server.
 */
export async function rescheduleReminders(snap: Snapshot, today: string): Promise<number> {
  if (Platform.OS === "web") return 0;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = Date.now();
  // Laufender Fokus-Dungeon: Benachrichtigung zum Ende (auch ohne Quest-Erinnerungen, sofern erlaubt)
  const running = snap.focusSessions.find((f) => f.status === "laufend");
  const end = running ? Date.parse(running.startedAt) + running.minutes * 60_000 : 0;
  if (running && end > now + 5_000 && (await Notifications.getPermissionsAsync()).granted) {
    await Notifications.scheduleNotificationAsync({
      content: { title: "🏆 Dungeon geschafft!", body: "Öffne LIFE OS, um deine Belohnung abzuholen." },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(end) },
    });
  }
  if (!(await getPref("reminders"))) return 0;
  const items = [0, 1, 2]
    .flatMap((d) => todaysItems(snap, addDays(today, d)))
    .filter((i) => i.status === "offen" && i.time && i.dueAt && new Date(i.dueAt).getTime() > now + 30_000)
    .slice(0, MAX_SCHEDULED);
  for (const i of items) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: i.quest.mandatory ? "⚔️ Pflichtquest" : "📜 Quest",
        body: `${i.quest.title} – jetzt fällig`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(i.dueAt!) },
    });
  }
  return items.length;
}

export async function biometricAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

export async function unlockWithBiometrics(): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: "LIFE OS entsperren", cancelLabel: "Abbrechen" });
  return r.success;
}
