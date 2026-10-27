import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ONCE_KEY, deadlines } from "@life-os/core";
import { GoalBar } from "@/components/modules";
import { Badge, Button, Card } from "@/components/ui";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

/** Business unterwegs: Fristen, Delegiertes, Projekte mit Aufgaben abhaken und hinzufügen. */
export default function Career() {
  const { snap, run, complete } = useGame();
  const projects = snap.goals.filter((g) => g.area === "business" && g.status === "aktiv");
  const ids = new Set(snap.goals.filter((g) => g.area === "business").map((g) => g.id));
  const quests = snap.quests.filter((q) => q.category === "business" || (q.goalId && ids.has(q.goalId)));
  const d = deadlines(quests, new Date().toISOString());
  const [newTask, setNewTask] = useState<Record<string, string>>({});
  const [projectTitle, setProjectTitle] = useState("");

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Card title="Fristen (7 Tage)">
        {d.overdue.length + d.upcoming.length === 0 ? <Text style={s.muted}>Keine Fristen.</Text> : null}
        {d.overdue.map((q) => (
          <Text key={q.id} style={{ color: colors.danger, paddingVertical: 2 }}>
            ⚠ {q.title} – überfällig
          </Text>
        ))}
        {d.upcoming.map((q) => (
          <Text key={q.id} style={[s.text, { paddingVertical: 2 }]}>
            {q.title} <Text style={s.small}>· {new Date(q.dueAt!).toLocaleDateString("de-DE")}</Text>
          </Text>
        ))}
      </Card>

      {projects.map((p) => {
        const tasks = snap.quests.filter((q) => q.goalId === p.id && q.status !== "archiviert");
        return (
          <Card key={p.id} title={p.title}>
            <GoalBar goal={p} color="#a78bfa" />
            <View style={{ gap: 6, marginTop: 10 }}>
              {tasks.map((t) => (
                <Pressable
                  key={t.id}
                  disabled={t.status !== "aktiv" || !!t.recurrence}
                  onPress={() => void complete({ questId: t.id, occurrenceKey: ONCE_KEY, dueAt: t.dueAt })}
                  style={[s.row, { gap: 8, opacity: t.status === "erledigt" ? 0.5 : 1 }]}
                >
                  <Text style={{ color: t.status === "erledigt" ? colors.success : colors.muted, fontSize: 18 }}>{t.status === "erledigt" ? "☑" : "☐"}</Text>
                  <Text style={[s.text, { flex: 1 }, t.status === "erledigt" && { textDecorationLine: "line-through" }]}>{t.title}</Text>
                  {t.delegatedTo ? <Badge text={`→ ${t.delegatedTo}`} color={colors.blue} /> : null}
                </Pressable>
              ))}
              <View style={[s.row, { gap: 8 }]}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  placeholder="Neue Aufgabe"
                  placeholderTextColor={colors.muted}
                  value={newTask[p.id] ?? ""}
                  onChangeText={(v) => setNewTask((x) => ({ ...x, [p.id]: v }))}
                />
                <View style={{ width: 56 }}>
                  <Button
                    label="+"
                    variant="outline"
                    disabled={!(newTask[p.id] ?? "").trim()}
                    onPress={async () => {
                      if (await run((st) => st.createQuest({ title: newTask[p.id]!, category: "business", attributes: ["karriere", "ordnung"], goalId: p.id })))
                        setNewTask((x) => ({ ...x, [p.id]: "" }));
                    }}
                  />
                </View>
              </View>
            </View>
          </Card>
        );
      })}

      <Card title="Neues Projekt">
        <TextInput style={s.input} placeholder="z. B. Website-Relaunch" placeholderTextColor={colors.muted} value={projectTitle} onChangeText={setProjectTitle} />
        <View style={{ marginTop: 10 }}>
          <Button
            label="Projekt anlegen"
            variant="outline"
            disabled={!projectTitle.trim()}
            onPress={async () => {
              if (await run((st) => st.createGoal({ title: projectTitle, area: "business" }))) setProjectTitle("");
            }}
          />
        </View>
      </Card>
    </ScrollView>
  );
}
