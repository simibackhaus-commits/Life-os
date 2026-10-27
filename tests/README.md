# Tests

Unit- und Integrationstests liegen direkt neben dem Code (`*.test.ts`) und laufen mit `pnpm test`:

- `packages/core/src/core.test.ts` – Spielregeln
- `packages/database/src/migration.test.ts` – SQL-Migration gegen Postgres (PGlite): RLS, RPCs, Idempotenz
- `packages/api/src/api.test.ts` – LocalStore, Gericht, Outbox
- `supabase/functions/_shared/ai.test.ts` – Validierung der KI-Ausgaben

Dieser Ordner ist für geräteübergreifende End-to-End-Tests (Desktop + iPhone mit demselben Account) ab Phase 2 vorgesehen.
