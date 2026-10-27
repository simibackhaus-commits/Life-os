import { useMemo, useState } from "react";
import { TEMPLATE_PACKS, describeRule, newFromPack, type QuestDraftInput, type RecurrenceRule } from "@life-os/core";
import { useGame } from "@/state/GameProvider";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

const keyOf = (q: QuestDraftInput) => q.title;

/** Vorschau eines Vorlagenpakets: Quests an-/abwählen und gesammelt anlegen. */
export function TemplatePicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { snap, today, run, notify } = useGame();
  const pack = TEMPLATE_PACKS[0]!;
  const existingTitles = snap.quests.filter((q) => q.status === "aktiv" || q.status === "pausiert").map((q) => q.title);
  const groups = useMemo(() => newFromPack(pack, today, existingTitles), [pack, today, existingTitles.join("|")]);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const selectable = groups.flatMap((g) => g.quests).filter((q) => !q.exists);
  const chosen = selectable.filter((q) => !deselected.has(keyOf(q.quest)));

  function toggle(title: string) {
    setDeselected((s) => {
      const n = new Set(s);
      if (n.has(title)) n.delete(title);
      else n.add(title);
      return n;
    });
  }

  async function create() {
    setBusy(true);
    let ok = 0;
    for (const { quest } of chosen) {
      if (await run((s) => s.createQuest(quest))) ok++;
      setProgress(ok);
    }
    setBusy(false);
    setProgress(0);
    notify("info", `${ok} Quests angelegt. Nicht Passendes kannst du im Questbuch archivieren.`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)} title={`Vorlage: ${pack.title}`} description={pack.description} className="w-[min(820px,calc(100vw-32px))]">
      <div className="space-y-4">
        {groups.map((g) => {
          const titles = g.quests.filter((q) => !q.exists).map((q) => q.quest.title);
          const allOn = titles.every((t) => !deselected.has(t));
          return (
            <section key={g.name}>
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="font-display text-gold">
                  {g.icon} {g.name}
                </h3>
                {titles.length > 0 && (
                  <button
                    className="text-xs text-electric"
                    onClick={() =>
                      setDeselected((s) => {
                        const n = new Set(s);
                        for (const t of titles) allOn ? n.add(t) : n.delete(t);
                        return n;
                      })
                    }
                  >
                    {allOn ? "keine" : "alle"}
                  </button>
                )}
              </div>
              <ul className="grid grid-cols-1 gap-1 md:grid-cols-2">
                {g.quests.map(({ quest, exists }) => (
                  <li key={quest.title}>
                    <label className={`flex items-start gap-2 rounded-md px-2 py-1 text-sm ${exists ? "opacity-40" : "hover:bg-surface-2"}`}>
                      <input type="checkbox" className="mt-1" disabled={exists} checked={!exists && !deselected.has(quest.title)} onChange={() => toggle(quest.title)} />
                      <span>
                        {quest.title}
                        <span className="block text-[11px] text-muted">
                          {exists ? "bereits vorhanden" : quest.recurrence ? describeRule({ ...(quest.recurrence as RecurrenceRule), interval: quest.recurrence.interval ?? 1 }) : ""}
                          {quest.mandatory && !exists ? " · Pflicht" : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-surface pt-3">
          <span className="text-sm text-muted">{busy ? `Lege an… ${progress}/${chosen.length}` : `${chosen.length} von ${selectable.length} ausgewählt`}</span>
          <Button variant="gold" disabled={busy || chosen.length === 0} onClick={() => void create()}>
            {chosen.length} Quests anlegen
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
