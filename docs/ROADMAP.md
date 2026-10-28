# Roadmap & Entwicklungsstatus

Status: **FERTIG** (implementiert und getestet) · **IN ARBEIT** · **GEPLANT** · **BLOCKIERT**
Letzte Aktualisierung: 2026-10-28

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
| KI-Chat mit 12 Rollen + KI-Rat (Geräte-KI) | FERTIG (Attrappe) / IN ARBEIT (echtes Modell) | ADR-18. `packages/ai` (13 Tests), Desktop im Browser gegen eine Ollama-API-Attrappe geprüft: Quick-Add, Chat-Rollen, Ratssitzung, Gericht mit Rückfrage und gekapptem Urteil. Ollama/qwen3:8b noch nicht installiert |
| Authentifizierung (E-Mail/Passwort) | IN ARBEIT | UI + Supabase Auth angebunden, nicht live getestet |
| Tauri-Desktop-Build / Installer | IN ARBEIT | Rust + MSVC Build Tools installiert (2026-10-27), `pnpm desktop:tauri` startet ohne Fehler. `tauri build` erzeugt `LIFE OS_0.1.0_x64-setup.exe` (2,1 MB) und `.msi`. Installation durch den Nutzer noch nicht bestätigt |
| Echtes Supabase (Cloud) | IN ARBEIT | Projekt `askgudcwsfsfooyrslay` (West EU) verknüpft, Migration per `db push` eingespielt, `.env.local` per `scripts/write-env.ps1` erzeugt, App zeigt Login. Registrierung/Sync noch nicht durchgespielt. E-Mail-Bestätigung ist aktiv |
| KI kostenlos: Ollama (lokal) / Gemini Free Tier (Zustimmung) | IN ARBEIT | Provider-Schicht fertig und getestet; Anthropic/OpenAI nicht wählbar. Migration `20261102000000_free_ai.sql` (court_record/court_decide, 4 DB-Tests inkl. Parität zu VERDICT_LIMITS) **noch nicht eingespielt** |

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
| Web-App für den Home-Bildschirm (PWA, ohne PC nutzbar) | IN ARBEIT | `pnpm web:build` → `apps/mobile/dist`. Lokal geprüft: Login, Unterseiten, Manifest, Icons. Hosting bei Netlify durch Nutzer ausstehend. Ohne Face ID, Haptik, Erinnerungen |
| Remote-Push (Server → iPhone) | GEPLANT | Benötigt Development Build (EAS) + Apple-Developer-Konto; in Expo Go nicht möglich |
| iOS-Build über EAS | GEPLANT | Benötigt Apple-Developer-Konto (99 €/Jahr) |

Edge Functions sind deployt (`--use-api`, ohne Docker). Ohne `ANTHROPIC_API_KEY` urteilt im Cloud-Modus der Regelrichter serverseitig; Spielleiter meldet „KI nicht eingerichtet“.

## Phase 3 – RPG-Erweiterungen (IN ARBEIT)

| Baustein | Status | Nachweis / Hinweis |
|---|---|---|
| Belohnungsshop (eigene Belohnungen, Kauf mit Coins) | FERTIG | Kauf serverseitig über `purchase_shop_item()` (idempotent, Guthabenprüfung, keine Fremdkäufe); Desktop + iPhone; Migration auf Supabase eingespielt (REST-Prüfung) |
| Achievements (16, Bronze bis Legendär) | FERTIG | Aus dem Spielstand + serverseitigen Langzeitzählern (`lifetime_stats()`) |
| Statistiken | FERTIG | Desktop (Recharts) und iPhone (einfache Balken) |
| Skilltree (30 Fähigkeiten, XP-/Coin-Boni) | FERTIG | Boni rechnet der Server in `complete_quest_instance()`; Parität TS↔SQL getestet; Freischalten nur über `unlock_skill()`; Desktop im Browser geprüft |
| Kalender | FERTIG | Desktop: Monatsraster + Tagesliste; iPhone: Wochenleiste + Agenda |
| Bosskämpfe (Trefferpunkte = Teilaufgaben) | FERTIG | Letzter Treffer schließt den Boss ab; Desktop im Browser geprüft (2 Treffer → +200 XP) |
| Questketten (Voraussetzung) | FERTIG | Gesperrte Quests sind ausgeblendet; Server lehnt Abschluss ab (`quest_locked`) |
| Erweiterte Gerichtsverhandlungen | GEPLANT | Braucht größtenteils die KI (zurückgestellt) |
| Finanzen (Sparziele, Meilensteine, Wochenrate, Budget nach Kategorie, Sparraten-Quest) | FERTIG | Einzahlung bucht per Trigger aufs Ziel (DB-Test), Desktop im Browser geprüft (800 € → 25 %-Meilenstein) |
| Sport (Training erfassen, Rekorde, Belastung/Regeneration, Trainingspläne → Quests) | FERTIG | Training kann heutige Sport-Quests mit abhaken; Desktop im Browser geprüft (Kniebeuge-Rekord, +75 XP) |
| Business (Projekte mit Aufgaben, Delegation, Fristen, Führungsroutinen) | FERTIG | Projektfortschritt aus verknüpften Quests; Desktop im Browser geprüft |
| Module auf dem iPhone | FERTIG (Web-Vorschau) | Kompakte Erfassung: Einzahlen/Ausgabe, Training + Quest-Verknüpfung, Projektaufgaben |

