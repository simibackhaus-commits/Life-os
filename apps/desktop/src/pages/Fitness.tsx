import { useState } from "react";
import { Activity, Dumbbell, Medal, Plus, Trash2 } from "lucide-react";
import { TRAINING_PLANS, WORKOUT_KINDS, WORKOUT_LABELS, WorkoutSchema, personalRecords, trainingLoad, type WorkoutKind } from "@life-os/core";
import { todaysItems } from "@life-os/api";
import { GoalBar, GoalForm } from "@/components/modules";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Input, Label, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";

interface ExRow {
  name: string;
  sets: string;
  reps: string;
  weight: string;
}

export function FitnessPage() {
  const { snap, run, notify, complete, today } = useGame();
  const [kind, setKind] = useState<WorkoutKind>("laufen");
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState("30");
  const [distance, setDistance] = useState("");
  const [intensity, setIntensity] = useState(6);
  const [note, setNote] = useState("");
  const [exercises, setExercises] = useState<ExRow[]>([]);
  // Offene Sport-Quests von heute, die mit dem Training abgehakt werden können
  const sportToday = todaysItems(snap, today).filter((i) => i.status === "offen" && i.quest.category === "sport");
  const [linked, setLinked] = useState<Set<string>>(new Set());

  const load = trainingLoad(snap.workouts, today);
  const prs = personalRecords(snap.workouts);
  const goals = snap.goals.filter((g) => g.area === "sport" && g.status !== "archiviert");

  async function save() {
    const parsed = WorkoutSchema.safeParse({
      date,
      kind,
      durationMin: Number(duration),
      distanceKm: distance ? Number(distance) : null,
      intensity,
      note,
      exercises: exercises
        .filter((e) => e.name.trim())
        .map((e) => ({ name: e.name, sets: Number(e.sets) || 1, reps: Number(e.reps) || 1, weightKg: Number(e.weight) || 0 })),
    });
    if (!parsed.success) return notify("error", parsed.error.issues[0]?.message ?? "Ungültig");
    const w = await run((s) => s.logWorkout(parsed.data));
    if (!w) return;
    notify("info", `${WORKOUT_LABELS[w.kind]} gespeichert.`);
    for (const item of sportToday.filter((i) => linked.has(i.quest.id + i.key))) {
      await complete({ questId: item.quest.id, occurrenceKey: item.key, dueAt: item.dueAt });
    }
    setLinked(new Set());
    setNote("");
    setExercises([]);
  }

  async function adoptPlan(planId: string) {
    const plan = TRAINING_PLANS.find((p) => p.id === planId)!;
    for (const q of plan.quests(today)) await run((s) => s.createQuest(q));
    notify("info", `Trainingsplan „${plan.title}" als Quests angelegt.`);
  }

  return (
    <div className="space-y-4">
      <h1 className="heading text-2xl">Fitness</h1>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardTitle>
            <Dumbbell size={14} /> Training erfassen
          </CardTitle>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <div>
                <Label>Sportart</Label>
                <Select value={kind} onChange={(e) => setKind(e.target.value as WorkoutKind)}>
                  {WORKOUT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {WORKOUT_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Datum</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>Dauer (min)</Label>
                <Input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
              <div>
                <Label>Distanz (km)</Label>
                <Input type="number" min={0} step="0.01" value={distance} onChange={(e) => setDistance(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Anstrengung: {intensity}/10</Label>
              <input type="range" min={1} max={10} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-full accent-[var(--color-gold)]" />
            </div>
            {(kind === "kraft" || exercises.length > 0) && (
              <div className="space-y-1.5">
                <Label>Übungen</Label>
                {exercises.map((ex, i) => (
                  <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-1.5">
                    {(["name", "sets", "reps", "weight"] as const).map((f) => (
                      <Input
                        key={f}
                        placeholder={{ name: "Übung", sets: "Sätze", reps: "Wdh.", weight: "kg" }[f]}
                        value={ex[f]}
                        onChange={(e) => setExercises((xs) => xs.map((x, j) => (j === i ? { ...x, [f]: e.target.value } : x)))}
                      />
                    ))}
                    <Button type="button" variant="ghost" size="icon" aria-label="Übung entfernen" onClick={() => setExercises((xs) => xs.filter((_, j) => j !== i))}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="ghost" onClick={() => setExercises((xs) => [...xs, { name: "", sets: "3", reps: "10", weight: "" }])}>
                  <Plus size={14} /> Übung
                </Button>
              </div>
            )}
            <div>
              <Label>Notiz</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            {sportToday.length > 0 && date === today && (
              <div className="rounded-md border border-gold/30 bg-gold/5 p-2 text-sm">
                <div className="mb-1 text-xs text-gold">Gleichzeitig als erledigt markieren:</div>
                {sportToday.map((i) => {
                  const key = i.quest.id + i.key;
                  return (
                    <label key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={linked.has(key)}
                        onChange={(e) => setLinked((s) => {
                          const n = new Set(s);
                          if (e.target.checked) n.add(key);
                          else n.delete(key);
                          return n;
                        })}
                      />
                      {i.quest.title} {i.time && <span className="text-muted">({i.time})</span>}
                    </label>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end">
              <Button type="submit" variant="gold">
                Training speichern
              </Button>
            </div>
          </form>
        </Card>

        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardTitle>
              <Activity size={14} /> Belastung & Regeneration
            </CardTitle>
            <div className="text-sm">
              Letzte 7 Tage: <span className="text-gold">{load.week}</span> · Ø 4 Wochen: {load.fourWeekAvg}
            </div>
            <p className={cn("mt-1 text-sm", load.recoveryRecommended ? "text-warning" : "text-success")}>{load.advice}</p>
            {load.recoveryRecommended && <p className="mt-1 text-[11px] text-muted">Regeneration ist vor dem Court of Life ein geschützter Grund.</p>}
          </Card>
          <Card>
            <CardTitle>
              <Medal size={14} /> Persönliche Rekorde
            </CardTitle>
            {prs.length === 0 ? (
              <p className="text-sm text-muted">Noch keine Rekorde – erfasse dein erstes Training.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {prs.map((r) => (
                  <li key={r.label} className="flex justify-between gap-2">
                    <span className="truncate">{r.label}</span>
                    <span className="shrink-0 text-gold">
                      {r.value} <span className="text-[11px] text-muted">{new Date(`${r.date}T12:00:00`).toLocaleDateString("de-DE")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Sportziele</CardTitle>
          <div className="space-y-4">
            {goals.map((g) => (
              <div key={g.id}>
                <div className="mb-1 text-sm font-medium">{g.title}</div>
                <GoalBar goal={g} color="#fb923c" />
              </div>
            ))}
            <GoalForm area="sport" withTarget placeholder="z. B. Halbmarathon-Vorbereitung (km)" />
          </div>
        </Card>
        <Card>
          <CardTitle>Trainingspläne</CardTitle>
          <ul className="space-y-2">
            {TRAINING_PLANS.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                <div>
                  <div className="text-sm font-medium">{p.title}</div>
                  <div className="text-[11px] text-muted">{p.description}</div>
                </div>
                <Button size="sm" onClick={() => void adoptPlan(p.id)}>
                  Übernehmen
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardTitle>Letzte Trainings</CardTitle>
        {snap.workouts.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Trainings.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {snap.workouts.slice(0, 20).map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">
                  <span className="text-muted">{new Date(`${w.date}T12:00:00`).toLocaleDateString("de-DE")} · </span>
                  {WORKOUT_LABELS[w.kind]} · {w.durationMin} min{w.distanceKm ? ` · ${w.distanceKm} km` : ""} · Anstrengung {w.intensity}
                  {w.exercises.length > 0 && <span className="text-muted"> · {w.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}${e.weightKg ? ` @${e.weightKg} kg` : ""}`).join(", ")}</span>}
                </span>
                <Button size="sm" variant="ghost" title="Training löschen" onClick={() => void run((s) => s.deleteWorkout(w.id))}>
                  <Trash2 size={13} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
