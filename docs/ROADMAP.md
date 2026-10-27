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

## Phase 2 – iPhone (IN ARBEIT)

| Baustein | Status | Nachweis / Hinweis |
|---|---|---|
| Expo-App (SDK 58, Expo Router, Tabs) | FERTIG | `tsc` grün, `expo-doctor` 20/20, läuft auf dem iPhone in Expo Go (2026-10-27) |
| Startseite (Level, XP, Coins, Tagesquests, Hauptquest, Schnellaktionen) | FERTIG | In Web-Vorschau (375×812) geprüft |
| Quick-Add mit bearbeitbarer Vorschau, Spracheingabe über iOS-Tastaturdiktat | FERTIG | Web-Vorschau: Zähneputzen → 2 Instanzen |
| Questabschluss mit Animation + Haptik, Rücknahme per langem Drücken | FERTIG (Web) | Haptik nur auf dem Gerät prüfbar |
| Charakter, Gericht (Plädoyer, Urteil, Berufung, Chat im Cloud-Modus), Einstellungen | FERTIG (Web) | |
| Anmeldung (Supabase, Sitzung im iOS-Schlüsselbund via SecureStore) | IN ARBEIT | Login-Seite geprüft; echter Login auf iPhone ausstehend |
| Optionale Face-ID-Sperre | IN ARBEIT | Nur auf dem Gerät testbar |
| Lokale Erinnerungen (expo-notifications) | IN ARBEIT | Nur auf dem Gerät testbar |
| Offline-Warteschlange + Nachsenden bei Netz (NetInfo) | IN ARBEIT | Logik getestet (Outbox, HydratedStorage), Gerät ausstehend |
| Sync PC ↔ iPhone mit demselben Account | IN ARBEIT | Nutzer-Test ausstehend |
| Remote-Push (Server → iPhone) | GEPLANT | Benötigt Development Build (EAS) + Apple-Developer-Konto; in Expo Go nicht möglich |
| iOS-Build über EAS | GEPLANT | Benötigt Apple-Developer-Konto (99 €/Jahr) |

Edge Functions sind deployt (`--use-api`, ohne Docker). Ohne `ANTHROPIC_API_KEY` urteilt im Cloud-Modus der Regelrichter serverseitig; Spielleiter meldet „KI nicht eingerichtet“.

## Phase 3 – RPG-Erweiterungen (GEPLANT)
Skilltrees, Shop (Coins ausgeben, `shop_purchase`-Events), Achievements, Bosskämpfe, Questketten, erweiterte Verhandlungen, Statistiken, Kalender, Business-/Sport-/Finanzmodule (an Questsystem und `goals` gekoppelt). In der Seitenleiste bereits als „P3" sichtbar, aber deaktiviert.

## Phase 4 – Lebendige Spielwelt (GEPLANT)
Hauptquartier, Avatar, Storysystem, Saison-Events, Habit Garden, Fokus-Dungeons, Animationen, externe Integrationen (Google/Outlook/Apple Calendar, Gmail, Strava, Garmin, Apple Health, WhatsApp Business API). Keine Integration gilt als fertig, bevor sie live getestet wurde.

## Sitzungsprotokoll
- **2026-10-27, Sitzung 1 (Fortsetzung):** Supabase-Projekt verknüpft und migriert, Windows-Installer gebaut, KI bewusst zurückgestellt (keine API-Kosten). Phase 2 gestartet: Expo-App mit allen Kernbildschirmen, Edge Functions deployt, Desktop auf React 19 gehoben, Selektoren nach `packages/api` verschoben. 47 Tests grün.
- **2026-10-27, Sitzung 1:** Monorepo, Kernlogik, Schema/RLS/RPCs, API-Schicht, Desktop-UI, Edge Functions, Doku. 46 automatisierte Tests grün (core 23, database 14, api 4, functions 5). Desktop im Browser end-to-end geprüft.
