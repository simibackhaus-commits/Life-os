import { useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  Briefcase,
  CalendarDays,
  CalendarHeart,
  Castle,
  Dumbbell,
  Gavel,
  LayoutDashboard,
  Network,
  PiggyBank,
  Plus,
  ScrollText,
  Send,
  Settings,
  ShoppingBag,
  Sprout,
  Swords,
  User,
  Wifi,
  WifiOff,
  Users,
} from "lucide-react";
import type { QuestDraftInput } from "@life-os/core";
import { FeatureUnavailableError } from "@life-os/api";
import { COUNCIL_ROLES, ROLES, type RoleId } from "@life-os/ai";
import { AiStatusLine } from "./AiSettings";
import { missedMandatory, upcoming } from "@life-os/api";
import { cn, formatDateTime } from "@/lib/utils";
import { useGame } from "@/state/GameProvider";
import { Button } from "./ui/button";
import { Badge, Card, CardTitle, Input } from "./ui/primitives";

export type Page = "dashboard" | "hq" | "events" | "quests" | "calendar" | "character" | "skills" | "court" | "council" | "shop" | "dungeons" | "garden" | "career" | "fitness" | "finance" | "stats" | "settings";

const NAV: Array<{ id: Page | null; label: string; icon: ReactNode; phase?: number }> = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
  { id: "hq", label: "Hauptquartier", icon: <Castle size={17} /> },
  { id: "quests", label: "Quests", icon: <ScrollText size={17} /> },
  { id: "calendar", label: "Kalender", icon: <CalendarDays size={17} /> },
  { id: "character", label: "Charakter", icon: <User size={17} /> },
  { id: "skills", label: "Skilltree", icon: <Network size={17} /> },
  { id: "court", label: "Gericht", icon: <Gavel size={17} /> },
  { id: "council", label: "KI-Rat", icon: <Users size={17} /> },
  { id: "shop", label: "Shop", icon: <ShoppingBag size={17} /> },
  { id: "dungeons", label: "Dungeons", icon: <Swords size={17} /> },
  { id: "garden", label: "Garten", icon: <Sprout size={17} /> },
  { id: "events", label: "Events", icon: <CalendarHeart size={17} /> },
  { id: "career", label: "Karriere", icon: <Briefcase size={17} /> },
  { id: "fitness", label: "Fitness", icon: <Dumbbell size={17} /> },
  { id: "finance", label: "Finanzen", icon: <PiggyBank size={17} /> },
  { id: "stats", label: "Statistiken", icon: <BarChart3 size={17} /> },
  { id: "settings", label: "Einstellungen", icon: <Settings size={17} /> },
];

export function Sidebar({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  const { sync, store, snap, today } = useGame();
  const missed = missedMandatory(snap, today).length;
  const openCases = snap.cases.filter((c) => c.status === "offen" || c.status === "verhandlung").length;
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-surface/60">
      <div className="px-5 py-5">
        <div className="font-display text-2xl tracking-[0.2em] text-gold">LIFE OS</div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted">The Real Life RPG</div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map((n) =>
          n.id ? (
            <button
              key={n.label}
              onClick={() => setPage(n.id!)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                page === n.id ? "bg-violet/15 text-text shadow-[inset_2px_0_0_var(--color-gold)]" : "text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              {n.icon}
              <span className="flex-1 text-left">{n.label}</span>
              {n.id === "court" && missed + openCases > 0 && <Badge color="#f87171">{missed + openCases}</Badge>}
            </button>
          ) : (
            <div key={n.label} className="flex items-center gap-3 px-3 py-2 text-sm text-muted/40" title={`Geplant für Phase ${n.phase}`}>
              {n.icon}
              <span className="flex-1">{n.label}</span>
              <span className="text-[9px] uppercase tracking-wider">P{n.phase}</span>
            </div>
          ),
        )}
      </nav>
      <div className="border-t border-border px-4 py-3 text-[11px] text-muted">
        <div className="flex items-center gap-2">
          {sync.state === "offline" || sync.state === "fehler" ? <WifiOff size={13} className="text-warning" /> : <Wifi size={13} className={store.mode === "cloud" ? "text-success" : ""} />}
          {store.mode === "local" ? "Lokaler Modus (nur dieses Gerät)" : `Sync: ${sync.state}${sync.pending ? ` · ${sync.pending} ausstehend` : ""}`}
        </div>
      </div>
    </aside>
  );
}

interface ChatEntry {
  role: "user" | "assistant" | "system";
  text: string;
  proposals?: QuestDraftInput[];
}

const CHAT_ROLES: RoleId[] = ["spielleiter", ...COUNCIL_ROLES];

