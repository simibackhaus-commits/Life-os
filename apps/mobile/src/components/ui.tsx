import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Modal, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ATTRIBUTES, ATTRIBUTE_CURVE, ATTRIBUTE_LABELS, QUEST_TYPE_LABELS, levelFromXp, pendingRewards, titleForLevel, type Character } from "@life-os/core";
import { achievementsFor, questStreak, rewardOf, type OccurrenceItem } from "@life-os/api";
import { attributeColors, colors, questTypeColors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

export function Card({ title, children, style }: { title?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.card, style]}>
      {title ? <Text style={s.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Bar({ value, color = colors.gold, height = 8 }: { value: number; color?: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height, backgroundColor: colors.surface2, overflow: "hidden" }}>
      <View style={{ height, width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ borderColor: `${color}66`, backgroundColor: `${color}1a`, borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ color, fontSize: 10, fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "gold",
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: "gold" | "violet" | "outline" | "danger" | "blue";
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
}) {
  const bg = { gold: colors.gold, violet: colors.violet, outline: "transparent", danger: colors.danger, blue: colors.blue }[variant];
  const fg = variant === "outline" ? colors.text : variant === "violet" ? "#fff" : colors.bg;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderColor: colors.border,
        borderWidth: variant === "outline" ? 1 : 0,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 6,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={17} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: "700", fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export function CharacterHeader({ character }: { character: Character }) {
  const { snap } = useGame();
  const lvl = levelFromXp(character.totalXp);
  const pending = pendingRewards(snap.events);
  return (
    <Card>
      <View style={[s.row, { gap: 14 }]}>
        <View style={{ width: 58, height: 58, borderRadius: 14, backgroundColor: colors.violetDeep, borderColor: colors.gold, borderWidth: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.gold, fontSize: 26, fontWeight: "700" }}>{character.avatar || character.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: "700" }} numberOfLines={1}>
            {character.name}
          </Text>
          <Text style={s.small}>
            {character.title && character.title !== "Neuling" ? character.title : titleForLevel(lvl.level)} · {character.className}
          </Text>
          <View style={[s.row, { gap: 14 }]}>
            <Text style={{ color: colors.gold, fontWeight: "700" }}>Level {lvl.level}</Text>
            <Text style={{ color: colors.blue, fontWeight: "600" }}>{character.coins} LIFE COINS</Text>
          </View>
        </View>
      </View>
      <View style={{ marginTop: 12, gap: 4 }}>
        <Bar value={lvl.progress} />
        <Text style={s.small}>
          {lvl.xpInLevel} / {lvl.xpForLevel} XP bis Level {lvl.level + 1}
        </Text>
        {pending.count > 0 ? (
          <Text style={[s.small, { color: colors.violet }]}>⏳ Heute vorgemerkt: +{pending.xp} XP · +{pending.coins} Coins – Gutschrift beim Tagesabschluss (ab 04:00)</Text>
        ) : null}
      </View>
    </Card>
  );
}

export function Attributes({ character }: { character: Character }) {
  return (
    <Card title="Attribute">
      <View style={{ gap: 10 }}>
        {ATTRIBUTES.map((a) => {
          const info = levelFromXp(character.attributeXp?.[a] ?? 0, ATTRIBUTE_CURVE);
          return (
            <View key={a} style={{ gap: 4 }}>
              <View style={[s.row, { justifyContent: "space-between" }]}>
                <Text style={{ color: attributeColors[a], fontSize: 13 }}>{ATTRIBUTE_LABELS[a]}</Text>
                <Text style={s.small}>Lv {info.level}</Text>
              </View>
              <Bar value={info.progress} color={attributeColors[a]} height={5} />
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const TIER_COLOR = { bronze: "#cd7f32", silber: "#cbd5e1", gold: "#e6b450", "legendär": "#8b5cf6" } as const;

export function AchievementList() {
  const { snap, today } = useGame();
  const list = achievementsFor(snap, today).sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.progress - a.progress);
  return (
    <Card title={`Achievements · ${list.filter((a) => a.unlocked).length}/${list.length}`}>
      <View style={{ gap: 8 }}>
        {list.map((a) => (
          <View key={a.def.id} style={[s.row, { gap: 10, opacity: a.unlocked ? 1 : 0.5 }]}>
            <Text style={{ fontSize: 24 }}>{a.def.icon}</Text>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ color: a.unlocked ? TIER_COLOR[a.def.tier] : colors.text, fontWeight: "600" }}>{a.def.title}</Text>
              <Text style={s.small}>{a.def.description}</Text>
              {!a.unlocked && a.target > 1 ? <Bar value={a.progress} height={4} color={colors.violet} /> : null}
            </View>
            {!a.unlocked && a.target > 1 ? (
              <Text style={s.small}>
                {a.current}/{a.target}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </Card>
  );
}

/** Quest-Zeile mit großem Abhak-Feld, Animation und Haptik. Langes Drücken nimmt einen Abschluss zurück. */
export function QuestRow({ item, onCourt }: { item: OccurrenceItem; onCourt?: () => void }) {
  const { complete, run, notify, snap, today } = useGame();
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const done = item.status === "erledigt";
  const excused = item.status === "entschuldigt";
  const reward = rewardOf(item.quest, snap.skills);
  const streak = questStreak(snap, item.quest, today);

  async function onPress() {
    if (done || excused) return;
    const r = await complete({ questId: item.quest.id, occurrenceKey: item.key, dueAt: item.dueAt });
    if (r?.applied) {
      glow.setValue(1);
      Animated.parallel([
        Animated.sequence([
          Animated.spring(scale, { toValue: 1.25, useNativeDriver: true, speed: 40 }),
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }),
        ]),
        Animated.timing(glow, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]).start();
    }
  }

  async function onLongPress() {
    // offen: bearbeiten · erledigt: zurücknehmen (bis zum Tagesabschluss)
    if (!done) return router.push({ pathname: "/quest/[id]", params: { id: item.quest.id } });
    if (!item.instance) return;
    const ok = await run((s) => s.uncomplete(item.instance!.id));
    if (ok) notify("info", "Abschluss zurückgenommen.");
  }

  return (
    <Pressable
      onPress={() => void onPress()}
      onLongPress={() => void onLongPress()}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={item.quest.title}
      style={({ pressed }) => [
        { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface2, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border },
        { opacity: done ? 0.55 : pressed ? 0.85 : 1 },
      ]}
    >
      <Animated.View
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: done ? colors.success : colors.muted,
          backgroundColor: done ? `${colors.success}33` : "transparent",
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale }],
        }}
      >
        {done ? <Ionicons name="checkmark" size={20} color={colors.success} /> : null}
        <Animated.View
          pointerEvents="none"
          style={{ position: "absolute", width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: colors.gold, opacity: glow }}
        />
      </Animated.View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[s.text, done && { textDecorationLine: "line-through" }]} numberOfLines={2}>
          {item.quest.title}
        </Text>
        <View style={[s.row, { flexWrap: "wrap", gap: 6 }]}>
          <Badge text={QUEST_TYPE_LABELS[item.quest.type]} color={questTypeColors[item.quest.type]} />
          {item.time ? <Text style={s.small}>{item.time}</Text> : null}
          {streak && streak.current > 0 ? <Text style={[s.small, { color: colors.warning }]}>🔥 {streak.current}</Text> : null}
          {item.quest.mandatory && !done ? <Badge text="Pflicht" color={colors.danger} /> : null}
          {excused ? <Badge text="entschuldigt" color={colors.success} /> : null}
        </View>
      </View>
      {onCourt ? (
        <Pressable onPress={onCourt} hitSlop={10} accessibilityLabel="Verfahren eröffnen">
          <Ionicons name="hammer" size={20} color={colors.danger} />
        </Pressable>
      ) : (
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ color: colors.gold, fontSize: 12, fontWeight: "700" }}>+{reward.xp} XP</Text>
          <Text style={{ color: colors.blue, fontSize: 11 }}>+{reward.coins} ¢</Text>
        </View>
      )}
    </Pressable>
  );
}

export interface SheetOption {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

/** Auswahlmenü von unten – ersetzt Alert mit Buttons, das im Web (Home-Bildschirm-App) nicht funktioniert. */
export function ActionSheet({ title, message, options, onClose }: { title: string | null; message?: string; options: SheetOption[]; onClose: () => void }) {
  return (
    <Modal visible={title !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end", padding: 12 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.surface, borderRadius: 16, borderColor: colors.border, borderWidth: 1, padding: 14, gap: 8, marginBottom: 24 }}>
          <Text style={[s.text, { fontWeight: "700", textAlign: "center" }]} numberOfLines={2}>
            {title}
          </Text>
          {message ? <Text style={[s.muted, { textAlign: "center" }]}>{message}</Text> : null}
          {options.map((o) => (
            <Button
              key={o.label}
              label={o.label}
              variant={o.destructive ? "danger" : "outline"}
              onPress={() => {
                onClose();
                o.onPress();
              }}
            />
          ))}
          <Button label="Abbrechen" variant="outline" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Tagesabschluss-Übersicht beim ersten Start nach 04:00 */
export function SettlementModal() {
  const { settlement, dismissSettlement, snap } = useGame();
  if (!settlement) return null;
  const total = settlement.reduce((a, d) => ({ xp: a.xp + d.xp, coins: a.coins + d.coins, done: a.done + d.completions }), { xp: 0, coins: 0, done: 0 });
  const top = Math.max(...settlement.map((d) => d.levelAfter));
  const levelUp = settlement.some((d) => d.levelAfter > d.levelBefore);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismissSettlement}>
      <Pressable onPress={dismissSettlement} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <View style={[s.card, { width: "100%", alignItems: "center", gap: 6, padding: 22 }]}>
          <Text style={{ fontSize: 40 }}>🌅</Text>
          <Text style={[s.h1, { fontSize: 22 }]}>Tagesabschluss</Text>
          <Text style={s.small}>{settlement.map((d) => new Date(`${d.day}T12:00:00`).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })).join(" · ")}</Text>
          <View style={[s.row, { gap: 22, marginVertical: 10 }]}>
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>{total.done}</Text>
              <Text style={s.small}>Quests</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: colors.gold, fontSize: 24, fontWeight: "800" }}>+{total.xp}</Text>
              <Text style={s.small}>XP</Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={{ color: colors.blue, fontSize: 24, fontWeight: "800" }}>+{total.coins}</Text>
              <Text style={s.small}>Coins</Text>
            </View>
          </View>
          {levelUp ? <Text style={{ color: colors.gold, fontSize: 18, fontWeight: "800" }}>✨ LEVEL UP → {top} · {titleForLevel(top)}</Text> : null}
          <Text style={s.small}>
            Kontostand: {snap.character.coins} Coins · {snap.character.totalXp} XP
          </Text>
          <Text style={[s.small, { marginTop: 8 }]}>Tippen zum Fortfahren</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

export function Toast() {
  const { toast } = useGame();
  if (!toast) return null;
  const color = toast.kind === "xp" ? colors.gold : toast.kind === "error" ? colors.danger : colors.text;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: 100, alignItems: "center" }}>
      <View style={{ backgroundColor: colors.surface, borderColor: color, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={{ color, fontWeight: "600", textAlign: "center" }}>{toast.text}</Text>
      </View>
    </View>
  );
}

export function LevelUp() {
  const { levelUp, dismissLevelUp } = useGame();
  const scale = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    if (levelUp) {
      scale.setValue(0.3);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    }
  }, [levelUp, scale]);
  return (
    <Modal visible={!!levelUp} transparent animationType="fade" onRequestClose={dismissLevelUp}>
      <Pressable onPress={dismissLevelUp} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={{ alignItems: "center", transform: [{ scale }] }}>
          <View style={{ width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: colors.gold, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: colors.gold, fontSize: 64, fontWeight: "800" }}>{levelUp}</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 30, fontWeight: "800", letterSpacing: 6, marginTop: 20 }}>LEVEL UP</Text>
          <Text style={[s.muted, { marginTop: 8 }]}>Neuer Titel: {levelUp ? titleForLevel(levelUp) : ""} · Tippen zum Fortfahren</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
