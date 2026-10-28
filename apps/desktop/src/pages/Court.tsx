import { useState } from "react";
import { Gavel, Scale, ShieldCheck } from "lucide-react";
import { EXCUSES, EXCUSE_LABELS, PLEAS, VERDICT_LABELS, rulebookText, type Consequence, type Excuse, type Plea } from "@life-os/core";
import type { CourtCase } from "@life-os/api";
import { QuestItem } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, Label, Select, Textarea } from "@/components/ui/primitives";
import { missedMandatory, rewardOf } from "@life-os/api";
import { cn, formatDateTime } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";

const PLEA_LABELS: Record<Plea, string> = { schuldig: "Schuldig", nicht_schuldig: "Nicht schuldig", teilweise_schuldig: "Teilweise schuldig" };
const ROLE_LABELS = { angeklagter: "Angeklagter", richter: "Richter", staatsanwalt: "Staatsanwalt", verteidiger: "Verteidiger", system: "Gerichtsschreiber" } as const;

function describeConsequence(c: Consequence): string {
  switch (c.type) {
    case "coins_verlust":
      return `−${c.amount} LIFE COINS`;
    case "xp_abzug":
      return `−${c.amount} XP`;
    case "bonus_verlust":
      return `Bonusverlust: ${c.description}`;
    case "wiedergutmachung":
      return `Wiedergutmachungsquest: ${c.questTitle} (${c.estimatedMinutes} min)`;
    case "reflexion":
      return `Reflexion: ${c.prompt}`;
  }
}

