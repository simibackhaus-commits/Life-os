import { router } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { COUNCIL_ROLES, ROLES, type RoleId } from "@life-os/ai";
import type { QuestDraftInput } from "@life-os/core";
import { Button } from "@/components/ui";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

interface Entry {
  who: "ich" | RoleId | "system";
  text: string;
  proposals?: QuestDraftInput[];
}

const ROLE_CHOICES: RoleId[] = ["spielleiter", ...COUNCIL_ROLES];

/** Chat mit einer Rolle oder Ratssitzung mit mehreren – alles über die aktive KI (Standard: auf dem iPhone). */
export default function Chat() {
  const { store, run, notify, ai } = useGame();
  const [role, setRole] = useState<RoleId>("spielleiter");
  const [council, setCouncil] = useState(false);
  const [members, setMembers] = useState<RoleId[]>(["general", "stratege", "regeneration"]);
  const [log, setLog] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  async function send() {
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    setLog((l) => [...l, { who: "ich", text: msg }]);
    setBusy(true);
    try {
      if (council) {
        const answers = await store.council(msg, members);
        setLog((l) => [...l, ...answers.map((a) => ({ who: a.role, text: a.reply }))]);
      } else {
        const r = await store.chat(msg, role);
        setLog((l) => [...l, { who: role, text: r.reply, proposals: r.proposals }]);
      }
    } catch (e) {
      setLog((l) => [...l, { who: "system", text: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  async function accept(p: QuestDraftInput, i: number, j: number) {
    const q = await run((st) => st.createQuest(p));
    if (!q) return;
    notify("info", `Quest „${q.title}“ übernommen.`);
    setLog((l) => l.map((e, k) => (k === i ? { ...e, proposals: e.proposals?.filter((_, x) => x !== j) } : e)));
  }

  const chip = (on: boolean) => ({
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderColor: on ? colors.gold : colors.border,
    backgroundColor: on ? `${colors.gold}22` : "transparent",
  });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.screen} keyboardVerticalOffset={90}>
      <View style={{ padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={[s.row, { gap: 6 }]}>
          <Pressable style={chip(!council)} onPress={() => setCouncil(false)}>
            <Text style={{ color: !council ? colors.gold : colors.muted }}>Einzelgespräch</Text>
          </Pressable>
          <Pressable style={chip(council)} onPress={() => setCouncil(true)}>
            <Text style={{ color: council ? colors.gold : colors.muted }}>Ratssitzung</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {(council ? COUNCIL_ROLES : ROLE_CHOICES).map((r) => {
            const on = council ? members.includes(r) : r === role;
            return (
              <Pressable key={r} style={chip(on)} onPress={() => (council ? setMembers((m) => (m.includes(r) ? m.filter((x) => x !== r) : [...m, r])) : setRole(r))}>
                <Text style={{ color: on ? colors.gold : colors.muted, fontSize: 13 }}>
                  {ROLES[r].icon} {ROLES[r].name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={s.small}>
          {ai.provider ? ai.provider.label : "KI aus"}
          {council ? " · alle Stimmen kommen aus einem Modell" : ""}
        </Text>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: 12, gap: 8 }}>
        {!ai.provider ? (
          <View style={{ gap: 8 }}>
            <Text style={s.muted}>Die KI ist aus. Lade ein Modell, dann läuft der Chat komplett offline auf deinem iPhone.</Text>
            <Button label="KI einrichten" icon="hardware-chip" onPress={() => router.push("/ai")} />
          </View>
        ) : log.length === 0 ? (
          <Text style={s.muted}>Frag z. B. „Plane meinen Tag – ich habe 2 Stunden frei“ oder stelle dem Rat eine Entscheidung vor.</Text>
        ) : null}
        {log.map((e, i) => (
          <View
            key={i}
            style={{
              alignSelf: e.who === "ich" ? "flex-end" : "flex-start",
              maxWidth: "88%",
              borderRadius: 12,
              padding: 10,
              backgroundColor: e.who === "ich" ? `${colors.blue}22` : e.who === "system" ? "transparent" : `${colors.violet}1f`,
            }}
          >
            {e.who !== "ich" && e.who !== "system" ? (
              <Text style={[s.small, { marginBottom: 2 }]}>
                {ROLES[e.who].icon} {ROLES[e.who].name}
              </Text>
            ) : null}
            <Text style={e.who === "system" ? s.small : s.text}>{e.text}</Text>
            {e.proposals?.map((p, j) => (
              <View key={j} style={[s.row, { justifyContent: "space-between", marginTop: 6, gap: 8 }]}>
                <Text style={[s.small, { flex: 1 }]}>{p.title}</Text>
                <Button label="Übernehmen" variant="gold" onPress={() => void accept(p, i, j)} />
              </View>
            ))}
          </View>
        ))}
        {busy ? (
          <View style={[s.row, { gap: 8 }]}>
            <ActivityIndicator color={colors.gold} />
            <Text style={s.small}>{council ? "Der Rat berät…" : `${ROLES[role].name} denkt nach…`}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[s.row, { padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: colors.border }]}>
        <TextInput style={[s.input, { flex: 1 }]} value={input} onChangeText={setInput} placeholder={council ? "Frage an den Rat…" : `Nachricht an ${ROLES[role].name}…`} placeholderTextColor={colors.muted} editable={!busy} onSubmitEditing={() => void send()} returnKeyType="send" />
        <Button label="Senden" variant="violet" disabled={busy || !input.trim() || !ai.provider || (council && members.length === 0)} onPress={() => void send()} />
      </View>
    </KeyboardAvoidingView>
  );
}
