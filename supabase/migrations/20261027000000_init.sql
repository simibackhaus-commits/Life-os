-- LIFE OS – Phase 1 Grundschema
-- Prinzip: Clients lesen ihre Daten per RLS direkt. Alles, was XP/Coins verändert,
-- läuft ausschließlich über SECURITY-DEFINER-Funktionen (serverseitige Validierung).

-- ───────────────────────── Tabellen ─────────────────────────

create table public.characters (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  name         text not null default 'Held' check (char_length(name) between 1 and 60),
  title        text not null default 'Neuling',
  class_name   text not null default 'Abenteurer',
  avatar       text not null default '',
  total_xp     bigint not null default 0 check (total_xp >= 0),
  coins        bigint not null default 0 check (coins >= 0),
  attribute_xp jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

create table public.user_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  ai_context_consent boolean not null default false,
  timezone           text not null default 'Europe/Berlin',
  updated_at         timestamptz not null default now()
);

create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 160),
  description   text not null default '',
  area          text not null default 'allgemein',
  target_value  numeric,
  current_value numeric not null default 0,
  unit          text,
  due_date      date,
  status        text not null default 'aktiv' check (status in ('aktiv','pausiert','erledigt','archiviert')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.quests (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 160),
  description       text not null default '' check (char_length(description) <= 4000),
  type              text not null default 'side'
                    check (type in ('daily','weekly','main','side','epic','legendary','hidden','boss')),
  category          text not null default 'allgemein',
  difficulty        text not null default 'mittel'
                    check (difficulty in ('trivial','leicht','mittel','schwer','episch')),
  priority          smallint not null default 3 check (priority between 1 and 5),
  attributes        text[] not null default '{}'
                    check (attributes <@ array['disziplin','staerke','ausdauer','intelligenz','karriere',
                                               'finanzen','gesundheit','soziales','ordnung','willenskraft']
                           and cardinality(attributes) <= 4),
  due_at            timestamptz,
  recurrence        jsonb,
  estimated_minutes integer check (estimated_minutes between 0 and 1440),
  subtasks          jsonb not null default '[]'::jsonb,
  goal_id           uuid references public.goals(id) on delete set null,
  proof_required    boolean not null default false,
  mandatory         boolean not null default false,
  consequences      text not null default '',
  -- 'erledigt' wird nur serverseitig gesetzt (Abschluss einer einmaligen Quest)
  status            text not null default 'aktiv' check (status in ('aktiv','pausiert','erledigt','archiviert')),
  progress          smallint not null default 0 check (progress between 0 and 100),
  version           integer not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index quests_user_idx on public.quests(user_id, status);

create table public.game_events (
  id           uuid primary key,             -- vom Client erzeugt => idempotent
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('quest_completed','quest_uncompleted','court_verdict',
                                             'court_verdict_reverted','shop_purchase','manual_adjustment')),
  xp_delta     integer not null default 0,
  coin_delta   integer not null default 0,
  attribute_xp jsonb not null default '{}'::jsonb,
  ref_id       uuid,
  note         text not null default '',
  created_at   timestamptz not null default now()
);
create index game_events_user_idx on public.game_events(user_id, created_at desc);

create table public.quest_instances (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  quest_id       uuid not null references public.quests(id) on delete cascade,
  occurrence_key text not null check (occurrence_key ~ '^(once|\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?)$'),
  due_at         timestamptz,
  status         text not null default 'offen' check (status in ('offen','erledigt','verpasst','entschuldigt')),
  completed_at   timestamptz,
  event_id       uuid references public.game_events(id),
  unique (quest_id, occurrence_key)
);
create index quest_instances_user_idx on public.quest_instances(user_id, completed_at desc);

create table public.court_cases (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quest_id         uuid references public.quests(id) on delete set null,
  occurrence_key   text,
  charge           text not null check (char_length(charge) between 1 and 500),
  status           text not null default 'offen'
                   check (status in ('offen','verhandlung','urteil','berufung','aufgehoben')),
  plea             text check (plea in ('schuldig','nicht_schuldig','teilweise_schuldig')),
  verdict          text check (verdict in ('freispruch','einstellung','verwarnung','teilschuld','schuldig_mildernd','schuldig')),
  reasoning        text,
  protected_reason text check (protected_reason in ('krankheit','verletzung','regeneration','notfall')),
  consequences     jsonb not null default '[]'::jsonb,
  rulebook_version text,
  quest_xp         integer not null default 0,
  quest_coins      integer not null default 0,
  verdict_event_id uuid references public.game_events(id),
  appeal_count     smallint not null default 0,
  created_at       timestamptz not null default now(),
  decided_at       timestamptz
);
create index court_cases_user_idx on public.court_cases(user_id, created_at desc);

