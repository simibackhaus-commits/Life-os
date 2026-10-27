import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { WORKOUT_KINDS, WORKOUT_LABELS, WorkoutSchema, personalRecords, trainingLoad, type WorkoutKind } from "@life-os/core";
import { todaysItems } from "@life-os/api";
import { Button, Card } from "@/components/ui";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

export default function Fitness() {
  const { snap, run, notify, complete, today } = useGame();
  const [kind, setKind] = useState<WorkoutKind>("laufen");
  const [duration, setDuration] = useState("30");
  const [distance, setDistance] = useState("");
  const [intensity, setIntensity] = useState(6);
  const sportToday = todaysItems(snap, today).filter((i) => i.status === "offen" && i.quest.category === "sport");
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const load = trainingLoad(snap.workouts, today);
  const prs = personalRecords(snap.workouts);

  async function save() {
    const p = WorkoutSchema.safeParse({ date: today, kind, durationMin: Number(duration), distanceKm: distance ? Number(distance.replace(",", ".")) : null, intensity });
    if (!p.success) return notify("error", p.error.issues[0]?.message ?? "Ungültig");
    if (!(await run((st) => st.logWorkout(p.data)))) return;
    notify("info", `${WORKOUT_LABELS[kind]} gespeichert.`);
    for (const i of sportToday.filter((x) => linked.has(x.quest.id + x.key))) await complete({ questId: i.quest.id, occurrenceKey: i.key, dueAt: i.dueAt });
    setLinked(new Set());
    setDistance("");
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Card title="Belastung">
        <Text style={{ color: load.recoveryRecommended ? colors.warning : colors.success }}>{load.advice}</Text>
        <Text style={s.small}>
          7 Tage: {load.week} · Ø 4 Wochen: {load.fourWeekAvg}
        </Text>
      </Card>

      <Card title="Training erfassen (heute)">
        <View style={[s.row, { flexWrap: "wrap", gap: 6 }]}>
          {WORKOUT_KINDS.map((k) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={{ borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderColor: k === kind ? colors.gold : colors.border, backgroundColor: k === kind ? `${colors.gold}22` : "transparent" }}
            >
              <Text style={{ color: k === kind ? colors.gold : colors.muted, fontSize: 13 }}>{WORKOUT_LABELS[k]}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[s.row, { gap: 8, marginTop: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Minuten</Text>
            <TextInput style={s.input} keyboardType="number-pad" value={duration} onChangeText={setDuration} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>km (optional)</Text>
            <TextInput style={s.input} keyboardType="decimal-pad" value={distance} onChangeText={setDistance} />
          </View>
        </View>
        <Text style={s.label}>Anstrengung: {intensity}/10</Text>
        <View style={[s.row, { gap: 4 }]}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <Pressable key={n} onPress={() => setIntensity(n)} style={{ flex: 1, height: 28, borderRadius: 6, backgroundColor: n <= intensity ? colors.gold : colors.surface2 }} accessibilityLabel={`Anstrengung ${n}`} />
          ))}
        </View>
        {sportToday.length > 0 ? (
          <View style={{ marginTop: 12, gap: 6 }}>
            <Text style={[s.small, { color: colors.gold }]}>Gleichzeitig abhaken:</Text>
            {sportToday.map((i) => {
              const key = i.quest.id + i.key;
              const on = linked.has(key);
              return (
                <Pressable
                  key={key}
                  onPress={() =>
                    setLinked((st) => {
                      const n = new Set(st);
                      if (on) n.delete(key);
                      else n.add(key);
                      return n;
                    })
                  }
                  style={[s.row, { gap: 8 }]}
                >
                  <Text style={{ color: on ? colors.success : colors.muted, fontSize: 18 }}>{on ? "☑" : "☐"}</Text>
                  <Text style={s.text}>{i.quest.title}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <View style={{ marginTop: 12 }}>
          <Button label="Training speichern" icon="barbell" onPress={() => void save()} />
        </View>
      </Card>

      <Card title="Persönliche Rekorde">
        {prs.length === 0 ? (
          <Text style={s.muted}>Noch keine Rekorde.</Text>
        ) : (
          prs.map((r) => (
            <View key={r.label} style={[s.row, { justifyContent: "space-between", paddingVertical: 3 }]}>
              <Text style={s.text}>{r.label}</Text>
              <Text style={{ color: colors.gold }}>{r.value}</Text>
            </View>
          ))
        )}
      </Card>

      <Card title="Letzte Trainings">
        {snap.workouts.slice(0, 10).map((w) => (
          <Text key={w.id} style={[s.small, { paddingVertical: 2 }]}>
            {new Date(`${w.date}T12:00:00`).toLocaleDateString("de-DE")} · {WORKOUT_LABELS[w.kind]} · {w.durationMin} min{w.distanceKm ? ` · ${w.distanceKm} km` : ""}
          </Text>
        ))}
        {snap.workouts.length === 0 ? <Text style={s.muted}>Noch keine Trainings.</Text> : null}
      </Card>
    </ScrollView>
  );
}
