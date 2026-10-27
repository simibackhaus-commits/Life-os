# Roadmap & Entwicklungsstatus

Status: **FERTIG** (implementiert und getestet) · **IN ARBEIT** · **GEPLANT** · **BLOCKIERT**
Letzte Aktualisierung: 2026-10-27 (Sitzung 1)

## Phase 1 – Spielbarer Kern

| Baustein | Status | Nachweis / Hinweis |
|---|---|---|
| Monorepo (pnpm, TS) | FERTIG | `pnpm install`, `pnpm -r typecheck` grün |
| Spielregeln `packages/core` | FERTIG | 23 Tests: Levelkurve, Belohnung, Wiederholung (morgens/abends getrennt), Streaks, Engine-Idempotenz, Gerichtsvalidierung, Regelrichter, Quick-Add-Parser |
| Datenbankschema + RLS + RPCs | FERTIG (lokal getestet) | 14 Tests gegen Postgres (PGlite): Regelparität SQL↔TS, doppelte Event-ID, doppelte Instanz, Zukunftssperre, Rücknahme, RLS, Spaltenrechte, Gerichtsgrenzen, Accountlöschung |
| Datenzugriff `packages/api` (Local/Cloud, Outbox) | FERTIG (Local) / IN ARBEIT (Cloud) | LocalStore + Outbox getestet (4 Tests). CloudStore typgeprüft, **noch nicht gegen echtes Supabase gelaufen** |
| Designsystem (Anthrazit/Gold/Violett/Elektroblau) | FERTIG | `packages/ui-tokens` |
| Windows-Dashboard (3-Spalten-Layout) | FERTIG | Im Browser geprüft: Quick-Add → Vorschau → Quest → Abschluss → Toast/Attribute/Chart; Level-up-Animation |
| Charakter (Level, XP, Coins, Titel, Klasse, Attribute, Historie) | FERTIG | |
| Questverwaltung (Typen, Schwierigkeit, Priorität, Teilaufgaben, Pausieren, Archiv) | FERTIG | |
| Wiederkehrende Quests | FERTIG | |
| Quick-Add mit bearbeitbarer Vorschau | FERTIG (offline) / IN ARBEIT (KI) | Offline-Parser getestet; KI-Function typgeprüft, nicht live getestet |
| Einfaches Gerichtssystem | FERTIG (Regelrichter) / IN ARBEIT (KI) | Lokal im Browser geprüft (Freispruch bei Krankheit, Verwarnung, Berufung); KI-Function typgeprüft + Logiktests, nicht live |
| KI-Spielleiter-Chat | IN ARBEIT | Function + UI fertig, braucht Supabase-Projekt + Anthropic-Key für den Live-Test |
| Authentifizierung (E-Mail/Passwort) | IN ARBEIT | UI + Supabase Auth angebunden, nicht live getestet |
| Tauri-Desktop-Build / Installer | IN ARBEIT | Rust + MSVC Build Tools installiert (2026-10-27), `pnpm desktop:tauri` startet ohne Fehler. `tauri build` erzeugt `LIFE OS_0.1.0_x64-setup.exe` (2,1 MB) und `.msi`. Installation durch den Nutzer noch nicht bestätigt |
| Echtes Supabase (Cloud) | IN ARBEIT | Projekt `askgudcwsfsfooyrslay` (West EU) verknüpft, Migration per `db push` eingespielt, `.env.local` per `scripts/write-env.ps1` erzeugt, App zeigt Login. Registrierung/Sync noch nicht durchgespielt. E-Mail-Bestätigung ist aktiv |
| KI (Anthropic API) | GEPLANT | Bewusst zurückgestellt (keine Zusatzkosten). App nutzt Offline-Parser und Regelrichter |

### Nächste Schritte (Reihenfolge)
1. Rust + C++ Build Tools installieren → `pnpm desktop:tauri` testen → `tauri build` (Installer).
2. Supabase-Projekt anlegen → `db push` → `.env.local` → Registrierung/Login, Abschluss, Realtime zwischen zwei Fenstern testen.
3. `ANTHROPIC_API_KEY` als Secret → `functions:deploy` → Quick-Add, Spielleiter, Gericht live testen.
4. Serverseitige Prüfung, ob ein `occurrence_key` laut Wiederholungsregel geplant ist (ADR-5).
5. Bundle-Splitting (Recharts lazy laden) – derzeit ~860 kB JS.

## Phase 2 – iPhone (GEPLANT)
Expo-App (`apps/mobile`, Expo Router, NativeWind mit `ui-tokens`), Anmeldung (SecureStore, optional Face ID), Quests + Charakter, Sync über `CloudStore`/Outbox, Push-Benachrichtigungen, Gerichtschat, Haptik, animierte Abschlüsse. Test mit demselben Account auf PC + iPhone.

## Phase 3 – RPG-Erweiterungen (GEPLANT)
Skilltrees, Shop (Coins ausgeben, `shop_purchase`-Events), Achievements, Bosskämpfe, Questketten, erweiterte Verhandlungen, Statistiken, Kalender, Business-/Sport-/Finanzmodule (an Questsystem und `goals` gekoppelt). In der Seitenleiste bereits als „P3" sichtbar, aber deaktiviert.

## Phase 4 – Lebendige Spielwelt (GEPLANT)
Hauptquartier, Avatar, Storysystem, Saison-Events, Habit Garden, Fokus-Dungeons, Animationen, externe Integrationen (Google/Outlook/Apple Calendar, Gmail, Strava, Garmin, Apple Health, WhatsApp Business API). Keine Integration gilt als fertig, bevor sie live getestet wurde.

## Sitzungsprotokoll
- **2026-10-27, Sitzung 1:** Monorepo, Kernlogik, Schema/RLS/RPCs, API-Schicht, Desktop-UI, Edge Functions, Doku. 46 automatisierte Tests grün (core 23, database 14, api 4, functions 5). Desktop im Browser end-to-end geprüft.
