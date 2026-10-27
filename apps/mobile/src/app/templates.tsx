import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { TEMPLATE_PACKS, addDays, describeRule, newFromPack, packQuestsIn, type RecurrenceRule } from "@life-os/core";
import { Button, Card } from "@/components/ui";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

export default function Templates() {
  const { snap, today, run, notify } = useGame();
  const pack = TEMPLATE_PACKS[0]!;
  // Standard: ab dem nächsten Spieltag (Tageswechsel 04:00)
  const [startDate, setStartDate] = useState(() => addDays(today, 1));
  const existing = snap.quests.filter((q) => q.status === "aktiv" || q.status === "pausiert").map((q) => q.title);
  const groups = useMemo(() => newFromPack(pack, startDate, existing), [pack, startDate, existing.join("|")]);
  const toShift = packQuestsIn(pack, snap.quests).filter((q) => q.recurrence!.startDate !== startDate);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const chosen = groups.flatMap((g) => g.quests).filter((q) => !q.exists && !off.has(q.quest.title));

  const toggle = (t: string) =>
    setOff((st) => {
      const n = new Set(st);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  async function create() {
    setBusy(true);
    let ok = 0;
    for (const { quest } of chosen) {
      if (await run((st) => st.createQuest(quest))) ok++;
      setDone(ok);
    }
    setBusy(false);
    notify("info", `${ok} Quests angelegt.`);
    router.back();
  }

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: 110 }]}>
        <Text style={s.muted}>{pack.description}</Text>
        <Card title="Start (Spieltag beginnt um 04:00)">
          <View style={[s.row, { gap: 8 }]}>
            {[
              [today, "ab heute"],
              [addDays(today, 1), "ab morgen, 04:00"],
            ].map(([d, label]) => (
              <Pressable
                key={d}
                onPress={() => setStartDate(d!)}
                style={{ flex: 1, borderWidth: 1, borderRadius: 8, padding: 10, alignItems: "center", borderColor: d === startDate ? colors.gold : colors.border }}
              >
                <Text style={{ color: d === startDate ? colors.gold : colors.muted }}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {toShift.length > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Button
                label={`Start der ${toShift.length} vorhandenen Paket-Quests setzen`}
                variant="outline"
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  let ok = 0;
                  for (const q of toShift) if (await run((st) => st.updateQuest(q.id, { recurrence: { ...q.recurrence!, startDate } }).then(() => true))) ok++;
                  setBusy(false);
                  notify("info", `Start von ${ok} Quests verschoben.`);
                }}
              />
            </View>
          ) : null}
        </Card>
        {groups.map((g) => (
          <Card key={g.name} title={`${g.icon} ${g.name}`}>
            <View style={{ gap: 6 }}>
              {g.quests.map(({ quest, exists }) => {
                const on = !exists && !off.has(quest.title);
                return (
                  <Pressable key={quest.title} disabled={exists} onPress={() => toggle(quest.title)} style={[s.row, { gap: 10, opacity: exists ? 0.4 : 1, alignItems: "flex-start" }]}>
                    <Text style={{ color: on ? colors.gold : colors.muted, fontSize: 18 }}>{on ? "☑" : "☐"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.text}>{quest.title}</Text>
                      <Text style={s.small}>
                        {exists ? "bereits vorhanden" : quest.recurrence ? describeRule({ ...(quest.recurrence as RecurrenceRule), interval: quest.recurrence.interval ?? 1 }) : ""}
                        {quest.mandatory && !exists ? " · Pflicht" : ""}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        ))}
      </ScrollView>
      <View style={{ position: "absolute", left: 16, right: 16, bottom: 24 }}>
        <Button label={busy ? `Lege an… ${done}/${chosen.length}` : `${chosen.length} Quests anlegen`} disabled={busy || chosen.length === 0} onPress={() => void create()} />
      </View>
    </View>
  );
}
