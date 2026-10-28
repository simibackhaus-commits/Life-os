-- Kostenlose KI auf dem Gerät (Ollama / Gemini Free Tier), siehe ADR-18.
-- Die KI läuft im Client. Der Server bleibt Autorität: Gerichtsschritte und Urteile laufen über
-- diese Funktionen und werden hier gegen die Regelbasis (Spiegel von VERDICT_LIMITS) geprüft.

alter table public.court_cases add column if not exists excuse text
  check (excuse in ('keine','vergessen','keine_zeit','keine_motivation','krankheit','verletzung','regeneration','notfall'));

-- Spielleiter-Verlauf: Antworten der Geräte-KI darf der Nutzer selbst speichern (kein Spieleinfluss).
drop policy if exists own_insert on public.ai_messages;
create policy own_insert on public.ai_messages for insert to authenticated
  with check (user_id = auth.uid() and role in ('user','assistant'));

-- Spiegel von VERDICT_LIMITS + ABSOLUTE_CAPS (packages/core/src/court.ts)
create or replace function public.verdict_within_limits(p_verdict text, p_consequences jsonb, p_quest_xp integer, p_quest_coins integer)
returns boolean language plpgsql immutable as $$
declare
  e jsonb;
  coin_share numeric;
  xp_share numeric;
  allowed text[];
  coins integer := 0;
  xp integer := 0;
begin
  case p_verdict
    when 'freispruch'        then coin_share := 0;    xp_share := 0;    allowed := '{}';
    when 'einstellung'       then coin_share := 0;    xp_share := 0;    allowed := '{}';
    when 'verwarnung'        then coin_share := 0;    xp_share := 0;    allowed := '{reflexion}';
    when 'teilschuld'        then coin_share := 0.5;  xp_share := 0;    allowed := '{coins_verlust,reflexion,wiedergutmachung}';
    when 'schuldig_mildernd' then coin_share := 0.75; xp_share := 0.25; allowed := '{coins_verlust,xp_abzug,reflexion,wiedergutmachung,bonus_verlust}';
    when 'schuldig'          then coin_share := 1;    xp_share := 0.5;  allowed := '{coins_verlust,xp_abzug,reflexion,wiedergutmachung,bonus_verlust}';
    else return false;
  end case;
  if jsonb_typeof(coalesce(p_consequences, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_consequences, '[]'::jsonb)) > 3 then
    return false;
  end if;
  for e in select * from jsonb_array_elements(coalesce(p_consequences, '[]'::jsonb)) loop
    if not (e->>'type' = any(allowed)) then return false; end if;
    if e->>'type' = 'coins_verlust' then coins := coins + greatest(0, (e->>'amount')::integer); end if;
    if e->>'type' = 'xp_abzug' then xp := xp + greatest(0, (e->>'amount')::integer); end if;
    if e->>'type' = 'wiedergutmachung' and coalesce((e->>'estimatedMinutes')::integer, 0) not between 1 and 60 then return false; end if;
  end loop;
  return coins <= least(100, floor(p_quest_coins * coin_share)) and xp <= least(50, floor(p_quest_xp * xp_share));
end $$;

-- Gerichtsschritt vom Gerät: Plädoyer, Aussage oder Berufung samt Protokollzeilen.
create or replace function public.court_record(p_case_id uuid, p_action text, p_plea text, p_excuse text, p_messages jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.court_cases;
  m jsonb;
begin
  select * into c from public.court_cases where id = p_case_id and user_id = auth.uid() for update;
  if not found then raise exception 'case not found'; end if;

  if p_action = 'plead' then
    if c.status <> 'offen' or c.plea is not null then raise exception 'plea already given'; end if;
    update public.court_cases set plea = p_plea, excuse = coalesce(p_excuse, 'keine'), status = 'verhandlung' where id = c.id;
  elsif p_action = 'message' then
    if c.status not in ('verhandlung','berufung') then raise exception 'no hearing in progress'; end if;
  elsif p_action = 'appeal' then
    if c.status <> 'urteil' or c.appeal_count >= 1 then raise exception 'appeal not possible'; end if;
    update public.court_cases set status = 'berufung', appeal_count = appeal_count + 1, excuse = coalesce(p_excuse, excuse) where id = c.id;
  else
    raise exception 'unknown action';
  end if;

  for m in select * from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) loop
    if m->>'role' not in ('angeklagter','richter','staatsanwalt','verteidiger','system') then raise exception 'invalid role'; end if;
    if char_length(coalesce(m->>'content', '')) = 0 then continue; end if;
    insert into public.court_messages (case_id, user_id, role, content) values (c.id, c.user_id, m->>'role', left(m->>'content', 4000));
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- Urteil vom Gerät (KI- oder Regelrichter). Prüft Eigentum, Status, Schutzgründe und Grenzen.
-- Berufung wirkt nur zugunsten des Angeklagten.
create or replace function public.court_decide(
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
  old_xp integer := 0;
  old_coins integer := 0;
  new_xp integer := 0;
  new_coins integer := 0;
begin
  select * into c from public.court_cases where id = p_case_id and user_id = auth.uid() for update;
  if not found then raise exception 'case not found'; end if;
  if c.status not in ('verhandlung','berufung') then return jsonb_build_object('applied', false, 'reason', 'case_closed'); end if;
  if c.excuse in ('krankheit','verletzung','regeneration','notfall') and p_verdict not in ('freispruch','einstellung') then
    raise exception 'protected excuse requires acquittal or dismissal';
  end if;
  if p_protected_reason is not null then p_consequences := '[]'::jsonb; end if;
  if not public.verdict_within_limits(p_verdict, p_consequences, c.quest_xp, c.quest_coins) then
    raise exception 'verdict exceeds rulebook limits';
  end if;

  if c.status = 'berufung' and c.verdict_event_id is not null then
    select coalesce(sum(case when e->>'type' = 'xp_abzug' then (e->>'amount')::integer else 0 end), 0),
           coalesce(sum(case when e->>'type' = 'coins_verlust' then (e->>'amount')::integer else 0 end), 0)
      into old_xp, old_coins from jsonb_array_elements(c.consequences) e;
    select coalesce(sum(case when e->>'type' = 'xp_abzug' then (e->>'amount')::integer else 0 end), 0),
           coalesce(sum(case when e->>'type' = 'coins_verlust' then (e->>'amount')::integer else 0 end), 0)
      into new_xp, new_coins from jsonb_array_elements(p_consequences) e;
    if new_xp > old_xp or new_coins > old_coins then
      update public.court_cases set status = 'urteil' where id = c.id;
      insert into public.court_messages (case_id, user_id, role, content)
      values (c.id, c.user_id, 'richter', 'Die Berufung wird zurückgewiesen. Das ursprüngliche Urteil bleibt bestehen.');
      return jsonb_build_object('applied', false, 'reason', 'appeal_rejected');
    end if;
    perform public.revert_court_verdict(c.id, gen_random_uuid());
    update public.court_cases set status = 'berufung' where id = c.id;
  end if;

  return public.apply_court_verdict(c.id, p_event_id, p_verdict, p_reasoning, p_protected_reason, p_consequences, p_rulebook_version);
end $$;

revoke execute on function public.court_record(uuid, text, text, text, jsonb) from public, anon;
revoke execute on function public.court_decide(uuid, uuid, text, text, text, jsonb, text) from public, anon;
grant execute on function public.court_record(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.court_decide(uuid, uuid, text, text, text, jsonb, text) to authenticated;
