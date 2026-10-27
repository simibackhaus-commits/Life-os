# LIFE OS – Hinweise für Claude

Vor jeder Arbeit lesen: `docs/ROADMAP.md` (Status, nächste Schritte) und `docs/ARCHITEKTUR.md` (Entscheidungen). Nach jeder Sitzung beide aktualisieren (Status FERTIG / IN ARBEIT / GEPLANT / BLOCKIERT, Sitzungsprotokoll).

- Sprache in UI, Kommentaren und Doku: Deutsch.
- Windows/PowerShell-Umgebung; keine macOS-Befehle.
- Spielregeln nur in `packages/core` ändern. Jede Regeländerung, die XP/Coins betrifft, auch in `supabase/migrations` (neue Migration, nie alte ändern) spiegeln; der Paritätstest in `packages/database` muss grün bleiben.
- Gerichtsgrenzen ändern ⇒ `RULEBOOK_VERSION` erhöhen.
- Nichts als „funktioniert" melden, was nicht ausgeführt/getestet wurde (insb. Supabase-live, KI, Tauri-Build, Integrationen).
- Nach Änderungen: `pnpm test` und `pnpm typecheck`; UI-Änderungen im Browser prüfen (`pnpm dev`, Port 1420).
