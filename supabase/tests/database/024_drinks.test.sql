-- Drinks: credit, sending to whoever is live, host earnings, cash-outs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

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
create temp table ids (k text primary key, id bigint);
grant select, insert on ids to authenticated;
create or replace function pg_temp.uid(k text) returns uuid language sql as $$ select id from t where t.k = uid.k $$;
create or replace function pg_temp.id(k text) returns bigint language sql as $$ select id from ids where ids.k = id.k $$;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;

insert into t values ('h', pg_temp.new_user('h24@test.dev', 'Hana TwentyFour')),
                     ('g', pg_temp.new_user('g24@test.dev', 'Gus TwentyFour')),
                     ('o', pg_temp.new_user('o24@test.dev', 'Oli TwentyFour'));
insert into groups (name, category, owner_id) values ('Drinks Crew', 'social', pg_temp.uid('h'));
insert into ids select 'grp', id from groups where name = 'Drinks Crew';
insert into group_members (group_id, user_id, role) values (pg_temp.id('grp'), pg_temp.uid('h'), 'owner') on conflict do nothing;
select pg_temp.act_as('h');
insert into ids values ('ev', create_event('Live show', now() + interval '5 minutes', p_group => pg_temp.id('grp')));
select set_event_virtual(pg_temp.id('ev'), 'virtual', 'stream');
select pg_temp.admin();
insert into event_rsvps (event_id, user_id) values (pg_temp.id('ev'), pg_temp.uid('g'));

select pg_temp.act_as('g');
select is((select count(*)::int from drink_menu), 8, 'Eight cocktails on the menu');
select is((my_wallet()->>'balance_cents')::int, 0, 'Everyone starts with no credit');
select throws_ok(format($q$select send_drink('margarita', null, %s)$q$, pg_temp.id('ev')), '23514', 'Add drink credit to send this.', 'No credit, no drink');
select throws_ok(format($q$select wallet_credit(%L, 100000, 'cs_free')$q$, pg_temp.uid('g')), '42501', null, 'Nobody can give themselves credit');
select throws_ok(format($q$update wallets set balance_cents = 100000 where user_id = %L$q$, pg_temp.uid('g')), '42501', null, 'Or edit their balance');

select pg_temp.admin();
select ok(wallet_credit(pg_temp.uid('g'), 1000, 'cs_test_1'), 'A paid checkout adds credit');
select ok(not wallet_credit(pg_temp.uid('g'), 1000, 'cs_test_1'), 'Only once per checkout');

select pg_temp.act_as('g');
select is((send_drink('margarita', null, pg_temp.id('ev'))->>'balance_cents')::int, 700, 'Send a $3 Margarita');
select throws_ok(format($q$select send_drink('moonshine', null, %s)$q$, pg_temp.id('ev')), '23514', null, 'Only drinks on the menu');
select throws_ok($$select send_drink('mojito')$$, '23514', null, 'It has to go to someone live');
select is((select count(*)::int from drink_gifts), 1, 'You see drinks you sent');
select pg_temp.act_as('h');
select is((my_wallet()->>'available_cents')::int, 210, 'The host earns 70%');
select throws_ok(format($q$select send_drink('mojito', null, %s)$q$, pg_temp.id('ev')), '23514', null, 'Not to yourself');
select pg_temp.admin();
select is((select title from notifications where user_id = pg_temp.uid('h') and kind = 'drink'), 'Gus T. sent you a Margarita', 'The host is told');

select pg_temp.act_as('o');
select throws_ok(format($q$select send_drink('mojito', null, %s)$q$, pg_temp.id('ev')), '23514', null, 'Only people in the room');
select is((select count(*)::int from drink_gifts), 0, 'And others don''t see the drinks');

select pg_temp.admin();
update app_config set value = '1' where key = 'drinks_per_minute';
select pg_temp.act_as('g');
select throws_ok(format($q$select send_drink('mojito', null, %s)$q$, pg_temp.id('ev')), '23514', 'Slow down a little. Try again in a minute.', 'A limit per minute');

-- Cash-outs
select pg_temp.admin();
select is(drink_cashout_start(pg_temp.uid('h'))->>'error', 'Set up payouts first.', 'Payouts first');
insert into payout_accounts (user_id, stripe_account_id, charges_enabled, payouts_enabled) values (pg_temp.uid('h'), 'acct_test_24', true, true);
select is(drink_cashout_start(pg_temp.uid('h'))->>'error', 'You can cash out once you have $10.00.', 'A minimum to cash out');
update app_config set value = '100' where key = 'drink_cashout_min_cents';
insert into ids select 'c1', (drink_cashout_start(pg_temp.uid('h'))->>'cashout_id')::bigint;
select drink_cashout_done(pg_temp.id('c1'), null, false);
select is((select available_cents from drink_earnings where user_id = pg_temp.uid('h')), 210, 'A failed transfer puts the money back');
insert into ids select 'c2', (drink_cashout_start(pg_temp.uid('h'))->>'cashout_id')::bigint;
select drink_cashout_done(pg_temp.id('c2'), 'tr_test', true);
select is((select status from drink_cashouts where id = pg_temp.id('c2')), 'paid', 'A good one is paid');
select is((select available_cents from drink_earnings where user_id = pg_temp.uid('h')), 0, 'And the balance is empty');

select * from finish();
rollback;
