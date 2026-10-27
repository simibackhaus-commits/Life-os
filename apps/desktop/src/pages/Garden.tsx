import { motion } from "motion/react";
import { PLANT_STAGES, gardenPlants } from "@life-os/core";
import { Card, Progress } from "@/components/ui/primitives";
import { useGame } from "@/state/GameProvider";

export function GardenPage() {
  const { snap, today } = useGame();
  const plants = gardenPlants(snap.quests, snap.instances, today);
  const blooming = plants.filter((p) => p.stage.minStreak >= 14).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading text-2xl">Habit Garden</h1>
        <p className="text-sm text-muted">
          Jede Routine ist eine Pflanze. Sie wächst mit deiner Serie: {PLANT_STAGES.map((s) => `${s.icon} ab ${s.minStreak}`).join(" · ")}. Reißt die Serie, welkt sie – und wächst neu.
        </p>
      </div>
      {plants.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">Noch keine Routinen. Lege eine wiederkehrende Quest an, um den ersten Samen zu säen.</Card>
      ) : (
        <>
          <div className="text-sm text-muted">
            {plants.length} Pflanzen · {blooming} prächtige Bäume
          </div>
          <div
            className="grid grid-cols-2 gap-3 rounded-xl border border-border p-4 sm:grid-cols-3 xl:grid-cols-5"
            style={{ background: "linear-gradient(180deg, rgb(56 189 248 / 0.06), rgb(52 211 153 / 0.08))" }}
          >
            {plants.map((p, i) => (
              <motion.div
                key={p.quest.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex flex-col items-center rounded-lg bg-surface/70 p-3 text-center"
                title={`Serie ${p.current} · beste ${p.best}`}
              >
                <motion.div
                  className="text-5xl"
                  style={{ filter: p.wilted ? "grayscale(1) brightness(0.7)" : undefined }}
                  animate={p.wilted ? { rotate: -12 } : { rotate: [0, 2, -2, 0] }}
                  transition={p.wilted ? {} : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  {p.wilted ? "🥀" : p.stage.icon}
                </motion.div>
                <div className="mt-2 line-clamp-2 text-sm">{p.quest.title}</div>
                <div className="text-[11px] text-muted">
                  {p.wilted ? `verwelkt · Rekord ${p.best}` : `${p.stage.name} · 🔥 ${p.current}`}
                </div>
                {p.next && !p.wilted && (
                  <div className="mt-2 w-full">
                    <Progress value={p.growth} className="h-1" color="#34d399" />
                    <div className="mt-0.5 text-[10px] text-muted">
                      noch {p.next.minStreak - p.current} bis {p.next.icon}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
