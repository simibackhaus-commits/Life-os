import { useState } from "react";
import { Archive, Check, LayoutTemplate, Pause, Pencil, Play, Plus } from "lucide-react";
import { ATTRIBUTE_LABELS, ONCE_KEY, QUEST_TYPES, QUEST_TYPE_LABELS, bossHp, describeRule, isQuestLocked, type Quest, type QuestType } from "@life-os/core";
import { attributeColors, questTypeColors } from "@life-os/ui-tokens";
import { QuestEditor } from "@/components/QuestEditor";
import { TemplatePicker } from "@/components/TemplatePicker";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Card, Progress } from "@/components/ui/primitives";
import { questStreak, rewardOf } from "@life-os/api";
import { cn, formatDateTime } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";

type Filter = "aktiv" | "pausiert" | "erledigt";

export function QuestsPage() {
  const { snap, run, notify, complete, today } = useGame();
  const [filter, setFilter] = useState<Filter>("aktiv");
  const [type, setType] = useState<QuestType | "alle">("alle");
  const [editing, setEditing] = useState<Quest | "new" | null>(null);
  const [templates, setTemplates] = useState(false);

  const quests = snap.quests
    .filter((q) => q.status === filter && (type === "alle" || q.type === type))
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));

  async function toggleSubtask(q: Quest, id: string) {
    const subtasks = q.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s));
    const progress = Math.round((subtasks.filter((s) => s.done).length / subtasks.length) * 100);
    await run((s) => s.updateQuest(q.id, { subtasks, progress }));
    // Bosskampf: letzter Treffer besiegt den Boss und schließt die Quest ab.
    if (q.type === "boss" && !q.recurrence && subtasks.every((s) => s.done)) {
      const r = await complete({ questId: q.id, occurrenceKey: ONCE_KEY, dueAt: q.dueAt });
      if (r?.applied) notify("xp", `🐉 ${q.title} besiegt!`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="heading text-2xl">Questbuch</h1>
        <div className="flex gap-2">
          <Button onClick={() => setTemplates(true)}>
            <LayoutTemplate size={16} /> Vorlagen
          </Button>
          <Button variant="gold" onClick={() => setEditing("new")}>
            <Plus size={16} /> Neue Quest
          </Button>
        </div>
      </div>
      <TemplatePicker open={templates} onOpenChange={setTemplates} />
      <div className="flex flex-wrap gap-2">
        {(["aktiv", "pausiert", "erledigt"] as Filter[]).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "violet" : "outline"} onClick={() => setFilter(f)}>
            {f} ({snap.quests.filter((q) => q.status === f).length})
          </Button>
        ))}
        <span className="mx-2 w-px bg-border" />
        <Button size="sm" variant={type === "alle" ? "electric" : "ghost"} onClick={() => setType("alle")}>
          alle Typen
        </Button>
        {QUEST_TYPES.map((t) => (
          <Button key={t} size="sm" variant={type === t ? "electric" : "ghost"} onClick={() => setType(t)}>
            {QUEST_TYPE_LABELS[t]}
          </Button>
        ))}
      </div>

      {quests.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">Keine Quests in dieser Ansicht.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {quests.map((q) => {
            const reward = rewardOf(q, snap.skills);
            const streak = questStreak(snap, q, today);
            return (
              <Card key={q.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{q.title}</div>
                    {q.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{q.description}</p>}
                  </div>
                  <Badge color={questTypeColors[q.type]}>{QUEST_TYPE_LABELS[q.type]}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
                  <span>{q.difficulty}</span>·<span>Prio {q.priority}</span>·<span>{q.category}</span>
                  {q.recurrence ? <span>· {describeRule(q.recurrence)}</span> : q.dueAt ? <span>· fällig {formatDateTime(q.dueAt)}</span> : null}
                  {streak && <span className="text-warning">· Serie {streak.current} (beste {streak.best})</span>}
                  {q.mandatory && <Badge color="#f87171">Pflicht</Badge>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {q.attributes.map((a) => (
                    <Badge key={a} color={attributeColors[a]}>
                      {ATTRIBUTE_LABELS[a]}
                    </Badge>
                  ))}
                </div>
                {q.requiresQuestId && isQuestLocked(snap.quests, q) && (
                  <div className="text-[11px] text-warning">🔒 Gesperrt bis „{snap.quests.find((x) => x.id === q.requiresQuestId)?.title}" erledigt ist</div>
                )}
                {(() => {
                  const hp = bossHp(q);
                  return hp ? (
                    <div>
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span className="text-danger">🐉 Trefferpunkte</span>
                        <span className="text-muted">
                          {hp.current}/{hp.max} {q.subtasks.length === 0 && "· Teilaufgaben = Angriffe"}
                        </span>
                      </div>
                      <Progress value={hp.current / hp.max} className="h-2" barClassName="from-danger to-danger" />
                    </div>
                  ) : null;
                })()}
                {q.subtasks.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {q.subtasks.map((s) => (
                      <li key={s.id}>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={s.done} disabled={q.status !== "aktiv"} onChange={() => void toggleSubtask(q, s.id)} />
                          <span className={cn(s.done && "text-muted line-through")}>{s.title}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto flex items-center justify-between border-t border-border pt-2">
                  <span className="text-xs">
                    <span className="text-gold">+{reward.xp} XP</span> · <span className="text-electric">+{reward.coins} ¢</span>
                  </span>
                  <div className="flex gap-1">
                    {q.status === "aktiv" && !q.recurrence && (
                      <Button size="sm" variant="gold" onClick={() => void complete({ questId: q.id, occurrenceKey: ONCE_KEY, dueAt: q.dueAt })}>
                        <Check size={14} /> Abschließen
                      </Button>
                    )}
                    {q.status !== "erledigt" && (
                      <Button size="sm" variant="ghost" onClick={() => setEditing(q)} title="Bearbeiten">
                        <Pencil size={14} />
                      </Button>
                    )}
                    {q.status === "aktiv" && (
                      <Button size="sm" variant="ghost" onClick={() => void run((s) => s.updateQuest(q.id, { status: "pausiert" }))} title="Pausieren">
                        <Pause size={14} />
                      </Button>
                    )}
                    {q.status === "pausiert" && (
                      <Button size="sm" variant="ghost" onClick={() => void run((s) => s.updateQuest(q.id, { status: "aktiv" }))} title="Fortsetzen">
                        <Play size={14} />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Archivieren"
                      onClick={async () => {
                        await run((s) => s.updateQuest(q.id, { status: "archiviert" }));
                        notify("info", `„${q.title}" archiviert.`);
                      }}
                    >
                      <Archive size={14} />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Neue Quest" : "Quest bearbeiten"}>
        {editing && (
          <QuestEditor
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (draft) => {
              const ok = editing === "new" ? await run((s) => s.createQuest(draft)) : await run((s) => s.updateQuest(editing.id, draft).then(() => true));
              if (ok) setEditing(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}