## Phase 4 – Lebendige Spielwelt (IN ARBEIT, kostenfrei)

Vorgabe des Nutzers (2026-10-27): vorerst nur Bausteine ohne laufende Kosten (keine KI, kein Apple-Konto, keine Bezahldienste).

| Baustein | Status | Nachweis / Hinweis |
|---|---|---|
| Fokus-Dungeons (25/50/90 min, XP/Coins nach Serverzeit) | FERTIG | `start/finish/abandon_focus_session()`, Startzeit vom Server, max. 1 laufende Sitzung; 3 DB-Tests + Store-Test; Desktop im Browser geprüft (+30 XP); iPhone: Benachrichtigung zum Ende |
| Habit Garden | FERTIG | Pflanzenstufen aus Serien, Welken bei Abbruch; Desktop im Browser geprüft |
| Avatar & wählbare Titel | FERTIG | Titel aus Level und Achievements; Spalte `title` vom Spieler änderbar (rein kosmetisch) |
| Hauptquartier (10 Räume nach Attributen, Burg-Rang, Trophäenhalle) | FERTIG | Rein berechnet, keine Speicherung; Desktop + iPhone im Browser geprüft |
| Storysystem (11 Kapitel, freigeschaltet nach Level) | FERTIG | Personalisiert mit Name und Klasse |
| Saison-Events (12 Monats-Herausforderungen) + Jahresrückblick | FERTIG | Messwerte aus Quests, Trainings, Dungeons, Sparbuchungen; Dashboard- und Startbildschirm-Karte |
| Quest-Editor für alle Tage (Zeit, Wochentage, Start, Fälligkeit) | FERTIG | Desktop: Stift in Questliste und Kalender (auch vergangene/zukünftige Tage), im Browser geprüft. iPhone: Bildschirm `quest/[id]` (Aktionsmenü, Kalender, langes Drücken), typgeprüft |
| Rücknahme abgehakter Quests + Tagesabschluss | FERTIG (lokal) / IN ARBEIT (Cloud) | ADR-17. Engine-, DB- (PGlite) und Store-Tests grün; Desktop im Browser: vorgemerkt → Rücknahme → Abschluss-Übersicht mit Level-up. Migration `20261101000000_day_settlement.sql` **noch nicht eingespielt** |
| Externe Integrationen | GEPLANT | Google Calendar/Strava kostenlos, aber OAuth-Einrichtung durch den Nutzer nötig; Apple Health nur mit nativer App |

Ursprünglicher Umfang:
Hauptquartier, Avatar, Storysystem, Saison-Events, Habit Garden, Fokus-Dungeons, Animationen, externe Integrationen (Google/Outlook/Apple Calendar, Gmail, Strava, Garmin, Apple Health, WhatsApp Business API). Keine Integration gilt als fertig, bevor sie live getestet wurde.

## Sitzungsprotokoll
- **2026-10-28 (2):** Neuer Masterprompt (kostenlose KI, 6 Phasen) abgeglichen → `docs/DEVELOPMENT_STATUS.md`. Hardware geprüft (RTX 3080 10 GB) → `qwen3:8b`. Paket `packages/ai`, KI im LocalStore/CloudStore, KI-Einstellungen, Rollen-Chat, KI-Rat, KI-Gericht mit Regelrichter-Fallback, Tauri-HTTP-Plugin. 122 Tests grün (core 61, ai 13, database 30, api 13, functions 5).
- **2026-10-28:** Spieltag ab 04:00, Vorlage „Alltag & Training“ (54 Quests, Start Mi 04:00), Quest-Editor für beliebige Tage, Rücknahme mit Tagesabschluss (ADR-17). 103 Tests grün (core 61, database 26, api 11, functions 5).
- **2026-10-27, Sitzung 1 (Fortsetzung):** Supabase-Projekt verknüpft und migriert, Windows-Installer gebaut, KI bewusst zurückgestellt (keine API-Kosten). Phase 2 gestartet: Expo-App mit allen Kernbildschirmen, Edge Functions deployt, Desktop auf React 19 gehoben, Selektoren nach `packages/api` verschoben. 47 Tests grün.
- **2026-10-27, Sitzung 1:** Monorepo, Kernlogik, Schema/RLS/RPCs, API-Schicht, Desktop-UI, Edge Functions, Doku. 46 automatisierte Tests grün (core 23, database 14, api 4, functions 5). Desktop im Browser end-to-end geprüft.
