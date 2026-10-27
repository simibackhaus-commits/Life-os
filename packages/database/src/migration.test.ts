import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ATTRIBUTE_CURVE, DUNGEONS, computeReward, levelFromXp, xpToNext } from "@life-os/core";

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
    revoke update on public.characters from authenticated; grant update (name, avatar, class_name, title) on public.characters to authenticated;
    revoke update on public.court_cases from authenticated; grant update (plea) on public.court_cases to authenticated;
    revoke insert, update, delete on public.game_events, public.quest_instances, public.shop_purchases, public.skills_unlocked, public.focus_sessions from authenticated;
    revoke update on public.finance_entries from authenticated;
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

describe("Skilltree, Boni, Questketten", () => {
  it("attribute_level stimmt mit packages/core überein", async () => {
    for (const xp of [0, 49, 50, 500, 5000, 50000]) {
      const r = await one<{ v: number }>("select public.attribute_level($1) as v", [xp]);
      expect(r.v, `xp ${xp}`).toBe(levelFromXp(xp, ATTRIBUTE_CURVE).level);
    }
  });

  it("Freischalten prüft Reihenfolge, Level und Punkte; Bonus wirkt beim Abschluss", async () => {
    // Nutzer B auf Ausdauer-Level 5 bringen
    await db.query("update public.characters set attribute_xp = jsonb_build_object('ausdauer', 1000) where user_id = $1", [USER_B]);
    const unlock = (id: string) => as(USER_B, () => one<{ r: { ok: boolean; reason?: string } }>("select public.unlock_skill($1) as r", [id]));
    expect((await unlock("ausdauer_2")).r).toEqual({ ok: false, reason: "previous" });
    expect((await unlock("ausdauer_1")).r).toEqual({ ok: true });
    expect((await unlock("ausdauer_1")).r).toEqual({ ok: false, reason: "already" });
    expect((await unlock("ausdauer_2")).r).toEqual({ ok: true });
    expect((await unlock("ausdauer_3")).r).toEqual({ ok: false, reason: "level" });
    expect((await unlock("magie_1")).r).toEqual({ ok: false, reason: "unknown" });

    const q = await as(USER_B, () =>
      one<{ id: string }>("insert into public.quests (title, type, difficulty, attributes) values ('Lauf', 'side', 'schwer', '{ausdauer,staerke}') returning id"),
    );
    const r = await as(USER_B, () => one<{ r: { xp: number; coins: number } }>("select public.complete_quest_instance($1, $2, 'once') as r", [ev(50), q.id]));
    const ts = computeReward({ difficulty: "schwer", type: "side", attributes: ["ausdauer", "staerke"] }, new Set(["ausdauer_1", "ausdauer_2"]));
    expect(r.r.xp).toBe(ts.xp);
    expect(r.r.coins).toBe(ts.coins);
    expect(ts.xp).toBe(58); // 50 + 15 %

    await expect(as(USER_B, () => db.query("insert into public.skills_unlocked (user_id, skill_id) values ($1, 'staerke_1')", [USER_B]))).rejects.toThrow(/permission denied/);
  });

  it("gesperrte Folgequest wird abgelehnt, nach Abschluss der Voraussetzung freigegeben", async () => {
    const a = await as(USER_B, () => one<{ id: string }>("insert into public.quests (title) values ('Kapitel 1') returning id"));
    const b = await as(USER_B, () => one<{ id: string }>("insert into public.quests (title, requires_quest_id) values ('Kapitel 2', $1) returning id", [a.id]));
    const done = (e: string, id: string) => as(USER_B, () => one<{ r: { applied: boolean; reason?: string } }>("select public.complete_quest_instance($1, $2, 'once') as r", [e, id]));
    expect((await done(ev(51), b.id)).r).toEqual({ applied: false, reason: "quest_locked" });
    expect((await done(ev(52), a.id)).r.applied).toBe(true);
    expect((await done(ev(53), b.id)).r.applied).toBe(true);
  });

  it("lifetime_stats zählt nur eigene Daten", async () => {
    const r = await as(USER_B, () => one<{ s: { completions: number; completedTypes: string[]; purchases: number } }>("select public.lifetime_stats() as s"));
    expect(r.s.completions).toBe(3);
    expect(r.s.completedTypes.sort()).toEqual(["side"]);
    expect(r.s.purchases).toBe(1);
  });
});

