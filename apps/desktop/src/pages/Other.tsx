import { useEffect, useState } from "react";
import { Download, LogOut, Trash2 } from "lucide-react";
import { AttributeGrid, CharacterSummary } from "@/components/game";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, Input, Label } from "@/components/ui/primitives";
import { supabase } from "@/lib/store";
import { downloadJson, formatDateTime } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";

const CLASSES = ["Abenteurer", "Krieger", "Gelehrter", "Stratege", "Händler", "Waldläufer", "Paladin"];

export function CharacterPage() {
  const { snap, run, notify } = useGame();
  const c = snap.character;
  const [name, setName] = useState(c.name);
  const [className, setClassName] = useState(c.className);
  const [avatar, setAvatar] = useState(c.avatar);
  const history = [...snap.events].reverse().slice(0, 40);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <CharacterSummary character={c} />
        <Card>
          <CardTitle>Charakter anpassen</CardTitle>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              await run((s) => s.updateCharacter({ name: name.trim() || "Held", className, avatar: avatar.slice(0, 2) }));
              notify("info", "Charakter gespeichert.");
            }}
          >
            <div>
              <Label htmlFor="c-name">Name</Label>
              <Input id="c-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Klasse</Label>
                <select className="h-9 w-full rounded-md border border-border bg-bg/60 px-3 text-sm" value={className} onChange={(e) => setClassName(e.target.value)}>
                  {CLASSES.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="c-avatar">Avatar-Symbol (Emoji/Initial)</Label>
                <Input id="c-avatar" value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="⚔️" />
              </div>
            </div>
            <Button variant="gold" type="submit">
              Speichern
            </Button>
          </form>
        </Card>
        <AttributeGrid character={c} />
      </div>
      <Card>
        <CardTitle>Charakterhistorie</CardTitle>
        {history.length === 0 ? (
          <p className="text-sm text-muted">Deine Geschichte beginnt mit der ersten Quest.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {history.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate">{e.note || e.kind}</div>
                  <div className="text-[11px] text-muted">{formatDateTime(e.createdAt)}</div>
                </div>
                <div className={e.xpDelta >= 0 ? "text-gold" : "text-danger"}>
                  {e.xpDelta >= 0 ? "+" : ""}
                  {e.xpDelta} XP
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Einwilligung, dass der KI-Spielleiter Quests, Ziele und Fortschritte lesen darf. */
function AiConsent() {
  const { notify } = useGame();
  const [consent, setConsent] = useState<boolean | null>(null);
  useEffect(() => {
    void supabase
      ?.from("user_settings")
      .select("ai_context_consent")
      .single()
      .then(({ data }) => setConsent(Boolean(data?.ai_context_consent)));
  }, []);
  if (!supabase || consent === null) return null;
  return (
    <Card>
      <CardTitle>KI-Spielleiter – Datenzugriff</CardTitle>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={consent}
          onChange={async (e) => {
            const value = e.target.checked;
            const { error } = await supabase!.from("user_settings").update({ ai_context_consent: value }).not("user_id", "is", null);
            if (error) notify("error", error.message);
            else setConsent(value);
          }}
        />
        <span className="text-muted">
          Der Spielleiter darf meine Quests, Routinen, Fortschritte und Charakterwerte lesen, um Tage zu planen und Vorschläge zu machen. Die Daten werden dafür an die Anthropic API übermittelt. Ohne Freigabe antwortet er nur allgemein.
        </span>
      </label>
    </Card>
  );
}

export function SettingsPage() {
  const { store, run, notify } = useGame();
  const [confirm, setConfirm] = useState("");
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="heading text-2xl">Einstellungen</h1>
      <AiConsent />
      <Card>
        <CardTitle>Speichermodus</CardTitle>
        {store.mode === "local" ? (
          <p className="text-sm text-muted">
            Lokaler Modus: Dein Spielstand liegt nur auf diesem Gerät. Für Sync mit dem iPhone und den KI-Spielleiter trage <code>VITE_SUPABASE_URL</code> und <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code> ein (siehe README).
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">Cloud-Modus (Supabase). Daten werden zwischen Geräten synchronisiert.</span>
            <Button variant="outline" onClick={() => void supabase?.auth.signOut()}>
              <LogOut size={15} /> Abmelden
            </Button>
          </div>
        )}
      </Card>
      <Card>
        <CardTitle>Datenexport</CardTitle>
        <p className="mb-3 text-sm text-muted">Lädt alle deine Spieldaten als JSON-Datei herunter.</p>
        <Button
          onClick={async () => {
            const data = await run((s) => s.exportData());
            if (data) downloadJson(`life-os-export-${new Date().toISOString().slice(0, 10)}.json`, data);
          }}
        >
          <Download size={15} /> Exportieren
        </Button>
      </Card>
      <Card className="border-danger/40">
        <CardTitle className="text-danger">{store.mode === "cloud" ? "Account löschen" : "Spielstand löschen"}</CardTitle>
        <p className="mb-3 text-sm text-muted">Unwiderruflich. Exportiere vorher deine Daten. Tippe zur Bestätigung LÖSCHEN.</p>
        <div className="flex gap-2">
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="LÖSCHEN" className="max-w-40" />
          <Button
            variant="danger"
            disabled={confirm !== "LÖSCHEN"}
            onClick={async () => {
              await run((s) => s.deleteAllData());
              setConfirm("");
              notify("info", "Daten gelöscht.");
            }}
          >
            <Trash2 size={15} /> Endgültig löschen
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    const res = mode === "login" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (res.error) setMsg(res.error.message);
    else if (mode === "signup" && !res.data.session) setMsg("Bestätigungs-E-Mail gesendet. Bitte Link öffnen und dann anmelden.");
  }

  return (
    <div className="grid h-full place-items-center p-6">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="font-display text-3xl tracking-[0.2em] text-gold">LIFE OS</div>
          <div className="text-xs text-muted">{mode === "login" ? "Willkommen zurück, Held." : "Erschaffe deinen Charakter."}</div>
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div>
            <Label htmlFor="a-mail">E-Mail</Label>
            <Input id="a-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="a-pw">Passwort</Label>
            <Input id="a-pw" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {msg && <p className="text-xs text-warning">{msg}</p>}
          <Button variant="gold" className="w-full" disabled={busy}>
            {mode === "login" ? "Anmelden" : "Registrieren"}
          </Button>
        </form>
        <button className="mt-4 w-full text-center text-xs text-electric" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Noch kein Konto? Registrieren" : "Bereits registriert? Anmelden"}
        </button>
      </Card>
    </div>
  );
}
