import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ONCE_KEY, QUEST_TYPE_LABELS, bossHp, describeRule, isQuestLocked, type Quest } from "@life-os/core";
import { questStreak, rewardOf } from "@life-os/api";
import { ActionSheet, Badge, Bar, Button, Card, type SheetOption } from "@/components/ui";
import { colors, questTypeColors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

type Filter = "aktiv" | "pausiert" | "erledigt";

export default function Quests() {
  const { snap, run, complete, today, notify } = useGame();
  const [filter, setFilter] = useState<Filter>("aktiv");
  const quests = snap.quests.filter((q) => q.status === filter).sort((a, b) => b.priority - a.priority);

  const [selected, setSelected] = useState<Quest | null>(null);

  function actions(q: Quest): SheetOption[] {
    const opts: SheetOption[] = [];
    const locked = isQuestLocked(snap.quests, q);
    const hp = bossHp(q);
    if (hp && q.status === "aktiv" && !locked && q.subtasks.some((st) => !st.done)) {
      opts.push({
        label: `⚔️ Angriff: ${q.subtasks.find((st) => !st.done)!.title}`,
        onPress: async () => {
          const next = q.subtasks.find((st) => !st.done)!;
          const subtasks = q.subtasks.map((st) => (st.id === next.id ? { ...st, done: true } : st));
          await run((s) => s.updateQuest(q.id, { subtasks, progress: Math.round((subtasks.filter((x) => x.done).length / subtasks.length) * 100) }));
          if (subtasks.every((st) => st.done) && !q.recurrence) {
            const r = await complete({ questId: q.id, occurrenceKey: ONCE_KEY, dueAt: q.dueAt });
            if (r?.applied) notify("xp", `🐉 ${q.title} besiegt!`);
          } else notify("info", `Treffer! ${hp.current - 1}/${hp.max} Trefferpunkte übrig.`);
        },
      });
    } else if (q.status === "aktiv" && !q.recurrence && !locked) opts.push({ label: "Abschließen", onPress: () => void complete({ questId: q.id, occurrenceKey: ONCE_KEY, dueAt: q.dueAt }) });
    if (q.status === "aktiv") opts.push({ label: "Pausieren", onPress: () => void run((s) => s.updateQuest(q.id, { status: "pausiert" })) });
    if (q.status === "pausiert") opts.push({ label: "Fortsetzen", onPress: () => void run((s) => s.updateQuest(q.id, { status: "aktiv" })) });
    opts.push({ label: "Archivieren", destructive: true, onPress: () => void run((s) => s.updateQuest(q.id, { status: "archiviert" })) });
    return opts;
  }

  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <Text style={s.h1}>Questbuch</Text>
          <Pressable onPress={() => router.push("/quick-add")} accessibilityLabel="Neue Quest">
            <Ionicons name="add-circle" size={32} color={colors.gold} />
          </Pressable>
        </View>
        <View style={s.row}>
          {(["aktiv", "pausiert", "erledigt"] as Filter[]).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: f === filter ? colors.violet : colors.border, backgroundColor: f === filter ? `${colors.violet}33` : "transparent" }}
            >
              <Text style={{ color: f === filter ? colors.text : colors.muted }}>
                {f} ({snap.quests.filter((q) => q.status === f).length})
              </Text>
            </Pressable>
          ))}
        </View>
        {quests.length === 0 ? (
          <Card>
            <Text style={s.muted}>Keine Quests in dieser Ansicht.</Text>
          </Card>
        ) : (
          quests.map((q) => {
            const r = rewardOf(q, snap.skills);
            const streak = questStreak(snap, q, today);
            return (
              <Pressable key={q.id} onPress={() => setSelected(q)}>
                <Card>
                  <View style={[s.row, { justifyContent: "space-between" }]}>
                    <Text style={[s.text, { flex: 1, fontWeight: "600" }]} numberOfLines={2}>
                      {q.title}
                    </Text>
                    <Badge text={QUEST_TYPE_LABELS[q.type]} color={questTypeColors[q.type]} />
                  </View>
                  <Text style={[s.small, { marginTop: 6 }]}>
                    {q.difficulty} · Prio {q.priority} · {q.recurrence ? describeRule(q.recurrence) : q.dueAt ? `fällig ${new Date(q.dueAt).toLocaleDateString("de-DE")}` : "ohne Termin"}
                    {streak ? ` · Serie ${streak.current}` : ""}
                  </Text>
                  {isQuestLocked(snap.quests, q) ? (
                    <Text style={[s.small, { color: colors.warning, marginTop: 4 }]}>
                      🔒 Gesperrt bis „{snap.quests.find((x) => x.id === q.requiresQuestId)?.title}" erledigt ist
                    </Text>
                  ) : null}
                  {bossHp(q) ? (
                    <View style={{ marginTop: 8, gap: 3 }}>
                      <Text style={[s.small, { color: colors.danger }]}>
                        🐉 {bossHp(q)!.current}/{bossHp(q)!.max} Trefferpunkte · antippen zum Angreifen
                      </Text>
                      <Bar value={bossHp(q)!.current / bossHp(q)!.max} color={colors.danger} height={6} />
                    </View>
                  ) : null}
                  <View style={[s.row, { marginTop: 8, justifyContent: "space-between" }]}>
                    <Text style={{ color: colors.gold, fontSize: 12 }}>
                      +{r.xp} XP · <Text style={{ color: colors.blue }}>+{r.coins} ¢</Text>
                    </Text>
                    {q.mandatory ? <Badge text="Pflicht" color={colors.danger} /> : null}
                  </View>
                </Card>
              </Pressable>
            );
          })
        )}
        <Button label="Neue Quest" icon="add" variant="outline" onPress={() => router.push("/quick-add")} />
      </ScrollView>
      <ActionSheet title={selected?.title ?? null} options={selected ? actions(selected) : []} onClose={() => setSelected(null)} />
    </SafeAreaView>
  );
}
