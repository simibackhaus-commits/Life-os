import { useState } from "react";
import { AlarmClock, Briefcase, Check, Repeat, Send, UserCheck } from "lucide-react";
import { ONCE_KEY, deadlines, describeRule, type Goal, type QuestDraftInput } from "@life-os/core";
import { GoalBar, GoalForm } from "@/components/modules";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, Input } from "@/components/ui/primitives";
import { cn, formatDateTime } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";

const VIOLET = "#a78bfa";

/** Vorlagen für wiederkehrende Führungsaufgaben. */
const LEADERSHIP: Array<{ label: string; quest: (start: string) => QuestDraftInput }> = [
  { label: "Wochenplanung (So)", quest: (s) => ({ title: "Kommende Arbeitswoche planen", recurrence: { freq: "weekly", interval: 1, byWeekday: [7], startDate: s }, mandatory: true }) },
  { label: "1:1-Gespräche (Mi)", quest: (s) => ({ title: "1:1-Gespräche mit dem Team", recurrence: { freq: "weekly", interval: 1, byWeekday: [3], startDate: s } }) },
  { label: "Inbox Zero (täglich 17:00)", quest: (s) => ({ title: "Posteingang abarbeiten", difficulty: "leicht", recurrence: { freq: "daily", interval: 1, times: ["17:00"], startDate: s } }) },
  { label: "Monatsreview (1.)", quest: (s) => ({ title: "Monatsreview: Zahlen & Ziele prüfen", difficulty: "schwer", recurrence: { freq: "monthly", interval: 1, byMonthDay: [1], startDate: s } }) },
];

function ProjectCard({ project }: { project: Goal }) {
  const { snap, run, complete, notify } = useGame();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [delegate, setDelegate] = useState("");
  const tasks = snap.quests.filter((q) => q.goalId === project.id && q.status !== "archiviert");

  async function addTask() {
    const q = await run((s) =>
      s.createQuest({
        title,
        category: "business",
        attributes: ["karriere", "ordnung"],
        goalId: project.id,
        dueAt: due ? new Date(`${due}T17:00:00`).toISOString() : null,
        delegatedTo: delegate.trim() || null,
      }),
    );
    if (q) {
      setTitle("");
      setDue("");
      setDelegate("");
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">{project.title}</div>
        {project.dueDate && <span className="text-[11px] text-muted">bis {new Date(`${project.dueDate}T12:00:00`).toLocaleDateString("de-DE")}</span>}
      </div>
      <GoalBar goal={project} color={VIOLET} />
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className={cn("flex items-center gap-2 text-sm", t.status === "erledigt" && "text-muted line-through")}>
            <button
              aria-label={t.delegatedTo ? "Delegierte Aufgabe als erledigt bestätigen" : "Aufgabe erledigen"}
              disabled={t.status !== "aktiv" || !!t.recurrence}
              onClick={async () => {
                const r = await complete({ questId: t.id, occurrenceKey: ONCE_KEY, dueAt: t.dueAt });
                if (r?.applied && t.delegatedTo) notify("info", `Rückmeldung von ${t.delegatedTo} erhalten – abgeschlossen.`);
              }}
              className={cn("grid h-5 w-5 shrink-0 place-items-center rounded border", t.status === "erledigt" ? "border-success text-success" : "border-muted/50 hover:border-gold")}
            >
              {t.status === "erledigt" && <Check size={12} />}
            </button>
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
            {t.delegatedTo && <Badge color="#38bdf8">→ {t.delegatedTo}</Badge>}
            {t.dueAt && <span className="shrink-0 text-[11px] text-muted">{formatDateTime(t.dueAt)}</span>}
          </li>
        ))}
      </ul>
      <form
        className="grid grid-cols-[2fr_1fr_1fr_auto] gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void addTask();
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Neue Aufgabe" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} title="Frist" />
        <Input value={delegate} onChange={(e) => setDelegate(e.target.value)} placeholder="delegieren an…" />
        <Button type="submit" size="sm" disabled={!title.trim()}>
          +
        </Button>
      </form>
      {project.status === "aktiv" && tasks.length > 0 && tasks.every((t) => t.status === "erledigt") && (
        <Button size="sm" variant="gold" onClick={() => void run((s) => s.updateGoal(project.id, { status: "erledigt" }))}>
          Projekt abschließen
        </Button>
      )}
    </Card>
  );
}

export function CareerPage() {
  const { snap, run, notify, today } = useGame();
  const projects = snap.goals.filter((g) => g.area === "business" && g.status === "aktiv");
  const businessIds = new Set(snap.goals.filter((g) => g.area === "business").map((g) => g.id));
  const businessQuests = snap.quests.filter((q) => q.category === "business" || (q.goalId && businessIds.has(q.goalId)));
  const d = deadlines(businessQuests, new Date().toISOString());
  const delegated = businessQuests.filter((q) => q.delegatedTo && q.status === "aktiv");
  const routines = businessQuests.filter((q) => q.recurrence && q.status === "aktiv");

  return (
    <div className="space-y-4">
      <h1 className="heading text-2xl">Karriere & Business</h1>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardTitle>
            <AlarmClock size={14} /> Fristen
          </CardTitle>
          {d.overdue.length + d.upcoming.length === 0 ? (
            <p className="text-sm text-muted">Keine Fristen in den nächsten 7 Tagen.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {d.overdue.map((q) => (
                <li key={q.id} className="flex justify-between gap-2 text-danger">
                  <span className="truncate">{q.title}</span>
                  <span className="shrink-0 text-[11px]">überfällig</span>
                </li>
              ))}
              {d.upcoming.map((q) => (
                <li key={q.id} className="flex justify-between gap-2">
                  <span className="truncate">{q.title}</span>
                  <span className="shrink-0 text-[11px] text-muted">{formatDateTime(q.dueAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle>
            <UserCheck size={14} /> Delegiert
          </CardTitle>
          {delegated.length === 0 ? (
            <p className="text-sm text-muted">Nichts delegiert.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {delegated.map((q) => (
                <li key={q.id} className="flex justify-between gap-2">
                  <span className="truncate">{q.title}</span>
                  <span className="shrink-0 text-electric">
                    <Send size={11} className="mr-1 inline" />
                    {q.delegatedTo}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle>
            <Repeat size={14} /> Führungsroutinen
          </CardTitle>
          <ul className="mb-3 space-y-1 text-sm">
            {routines.map((q) => (
              <li key={q.id} className="flex justify-between gap-2">
                <span className="truncate">{q.title}</span>
                <span className="shrink-0 text-[11px] text-muted">{describeRule(q.recurrence!)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-1.5">
            {LEADERSHIP.map((t) => (
              <Button
                key={t.label}
                size="sm"
                variant="outline"
                onClick={async () => {
                  const q = await run((s) => s.createQuest({ category: "business", attributes: ["karriere", "disziplin"], ...t.quest(today) }));
                  if (q) notify("info", `Routine „${q.title}" angelegt.`);
                }}
              >
                + {t.label}
              </Button>
            ))}
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-2 flex items-center gap-2 font-display text-gold">
          <Briefcase size={16} /> Projekte
        </h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
        <Card className="mt-4">
          <CardTitle>Neues Projekt</CardTitle>
          <GoalForm area="business" withTarget={false} placeholder="z. B. Website-Relaunch" />
        </Card>
      </div>
    </div>
  );
}
