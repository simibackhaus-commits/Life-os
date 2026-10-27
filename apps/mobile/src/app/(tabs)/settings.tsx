import { useEffect, useState } from "react";
import { Alert, Platform, ScrollView, Share, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Card } from "@/components/ui";
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
              if (data) await Share.share({ title: "LIFE OS Export", message: JSON.stringify(data, null, 2) });
            }}
          />
          <View style={{ marginTop: 10 }}>
            <Button
              label={store.mode === "cloud" ? "Account löschen" : "Spielstand löschen"}
              icon="trash"
              variant="danger"
              onPress={() =>
                Alert.alert("Wirklich löschen?", "Alle Daten werden unwiderruflich gelöscht. Vorher exportieren!", [
                  { text: "Abbrechen", style: "cancel" },
                  { text: "Endgültig löschen", style: "destructive", onPress: () => void run((st) => st.deleteAllData()) },
                ])
              }
            />
          </View>
        </Card>

        <Card title="Demnächst (Phase 3)">
          <Text style={s.muted}>Kalender, Shop, Skilltree, Statistiken, Business-, Sport- und Finanzmodule.</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
