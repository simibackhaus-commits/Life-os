import { Text, View } from "react-native";
import { seasonEvent } from "@life-os/core";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";
import { Bar, Card } from "./ui";

const fmt = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });

/** Event-Karte für den Startbildschirm. */
export function SeasonCard() {
  const { snap, today } = useGame();
  const e = seasonEvent(snap, today);
  return (
    <Card title="Event des Monats" style={e.completed ? { borderColor: colors.gold } : undefined}>
      <View style={[s.row, { gap: 12 }]}>
        <Text style={{ fontSize: 34 }}>{e.def.icon}</Text>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.gold, fontWeight: "700" }}>{e.def.title}</Text>
          <Text style={s.small}>{e.def.description}</Text>
          <Bar value={e.progress} color={colors.violet} height={6} />
          <Text style={s.small}>{e.completed ? "✨ Geschafft!" : `${fmt(e.current)}/${fmt(e.def.target)} ${e.def.unit} · noch ${e.daysLeft} Tage`}</Text>
        </View>
      </View>
    </Card>
  );
}

