import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { QUEST_TYPE_LABELS } from "@life-os/core";
import { questTypeColors } from "@life-os/ui-tokens";
import { calendarDay, calendarMonth } from "@life-os/api";
import { QuestItem } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const STATUS_LABEL = { offen: "offen", erledigt: "erledigt", verpasst: "verpasst", entschuldigt: "entschuldigt" } as const;

export function CalendarPage() {
  const { snap, today } = useGame();
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }));
  const [selected, setSelected] = useState(today);
  const cells = calendarMonth(snap, ym.y, ym.m);
  const items = calendarDay(snap, selected);
  const label = new Date(ym.y, ym.m - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  const shift = (d: number) => setYm(({ y, m }) => (m + d < 1 ? { y: y - 1, m: 12 } : m + d > 12 ? { y: y + 1, m: 1 } : { y, m: m + d }));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
      <Card className="xl:col-span-3">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="heading text-2xl capitalize">{label}</h1>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={() => shift(-1)} aria-label="Vorheriger Monat">
              <ChevronLeft size={18} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) });
                setSelected(today);
              }}
            >
              Heute
            </Button>
            <Button size="icon" variant="ghost" onClick={() => shift(1)} aria-label="Nächster Monat">
              <ChevronRight size={18} />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c) => (
            <button
              key={c.date}
              onClick={() => setSelected(c.date)}
              className={cn(
                "flex h-16 flex-col items-start rounded-md border p-1.5 text-left transition-colors",
                c.inMonth ? "border-border bg-surface-2/40 hover:bg-surface-2" : "border-transparent opacity-40",
                c.date === selected && "border-gold",
                c.date === today && "ring-1 ring-electric",
              )}
            >
              <span className={cn("text-xs", c.date === today && "font-bold text-electric")}>{Number(c.date.slice(8))}</span>
              <div className="mt-auto flex gap-1">
                {c.open > 0 && <span className="rounded-sm bg-violet/30 px-1 text-[10px] text-text">{c.open}</span>}
                {c.done > 0 && <span className="rounded-sm bg-success/25 px-1 text-[10px] text-success">✓{c.done}</span>}
              </div>
            </button>
          ))}
        </div>
      </Card>
      <Card className="xl:col-span-2">
        <CardTitle>{new Date(`${selected}T12:00:00`).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}</CardTitle>
        {items.length === 0 ? (
          <p className="text-sm text-muted">Keine Termine.</p>
        ) : selected === today ? (
          <div className="space-y-2">
            {items.map((i) => (
              <QuestItem key={i.quest.id + i.key} item={i} />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.quest.id + i.key} className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-2/40 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{i.quest.title}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                    <Badge color={questTypeColors[i.quest.type]}>{QUEST_TYPE_LABELS[i.quest.type]}</Badge>
                    {i.time ?? "ganztägig"}
                  </div>
                </div>
                <span className={cn("text-xs", i.status === "erledigt" ? "text-success" : selected < today ? "text-danger" : "text-muted")}>
                  {selected < today && i.status === "offen" ? "verpasst" : STATUS_LABEL[i.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
