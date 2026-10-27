import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, Share, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActionSheet, Button, Card } from "@/components/ui";
import { supabase } from "@/lib/backend";
import { biometricAvailable, getPref, requestNotificationPermission, rescheduleReminders, setPref } from "@/lib/device";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

function Row({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={[s.row, { justifyContent: "space-between", paddingVertical: 6 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.text}>{label}</Text>
        {hint ? <Text style={s.small}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.gold }} />
    </View>
  );
}

export default function Settings() {
  const { store, sync, snap, today, run, notify } = useGame();
  const [reminders, setReminders] = useState(false);
  const [bio, setBio] = useState(false);
  const [bioAvail, setBioAvail] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    void getPref("reminders").then(setReminders);
    void getPref("biometric").then(setBio);
    void biometricAvailable().then(setBioAvail);
  }, []);

  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.h1}>Einstellungen</Text>

        <Card title="Konto & Sync">
          <Text style={s.text}>{store.mode === "cloud" ? "Cloud-Modus (Supabase)" : "Lokaler Modus (nur dieses Gerät)"}</Text>
          <Text style={[s.small, { marginTop: 4 }]}>
            Status: {sync.state}
            {sync.pending ? ` · ${sync.pending} Aktionen warten auf Netz` : ""}
          </Text>
          {supabase ? (
            <View style={{ marginTop: 12 }}>
              <Button label="Abmelden" variant="outline" icon="log-out" onPress={() => void supabase!.auth.signOut()} />
            </View>
          ) : null}
        </Card>

        <Card title="Gerät">
          <Row
            label="Erinnerungen"
            hint="Benachrichtigung zur Uhrzeit offener Quests (heute + 2 Tage)"
            value={reminders}
            disabled={Platform.OS === "web"}
            onChange={async (v) => {
              if (v && !(await requestNotificationPermission())) {
                notify("error", "Benachrichtigungen sind in den iOS-Einstellungen deaktiviert.");
                return;
              }
              await setPref("reminders", v);
              setReminders(v);
              const n = await rescheduleReminders(snap, today);
              notify("info", v ? `${n} Erinnerungen geplant.` : "Erinnerungen aus.");
            }}
          />
          <Row
            label="Face ID beim Öffnen"
            hint={bioAvail ? "Schützt deinen Spielstand" : "Auf diesem Gerät nicht verfügbar"}
            value={bio}
            disabled={!bioAvail}
            onChange={async (v) => {
              await setPref("biometric", v);
              setBio(v);
            }}
          />
        </Card>

        <Card title="Daten">
          <Button
            label="Daten exportieren"
            icon="share-outline"
            variant="outline"
            onPress={async () => {
              const data = await run((st) => st.exportData());
              if (!data) return;
              const json = JSON.stringify(data, null, 2);
              if (Platform.OS === "web") {
                // Im Browser als Datei herunterladen
                const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = `life-os-export-${today}.json`;
                a.click();
                URL.revokeObjectURL(url);
              } else await Share.share({ title: "LIFE OS Export", message: json });
            }}
          />
          <View style={{ marginTop: 10 }}>
            <Button
              label={store.mode === "cloud" ? "Account löschen" : "Spielstand löschen"}
              icon="trash"
              variant="danger"
              onPress={() => setConfirmDelete(true)}
            />
          </View>
        </Card>
        <ActionSheet
          title={confirmDelete ? "Wirklich löschen?" : null}
          message="Alle Daten werden unwiderruflich gelöscht. Vorher exportieren!"
          options={[{ label: "Endgültig löschen", destructive: true, onPress: () => void run((st) => st.deleteAllData()) }]}
          onClose={() => setConfirmDelete(false)}
        />

        <Card title="Spiel">
          <View style={{ gap: 8 }}>
            <Button label="Kalender" icon="calendar" variant="outline" onPress={() => router.push("/calendar")} />
            <Button label="Skilltree" icon="git-network" variant="outline" onPress={() => router.push("/skills")} />
            <Button label="Hauptquartier & Story" icon="home" variant="outline" onPress={() => router.push("/hq")} />
            <Button label="Saison-Events & Jahresrückblick" icon="sparkles" variant="outline" onPress={() => router.push("/events")} />
            <Button label="Fokus-Dungeons" icon="flash" variant="outline" onPress={() => router.push("/dungeons")} />
            <Button label="Habit Garden" icon="leaf" variant="outline" onPress={() => router.push("/garden")} />
            <Button label="Belohnungsshop" icon="gift" variant="outline" onPress={() => router.push("/shop")} />
            <Button label="Statistiken" icon="stats-chart" variant="outline" onPress={() => router.push("/stats")} />
          </View>
        </Card>

        <Card title="Lebensbereiche">
          <View style={{ gap: 8 }}>
            <Button label="Karriere & Business" icon="briefcase" variant="outline" onPress={() => router.push("/career")} />
            <Button label="Fitness" icon="barbell" variant="outline" onPress={() => router.push("/fitness")} />
            <Button label="Finanzen" icon="wallet" variant="outline" onPress={() => router.push("/finance")} />
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
