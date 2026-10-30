# Native iPhone-App bauen und installieren (Windows, ohne Mac, ohne Apple-Gebühr)

Ziel: LIFE OS als eigenständige App auf dem iPhone – Spiel, Gericht und KI laufen komplett offline auf dem Gerät.
Der PC wird nur zum Entwickeln gebraucht; gebaut wird auf einem kostenlosen Cloud-Mac von GitHub.

## Ehrliche Einordnung
| Punkt | Stand |
|---|---|
| KI während der Nutzung | **0 €** – Qwen3-Modell läuft per llama.cpp (Metal) auf dem iPhone, nach dem Download offline |
| Bauen | **0 €** – GitHub Actions (macOS-Runner). Öffentliche Repos: unbegrenzt; private Repos: begrenztes Freikontingent (macOS-Minuten zählen zehnfach), reicht für einige Builds pro Monat |
| Installieren | **0 €** mit SideStore + kostenloser Apple-ID. Einschränkung von Apple: Signatur gilt **7 Tage**, max. **3** selbst signierte Apps gleichzeitig, max. 10 App-IDs pro Woche. SideStore erneuert die Signatur auf dem iPhone selbst (nach der Ersteinrichtung ohne PC) |
| Bekanntes Risiko | Auf iOS 26.4 gab es Berichte über fehlschlagende Erneuerungen in SideStore; es gibt Workarounds, aber keine Garantie |
| Bequeme Alternative | Apple Developer Program (99 €/Jahr): TestFlight, 1 Jahr gültig, Updates per Klick. Die KI bleibt trotzdem kostenlos |
| Nicht möglich unter Windows | Xcode, iOS-Simulator, lokales Bauen der iOS-App |

## Einmalige Einrichtung
1. **GitHub-Konto** anlegen (github.com) und ein Repository erstellen, z. B. `life-os`.
   - *Öffentlich*: unbegrenzte Builds, Code ist sichtbar (enthält keine Passwörter; `.env.local` wird nicht hochgeladen).
   - *Privat*: Code bleibt privat, aber nur wenige Builds pro Monat kostenlos.
2. Den Ordner `life-os` hochladen (im Terminal, `<NAME>` = dein GitHub-Name):
   ```
   git remote add origin https://github.com/<NAME>/life-os.git
   git push -u origin master
   ```
   Beim ersten Push öffnet sich das GitHub-Anmeldefenster – Anmeldung dort im Browser, nicht im Terminal.
3. Optional (nur für Sync mit dem PC): unter *Settings → Secrets and variables → Actions* die Secrets `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` anlegen (Werte aus `.env.local`). Ohne sie startet die App rein lokal.
4. **SideStore** nach der offiziellen Anleitung einrichten: https://docs.sidestore.io (Windows wird unterstützt; man braucht den PC nur einmal für die Kopplungsdatei).

## Jeder Build
1. GitHub → Repository → **Actions** → „iPhone-App bauen“ → **Run workflow**.
   Ablauf: Tests auf Linux → iOS-Archiv auf macOS → `LIFE-OS.ipa`. Dauer grob 20–40 Minuten.
2. Nach Abschluss im Lauf unter **Artifacts** `LIFE-OS-ipa` herunterladen (ZIP mit der `.ipa`).
3. Die `.ipa` aufs iPhone bringen (z. B. iCloud Drive / Dateien-App) und in **SideStore → My Apps → +** installieren.
4. In LIFE OS: **Einstellungen → KI-Zentrale** → empfohlenes Modell herunterladen (WLAN) → **Leistungstest**.

## Fehlerbehebung
- **SideStore meldet ein Problem mit Berechtigungen (Entitlements):** Workflow erneut starten mit `memory_entitlements = 0`. Die KI läuft dann mit weniger Arbeitsspeicher – das 0.6B- oder 1.7B-Modell wählen.
- **App stürzt beim Laden des Modells ab:** kleineres Modell wählen (Eco). Das 4B-Modell braucht ein Gerät mit 6 GB RAM.
- **Build schlägt fehl:** im Actions-Lauf den roten Schritt öffnen und die letzten Zeilen kopieren – damit lässt sich der Fehler beheben.

## Messwerte vom Zielgerät
| Datum | Gerät | Modell | Laden | Tokens/s | Bemerkung |
|---|---|---|---|---|---|
| 2026-10-30 | iPhone 14 (6 GB, iOS 26) | Qwen3 1.7B (Balanced) | 20,5 s (erster Start) | 16,1 | Installation per SideStore erfolgreich; Wärme/Akku noch nicht bewertet. Seitdem lädt die App das Modell 3 s nach dem Start im Hintergrund vor |
