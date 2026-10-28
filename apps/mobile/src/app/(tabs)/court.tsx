import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EXCUSES, EXCUSE_LABELS, PLEAS, VERDICT_LABELS, type Consequence, type Excuse, type Plea } from "@life-os/core";
import { missedMandatory, rewardOf, type CourtCase } from "@life-os/api";
import { Badge, Button, Card, QuestRow } from "@/components/ui";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

const PLEA_LABELS: Record<Plea, string> = { schuldig: "Schuldig", nicht_schuldig: "Nicht schuldig", teilweise_schuldig: "Teilweise" };
const ROLE: Record<string, string> = { angeklagter: "Du", richter: "Richter", staatsanwalt: "Staatsanwalt", verteidiger: "Verteidiger", system: "Gericht" };

function consequenceText(c: Consequence): string {
  switch (c.type) {
    case "coins_verlust":
      return `−${c.amount} Coins`;
    case "xp_abzug":
      return `−${c.amount} XP`;
    case "bonus_verlust":
      return `Bonusverlust: ${c.description}`;
    case "wiedergutmachung":
      return `Wiedergutmachung: ${c.questTitle} (${c.estimatedMinutes} min)`;
    case "reflexion":
      return `Reflexion: ${c.prompt}`;
  }
}

function Choice<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <View style={[s.row, { flexWrap: "wrap", gap: 6 }]}>
      {options.map((o) => (
        <Pressable
          key={o}
          onPress={() => onChange(o)}
          style={{ borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderColor: o === value ? colors.gold : colors.border, backgroundColor: o === value ? `${colors.gold}22` : "transparent" }}
        >
          <Text style={{ color: o === value ? colors.gold : colors.muted, fontSize: 13 }}>{label(o)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function CaseView({ c }: { c: CourtCase }) {
  const { snap, store, run, ai } = useGame();
  const msgs = snap.courtMessages.filter((m) => m.caseId === c.id);
  const [plea, setPlea] = useState<Plea>("schuldig");
  const [excuse, setExcuse] = useState<Excuse>("keine");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const open = c.status === "offen" || c.status === "verhandlung" || c.status === "berufung";
  const canTalk = !!ai.provider || store.mode === "cloud";

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    await run(fn);
    setBusy(false);
    setStatement("");
  }

  return (
    <Card title="Fallakte">
      <Text style={[s.text, { fontWeight: "600" }]}>{c.charge}</Text>
      <Text style={[s.small, { marginTop: 4 }]}>
        Beweismittel: {c.questXp} XP / {c.questCoins} Coins · Status {c.status}
      </Text>
      <View style={{ gap: 8, marginTop: 12 }}>
        {msgs.map((m) => (
          <View
            key={m.id}
            style={{
              alignSelf: m.role === "angeklagter" ? "flex-end" : "flex-start",
              maxWidth: "88%",
              backgroundColor: m.role === "angeklagter" ? `${colors.blue}22` : m.role === "richter" ? `${colors.gold}14` : "transparent",
              borderRadius: 10,
              padding: m.role === "system" ? 0 : 10,
            }}
          >
            <Text style={s.small}>{ROLE[m.role]}</Text>
            <Text style={m.role === "system" ? s.small : s.text}>{m.content}</Text>
          </View>
        ))}
      </View>

      {c.verdict ? (
        <View style={{ marginTop: 12, borderColor: colors.gold, borderWidth: 1, borderRadius: 10, padding: 12, gap: 6 }}>
          <Text style={{ color: colors.gold, fontWeight: "700", fontSize: 16 }}>⚖️ {VERDICT_LABELS[c.verdict]}</Text>
          {c.reasoning ? <Text style={s.text}>{c.reasoning}</Text> : null}
          {c.consequences.length ? (
            c.consequences.map((k, i) => (
              <Text key={i} style={s.muted}>
                • {consequenceText(k)}
              </Text>
            ))
          ) : (
            <Text style={{ color: colors.success }}>Keine Konsequenzen.</Text>
          )}
        </View>
      ) : null}

      {open && c.plea === null ? (
        <View style={{ marginTop: 12, gap: 8 }}>
          <Text style={s.label}>Plädoyer</Text>
          <Choice options={PLEAS} value={plea} onChange={setPlea} label={(p) => PLEA_LABELS[p]} />
          <Text style={s.label}>Grund</Text>
          <Choice options={EXCUSES} value={excuse} onChange={setExcuse} label={(x) => EXCUSE_LABELS[x]} />
          <TextInput style={[s.input, { minHeight: 70 }]} multiline value={statement} onChangeText={setStatement} placeholder="Deine Aussage" placeholderTextColor={colors.muted} />
          <Button label={busy ? "Gericht berät…" : "Plädoyer abgeben"} icon="hammer" disabled={busy} onPress={() => void act(() => store.plead(c.id, { plea, excuse, statement }))} />
        </View>
      ) : null}

      {open && c.plea !== null ? (
        <View style={{ marginTop: 12, gap: 8 }}>
          {canTalk ? (
            <>
              <TextInput style={[s.input, { minHeight: 60 }]} multiline value={statement} onChangeText={setStatement} placeholder="Antwort an den Richter (leer = weiter verhandeln)" placeholderTextColor={colors.muted} />
              <Button label={busy ? "Gericht berät…" : statement.trim() ? "Antworten" : "Weiter verhandeln"} variant="violet" disabled={busy} onPress={() => void act(() => store.sendCourtMessage(c.id, statement))} />
            </>
          ) : null}
          <Button label="Regelrichter entscheiden lassen" variant="outline" icon="scale" disabled={busy} onPress={() => void act(() => store.ruleJudge(c.id))} />
        </View>
      ) : null}

      {c.status === "urteil" && c.appealCount === 0 && c.verdict && !["freispruch", "einstellung"].includes(c.verdict) ? (
        <View style={{ marginTop: 12, gap: 8 }}>
          <Text style={s.label}>Berufung – neuer oder übersehener Grund</Text>
          <Choice options={EXCUSES} value={excuse} onChange={setExcuse} label={(x) => EXCUSE_LABELS[x]} />
          <TextInput style={[s.input, { minHeight: 60 }]} multiline value={statement} onChangeText={setStatement} placeholder="Begründung" placeholderTextColor={colors.muted} />
          <Button label="Berufung einlegen" variant="outline" disabled={busy} onPress={() => void act(() => store.appeal(c.id, { excuse, statement }))} />
        </View>
      ) : null}
    </Card>
  );
}

export default function Court() {
  const { snap, today, run } = useGame();
  const missed = missedMandatory(snap, today);
  const [selected, setSelected] = useState<string | null>(null);
  const current = snap.cases.find((c) => c.id === selected) ?? null;

  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.h1}>Court of Life</Text>
        <Text style={s.muted}>Krankheit, Verletzung, Regeneration und Notfälle werden nie bestraft.</Text>

        {current ? (
          <>
            <Button label="← Alle Verfahren" variant="outline" onPress={() => setSelected(null)} />
            <CaseView key={current.id} c={current} />
          </>
        ) : (
          <>
            <Card title="Anklagebank">
              {missed.length === 0 ? (
                <Text style={s.muted}>Keine verpassten Pflichtquests. Vorbildlich.</Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {missed.map((m) => (
                    <QuestRow
                      key={m.quest.id + m.key}
                      item={m}
                      onCourt={async () => {
                        const r = rewardOf(m.quest);
                        const c = await run((st) =>
                          st.openCase({
                            questId: m.quest.id,
                            occurrenceKey: m.key,
                            charge: `„${m.quest.title}" am ${m.dueAt ? new Date(m.dueAt).toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : m.key} nicht erfüllt`,
                            questXp: r.xp,
                            questCoins: r.coins,
                          }),
                        );
                        if (c) setSelected(c.id);
                      }}
                    />
                  ))}
                  <Text style={s.small}>Antippen = nachträglich erledigt · Hammer = Verfahren eröffnen</Text>
                </View>
              )}
            </Card>
            <Card title="Verfahren">
              {snap.cases.length === 0 ? (
                <Text style={s.muted}>Noch keine Verfahren.</Text>
              ) : (
                snap.cases.map((c) => (
                  <Pressable key={c.id} onPress={() => setSelected(c.id)} style={{ paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1 }}>
                    <Text style={s.text} numberOfLines={1}>
                      {c.charge}
                    </Text>
                    <View style={[s.row, { marginTop: 4 }]}>
                      <Badge text={c.verdict ? VERDICT_LABELS[c.verdict] : c.status} color={c.verdict ? colors.gold : colors.danger} />
                    </View>
                  </Pressable>
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
