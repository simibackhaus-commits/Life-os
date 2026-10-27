-- LIFE OS – Phase 4, Abschnitt 1: Fokus-Dungeons, wählbare Titel
-- Werte der Dungeons spiegeln packages/core/src/world.ts (DUNGEONS).

alter table public.game_events drop constraint game_events_kind_check;
alter table public.game_events add constraint game_events_kind_check
  check (kind in ('quest_completed','quest_uncompleted','court_verdict','court_verdict_reverted',
                  'shop_purchase','manual_adjustment','focus_completed'));

-- Titel ist rein kosmetisch und darf vom Spieler gewählt werden.
grant update (title) on public.characters to authenticated;

create table public.focus_sessions (
  id          uuid primary key,             -- vom Client erzeugt
  user_id     uuid not null references auth.users(id) on delete cascade,
  dungeon     text not null check (dungeon in ('hoehle','turm','abgrund')),
  attribute   text not null check (attribute in ('disziplin','staerke','ausdauer','intelligenz','karriere',
                                                 'finanzen','gesundheit','soziales','ordnung','willenskraft')),
  intent      text not null default '' check (char_length(intent) <= 120),
  minutes     integer not null,
  started_at  timestamptz not null default now(),   -- Serverzeit: der Client kann den Start nicht vordatieren
  finished_at timestamptz,
  status      text not null default 'laufend' check (status in ('laufend','geschafft','abgebrochen')),
  event_id    uuid references public.game_events(id)
);
create index focus_sessions_user_idx on public.focus_sessions(user_id, started_at desc);
-- Höchstens eine laufende Sitzung pro Nutzer
create unique index focus_sessions_one_running on public.focus_sessions(user_id) where status = 'laufend';

alter table public.focus_sessions enable row level security;
create policy own_select on public.focus_sessions for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.focus_sessions from authenticated, anon;

create or replace function public.dungeon_spec(p_dungeon text, out minutes integer, out xp integer, out coins integer)
language sql immutable as $$
  select case p_dungeon when 'hoehle' then 25 when 'turm' then 50 when 'abgrund' then 90 end,
         case p_dungeon when 'hoehle' then 30 when 'turm' then 70 when 'abgrund' then 140 end,
         case p_dungeon when 'hoehle' then 6  when 'turm' then 14 when 'abgrund' then 28 end
$$;

create or replace function public.start_focus_session(p_id uuid, p_dungeon text, p_attribute text, p_intent text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  spec record;
  s public.focus_sessions;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into s from public.focus_sessions where id = p_id;
  if found then
    if s.user_id <> uid then raise exception 'not allowed'; end if;
    return jsonb_build_object('ok', true, 'started_at', s.started_at, 'minutes', s.minutes);   -- idempotent
  end if;
  if exists (select 1 from public.focus_sessions where user_id = uid and status = 'laufend') then
    return jsonb_build_object('ok', false, 'reason', 'already_running');
  end if;
  select * into spec from public.dungeon_spec(p_dungeon);
  if spec.minutes is null then return jsonb_build_object('ok', false, 'reason', 'unknown_dungeon'); end if;
  insert into public.focus_sessions (id, user_id, dungeon, attribute, intent, minutes)
  values (p_id, uid, p_dungeon, p_attribute, left(coalesce(p_intent, ''), 120), spec.minutes)
  returning * into s;
  return jsonb_build_object('ok', true, 'started_at', s.started_at, 'minutes', s.minutes);
end $$;

create or replace function public.finish_focus_session(p_id uuid, p_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s public.focus_sessions;
  spec record;
  v_attr jsonb;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform 1 from public.characters where user_id = uid for update;
  if exists (select 1 from public.game_events where id = p_event_id) then
    return jsonb_build_object('applied', false, 'reason', 'duplicate_event');
  end if;
  select * into s from public.focus_sessions where id = p_id and user_id = uid for update;
  if not found then return jsonb_build_object('applied', false, 'reason', 'not_found'); end if;
  if s.status <> 'laufend' then return jsonb_build_object('applied', false, 'reason', 'not_running'); end if;
  -- Zeitprüfung mit Serveruhr (30 s Toleranz)
  if now() < s.started_at + make_interval(mins => s.minutes) - interval '30 seconds' then
    return jsonb_build_object('applied', false, 'reason', 'too_early');
  end if;

  select * into spec from public.dungeon_spec(s.dungeon);
  v_attr := jsonb_build_object(s.attribute, spec.xp);
  insert into public.game_events (id, user_id, kind, xp_delta, coin_delta, attribute_xp, ref_id, note)
  values (p_event_id, uid, 'focus_completed', spec.xp, spec.coins, v_attr, s.id, s.dungeon);
  update public.focus_sessions set status = 'geschafft', finished_at = now(), event_id = p_event_id where id = s.id;
  update public.characters
     set total_xp = total_xp + spec.xp,
         coins = coins + spec.coins,
         attribute_xp = public.merge_attribute_xp(attribute_xp, v_attr, 1),
         updated_at = now()
   where user_id = uid;
  return jsonb_build_object('applied', true, 'xp', spec.xp, 'coins', spec.coins);
end $$;

create or replace function public.abandon_focus_session(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  update public.focus_sessions set status = 'abgebrochen', finished_at = now()
   where id = p_id and user_id = auth.uid() and status = 'laufend';
  return jsonb_build_object('ok', found);
end $$;

revoke execute on function public.start_focus_session(uuid, text, text, text) from public, anon;
revoke execute on function public.finish_focus_session(uuid, uuid) from public, anon;
revoke execute on function public.abandon_focus_session(uuid) from public, anon;
grant execute on function public.start_focus_session(uuid, text, text, text) to authenticated;
grant execute on function public.finish_focus_session(uuid, uuid) to authenticated;
grant execute on function public.abandon_focus_session(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.focus_sessions;
  end if;
end $$;
