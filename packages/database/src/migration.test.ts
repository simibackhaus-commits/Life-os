import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { computeReward, levelFromXp, xpToNext } from "@life-os/core";

/**
 * Führt die echten Migrationen gegen Postgres (PGlite, WASM) aus.
 * Supabase-spezifische Teile (auth-Schema, Rollen) werden minimal nachgebildet.
 */
const MIGRATIONS = join(fileURLToPath(new URL(".", import.meta.url)), "../../../supabase/migrations");
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const ev = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

let db: PGlite;

async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(user ? `set role authenticated; set request.jwt.claim.sub = '${user}';` : "reset role;");
  try {
    return await fn();
  } finally {
    await db.exec("reset role; reset request.jwt.claim.sub;");
  }
}

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  }
  await db.exec(`
    grant select, insert, update, delete on all tables in schema public to authenticated;
    revoke update on public.characters from authenticated; grant update (name, avatar, class_name) on public.characters to authenticated;
    revoke update on public.court_cases from authenticated; grant update (plea) on public.court_cases to authenticated;
    revoke insert, update, delete on public.game_events, public.quest_instances, public.shop_purchases from authenticated;
    insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');
  `);
});

describe("SQL-Spielregeln stimmen mit packages/core überein", () => {
  it("xp_to_next / level_from_xp", async () => {
    for (const lvl of [1, 2, 5, 17, 50]) {
      const r = await one<{ v: number }>("select public.xp_to_next($1) as v", [lvl]);
      expect(r.v).toBe(xpToNext(lvl));
    }
    for (const xp of [0, 99, 100, 383, 5000, 123456]) {
      const r = await one<{ v: number }>("select public.level_from_xp($1) as v", [xp]);
      expect(r.v).toBe(levelFromXp(xp).level);
    }
  });
  it("quest_reward_xp + split_attribute_xp", async () => {
    const attrs = ["staerke", "ausdauer", "disziplin"] as const;
    const r = await one<{ xp: number; attr: Record<string, number> }>(
      "select public.quest_reward_xp('schwer','boss') as xp, public.split_attribute_xp($1, public.quest_reward_xp('schwer','boss')) as attr",
      [attrs],
    );
    const ts = computeReward({ difficulty: "schwer", type: "boss", attributes: [...attrs] });
    expect(r.xp).toBe(ts.xp);
    expect(r.attr).toEqual(ts.attributeXp);
  });
});

describe("Questabschlüsse", () => {
  let questId: string;

  beforeAll(async () => {
    const r = await as(USER_A, () =>
      one<{ id: string }>(
        `insert into public.quests (title, type, difficulty, attributes, recurrence, mandatory)
         values ('Zähneputzen', 'daily', 'trivial', '{gesundheit}', $1, true) returning id`,
        [{ freq: "daily", interval: 1, times: ["07:00", "21:00"], startDate: "2026-10-01" }],
      ),
    );
    questId = r.id;
  });

  it("Charakter wird bei Registrierung angelegt", async () => {
    const c = await one<{ n: number }>("select count(*)::int as n from public.characters");
    expect(c.n).toBe(2);
  });

  it("vergibt Belohnung genau einmal (idempotent per Event-ID)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const call = (eventId: string, key: string) =>
      as(USER_A, () =>
        one<{ r: { applied: boolean; reason?: string; xp?: number } }>(
          "select public.complete_quest_instance($1, $2, $3) as r",
          [eventId, questId, key],
        ),
      );
    expect((await call(ev(1), `${today}T07:00`)).r.applied).toBe(true);
    expect((await call(ev(1), `${today}T07:00`)).r).toEqual({ applied: false, reason: "duplicate_event" });
    expect((await call(ev(2), `${today}T07:00`)).r).toEqual({ applied: false, reason: "already_completed" });
    expect((await call(ev(3), `${today}T21:00`)).r.applied).toBe(true);

    const c = await one<{ total_xp: number; coins: number; attribute_xp: Record<string, number> }>(
      "select total_xp::int, coins::int, attribute_xp from public.characters where user_id = $1",
      [USER_A],
    );
    expect(c).toEqual({ total_xp: 10, coins: 2, attribute_xp: { gesundheit: 10 } });
    const events = await one<{ n: number }>("select count(*)::int as n from public.game_events");
    expect(events.n).toBe(2); // der abgelehnte Versuch hinterlässt kein Event
  });

  it("lehnt Vorkommen in der Zukunft ab", async () => {
    await expect(
      as(USER_A, () => db.query("select public.complete_quest_instance($1, $2, '2099-01-01T07:00')", [ev(4), questId])),
    ).rejects.toThrow(/future/);
  });

  it("Rückgängig bucht exakt zurück", async () => {
    const inst = await one<{ id: string }>("select id from public.quest_instances where occurrence_key like '%T21:00'");
    const r = await as(USER_A, () =>
      one<{ r: { applied: boolean } }>("select public.uncomplete_quest_instance($1, $2) as r", [ev(5), inst.id]),
    );
    expect(r.r.applied).toBe(true);
    const c = await one<{ total_xp: number; coins: number }>(
      "select total_xp::int, coins::int from public.characters where user_id = $1",
      [USER_A],
    );
    expect(c).toEqual({ total_xp: 5, coins: 1 });
  });
});

