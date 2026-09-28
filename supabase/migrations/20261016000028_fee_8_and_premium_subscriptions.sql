-- Ticket fee: I'm In keeps 8% and the host covers Stripe's card fee.
--   $25 ticket → guest pays $25, I'm In keeps $2.00, Stripe's card fee
--   (2.9% + 30¢ ≈ $1.03) comes out of the host's share, host gets ≈ $21.97.
-- Stripe charges the card fee to I'm In's account, so the application fee we
-- take is 8% + the card fee; I'm In nets its 8%.
--
-- Premium: remember who has an active Stripe subscription, so Founding
-- Members (free Premium) can subscribe now and be billed when the free
-- months end, and subscribers always see "Manage or cancel".

insert into public.app_config (key, value, description) values
  ('card_fee_percent', '2.9', 'Stripe''s card fee, percent part (paid by the host on tickets).'),
  ('card_fee_fixed_cents', '30', 'Stripe''s card fee, fixed part in cents (paid by the host on tickets).')
on conflict (key) do nothing;
update public.app_config set value = '8',
  description = 'I''m In''s share of every ticket sale. The host also covers Stripe''s card fee.'
where key = 'platform_fee_percent';

-- One place for the split, used by checkout and reports.
create or replace function private.card_fee_cents(p_amount integer)
returns integer language sql stable set search_path = '' as $$
  select round(p_amount * public.config_num('card_fee_percent') / 100.0)::int + public.config_num('card_fee_fixed_cents')::int
$$;

create or replace function public.stripe_checkout_check(p_event bigint, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ev public.events; acct public.payout_accounts; platform integer;
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
  platform := round(ev.ticket_price_cents * public.config_num('platform_fee_percent') / 100.0)::int;
  return jsonb_build_object('title', ev.title, 'price_cents', ev.ticket_price_cents,
    -- What the host doesn't get: our fee plus the card fee Stripe charges us.
    'fee_cents', platform + private.card_fee_cents(ev.ticket_price_cents),
    'platform_cents', platform,
    'destination', acct.stripe_account_id);
end $$;

-- Host view: sales split into I'm In's fee, the card fee, and theirs.
create or replace function public.my_payout_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'connected', exists (select 1 from public.payout_accounts where user_id = auth.uid()),
    'charges_enabled', coalesce((select charges_enabled from public.payout_accounts where user_id = auth.uid()), false),
    'payouts_enabled', coalesce((select payouts_enabled from public.payout_accounts where user_id = auth.uid()), false),
    'fee_percent', public.config_num('platform_fee_percent'),
    'sales', coalesce((
      select jsonb_build_object(
        'tickets', count(*),
        'gross_cents', sum(t.amount_cents),
        'card_fee_cents', sum(least(t.fee_cents, private.card_fee_cents(t.amount_cents))),
        'fee_cents', sum(t.fee_cents - least(t.fee_cents, private.card_fee_cents(t.amount_cents))),
        'host_cents', sum(t.amount_cents - t.fee_cents))
      from public.event_tickets t join public.events e on e.id = t.event_id
      where e.host_id = auth.uid() and t.status = 'paid'), '{}'::jsonb))
$$;

-- Admin: what I'm In kept (after the card fees passed to Stripe), by month.
drop function public.admin_revenue();
create function public.admin_revenue()
returns table (month date, tickets integer, gross_cents bigint, fee_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce((select role::text from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;
  return query
  select date_trunc('month', t.created_at)::date, count(*)::int, sum(t.amount_cents)::bigint,
         sum(t.fee_cents - least(t.fee_cents, private.card_fee_cents(t.amount_cents)))::bigint
  from public.event_tickets t where t.status = 'paid' group by 1 order by 1 desc limit 12;
end $$;

-- ── Premium subscriptions ────────────────────────────────────────────────
alter table public.payment_customers add column if not exists subscribed boolean not null default false;

create or replace function public.stripe_premium_paid(p_user uuid, p_until timestamptz)
returns timestamptz language plpgsql security definer set search_path = '' as $$
begin
  insert into public.entitlements (user_id, premium_until, source, updated_at)
  values (p_user, p_until, 'stripe', now())
  on conflict (user_id) do update
    set premium_until = greatest(coalesce(public.entitlements.premium_until, excluded.premium_until), excluded.premium_until),
        source = case when coalesce(public.entitlements.premium_until, '-infinity') > excluded.premium_until then public.entitlements.source else 'stripe' end,
        updated_at = now();
  update public.payment_customers set subscribed = true where user_id = p_user;
  return (select premium_until from public.entitlements where user_id = p_user);
end $$;

-- Cancelled: Premium runs to the end of what was paid; no more renewals.
create or replace function public.stripe_premium_ended(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  update public.payment_customers set subscribed = false where user_id = p_user;
  update public.entitlements set updated_at = now() where user_id = p_user;
$$;

-- Server: is this member already subscribed, and until when is Premium paid for?
create or replace function public.stripe_premium_state(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'subscribed', coalesce((select subscribed from public.payment_customers where user_id = p_user), false),
    'premium_until', (select premium_until from public.entitlements where user_id = p_user))
$$;

create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'is_premium', public.is_premium(auth.uid()),
    'premium_until', e.premium_until,
    'source', e.source,
    'is_founding_member', p.is_founding_member,
    'member_number', p.member_number,
    'subscribed', coalesce(c.subscribed, false)
  )
  from public.profiles p
  left join public.entitlements e on e.user_id = p.id
  left join public.payment_customers c on c.user_id = p.id
  where p.id = auth.uid()
$$;

do $$
declare f text;
begin
  foreach f in array array['public.my_payout_status()', 'public.admin_revenue()', 'public.my_plan()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public.stripe_checkout_check(bigint, uuid)', 'public.stripe_premium_paid(uuid, timestamptz)',
    'public.stripe_premium_ended(uuid)', 'public.stripe_premium_state(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  revoke execute on function private.card_fee_cents(integer) from public, anon, authenticated;
end $$;
