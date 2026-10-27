# Architekturentscheidungen (ADR-Log)

Kurzform: Kontext → Entscheidung → Folgen. Neue Entscheidungen unten anhängen, alte nicht löschen, sondern als „ersetzt durch ADR-x" markieren.

## ADR-1 – Monorepo mit pnpm Workspaces
Desktop, Mobile, Backend-Funktionen und Spielregeln teilen Code. → Ein Repo, Pakete `@life-os/*`, Quellcode-Imports (`main: src/index.ts`) ohne separaten Build-Schritt. Folge: Vite/Vitest/tsc lesen TypeScript direkt; für Deno werden Kern-Dateien kopiert (ADR-7).

## ADR-2 – Spielregeln als reine Funktionen in `packages/core`
XP-Kurve, Belohnungen, Wiederholungen, Streaks, Gerichtsgrenzen müssen überall identisch sein. → Reine, getestete TS-Funktionen ohne I/O. Zod-Schemas sind die einzige Quelle für Typen.
Imports verwenden `.ts`-Endungen (`allowImportingTsExtensions`), damit derselbe Code unverändert in Deno läuft.

## ADR-3 – Server ist Autorität für XP und Coins
„Alle spielentscheidenden Änderungen müssen serverseitig validiert werden." → Clients lesen per RLS, schreiben Quests/Ziele direkt, aber **niemals** Charakterwerte, Ereignisse, Instanzen oder Urteile. Belohnungen berechnet `complete_quest_instance()` in SQL aus der gespeicherten Quest (nicht aus Client-Angaben).
Die SQL-Funktionen spiegeln `packages/core`; `packages/database/src/migration.test.ts` prüft die Parität (Levelkurve, Belohnung, Attributverteilung).

## ADR-4 – Ledger + idempotente Event-IDs
Questabschlüsse dürfen nie doppelt zählen, auch nicht bei Netzabbrüchen. → Jede Aktion erzeugt clientseitig eine UUID; `game_events.id` ist Primärschlüssel; `quest_instances` ist eindeutig pro `(quest_id, occurrence_key)`. Die Charakterzeile wird per `FOR UPDATE` gesperrt (Serialisierung pro Nutzer). Rücknahmen sind Gegenbuchungen, nichts wird gelöscht.

## ADR-5 – Wiederkehrende Quests = Regel + materialisierte Instanzen
Quests speichern eine Wiederholungsregel (`freq`, `interval`, `byWeekday`, `byMonthDay`, `times`). Vorkommen werden berechnet; erst ein Abschluss/eine Entschuldigung materialisiert eine Instanz mit Schlüssel `JJJJ-MM-TT` bzw. `JJJJ-MM-TTTHH:MM`. Morgens/abends = zwei Schlüssel = zwei Abschlüsse. Einmalige Quests nutzen den Schlüssel `once`.
Bekannte Lücke: Der Server prüft das Format und „nicht in der Zukunft", aber noch nicht, ob ein Schlüssel laut Regel tatsächlich geplant ist (→ Roadmap).

## ADR-6 – Zwei Datenspeicher hinter einer Schnittstelle
`DataStore` (packages/api) mit `LocalStore` (Gerät, ohne Konto, gleiche Engine) und `CloudStore` (Supabase). Ohne `VITE_SUPABASE_*` startet die App lokal – sofort nutzbar, keine Fake-Daten. KI-Funktionen melden im lokalen Modus klar „nicht verfügbar" (FeatureUnavailableError) statt erfundener Antworten.
Offline im Cloud-Modus: Abschlüsse gehen in eine Outbox (localStorage) und werden in Reihenfolge mit derselben Event-ID nachgesendet.

## ADR-7 – KI ausschließlich serverseitig (Supabase Edge Functions)
Der Anthropic-Key darf nie in eine App. → `game-master`, `quick-add`, `court` als Edge Functions. Modell `claude-opus-5-5`, `effort` je Aufgabe (low für Quick-Add, medium für Chat/Gericht), serverseitiger Refusal-Fallback (`fallbacks: "default"`). Tool-Ausgaben werden mit denselben Zod-Schemas validiert.
`supabase/functions` ist ein Workspace-Paket nur für Typprüfung/Tests unter Node; Deno löst die Bare-Imports über `deno.json` auf. `scripts/sync-shared.mjs` kopiert `packages/core` nach `_shared/core` (vor Deploy/Typecheck).

## ADR-8 – Gericht: KI urteilt, Regelbasis entscheidet
Das Urteil kommt per Tool `issue_verdict`, wird gegen die versionierte Regelbasis (`RULEBOOK_VERSION`) geprüft, Beträge werden gekappt, Verstöße gehen als Tool-Fehler zurück (max. 3 Versuche), sonst greift der deterministische Regelrichter. Zusätzlich erzwingt `apply_court_verdict()` in SQL die Schutzgründe und absolute Obergrenzen. Berufung wirkt nur zugunsten des Angeklagten; Aufhebung bucht per Gegenbuchung zurück.
Schutz: Krankheit, Verletzung, Regeneration, Notfall → nur Freispruch/Einstellung ohne Konsequenzen; verbotene Inhalte (Fasten, Schlafentzug, Schmerz, Demütigung …) werden abgelehnt.

## ADR-9 – Desktop-UI: Tailwind 4 + shadcn-Stil ohne CLI
shadcn-Komponenten wurden im shadcn-Muster (cva + tailwind-merge + Radix) direkt angelegt, damit keine interaktive CLI nötig ist. Designtokens liegen in `packages/ui-tokens` und werden später für NativeWind wiederverwendet.

## ADR-10 – Datenbanktests ohne Docker
Docker ist auf dem Entwicklungsrechner nicht immer aktiv. → Migrationen werden in Vitest gegen PGlite (Postgres als WASM) mit minimalem `auth`-Stub ausgeführt: Regelparität, Idempotenz, RLS, Spaltenrechte, Gerichtsgrenzen, Accountlöschung. Ersetzt keinen Test gegen echtes Supabase (Realtime, Auth, PostgREST) – der steht in der Roadmap.
