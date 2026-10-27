import { useState } from "react";
import { PiggyBank, Repeat, Trash2 } from "lucide-react";
import { BUDGET_CATEGORIES, FINANCE_KINDS, FinanceEntrySchema, monthSummary, type Goal } from "@life-os/core";
import { GoalBar, GoalForm } from "@/components/modules";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Input, Label, Progress, Select } from "@/components/ui/primitives";
import { useGame } from "@/state/GameProvider";

const GREEN = "#34d399";
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const KIND_LABEL = { einzahlung: "Sparen (Einzahlung)", ausgabe: "Ausgabe", einnahme: "Einnahme" } as const;

function Deposit({ goal }: { goal: Goal }) {
  const { run, notify, today } = useGame();
  const [amount, setAmount] = useState("");
  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run((s) => s.addFinanceEntry({ kind: "einzahlung", amount: Number(amount), date: today, goalId: goal.id, note: goal.title }));
        if (ok) {
          notify("info", `${eur(Number(amount))} auf „${goal.title}" gebucht.`);
          setAmount("");
        }
      }}
    >
      <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Betrag" className="max-w-32" />
      <Button type="submit" size="sm" disabled={!(Number(amount) > 0)}>
        Einzahlen
      </Button>
    </form>
  );
}

export function FinancePage() {
  const { snap, run, notify, today } = useGame();
  const month = today.slice(0, 7);
  const m = monthSummary(snap.financeEntries, month);
  const goals = snap.goals.filter((g) => g.area === "finanzen" && g.status !== "archiviert");
  const [kind, setKind] = useState<(typeof FINANCE_KINDS)[number]>("ausgabe");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("lebensmittel");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [goalId, setGoalId] = useState("");
  const maxCat = Math.max(1, ...m.byCategory.map((c) => c.amount));

  async function book() {
    const parsed = FinanceEntrySchema.safeParse({ kind, amount: Number(amount), category: kind === "ausgabe" ? category : kind, date, note, goalId: kind === "einzahlung" && goalId ? goalId : null });
    if (!parsed.success) return notify("error", parsed.error.issues[0]?.message ?? "Ungültig");
    if (await run((s) => s.addFinanceEntry(parsed.data))) {
      setAmount("");
      setNote("");
    }
  }

  async function savingsQuest(goal: Goal) {
    const q = await run((s) =>
      s.createQuest({
        title: `Sparrate überweisen: ${goal.title}`,
        type: "side",
        category: "finanzen",
        difficulty: "leicht",
        attributes: ["finanzen", "disziplin"],
        goalId: goal.id,
        mandatory: true,
        recurrence: { freq: "monthly", interval: 1, byMonthDay: [1], startDate: today },
      }),
    );
    if (q) notify("info", "Monatliche Sparraten-Quest angelegt (jeweils am 1.).");
  }

  return (
    <div className="space-y-4">
      <h1 className="heading text-2xl">Finanzen</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Einnahmen", m.income, GREEN],
            ["Ausgaben", m.expenses, "#f87171"],
            ["Gespart", m.saved, "#e6b450"],
            ["Saldo", m.balance, m.balance >= 0 ? "#38bdf8" : "#f87171"],
          ] as const
        ).map(([label, value, color]) => (
          <Card key={label} className="p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted">
              {label} · {new Date(`${month}-01T12:00:00`).toLocaleDateString("de-DE", { month: "long" })}
            </div>
            <div className="mt-1 font-display text-xl" style={{ color }}>
              {eur(value)}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>
            <PiggyBank size={14} /> Sparziele
          </CardTitle>
          <div className="space-y-4">
            {goals.length === 0 && <p className="text-sm text-muted">Noch keine Sparziele.</p>}
            {goals.map((g) => (
              <div key={g.id} className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium">{g.title}</span>
                  <Button size="sm" variant="ghost" title="Monatliche Sparraten-Quest anlegen" onClick={() => void savingsQuest(g)}>
                    <Repeat size={14} /> Sparrate als Quest
                  </Button>
                </div>
                <GoalBar goal={g} color="#e6b450" />
                <Deposit goal={g} />
              </div>
            ))}
            <GoalForm area="finanzen" withTarget placeholder="z. B. Notgroschen" />
          </div>
        </Card>

        <Card>
          <CardTitle>Buchung erfassen</CardTitle>
          <form
            className="grid grid-cols-2 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void book();
            }}
          >
            <div>
              <Label>Art</Label>
              <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                {FINANCE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Betrag (€)</Label>
              <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            {kind === "ausgabe" && (
              <div>
                <Label>Kategorie</Label>
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {BUDGET_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </div>
            )}
            {kind === "einzahlung" && (
              <div>
                <Label>Sparziel</Label>
                <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                  <option value="">– ohne Ziel –</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <Label>Datum</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Notiz</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="col-span-2 flex justify-end">
              <Button type="submit" variant="gold" disabled={!(Number(amount) > 0)}>
                Buchen
              </Button>
            </div>
          </form>

          <div className="mt-5">
            <Label>Ausgaben nach Kategorie</Label>
            {m.byCategory.length === 0 ? (
              <p className="text-sm text-muted">Diesen Monat noch keine Ausgaben.</p>
            ) : (
              <ul className="space-y-1.5">
                {m.byCategory.map((c) => (
                  <li key={c.category}>
                    <div className="flex justify-between text-xs">
                      <span>{c.category}</span>
                      <span className="text-muted">{eur(c.amount)}</span>
                    </div>
                    <Progress value={c.amount / maxCat} className="h-1.5" color="#f87171" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>Letzte Buchungen</CardTitle>
        {snap.financeEntries.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Buchungen.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {snap.financeEntries.slice(0, 25).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">
                  <span className="text-muted">{new Date(`${e.date}T12:00:00`).toLocaleDateString("de-DE")} · </span>
                  {KIND_LABEL[e.kind]} {e.note && `· ${e.note}`} {e.kind === "ausgabe" && <span className="text-muted">({e.category})</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span style={{ color: e.kind === "ausgabe" ? "#f87171" : e.kind === "einnahme" ? GREEN : "#e6b450" }}>
                    {e.kind === "ausgabe" ? "−" : "+"}
                    {eur(e.amount)}
                  </span>
                  <Button size="sm" variant="ghost" title="Buchung löschen" onClick={() => void run((s) => s.deleteFinanceEntry(e.id))}>
                    <Trash2 size={13} />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

