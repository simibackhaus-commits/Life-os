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

## ADR-11 – iPhone-App: Expo SDK 58, StyleSheet statt NativeWind
Expo Go unterstützt nur das neueste SDK → SDK 58 (React 19, RN 0.88). Styling über `StyleSheet` + `@life-os/ui-tokens` statt NativeWind (vom Auftrag als „vergleichbare Lösung“ zugelassen): keine Babel-/Tailwind-v3-Sonderkonfiguration im Monorepo, dieselben Farbtokens. Die Desktop-App wurde ebenfalls auf React 19 gehoben, damit nur eine `@types/react`-Version im Workspace existiert.
- Supabase-Sitzung liegt im iOS-Schlüsselbund (SecureStore, in 1,8-KB-Stücke zerlegt wegen des 2-KB-Limits).
- `HydratedStorage` macht AsyncStorage für `LocalStore`/`Outbox` synchron nutzbar (Start: einlesen, danach Hintergrund-Schreiben).
- `crypto.randomUUID` wird für Hermes per `expo-crypto` nachgerüstet (`src/polyfills.ts`, vor dem Router geladen).
- Supabase-URL/anon key kommen aus der gemeinsamen `.env.local` über `app.config.ts → extra`. `LIFE_OS_LOCAL=1` erzwingt den lokalen Modus für UI-Tests.
- Gemeinsame Selektoren (heutige Quests, verpasste Pflichtquests, Streaks) liegen in `packages/api/src/selectors.ts`.
- Erinnerungen sind lokale Benachrichtigungen (funktionieren in Expo Go). Remote-Push folgt mit einem EAS Development Build.

## ADR-12 – Kostenlose iPhone-Nutzung als PWA
Eine native Installation ohne laufenden PC erfordert ein Apple-Developer-Konto (99 €/Jahr). Als kostenlose Lösung wird dieselbe Expo-App per `expo export -p web` (SPA, `web.output: single`) als Progressive Web App gebaut und statisch gehostet (Netlify, `_redirects` für Unterseiten). `public/index.html` enthält Manifest, `apple-touch-icon`, `apple-mobile-web-app-capable` und `viewport-fit=cover`.
Systemdialoge (`Alert` mit Buttons) funktionieren im Web nicht → eigenes `ActionSheet`-Modal. Funktionen ohne Web-Entsprechung (Face ID, Haptik, lokale Erinnerungen) sind dort deaktiviert. Ein späterer Wechsel zur nativen App (EAS) braucht keine Codeänderung.

## ADR-13 – Skilltree mit echter Wirkung, Achievements ohne Tabelle
Skills sollen spürbar sein, aber nicht manipulierbar: Freischalten nur über `unlock_skill()` (prüft Reihenfolge, Attribut-Level, Punkte), die Boni (+5/+10 % XP, +10 % Coins, gedeckelt 25/20 %) rechnet `complete_quest_instance()` serverseitig. Die TS-Formel in `rewards.ts` ist für Vorschau und lokalen Modus und per Paritätstest an SQL gebunden (Rundung: `numeric`, „half away from zero“ wie `Math.round` bei positiven Werten).
Achievements haben keine Spielwirkung und werden deshalb nur berechnet; damit Langzeitziele trotz geladenem Zeitfenster stimmen, liefert `lifetime_stats()` (security invoker → RLS) Gesamtzähler.
Bosskampf = Quest vom Typ `boss`, Trefferpunkte = Teilaufgaben, keine eigene Tabelle. Questketten über `quests.requires_quest_id`; der Server lehnt Abschlüsse gesperrter Quests ab.

## ADR-14 – Lebensbereich-Module ohne eigene Spielwirkung
Business, Sport und Finanzen speichern Aufzeichnungen (`goals`, `workouts`, `finance_entries`), vergeben aber selbst keine XP/Coins – sonst bräuchte jede Eingabe eine eigene Serverprüfung gegen Missbrauch. Die Verbindung zum Spiel läuft über Quests: Projekte/Ziele sammeln Quests (`quests.goal_id`), Trainingspläne und Sparraten erzeugen wiederkehrende Quests, ein erfasstes Training kann heutige Sport-Quests abhaken (über `complete_quest_instance()`).
Einzahlungen erhöhen den Zielstand per Datenbank-Trigger; Buchungen sind unveränderlich (löschen + neu), damit der Stand konsistent bleibt. Delegation ist ein Quest-Feld (`delegated_to`).

## ADR-15 – Fokus-Dungeons mit Serverzeit
Ein Timer im Client lässt sich trivial manipulieren. Deshalb setzt `start_focus_session()` die Startzeit mit der Serveruhr, und `finish_focus_session()` vergibt XP/Coins nur, wenn `now() >= started_at + Dauer − 30 s`. Clients haben keine Schreibrechte auf `focus_sessions`. Ein eindeutiger Teilindex erlaubt höchstens eine laufende Sitzung pro Nutzer. Neue Ereignisart `focus_completed`.
Habit Garden und Titel sind reine Darstellung aus vorhandenen Daten (Serien, Achievements); `characters.title` ist für den Spieler beschreibbar, weil kosmetisch.

## ADR-10 – Datenbanktests ohne Docker
Docker ist auf dem Entwicklungsrechner nicht immer aktiv. → Migrationen werden in Vitest gegen PGlite (Postgres als WASM) mit minimalem `auth`-Stub ausgeführt: Regelparität, Idempotenz, RLS, Spaltenrechte, Gerichtsgrenzen, Accountlöschung. Ersetzt keinen Test gegen echtes Supabase (Realtime, Auth, PostgREST) – der steht in der Roadmap.
