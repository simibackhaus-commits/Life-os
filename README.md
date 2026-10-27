# LIFE OS – The Real Life RPG

Dein echtes Leben als Rollenspiel: Charakter, Quests, XP, LIFE COINS, Streaks, KI-Spielleiter und der „Court of Life".
Monorepo (pnpm Workspaces) für Windows-Desktop (Tauri 2 + React) und iPhone (Expo, ab Phase 2) mit gemeinsamem Supabase-Backend.

> **Stand:** Phase 1 in Arbeit. Was fertig, getestet oder blockiert ist, steht in [docs/ROADMAP.md](docs/ROADMAP.md).
> Architekturentscheidungen: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md).

## Projektstruktur

```
life-os/
  apps/desktop/          Windows-App: React + Vite + Tailwind 4 + Tauri 2 (src-tauri/)
  apps/mobile/           iPhone-App: Expo SDK 58 + Expo Router (Phase 2)
  packages/core/         Spielregeln: Typen, Zod-Validierung, XP-/Levelkurve, Belohnungen,
                         Wiederholungen, Streaks, Gericht-Regelbasis, Quick-Add-Parser, Engine
  packages/database/     Tabellen-Zeilentypen + Mapper; Migrationstests gegen echtes Postgres (PGlite)
  packages/api/          DataStore-Schnittstelle: LocalStore (offline) und CloudStore (Supabase, Realtime, Outbox)
  packages/ui-tokens/    Designsystem (Farben, Tailwind-Theme)
  packages/config/       gemeinsame TypeScript-Konfiguration
  supabase/migrations/   Datenbankschema, RLS, serverseitige Spiel-RPCs
  supabase/functions/    Edge Functions: game-master, quick-add, court (Claude API)
  docs/                  Architektur & Roadmap
  scripts/               Hilfsskripte (sync-shared)
```

## Schnellstart (lokaler Modus, ohne Konto)

```powershell
cd "C:\Users\Anwender\Desktop\second brain\life-os"
pnpm install
pnpm dev
```

Dann <http://localhost:1420> öffnen. Ohne Supabase-Konfiguration läuft die App im **lokalen Modus**: Spielstand im Browser-/WebView-Speicher, Regelrichter statt KI, Offline-Parser für Quick-Add.

Tests und Typprüfung:

```powershell
pnpm test        # alle Pakete (Kernlogik, Datenbank-Migration, API, Edge-Function-Logik)
pnpm typecheck
```

## 1. Voraussetzungen unter Windows prüfen und installieren

Prüfen (PowerShell):

```powershell
node --version; pnpm --version; git --version; rustc --version; cargo --version
```

Installieren, was fehlt (winget ist in Windows 11 enthalten):

| Werkzeug | Zweck | Befehl |
|---|---|---|
| Node.js LTS (≥ 20) | Build, Dev-Server | `winget install OpenJS.NodeJS.LTS` |
| pnpm 9 | Monorepo | `npm install -g pnpm@9` |
| Git | Versionsverwaltung | `winget install Git.Git` |
| VS Code | Editor | `winget install Microsoft.VisualStudioCode` |
| Microsoft C++ Build Tools | Rust-Linker für Tauri | `winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"` |
| Rust (MSVC-Toolchain) | Tauri-Backend | `winget install Rustlang.Rustup` → neues Terminal → `rustup default stable-msvc` |
| WebView2 | Tauri-Renderer | in Windows 11 vorinstalliert |
| Tauri CLI | Desktop-Build | im Projekt enthalten (`pnpm --filter @life-os/desktop tauri …`) |
| Supabase CLI | DB, Functions | im Projekt enthalten (`pnpm supabase …`) |
| Docker Desktop | nur für **lokales** Supabase | `winget install Docker.DockerDesktop` |
| EAS CLI | iOS-Builds (Phase 2) | `npm install -g eas-cli` |

Expo selbst wird pro Projekt über `npx expo` genutzt; auf dem iPhone die App **Expo Go** aus dem App Store installieren (Phase 2).

## 2. Supabase einrichten (Cloud-Modus, Sync, KI)

Variante A – gehostet (empfohlen, kein Docker nötig):

1. Auf <https://supabase.com> ein Projekt anlegen (Region Frankfurt).
2. Im Projektordner:

```powershell
pnpm supabase login
pnpm supabase link --project-ref <DEINE-PROJEKT-REF>
pnpm supabase db push
```

Variante B – lokal (Docker Desktop muss laufen):

```powershell
pnpm supabase start
```

Die Ausgabe enthält `API URL` und `anon key`.

## 3. API-Schlüssel sicher hinterlegen

- **Öffentliche Werte** (dürfen in die App): `.env.example` nach `.env.local` kopieren und ausfüllen:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

  `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API).
- **Geheime Werte** gehören **nie** in `.env.local` oder in die App, sondern als Secret in die Edge Functions:

```powershell
pnpm supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
pnpm functions:deploy
```

`functions:deploy` kopiert vorher die Spielregeln aus `packages/core` nach `supabase/functions/_shared/core`, damit Server und Apps dieselben Regeln verwenden.

## 4. Windows-App starten

Im Browser (schnellste Entwicklung):

```powershell
pnpm dev
```

Als echte Desktop-App (benötigt Rust + C++ Build Tools):

```powershell
pnpm desktop:tauri
```

## 5. Windows-Installer bauen

```powershell
pnpm --filter @life-os/desktop tauri build
```

Ergebnis: `apps/desktop/src-tauri/target/release/bundle/nsis/*.exe` (Setup) und `bundle/msi/*.msi`.
Das App-Icon wird aus `apps/desktop/app-icon.svg` erzeugt: `pnpm --filter @life-os/desktop tauri icon app-icon.svg`.

## 6. iPhone-App mit Expo Go testen

1. Auf dem iPhone **Expo Go** aus dem App Store installieren.
2. PC und iPhone im **selben WLAN**.
3. Auf dem PC:

```powershell
pnpm mobile
```

4. Den QR-Code im Terminal mit der **iPhone-Kamera** scannen → öffnet in Expo Go.
   Fragt die Windows-Firewall nach Node.js: „Zugriff zulassen“ (privates Netzwerk).
   Klappt die Verbindung nicht (z. B. Gäste-WLAN): `pnpm mobile:tunnel`.

## 7. iOS-Build über EAS (später)

Benötigt ein Apple-Developer-Konto (99 €/Jahr). Dann im Ordner `apps/mobile`: `eas login`, `eas build:configure`, `eas build -p ios`. Für echte Remote-Push-Benachrichtigungen ist ein solcher Build nötig.

## 8. Aktualisieren

```powershell
git pull
pnpm install
pnpm supabase db push     # neue Migrationen
pnpm functions:deploy     # geänderte Edge Functions
pnpm test
```

## Sicherheit in Kürze

- Alle XP-/Coin-Änderungen laufen über `SECURITY DEFINER`-Funktionen in Postgres; Clients können Charakterwerte, Ereignisse und Urteile nicht direkt schreiben (RLS + Spaltenrechte, getestet).
- Jeder Questabschluss trägt eine Event-ID → doppelte Gutschriften sind ausgeschlossen, auch bei Wiederholungen aus der Offline-Warteschlange.
- Der Anthropic-Key existiert nur als Supabase-Secret. Der KI-Spielleiter liest Spieldaten nur nach Einwilligung (Einstellungen).
- Datenexport (JSON) und Accountlöschung sind in den Einstellungen.
