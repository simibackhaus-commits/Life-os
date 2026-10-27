import { useState } from "react";
import { motion } from "motion/react";
import { BookOpen, Lock } from "lucide-react";
import { ATTRIBUTE_LABELS, CHAPTERS, ROOM_TIERS, headquarters, headquartersRank, levelFromXp, storyProgress, trophies } from "@life-os/core";
import { achievementsFor } from "@life-os/api";
import { attributeColors } from "@life-os/ui-tokens";
import { Card, CardTitle, Progress } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";

export function HeadquartersPage() {
  const { snap, today } = useGame();
  const rooms = headquarters(snap.character);
  const rank = headquartersRank(rooms);
  const cups = trophies(achievementsFor(snap, today));
  const level = levelFromXp(snap.character.totalXp).level;
  const story = storyProgress(level);
  const [open, setOpen] = useState<number>(story.unlocked.at(-1)?.number ?? 1);

  return (
    <div className="space-y-4">
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/10 blur-3xl" />
        <div className="flex items-center gap-4">
          <motion.div className="text-6xl" animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity }}>
            {rank.icon}
          </motion.div>
          <div>
            <h1 className="heading text-2xl">Hauptquartier: {rank.title}</h1>
            <p className="text-sm text-muted">
              Jeder Raum gehört zu einem Attribut und wird mit dessen Level ausgebaut ({ROOM_TIERS.map((t) => `${t.name} ab Lv ${t.minLevel}`).join(" · ")}).
            </p>
            <div className="mt-2 max-w-sm">
              <Progress value={rank.score / 40} className="h-1.5" />
              <div className="mt-0.5 text-[11px] text-muted">Ausbaustufe {rank.score}/40</div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
        {rooms.map((r, i) => {
          const color = attributeColors[r.room.attribute];
          return (
            <motion.div
              key={r.room.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03 }}
              className="panel flex flex-col items-center p-3 text-center"
              style={{ borderColor: r.tierIndex > 0 ? `${color}66` : undefined, background: r.tierIndex >= 3 ? `${color}12` : undefined }}
              title={r.room.flavor}
            >
              <div className={cn("text-4xl", r.tierIndex === 0 && "opacity-50 grayscale")}>{r.icon}</div>
              <div className="mt-1 text-sm font-medium">{r.room.name}</div>
              <div className="text-[11px]" style={{ color }}>
                {r.tier} · {ATTRIBUTE_LABELS[r.room.attribute]} Lv {r.level}
              </div>
              <div className="mt-1 text-[10px] text-muted">{r.nextAt ? `Ausbau ab Lv ${r.nextAt}` : "Vollständig ausgebaut"}</div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Trophäenhalle · {cups.length}</CardTitle>
          {cups.length === 0 ? (
            <p className="text-sm text-muted">Noch leer – jedes Achievement stellt hier eine Trophäe auf.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {cups.map((t) => (
                <div key={t.title} className="flex items-center gap-1.5 rounded-md border border-border bg-surface-2/50 px-2 py-1 text-xs" title={t.tier}>
                  <span className="text-lg">{t.icon}</span>
                  {t.title}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>
            <BookOpen size={14} /> Chronik des Helden · Kapitel {story.unlocked.length}/{CHAPTERS.length}
          </CardTitle>
          <div className="space-y-1.5">
            {story.unlocked.map((c) => (
              <div key={c.number} className="rounded-md border border-border">
                <button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm" onClick={() => setOpen(open === c.number ? 0 : c.number)}>
                  <span>
                    <span className="text-muted">Kapitel {c.number}:</span> <span className="font-display text-gold">{c.title}</span>
                  </span>
                  <span className="text-[11px] text-muted">Lv {c.level}</span>
                </button>
                {open === c.number && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-3 pb-3 text-sm leading-relaxed">
                    {c.text(snap.character)}
                  </motion.p>
                )}
              </div>
            ))}
            {story.next && (
              <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted">
                <Lock size={13} /> Kapitel {story.next.number}: „{story.next.title}“ – ab Level {story.next.level}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
