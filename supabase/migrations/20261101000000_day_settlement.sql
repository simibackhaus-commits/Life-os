-- LIFE OS – Tagesabschluss
-- Belohnungen aus Quests und Fokus-Dungeons werden vorgemerkt und erst beim Tagesabschluss gebucht.
-- Bis dahin lassen sich Abschlüsse ohne Nebenwirkungen zurücknehmen; danach ist der Tag geschlossen.
-- Spieltag: Tageswechsel um 04:00 in der Zeitzone des Spielers (user_settings.timezone).

alter table public.game_events add column game_day date;
alter table public.game_events add column settled_at timestamptz default now();
update public.game_events set game_day = (created_at at time zone 'Europe/Berlin')::date, settled_at = created_at where game_day is null;
create index game_events_pending_idx on public.game_events(user_id) where settled_at is null;

create table public.day_settlements (
  user_id     uuid not null references auth.users(id) on delete cascade,
  day         date not null,
  xp          integer not null,
  coins       integer not null,
  completions integer not null,
  level_before integer not null,
  level_after  integer not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.day_settlements enable row level security;
create policy own_select on public.day_settlements for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.day_settlements from authenticated, anon;

-- Aktueller Spieltag eines Nutzers nach Serveruhr
create or replace function public.game_day(p_user uuid)
returns date language sql stable security definer set search_path = public as $$
  select ((now() at time zone coalesce((select timezone from public.user_settings where user_id = p_user), 'Europe/Berlin'))
          - interval '4 hours')::date
$$;
revoke execute on function public.game_day(uuid) from public, anon, authenticated;

-- ───────── Abschluss: nur vormerken ─────────
create or replace function public.complete_quest_instance(
  p_event_id uuid,
  p_quest_id uuid,
  p_occurrence_key text,
  p_due_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  q public.quests;
  ch public.characters;
  inst_id uuid;
  base_xp integer;
  base_coins integer;
  bonus record;
  v_xp integer;
  v_coins integer;
  v_attr jsonb;
  lvl integer;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into ch from public.characters where user_id = uid for update;
  if not found then raise exception 'character missing'; end if;

  if exists (select 1 from public.game_events where id = p_event_id) then
    return jsonb_build_object('applied', false, 'reason', 'duplicate_event');
  end if;

  select * into q from public.quests where id = p_quest_id and user_id = uid;
  if not found then return jsonb_build_object('applied', false, 'reason', 'quest_not_found'); end if;
  if q.status <> 'aktiv' then return jsonb_build_object('applied', false, 'reason', 'quest_inactive'); end if;
  if q.requires_quest_id is not null
     and exists (select 1 from public.quests r where r.id = q.requires_quest_id and r.status <> 'erledigt') then
    return jsonb_build_object('applied', false, 'reason', 'quest_locked');
  end if;
  if (q.recurrence is null) <> (p_occurrence_key = 'once') then
    raise exception 'invalid occurrence key for quest' using errcode = '22023';
  end if;
  if p_occurrence_key <> 'once' and left(p_occurrence_key, 10)::date > (now() + interval '1 day')::date then
    raise exception 'occurrence in the future' using errcode = '22023';
  end if;

  base_xp := public.quest_reward_xp(q.difficulty, q.type);
  base_coins := greatest(1, round(base_xp / 5.0)::integer);
  select * into bonus from public.skill_bonus_pct(uid, q.attributes);
  v_xp := round(base_xp * (100 + bonus.xp_pct) / 100.0)::integer;
  v_coins := round(base_coins * (100 + bonus.coin_pct) / 100.0)::integer;
  v_attr := public.split_attribute_xp(q.attributes, v_xp);

  -- vorgemerkt: settled_at = null
  insert into public.game_events (id, user_id, kind, xp_delta, coin_delta, attribute_xp, note, game_day, settled_at)
  values (p_event_id, uid, 'quest_completed', v_xp, v_coins, v_attr, q.title, public.game_day(uid), null);

  insert into public.quest_instances as qi (user_id, quest_id, occurrence_key, due_at, status, completed_at, event_id)
  values (uid, q.id, p_occurrence_key, p_due_at, 'erledigt', now(), p_event_id)
  on conflict (quest_id, occurrence_key) do update
    set status = 'erledigt', completed_at = now(), event_id = p_event_id
    where qi.status <> 'erledigt'
  returning qi.id into inst_id;

  if inst_id is null then
    delete from public.game_events where id = p_event_id;
    return jsonb_build_object('applied', false, 'reason', 'already_completed');
  end if;
  update public.game_events set ref_id = inst_id where id = p_event_id;

  if p_occurrence_key = 'once' then
    update public.quests set status = 'erledigt', progress = 100, updated_at = now(), version = version + 1 where id = q.id;
  end if;

  lvl := public.level_from_xp(ch.total_xp);
  return jsonb_build_object(
    'applied', true, 'pending', true, 'instance_id', inst_id, 'xp', v_xp, 'coins', v_coins, 'attribute_xp', v_attr,
    'bonus', jsonb_build_object('xpPct', bonus.xp_pct, 'coinPct', bonus.coin_pct),
    'level_before', lvl, 'level_after', lvl
  );
end $$;

-- ───────── Rücknahme: nur solange der Tag offen ist ─────────
create or replace function public.uncomplete_quest_instance(p_event_id uuid, p_instance_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  inst public.quest_instances;
  ev public.game_events;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform 1 from public.characters where user_id = uid for update;
  select * into inst from public.quest_instances where id = p_instance_id and user_id = uid for update;
  if not found or inst.status <> 'erledigt' or inst.event_id is null then
    return jsonb_build_object('applied', false, 'reason', 'not_completed');
  end if;
  select * into ev from public.game_events where id = inst.event_id;
  if ev.settled_at is not null then
    return jsonb_build_object('applied', false, 'reason', 'day_closed');
  end if;

  update public.quest_instances set status = 'offen', completed_at = null, event_id = null where id = inst.id;
  delete from public.game_events where id = ev.id;   -- nie gebucht, daher ersatzlos
  if inst.occurrence_key = 'once' then
    update public.quests set status = 'aktiv', progress = 0, updated_at = now(), version = version + 1 where id = inst.quest_id;
  end if;
  return jsonb_build_object('applied', true);
end $$;

-- ───────── Fokus-Dungeon: ebenfalls vormerken ─────────
create or replace function public.finish_focus_session(p_id uuid, p_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.focus_sessions;
  spec record;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform 1 from public.characters where user_id = uid for update;
  if exists (select 1 from public.game_events where id = p_event_id) then
    return jsonb_build_object('applied', false, 'reason', 'duplicate_event');
  end if;
  select * into s from public.focus_sessions where id = p_id and user_id = uid for update;
  if not found then return jsonb_build_object('applied', false, 'reason', 'not_found'); end if;
  if s.status <> 'laufend' then return jsonb_build_object('applied', false, 'reason', 'not_running'); end if;
  if now() < s.started_at + make_interval(mins => s.minutes) - interval '30 seconds' then
    return jsonb_build_object('applied', false, 'reason', 'too_early');
  end if;
  select * into spec from public.dungeon_spec(s.dungeon);
  insert into public.game_events (id, user_id, kind, xp_delta, coin_delta, attribute_xp, ref_id, note, game_day, settled_at)
  values (p_event_id, uid, 'focus_completed', spec.xp, spec.coins, jsonb_build_object(s.attribute, spec.xp), s.id, s.dungeon, public.game_day(uid), null);
  update public.focus_sessions set status = 'geschafft', finished_at = now(), event_id = p_event_id where id = s.id;
  return jsonb_build_object('applied', true, 'pending', true, 'xp', spec.xp, 'coins', spec.coins);
end $$;

-- ───────── Tagesabschluss ─────────
create or replace function public.settle_days()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date;
  d record;
  ev record;
  ch public.characters;
  lvl_before integer;
  result jsonb := '[]'::jsonb;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into ch from public.characters where user_id = uid for update;
  today := public.game_day(uid);

  for d in
    select game_day as day,
           sum(xp_delta)::integer as xp,
           sum(coin_delta)::integer as coins,
           count(*) filter (where kind = 'quest_completed')::integer as completions
      from public.game_events
     where user_id = uid and settled_at is null and game_day < today
     group by game_day
     order by game_day
  loop
    lvl_before := public.level_from_xp(ch.total_xp);
    for ev in select attribute_xp from public.game_events where user_id = uid and settled_at is null and game_day = d.day loop
      ch.attribute_xp := public.merge_attribute_xp(ch.attribute_xp, ev.attribute_xp, 1);
    end loop;
    ch.total_xp := greatest(0, ch.total_xp + d.xp);
    ch.coins := greatest(0, ch.coins + d.coins);
    update public.game_events set settled_at = now() where user_id = uid and settled_at is null and game_day = d.day;
    insert into public.day_settlements (user_id, day, xp, coins, completions, level_before, level_after)
    values (uid, d.day, d.xp, d.coins, d.completions, lvl_before, public.level_from_xp(ch.total_xp))
    on conflict (user_id, day) do update
      set xp = day_settlements.xp + excluded.xp, coins = day_settlements.coins + excluded.coins,
          completions = day_settlements.completions + excluded.completions, level_after = excluded.level_after;
    result := result || jsonb_build_object('day', d.day, 'xp', d.xp, 'coins', d.coins, 'completions', d.completions,
                                           'levelBefore', lvl_before, 'levelAfter', public.level_from_xp(ch.total_xp));
  end loop;

  if jsonb_array_length(result) > 0 then
    update public.characters
       set total_xp = ch.total_xp, coins = ch.coins, attribute_xp = ch.attribute_xp, updated_at = now()
     where user_id = uid;
  end if;
  return result;
end $$;

revoke execute on function public.settle_days() from public, anon;
grant execute on function public.settle_days() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.day_settlements;
  end if;
end $$;
