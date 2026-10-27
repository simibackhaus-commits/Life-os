import { Check, Lock, Sparkles } from "lucide-react";
import { ATTRIBUTES, ATTRIBUTE_LABELS, SKILLS, SKILL_CAPS, attributeLevel, canUnlock, skillPoints } from "@life-os/core";
import { attributeColors } from "@life-os/ui-tokens";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";

const REASONS: Record<string, string> = {
  level: "Attribut-Level zu niedrig",
  previous: "Erst die vorherige Stufe freischalten",
  points: "Keine Skillpunkte in diesem Attribut",
  already: "Bereits freigeschaltet",
  unknown: "Unbekannter Skill",
};

export function SkilltreePage() {
  const { snap, run, notify } = useGame();
  const unlocked = new Set(snap.skills);
  const attrXp = snap.character.attributeXp ?? {};

  async function unlock(id: string, title: string) {
    const r = await run((s) => s.unlockSkill(id));
    if (!r) return;
    if (r.ok) notify("xp", `✨ Fähigkeit „${title}" freigeschaltet!`);
    else notify("error", REASONS[r.reason] ?? r.reason);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading text-2xl">Skilltree</h1>
        <p className="text-sm text-muted">
          Jedes Attribut-Level über 1 gibt einen Skillpunkt für dieses Attribut. Fähigkeiten erhöhen XP und Coins für Quests mit dem Attribut (gesamt höchstens +{SKILL_CAPS.xpPct} % XP und +{SKILL_CAPS.coinPct} % Coins pro Quest).
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-5">
        {ATTRIBUTES.map((a) => {
          const color = attributeColors[a];
          const pts = skillPoints(attrXp, unlocked, a);
          return (
            <Card key={a} className="flex flex-col gap-2 p-3">
              <div className="flex items-baseline justify-between">
                <span className="font-display" style={{ color }}>
                  {ATTRIBUTE_LABELS[a]}
                </span>
                <span className="text-[11px] text-muted">Lv {attributeLevel(attrXp, a)}</span>
              </div>
              <div className="text-[11px] text-muted">
                Punkte: <span style={{ color: pts.available > 0 ? color : undefined }}>{pts.available}</span> frei
              </div>
              <div className="flex flex-col gap-2">
                {SKILLS.filter((s) => s.attribute === a).map((s, i) => {
                  const has = unlocked.has(s.id);
                  const check = canUnlock(s.id, attrXp, unlocked);
                  return (
                    <div key={s.id} className="relative">
                      {i > 0 && <div className="absolute -top-2 left-4 h-2 w-px" style={{ background: has ? color : "var(--color-border)" }} />}
                      <div
                        className={cn("rounded-md border p-2 text-xs", !has && !check.ok && "opacity-60")}
                        style={{ borderColor: has ? color : "var(--color-border)", background: has ? `${color}1a` : undefined }}
                        title={check.ok || has ? s.effect : REASONS[check.reason]}
                      >
                        <div className="flex items-center gap-1.5 font-medium">
                          {has ? <Check size={12} style={{ color }} /> : check.ok ? <Sparkles size={12} style={{ color }} /> : <Lock size={12} className="text-muted" />}
                          {s.title}
                        </div>
                        <div className="mt-0.5 text-[10px] text-muted">
                          {s.effect.split(" auf ")[0]} · ab Lv {s.requiredLevel}
                        </div>
                        {!has && check.ok && (
                          <Button size="sm" variant="gold" className="mt-1.5 h-7 w-full" onClick={() => void unlock(s.id, s.title)}>
                            Freischalten
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