function CaseView({ c }: { c: CourtCase }) {
  const { snap, store, run, notify, ai } = useGame();
  const messages = snap.courtMessages.filter((m) => m.caseId === c.id);
  const [plea, setPlea] = useState<Plea>("schuldig");
  const [excuse, setExcuse] = useState<Excuse>("keine");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const open = c.status === "offen" || c.status === "verhandlung" || c.status === "berufung";
  // Mit Geräte-KI verhandelt der KI-Richter; ohne sie die Edge Function (Cloud) bzw. der Regelrichter.
  const canTalk = !!ai.provider || store.mode === "cloud";

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    await run(fn);
    setBusy(false);
    setStatement("");
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted">Fallakte · {formatDateTime(c.createdAt)}</div>
          <h2 className="font-display text-lg">{c.charge}</h2>
          <div className="mt-1 text-xs text-muted">
            Beweismittel: Quest-Belohnung {c.questXp} XP / {c.questCoins} Coins · Vorkommen {c.occurrenceKey}
            {c.rulebookVersion && ` · Regelbasis v${c.rulebookVersion}`}
          </div>
        </div>
        <Badge color={c.status === "urteil" ? "#e6b450" : c.status === "aufgehoben" ? "#34d399" : "#f87171"}>{c.status}</Badge>
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto">
        {messages.map((m) => (
          <div key={m.id} className={cn("rounded-md px-3 py-2 text-sm", m.role === "angeklagter" ? "ml-10 bg-electric/10" : m.role === "richter" ? "mr-10 border border-gold/30 bg-gold/5" : m.role === "staatsanwalt" ? "mr-10 border border-danger/30 bg-danger/5" : m.role === "verteidiger" ? "mr-10 border border-success/30 bg-success/5" : "text-xs text-muted")}>
            <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted">{ROLE_LABELS[m.role]}</div>
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
      </div>

      {c.verdict && (
        <div className="rounded-md border border-gold/40 bg-gold/5 p-3">
          <div className="flex items-center gap-2 font-display text-gold">
            <Scale size={16} /> Urteil: {VERDICT_LABELS[c.verdict]}
          </div>
          {c.reasoning && <p className="mt-1 text-sm">{c.reasoning}</p>}
          {c.consequences.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-sm text-muted">
              {c.consequences.map((k, i) => (
                <li key={i}>{describeConsequence(k)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 flex items-center gap-1 text-sm text-success">
              <ShieldCheck size={14} /> Keine Konsequenzen.
            </p>
          )}
        </div>
      )}

      {open && (
        <div className="space-y-3 border-t border-border pt-3">
          {c.plea === null ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Plädoyer</Label>
                  <Select value={plea} onChange={(e) => setPlea(e.target.value as Plea)}>
                    {PLEAS.map((p) => (
                      <option key={p} value={p}>
                        {PLEA_LABELS[p]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Grund</Label>
                  <Select value={excuse} onChange={(e) => setExcuse(e.target.value as Excuse)}>
                    {EXCUSES.map((x) => (
                      <option key={x} value={x}>
                        {EXCUSE_LABELS[x]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <Label>Verteidigung / Aussage</Label>
                <Textarea value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Was ist passiert?" rows={3} />
              </div>
              <Button variant="gold" disabled={busy} onClick={() => void act(() => store.plead(c.id, { plea, excuse, statement }))}>
                <Gavel size={15} /> {busy ? "Gericht berät…" : "Plädoyer abgeben"}
              </Button>
            </>
          ) : (
            <>
              {canTalk && (
                <>
                  <Label>Antwort an den Richter</Label>
                  <Textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={2} placeholder="Leer lassen und „Weiter verhandeln“, wenn die KI vorhin nicht erreichbar war." />
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {canTalk && (
                  <Button variant="violet" disabled={busy} onClick={() => void act(() => store.sendCourtMessage(c.id, statement))}>
                    {busy ? "Gericht berät…" : statement.trim() ? "Antworten" : "Weiter verhandeln"}
                  </Button>
                )}
                <Button variant="outline" disabled={busy} title="Entscheidet sofort nach der Regelbasis – ohne KI" onClick={() => void act(() => store.ruleJudge(c.id))}>
                  <Scale size={15} /> Regelrichter entscheiden lassen
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {c.status === "urteil" && c.appealCount === 0 && c.verdict && !["freispruch", "einstellung"].includes(c.verdict) && (
        <details className="border-t border-border pt-3">
          <summary className="cursor-pointer text-sm text-electric">Berufung einlegen</summary>
          <div className="mt-3 space-y-3">
            <div>
              <Label>Neuer oder übersehener Grund</Label>
              <Select value={excuse} onChange={(e) => setExcuse(e.target.value as Excuse)}>
                {EXCUSES.map((x) => (
                  <option key={x} value={x}>
                    {EXCUSE_LABELS[x]}
                  </option>
                ))}
              </Select>
            </div>
            <Textarea value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Begründung der Berufung" rows={2} />
            <Button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await store.appeal(c.id, { excuse, statement });
                  notify("info", "Berufung verhandelt.");
                })
              }
            >
              Berufung einreichen
            </Button>
          </div>
        </details>
      )}
    </Card>
  );
}

export function CourtPage() {
  const { snap, today, run, ai } = useGame();
  const missed = missedMandatory(snap, today);
  const [selected, setSelected] = useState<string | null>(snap.cases[0]?.id ?? null);
  const current = snap.cases.find((c) => c.id === selected) ?? null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="heading text-2xl">The Court of Life</h1>
        <p className="text-sm text-muted">
          {ai.provider ? `Verhandlung mit dem KI-Richter (${ai.provider.label}) – jedes Urteil wird gegen die Regelbasis geprüft.` : "KI aus: Der Regelrichter entscheidet nach der Regelbasis."} Krankheit, Verletzung, Regeneration und Notfälle werden nie bestraft.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardTitle>Anklagebank – verpasste Pflichtquests</CardTitle>
            {missed.length === 0 ? (
              <p className="text-sm text-muted">Keine offenen Versäumnisse. Vorbildlich.</p>
            ) : (
              <div className="space-y-2">
                {missed.map((m) => (
                  <QuestItem
                    key={m.quest.id + m.key}
                    item={m}
                    onCourt={async () => {
                      const r = rewardOf(m.quest);
                      const c = await run((s) =>
                        s.openCase({
                          questId: m.quest.id,
                          occurrenceKey: m.key,
                          charge: `„${m.quest.title}" am ${formatDateTime(m.dueAt)} nicht erfüllt`,
                          questXp: r.xp,
                          questCoins: r.coins,
                        }),
                      );
                      if (c) setSelected(c.id);
                    }}
                  />
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted">Tipp: Haken = nachträglich erledigt. Hammer = Verfahren eröffnen.</p>
          </Card>
          <Card>
            <CardTitle>Verfahren</CardTitle>
            {snap.cases.length === 0 ? (
              <p className="text-sm text-muted">Noch keine Verfahren.</p>
            ) : (
              <ul className="space-y-1">
                {snap.cases.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setSelected(c.id)} className={cn("w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2", c.id === selected && "bg-violet/15")}>
                      <div className="truncate">{c.charge}</div>
                      <div className="text-[11px] text-muted">{c.verdict ? VERDICT_LABELS[c.verdict] : c.status}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-4 xl:col-span-3">
          {current ? <CaseView key={current.id} c={current} /> : <Card className="p-8 text-center text-sm text-muted">Kein Verfahren ausgewählt.</Card>}
          <details className="panel p-4 text-xs text-muted">
            <summary className="cursor-pointer text-sm text-text">Regelbasis anzeigen</summary>
            <pre className="mt-2 whitespace-pre-wrap font-sans">{rulebookText()}</pre>
          </details>
        </div>
      </div>
    </div>
  );
}
