import { ATTRIBUTES, ATTRIBUTE_CURVE, ATTRIBUTE_LABELS, levelFromXp } from "@life-os/core";
import { completionsByWeekday, questCompletionRates, totals, xpPerDay } from "@life-os/api";
import { Bar, BarChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart } from "recharts";
import { Card, CardTitle, Progress } from "@/components/ui/primitives";
import { useGame } from "@/state/GameProvider";

const tooltip = { contentStyle: { background: "#151821", border: "1px solid #2a3042", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#e8eaf2" } };
const axis = { tick: { fill: "#8b92a8", fontSize: 11 }, axisLine: false, tickLine: false } as const;

function Kpi({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <Card className="p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl" style={{ color }}>
        {value}
      </div>
    </Card>
  );
}

export function StatsPage() {
  const { snap, today } = useGame();
  const t = totals(snap);
  const xp = xpPerDay(snap, today, 30);
  const weekdays = completionsByWeekday(snap, today);
  const rates = questCompletionRates(snap, today);
  const radar = ATTRIBUTES.map((a) => ({ attr: ATTRIBUTE_LABELS[a], level: levelFromXp(snap.character.attributeXp?.[a] ?? 0, ATTRIBUTE_CURVE).level }));

  return (
    <div className="space-y-4">
      <h1 className="heading text-2xl">Statistiken</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Abschlüsse" value={t.completions} color="#e6b450" />
        <Kpi label="Aktive Quests" value={t.activeQuests} color="#38bdf8" />
        <Kpi label="Coins ausgegeben" value={t.coinsSpent} color="#8b5cf6" />
        <Kpi label="Verurteilungen" value={t.convictions} color="#f87171" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>XP – letzte 30 Tage</CardTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={xp}>
                <defs>
                  <linearGradient id="xp30" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e6b450" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#e6b450" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" {...axis} interval={4} />
                <YAxis {...axis} width={32} />
                <Tooltip {...tooltip} />
                <Area dataKey="xp" name="XP" stroke="#e6b450" strokeWidth={2} fill="url(#xp30)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle>Abschlüsse nach Wochentag (30 Tage)</CardTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdays}>
                <XAxis dataKey="day" {...axis} />
                <YAxis {...axis} width={28} allowDecimals={false} />
                <Tooltip {...tooltip} cursor={{ fill: "#1c2030" }} />
                <Bar dataKey="count" name="Abschlüsse" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle>Attributprofil</CardTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="75%">
                <PolarGrid stroke="#2a3042" />
                <PolarAngleAxis dataKey="attr" tick={{ fill: "#8b92a8", fontSize: 11 }} />
                <Radar dataKey="level" name="Level" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.35} />
                <Tooltip {...tooltip} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle>Erfüllungsquote Routinen (14 Tage)</CardTitle>
          {rates.length === 0 ? (
            <p className="text-sm text-muted">Noch keine wiederkehrenden Quests mit vergangenen Terminen.</p>
          ) : (
            <ul className="space-y-3">
              {rates.map((r) => (
                <li key={r.quest.id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="truncate">{r.quest.title}</span>
                    <span className="shrink-0 text-muted">{r.rate === null ? "–" : `${r.fulfilled}/${r.scheduled} · ${Math.round(r.rate * 100)} %`}</span>
                  </div>
                  <Progress value={r.rate ?? 0} className="h-1.5" barClassName={r.rate !== null && r.rate < 0.5 ? "from-danger to-danger" : "from-success to-success"} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