create table public.court_messages (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.court_cases(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role       text not null check (role in ('angeklagter','richter','staatsanwalt','verteidiger','system')),
  content    text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index court_messages_case_idx on public.court_messages(case_id, created_at);

create table public.ai_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null check (char_length(content) between 1 and 8000),
  created_at timestamptz not null default now()
);
create index ai_messages_user_idx on public.ai_messages(user_id, created_at desc);

-- ───────────────────────── Spielregeln (Spiegel von packages/core) ─────────────────────────

create or replace function public.xp_to_next(p_level integer)
returns integer language sql immutable as $$
  select round(100 * power(p_level, 1.5))::integer
$$;

create or replace function public.level_from_xp(p_xp bigint)
returns integer language plpgsql immutable as $$
declare
  lvl integer := 1;
  remaining bigint := greatest(p_xp, 0);
begin
  while lvl < 200 and remaining >= public.xp_to_next(lvl) loop
    remaining := remaining - public.xp_to_next(lvl);
    lvl := lvl + 1;
  end loop;
  return lvl;
end $$;

create or replace function public.quest_reward_xp(p_difficulty text, p_type text)
returns integer language sql immutable as $$
  select round(
    (case p_difficulty when 'trivial' then 5 when 'leicht' then 10 when 'mittel' then 25
                       when 'schwer' then 50 when 'episch' then 100 end)
    * (case p_type when 'daily' then 1 when 'weekly' then 1.5 when 'main' then 2 when 'side' then 1
                   when 'epic' then 3 when 'legendary' then 5 when 'hidden' then 1.5 when 'boss' then 4 end)
  )::integer
$$;

-- Verteilt XP ganzzahlig auf die (deduplizierten) Attribute; Rest an das erste.
create or replace function public.split_attribute_xp(p_attributes text[], p_xp integer)
returns jsonb language plpgsql immutable as $$
declare
  attrs text[] := '{}';
  a text;
  share integer;
  result jsonb := '{}'::jsonb;
  i integer := 0;
begin
  foreach a in array coalesce(p_attributes, '{}') loop
    if not a = any(attrs) then attrs := attrs || a; end if;
  end loop;
  if cardinality(attrs) = 0 then return result; end if;
  share := p_xp / cardinality(attrs);
  foreach a in array attrs loop
    i := i + 1;
    result := result || jsonb_build_object(a, share + case when i = 1 then p_xp - share * cardinality(attrs) else 0 end);
  end loop;
  return result;
end $$;

create or replace function public.merge_attribute_xp(p_base jsonb, p_delta jsonb, p_sign integer)
returns jsonb language sql immutable as $$
  select coalesce(p_base, '{}'::jsonb) || coalesce((
    select jsonb_object_agg(key, greatest(0, coalesce((p_base->>key)::integer, 0) + p_sign * value::integer))
    from jsonb_each_text(p_delta)
  ), '{}'::jsonb)
$$;

-- ───────────────────────── Spielaktionen (RPC) ─────────────────────────

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
  v_xp integer;
  v_coins integer;
  v_attr jsonb;
  lvl_before integer;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  -- Charakterzeile sperren: serialisiert parallele Abschlüsse desselben Nutzers.
  select * into ch from public.characters where user_id = uid for update;
  if not found then raise exception 'character missing'; end if;

  if exists (select 1 from public.game_events where id = p_event_id) then
    return jsonb_build_object('applied', false, 'reason', 'duplicate_event');
  end if;

  select * into q from public.quests where id = p_quest_id and user_id = uid;
  if not found then return jsonb_build_object('applied', false, 'reason', 'quest_not_found'); end if;
  if q.status <> 'aktiv' then return jsonb_build_object('applied', false, 'reason', 'quest_inactive'); end if;

  if (q.recurrence is null) <> (p_occurrence_key = 'once') then
    raise exception 'invalid occurrence key for quest' using errcode = '22023';
  end if;
  -- Keine Abschlüsse für Vorkommen, die mehr als einen Tag in der Zukunft liegen.
  if p_occurrence_key <> 'once' and left(p_occurrence_key, 10)::date > (now() + interval '1 day')::date then
    raise exception 'occurrence in the future' using errcode = '22023';
  end if;

  v_xp := public.quest_reward_xp(q.difficulty, q.type);
  v_coins := greatest(1, round(v_xp / 5.0)::integer);
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
    -- Bereits erledigt: Event wieder entfernen (gleiche Transaktion), nichts gutschreiben.
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
    'level_before', lvl_before, 'level_after', public.level_from_xp(ch.total_xp)
  );