describe("Row Level Security", () => {
  it("Nutzer B sieht keine Daten von A", async () => {
    const r = await as(USER_B, () => db.query("select * from public.quests"));
    expect(r.rows).toHaveLength(0);
    const e = await as(USER_B, () => db.query("select * from public.game_events"));
    expect(e.rows).toHaveLength(0);
  });
  it("Nutzer kann XP/Coins nicht direkt ändern", async () => {
    await expect(as(USER_A, () => db.query("update public.characters set coins = 99999"))).rejects.toThrow(/permission denied/);
    await expect(
      as(USER_A, () => db.query("insert into public.game_events (id, user_id, kind, xp_delta) values ($1, $2, 'manual_adjustment', 9999)", [ev(9), USER_A])),
    ).rejects.toThrow(/permission denied/);
  });
  it("Nutzer kann den Namen ändern", async () => {
    await as(USER_A, () => db.query("update public.characters set name = 'Simi'"));
    const c = await one<{ name: string }>("select name from public.characters where user_id = $1", [USER_A]);
    expect(c.name).toBe("Simi");
  });
  it("Nutzer kann eine Quest nicht selbst auf 'erledigt' setzen", async () => {
    await expect(as(USER_A, () => db.query("update public.quests set status = 'erledigt'"))).rejects.toThrow();
  });
  it("Nutzer kann kein Urteil selbst eintragen", async () => {
    await expect(
      as(USER_A, () => db.query("insert into public.court_cases (charge, verdict) values ('x', 'freispruch')")),
    ).rejects.toThrow(/row-level security/);
    await expect(as(USER_A, () => db.query("select public.apply_court_verdict(gen_random_uuid(), gen_random_uuid(), 'freispruch', 'x', null, '[]', '1')"))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("Gericht", () => {
  it("bucht Urteil, verhindert Doppelbuchung, hebt Urteil auf", async () => {
    const c = await as(USER_A, () =>
      one<{ id: string }>("insert into public.court_cases (charge, quest_xp, quest_coins) values ('Training versäumt', 50, 10) returning id"),
    );
    const cons = JSON.stringify([{ type: "coins_verlust", amount: 1 }]);
    const r1 = await one<{ r: { applied: boolean } }>(
      "select public.apply_court_verdict($1, $2, 'schuldig', 'Begründung', null, $3, '1.0.0') as r",
      [c.id, ev(20), cons],
    );
    expect(r1.r.applied).toBe(true);
    const r2 = await one<{ r: { applied: boolean; reason: string } }>(
      "select public.apply_court_verdict($1, $2, 'schuldig', 'Begründung', null, $3, '1.0.0') as r",
      [c.id, ev(21), cons],
    );
    expect(r2.r).toEqual({ applied: false, reason: "case_closed" });
    let ch = await one<{ coins: number }>("select coins::int from public.characters where user_id = $1", [USER_A]);
    expect(ch.coins).toBe(0);

    await one("select public.revert_court_verdict($1, $2)", [c.id, ev(22)]);
    ch = await one<{ coins: number }>("select coins::int from public.characters where user_id = $1", [USER_A]);
    expect(ch.coins).toBe(1);
  });

  it("verweigert Strafe bei geschütztem Grund und über den Obergrenzen", async () => {
    const c = await as(USER_A, () => one<{ id: string }>("insert into public.court_cases (charge) values ('x') returning id"));
    await expect(
      db.query("select public.apply_court_verdict($1, $2, 'schuldig', 'b', 'krankheit', '[]', '1.0.0')", [c.id, ev(30)]),
    ).rejects.toThrow(/protected/);
    await expect(
      db.query("select public.apply_court_verdict($1, $2, 'schuldig', 'b', null, $3, '1.0.0')", [
        c.id,
        ev(31),
        JSON.stringify([{ type: "coins_verlust", amount: 500 }]),
      ]),
    ).rejects.toThrow(/caps/);
  });
});

describe("Belohnungsshop", () => {
  it("Kauf zieht Coins ab, ist idempotent und prüft das Guthaben", async () => {
    const item = await as(USER_B, () => one<{ id: string }>("insert into public.shop_items (title, cost) values ('Pizza', 30) returning id"));
    await db.query("update public.characters set coins = 50 where user_id = $1", [USER_B]);
    const buy = (e: string) => as(USER_B, () => one<{ r: { applied: boolean; reason?: string; coins_after?: number } }>("select public.purchase_shop_item($1, $2) as r", [e, item.id]));

    expect((await buy(ev(40))).r).toEqual({ applied: true, coins_after: 20 });
    expect((await buy(ev(40))).r).toEqual({ applied: false, reason: "duplicate_event" });
    expect((await buy(ev(41))).r).toEqual({ applied: false, reason: "insufficient_coins" });

    const p = await as(USER_B, () => db.query("select title, cost from public.shop_purchases"));
    expect(p.rows).toEqual([{ title: "Pizza", cost: 30 }]);
  });
  it("Kauf fremder Belohnungen und direkte Käufe sind nicht möglich", async () => {
    const item = await as(USER_B, () => one<{ id: string }>("insert into public.shop_items (title, cost) values ('Kino', 1) returning id"));
    const r = await as(USER_A, () => one<{ r: { reason: string } }>("select public.purchase_shop_item($1, $2) as r", [ev(42), item.id]));
    expect(r.r.reason).toBe("not_found");
    await expect(
      as(USER_B, () => db.query("insert into public.shop_purchases (user_id, title, cost, event_id) values ($1, 'x', 1, $2)", [USER_B, ev(1)])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("Accountlöschung", () => {
  it("löscht alle Daten per Cascade", async () => {
    await as(USER_A, () => db.query("select public.delete_my_account()"));
    for (const t of ["characters", "quests", "game_events", "quest_instances", "court_cases"]) {
      const r = await one<{ n: number }>(`select count(*)::int as n from public.${t} where user_id = $1`, [USER_A]);
      expect(r.n, t).toBe(0);
    }
  });
});
