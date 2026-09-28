-- Payments (Dominique): Premium you can pay for in the app, and tickets for
-- events, where I'm In keeps a 12% fee and the host gets the rest.
--
-- Money runs through Stripe (Checkout for paying, Connect for paying hosts).
-- The app never sees card numbers. Two Edge Functions do the Stripe calls:
-- `payments` (start a checkout, set up payouts, manage a subscription) and
-- `stripe-webhook` (Stripe tells us what was paid). The webhook calls the
-- stripe_* functions below, which only the server can run.
-- Nothing is charged until Stripe keys are added (see docs/PAYMENTS.md).

insert into public.app_config (key, value, description) values
  ('platform_fee_percent', '12', 'I''m In''s share of every ticket sale (the host gets the rest, minus Stripe''s processing fee).'),
  ('ticket_price_max_cents', '50000', 'Highest ticket price a host can set ($500).'),
  ('premium_price_cents', '1499', 'Premium monthly price in cents (Stripe checkout).')
on conflict (key) do nothing;

-- ── Tables ───────────────────────────────────────────────────────────────
alter table public.events add column ticket_price_cents integer check (ticket_price_cents between 100 and 100000);

create table public.payout_accounts (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled   boolean not null default false,
  payouts_enabled   boolean not null default false,
  updated_at        timestamptz not null default now()
);
alter table public.payout_accounts enable row level security;
create policy "see own payout account" on public.payout_accounts for select to authenticated using (user_id = auth.uid());

create table public.payment_customers (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text not null unique
);
alter table public.payment_customers enable row level security;  -- server only

create table public.event_tickets (
  id                  bigserial primary key,
  event_id            bigint not null references public.events (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  amount_cents        integer not null,
  fee_cents           integer not null,
  stripe_session_id   text not null unique,
  stripe_payment_intent text,
  status              text not null default 'paid' check (status in ('paid', 'refunded', 'overflow')),
  created_at          timestamptz not null default now()
);
create index event_tickets_event_idx on public.event_tickets (event_id);
create index event_tickets_user_idx on public.event_tickets (user_id);
create index event_tickets_intent_idx on public.event_tickets (stripe_payment_intent);
alter table public.event_tickets enable row level security;
create policy "buyers and hosts see tickets" on public.event_tickets for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));

-- ── Paid events: a ticket is how you get in ──────────────────────────────
create or replace function private.ticket_gate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare ev public.events;
begin
  select * into ev from public.events where id = new.event_id;
  if ev.ticket_price_cents is not null and new.user_id <> ev.host_id
     and not exists (select 1 from public.event_tickets t where t.event_id = ev.id and t.user_id = new.user_id and t.status in ('paid', 'overflow')) then
    raise exception 'This is a ticketed event. Get a ticket to go.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger event_rsvps_ticket_gate before insert on public.event_rsvps for each row execute function private.ticket_gate();

-- Hosts set (or remove) a ticket price. Payouts must be set up first, and
-- the price can't change once tickets are sold.
create or replace function public.set_ticket_price(p_event bigint, p_cents integer)
returns void language plpgsql security definer set search_path = '' as $$
declare ev public.events;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null or ev.host_id <> auth.uid() then raise exception 'Only the host can do that.' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.event_tickets where event_id = p_event and status = 'paid') then
    raise exception 'Tickets are already sold, so the price can''t change.' using errcode = 'check_violation';
  end if;
  if p_cents is not null then
    if not coalesce((select charges_enabled from public.payout_accounts where user_id = auth.uid()), false) then
      raise exception 'Set up payouts first (Settings → Payouts) so you can get paid.' using errcode = 'check_violation';
    end if;
    if p_cents < 100 or p_cents > public.config_num('ticket_price_max_cents') then
      raise exception 'Tickets can be $1 to $%.', (public.config_num('ticket_price_max_cents') / 100)::int using errcode = 'check_violation';
    end if;
  end if;
  update public.events set ticket_price_cents = p_cents where id = p_event;
end $$;

