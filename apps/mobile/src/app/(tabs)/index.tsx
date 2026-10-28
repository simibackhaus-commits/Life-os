import { router } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { todaysItems } from "@life-os/api";
import { Bar, Button, Card, CharacterHeader, QuestRow } from "@/components/ui";
import { SeasonCard } from "@/components/season";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

export default function Today() {
  const { snap, today, reload, sync, store } = useGame();
  const [refreshing, setRefreshing] = useState(false);
  const items = todaysItems(snap, today);
  const done = items.filter((i) => i.status === "erledigt").length;
  const main = snap.quests.find((q) => q.status === "aktiv" && ["main", "epic", "legendary", "boss"].includes(q.type));
  const mainProgress = main ? (main.subtasks.length ? main.subtasks.filter((x) => x.done).length / main.subtasks.length : main.progress / 100) : 0;

  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            tintColor={colors.gold}
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await reload();
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <Text style={[s.h1, { letterSpacing: 4 }]}>LIFE OS</Text>
          <Text style={s.small}>{store.mode === "local" ? "lokal" : `Sync: ${sync.state}${sync.pending ? ` (${sync.pending})` : ""}`}</Text>
        </View>

        <CharacterHeader character={snap.character} />

        <View style={[s.row, { gap: 10 }]}>
          <View style={{ flex: 1 }}>
            <Button label="Quick-Add" icon="add-circle" onPress={() => router.push("/quick-add")} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="KI-Rat" icon="chatbubbles" variant="violet" onPress={() => router.push("/chat")} />
          </View>
        </View>

        <Card title={`Heutige Quests · ${done}/${items.length}`}>
          <View style={{ marginBottom: 10 }}>
            <Bar value={items.length ? done / items.length : 0} color={colors.blue} height={5} />
          </View>
          {items.length === 0 ? (
            <Text style={s.muted}>Heute stehen keine Quests an. Leg mit Quick-Add die erste an.</Text>
          ) : (
            <View style={{ gap: 8 }}>
              {items.map((i) => (
                <QuestRow key={i.quest.id + i.key} item={i} />
              ))}
            </View>
          )}
          {items.some((i) => i.status === "erledigt") ? <Text style={[s.small, { marginTop: 8 }]}>Lange drücken nimmt einen Abschluss zurück.</Text> : null}
        </Card>

        <SeasonCard />

        {main ? (
          <Card title="Hauptquest">
            <Text style={[s.text, { marginBottom: 8 }]}>{main.title}</Text>
            <Bar value={mainProgress} color={colors.violet} />
          </Card>
        ) : null}

        <Card title="KI-Spielleiter">
          <Text style={s.muted}>
            Der KI-Chat ist vorbereitet, aber noch nicht aktiv (kein Anthropic-API-Key hinterlegt). Quick-Add nutzt den Offline-Parser, das Gericht den Regelrichter.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
