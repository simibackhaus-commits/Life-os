import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Attributes, Button, Card, CharacterHeader } from "@/components/ui";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

export default function CharacterScreen() {
  const { snap, run, notify } = useGame();
  const c = snap.character;
  const [name, setName] = useState(c.name);
  const [avatar, setAvatar] = useState(c.avatar);
  const history = [...snap.events].reverse().slice(0, 30);

  return (
    <SafeAreaView style={s.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.h1}>Charakter</Text>
        <CharacterHeader character={c} />
        <Card title="Anpassen">
          <Text style={s.label}>Name</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} maxLength={60} />
          <Text style={s.label}>Avatar-Symbol (Emoji)</Text>
          <TextInput style={s.input} value={avatar} onChangeText={setAvatar} placeholder="⚔️" placeholderTextColor={colors.muted} />
          <View style={{ marginTop: 12 }}>
            <Button
              label="Speichern"
              onPress={async () => {
                await run((st) => st.updateCharacter({ name: name.trim() || "Held", avatar: avatar.slice(0, 2) }));
                notify("info", "Charakter gespeichert.");
              }}
            />
          </View>
        </Card>
        <Attributes character={c} />
        <Card title="Charakterhistorie">
          {history.length === 0 ? (
            <Text style={s.muted}>Deine Geschichte beginnt mit der ersten Quest.</Text>
          ) : (
            history.map((e) => (
              <View key={e.id} style={[s.row, { justifyContent: "space-between", paddingVertical: 6, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.text} numberOfLines={1}>
                    {e.note || e.kind}
                  </Text>
                  <Text style={s.small}>{new Date(e.createdAt).toLocaleString("de-DE")}</Text>
                </View>
                <Text style={{ color: e.xpDelta >= 0 ? colors.gold : colors.danger }}>
                  {e.xpDelta >= 0 ? "+" : ""}
                  {e.xpDelta} XP
                </Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
