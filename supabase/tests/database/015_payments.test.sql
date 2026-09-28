-- Payments: ticket prices need payouts, the 12% fee, a ticket gets you in,
-- refunds, Premium from Stripe, and server-only Stripe functions.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create or replace function pg_temp.new_user(p_email text, p_name text) returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '',
          jsonb_build_object('accepted_terms', true, 'full_name', p_name, 'birthdate', '1990-01-01'), now(), now());
  return uid;
end $$;
create temp table t (k text primary key, id uuid);
grant select on t to authenticated;
create or replace function pg_temp.uid(k text) returns uuid language sql as $$ select id from t where t.k = uid.k $$;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('ho', pg_temp.new_user('ho15@test.dev', 'Ho Fifteen')),
                     ('bu', pg_temp.new_user('bu15@test.dev', 'Bu Fifteen')),
                     ('ad', pg_temp.new_user('ad15@test.dev', 'Ad Fifteen'));
update profiles set role = 'admin' where id = pg_temp.uid('ad');
insert into events (host_id, title, starts_at, capacity) values (pg_temp.uid('ho'), 'Paid Party', now() + interval '3 days', 2);

-- ── Setting a price ──────────────────────────────────────────────────────
select pg_temp.act_as('ho');
select throws_ok(format('select set_ticket_price(%s, 2000)', (select id from events where title = 'Paid Party')), '23514',
  'Set up payouts first (Settings → Payouts) so you can get paid.', 'No price until payouts are set up');
select pg_temp.admin();
select stripe_payout_account_set(pg_temp.uid('ho'), 'acct_test_ho');
select stripe_account_updated('acct_test_ho', true, true);
select is((select count(*)::int from notifications where user_id = pg_temp.uid('ho') and kind = 'payouts_ready'), 1, 'The host is told they can sell');
select pg_temp.act_as('ho');
select lives_ok(format('select set_ticket_price(%s, 2000)', (select id from events where title = 'Paid Party')), 'Set a $20 ticket');
select is((my_payout_status()->>'charges_enabled')::boolean, true, 'Payout status shows ready');
select pg_temp.act_as('bu');
select throws_ok(format('select set_ticket_price(%s, 100)', (select id from events where title = 'Paid Party')), '42501', null, 'Only the host sets the price');

-- ── Buying ───────────────────────────────────────────────────────────────
select throws_ok(format('insert into event_rsvps (event_id, user_id) values (%s, %L)', (select id from events where title = 'Paid Party'), pg_temp.uid('bu')),
  '23514', 'This is a ticketed event. Get a ticket to go.', 'Paid events: no free I''m In');
select throws_ok(format('select stripe_checkout_check(%s, %L)', (select id from events where title = 'Paid Party'), pg_temp.uid('bu')), '42501', null,
  'Members can''t call the Stripe functions');
select pg_temp.admin();
select is((stripe_checkout_check((select id from events where title = 'Paid Party'), pg_temp.uid('bu')))->>'fee_cents', '240', 'I''m In''s 12% of $20 is $2.40');
select is((stripe_checkout_check((select id from events where title = 'Paid Party'), pg_temp.uid('bu')))->>'destination', 'acct_test_ho', 'The rest goes to the host''s account');
select is(stripe_ticket_paid('cs_test_1', (select id from events where title = 'Paid Party'), pg_temp.uid('bu'), 2000, 240, 'pi_test_1'), 'ok', 'Stripe says paid: ticket recorded');
select is(stripe_ticket_paid('cs_test_1', (select id from events where title = 'Paid Party'), pg_temp.uid('bu'), 2000, 240, 'pi_test_1'), 'duplicate', 'The same payment twice is ignored');
select ok(exists (select 1 from event_rsvps where event_id = (select id from events where title = 'Paid Party') and user_id = pg_temp.uid('bu')), 'The buyer is in');
select pg_temp.act_as('bu');
select ok((event_detail((select id from events where title = 'Paid Party'))->>'has_ticket')::boolean, 'The event shows your ticket');
select pg_temp.act_as('ho');
select is((my_payout_status()->'sales'->>'host_cents')::int, 1760, 'The host sees $17.60 (after the 12% fee)');
select pg_temp.act_as('ad');
select ok((select fee_cents from admin_revenue() limit 1) >= 240, 'Admins see the fees kept (at least this sale''s $2.40)');

-- ── Refund ───────────────────────────────────────────────────────────────
select pg_temp.admin();
select stripe_ticket_refunded('pi_test_1');
select ok(not exists (select 1 from event_rsvps where event_id = (select id from events where title = 'Paid Party') and user_id = pg_temp.uid('bu')), 'Refunded: no longer going');

-- ── Sold out while paying: refunded ──────────────────────────────────────
update events set capacity = 1 where title = 'Paid Party';
insert into event_rsvps (event_id, user_id) select id, pg_temp.uid('ho') from events where title = 'Paid Party' on conflict do nothing;
select is(stripe_ticket_paid('cs_test_2', (select id from events where title = 'Paid Party'), pg_temp.uid('bu'), 2000, 240, 'pi_test_2'), 'overflow', 'Full: the ticket is marked for refund');
select is(stripe_ticket_paid('cs_test_2', (select id from events where title = 'Paid Party'), pg_temp.uid('bu'), 2000, 240, 'pi_test_2'), 'overflow', 'A repeat still asks for the refund');

-- ── Host refunds ─────────────────────────────────────────────────────────
select stripe_ticket_refunded('pi_test_1');
select is((select count(*)::int from notifications where user_id = pg_temp.uid('bu') and kind = 'ticket_refunded'), 1, 'A refund reported twice notifies once');
select is(stripe_refund_check((select id from event_tickets where stripe_payment_intent = 'pi_test_2'), pg_temp.uid('ho'))->>'payment_intent', 'pi_test_2', 'The host can refund their guest');
select is(stripe_refund_check((select id from event_tickets where stripe_payment_intent = 'pi_test_2'), pg_temp.uid('bu'))->>'error', 'Ticket not found.', 'Nobody else can');
select is(stripe_refund_check((select id from event_tickets where stripe_payment_intent = 'pi_test_1'), pg_temp.uid('ho'))->>'error', 'Already refunded.', 'No double refunds');
select pg_temp.act_as('ho');
select is((select count(*)::int from event_ticket_holders((select id from events where title = 'Paid Party'))), 2, 'The host sees who bought tickets');
select pg_temp.act_as('bu');
select throws_ok(format('select * from event_ticket_holders(%s)', (select id from events where title = 'Paid Party')), '42501', null, 'Guests can''t see the list');
select throws_ok(format('select stripe_refund_check(1, %L)', pg_temp.uid('bu')), '42501', null, 'Members can''t call the refund check');
select pg_temp.admin();

-- ── Premium through Stripe ───────────────────────────────────────────────
select ok(stripe_premium_paid(pg_temp.uid('bu'), now() + interval '31 days') > now() + interval '30 days', 'Premium paid for a month');
select pg_temp.act_as('bu');
select ok((my_plan()->>'is_premium')::boolean, 'Premium is on');

select * from finish();
rollback;
