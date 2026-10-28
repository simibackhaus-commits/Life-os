import { useState } from "react";
import { Users } from "lucide-react";
import { COUNCIL_ROLES, ROLES, type RoleId } from "@life-os/ai";
import { AiStatusLine } from "@/components/AiSettings";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";

const EXAMPLES = ["Wie verteile ich diese Woche Training, Arbeit und Erholung?", "Soll ich mein Sparziel erhöhen oder erst einen Puffer aufbauen?", "Was ist mein wichtigster Hebel im nächsten Monat?"];

/** Ratssitzung: dieselbe Frage nacheinander an mehrere Rollen – ein Modell, mehrere Perspektiven. */
export function CouncilPage() {
  const { store, ai, notify } = useGame();
  const [question, setQuestion] = useState("");
  const [roles, setRoles] = useState<RoleId[]>(["general", "stratege", "regeneration"]);
  const [answers, setAnswers] = useState<Array<{ role: RoleId; reply: string }>>([]);
  const [busy, setBusy] = useState(false);

  async function convene() {
    setBusy(true);
    setAnswers([]);
    try {
      setAnswers(await store.council(question.trim(), roles));
    } catch (e) {
      notify("error", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="heading flex items-center gap-2 text-2xl">
          <Users size={22} /> KI-Rat
        </h1>
        <p className="text-sm text-muted">
          Stelle dem Rat eine Frage. Alle Stimmen kommen aus <strong>einem</strong> Modell in verschiedenen Rollen – es ist keine unabhängige Mehrheitsentscheidung. Die
          Entscheidung triffst du. <AiStatusLine />
        </p>
      </div>
      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {COUNCIL_ROLES.map((r) => {
            const on = roles.includes(r);
            return (
              <button
                key={r}
                onClick={() => setRoles((cur) => (on ? cur.filter((x) => x !== r) : [...cur, r]))}
                className={cn("rounded-md border px-2.5 py-1 text-sm", on ? "border-gold bg-gold/10 text-gold" : "border-border text-muted hover:text-text")}
              >
                {ROLES[r].icon} {ROLES[r].name}
              </button>
            );
          })}
        </div>
        <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} placeholder={EXAMPLES[0]} />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="gold" disabled={busy || !question.trim() || roles.length === 0 || !ai.provider} onClick={() => void convene()}>
            {busy ? "Der Rat berät…" : `Rat einberufen (${roles.length})`}
          </Button>
          {EXAMPLES.map((ex) => (
            <button key={ex} className="text-xs text-electric hover:underline" onClick={() => setQuestion(ex)}>
              {ex}
            </button>
          ))}
        </div>
        {!ai.provider && <p className="text-sm text-warning">Die KI ist aus. Unter Einstellungen → KI lässt sich Ollama kostenlos einrichten.</p>}
        {busy && <p className="text-xs text-muted">Die Rollen antworten nacheinander und gehen auf die vorherigen Beiträge ein. Lokal kann das ein bis zwei Minuten dauern.</p>}
      </Card>
      {answers.map((a) => (
        <Card key={a.role}>
          <CardTitle>
            {ROLES[a.role].icon} {ROLES[a.role].name}
          </CardTitle>
          <p className="whitespace-pre-wrap text-sm">{a.reply}</p>
        </Card>
      ))}
    </div>
  );
}
