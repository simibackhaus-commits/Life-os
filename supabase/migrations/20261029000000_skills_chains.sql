-- LIFE OS – Phase 3, Abschnitt 2: Skilltree mit Boni, Questketten, Langzeitzähler
-- Spiegelt packages/core/src/skills.ts und rewards.ts (Parität per Test geprüft).

-- ───────── Questketten ─────────
alter table public.quests add column requires_quest_id uuid references public.quests(id) on delete set null;

-- ───────── Skilltree ─────────
create table public.skills_unlocked (
  user_id     uuid not null references auth.users(id) on delete cascade,
  skill_id    text not null check (skill_id ~ '^(disziplin|staerke|ausdauer|intelligenz|karriere|finanzen|gesundheit|soziales|ordnung|willenskraft)_[123]$'),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);
alter table public.skills_unlocked enable row level security;
create policy own_select on public.skills_unlocked for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.skills_unlocked from authenticated, anon;

-- Attribut-Level: base 50, exponent 1.3 (ATTRIBUTE_CURVE)
create or replace function public.attribute_level(p_xp bigint)
returns integer language plpgsql immutable as $$
declare
  lvl integer := 1;
  remaining bigint := greatest(p_xp, 0);
begin
  while lvl < 100 and remaining >= round(50 * power(lvl, 1.3))::integer loop
    remaining := remaining - round(50 * power(lvl, 1.3))::integer;
    lvl := lvl + 1;
  end loop;
  return lvl;
end $$;

create or replace function public.unlock_skill(p_skill_id text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ch public.characters;
  attr text;
  tier integer;
  lvl integer;
  spent integer;
  required integer;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_skill_id !~ '^(disziplin|staerke|ausdauer|intelligenz|karriere|finanzen|gesundheit|soziales|ordnung|willenskraft)_[123]$' then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  select * into ch from public.characters where user_id = uid for update;
  attr := split_part(p_skill_id, '_', 1);
  tier := split_part(p_skill_id, '_', 2)::integer;
  required := case tier when 1 then 2 when 2 then 5 else 10 end;

  if exists (select 1 from public.skills_unlocked where user_id = uid and skill_id = p_skill_id) then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  if tier > 1 and not exists (select 1 from public.skills_unlocked where user_id = uid and skill_id = attr || '_' || (tier - 1)) then
    return jsonb_build_object('ok', false, 'reason', 'previous');
  end if;
  lvl := public.attribute_level(coalesce((ch.attribute_xp ->> attr)::bigint, 0));
  if lvl < required then return jsonb_build_object('ok', false, 'reason', 'level'); end if;
  select count(*) into spent from public.skills_unlocked where user_id = uid and skill_id like attr || '\_%';
  if (lvl - 1) - spent < 1 then return jsonb_build_object('ok', false, 'reason', 'points'); end if;

  insert into public.skills_unlocked (user_id, skill_id) values (uid, p_skill_id);
  return jsonb_build_object('ok', true);
end $$;

-- Bonusprozente einer Quest: Stufe 1 +5 % XP, Stufe 2 +10 % XP, Stufe 3 +10 % Coins; Deckel 25 / 20.
create or replace function public.skill_bonus_pct(p_user uuid, p_attributes text[], out xp_pct integer, out coin_pct integer)
language sql stable security definer set search_path = public as $$
  select
    least(25, coalesce(sum(case split_part(s.skill_id, '_', 2) when '1' then 5 when '2' then 10 else 0 end), 0))::integer,
    least(20, coalesce(sum(case split_part(s.skill_id, '_', 2) when '3' then 10 else 0 end), 0))::integer
  from public.skills_unlocked s
  where s.user_id = p_user and split_part(s.skill_id, '_', 1) = any(select distinct unnest(p_attributes))
$$;
revoke execute on function public.skill_bonus_pct(uuid, text[]) from public, anon, authenticated;

-- ───────── Abschluss mit Skill-Boni und Kettensperre (ersetzt die Fassung aus der Init-Migration) ─────────
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
  lvl_before integer;
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

  insert into public.game_events (id, user_id, kind, xp_delta, coin_delta, attribute_xp, note)
  values (p_event_id, uid, 'quest_completed', v_xp, v_coins, v_attr, q.title);

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

  lvl_before := public.level_from_xp(ch.total_xp);
  update public.characters
     set total_xp = characters.total_xp + v_xp,
         coins = characters.coins + v_coins,
         attribute_xp = public.merge_attribute_xp(characters.attribute_xp, v_attr, 1),
         updated_at = now()
   where user_id = uid
  returning * into ch;

  if p_occurrence_key = 'once' then
    update public.quests set status = 'erledigt', progress = 100, updated_at = now(), version = version + 1
     where id = q.id;
  end if;

  return jsonb_build_object(
    'applied', true, 'instance_id', inst_id, 'xp', v_xp, 'coins', v_coins, 'attribute_xp', v_attr,
    'bonus', jsonb_build_object('xpPct', bonus.xp_pct, 'coinPct', bonus.coin_pct),
    'level_before', lvl_before, 'level_after', public.level_from_xp(ch.total_xp)
  );
end $$;

-- ───────── Langzeitzähler für Achievements (läuft mit den Rechten des Nutzers → RLS) ─────────
create or replace function public.lifetime_stats()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'completions', (select count(*) from public.quest_instances where status = 'erledigt'),
    'completedTypes', coalesce((select jsonb_agg(distinct q.type) from public.quest_instances i join public.quests q on q.id = i.quest_id where i.status = 'erledigt'), '[]'::jsonb),
    'earlyBird', (select count(*) from public.quest_instances where status = 'erledigt' and extract(hour from completed_at at time zone 'Europe/Berlin') < 7),
    'purchases', (select count(*) from public.game_events where kind = 'shop_purchase')
  )
$$;

revoke execute on function public.unlock_skill(text) from public, anon;
grant execute on function public.unlock_skill(text) to authenticated;
revoke execute on function public.lifetime_stats() from public, anon;
grant execute on function public.lifetime_stats() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.skills_unlocked;
  end if;
end $$;
