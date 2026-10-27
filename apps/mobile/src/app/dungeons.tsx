import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ATTRIBUTES, ATTRIBUTE_LABELS, DUNGEONS, DUNGEON_BY_ID, focusRemaining, type Attribute } from "@life-os/core";
import { ActionSheet, Bar, Button, Card } from "@/components/ui";
import { attributeColors, colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

const fmt = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, sec) % 60).padStart(2, "0")}`;

export default function Dungeons() {
  const { snap, run, notify } = useGame();
  const running = snap.focusSessions.find((f) => f.status === "laufend") ?? null;
  const [dungeonId, setDungeonId] = useState("hoehle");
  const [attribute, setAttribute] = useState<Attribute>("intelligenz");
  const [intent, setIntent] = useState("");
  const [now, setNow] = useState(Date.now());
  const [confirmQuit, setConfirmQuit] = useState(false);
  const finishing = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = running ? focusRemaining(running, now) : 0;
  useEffect(() => {
    if (!running || remaining > 0 || finishing.current) return;
    finishing.current = true;
    void run((st) => st.finishFocus(running.id)).then((r) => {
      finishing.current = false;
      if (r?.applied) notify("xp", `🏆 Dungeon bezwungen! +${r.xp} XP · +${r.coins} Coins`);
    });
  }, [running, remaining, run, notify]);

  if (running) {
    const spec = DUNGEON_BY_ID.get(running.dungeonId)!;
    return (
      <View style={[s.screen, { justifyContent: "center", padding: 24, gap: 16 }]}>
        <Text style={{ fontSize: 64, textAlign: "center" }}>{spec.icon}</Text>
        <Text style={[s.h1, { textAlign: "center", fontSize: 22 }]}>{spec.title}</Text>
        {running.intent ? <Text style={[s.muted, { textAlign: "center" }]}>{running.intent}</Text> : null}
        <Text style={{ color: colors.gold, fontSize: 72, fontWeight: "800", textAlign: "center", fontVariant: ["tabular-nums"] }}>{fmt(remaining)}</Text>
        <Bar value={1 - remaining / (running.minutes * 60)} height={8} />
        <Text style={[s.small, { textAlign: "center" }]}>
          +{spec.xp} XP · +{spec.coins} Coins · {ATTRIBUTE_LABELS[running.attribute]}. Du bekommst eine Benachrichtigung, wenn die Zeit um ist.
        </Text>
        <Button label="Aufgeben" variant="outline" onPress={() => setConfirmQuit(true)} />
        <ActionSheet
          title={confirmQuit ? "Dungeon aufgeben?" : null}
          message="Es gibt keine Belohnung."
          options={[{ label: "Aufgeben", destructive: true, onPress: () => void run((st) => st.abandonFocus(running.id)) }]}
          onClose={() => setConfirmQuit(false)}
        />
      </View>
    );
  }

  const done = snap.focusSessions.filter((f) => f.status === "geschafft");
  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {DUNGEONS.map((d) => (
        <Pressable key={d.id} onPress={() => setDungeonId(d.id)}>
          <Card style={{ borderColor: d.id === dungeonId ? colors.gold : colors.border }}>
            <View style={[s.row, { gap: 12 }]}>
              <Text style={{ fontSize: 34 }}>{d.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.gold, fontWeight: "700" }}>{d.title}</Text>
                <Text style={s.small}>{d.description}</Text>
                <Text style={s.text}>
                  {d.minutes} min · +{d.xp} XP · +{d.coins} ¢
                </Text>
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
      <Card title="Attribut">
        <View style={[s.row, { flexWrap: "wrap", gap: 6 }]}>
          {ATTRIBUTES.map((a) => (
            <Pressable
              key={a}
              onPress={() => setAttribute(a)}
              style={{ borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, borderColor: a === attribute ? attributeColors[a] : colors.border }}
            >
              <Text style={{ color: a === attribute ? attributeColors[a] : colors.muted, fontSize: 12 }}>{ATTRIBUTE_LABELS[a]}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={[s.input, { marginTop: 10 }]} placeholder="Woran arbeitest du?" placeholderTextColor={colors.muted} value={intent} onChangeText={setIntent} maxLength={120} />
        <View style={{ marginTop: 12 }}>
          <Button label="Dungeon betreten" icon="flash" onPress={() => void run((st) => st.startFocus({ dungeonId: dungeonId as "hoehle", attribute, intent }))} />
        </View>
      </Card>
      <Text style={s.small}>
        {done.length} Dungeons bezwungen · {done.reduce((sum, f) => sum + f.minutes, 0)} Fokus-Minuten
      </Text>
    </ScrollView>
  );
}
