import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { BUDGET_CATEGORIES, monthSummary } from "@life-os/core";
import { GoalBar } from "@/components/modules";
import { Button, Card } from "@/components/ui";
import { colors, s } from "@/lib/theme";
import { useGame } from "@/state/GameProvider";

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

/** Schnell erfassen unterwegs: Einzahlung aufs Sparziel oder Ausgabe; Details am Desktop. */
export default function Finance() {
  const { snap, run, notify, today } = useGame();
  const m = monthSummary(snap.financeEntries, today.slice(0, 7));
  const goals = snap.goals.filter((g) => g.area === "finanzen" && g.status !== "archiviert");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("lebensmittel");
  const [deposit, setDeposit] = useState<Record<string, string>>({});
  const [goalTitle, setGoalTitle] = useState("");
  const [goalTarget, setGoalTarget] = useState("");

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Card title="Dieser Monat">
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <Text style={{ color: colors.success }}>+{eur(m.income)}</Text>
          <Text style={{ color: colors.danger }}>−{eur(m.expenses)}</Text>
          <Text style={{ color: colors.gold }}>gespart {eur(m.saved)}</Text>
        </View>
        <Text style={[s.text, { marginTop: 6 }]}>Saldo: {eur(m.balance)}</Text>
      </Card>

      <Card title="Sparziele">
        <View style={{ gap: 14 }}>
          {goals.length === 0 ? <Text style={s.muted}>Noch keine Sparziele.</Text> : null}
          {goals.map((g) => (
            <View key={g.id} style={{ gap: 6 }}>
              <Text style={[s.text, { fontWeight: "600" }]}>{g.title}</Text>
              <GoalBar goal={g} color={colors.gold} />
              <View style={[s.row, { gap: 8 }]}>
                <TextInput
                  style={[s.input, { flex: 1 }]}
                  keyboardType="decimal-pad"
                  placeholder="Betrag €"
                  placeholderTextColor={colors.muted}
                  value={deposit[g.id] ?? ""}
                  onChangeText={(v) => setDeposit((d) => ({ ...d, [g.id]: v }))}
                />
                <View style={{ width: 120 }}>
                  <Button
                    label="Einzahlen"
                    variant="outline"
                    disabled={!(Number((deposit[g.id] ?? "").replace(",", ".")) > 0)}
                    onPress={async () => {
                      const amt = Number((deposit[g.id] ?? "").replace(",", "."));
                      if (await run((st) => st.addFinanceEntry({ kind: "einzahlung", amount: amt, date: today, goalId: g.id, note: g.title }))) {
                        notify("info", `${eur(amt)} gespart.`);
                        setDeposit((d) => ({ ...d, [g.id]: "" }));
                      }
                    }}
                  />
                </View>
              </View>
            </View>
          ))}
          <View style={[s.row, { gap: 8 }]}>
            <TextInput style={[s.input, { flex: 2 }]} placeholder="Neues Sparziel" placeholderTextColor={colors.muted} value={goalTitle} onChangeText={setGoalTitle} />
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Ziel €" placeholderTextColor={colors.muted} keyboardType="decimal-pad" value={goalTarget} onChangeText={setGoalTarget} />
          </View>
          <Button
            label="Sparziel anlegen"
            variant="outline"
            disabled={!goalTitle.trim() || !(Number(goalTarget.replace(",", ".")) > 0)}
            onPress={async () => {
              if (await run((st) => st.createGoal({ title: goalTitle, area: "finanzen", targetValue: Number(goalTarget.replace(",", ".")), unit: "€" }))) {
                setGoalTitle("");
                setGoalTarget("");
              }
            }}
          />
        </View>
      </Card>

      <Card title="Ausgabe erfassen">
        <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Betrag €" placeholderTextColor={colors.muted} value={amount} onChangeText={setAmount} />
        <View style={[s.row, { flexWrap: "wrap", gap: 6, marginVertical: 10 }]}>
          {BUDGET_CATEGORIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCategory(c)}
              style={{ borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderColor: c === category ? colors.danger : colors.border }}
            >
              <Text style={{ color: c === category ? colors.danger : colors.muted, fontSize: 12 }}>{c}</Text>
            </Pressable>
          ))}
        </View>
        <Button
          label="Ausgabe buchen"
          variant="danger"
          disabled={!(Number(amount.replace(",", ".")) > 0)}
          onPress={async () => {
            if (await run((st) => st.addFinanceEntry({ kind: "ausgabe", amount: Number(amount.replace(",", ".")), category, date: today }))) setAmount("");
          }}
        />
      </Card>
    </ScrollView>
  );
}
