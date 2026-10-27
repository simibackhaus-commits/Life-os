import { useState } from "react";
import { Pencil } from "lucide-react";
import type { Quest } from "@life-os/core";
import { useGame } from "@/state/GameProvider";
import { QuestEditor } from "./QuestEditor";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";

/** Stift-Knopf, der den Quest-Editor öffnet – nutzbar überall, wo eine Quest angezeigt wird. */
export function EditQuestButton({ quest, className }: { quest: Quest; className?: string }) {
  const { run, notify } = useGame();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" className={className} title="Quest bearbeiten (Tage, Uhrzeiten, Start …)" aria-label="Quest bearbeiten" onClick={() => setOpen(true)}>
        <Pencil size={14} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Quest bearbeiten">
        {open && (
          <QuestEditor
            initial={quest}
            onCancel={() => setOpen(false)}
            onSubmit={async (draft) => {
              const ok = await run((s) => s.updateQuest(quest.id, draft).then(() => true));
              if (ok) {
                notify("info", `„${draft.title}" gespeichert.`);
                setOpen(false);
              }
            }}
          />
        )}
      </Dialog>
    </>
  );
}
