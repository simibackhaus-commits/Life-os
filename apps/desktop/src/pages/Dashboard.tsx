import { Activity, Swords, Target } from "lucide-react";
import { QUEST_TYPE_LABELS } from "@life-os/core";
import { questTypeColors } from "@life-os/ui-tokens";
import { AttributeGrid, CharacterSummary, QuestItem, XpChart } from "@/components/game";
import { Badge, Card, CardTitle, Progress } from "@/components/ui/primitives";
import { todaysItems } from "@life-os/api";
import { formatDateTime } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";

const EVENT_LABELS: Record<string, string> = {
  quest_completed: "Quest abgeschlossen",
  quest_uncompleted: "Abschluss zurückgenommen",
  court_verdict: "Urteil vollstreckt",
  court_verdict_reverted: "Urteil aufgehoben",
  shop_purchase: "Einkauf",
  manual_adjustment: "Korrektur",
};

export function Dashboard({ onQuickAdd }: { onQuickAdd: () => void }) {
  const { snap, today } = useGame();
  const items = todaysItems(snap, today);
  const done = items.filter((i) => i.status === "erledigt").length;
  const mainQuests = snap.quests.filter((q) => q.status === "aktiv" && ["main", "epic", "legendary", "boss"].includes(q.type));
  const events = [...snap.events].reverse().slice(0, 8);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <div className="space-y-4 xl:col-span-3">
        <CharacterSummary character={snap.character} />
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <CardTitle className="mb-0">
              <Swords size={14} /> Tagesmissionen
            </CardTitle>
            <span className="text-xs text-muted">
              {done}/{items.length} erledigt
            </span>
          </div>
          <Progress value={items.length ? done / items.length : 0} className="mb-3 h-1.5" barClassName="from-electric-deep to-electric" />
          {items.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted">
              Heute stehen keine Quests an.{" "}
              <button className="text-gold underline" onClick={onQuickAdd}>
                Erste Quest anlegen
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((i) => (
                <QuestItem key={i.quest.id + i.key} item={i} />
              ))}
            </div>
          )}
        </Card>
        <Card>
          <CardTitle>
            <Target size={14} /> Hauptquests
          </CardTitle>
          {mainQuests.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Haupt-, Epic- oder Bossquests. Langfristige Ziele hier anlegen.</p>
          ) : (
            <div className="space-y-3">
              {mainQuests.map((q) => {
                const subDone = q.subtasks.filter((s) => s.done).length;
                const progress = q.subtasks.length ? subDone / q.subtasks.length : q.progress / 100;
                return (
                  <div key={q.id}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{q.title}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge color={questTypeColors[q.type]}>{QUEST_TYPE_LABELS[q.type]}</Badge>
                        {q.dueAt && <span className="text-[11px] text-muted">bis {formatDateTime(q.dueAt)}</span>}
                      </span>
                    </div>
                    <Progress value={progress} className="h-1.5" barClassName="from-violet-deep to-violet" />
                    {q.subtasks.length > 0 && (
                      <div className="mt-0.5 text-[11px] text-muted">
                        {subDone}/{q.subtasks.length} Teilaufgaben
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
      <div className="space-y-4 xl:col-span-2">
        <AttributeGrid character={snap.character} />
        <XpChart />
        <Card>
          <CardTitle>
            <Activity size={14} /> Aktuelle Ereignisse
          </CardTitle>
          {events.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Ereignisse.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    <span className="text-muted">{EVENT_LABELS[e.kind]}:</span> {e.note}
                  </span>
                  <span className={e.xpDelta >= 0 ? "shrink-0 text-gold" : "shrink-0 text-danger"}>
                    {e.xpDelta >= 0 ? "+" : ""}
                    {e.xpDelta} XP · {e.coinDelta >= 0 ? "+" : ""}
                    {e.coinDelta} ¢
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
