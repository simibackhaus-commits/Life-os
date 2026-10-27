import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { addDays, QUEST_TYPE_LABELS } from "@life-os/core";
import { calendarDay } from "@life-os/api";
import { Badge, Card, QuestRow } from "@/components/ui";
import { colors, questTypeColors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

/** Agenda: Wochenleiste zum Blättern + Termine des gewählten Tages. */
export default function Calendar() {
  const { snap, today } = useGame();
  const [weekStart, setWeekStart] = useState(() => {
    const wd = (new Date(`${today}T12:00:00`).getDay() + 6) % 7;
    return addDays(today, -wd);
  });
  const [selected, setSelected] = useState(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const items = calendarDay(snap, selected);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Pressable onPress={() => setWeekStart(addDays(weekStart, -7))} hitSlop={10}>
          <Text style={{ color: colors.blue, fontSize: 15 }}>‹ Woche</Text>
        </Pressable>
        <Text style={s.text}>
          {new Date(`${weekStart}T12:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })} –{" "}
          {new Date(`${addDays(weekStart, 6)}T12:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}
        </Text>
        <Pressable onPress={() => setWeekStart(addDays(weekStart, 7))} hitSlop={10}>
          <Text style={{ color: colors.blue, fontSize: 15 }}>Woche ›</Text>
        </Pressable>
      </View>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        {days.map((d) => {
          const n = calendarDay(snap, d).length;
          const active = d === selected;
          return (
            <Pressable
              key={d}
              onPress={() => setSelected(d)}
              style={{ alignItems: "center", paddingVertical: 8, width: 44, borderRadius: 10, borderWidth: 1, borderColor: active ? colors.gold : d === today ? colors.blue : colors.border, backgroundColor: active ? `${colors.gold}22` : "transparent" }}
            >
              <Text style={s.small}>{new Date(`${d}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short" }).slice(0, 2)}</Text>
              <Text style={[s.text, { fontWeight: "700" }]}>{Number(d.slice(8))}</Text>
              <Text style={{ color: n ? colors.violet : "transparent", fontSize: 10 }}>{n ? `● ${n}` : "·"}</Text>
            </Pressable>
          );
        })}
      </View>
      <Card title={new Date(`${selected}T12:00:00`).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}>
        {items.length === 0 ? (
          <Text style={s.muted}>Keine Termine.</Text>
        ) : selected === today ? (
          <View style={{ gap: 8 }}>
            {items.map((i) => (
              <QuestRow key={i.quest.id + i.key} item={i} />
            ))}
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {items.map((i) => (
              <Pressable key={i.quest.id + i.key} onPress={() => router.push({ pathname: "/quest/[id]", params: { id: i.quest.id } })} style={[s.row, { justifyContent: "space-between", paddingVertical: 6, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.text}>{i.quest.title}</Text>
                  <View style={s.row}>
                    <Badge text={QUEST_TYPE_LABELS[i.quest.type]} color={questTypeColors[i.quest.type]} />
                    <Text style={s.small}>{i.time ?? "ganztägig"}</Text>
                  </View>
                </View>
                <Text style={{ color: i.status === "erledigt" ? colors.success : selected < today ? colors.danger : colors.muted, fontSize: 12 }}>
                  {selected < today && i.status === "offen" ? "verpasst" : i.status}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}
