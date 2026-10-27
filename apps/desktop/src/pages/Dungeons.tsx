import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Flag, Swords } from "lucide-react";
import { ATTRIBUTES, ATTRIBUTE_LABELS, DUNGEONS, DUNGEON_BY_ID, focusRemaining, type Attribute } from "@life-os/core";
import { attributeColors } from "@life-os/ui-tokens";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Input, Label, Progress, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";

const fmt = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.max(0, sec) % 60).padStart(2, "0")}`;

export function DungeonsPage() {
  const { snap, run, notify } = useGame();
  const running = snap.focusSessions.find((f) => f.status === "laufend") ?? null;
  const [dungeonId, setDungeonId] = useState("hoehle");
  const [attribute, setAttribute] = useState<Attribute>("intelligenz");
  const [intent, setIntent] = useState("");
  const [now, setNow] = useState(Date.now());
  const finishing = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = running ? focusRemaining(running, now) : 0;

  // Automatisch abschließen, sobald die Zeit um ist (der Server prüft nach)
  useEffect(() => {
    if (!running || remaining > 0 || finishing.current) return;
    finishing.current = true;
    void run((s) => s.finishFocus(running.id)).then((r) => {
      finishing.current = false;
      if (r?.applied) notify("xp", `🏆 ${DUNGEON_BY_ID.get(running.dungeonId)?.title} bezwungen! +${r.xp} XP · +${r.coins} Coins`);
    });
  }, [running, remaining, run, notify]);

  const history = snap.focusSessions.filter((f) => f.status !== "laufend").slice(0, 15);
  const done = snap.focusSessions.filter((f) => f.status === "geschafft");
  const focusMinutes = done.reduce((sum, f) => sum + f.minutes, 0);

  if (running) {
    const spec = DUNGEON_BY_ID.get(running.dungeonId)!;
    const total = running.minutes * 60;
    return (
      <div className="grid h-full place-items-center">
        <Card className="w-full max-w-lg p-8 text-center">
          <div className="text-5xl">{spec.icon}</div>
          <h1 className="heading mt-2 text-2xl">{spec.title}</h1>
          {running.intent && <p className="mt-1 text-sm text-muted">Ziel: {running.intent}</p>}
          <motion.div key={remaining > 0 ? "run" : "done"} initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="my-8 font-display text-7xl tabular-nums text-gold">
            {fmt(remaining)}
          </motion.div>
          <Progress value={1 - remaining / total} className="h-2" />
          <p className="mt-3 text-xs text-muted">
            Bleib bei der Sache. Belohnung: +{spec.xp} XP, +{spec.coins} Coins, {ATTRIBUTE_LABELS[running.attribute]}.
          </p>
          <Button
            variant="ghost"
            className="mt-6"
            onClick={async () => {
              if (confirm("Dungeon wirklich aufgeben? Es gibt keine Belohnung.")) await run((s) => s.abandonFocus(running.id));
            }}
          >
            <Flag size={14} /> Aufgeben
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading text-2xl">Fokus-Dungeons</h1>
        <p className="text-sm text-muted">Konzentrierte Arbeitsphasen. Die Belohnung gibt es erst, wenn die Zeit laut Server wirklich abgelaufen ist.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {DUNGEONS.map((d) => (
          <button
            key={d.id}
            onClick={() => setDungeonId(d.id)}
            className={cn("panel p-4 text-left transition-colors", dungeonId === d.id ? "gold-glow border-gold/60" : "hover:border-muted/50")}
          >
            <div className="text-3xl">{d.icon}</div>
            <div className="mt-1 font-display text-gold">{d.title}</div>
            <div className="text-xs text-muted">{d.description}</div>
            <div className="mt-2 text-sm">
              {d.minutes} min · <span className="text-gold">+{d.xp} XP</span> · <span className="text-electric">+{d.coins} ¢</span>
            </div>
          </button>
        ))}
      </div>
      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr_auto]">
          <div>
            <Label>Attribut</Label>
            <Select value={attribute} onChange={(e) => setAttribute(e.target.value as Attribute)}>
              {ATTRIBUTES.map((a) => (
                <option key={a} value={a}>
                  {ATTRIBUTE_LABELS[a]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Woran arbeitest du?</Label>
            <Input value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="z. B. Quartalsbericht schreiben" maxLength={120} />
          </div>
          <div className="flex items-end">
            <Button variant="gold" size="lg" onClick={() => void run((s) => s.startFocus({ dungeonId: dungeonId as "hoehle", attribute, intent }))}>
              <Swords size={16} /> Dungeon betreten
            </Button>
          </div>
        </div>
      </Card>
      <Card>
        <CardTitle>
          Chronik · {done.length} bezwungen · {focusMinutes} Fokus-Minuten
        </CardTitle>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Dungeons betreten.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {history.map((f) => {
              const spec = DUNGEON_BY_ID.get(f.dungeonId);
              return (
                <li key={f.id} className="flex justify-between gap-2 py-1.5">
                  <span className="truncate">
                    {spec?.icon} {spec?.title}
                    {f.intent && <span className="text-muted"> · {f.intent}</span>}
                  </span>
                  <span className={cn("shrink-0", f.status === "geschafft" ? "text-success" : "text-muted")} style={f.status === "geschafft" ? { color: attributeColors[f.attribute] } : undefined}>
                    {f.status === "geschafft" ? `✓ ${ATTRIBUTE_LABELS[f.attribute]}` : "aufgegeben"} · {new Date(f.startedAt).toLocaleDateString("de-DE")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
