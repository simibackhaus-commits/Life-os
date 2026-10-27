import { ScrollView, Text, View } from "react-native";
import { gardenPlants } from "@life-os/core";
import { Bar, Card } from "@/components/ui";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

export default function Garden() {
  const { snap, today } = useGame();
  const plants = gardenPlants(snap.quests, snap.instances, today);
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.muted}>Jede Routine ist eine Pflanze und wächst mit deiner Serie. Reißt sie, welkt die Pflanze – und wächst neu.</Text>
      {plants.length === 0 ? (
        <Card>
          <Text style={s.muted}>Noch keine Routinen – leg eine wiederkehrende Quest an.</Text>
        </Card>
      ) : (
        <View style={[s.row, { flexWrap: "wrap", gap: 10 }]}>
          {plants.map((p) => (
            <View key={p.quest.id} style={[s.card, { width: "47%", alignItems: "center", gap: 4 }]}>
              <Text style={{ fontSize: 46, opacity: p.wilted ? 0.6 : 1 }}>{p.wilted ? "🥀" : p.stage.icon}</Text>
              <Text style={[s.text, { textAlign: "center" }]} numberOfLines={2}>
                {p.quest.title}
              </Text>
              <Text style={s.small}>{p.wilted ? `verwelkt · Rekord ${p.best}` : `${p.stage.name} · 🔥 ${p.current}`}</Text>
              {p.next && !p.wilted ? (
                <View style={{ width: "100%", gap: 2 }}>
                  <Bar value={p.growth} color={colors.success} height={4} />
                  <Text style={[s.small, { textAlign: "center" }]}>
                    noch {p.next.minStreak - p.current} bis {p.next.icon}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