function GameMasterChat() {
  const { store, run, notify, ai } = useGame();
  const [role, setRole] = useState<RoleId>("spielleiter");
  const [log, setLog] = useState<ChatEntry[]>([
    {
      role: "system",
      text: ai.provider
        ? "Frag z. B. „Plane meinen morgigen Tag“ oder „Ich habe nur 30 Minuten – was ist am wichtigsten?“"
        : "Die KI ist aus. Unter Einstellungen → KI lässt sich Ollama kostenlos einrichten. Alle anderen Funktionen laufen ohne KI.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send() {
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    setLog((l) => [...l, { role: "user", text: msg }]);
    setBusy(true);
    try {
      const r = await store.chat(msg, role);
      setLog((l) => [...l, { role: "assistant", text: r.reply, proposals: r.proposals }]);
    } catch (e) {
      const text = e instanceof FeatureUnavailableError ? e.message : `Fehler: ${e instanceof Error ? e.message : String(e)}`;
      setLog((l) => [...l, { role: "system", text }]);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  async function accept(p: QuestDraftInput, entryIdx: number, pIdx: number) {
    const q = await run((s) => s.createQuest(p));
    if (!q) return;
    notify("info", `Quest „${q.title}" übernommen.`);
    setLog((l) => l.map((e, i) => (i === entryIdx ? { ...e, proposals: e.proposals?.filter((_, j) => j !== pIdx) } : e)));
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <CardTitle className="mb-0">KI-Chat</CardTitle>
        <select className="rounded-md border border-border bg-surface-2 px-1.5 py-1 text-xs" value={role} onChange={(e) => setRole(e.target.value as RoleId)} aria-label="Rolle">
          {CHAT_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLES[r].icon} {ROLES[r].name}
            </option>
          ))}
        </select>
      </div>
      <p className="-mt-1 mb-2 text-[11px]">
        <AiStatusLine />
      </p>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 text-sm">
        {log.map((e, i) => (
          <div key={i} className={cn("rounded-md px-3 py-2", e.role === "user" ? "ml-6 bg-electric/10 text-text" : e.role === "assistant" ? "mr-4 bg-violet/10" : "text-xs text-muted")}>
            <p className="whitespace-pre-wrap">{e.text}</p>
            {e.proposals?.map((p, j) => (
              <div key={j} className="mt-2 flex items-center justify-between gap-2 rounded-sm border border-border bg-bg/50 px-2 py-1.5 text-xs">
                <span className="truncate">{p.title}</span>
                <Button size="sm" variant="gold" onClick={() => void accept(p, i, j)}>
                  Übernehmen
                </Button>
              </div>
            ))}
          </div>
        ))}
        {busy && <div className="text-xs text-muted">{ROLES[role].name} denkt nach… (lokale Modelle brauchen beim ersten Mal etwas länger)</div>}
        <div ref={endRef} />
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Nachricht an: ${ROLES[role].name}…`} disabled={busy} />
        <Button type="submit" variant="violet" size="icon" disabled={busy || !input.trim()} aria-label="Senden">
          <Send size={15} />
        </Button>
      </form>
    </Card>
  );
}

export function RightPanel({ onQuickAdd, goCourt }: { onQuickAdd: () => void; goCourt: () => void }) {
  const { snap, today } = useGame();
  const missed = missedMandatory(snap, today);
  const next = upcoming(snap, today);
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-hidden border-l border-border bg-surface/40 p-3">
      <Button variant="gold" size="lg" onClick={onQuickAdd} className="w-full">
        <Plus size={18} /> Quick-Add
      </Button>
      <Card className="max-h-44 overflow-y-auto">
        <CardTitle>
          <Bell size={14} /> Erinnerungen
        </CardTitle>
        {missed.length === 0 ? (
          <p className="text-xs text-muted">Keine verpassten Pflichtquests.</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {missed.slice(0, 5).map((m) => (
              <li key={m.quest.id + m.key} className="flex items-center justify-between gap-2">
                <span className="truncate text-danger">{m.quest.title}</span>
                <span className="shrink-0 text-muted">{formatDateTime(m.dueAt)}</span>
              </li>
            ))}
            <li>
              <button className="text-electric underline" onClick={goCourt}>
                Zum Gericht →
              </button>
            </li>
          </ul>
        )}
      </Card>
      <Card className="max-h-48 overflow-y-auto">
        <CardTitle>
          <CalendarDays size={14} /> Kommende Termine
        </CardTitle>
        {next.length === 0 ? (
          <p className="text-xs text-muted">Nichts in den nächsten 7 Tagen.</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {next.map((n) => (
              <li key={n.quest.id + n.key} className="flex justify-between gap-2">
                <span className="truncate">{n.quest.title}</span>
                <span className="shrink-0 text-muted">{formatDateTime(n.dueAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <GameMasterChat />
    </aside>
  );
}
