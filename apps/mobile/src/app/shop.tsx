import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SHOP_SUGGESTIONS, ShopItemDraftSchema, type ShopItem } from "@life-os/core";
import { ActionSheet, Button, Card } from "@/components/ui";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

const REASONS: Record<string, string> = {
  insufficient_coins: "Nicht genug LIFE COINS.",
  inactive: "Diese Belohnung ist deaktiviert.",
  not_found: "Belohnung nicht gefunden.",
  duplicate_event: "Kauf wurde bereits gebucht.",
};

export default function Shop() {
  const { snap, run, notify } = useGame();
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("50");
  const [icon, setIcon] = useState("🎁");
  const [selected, setSelected] = useState<ShopItem | null>(null);
  const coins = snap.character.coins;
  const items = [...snap.shopItems].sort((a, b) => Number(b.active) - Number(a.active) || a.cost - b.cost);

  async function add() {
    const p = ShopItemDraftSchema.safeParse({ title, cost: Number(cost), icon });
    if (!p.success) return notify("error", p.error.issues[0]?.message ?? "Ungültig");
    if (await run((st) => st.createShopItem(p.data))) {
      setTitle("");
      notify("info", "Belohnung angelegt.");
    }
  }

  async function buy(it: ShopItem) {
    const r = await run((st) => st.purchase(it.id));
    if (!r) return;
    if (r.applied) notify("xp", `${it.icon} ${it.title} eingelöst! (−${it.cost})`);
    else notify("error", REASONS[r.reason] ?? r.reason);
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Text style={s.muted}>Tausche LIFE COINS gegen echte Belohnungen.</Text>
        <Text style={{ color: colors.blue, fontWeight: "700" }}>{coins} ¢</Text>
      </View>

      {items.length === 0 ? (
        <Card>
          <Text style={[s.muted, { marginBottom: 10 }]}>Noch keine Belohnungen.</Text>
          <Button
            label="Vorschläge übernehmen"
            variant="outline"
            onPress={async () => {
              for (const sg of SHOP_SUGGESTIONS) await run((st) => st.createShopItem(sg));
            }}
          />
        </Card>
      ) : (
        items.map((it) => {
          const ok = it.active && coins >= it.cost;
          return (
            <Pressable key={it.id} onLongPress={() => setSelected(it)} delayLongPress={350}>
              <Card style={{ opacity: it.active ? 1 : 0.5 }}>
                <View style={[s.row, { gap: 12 }]}>
                  <Text style={{ fontSize: 30 }}>{it.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.text, { fontWeight: "600" }]}>{it.title}</Text>
                    <Text style={{ color: colors.blue, fontSize: 13 }}>{it.cost} Coins</Text>
                    {!ok && it.active ? <Text style={s.small}>Noch {it.cost - coins} Coins</Text> : null}
                  </View>
                  <View style={{ width: 110 }}>
                    <Button label="Einlösen" variant={ok ? "gold" : "outline"} disabled={!ok} onPress={() => void buy(it)} />
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        })
      )}
      {items.length ? <Text style={s.small}>Lange drücken zum Deaktivieren/Aktivieren.</Text> : null}

      <Card title="Neue Belohnung">
        <View style={[s.row, { gap: 8 }]}>
          <TextInput style={[s.input, { width: 56, textAlign: "center", fontSize: 20 }]} value={icon} onChangeText={setIcon} />
          <TextInput style={[s.input, { flex: 1 }]} value={title} onChangeText={setTitle} placeholder="z. B. Kinoabend" placeholderTextColor={colors.muted} />
        </View>
        <Text style={s.label}>Preis in Coins</Text>
        <TextInput style={[s.input, { width: 120 }]} value={cost} onChangeText={setCost} keyboardType="number-pad" />
        <View style={{ marginTop: 12 }}>
          <Button label="Anlegen" icon="add" onPress={() => void add()} disabled={!title.trim()} />
        </View>
      </Card>

      <Card title="Eingelöst">
        {snap.purchases.length === 0 ? (
          <Text style={s.muted}>Noch nichts eingelöst.</Text>
        ) : (
          snap.purchases.slice(0, 15).map((p) => (
            <View key={p.id} style={[s.row, { justifyContent: "space-between", paddingVertical: 5 }]}>
              <Text style={s.text} numberOfLines={1}>
                {p.title}
              </Text>
              <Text style={s.small}>−{p.cost} · {new Date(p.purchasedAt).toLocaleDateString("de-DE")}</Text>
            </View>
          ))
        )}
      </Card>

      <ActionSheet
        title={selected?.title ?? null}
        options={selected ? [{ label: selected.active ? "Deaktivieren" : "Aktivieren", onPress: () => void run((st) => st.updateShopItem(selected.id, { active: !selected.active })) }] : []}
        onClose={() => setSelected(null)}
      />
    </ScrollView>
  );
}
