# Entwicklungsstatus – Abgleich mit dem Masterprompt (Singleplayer · Windows + iPhone · ohne Pflicht-API-Kosten)

Stand: 2026-10-28 (Mobile Edition ergänzt) · Status: **FERTIG** (implementiert und getestet) · **IN ARBEIT** · **GEPLANT** · **BLOCKIERT**
Details und Nachweise: [ROADMAP.md](ROADMAP.md) · Entscheidungen: [ARCHITEKTUR.md](ARCHITEKTUR.md)

## Hardware & KI-Modell (geprüft 2026-10-28)
- PC: Intel i5-12600KF (10 Kerne), 15,8 GB RAM, **NVIDIA RTX 3080 mit 10 GB VRAM**, 220 GB frei.
- Gewähltes lokales Modell: **`qwen3:8b`** über Ollama (≈5 GB, Apache-2.0, gutes Deutsch, strukturierte JSON-Ausgabe). Passt vollständig in den Grafikspeicher.
  Alternativen: `gemma3:12b` (≈8 GB, knapp, Gemma-Lizenz), `qwen3:4b` (schneller, schwächer).
- Ollama ist **noch nicht installiert** → siehe „Nächste Schritte“.
- Gemini Free Tier (optional): Laut Google-Preisseite dürfen Ein- und Ausgaben im kostenlosen Tarif zur Produktverbesserung genutzt werden; Tageskontingente wurden 2025 deutlich gesenkt. Deshalb nur mit ausdrücklicher Zustimmung und Schlüssel ohne Zahlungsmethode.

## Drittanbieterkosten (transparent)
| Dienst | Kosten | Hinweis |
|---|---|---|
| Ollama + Modell | 0 € | läuft lokal, Strom |
| Supabase Free | 0 € | Projekt pausiert nach 7 Tagen Inaktivität; 500 MB DB |
| Netlify (iPhone-Web-App) | 0 € | Free-Tarif |
| Gemini Free Tier | 0 € | optional, Daten dürfen von Google genutzt werden, Kontingente begrenzt |
| Anthropic / OpenAI | kostenpflichtig | standardmäßig aus, in der App nicht wählbar (Edge Function bleibt als spätere Option) |
| Apple Developer Program | 99 €/Jahr | nur für eine echte native iOS-App (App Store/TestFlight); bis dahin PWA bzw. Expo Go |

## Mobile Edition (eigenständige iPhone-App, KI auf dem Gerät) – Stand 2026-10-28
Zielgerät laut Nutzer: iPhone 13/14/15 (ohne Apple Intelligence), iOS 26, kein Mac, kostenlose 7-Tage-Signatur. Architektur: ADR-19, Build: [IPHONE_BUILD.md](IPHONE_BUILD.md).

| Baustein | Status |
|---|---|
| Spielkern offline auf dem iPhone (Quests, XP/Coins, Tagesabschluss, Gericht mit Regelrichter, Rat, Module) | FERTIG (TypeScript, 127 Tests) |
| „Ohne Konto spielen“ – Cloud/Sync freiwillig | FERTIG (Web-Vorschau geprüft) |
| Geräte-KI: Provider, Modellkatalog Qwen3 0.6B/1.7B/4B, Empfehlung nach RAM, Kontextkürzung | FERTIG (Unit-Tests) |
| llama.rn-Anbindung, Modellmanager (Download/Pause/Fortsetzen/Löschen, Speicher), KI-Zentrale mit Leistungstest | IN ARBEIT – typgeprüft, **noch nie auf einem iPhone gelaufen** |
| KI-Chat mit Rollen + Ratssitzung, KI-Gericht auf dem iPhone | IN ARBEIT – Oberfläche in Web-Vorschau geprüft, KI nur im nativen Build |
| Cloud-Build (GitHub Actions → unsignierte IPA) | IN ARBEIT – Workflow geschrieben, noch nie gelaufen (braucht GitHub-Repo des Nutzers) |
| Installation per SideStore | GEPLANT – Einrichtung durch den Nutzer |
| Messung auf dem Zielgerät (Ladezeit, Tokens/s, RAM, Wärme, Akku) | BLOCKIERT bis zur ersten Installation |
| SQLite statt JSON-Speicher, Verschlüsselung, KI-Gedächtnis mit Volltextsuche | GEPLANT |
| Widgets, Live Activities, App Intents, HealthKit | GEPLANT (brauchen native Erweiterungen im Build) |

