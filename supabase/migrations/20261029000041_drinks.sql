-- Drinks: send the person who's live a cocktail. Viewers buy drink credit
-- (card, through Stripe); each drink moves money from the sender's credit to
-- the host, who keeps a share (70% by default) and cashes out to their bank
-- through their Stripe payout account. Like TikTok gifts, but cocktails.
insert into public.app_config (key, value, description) values
  ('drink_host_share_pct', '70', 'Percent of each drink the host earns (the rest is I''m In''s).'),
  ('drink_cashout_min_cents', '1000', 'Smallest cash-out, in cents.'),
  ('drinks_per_minute', '30', 'Most drinks one person can send per minute.')
on conflict (key) do nothing;

create table public.drink_menu (
  key   text primary key,
  name  text not null,
  cents integer not null check (cents > 0),
  sort  smallint not null default 0
);
alter table public.drink_menu enable row level security;
create policy "menu readable" on public.drink_menu for select using (true);
grant select on public.drink_menu to anon, authenticated;
insert into public.drink_menu (key, name, cents, sort) values
  ('lemon_drop',     'Lemon Drop',        100, 1),
  ('mojito',         'Mojito',            200, 2),
  ('margarita',      'Margarita',         300, 3),
  ('paloma',         'Paloma',            500, 4),
  ('espresso_tini',  'Espresso Martini', 1000, 5),
  ('old_fashioned',  'Old Fashioned',    2000, 6),
  ('french_75',      'French 75',        5000, 7),
  ('champagne_tower','Champagne Tower', 10000, 8);

