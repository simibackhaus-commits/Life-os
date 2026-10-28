import { useEffect, useState } from "react";
import { CheckCircle2, Cpu, RefreshCw, XCircle } from "lucide-react";
import { DEFAULT_GEMINI_MODEL, DEFAULT_OLLAMA_MODEL, DEFAULT_OLLAMA_URL, type AiSettings } from "@life-os/ai";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Input, Label, Select } from "@/components/ui/primitives";
import { useGame } from "@/state/GameProvider";

/** Kleine Statuszeile, z. B. im Chat oder Gericht. */
export function AiStatusLine() {
  const { ai } = useGame();
  if (!ai.provider) return <span className="text-muted">KI aus · Regelrichter und Offline-Erkennung aktiv</span>;
  if (!ai.status) return <span className="text-muted">{ai.provider.label} · prüfe…</span>;
  return (
    <span className={ai.status.ok ? "text-success" : "text-warning"}>
      {ai.provider.label} · {ai.status.ok ? "bereit" : "nicht bereit"}
    </span>
  );
}

/** Einstellungen der kostenlosen Geräte-KI. Kostenpflichtige Anbieter sind bewusst nicht wählbar. */
export function AiSettingsCard() {
  const { ai, notify } = useGame();
  const [draft, setDraft] = useState<AiSettings>(ai.settings);
  useEffect(() => setDraft(ai.settings), [ai.settings]);
  const set = <K extends keyof AiSettings>(k: K, v: AiSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(ai.settings);

  return (
    <Card>
      <CardTitle>
        <Cpu size={15} /> KI (kostenlos)
      </CardTitle>
      <p className="mb-3 text-sm text-muted">
        Alle Spielfunktionen laufen auch ohne KI. Mit KI erstellt der Spielleiter Quests aus Sätzen, der Rat berät dich und der Richter verhandelt mit Rückfragen. Jedes
        KI-Urteil wird gegen die feste Regelbasis geprüft – die KI kann nichts direkt buchen.
      </p>

      <div className="space-y-3 text-sm">
        <div>
          <Label>Anbieter</Label>
          <Select value={draft.provider} onChange={(e) => set("provider", e.target.value as AiSettings["provider"])}>
            <option value="aus">Aus (Regelrichter, Offline-Erkennung)</option>
            <option value="ollama">Ollama – lokal auf diesem PC (empfohlen, kostenlos, privat)</option>
            <option value="gemini">Google Gemini – Free Tier (Internet, nur mit Zustimmung)</option>
          </Select>
        </div>

        {draft.provider === "ollama" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Adresse</Label>
              <Input value={draft.ollamaUrl} onChange={(e) => set("ollamaUrl", e.target.value)} placeholder={DEFAULT_OLLAMA_URL} />
            </div>
            <div>
              <Label>Modell</Label>
              <Input value={draft.ollamaModel} onChange={(e) => set("ollamaModel", e.target.value)} placeholder={DEFAULT_OLLAMA_MODEL} list="ollama-models" />
              <datalist id="ollama-models">
                {(ai.status?.models ?? []).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
            <p className="col-span-2 text-xs text-muted">
              Empfehlung für deinen PC (RTX 3080, 10 GB): <code>{DEFAULT_OLLAMA_MODEL}</code> (~5 GB, Apache-2.0). Installation: Ollama von ollama.com installieren, dann im Terminal{" "}
              <code>ollama pull {DEFAULT_OLLAMA_MODEL}</code>. Daten verlassen den PC nicht.
            </p>
          </div>
        )}

        {draft.provider === "gemini" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>API-Schlüssel (aus Google AI Studio)</Label>
                <Input type="password" autoComplete="off" value={draft.geminiKey} onChange={(e) => set("geminiKey", e.target.value)} placeholder="nur auf diesem Gerät gespeichert" />
              </div>
              <div>
                <Label>Modell</Label>
                <Input value={draft.geminiModel} onChange={(e) => set("geminiModel", e.target.value)} placeholder={DEFAULT_GEMINI_MODEL} list="gemini-models" />
                <datalist id="gemini-models">
                  {(ai.status?.models ?? []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/5 p-3">
              <input type="checkbox" className="mt-1" checked={draft.geminiConsent} onChange={(e) => set("geminiConsent", e.target.checked)} />
              <span className="text-muted">
                Ich verstehe: Im kostenlosen Gemini-Tarif darf Google Ein- und Ausgaben zur Verbesserung seiner Produkte verwenden, und die Tageskontingente sind begrenzt. Ich
                nutze nur einen Schlüssel ohne hinterlegte Zahlungsmethode, damit keine Kosten entstehen können.
              </span>
            </label>
          </div>
        )}

        {draft.provider !== "aus" && (
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1" checked={draft.shareGameData} onChange={(e) => set("shareGameData", e.target.checked)} />
            <span className="text-muted">
              Die KI darf meine Quests, Abschlüsse und Charakterwerte als Kontext lesen (für Tagesplanung und Rat). Ohne Freigabe antwortet sie nur allgemein. Im Gericht sieht der
              Richter immer die Fallakte.
            </span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="gold"
            disabled={!dirty}
            onClick={() => {
              ai.save(draft);
              notify("info", "KI-Einstellungen gespeichert.");
            }}
          >
            Speichern
          </Button>
          {ai.provider && (
            <Button variant="outline" disabled={ai.checking} onClick={() => void ai.check()}>
              <RefreshCw size={14} className={ai.checking ? "animate-spin" : ""} /> Verbindung testen
            </Button>
          )}
          {ai.status && (
            <span className={`flex items-center gap-1.5 text-xs ${ai.status.ok ? "text-success" : "text-warning"}`}>
              {ai.status.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {ai.status.detail}
            </span>
          )}
          {draft.provider === "gemini" && !draft.geminiConsent && <span className="text-xs text-warning">Ohne Zustimmung bleibt Gemini aus.</span>}
        </div>
        <p className="text-xs text-muted">Kostenpflichtige Anbieter (Anthropic, OpenAI) sind standardmäßig aus und hier nicht wählbar.</p>
      </div>
    </Card>
  );
}