describe("Module: Finanzen und Sport", () => {
  it("Einzahlung erhöht Sparziel, Löschen verringert es; fremde Ziele sind gesperrt", async () => {
    const g = await as(USER_B, () => one<{ id: string }>("insert into public.goals (title, area, target_value) values ('Notgroschen', 'finanzen', 3000) returning id"));
    const e = await as(USER_B, () =>
      one<{ id: string }>("insert into public.finance_entries (kind, amount, date, goal_id) values ('einzahlung', 250.50, '2026-10-27', $1) returning id", [g.id]),
    );
    await as(USER_B, () => db.query("insert into public.finance_entries (kind, amount, date) values ('ausgabe', 40, '2026-10-27')"));
    let goal = await one<{ v: string }>("select current_value::text as v from public.goals where id = $1", [g.id]);
    expect(goal.v).toBe("250.50");

    await as(USER_B, () => db.query("delete from public.finance_entries where id = $1", [e.id]));
    goal = await one<{ v: string }>("select current_value::text as v from public.goals where id = $1", [g.id]);
    expect(Number(goal.v)).toBe(0);

    await expect(
      as(USER_A, () => db.query("insert into public.finance_entries (kind, amount, date, goal_id) values ('einzahlung', 1, '2026-10-27', $1)", [g.id])),
    ).rejects.toThrow(/row-level security/);
    await expect(as(USER_B, () => db.query("update public.finance_entries set amount = 1"))).rejects.toThrow(/permission denied/);
  });

  it("Trainings sind privat und validiert", async () => {
    await as(USER_B, () => db.query("insert into public.workouts (date, kind, duration_min, distance_km) values ('2026-10-27', 'laufen', 30, 5)"));
    await expect(as(USER_B, () => db.query("insert into public.workouts (date, kind, duration_min) values ('2026-10-27', 'yoga-fliegen', 30)"))).rejects.toThrow();
    const other = await as(USER_A, () => db.query("select * from public.workouts"));
    expect(other.rows).toHaveLength(0);
  });
});

describe("Fokus-Dungeons und Titel", () => {
  const sid = "33333333-3333-4333-8333-333333333333";
  it("dungeon_spec stimmt mit packages/core überein", async () => {
    for (const d of DUNGEONS) {
      const r = await one<{ minutes: number; xp: number; coins: number }>("select * from public.dungeon_spec($1)", [d.id]);
      expect(r).toEqual({ minutes: d.minutes, xp: d.xp, coins: d.coins });
    }
  });

  it("Belohnung erst nach Ablauf der Serverzeit, genau einmal, nur eine Sitzung gleichzeitig", async () => {
    const start = (id: string) => as(USER_B, () => one<{ r: { ok: boolean; reason?: string } }>("select public.start_focus_session($1, 'hoehle', 'intelligenz', 'Bericht') as r", [id]));
    const finish = (e: string) => as(USER_B, () => one<{ r: { applied: boolean; reason?: string; xp?: number } }>("select public.finish_focus_session($1, $2) as r", [sid, e]));
    expect((await start(sid)).r.ok).toBe(true);
    expect((await start("44444444-4444-4444-8444-444444444444")).r).toEqual({ ok: false, reason: "already_running" });
    expect((await finish(ev(60))).r).toEqual({ applied: false, reason: "too_early" });

    const before = await one<{ xp: number }>("select total_xp::int as xp from public.characters where user_id = $1", [USER_B]);
    await db.query("update public.focus_sessions set started_at = now() - interval '25 minutes' where id = $1", [sid]); // Zeit vergehen lassen
    expect((await finish(ev(61))).r).toEqual({ applied: true, xp: 30, coins: 6 });
    expect((await finish(ev(62))).r).toEqual({ applied: false, reason: "not_running" });
    const after = await one<{ xp: number }>("select total_xp::int as xp from public.characters where user_id = $1", [USER_B]);
    expect(after.xp - before.xp).toBe(30);

    await expect(as(USER_B, () => db.query("update public.focus_sessions set started_at = now() - interval '2 hours'"))).rejects.toThrow(/permission denied/);
  });

  it("Titel ist wählbar, XP weiterhin nicht", async () => {
    await as(USER_B, () => db.query("update public.characters set title = 'Sparfuchs'"));
    const r = await one<{ title: string }>("select title from public.characters where user_id = $1", [USER_B]);
    expect(r.title).toBe("Sparfuchs");
    await expect(as(USER_B, () => db.query("update public.characters set total_xp = 99999"))).rejects.toThrow(/permission denied/);
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
