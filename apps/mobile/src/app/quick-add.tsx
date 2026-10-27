import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import {
  DIFFICULTIES,
  QUEST_TYPES,
  QUEST_TYPE_LABELS,
  QuestDraftSchema,
  computeReward,
  describeRule,
  type QuestDraftInput,
} from "@life-os/core";
import type { QuickAddDraft } from "@life-os/api";
import { Badge, Button, Card } from "@/components/ui";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

const EXAMPLES = ["Jeden Tag morgens und abends Zähne putzen", "Mo, Mi und Fr 30 Minuten laufen", "Morgen um 14 Uhr Bestellung auslösen"];

function Chips<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {options.map((o) => (
        <Pressable
          key={o}
          onPress={() => onChange(o)}
          style={{ borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderColor: o === value ? colors.gold : colors.border, backgroundColor: o === value ? `${colors.gold}22` : "transparent" }}
        >
          <Text style={{ color: o === value ? colors.gold : colors.muted, fontSize: 13 }}>{label(o)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Quick-Add: Freitext (Tastatur-Diktat funktioniert über das Mikrofon der iOS-Tastatur) → bearbeitbare Vorschau → speichern. */
export default function QuickAdd() {
  const { run, notify } = useGame();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<QuickAddDraft | null>(null);
  const [draft, setDraft] = useState<QuestDraftInput | null>(null);
  const [busy, setBusy] = useState(false);

  async function analyze() {
    if (!text.trim()) return;
    setBusy(true);
    const r = await run((st) => st.quickAdd(text.trim()));
    setBusy(false);
    if (r) {
      setPreview(r);
      setDraft(r.draft);
    }
  }

  async function save() {
    if (!draft) return;
    const parsed = QuestDraftSchema.safeParse(draft);
    if (!parsed.success) {
      notify("error", parsed.error.issues[0]?.message ?? "Ungültige Eingabe");
      return;
    }
    const q = await run((st) => st.createQuest(parsed.data));
    if (q) {
      notify("info", `Quest „${q.title}" erstellt.`);
      router.back();
    }
  }

  const parsed = draft ? QuestDraftSchema.safeParse(draft) : null;
  const reward = parsed?.success ? computeReward(parsed.data) : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {!draft ? (
          <>
            <Text style={s.muted}>Beschreibe deine Quest. Tipp für Spracheingabe: das Mikrofon auf der Tastatur.</Text>
            <TextInput
              style={[s.input, { minHeight: 90, textAlignVertical: "top" }]}
              multiline
              autoFocus
              value={text}
              onChangeText={setText}
              placeholder="z. B. Jeden Montag 30 Minuten laufen"
              placeholderTextColor={colors.muted}
            />
            <View style={{ gap: 6 }}>
              {EXAMPLES.map((e) => (
                <Pressable key={e} onPress={() => setText(e)}>
                  <Text style={{ color: colors.blue, fontSize: 13 }}>→ {e}</Text>
                </Pressable>
              ))}
            </View>
            <Button label={busy ? "Analysiere…" : "Vorschau erzeugen"} icon="sparkles" variant="violet" onPress={() => void analyze()} disabled={busy || !text.trim()} />
          </>
        ) : (
          <>
            <View style={[s.row, { flexWrap: "wrap" }]}>
              <Badge text={preview?.source === "ki" ? "KI" : "Offline-Parser"} color={preview?.source === "ki" ? colors.violet : colors.muted} />
              {preview?.notes.map((n) => (
                <Text key={n} style={s.small}>
                  {n}
                </Text>
              ))}
            </View>
            <Card>
              <Text style={s.label}>Titel</Text>
              <TextInput style={s.input} value={draft.title} onChangeText={(t) => setDraft({ ...draft, title: t })} />
              <Text style={s.label}>Questtyp</Text>
              <Chips options={QUEST_TYPES} value={draft.type ?? "side"} onChange={(v) => setDraft({ ...draft, type: v })} label={(v) => QUEST_TYPE_LABELS[v]} />
              <Text style={s.label}>Schwierigkeit</Text>
              <Chips options={DIFFICULTIES} value={draft.difficulty ?? "mittel"} onChange={(v) => setDraft({ ...draft, difficulty: v })} label={(v) => v} />
              <Text style={s.label}>Termin</Text>
              <Text style={s.text}>
                {draft.recurrence
                  ? describeRule({ ...draft.recurrence, interval: draft.recurrence.interval ?? 1 })
                  : draft.dueAt
                    ? new Date(draft.dueAt).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                    : "ohne Termin"}
              </Text>
              <View style={[s.row, { justifyContent: "space-between", marginTop: 12 }]}>
                <Text style={s.text}>Verpflichtend (Gericht)</Text>
                <Switch value={draft.mandatory ?? false} onValueChange={(v) => setDraft({ ...draft, mandatory: v })} trackColor={{ true: colors.gold }} />
              </View>
            </Card>
            {reward ? (
              <View style={s.row}>
                <Badge text={`+${reward.xp} XP`} color={colors.gold} />
                <Badge text={`+${reward.coins} Coins`} color={colors.blue} />
              </View>
            ) : null}
            <Button label="Quest erstellen" icon="checkmark-circle" onPress={() => void save()} />
            <Button label="Zurück zur Eingabe" variant="outline" onPress={() => setDraft(null)} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