-- ── What the app reads ───────────────────────────────────────────────────
create or replace function public.my_payout_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'connected', exists (select 1 from public.payout_accounts where user_id = auth.uid()),
    'charges_enabled', coalesce((select charges_enabled from public.payout_accounts where user_id = auth.uid()), false),
    'payouts_enabled', coalesce((select payouts_enabled from public.payout_accounts where user_id = auth.uid()), false),
    'fee_percent', public.config_num('platform_fee_percent'),
    'sales', coalesce((
      select jsonb_build_object('tickets', count(*), 'gross_cents', sum(t.amount_cents), 'fee_cents', sum(t.fee_cents),
                                'host_cents', sum(t.amount_cents - t.fee_cents))
      from public.event_tickets t join public.events e on e.id = t.event_id
      where e.host_id = auth.uid() and t.status = 'paid'), '{}'::jsonb))
$$;

create or replace function public.my_tickets()
returns table (ticket_id bigint, event_id bigint, title text, starts_at timestamptz, place text, amount_cents integer, status text, bought_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, e.id, e.title, e.starts_at, coalesce(v.name, e.place_text), t.amount_cents, t.status, t.created_at
  from public.event_tickets t join public.events e on e.id = t.event_id left join public.venues v on v.id = e.venue_id
  where t.user_id = auth.uid() order by e.starts_at desc
$$;

-- Host: who bought tickets to my event (for refunds).
create or replace function public.event_ticket_holders(p_event bigint)
returns table (ticket_id bigint, user_id uuid, display_name text, amount_cents integer, status text, bought_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.events where id = p_event and host_id = auth.uid()) then
    raise exception 'Only the host can see this.' using errcode = 'insufficient_privilege';
  end if;
  return query
  select t.id, t.user_id, p.display_name, t.amount_cents, t.status, t.created_at
  from public.event_tickets t join public.profiles p on p.id = t.user_id
  where t.event_id = p_event order by t.created_at desc;
end $$;

-- Admin: money in (fees kept), by month.
create or replace function public.admin_revenue()
returns table (month date, tickets integer, gross_cents bigint, fee_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce((select role::text from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;
  return query
  select date_trunc('month', t.created_at)::date, count(*)::int, sum(t.amount_cents)::bigint, sum(t.fee_cents)::bigint
  from public.event_tickets t where t.status = 'paid' group by 1 order by 1 desc limit 12;
end $$;

-- ── Called by the Edge Functions only (service role) ─────────────────────
create or replace function public.stripe_checkout_check(p_event bigint, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ev public.events; acct public.payout_accounts;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null or ev.ticket_price_cents is null then return jsonb_build_object('error', 'This event isn''t selling tickets.'); end if;
  if private.is_blocked(p_user, ev.host_id) or (ev.group_id is not null and not private.is_group_member(ev.group_id, p_user)) then
    return jsonb_build_object('error', 'Event not found.');
  end if;
  if ev.host_id = p_user then return jsonb_build_object('error', 'You''re the host.'); end if;
  if coalesce(ev.ends_at, ev.starts_at + interval '3 hours') < now() then return jsonb_build_object('error', 'This event has ended.'); end if;
  if exists (select 1 from public.event_tickets where event_id = p_event and user_id = p_user and status = 'paid') then
    return jsonb_build_object('error', 'You already have a ticket.');
  end if;
  if ev.capacity is not null and (select count(*) from public.event_rsvps where event_id = p_event) >= ev.capacity then
    return jsonb_build_object('error', 'Sold out. Join the waitlist.');
  end if;
  select * into acct from public.payout_accounts where user_id = ev.host_id;
  if acct.user_id is null or not acct.charges_enabled then return jsonb_build_object('error', 'The host can''t take payments yet.'); end if;
  return jsonb_build_object('title', ev.title, 'price_cents', ev.ticket_price_cents,
    'fee_cents', round(ev.ticket_price_cents * public.config_num('platform_fee_percent') / 100.0)::int,
    'destination', acct.stripe_account_id);
end $$;

create or replace function public.stripe_ticket_paid(p_session text, p_event bigint, p_user uuid, p_amount integer, p_fee integer, p_payment_intent text)
returns text language plpgsql security definer set search_path = '' as $$
declare ev public.events;
begin
  -- Stripe can send the same event twice. A repeat of a sold-out ticket says
  -- 'overflow' again so the refund is retried (Stripe dedupes the refund itself).
  if exists (select 1 from public.event_tickets where stripe_session_id = p_session) then
    return case when exists (select 1 from public.event_tickets where stripe_session_id = p_session and status = 'overflow')
      then 'overflow' else 'duplicate' end;
  end if;
  select * into ev from public.events where id = p_event;
  insert into public.event_tickets (event_id, user_id, amount_cents, fee_cents, stripe_session_id, stripe_payment_intent)
  values (p_event, p_user, p_amount, p_fee, p_session, p_payment_intent);
  begin
    insert into public.event_rsvps (event_id, user_id) values (p_event, p_user) on conflict do nothing;
  exception when check_violation then
    -- Sold out while they were paying: keep the record; the webhook refunds it
    -- in full, and the buyer is told when the refund goes through.
    update public.event_tickets set status = 'overflow' where stripe_session_id = p_session;
    perform private.notify(ev.host_id, 'ticket_overflow', 'A ticket sold after your event filled up',
      'It was refunded automatically.', p_user, '/events/' || p_event);
    return 'overflow';
  end;
  perform private.notify(p_user, 'ticket', 'You''re in: ' || ev.title, 'Your ticket is confirmed.', null, '/events/' || p_event);
  perform private.notify(ev.host_id, 'ticket_sold', 'Ticket sold: ' || ev.title,
    (select display_name from public.profiles where id = p_user) || ' is coming.', p_user, '/events/' || p_event);
  return 'ok';
end $$;

-- The host asked to refund a ticket: is it theirs to refund?
create or replace function public.stripe_refund_check(p_ticket bigint, p_host uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.event_tickets;
begin
  select tk.* into t from public.event_tickets tk join public.events e on e.id = tk.event_id
  where tk.id = p_ticket and e.host_id = p_host;
  if t.id is null then return jsonb_build_object('error', 'Ticket not found.'); end if;
  if t.status = 'refunded' then return jsonb_build_object('error', 'Already refunded.'); end if;
  if t.stripe_payment_intent is null then return jsonb_build_object('error', 'This ticket can''t be refunded here.'); end if;
  return jsonb_build_object('payment_intent', t.stripe_payment_intent);
end $$;

create or replace function public.stripe_ticket_refunded(p_payment_intent text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.event_tickets;
begin
  update public.event_tickets set status = 'refunded' where stripe_payment_intent = p_payment_intent and status <> 'refunded' returning * into t;
  if t.id is null then return; end if;
  delete from public.event_rsvps where event_id = t.event_id and user_id = t.user_id;
  perform private.notify(t.user_id, 'ticket_refunded', 'Your ticket was refunded', (select title from public.events where id = t.event_id), null, '/events/' || t.event_id);
end $$;

create or replace function public.stripe_set_customer(p_user uuid, p_customer text)
returns void language sql security definer set search_path = '' as $$
  insert into public.payment_customers (user_id, stripe_customer_id) values (p_user, p_customer)
  on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id
$$;

-- Premium paid (or renewed) until p_until. Never shortens a longer
-- entitlement (e.g. a Founding Member's free months).
create or replace function public.stripe_premium_paid(p_user uuid, p_until timestamptz)
returns timestamptz language plpgsql security definer set search_path = '' as $$
begin
  insert into public.entitlements (user_id, premium_until, source, updated_at)
  values (p_user, p_until, 'stripe', now())
  on conflict (user_id) do update
    set premium_until = greatest(coalesce(public.entitlements.premium_until, excluded.premium_until), excluded.premium_until),
        source = case when coalesce(public.entitlements.premium_until, '-infinity') > excluded.premium_until then public.entitlements.source else 'stripe' end,
        updated_at = now();
  return (select premium_until from public.entitlements where user_id = p_user);
end $$;

-- Subscription ended: stop at the end of what they paid for (paid-for time
-- is already stored, so nothing to shorten). Just note it.
create or replace function public.stripe_premium_ended(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  update public.entitlements set updated_at = now() where user_id = p_user
$$;

create or replace function public.stripe_payout_account_set(p_user uuid, p_account text)
returns void language sql security definer set search_path = '' as $$
  insert into public.payout_accounts (user_id, stripe_account_id) values (p_user, p_account)
  on conflict (user_id) do update set stripe_account_id = excluded.stripe_account_id, updated_at = now()
$$;

create or replace function public.stripe_account_updated(p_account text, p_charges boolean, p_payouts boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare u uuid; was boolean;
begin
  select user_id, charges_enabled into u, was from public.payout_accounts where stripe_account_id = p_account;
  if u is null then return; end if;
  update public.payout_accounts set charges_enabled = p_charges, payouts_enabled = p_payouts, updated_at = now() where stripe_account_id = p_account;
  if p_charges and not was then
    perform private.notify(u, 'payouts_ready', 'You can sell tickets now', 'Add a ticket price when you host an event.', null, '/settings/payouts');
  end if;
end $$;

create or replace function public.event_detail(p_event bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  with network as (select f as id, 1 as degree from private.first_degree_ids(auth.uid()) f
                   union select user_id, 2 from private.second_degree(auth.uid()))
  select case when ev.id is null or private.is_blocked(auth.uid(), ev.host_id) then null else jsonb_build_object(
    'id', ev.id, 'title', ev.title, 'emoji', ev.emoji, 'description', ev.description,
    'starts_at', ev.starts_at, 'ends_at', ev.ends_at, 'capacity', ev.capacity, 'is_recurring', ev.is_recurring,
    'host', jsonb_build_object('id', h.id, 'display_name', h.display_name, 'avatar_emoji', h.avatar_emoji, 'avatar_url', h.avatar_url,
                               'vouch_count', public.visible_vouch_count(h.id)),
    'is_host', ev.host_id = auth.uid(),
    'venue', case when v.id is null then null else jsonb_build_object('id', v.id, 'name', v.name, 'address', v.address, 'neighborhood', v.neighborhood) end,
    'place', ev.place_text,
    'group', case when gr.id is null then null else jsonb_build_object('id', gr.id, 'name', gr.name, 'emoji', gr.emoji) end,
    'i_am_going', exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid()),
    'i_am_here', exists (select 1 from public.location_pings lp where lp.event_id = ev.id and lp.user_id = auth.uid() and lp.purpose = 'checkin'),
    'going_count', (select count(*) from public.event_rsvps r where r.event_id = ev.id),
    'ticket_price_cents', ev.ticket_price_cents,
    'has_ticket', exists (select 1 from public.event_tickets tk where tk.event_id = ev.id and tk.user_id = auth.uid() and tk.status = 'paid'),
    'tickets_sold', case when ev.host_id = auth.uid() then (select count(*) from public.event_tickets tk where tk.event_id = ev.id and tk.status = 'paid') end,
    'host_can_sell', case when ev.host_id = auth.uid() then coalesce((select charges_enabled from public.payout_accounts pa where pa.user_id = auth.uid()), false) end,
    'on_waitlist', exists (select 1 from public.event_waitlist w where w.event_id = ev.id and w.user_id = auth.uid()),
    'waitlist_position', (select pos from (select w.user_id, row_number() over (order by w.created_at) as pos from public.event_waitlist w where w.event_id = ev.id) q where q.user_id = auth.uid()),
    'waitlist_count', (select count(*) from public.event_waitlist w where w.event_id = ev.id),
    'going', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_emoji', p.avatar_emoji,
                         'avatar_url', p.avatar_url, 'degree', coalesce(n.degree, case when p.id = auth.uid() then 0 else 3 end))
                       order by coalesce(n.degree, case when p.id = auth.uid() then 0 else 3 end), p.vouch_count desc)
                     from public.event_rsvps r join public.profiles p on p.id = r.user_id left join network n on n.id = p.id
                     where r.event_id = ev.id and not private.is_blocked(auth.uid(), p.id)), '[]'::jsonb),
    'has_recap', exists (select 1 from public.pins pn where pn.event_id = ev.id and pn.category = 'recap' and pn.author_id = auth.uid() and pn.deleted_at is null)
  ) end
  from (select p_event as id0) z
  left join public.events ev on ev.id = z.id0
  left join public.profiles h on h.id = ev.host_id
  left join public.venues v on v.id = ev.venue_id
  left join public.groups gr on gr.id = ev.group_id
$$;

create or replace function private.promote_waitlist()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ev public.events;
  nxt uuid;
begin
  select * into ev from public.events where id = old.event_id;
  if ev.id is null or ev.capacity is null or ev.starts_at < now() then return old; end if;
  if (select count(*) from public.event_rsvps where event_id = ev.id) >= ev.capacity then return old; end if;
  select user_id into nxt from public.event_waitlist where event_id = ev.id order by created_at limit 1;
  if nxt is null then return old; end if;
  delete from public.event_waitlist where event_id = ev.id and user_id = nxt;
  if ev.ticket_price_cents is not null then
    -- Paid event: the spot is theirs to buy (they're off the list, first to know).
    perform private.notify(nxt, 'waitlist_ticket', 'A spot opened: get your ticket', ev.title, null, '/events/' || ev.id);
    return old;
  end if;
  insert into public.event_rsvps (event_id, user_id) values (ev.id, nxt) on conflict do nothing;
  perform private.notify(nxt, 'waitlist_in', 'A spot opened: you''re in', ev.title, null, '/events/' || ev.id);
  return old;
end $$;

create or replace function public.home_feed(p_scope text default 'friends', p_lat double precision default null, p_lng double precision default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with friends as (
    -- Your circle, plus people you follow.
    select f as id from private.first_degree_ids(auth.uid()) f
    union select followee_id from public.follows where follower_id = auth.uid()),
  my_groups as (select group_id from public.group_members where user_id = auth.uid()),
  event_rows as (
    select ev.id, ev.title, ev.emoji, ev.starts_at, ev.group_id, ev.host_id, ev.capacity, ev.ticket_price_cents,
           coalesce(v.name, ev.place_text) as place, g.name as group_name, h.display_name as host_name, h.avatar_url as host_avatar,
           (select count(*) from public.event_rsvps r where r.event_id = ev.id)::int as going_count,
           (select count(*) from public.event_rsvps r where r.event_id = ev.id and r.user_id in (select private.first_degree_ids(auth.uid())))::int as friends_going,
           exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid()) as i_am_going
    from public.events ev
    left join public.venues v on v.id = ev.venue_id
    left join public.groups g on g.id = ev.group_id
    join public.profiles h on h.id = ev.host_id
    where coalesce(ev.ends_at, ev.starts_at + interval '3 hours') > now()
      and ev.starts_at < now() + interval '30 days'
      and not private.is_blocked(auth.uid(), ev.host_id)
      and (ev.group_id is null or ev.group_id in (select group_id from my_groups)))
  select jsonb_build_object(
    'friend_count', (select count(*) from friends),
    -- 1. Your friends' pins (not yours, not strangers').
    'pins', coalesce((
      select jsonb_agg(to_jsonb(f))
      from public.pins_feed('friends', p_lat, p_lng, null, null, null, null, null, 40) f
      where f.author_id in (select id from friends)), '[]'::jsonb),
    -- 2. Likes and replies people sent you (last 14 days).
    'activity', coalesce((
      select jsonb_agg(a order by a->>'at' desc) from (select a from (
        -- Likes: one line per pin ("Hana, Isaiah and 6 others liked your pin").
        select jsonb_build_object('kind', 'like', 'actor_id', (array_agg(u.id order by l.created_at desc))[1],
                 'actor_name', (array_agg(u.display_name order by l.created_at desc))[1],
                 'actor_avatar', (array_agg(u.avatar_url order by l.created_at desc))[1],
                 'second_name', (array_agg(u.display_name order by l.created_at desc))[2],
                 'count', count(*), 'pin_id', p.id, 'pin_body', left(p.body, 80), 'text', null, 'at', max(l.created_at)) as a
        from public.pin_likes l
        join public.pins p on p.id = l.pin_id and p.author_id = auth.uid() and p.deleted_at is null
        join public.profiles u on u.id = l.user_id
        where l.user_id <> auth.uid() and l.created_at > now() - interval '14 days' and not private.is_blocked(auth.uid(), l.user_id)
        group by p.id, p.body
        union all
        select jsonb_build_object('kind', 'reply', 'actor_id', u.id, 'actor_name', u.display_name, 'actor_avatar', u.avatar_url,
                 'second_name', null, 'count', 1, 'pin_id', p.id, 'pin_body', left(p.body, 80), 'text', left(r.body, 140), 'at', r.created_at)
        from public.pin_replies r
        join public.pins p on p.id = r.pin_id and p.author_id = auth.uid() and p.deleted_at is null
        join public.profiles u on u.id = r.author_id
        where r.author_id <> auth.uid() and r.deleted_at is null and r.hidden_at is null
          and r.created_at > now() - interval '14 days' and not private.is_blocked(auth.uid(), r.author_id)
        ) u order by a->>'at' desc limit 8) s), '[]'::jsonb),
    -- 3. Events in groups you're in.
    'group_events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.starts_at)
      from (select * from event_rows where group_id in (select group_id from my_groups) order by starts_at limit 6) e), '[]'::jsonb),
    -- 4. Events your friends are hosting (not already shown as a group event).
    'friends_hosting', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.starts_at)
      from (select * from event_rows
            where host_id in (select private.first_degree_ids(auth.uid()))
              and (group_id is null or group_id not in (select group_id from my_groups))
            order by starts_at limit 6) e), '[]'::jsonb),
    -- For new members (few friends yet): what's happening in the whole community,
    -- open groups to join, and public events nearby.
    'everyone_pins', case when (select count(*) from friends) < 3 then coalesce((
      select jsonb_agg(to_jsonb(f)) from public.pins_feed('community', p_lat, p_lng, null, null, null, null, null, 10) f
      where not f.is_mine), '[]'::jsonb) else '[]'::jsonb end,
    'suggested_groups', case when (select count(*) from my_groups) < 3 then coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'emoji', g.emoji, 'category', g.category, 'join_type', g.join_type,
               'members', (select count(*) from public.group_members m where m.group_id = g.id), 'schedule', g.schedule_label) order by x.n desc)
      from public.groups g
      cross join lateral (select count(*) as n from public.group_members m where m.group_id = g.id) x
      where g.id not in (select group_id from my_groups) and not private.is_blocked(auth.uid(), g.owner_id)
        and (g.city_id is null or g.city_id = (select city_id from public.profiles where id = auth.uid()))
      limit 5), '[]'::jsonb) else '[]'::jsonb end,
    'nearby_events', case when (select count(*) from friends) < 3 then coalesce((
      select jsonb_agg(to_jsonb(e) order by e.starts_at) from (
        select * from event_rows where group_id is null and host_id <> auth.uid() order by starts_at limit 5) e), '[]'::jsonb) else '[]'::jsonb end
  )
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.set_ticket_price(bigint, integer)', 'public.my_payout_status()', 'public.my_tickets()', 'public.admin_revenue()', 'public.event_ticket_holders(bigint)',
    'public.event_detail(bigint)', 'public.home_feed(text, double precision, double precision)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Server only (the Edge Functions use the service role).
  foreach f in array array[
    'public.stripe_checkout_check(bigint, uuid)', 'public.stripe_ticket_paid(text, bigint, uuid, integer, integer, text)',
    'public.stripe_ticket_refunded(text)', 'public.stripe_set_customer(uuid, text)', 'public.stripe_premium_paid(uuid, timestamptz)',
    'public.stripe_premium_ended(uuid)', 'public.stripe_payout_account_set(uuid, text)', 'public.stripe_account_updated(text, boolean, boolean)',
    'public.stripe_refund_check(bigint, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
