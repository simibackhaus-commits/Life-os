import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import {
  DIFFICULTIES,
  QUEST_TYPES,
  QUEST_TYPE_LABELS,
  QuestDraftSchema,
  addDays,
  computeReward,
  describeRule,
  type QuestDraftInput,
  type RecurrenceRule,
} from "@life-os/core";
import { ActionSheet, Badge, Button, Card } from "@/components/ui";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const FREQ_LABEL = { daily: "täglich", weekly: "wöchentlich", monthly: "monatlich" } as const;

function Chips<T extends string | number>({ options, isOn, onPress, label }: { options: readonly T[]; isOn: (v: T) => boolean; onPress: (v: T) => void; label: (v: T) => string }) {
  return (
    <View style={[s.row, { flexWrap: "wrap", gap: 6 }]}>
      {options.map((o) => (
        <Pressable
          key={String(o)}
          onPress={() => onPress(o)}
          style={{ borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderColor: isOn(o) ? colors.gold : colors.border, backgroundColor: isOn(o) ? `${colors.gold}22` : "transparent" }}
        >
          <Text style={{ color: isOn(o) ? colors.gold : colors.muted, fontSize: 13 }}>{label(o)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalParts = (iso: string | null | undefined) => {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};

/** Quest bearbeiten: Tage, Uhrzeiten, Start, Fälligkeit … – auch für Quests, die heute nicht anstehen. */
export default function EditQuest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { snap, today, run, notify } = useGame();
  const quest = snap.quests.find((q) => q.id === id);
  const [d, setD] = useState<QuestDraftInput | null>(() => (quest ? { ...quest } : null));
  const [timesText, setTimesText] = useState(() => (quest?.recurrence?.times ?? []).join(", "));
  const due = toLocalParts(quest?.dueAt);
  const [dueDate, setDueDate] = useState(due.date);
  const [dueTime, setDueTime] = useState(due.time);
  const [confirmArchive, setConfirmArchive] = useState(false);

  if (!quest || !d) {
    return (
      <View style={[s.screen, { padding: 20 }]}>
        <Text style={s.muted}>Quest nicht gefunden.</Text>
      </View>
    );
  }

  const rec = d.recurrence ?? null;
  const set = <K extends keyof QuestDraftInput>(k: K, v: QuestDraftInput[K]) => setD((x) => (x ? { ...x, [k]: v } : x));
  const setRec = (patch: Partial<RecurrenceRule> | null) =>
    set("recurrence", patch === null ? null : ({ freq: "weekly", interval: 1, startDate: addDays(today, 1), ...rec, ...patch } as RecurrenceRule));
  const reward = (() => {
    const p = QuestDraftSchema.safeParse(d);
    return p.success ? computeReward(p.data, new Set(snap.skills)) : null;
  })();

  async function save() {
    let draft: QuestDraftInput = { ...d! };
    if (draft.recurrence) {
      const times = timesText
        .split(/[,\s]+/)
        .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
        .map((t) => t.padStart(5, "0"));
      draft = { ...draft, dueAt: null, recurrence: { ...draft.recurrence, times: times.length ? times : undefined } };
    } else {
      draft = { ...draft, dueAt: dueDate ? new Date(`${dueDate}T${dueTime || "23:59"}:00`).toISOString() : null };
    }
    const p = QuestDraftSchema.safeParse(draft);
    if (!p.success) return notify("error", p.error.issues[0]?.message ?? "Ungültige Eingabe");
    const ok = await run((st) => st.updateQuest(quest!.id, p.data).then(() => true));
    if (ok) {
      notify("info", "Gespeichert.");
      router.back();
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.screen}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: 60 }]} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={s.label}>Titel</Text>
          <TextInput style={s.input} value={d.title} onChangeText={(t) => set("title", t)} />
          <Text style={s.label}>Questtyp</Text>
          <Chips options={QUEST_TYPES} isOn={(v) => v === (d.type ?? "side")} onPress={(v) => set("type", v)} label={(v) => QUEST_TYPE_LABELS[v]} />
          <Text style={s.label}>Schwierigkeit</Text>
          <Chips options={DIFFICULTIES} isOn={(v) => v === (d.difficulty ?? "mittel")} onPress={(v) => set("difficulty", v)} label={(v) => v} />
        </Card>

        <Card title="Wann?">
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Text style={s.text}>Wiederkehrend</Text>
            <Switch value={!!rec} onValueChange={(v) => setRec(v ? {} : null)} trackColor={{ true: colors.gold }} />
          </View>
          {rec ? (
            <View style={{ gap: 4, marginTop: 6 }}>
              <Text style={s.label}>Rhythmus</Text>
              <Chips options={["daily", "weekly", "monthly"] as const} isOn={(v) => v === rec.freq} onPress={(v) => setRec({ freq: v })} label={(v) => FREQ_LABEL[v]} />
              {rec.freq === "weekly" ? (
                <>
                  <Text style={s.label}>Wochentage</Text>
                  <Chips
                    options={[1, 2, 3, 4, 5, 6, 7] as const}
                    isOn={(n) => rec.byWeekday?.includes(n) ?? false}
                    onPress={(n) => {
                      const cur = rec.byWeekday ?? [];
                      setRec({ byWeekday: cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort() });
                    }}
                    label={(n) => WEEKDAYS[n - 1]!}
                  />
                </>
              ) : null}
              <Text style={s.label}>Alle … {rec.freq === "daily" ? "Tage" : rec.freq === "weekly" ? "Wochen" : "Monate"}</Text>
              <TextInput style={[s.input, { width: 80 }]} keyboardType="number-pad" value={String(rec.interval ?? 1)} onChangeText={(v) => setRec({ interval: Math.max(1, Number(v) || 1) })} />
              <Text style={s.label}>Uhrzeiten (je eine eigene Instanz, z. B. 07:00, 22:00)</Text>
              <TextInput style={s.input} value={timesText} onChangeText={setTimesText} placeholder="leer = ganztägig" placeholderTextColor={colors.muted} />
              <Text style={s.label}>Start (Spieltag beginnt um 04:00)</Text>
              <View style={[s.row, { gap: 8 }]}>
                <TextInput style={[s.input, { flex: 1 }]} value={rec.startDate} onChangeText={(v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && setRec({ startDate: v })} placeholder="JJJJ-MM-TT" placeholderTextColor={colors.muted} />
                <Button label="heute" variant="outline" onPress={() => setRec({ startDate: today })} />
                <Button label="morgen" variant="outline" onPress={() => setRec({ startDate: addDays(today, 1) })} />
              </View>
              <Text style={[s.small, { marginTop: 6 }]}>{describeRule({ interval: 1, ...rec } as RecurrenceRule)}</Text>
            </View>
          ) : (
            <View style={{ gap: 4, marginTop: 6 }}>
              <Text style={s.label}>Fällig am (JJJJ-MM-TT) und um (HH:MM)</Text>
              <View style={[s.row, { gap: 8 }]}>
                <TextInput style={[s.input, { flex: 2 }]} value={dueDate} onChangeText={setDueDate} placeholder="ohne Termin" placeholderTextColor={colors.muted} />
                <TextInput style={[s.input, { flex: 1 }]} value={dueTime} onChangeText={setDueTime} placeholder="23:59" placeholderTextColor={colors.muted} />
              </View>
            </View>
          )}
        </Card>

        <Card>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Text style={s.text}>Verpflichtend (Gericht)</Text>
            <Switch value={d.mandatory ?? false} onValueChange={(v) => set("mandatory", v)} trackColor={{ true: colors.gold }} />
          </View>
          <Text style={s.label}>Geschätzte Dauer (Minuten)</Text>
          <TextInput style={[s.input, { width: 100 }]} keyboardType="number-pad" value={d.estimatedMinutes ? String(d.estimatedMinutes) : ""} onChangeText={(v) => set("estimatedMinutes", v ? Number(v) : null)} />
        </Card>

        {reward ? (
          <View style={s.row}>
            <Badge text={`+${reward.xp} XP`} color={colors.gold} />
            <Badge text={`+${reward.coins} Coins`} color={colors.blue} />
          </View>
        ) : null}
        <Button label="Speichern" icon="checkmark-circle" onPress={() => void save()} />
        <View style={[s.row, { gap: 8 }]}>
          <View style={{ flex: 1 }}>
            <Button
              label={quest.status === "pausiert" ? "Fortsetzen" : "Pausieren"}
              variant="outline"
              onPress={async () => {
                await run((st) => st.updateQuest(quest.id, { status: quest.status === "pausiert" ? "aktiv" : "pausiert" }));
                router.back();
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Archivieren" variant="danger" onPress={() => setConfirmArchive(true)} />
          </View>
        </View>
      </ScrollView>
      <ActionSheet
        title={confirmArchive ? `„${quest.title}" archivieren?` : null}
        message="Die Quest verschwindet aus allen Listen. Bisherige Abschlüsse bleiben erhalten."
        options={[
          {
            label: "Archivieren",
            destructive: true,
            onPress: async () => {
              await run((st) => st.updateQuest(quest.id, { status: "archiviert" }));
              router.back();
            },
          },
        ]}
        onClose={() => setConfirmArchive(false)}
      />
    </KeyboardAvoidingView>
  );
}