end $$;

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

  if exists (select 1 from public.game_events where id = p_event_id) then
    return jsonb_build_object('applied', false, 'reason', 'duplicate_event');
  end if;
  select * into inst from public.quest_instances where id = p_instance_id and user_id = uid;
  if not found or inst.status <> 'erledigt' or inst.event_id is null then
    return jsonb_build_object('applied', false, 'reason', 'not_completed');
  end if;
  select * into ev from public.game_events where id = inst.event_id;

  insert into public.game_events (id, user_id, kind, xp_delta, coin_delta, attribute_xp, ref_id, note)
  values (p_event_id, uid, 'quest_uncompleted', -ev.xp_delta, -ev.coin_delta, ev.attribute_xp, inst.id, ev.note);

  update public.quest_instances set status = 'offen', completed_at = null, event_id = null where id = inst.id;
  update public.characters
     set total_xp = greatest(0, total_xp - ev.xp_delta),
         coins = greatest(0, coins - ev.coin_delta),
         attribute_xp = public.merge_attribute_xp(attribute_xp, ev.attribute_xp, -1),
         updated_at = now()
   where user_id = uid;
  if inst.occurrence_key = 'once' then
    update public.quests set status = 'aktiv', progress = 0, updated_at = now(), version = version + 1
     where id = inst.quest_id;
  end if;
  return jsonb_build_object('applied', true);
end $$;

