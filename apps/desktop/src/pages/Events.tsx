import { CalendarHeart, Sparkles } from "lucide-react";
import { seasonEvent, seasonHistory, yearReview } from "@life-os/core";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Card, CardTitle, Progress } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const fmt = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 2 });

/** Kompakte Karte für das Dashboard. */
export function SeasonCard() {
  const { snap, today } = useGame();
  const e = seasonEvent(snap, today);
  return (
    <Card className={cn(e.completed && "gold-glow")}>
      <CardTitle>
        <CalendarHeart size={14} /> Event des Monats
      </CardTitle>
      <div className="flex items-center gap-3">
        <div className="text-3xl">{e.def.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-gold">{e.def.title}</div>
          <div className="text-xs text-muted">{e.def.description}</div>
          <Progress value={e.progress} className="mt-2 h-1.5" barClassName="from-violet-deep to-violet" />
          <div className="mt-0.5 text-[11px] text-muted">
            {e.completed ? "✨ Geschafft!" : `${fmt(e.current)}/${fmt(e.def.target)} ${e.def.unit} · noch ${e.daysLeft} Tage`}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function EventsPage() {
  const { snap, today } = useGame();
  const e = seasonEvent(snap, today);
  const history = seasonHistory(snap, today);
  const year = today.slice(0, 4);
  const review = yearReview(snap, year);

  return (
    <div className="space-y-4">
      <h1 className="heading text-2xl">Saison-Events</h1>
      <Card className={cn("relative overflow-hidden p-6", e.completed && "gold-glow")}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-violet/15 blur-3xl" />
        <div className="flex items-center gap-5">
          <div className="text-6xl">{e.def.icon}</div>
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-widest text-muted">{MONTHS[e.def.month - 1]} · noch {e.daysLeft} Tage</div>
            <div className="font-display text-2xl text-gold">{e.def.title}</div>
            <p className="text-sm text-muted">{e.def.description}</p>
            <Progress value={e.progress} className="mt-3 h-2.5" barClassName="from-violet-deep to-violet" />
            <div className="mt-1 text-sm">{e.completed ? "✨ Event gemeistert!" : `${fmt(e.current)} von ${fmt(e.def.target)} ${e.def.unit}`}</div>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Bisherige Events {year}</CardTitle>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Noch keine vergangenen Monate.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-6">
            {history.map((h) => (
              <div key={h.month} className={cn("rounded-md border p-2 text-center", h.completed ? "border-gold/50 bg-gold/5" : "border-border opacity-60")}>
                <div className="text-2xl">{h.def.icon}</div>
                <div className="text-xs">{h.def.title}</div>
                <div className="text-[10px] text-muted">
                  {MONTHS[h.def.month - 1]} · {h.completed ? "geschafft" : `${fmt(h.current)}/${fmt(h.def.target)}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>
          <Sparkles size={14} /> Jahresrückblick {year}
        </CardTitle>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {(
            [
              ["Quests erledigt", review.completions],
              ["XP gesammelt", review.xp],
              ["Trainings", review.workouts],
              ["Dungeons", review.dungeons],
              ["Gespart", `${fmt(review.saved)} €`],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-md border border-border p-3">
              <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
              <div className="font-display text-xl text-gold">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="h-40 lg:col-span-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={review.byMonth.map((m) => ({ ...m, name: MONTHS[m.month - 1] }))}>
                <XAxis dataKey="name" tick={{ fill: "#8b92a8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#151821", border: "1px solid #2a3042", borderRadius: 8, fontSize: 12 }} cursor={{ fill: "#1c2030" }} />
                <Bar dataKey="count" name="Quests" fill="#e6b450" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-sm">
            <div className="text-muted">Stärkster Monat</div>
            <div className="mb-3 font-display text-gold">{review.bestMonth ? MONTHS[review.bestMonth - 1] : "–"}</div>
            <div className="text-muted">Treueste Quests</div>
            <ol className="list-inside list-decimal">
              {review.topQuests.length === 0 ? <li className="list-none text-muted">noch keine</li> : review.topQuests.map((q) => <li key={q.title}>{q.title} ({q.count}×)</li>)}
            </ol>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted">Im Cloud-Modus fließen Abschlüsse der letzten 120 Tage ein.</p>
      </Card>
    </div>
  );
}
