import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ATTRIBUTE_LABELS, CHAPTERS, headquarters, headquartersRank, levelFromXp, storyProgress, trophies } from "@life-os/core";
import { achievementsFor } from "@life-os/api";
import { Bar, Card } from "@/components/ui";
import { attributeColors, colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

export default function Headquarters() {
  const { snap, today } = useGame();
  const rooms = headquarters(snap.character);
  const rank = headquartersRank(rooms);
  const cups = trophies(achievementsFor(snap, today));
  const story = storyProgress(levelFromXp(snap.character.totalXp).level);
  const [open, setOpen] = useState(story.unlocked.at(-1)?.number ?? 1);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Card>
        <View style={[s.row, { gap: 14 }]}>
          <Text style={{ fontSize: 52 }}>{rank.icon}</Text>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.h1, { fontSize: 20 }]}>{rank.title}</Text>
            <Bar value={rank.score / 40} height={6} />
            <Text style={s.small}>Ausbaustufe {rank.score}/40 – Räume wachsen mit ihren Attributen.</Text>
          </View>
        </View>
      </Card>

      <View style={[s.row, { flexWrap: "wrap", gap: 8 }]}>
        {rooms.map((r) => (
          <View key={r.room.id} style={[s.card, { width: "31%", padding: 8, alignItems: "center", borderColor: r.tierIndex > 0 ? attributeColors[r.room.attribute] : colors.border }]}>
            <Text style={{ fontSize: 30, opacity: r.tierIndex === 0 ? 0.5 : 1 }}>{r.icon}</Text>
            <Text style={[s.small, { color: colors.text, textAlign: "center" }]} numberOfLines={2}>
              {r.room.name}
            </Text>
            <Text style={{ color: attributeColors[r.room.attribute], fontSize: 10 }}>{r.tier}</Text>
          </View>
        ))}
      </View>

      <Card title={`Trophäen · ${cups.length}`}>
        {cups.length === 0 ? (
          <Text style={s.muted}>Jedes Achievement stellt hier eine Trophäe auf.</Text>
        ) : (
          <Text style={{ fontSize: 26, lineHeight: 36 }}>{cups.map((c) => c.icon).join(" ")}</Text>
        )}
      </Card>

      <Card title={`Chronik · Kapitel ${story.unlocked.length}/${CHAPTERS.length}`}>
        <View style={{ gap: 8 }}>
          {story.unlocked.map((c) => (
            <Pressable key={c.number} onPress={() => setOpen(open === c.number ? 0 : c.number)} style={{ borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 10 }}>
              <Text style={{ color: colors.gold, fontWeight: "700" }}>
                {c.number}. {c.title}
              </Text>
              {open === c.number ? <Text style={[s.text, { marginTop: 6, lineHeight: 21 }]}>{c.text(snap.character)}</Text> : null}
            </Pressable>
          ))}
          {story.next ? (
            <Text style={s.muted}>
              🔒 Kapitel {story.next.number} „{story.next.title}“ ab Level {story.next.level}
            </Text>
          ) : null}
        </View>
      </Card>
      <Text style={s.small}>Räume: {rooms.map((r) => `${r.room.name} = ${ATTRIBUTE_LABELS[r.room.attribute]}`).join(" · ")}</Text>
    </ScrollView>
  );
}
