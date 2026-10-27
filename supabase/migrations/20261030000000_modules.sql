-- LIFE OS – Phase 3, Abschnitt 3: Business-, Sport- und Finanzmodule
-- Reine Aufzeichnungen ohne Spielwirkung (RLS genügt). XP/Coins entstehen nur über verknüpfte Quests.

alter table public.quests add column delegated_to text check (char_length(delegated_to) <= 80);

create table public.workouts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date         date not null,
  kind         text not null check (kind in ('laufen','kraft','fussball','radfahren','schwimmen','mobilität','sonstiges')),
  duration_min integer not null check (duration_min between 1 and 1440),
  distance_km  numeric(7,2) check (distance_km >= 0 and distance_km <= 1000),
  intensity    smallint not null default 5 check (intensity between 1 and 10),
  exercises    jsonb not null default '[]'::jsonb,
  note         text not null default '' check (char_length(note) <= 300),
  created_at   timestamptz not null default now()
);
create index workouts_user_idx on public.workouts(user_id, date desc);

create table public.finance_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('einzahlung','ausgabe','einnahme')),
  amount     numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  category   text not null default 'sonstiges' check (char_length(category) <= 40),
  note       text not null default '' check (char_length(note) <= 200),
  date       date not null,
  goal_id    uuid references public.goals(id) on delete set null,
  created_at timestamptz not null default now()
);
create index finance_entries_user_idx on public.finance_entries(user_id, date desc);

alter table public.workouts enable row level security;
alter table public.finance_entries enable row level security;
create policy own_all on public.workouts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on public.finance_entries for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and (goal_id is null or exists (select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid())));

-- Einzahlungen erhöhen (bzw. beim Löschen verringern) den Stand des verknüpften Sparziels.
create or replace function public.sync_goal_from_finance()
returns trigger language plpgsql as $$
begin
  if tg_op in ('INSERT') and new.kind = 'einzahlung' and new.goal_id is not null then
    update public.goals set current_value = current_value + new.amount where id = new.goal_id;
  elsif tg_op = 'DELETE' and old.kind = 'einzahlung' and old.goal_id is not null then
    update public.goals set current_value = greatest(0, current_value - old.amount) where id = old.goal_id;
  end if;
  return coalesce(new, old);
end $$;

create trigger finance_goal_sync
  after insert or delete on public.finance_entries
  for each row execute function public.sync_goal_from_finance();

-- Buchungen sind unveränderlich (Korrektur = löschen + neu anlegen), damit der Zielstand stimmt.
revoke update on public.finance_entries from authenticated, anon;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.workouts, public.finance_entries;
  end if;
end $$;
