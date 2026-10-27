import { ScrollView, Text, View } from "react-native";
import { completionsByWeekday, questCompletionRates, totals, xpPerDay } from "@life-os/api";
import { Bar, Card } from "@/components/ui";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[s.card, { flex: 1, padding: 10 }]}>
      <Text style={s.small}>{label}</Text>
      <Text style={{ color, fontSize: 22, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}

/** Kompakte Statistiken mit einfachen Balken (ohne Chart-Bibliothek, läuft in Expo Go und im Web). */
export default function Stats() {
  const { snap, today } = useGame();
  const t = totals(snap);
  const week = xpPerDay(snap, today, 7);
  const maxXp = Math.max(1, ...week.map((d) => d.xp));
  const wd = completionsByWeekday(snap, today);
  const maxWd = Math.max(1, ...wd.map((d) => d.count));
  const rates = questCompletionRates(snap, today);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={[s.row, { gap: 8 }]}>
        <Kpi label="Abschlüsse" value={t.completions} color={colors.gold} />
        <Kpi label="Coins ausgegeben" value={t.coinsSpent} color={colors.violet} />
      </View>
      <Card title="XP – letzte 7 Tage">
        <View style={[s.row, { alignItems: "flex-end", height: 110, gap: 6 }]}>
          {week.map((d) => (
            <View key={d.day} style={{ flex: 1, alignItems: "center", gap: 4 }}>
              <Text style={s.small}>{d.xp || ""}</Text>
              <View style={{ width: "100%", height: Math.max(2, (Math.max(0, d.xp) / maxXp) * 70), backgroundColor: colors.gold, borderRadius: 4 }} />
              <Text style={s.small}>{d.day.slice(0, 2)}</Text>
            </View>
          ))}
        </View>
      </Card>
      <Card title="Abschlüsse nach Wochentag (30 Tage)">
        <View style={{ gap: 6 }}>
          {wd.map((d) => (
            <View key={d.day} style={[s.row, { gap: 8 }]}>
              <Text style={[s.small, { width: 22 }]}>{d.day}</Text>
              <View style={{ flex: 1 }}>
                <Bar value={d.count / maxWd} color={colors.blue} height={8} />
              </View>
              <Text style={[s.small, { width: 22, textAlign: "right" }]}>{d.count}</Text>
            </View>
          ))}
        </View>
      </Card>
      <Card title="Erfüllungsquote Routinen (14 Tage)">
        {rates.length === 0 ? (
          <Text style={s.muted}>Noch keine wiederkehrenden Quests mit vergangenen Terminen.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {rates.map((r) => (
              <View key={r.quest.id} style={{ gap: 4 }}>
                <View style={[s.row, { justifyContent: "space-between" }]}>
                  <Text style={[s.text, { flex: 1 }]} numberOfLines={1}>
                    {r.quest.title}
                  </Text>
                  <Text style={s.small}>{r.rate === null ? "–" : `${Math.round(r.rate * 100)} %`}</Text>
                </View>
                <Bar value={r.rate ?? 0} color={r.rate !== null && r.rate < 0.5 ? colors.danger : colors.success} height={5} />
              </View>
            ))}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}
