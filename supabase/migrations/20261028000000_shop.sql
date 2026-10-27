-- LIFE OS – Phase 3: Belohnungsshop
-- Belohnungen legt der Spieler selbst an (RLS). Gekauft wird nur über purchase_shop_item():
-- prüft Guthaben, zieht Coins ab und bucht ein Ereignis – idempotent über die Event-ID.

create table public.shop_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  cost        integer not null check (cost between 1 and 100000),
  icon        text not null default '🎁' check (char_length(icon) <= 8),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index shop_items_user_idx on public.shop_items(user_id, active);

create table public.shop_purchases (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  item_id      uuid references public.shop_items(id) on delete set null,
  title        text not null,
  cost         integer not null,
  event_id     uuid not null unique references public.game_events(id),
  purchased_at timestamptz not null default now()
);
create index shop_purchases_user_idx on public.shop_purchases(user_id, purchased_at desc);

alter table public.shop_items enable row level security;
alter table public.shop_purchases enable row level security;

create policy own_all on public.shop_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_select on public.shop_purchases for select to authenticated
  using (user_id = auth.uid());
revoke insert, update, delete on public.shop_purchases from authenticated, anon;

create or replace function public.purchase_shop_item(p_event_id uuid, p_item_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ch public.characters;
  it public.shop_items;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into ch from public.characters where user_id = uid for update;
  if not found then raise exception 'character missing'; end if;

  if exists (select 1 from public.game_events where id = p_event_id) then
    return jsonb_build_object('applied', false, 'reason', 'duplicate_event');
  end if;
  select * into it from public.shop_items where id = p_item_id and user_id = uid;
  if not found then return jsonb_build_object('applied', false, 'reason', 'not_found'); end if;
  if not it.active then return jsonb_build_object('applied', false, 'reason', 'inactive'); end if;
  if ch.coins < it.cost then return jsonb_build_object('applied', false, 'reason', 'insufficient_coins'); end if;

  insert into public.game_events (id, user_id, kind, xp_delta, coin_delta, ref_id, note)
  values (p_event_id, uid, 'shop_purchase', 0, -it.cost, it.id, it.title);
  insert into public.shop_purchases (user_id, item_id, title, cost, event_id)
  values (uid, it.id, it.title, it.cost, p_event_id);
  update public.characters set coins = coins - it.cost, updated_at = now() where user_id = uid
  returning * into ch;

  return jsonb_build_object('applied', true, 'coins_after', ch.coins);
end $$;

revoke execute on function public.purchase_shop_item(uuid, uuid) from public, anon;
grant execute on function public.purchase_shop_item(uuid, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shop_items, public.shop_purchases;
  end if;
end $$;
