-- Phase 3 rules: GPS check-in → meetups, vouch window + notifications, vouch
-- requests, intros (both accept → connected + can message), intro requests, search.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create or replace function pg_temp.new_user(p_email text, p_name text) returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '',
          jsonb_build_object('full_name', p_name, 'birthdate', '1990-01-01'), now(), now());
  return uid;
end $$;
create temp table t (k text primary key, id uuid);
grant select on t to authenticated;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from t where t.k = act_as.k), 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;
create or replace function pg_temp.uid(k text) returns uuid language sql as $$ select id from t where t.k = uid.k $$;

insert into t values
  ('ana', pg_temp.new_user('ana3@test.dev', 'Ana Three')),
  ('bo',  pg_temp.new_user('bo3@test.dev',  'Bo Three')),
  ('cy',  pg_temp.new_user('cy3@test.dev',  'Cy Three')),
  ('di',  pg_temp.new_user('di3@test.dev',  'Di Three')),
  ('ed',  pg_temp.new_user('ed3@test.dev',  'Ed Three'));
-- Graph: ana–bo, bo–cy (so cy is ana's 2nd degree via bo), di is a stranger.
insert into connections (user_a, user_b, source) values
  (least(pg_temp.uid('ana'), pg_temp.uid('bo')), greatest(pg_temp.uid('ana'), pg_temp.uid('bo')), 'manual'),
  (least(pg_temp.uid('bo'), pg_temp.uid('cy')),  greatest(pg_temp.uid('bo'), pg_temp.uid('cy')),  'manual');

-- ── Check-in → meetup ────────────────────────────────────────────────────
select pg_temp.act_as('ana');
select is((select count(*)::int from check_in(38.7500, -77.5000, 20)), 0, 'First to check in: nobody else here yet');
select pg_temp.act_as('bo');
select is((select display_name from check_in(38.75005, -77.50005, 15)), 'Ana T.', 'Second person checking in nearby sees the first (meetup recorded)');
select pg_temp.admin();
select is((select place_label from encounters where user_a = least(pg_temp.uid('ana'), pg_temp.uid('bo')) and user_b = greatest(pg_temp.uid('ana'), pg_temp.uid('bo'))),
  null::text, 'No venue nearby: meetup has no place label');
select ok(exists (select 1 from notifications where user_id = pg_temp.uid('ana') and kind = 'meetup'), 'The first person is notified that they can vouch');
select pg_temp.act_as('di');
select is((select count(*)::int from check_in(38.7850, -77.5000, 20)), 0, 'Someone 4 km away is not part of the meetup');
select throws_ok($$ select * from check_in(38.7500, -77.5000, 900) $$, '23514', null, 'A very weak GPS fix is rejected');
select pg_temp.act_as('ana');
select is((select count(*)::int from location_pings), 0, 'Raw GPS readings stay unreadable, even your own');

-- ── Vouching from the meetup ─────────────────────────────────────────────
select lives_ok(
  format($$ insert into vouches (voucher_id, vouchee_id, type, word_id, encounter_id) values (%L, %L, 'gps', 1, %s) $$,
    pg_temp.uid('ana'), pg_temp.uid('bo'), (select encounter_id from my_recent_meetups() where user_id = pg_temp.uid('bo'))),
  'Ana vouches for Bo from their meetup');
select ok((select already_vouched from my_recent_meetups() where user_id = pg_temp.uid('bo')), 'The meetup now shows as vouched');
select pg_temp.admin();
select ok(exists (select 1 from notifications where user_id = pg_temp.uid('bo') and kind = 'vouch'), 'Bo is notified about the vouch');
update encounters set overlap_start = now() - interval '20 days', overlap_end = now() - interval '20 days'
 where user_a = least(pg_temp.uid('ana'), pg_temp.uid('bo')) and user_b = greatest(pg_temp.uid('ana'), pg_temp.uid('bo'));
select pg_temp.act_as('bo');
select throws_ok(
  format($$ insert into vouches (voucher_id, vouchee_id, type, word_id, encounter_id) values (%L, %L, 'gps', 2, %s) $$,
    pg_temp.uid('bo'), pg_temp.uid('ana'), (select id from encounters where least(pg_temp.uid('ana'), pg_temp.uid('bo')) = user_a limit 1)),
  '23514', 'That meetup was too long ago to vouch from. Meet up again and check in together.', 'Vouching is only possible within 14 days of the meetup');

-- ── Vouch requests ───────────────────────────────────────────────────────
select pg_temp.act_as('ana');
select throws_ok(format($$ select request_vouch(%L) $$, pg_temp.uid('di')), '23514', null, 'You can''t ask a stranger you never met for a vouch');

-- ── Intros ───────────────────────────────────────────────────────────────
select pg_temp.act_as('bo');   -- Bo knows both Ana (1st) and Cy (1st)
select throws_ok(format($$ select make_intro(%L, %L, '') $$, pg_temp.uid('ana'), pg_temp.uid('cy')), '23514', null, 'An intro needs a reason');
select lives_ok(format($$ select make_intro(%L, %L, 'You both love dinner parties') $$, pg_temp.uid('ana'), pg_temp.uid('cy')), 'Bo introduces Ana and Cy');
select throws_ok(format($$ select make_intro(%L, %L, 'again') $$, pg_temp.uid('ana'), pg_temp.uid('cy')), '23514', null, 'No duplicate intro while one is waiting');
select pg_temp.act_as('di');
select throws_ok(format($$ select make_intro(%L, %L, 'hi') $$, pg_temp.uid('ana'), pg_temp.uid('cy')), '23514', null, 'Strangers can''t introduce people');

select pg_temp.act_as('ana');
select is(respond_intro((select id from intros where connector_id = pg_temp.uid('bo')), true), 'waiting', 'One side accepting: still waiting');
select pg_temp.act_as('cy');
select is(respond_intro((select id from intros where connector_id = pg_temp.uid('bo')), true), 'connected', 'Both accept: connected');
select pg_temp.admin();
select ok(private.can_message(pg_temp.uid('ana'), pg_temp.uid('cy')), 'Introduced people can message right away (free plan)');
select ok(exists (select 1 from notifications where user_id = pg_temp.uid('bo') and kind = 'intro_success'), 'The connector gets credit (notified)');

-- ── Intro requests + search ──────────────────────────────────────────────
insert into connections (user_a, user_b, source) values
  (least(pg_temp.uid('cy'), pg_temp.uid('ed')), greatest(pg_temp.uid('cy'), pg_temp.uid('ed')), 'manual');
update user_settings set allow_intro_requests = false where user_id = pg_temp.uid('ed');
select pg_temp.act_as('ana');
select throws_ok(format($$ select request_intro(%L, %L) $$, pg_temp.uid('ed'), pg_temp.uid('cy')), '23514',
  'This member isn''t taking intro requests right now.', 'Members can turn off intro requests');
select pg_temp.admin();
update user_settings set discoverable = false where user_id = pg_temp.uid('di');
select pg_temp.act_as('ana');
select is((select count(*)::int from search_members('Di Three')), 0, 'Undiscoverable strangers don''t show in search');

select * from finish();
rollback;
