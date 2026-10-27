import { AnimatePresence, motion } from "motion/react";
import { Check, Clock, Coins, Crown, Flame, Gavel, Sparkles, Undo2 } from "lucide-react";
import { ATTRIBUTES, ATTRIBUTE_CURVE, ATTRIBUTE_LABELS, QUEST_TYPE_LABELS, levelFromXp, titleForLevel, type Character } from "@life-os/core";
import { attributeColors, questTypeColors } from "@life-os/ui-tokens";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { useState } from "react";
import { questStreak, rewardOf, xpPerDay, type OccurrenceItem } from "@life-os/api";
import { cn } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";
import { Button } from "./ui/button";
import { Badge, Card, CardTitle, Progress } from "./ui/primitives";

export function CharacterSummary({ character }: { character: Character }) {
  const lvl = levelFromXp(character.totalXp);
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet/20 blur-3xl" />
      <div className="flex items-center gap-4">
        <div className="gold-glow grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-deep to-surface-2 font-display text-2xl text-gold">
          {character.avatar || character.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="truncate font-display text-xl text-text">{character.name}</h2>
            <span className="text-xs text-muted">
              {character.title && character.title !== "Neuling" ? character.title : titleForLevel(lvl.level)} · {character.className}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <span className="flex items-center gap-1 font-display text-gold">
              <Crown size={14} /> Level {lvl.level}
            </span>
            <span className="flex items-center gap-1 text-sm text-electric">
              <Coins size={14} /> {character.coins} LIFE COINS
            </span>
          </div>
          <div className="mt-2">
            <Progress value={lvl.progress} />
            <div className="mt-1 text-[11px] text-muted">
              {lvl.xpInLevel} / {lvl.xpForLevel} XP bis Level {lvl.level + 1} · gesamt {character.totalXp} XP
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function AttributeGrid({ character }: { character: Character }) {
  return (
    <Card>
      <CardTitle>
        <Sparkles size={14} /> Attribute
      </CardTitle>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {ATTRIBUTES.map((a) => {
          const info = levelFromXp(character.attributeXp?.[a] ?? 0, ATTRIBUTE_CURVE);
          return (
            <div key={a}>
              <div className="mb-1 flex justify-between text-xs">
                <span style={{ color: attributeColors[a] }}>{ATTRIBUTE_LABELS[a]}</span>
                <span className="text-muted">Lv {info.level}</span>
              </div>
              <Progress value={info.progress} color={attributeColors[a]} className="h-1.5" />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function QuestItem({ item, onCourt }: { item: OccurrenceItem; onCourt?: () => void }) {
  const { complete, run, snap, today, notify } = useGame();
  const [burst, setBurst] = useState(false);
  const done = item.status === "erledigt";
  const excused = item.status === "entschuldigt";
  const reward = rewardOf(item.quest, snap.skills);
  const streak = questStreak(snap, item.quest, today);

  async function toggle() {
    if (done && item.instance) {
      const ok = await run((s) => s.uncomplete(item.instance!.id));
      if (ok) notify("info", "Abschluss rückgängig gemacht.");
      return;
    }
    const r = await complete({ questId: item.quest.id, occurrenceKey: item.key, dueAt: item.dueAt });
    if (r?.applied) {
      setBurst(true);
      setTimeout(() => setBurst(false), 900);
    }
  }

  return (
    <motion.div layout className={cn("group relative flex items-center gap-3 rounded-md border border-border bg-surface-2/50 px-3 py-2.5", done && "opacity-60")}>
      <button
        onClick={() => void toggle()}
        disabled={excused}
        aria-label={done ? "Abschluss rückgängig machen" : "Quest abschließen"}
        className={cn(
          "relative grid h-7 w-7 shrink-0 place-items-center rounded-md border-2 transition-colors",
          done ? "border-success bg-success/20 text-success" : "border-muted/50 text-transparent hover:border-gold hover:text-gold/60",
        )}
      >
        {done ? <Check size={16} /> : <Check size={14} />}
        <AnimatePresence>
          {burst && (
            <motion.span initial={{ scale: 0.5, opacity: 1 }} animate={{ scale: 2.6, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }} className="absolute inset-0 rounded-md border-2 border-gold" />
          )}
        </AnimatePresence>
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm font-medium", done && "line-through")}>{item.quest.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <Badge color={questTypeColors[item.quest.type]}>{QUEST_TYPE_LABELS[item.quest.type]}</Badge>
          {item.time && (
            <span className="flex items-center gap-0.5">
              <Clock size={11} /> {item.time}
            </span>
          )}
          {item.quest.estimatedMinutes ? <span>{item.quest.estimatedMinutes} min</span> : null}
          {streak && streak.current > 0 && (
            <span className="flex items-center gap-0.5 text-warning">
              <Flame size={11} /> {streak.current}
            </span>
          )}
          {excused && <Badge color="#34d399">entschuldigt</Badge>}
          {item.quest.mandatory && !done && <Badge color="#f87171">Pflicht</Badge>}
        </div>
      </div>
      <div className="text-right text-[11px] leading-tight">
        <div className="text-gold">+{reward.xp} XP</div>
        <div className="text-electric">+{reward.coins} ¢</div>
      </div>
      {done && item.instance && (
        <Undo2 size={13} className="absolute right-1 top-1 hidden text-muted group-hover:block" aria-hidden />
      )}
      {onCourt && (
        <Button size="sm" variant="ghost" onClick={onCourt} title="Verfahren eröffnen">
          <Gavel size={14} />
        </Button>
      )}
    </motion.div>
  );
}

export function XpChart() {
  const { snap, today } = useGame();
  const data = xpPerDay(snap, today);
  return (
    <Card>
      <CardTitle>XP – letzte 14 Tage</CardTitle>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="xpFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e6b450" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#e6b450" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" tick={{ fill: "#8b92a8", fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
            <Tooltip contentStyle={{ background: "#151821", border: "1px solid #2a3042", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#e8eaf2" }} />
            <Area type="monotone" dataKey="xp" name="XP" stroke="#e6b450" strokeWidth={2} fill="url(#xpFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function LevelUpOverlay() {
  const { levelUp, dismissLevelUp } = useGame();
  return (
    <AnimatePresence>
      {levelUp && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismissLevelUp}
        >
          <motion.div
            initial={{ scale: 0.4, rotate: -8, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 180, damping: 14 }}
            className="text-center"
          >
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} className="mx-auto mb-4 h-40 w-40 rounded-full border-2 border-dashed border-gold/60" />
            <div className="-mt-32 mb-16 font-display text-6xl text-gold drop-shadow-[0_0_24px_rgba(230,180,80,0.6)]">{levelUp}</div>
            <div className="font-display text-3xl tracking-widest text-text">LEVEL UP</div>
            <div className="mt-2 text-sm text-muted">Neuer Titel: {titleForLevel(levelUp)} · Klicken zum Fortfahren</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Toasts() {
  const { toasts } = useGame();
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            className={cn(
              "panel px-4 py-2 text-sm shadow-xl",
              t.kind === "xp" && "gold-glow text-gold",
              t.kind === "error" && "border-danger/50 text-danger",
            )}
            role={t.kind === "error" ? "alert" : "status"}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