-- Wird nur von der Edge Function "court" (service_role) aufgerufen, NACH Validierung gegen die Regelbasis.
create or replace function public.apply_court_verdict(
  p_case_id uuid,
  p_event_id uuid,
  p_verdict text,
  p_reasoning text,
  p_protected_reason text,
  p_consequences jsonb,
  p_rulebook_version text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.court_cases;
  xp_d integer := 0;
  coin_d integer := 0;
begin
  select * into c from public.court_cases where id = p_case_id for update;
  if not found then raise exception 'case not found'; end if;
  if c.status not in ('offen','verhandlung','berufung') then
    return jsonb_build_object('applied', false, 'reason', 'case_closed');
  end if;
  if p_protected_reason is not null and p_verdict not in ('freispruch','einstellung') then
    raise exception 'protected reason requires acquittal or dismissal';
  end if;

  select coalesce(sum(case when e->>'type' = 'xp_abzug' then -(e->>'amount')::integer else 0 end), 0),
         coalesce(sum(case when e->>'type' = 'coins_verlust' then -(e->>'amount')::integer else 0 end), 0)
    into xp_d, coin_d
    from jsonb_array_elements(p_consequences) e;
  -- Harte Obergrenzen (Spiegel von ABSOLUTE_CAPS)
  if xp_d < -50 or coin_d < -100 then raise exception 'consequence exceeds caps'; end if;

  perform 1 from public.characters where user_id = c.user_id for update;
  insert into public.game_events (id, user_id, kind, xp_delta, coin_delta, ref_id, note)
  values (p_event_id, c.user_id, 'court_verdict', xp_d, coin_d, c.id, p_verdict)
  on conflict (id) do nothing;
  if not found then return jsonb_build_object('applied', false, 'reason', 'duplicate_event'); end if;

  update public.characters
     set total_xp = greatest(0, total_xp + xp_d), coins = greatest(0, coins + coin_d), updated_at = now()
   where user_id = c.user_id;
  update public.court_cases
     set status = 'urteil', verdict = p_verdict, reasoning = p_reasoning, protected_reason = p_protected_reason,
         consequences = p_consequences, rulebook_version = p_rulebook_version,
         verdict_event_id = p_event_id, decided_at = now()
   where id = c.id;
  if c.quest_id is not null and c.occurrence_key is not null and p_protected_reason is not null then
    insert into public.quest_instances (user_id, quest_id, occurrence_key, status)
    values (c.user_id, c.quest_id, c.occurrence_key, 'entschuldigt')
    on conflict (quest_id, occurrence_key) do update set status = 'entschuldigt'
      where quest_instances.status in ('offen','verpasst');
  end if;
  return jsonb_build_object('applied', true, 'xp_delta', xp_d, 'coin_delta', coin_d);
end $$;

-- Hebt ein Urteil auf (Berufung erfolgreich oder Fehlurteil) und bucht die Konsequenzen zurück.
create or replace function public.revert_court_verdict(p_case_id uuid, p_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.court_cases;
  ev public.game_events;
begin
  select * into c from public.court_cases where id = p_case_id for update;
  if not found or c.verdict_event_id is null then
    return jsonb_build_object('applied', false, 'reason', 'no_verdict');
  end if;
  select * into ev from public.game_events where id = c.verdict_event_id;
  perform 1 from public.characters where user_id = c.user_id for update;
  insert into public.game_events (id, user_id, kind, xp_delta, coin_delta, ref_id, note)
  values (p_event_id, c.user_id, 'court_verdict_reverted', -ev.xp_delta, -ev.coin_delta, c.id, 'Urteil aufgehoben')
  on conflict (id) do nothing;
  if not found then return jsonb_build_object('applied', false, 'reason', 'duplicate_event'); end if;
  update public.characters
     set total_xp = greatest(0, total_xp - ev.xp_delta), coins = greatest(0, coins - ev.coin_delta), updated_at = now()
   where user_id = c.user_id;
  update public.court_cases set status = 'aufgehoben', verdict_event_id = null where id = c.id;
  return jsonb_build_object('applied', true);
end $$;

-- Accountlöschung (DSGVO): löscht den Auth-Nutzer, alle Daten folgen per ON DELETE CASCADE.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Neue Nutzer bekommen automatisch Charakter + Einstellungen.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.characters (user_id) values (new.id) on conflict do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at + Versionszähler für Konflikterkennung (last-write-wins mit Versionsprüfung im Client)
create or replace function public.touch_row()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_table_name = 'quests' then new.version := old.version + 1; end if;
  return new;
end $$;

create trigger quests_touch before update on public.quests for each row execute function public.touch_row();
create trigger goals_touch before update on public.goals for each row execute function public.touch_row();

-- Clients dürfen den Status 'erledigt' nicht selbst setzen (sonst Quest ohne Belohnungslogik schließen).
create or replace function public.guard_quest_status()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' and new.status = 'erledigt' and old.status is distinct from 'erledigt' then
    raise exception 'quest completion must use complete_quest_instance()';
  end if;
  return new;
end $$;
create trigger quests_guard before update on public.quests for each row execute function public.guard_quest_status();

-- ───────────────────────── Row Level Security ─────────────────────────

alter table public.characters      enable row level security;
alter table public.user_settings   enable row level security;
alter table public.goals           enable row level security;
alter table public.quests          enable row level security;
alter table public.game_events     enable row level security;
alter table public.quest_instances enable row level security;
alter table public.court_cases     enable row level security;
alter table public.court_messages  enable row level security;
alter table public.ai_messages     enable row level security;

create policy own_select on public.characters      for select to authenticated using (user_id = auth.uid());
create policy own_update on public.characters      for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all    on public.user_settings   for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all    on public.goals           for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all    on public.quests          for all    to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and status <> 'erledigt');
create policy own_select on public.game_events     for select to authenticated using (user_id = auth.uid());
create policy own_select on public.quest_instances for select to authenticated using (user_id = auth.uid());
create policy own_select on public.court_cases     for select to authenticated using (user_id = auth.uid());
create policy own_insert on public.court_cases     for insert to authenticated with check (user_id = auth.uid() and status = 'offen' and verdict is null);
create policy own_update on public.court_cases     for update to authenticated using (user_id = auth.uid());
create policy own_select on public.court_messages  for select to authenticated using (user_id = auth.uid());
create policy own_insert on public.court_messages  for insert to authenticated
  with check (user_id = auth.uid() and role = 'angeklagter'
              and exists (select 1 from public.court_cases c where c.id = case_id and c.user_id = auth.uid()));
create policy own_select on public.ai_messages     for select to authenticated using (user_id = auth.uid());
create policy own_insert on public.ai_messages     for insert to authenticated with check (user_id = auth.uid() and role = 'user');
create policy own_delete on public.ai_messages     for delete to authenticated using (user_id = auth.uid());

-- Spaltenrechte: spielrelevante Felder sind für Clients schreibgeschützt.
revoke update on public.characters from authenticated, anon;
grant update (name, avatar, class_name) on public.characters to authenticated;
revoke update on public.court_cases from authenticated, anon;
grant update (plea) on public.court_cases to authenticated;
revoke insert, update, delete on public.game_events, public.quest_instances from authenticated, anon;

revoke execute on function public.apply_court_verdict(uuid, uuid, text, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.revert_court_verdict(uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_court_verdict(uuid, uuid, text, text, text, jsonb, text) to service_role;
grant execute on function public.revert_court_verdict(uuid, uuid) to service_role;
revoke execute on function public.complete_quest_instance(uuid, uuid, text, timestamptz) from public, anon;
revoke execute on function public.uncomplete_quest_instance(uuid, uuid) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.complete_quest_instance(uuid, uuid, text, timestamptz) to authenticated;
grant execute on function public.uncomplete_quest_instance(uuid, uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- ───────────────────────── Realtime ─────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.characters, public.quests, public.quest_instances, public.game_events,
      public.court_cases, public.court_messages, public.goals;
  end if;
end $$;
