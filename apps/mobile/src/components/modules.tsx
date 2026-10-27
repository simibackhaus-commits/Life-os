import { Text, View } from "react-native";
import { goalProgress, type Goal } from "@life-os/core";
import { s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";
import { Bar } from "./ui";

export function GoalBar({ goal, color }: { goal: Goal; color: string }) {
  const { snap, today } = useGame();
  const p = goalProgress(
    goal,
    snap.quests.filter((q) => q.goalId === goal.id),
    today,
  );
  return (
    <View style={{ gap: 4 }}>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Text style={s.small}>{p.label}</Text>
        <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{Math.floor(p.ratio * 100)} %</Text>
      </View>
      <Bar value={p.ratio} color={color} height={8} />
      <Text style={s.small}>
        {p.milestones.map((m) => `🏁 ${m} %`).join("  ")}
        {p.perWeekNeeded !== null ? `  · nötig ${p.perWeekNeeded.toLocaleString("de-DE")} ${goal.unit ?? ""}/Woche` : ""}
      </Text>
    </View>
  );
}
