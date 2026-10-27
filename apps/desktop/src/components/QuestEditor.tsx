import { useState } from "react";
import {
  ATTRIBUTES,
  ATTRIBUTE_LABELS,
  DIFFICULTIES,
  QUEST_TYPES,
  QUEST_TYPE_LABELS,
  QuestDraftSchema,
  computeReward,
  describeRule,
  localToday,
  type Attribute,
  type QuestDraftInput,
  type RecurrenceRule,
} from "@life-os/core";
import { attributeColors } from "@life-os/ui-tokens";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Badge, Input, Label, Select, Textarea } from "./ui/primitives";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Formular für Anlegen, Bearbeiten und die Quick-Add-Vorschau. */
export function QuestEditor({
  initial,
  submitLabel = "Quest speichern",
  onSubmit,
  onCancel,
}: {
  initial?: QuestDraftInput;
  submitLabel?: string;
  onSubmit: (draft: QuestDraftInput) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const [d, setD] = useState<QuestDraftInput>(() => ({ title: "", ...initial }));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof QuestDraftInput>(k: K, v: QuestDraftInput[K]) => setD((x) => ({ ...x, [k]: v }));
  const rec = d.recurrence ?? null;
  const setRec = (patch: Partial<RecurrenceRule> | null) =>
    set("recurrence", patch === null ? null : ({ freq: "daily", interval: 1, startDate: localToday(), ...rec, ...patch } as RecurrenceRule));

  const parsed = QuestDraftSchema.safeParse(d);
  const reward = parsed.success ? computeReward(parsed.data) : null;
  const attrs = (d.attributes ?? []) as Attribute[];

  async function submit() {
    const r = QuestDraftSchema.safeParse(d);
    if (!r.success) {
      setErrors(r.error.issues.map((i) => `${i.path.join(".") || "Eingabe"}: ${i.message}`));
      return;
    }
    setBusy(true);
    try {
      await onSubmit(r.data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div>
        <Label htmlFor="q-title">Titel</Label>
        <Input id="q-title" autoFocus value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="z. B. 30 Minuten laufen" />
      </div>
      <div>
        <Label htmlFor="q-desc">Beschreibung</Label>
        <Textarea id="q-desc" value={d.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label>Questtyp</Label>
          <Select value={d.type ?? "side"} onChange={(e) => set("type", e.target.value as QuestDraftInput["type"])}>
            {QUEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {QUEST_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Schwierigkeit</Label>
          <Select value={d.difficulty ?? "mittel"} onChange={(e) => set("difficulty", e.target.value as QuestDraftInput["difficulty"])}>
            {DIFFICULTIES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Priorität</Label>
          <Select value={d.priority ?? 3} onChange={(e) => set("priority", Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>
                {p} {p === 5 ? "(höchste)" : p === 1 ? "(niedrig)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Kategorie</Label>
          <Input value={d.category ?? ""} onChange={(e) => set("category", e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Attribute (max. 4)</Label>
        <div className="flex flex-wrap gap-1.5">
          {ATTRIBUTES.map((a) => {
            const on = attrs.includes(a);
            return (
              <button
                type="button"
                key={a}
                onClick={() => set("attributes", on ? attrs.filter((x) => x !== a) : attrs.length < 4 ? [...attrs, a] : attrs)}
                className="rounded-sm border px-2 py-1 text-xs transition-colors"
                style={on ? { color: attributeColors[a], borderColor: attributeColors[a], background: `${attributeColors[a]}1a` } : { borderColor: "var(--color-border)", color: "var(--color-muted)" }}
              >
                {ATTRIBUTE_LABELS[a]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border border-border p-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!rec} onChange={(e) => setRec(e.target.checked ? {} : null)} />
          Wiederkehrend
        </label>
        {rec && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <Label>Rhythmus</Label>
              <Select value={rec.freq} onChange={(e) => setRec({ freq: e.target.value as RecurrenceRule["freq"] })}>
                <option value="daily">täglich</option>
                <option value="weekly">wöchentlich</option>
                <option value="monthly">monatlich</option>
              </Select>
            </div>
            <div>
              <Label>Alle … </Label>
              <Input type="number" min={1} value={rec.interval ?? 1} onChange={(e) => setRec({ interval: Math.max(1, Number(e.target.value)) })} />
            </div>
            <div>
              <Label>Start</Label>
              <Input type="date" value={rec.startDate} onChange={(e) => setRec({ startDate: e.target.value })} />
            </div>
            <div>
              <Label>Uhrzeiten (je eine Instanz)</Label>
              <Input
                placeholder="07:00, 21:00"
                defaultValue={(rec.times ?? []).join(", ")}
                onBlur={(e) => {
                  const times = e.target.value.split(/[,\s]+/).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => t.padStart(5, "0"));
                  setRec({ times: times.length ? times : undefined });
                }}
              />
            </div>
            {rec.freq === "weekly" && (
              <div className="col-span-full flex gap-1.5">
                {WEEKDAYS.map((w, i) => {
                  const n = i + 1;
                  const on = rec.byWeekday?.includes(n) ?? false;
                  return (
                    <button
                      type="button"
                      key={w}
                      onClick={() => setRec({ byWeekday: on ? rec.byWeekday!.filter((x) => x !== n) : [...(rec.byWeekday ?? []), n].sort() })}
                      className={`h-8 w-9 rounded-sm border text-xs ${on ? "border-electric bg-electric/15 text-electric" : "border-border text-muted"}`}
                    >
                      {w}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="col-span-full text-xs text-muted">{describeRule({ interval: 1, ...rec } as RecurrenceRule)}</p>
          </div>
        )}
        {!rec && (
          <div className="mt-3 max-w-xs">
            <Label>Fällig am</Label>
            <Input type="datetime-local" value={toLocalInput(d.dueAt)} onChange={(e) => set("dueAt", e.target.value ? new Date(e.target.value).toISOString() : null)} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Geschätzte Dauer (Minuten)</Label>
          <Input type="number" min={0} value={d.estimatedMinutes ?? ""} onChange={(e) => set("estimatedMinutes", e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div className="flex flex-col justify-end gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={d.mandatory ?? false} onChange={(e) => set("mandatory", e.target.checked)} />
            Verpflichtend (Gericht bei Versäumnis)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={d.proofRequired ?? false} onChange={(e) => set("proofRequired", e.target.checked)} />
            Nachweis erforderlich
          </label>
        </div>
      </div>

      <div>
        <Label>Teilaufgaben</Label>
        <div className="space-y-1.5">
          {(d.subtasks ?? []).map((st, i) => (
            <div key={st.id} className="flex gap-2">
              <Input value={st.title} onChange={(e) => set("subtasks", (d.subtasks ?? []).map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="icon" aria-label="Teilaufgabe entfernen" onClick={() => set("subtasks", (d.subtasks ?? []).filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => set("subtasks", [...(d.subtasks ?? []), { id: crypto.randomUUID(), title: "", done: false }])}>
            <Plus size={14} /> Teilaufgabe
          </Button>
        </div>
      </div>

      {d.mandatory && (
        <div>
          <Label>Mögliche Konsequenzen (Hinweis für das Gericht)</Label>
          <Input value={d.consequences ?? ""} onChange={(e) => set("consequences", e.target.value)} placeholder="z. B. Coins verlieren, Reflexionsaufgabe" />
        </div>
      )}

      {errors.length > 0 && (
        <ul className="rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex gap-2 text-sm">
          {reward && (
            <>
              <Badge color="#e6b450">+{reward.xp} XP</Badge>
              <Badge color="#38bdf8">+{reward.coins} Coins</Badge>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Abbrechen
            </Button>
          )}
          <Button type="submit" variant="gold" disabled={busy}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
