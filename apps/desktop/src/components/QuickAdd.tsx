import { useState } from "react";
import { Wand2 } from "lucide-react";
import type { QuickAddDraft } from "@life-os/api";
import { useGame } from "@/state/GameProvider";
import { QuestEditor } from "./QuestEditor";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Badge, Textarea } from "./ui/primitives";

const EXAMPLES = [
  "Jeden Montag, Mittwoch und Freitag 30 Minuten laufen.",
  "Jeden Tag morgens und abends Zähne putzen",
  "Ich muss morgen um 14 Uhr eine Bestellung auslösen.",
  "Ich möchte in drei Monaten 3.000 Euro sparen.",
];

/** Zentraler Quick-Add: Freitext → (KI oder Offline-Parser) → bearbeitbare Vorschau → speichern. */
export function QuickAdd({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { run, notify } = useGame();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<QuickAddDraft | null>(null);

  function close() {
    onOpenChange(false);
    setText("");
    setPreview(null);
  }

  async function analyze() {
    if (!text.trim()) return;
    setBusy(true);
    const r = await run((s) => s.quickAdd(text.trim()));
    setBusy(false);
    if (r) setPreview(r);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())} title="Quick-Add" description="Beschreibe deine Quest in eigenen Worten. Vor dem Speichern siehst du eine bearbeitbare Vorschau.">
      {!preview ? (
        <div className="space-y-3">
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void analyze();
            }}
            placeholder="z. B. Jeden Montag, Mittwoch und Freitag 30 Minuten laufen."
            rows={3}
          />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} className="rounded-sm border border-border px-2 py-1 text-[11px] text-muted hover:text-text" onClick={() => setText(ex)}>
                {ex}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="violet" onClick={() => void analyze()} disabled={busy || !text.trim()}>
              <Wand2 size={15} /> {busy ? "Analysiere…" : "Vorschau erzeugen (Strg+Enter)"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <Badge color={preview.source === "ki" ? "#8b5cf6" : "#8b92a8"}>{preview.source === "ki" ? "KI-Spielleiter" : "Offline-Parser"}</Badge>
            {preview.notes.map((n) => (
              <span key={n}>· {n}</span>
            ))}
          </div>
          <QuestEditor
            initial={preview.draft}
            submitLabel="Quest erstellen"
            onCancel={() => setPreview(null)}
            onSubmit={async (draft) => {
              const q = await run((s) => s.createQuest(draft));
              if (q) {
                notify("info", `Quest „${q.title}" erstellt.`);
                close();
              }
            }}
          />
        </div>
      )}
    </Dialog>
  );
}