## Phase 1 – Spielbarer Windows-Kern
| Baustein | Status |
|---|---|
| Monorepo, DB-Schema, RLS, Migrationen | FERTIG |
| Dashboard, Charakter, Questverwaltung, XP/Coins/Level, wiederkehrende Quests | FERTIG |
| Feste Regel-Engine (Belohnungen, Gerichtsgrenzen, Tagesabschluss) | FERTIG |
| Nutzer-Regel-Editor (Abschnitt 18) | GEPLANT |
| Einfaches Gericht + Regelrichter (KI-frei) | FERTIG |
| KI-Provider-Schicht (Ollama, Gemini Free, kostenpflichtig aus) | FERTIG (gegen API-Attrappe getestet) |
| Ollama mit echtem Modell | IN ARBEIT – Installation durch den Nutzer nötig |
| Lokaler KI-Chat mit 12 Rollen | FERTIG (Desktop) |
| Lokale Datenhaltung | FERTIG als JSON im Gerätespeicher; **SQLite GEPLANT** |
| Export | FERTIG · Import/automatische Backups GEPLANT |

## Phase 2 – iPhone und Synchronisierung
| Baustein | Status |
|---|---|
| Expo-App (alle Kernbildschirme), Offline-Warteschlange, Sync über Supabase | FERTIG |
| Nutzung ohne PC: kostenlose Web-App (Netlify, Home-Bildschirm) | FERTIG |
| Echte native iOS-App (App Store/TestFlight) | BLOCKIERT – Apple Developer Program (99 €/Jahr) |
| KI-Einstellungen auf dem iPhone (Gemini Free) | GEPLANT |
| iPhone nutzt Ollama des PCs (sicher: Tailscale/HTTPS + Token) | GEPLANT |

## Phase 3 – Tiefes RPG
| Baustein | Status |
|---|---|
| Skilltrees, Shop, Achievements, Bosskämpfe, Questketten, Streaks | FERTIG |
| KI-Rat (Ratssitzung, ehrlich als ein Modell gekennzeichnet) | FERTIG (Desktop) |
| Gericht mit KI-Richter, Rückfragen, Plädoyers, Berufung, Regelprüfung | FERTIG |
| Inventar & Ausrüstung mit Boni, Richterpersönlichkeiten, Präzedenzfälle, Sammelverfahren | GEPLANT |

## Phase 4 – Life Management
| Baustein | Status |
|---|---|
| Kalender, Tagesabschluss, Fokus-Arena (Dungeons/Pomodoro) | FERTIG |
| Karriere, Fitness, Finanzen (Grundmodule) | FERTIG |
| Tages-/Wochenplanung mit KI, Gewohnheits-Labor, Automatisierungen, Dokumentenarchiv | GEPLANT |

## Phase 5 – Lebendige Spielwelt
| Baustein | Status |
|---|---|
| Hauptquartier, Storysystem, Habit Garden, Saison-Events | FERTIG |
| Stadtkarte mit Gebieten, NPCs, Schicksalssystem, virtuelle Immobilien | GEPLANT |

## Phase 6 – Langfristige Erweiterungen
| Baustein | Status |
|---|---|
| Jahresrückblick | FERTIG |
| Digitales Parallel-Ich, Rat der Zukunft, Buch meines Lebens, Kausalitätsnetzwerk, Integrationen | GEPLANT |

## Nächste Schritte (Reihenfolge)
1. Ollama installieren und `qwen3:8b` laden → in LIFE OS unter Einstellungen → KI aktivieren → Quick-Add, Chat, Rat und Gericht mit echtem Modell prüfen.
2. Migration `20261102000000_free_ai.sql` einspielen (für KI-Gericht im Cloud-Modus).
3. iPhone: KI-Einstellungen (Gemini Free) und Gerichtschat.
4. Regel-Editor (deklarativ, ohne Code-Ausführung).
5. SQLite statt JSON-Speicher, Import und automatische Backups.
6. Inventar/Ausrüstung, Schicksalssystem, Stadtkarte.
