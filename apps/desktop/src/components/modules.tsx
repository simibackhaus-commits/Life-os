import { useState } from "react";
import { goalProgress, type Goal, type GoalArea } from "@life-os/core";
import { useGame } from "@/state/GameProvider";
import { Button } from "./ui/button";
import { Input, Label, Progress } from "./ui/primitives";

/** Fortschrittsbalken eines Ziels inkl. Meilensteinen. */
export function GoalBar({ goal, color }: { goal: Goal; color: string }) {
  const { snap, today } = useGame();
  const p = goalProgress(
    goal,
    snap.quests.filter((q) => q.goalId === goal.id),
    today,
  );
  return (
    <div>
      <div className="mb-1 flex justify-between gap-2 text-xs">
        <span className="text-muted">{p.label}</span>
        <span style={{ color }}>{Math.floor(p.ratio * 100)} %</span>
      </div>
      <div className="relative">
        <Progress value={p.ratio} className="h-2.5" color={color} />
        {[25, 50, 75].map((m) => (
          <span key={m} className="absolute top-0 h-2.5 w-px bg-bg/70" style={{ left: `${m}%` }} />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted">
        {p.milestones.map((m) => (
          <span key={m} style={{ color }}>
            🏁 {m} %
          </span>
        ))}
        {p.perWeekNeeded !== null && (
          <span>
            · nötig: {p.perWeekNeeded.toLocaleString("de-DE")} {goal.unit ?? ""}/Woche bis {new Date(`${goal.dueDate}T12:00:00`).toLocaleDateString("de-DE")}
          </span>
        )}
      </div>
    </div>
  );
}

/** Kleines Formular zum Anlegen eines Ziels oder Projekts. */
export function GoalForm({ area, withTarget, placeholder, onDone }: { area: GoalArea; withTarget: boolean; placeholder: string; onDone?: () => void }) {
  const { run, notify } = useGame();
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState(area === "finanzen" ? "€" : area === "sport" ? "km" : "");
  const [due, setDue] = useState("");
  return (
    <form
      className="grid grid-cols-2 gap-2 lg:grid-cols-[2fr_1fr_80px_1fr_auto]"
      onSubmit={async (e) => {
        e.preventDefault();
        const g = await run((s) =>
          s.createGoal({
            title,
            area,
            targetValue: withTarget && target ? Number(target) : null,
            unit: withTarget ? unit || null : null,
            dueDate: due || null,
          }),
        );
        if (g) {
          notify("info", `„${g.title}" angelegt.`);
          setTitle("");
          setTarget("");
          setDue("");
          onDone?.();
        }
      }}
    >
      <div className="col-span-2 lg:col-span-1">
        <Label>Titel</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} />
      </div>
      {withTarget && (
        <>
          <div>
            <Label>Zielwert</Label>
            <Input type="number" min={0} step="any" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div>
            <Label>Einheit</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
        </>
      )}
      <div>
        <Label>Frist</Label>
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <div className="flex items-end">
        <Button type="submit" variant="gold" disabled={!title.trim()} className="w-full">
          Anlegen
        </Button>
      </div>
    </form>
  );
}
