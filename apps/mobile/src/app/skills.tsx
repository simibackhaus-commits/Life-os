import { ScrollView, Text, View } from "react-native";
import { ATTRIBUTES, ATTRIBUTE_LABELS, SKILLS, SKILL_CAPS, attributeLevel, canUnlock, skillPoints } from "@life-os/core";
import { Button, Card } from "@/components/ui";
import { attributeColors, colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

const REASONS: Record<string, string> = {
  level: "Attribut-Level zu niedrig",
  previous: "Erst die vorherige Stufe",
  points: "Keine Skillpunkte",
  already: "Bereits freigeschaltet",
  unknown: "Unbekannt",
};

export default function Skills() {
  const { snap, run, notify } = useGame();
  const unlocked = new Set(snap.skills);
  const xp = snap.character.attributeXp ?? {};

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.muted}>
        Jedes Attribut-Level über 1 gibt einen Skillpunkt. Fähigkeiten geben Bonus-XP und -Coins (max. +{SKILL_CAPS.xpPct} % / +{SKILL_CAPS.coinPct} % pro Quest).
      </Text>
      {ATTRIBUTES.map((a) => {
        const color = attributeColors[a];
        const pts = skillPoints(xp, unlocked, a);
        return (
          <Card key={a}>
            <View style={[s.row, { justifyContent: "space-between", marginBottom: 8 }]}>
              <Text style={{ color, fontWeight: "700", fontSize: 16 }}>{ATTRIBUTE_LABELS[a]}</Text>
              <Text style={s.small}>
                Lv {attributeLevel(xp, a)} · {pts.available} Punkte frei
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              {SKILLS.filter((sk) => sk.attribute === a).map((sk) => {
                const has = unlocked.has(sk.id);
                const check = canUnlock(sk.id, xp, unlocked);
                return (
                  <View
                    key={sk.id}
                    style={{ borderWidth: 1, borderRadius: 10, padding: 10, borderColor: has ? color : colors.border, backgroundColor: has ? `${color}1a` : "transparent", opacity: has || check.ok ? 1 : 0.55 }}
                  >
                    <View style={[s.row, { justifyContent: "space-between" }]}>
                      <Text style={[s.text, { fontWeight: "600" }]}>
                        {has ? "✓ " : check.ok ? "✨ " : "🔒 "}
                        {sk.title}
                      </Text>
                      <Text style={s.small}>ab Lv {sk.requiredLevel}</Text>
                    </View>
                    <Text style={s.small}>{sk.effect}</Text>
                    {!has && !check.ok ? <Text style={[s.small, { marginTop: 2 }]}>{REASONS[check.reason]}</Text> : null}
                    {!has && check.ok ? (
                      <View style={{ marginTop: 8 }}>
                        <Button
                          label="Freischalten"
                          onPress={async () => {
                            const r = await run((st) => st.unlockSkill(sk.id));
                            if (r?.ok) notify("xp", `✨ ${sk.title} freigeschaltet!`);
                            else if (r) notify("error", REASONS[r.reason] ?? r.reason);
                          }}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}
