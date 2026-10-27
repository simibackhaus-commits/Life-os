import { Trophy } from "lucide-react";
import { achievementsFor } from "@life-os/api";
import { cn } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";
import { Card, CardTitle, Progress } from "./ui/primitives";

const TIER_COLOR = { bronze: "#cd7f32", silber: "#cbd5e1", gold: "#e6b450", "legendär": "#8b5cf6" } as const;

export function Achievements() {
  const { snap, today } = useGame();
  const list = achievementsFor(snap, today).sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.progress - a.progress);
  const unlocked = list.filter((a) => a.unlocked).length;
  return (
    <Card>
      <CardTitle>
        <Trophy size={14} /> Achievements · {unlocked}/{list.length}
      </CardTitle>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {list.map((a) => (
          <div
            key={a.def.id}
            className={cn("flex items-center gap-3 rounded-md border bg-surface-2/50 p-2.5", a.unlocked ? "" : "opacity-55 grayscale")}
            style={{ borderColor: a.unlocked ? `${TIER_COLOR[a.def.tier]}88` : "var(--color-border)" }}
            title={a.def.description}
          >
            <div className="text-2xl">{a.def.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium" style={{ color: a.unlocked ? TIER_COLOR[a.def.tier] : undefined }}>
                {a.def.title}
              </div>
              <div className="truncate text-[11px] text-muted">{a.def.description}</div>
              {!a.unlocked && a.target > 1 && (
                <div className="mt-1 flex items-center gap-2">
                  <Progress value={a.progress} className="h-1" />
                  <span className="shrink-0 text-[10px] text-muted">
                    {a.current}/{a.target}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