create table public.wallets (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  balance_cents integer not null default 0 check (balance_cents >= 0),
  updated_at    timestamptz not null default now()
);
create table public.wallet_topups (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  cents          integer not null check (cents > 0),
  stripe_session text not null unique,
  created_at     timestamptz not null default now()
);
create table public.drink_gifts (
  id         bigint generated always as identity primary key,
  from_user  uuid references public.profiles (id) on delete set null,
  to_user    uuid not null references public.profiles (id) on delete cascade,
  drink_key  text not null references public.drink_menu (key),
  cents      integer not null,
  host_cents integer not null,
  live_id    bigint references public.live_streams (id) on delete set null,
  event_id   bigint references public.events (id) on delete set null,
  -- Sent anonymously: the host sees "Someone" (we still know who, for safety).
  anonymous  boolean not null default false,
  created_at timestamptz not null default now()
);
create index drink_gifts_from_idx on public.drink_gifts (from_user, created_at desc);
create index drink_gifts_to_idx on public.drink_gifts (to_user, created_at desc);
create table public.drink_earnings (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  available_cents integer not null default 0 check (available_cents >= 0),
  lifetime_cents  integer not null default 0
);
create table public.drink_cashouts (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  cents           integer not null check (cents > 0),
  status          text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  stripe_transfer text,
  created_at      timestamptz not null default now()
);
do $$
declare tbl text;
begin
  foreach tbl in array array['wallets', 'wallet_topups', 'drink_earnings', 'drink_cashouts'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('create policy "own rows" on public.%I for select to authenticated using (user_id = auth.uid())', tbl);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', tbl);
    execute format('grant select on public.%I to authenticated', tbl);
  end loop;
end $$;
-- Read through my_wallet() only, so anonymous senders stay anonymous.
alter table public.drink_gifts enable row level security;
revoke all on public.drink_gifts from anon, authenticated;

/**
 * Send a drink to whoever is live: the host of a live video you can watch,
 * or the host of a virtual event whose room is open and that you're going to.
 * Returns the room to announce it in.
 */
create or replace function public.send_drink(p_drink text, p_live bigint default null, p_event bigint default null, p_anonymous boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  d public.drink_menu;
  s public.live_streams;
  e public.events;
  to_user uuid;
  room text;
  share int;
  gift bigint;
  left_cents int;
  anon boolean := coalesce(p_anonymous, false);
  sender text;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  select * into d from public.drink_menu where key = p_drink;
  if d.key is null then raise exception 'That drink isn''t on the menu.' using errcode = 'check_violation'; end if;
  if (p_live is null) = (p_event is null) then raise exception 'Send it to one live.' using errcode = 'check_violation'; end if;

  if p_live is not null then
    select * into s from public.live_streams where id = p_live;
    if s.id is null or not private.live_is_on(s) or not private.can_see_live(p_live, me) then
      raise exception 'They''re not live anymore.' using errcode = 'check_violation';
    end if;
    to_user := s.host_id;
    room := s.room;
  else
    select * into e from public.events where id = p_event;
    if e.id is null or e.format = 'in_person' or e.room_kind not in ('voice', 'video', 'stream')
       or not private.event_room_open(e) or private.event_hidden(p_event, me)
       or not exists (select 1 from public.event_rsvps where event_id = p_event and user_id = me) then
      raise exception 'You can send drinks while you''re in the room.' using errcode = 'check_violation';
    end if;
    to_user := e.host_id;
    room := 'event-' || e.id;
  end if;
  if to_user = me then raise exception 'You can''t send yourself a drink.' using errcode = 'check_violation'; end if;
  if private.is_blocked(me, to_user) then raise exception 'You can''t send them drinks.' using errcode = 'check_violation'; end if;
  if (select count(*) from public.drink_gifts where from_user = me and created_at > now() - interval '1 minute')
     >= public.config_num('drinks_per_minute') then
    raise exception 'Slow down a little. Try again in a minute.' using errcode = 'check_violation';
  end if;

  update public.wallets set balance_cents = balance_cents - d.cents, updated_at = now()
  where user_id = me and balance_cents >= d.cents
  returning balance_cents into left_cents;
  if left_cents is null then raise exception 'Add drink credit to send this.' using errcode = 'check_violation'; end if;

  share := floor(d.cents * public.config_num('drink_host_share_pct') / 100);
  insert into public.drink_gifts (from_user, to_user, drink_key, cents, host_cents, live_id, event_id, anonymous)
  values (me, to_user, d.key, d.cents, share, p_live, p_event, anon) returning id into gift;
  insert into public.drink_earnings (user_id, available_cents, lifetime_cents) values (to_user, share, share)
  on conflict (user_id) do update set available_cents = public.drink_earnings.available_cents + share,
                                      lifetime_cents = public.drink_earnings.lifetime_cents + share;
  sender := case when anon then 'Someone' else (select display_name from public.profiles where id = me) end;
  perform private.notify(to_user, 'drink', sender || ' sent you ' || case when d.name ~* '^[aeiou]' then 'an ' else 'a ' end || d.name,
    'You earned ' || private.money(share) || '.', case when anon then null else me end, '/settings/wallet');
  return jsonb_build_object('gift_id', gift, 'room', room, 'drink', d.key, 'name', d.name,
    'from_name', sender, 'anonymous', anon, 'balance_cents', left_cents);
end $$;

/** Your drink credit, what you've earned, and recent drinks. */
create or replace function public.my_wallet() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'balance_cents', coalesce((select balance_cents from public.wallets where user_id = auth.uid()), 0),
    'available_cents', coalesce((select available_cents from public.drink_earnings where user_id = auth.uid()), 0),
    'lifetime_cents', coalesce((select lifetime_cents from public.drink_earnings where user_id = auth.uid()), 0),
    'host_share_pct', public.config_num('drink_host_share_pct'),
    'cashout_min_cents', public.config_num('drink_cashout_min_cents'),
    'payouts_ready', coalesce((select payouts_enabled from public.payout_accounts where user_id = auth.uid()), false),
    'history', coalesce((
      select jsonb_agg(x order by (x->>'at') desc) from (
        select jsonb_build_object(
          'id', g.id, 'drink', g.drink_key, 'name', m.name, 'at', g.created_at,
          'sent', g.from_user = auth.uid(),
          'cents', case when g.from_user = auth.uid() then g.cents else g.host_cents end,
          'anonymous', g.anonymous,
          -- Anonymous drinks never say who sent them to the person who got them.
          'other', case when g.from_user <> auth.uid() and g.anonymous then null
                        else (select display_name from public.profiles where id = case when g.from_user = auth.uid() then g.to_user else g.from_user end) end) as x
        from public.drink_gifts g join public.drink_menu m on m.key = g.drink_key
        where g.from_user = auth.uid() or g.to_user = auth.uid()
        order by g.created_at desc limit 30) s), '[]'::jsonb))
$$;

-- Server only: add bought credit (once per Stripe checkout), and cash-outs.
create or replace function public.wallet_credit(p_user uuid, p_cents integer, p_session text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.wallet_topups (user_id, cents, stripe_session) values (p_user, p_cents, p_session)
  on conflict (stripe_session) do nothing;
  if not found then return false; end if;
  insert into public.wallets (user_id, balance_cents) values (p_user, p_cents)
  on conflict (user_id) do update set balance_cents = public.wallets.balance_cents + p_cents, updated_at = now();
  return true;
end $$;

create or replace function public.drink_cashout_start(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  acct public.payout_accounts;
  amount int;
  new_id bigint;
begin
  select * into acct from public.payout_accounts where user_id = p_user;
  if acct.user_id is null or not acct.payouts_enabled then return jsonb_build_object('error', 'Set up payouts first.'); end if;
  select available_cents into amount from public.drink_earnings where user_id = p_user for update;
  if coalesce(amount, 0) < public.config_num('drink_cashout_min_cents') then
    return jsonb_build_object('error', 'You can cash out once you have ' || private.money(public.config_num('drink_cashout_min_cents')::int) || '.');
  end if;
  update public.drink_earnings set available_cents = 0 where user_id = p_user;
  insert into public.drink_cashouts (user_id, cents) values (p_user, amount) returning id into new_id;
  return jsonb_build_object('cashout_id', new_id, 'cents', amount, 'destination', acct.stripe_account_id);
end $$;

create or replace function public.drink_cashout_done(p_cashout bigint, p_transfer text, p_ok boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.drink_cashouts;
begin
  select * into c from public.drink_cashouts where id = p_cashout and status = 'pending' for update;
  if c.id is null then return; end if;
  if p_ok then
    update public.drink_cashouts set status = 'paid', stripe_transfer = p_transfer where id = p_cashout;
  else
    update public.drink_cashouts set status = 'failed' where id = p_cashout;
    update public.drink_earnings set available_cents = available_cents + c.cents where user_id = c.user_id;
  end if;
end $$;

revoke execute on function public.send_drink(text, bigint, bigint, boolean) from public, anon;
revoke execute on function public.my_wallet() from public, anon;
grant execute on function public.send_drink(text, bigint, bigint, boolean) to authenticated;
grant execute on function public.my_wallet() to authenticated;
revoke execute on function public.wallet_credit(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.drink_cashout_start(uuid) from public, anon, authenticated;
revoke execute on function public.drink_cashout_done(bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.wallet_credit(uuid, integer, text) to service_role;
grant execute on function public.drink_cashout_start(uuid) to service_role;
grant execute on function public.drink_cashout_done(bigint, text, boolean) to service_role;

-- The room pass says who the host is, so the room knows who drinks go to.
do $$
declare
  src text := pg_get_functiondef('public.event_room_join_check(bigint,uuid)'::regprocedure);
  out text;
begin
  out := replace(src, $x$'title', e.title,$x$, $x$'title', e.title, 'event_id', e.id, 'host_id', e.host_id,
    'host_name', (select display_name from public.profiles where id = e.host_id),$x$);
  if out = src then raise exception 'event_room_join_check patch did not apply'; end if;
  execute out;
end $$;
