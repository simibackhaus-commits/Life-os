import { ScrollView, Text, View } from "react-native";
import { seasonHistory, yearReview } from "@life-os/core";
import { SeasonCard } from "@/components/season";
import { Bar, Card } from "@/components/ui";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const fmt = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });

export default function Events() {
  const { snap, today } = useGame();
  const history = seasonHistory(snap, today);
  const year = today.slice(0, 4);
  const r = yearReview(snap, year);
  const max = Math.max(1, ...r.byMonth.map((m) => m.count));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <SeasonCard />
      <Card title={`Bisherige Events ${year}`}>
        {history.length === 0 ? <Text style={s.muted}>Noch keine vergangenen Monate.</Text> : null}
        <View style={[s.row, { flexWrap: "wrap", gap: 8 }]}>
          {history.map((h) => (
            <View key={h.month} style={{ width: "30%", alignItems: "center", opacity: h.completed ? 1 : 0.45 }}>
              <Text style={{ fontSize: 24 }}>{h.def.icon}</Text>
              <Text style={s.small}>
                {MONTHS[h.def.month - 1]} {h.completed ? "✓" : ""}
              </Text>
            </View>
          ))}
        </View>
      </Card>
      <Card title={`Jahresrückblick ${year}`}>
        <View style={[s.row, { flexWrap: "wrap", gap: 12 }]}>
          {(
            [
              ["Quests", r.completions],
              ["XP", r.xp],
              ["Trainings", r.workouts],
              ["Dungeons", r.dungeons],
              ["Gespart €", fmt(r.saved)],
            ] as const
          ).map(([label, value]) => (
            <View key={label} style={{ minWidth: "28%" }}>
              <Text style={s.small}>{label}</Text>
              <Text style={{ color: colors.gold, fontSize: 20, fontWeight: "800" }}>{value}</Text>
            </View>
          ))}
        </View>
        <View style={[s.row, { alignItems: "flex-end", height: 80, gap: 3, marginTop: 12 }]}>
          {r.byMonth.map((m) => (
            <View key={m.month} style={{ flex: 1, alignItems: "center", gap: 2 }}>
              <View style={{ width: "100%", height: Math.max(2, (m.count / max) * 56), backgroundColor: colors.gold, borderRadius: 3 }} />
              <Text style={{ color: colors.muted, fontSize: 8 }}>{MONTHS[m.month - 1]!.slice(0, 1)}</Text>
            </View>
          ))}
        </View>
        {r.bestMonth ? <Text style={[s.small, { marginTop: 8 }]}>Stärkster Monat: {MONTHS[r.bestMonth - 1]}</Text> : null}
      </Card>
    </ScrollView>
  );
}
