-- Phase 5: message status, inbox, date requests (accept / counter / pass),
-- Date Mode (1-mile verification), check-ins, trusted contacts, help alerts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

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

insert into t values
  ('ana', pg_temp.new_user('ana8@test.dev', 'Ana Eight')),
  ('bo',  pg_temp.new_user('bo8@test.dev',  'Bo Eight')),
  ('cy',  pg_temp.new_user('cy8@test.dev',  'Cy Eight')),
  ('di',  pg_temp.new_user('di8@test.dev',  'Di Eight'));
-- ana–bo met through an intro (can message right away); ana–cy connected but no back-and-forths yet.
insert into connections (user_a, user_b, source) values
  (least(pg_temp.uid('ana'), pg_temp.uid('bo')), greatest(pg_temp.uid('ana'), pg_temp.uid('bo')), 'intro'),
  (least(pg_temp.uid('ana'), pg_temp.uid('cy')), greatest(pg_temp.uid('ana'), pg_temp.uid('cy')), 'manual');

-- ── Messaging ────────────────────────────────────────────────────────────
select pg_temp.act_as('ana');
select ok((message_status(pg_temp.uid('bo'))->>'can_message')::boolean, 'Intro connections can message right away');
select ok(not (message_status(pg_temp.uid('cy'))->>'can_message')::boolean, 'Other connections need back-and-forths first');
select is((message_status(pg_temp.uid('cy'))->>'needed')::int, 5, 'Status says how many back-and-forths are needed');
select lives_ok($$ select open_direct_conversation(pg_temp.uid('bo')) $$, 'Open a chat');
insert into messages (conversation_id, sender_id, body) values ((select open_direct_conversation(pg_temp.uid('bo'))), pg_temp.uid('ana'), 'hey bo');
select pg_temp.act_as('bo');
select is((select last_body from inbox() limit 1), 'hey bo', 'Inbox shows the last message');
select ok((select unread from inbox() limit 1), 'and marks it unread for the other person');

-- ── Date requests ────────────────────────────────────────────────────────
select pg_temp.act_as('ana');
select throws_ok($$ select send_date_request(pg_temp.uid('cy'), 'tonight') $$, '23514', 'You can only ask someone you can message.',
  'Date requests only go to people you can message');
select throws_ok($$ select send_date_request(pg_temp.uid('di'), 'tonight') $$, '23514', null, 'Strangers can''t be asked');
select lives_ok($$ select send_date_request(pg_temp.uid('bo'), 'this_weekend', p_vibe => 'drinks', p_place => 'Tail Up Goat') $$, 'Send a date request');
select throws_ok($$ select send_date_request(pg_temp.uid('bo'), 'tonight') $$, '23514', null, 'Only one waiting request at a time');
select pg_temp.act_as('bo');
select ok(exists (select 1 from notifications where user_id = pg_temp.uid('bo') and kind = 'date_request'), 'They get a notification');
select is((select date_request_detail(id)->>'label' from date_requests where to_id = pg_temp.uid('bo')), 'This weekend · Tail Up Goat', 'Readable summary');
select lives_ok($$ select counter_date_request((select id from date_requests where to_id = pg_temp.uid('bo') and status = 'pending'), 'tonight', p_place => 'Songbyrd') $$,
  'Suggest a different time');
select is((select status::text from date_requests where to_id = pg_temp.uid('bo') and place_text = 'Tail Up Goat'), 'countered', 'The original is marked countered');
select is((select place_text from date_requests where to_id = pg_temp.uid('ana') and status = 'pending'), 'Songbyrd', 'The suggestion''s new spot is used');
select pg_temp.act_as('ana');
select is(respond_date_request((select id from date_requests where to_id = pg_temp.uid('ana') and status = 'pending'), true), 'accepted', 'The counter is accepted');
select pg_temp.admin();
select ok(exists (select 1 from notifications where user_id = pg_temp.uid('bo') and kind = 'date_accepted'), 'It''s a date: they''re told');

-- Passing is graceful.
select pg_temp.act_as('bo');
select send_date_request(pg_temp.uid('ana'), 'next_week');
select pg_temp.act_as('ana');
select is(respond_date_request((select id from date_requests where to_id = pg_temp.uid('ana') and status = 'pending'), false), 'passed', 'Pass');
select pg_temp.admin();
select is((select body from notifications where user_id = pg_temp.uid('bo') and kind = 'date_passed' limit 1),
  'No explanation needed. Passing is always okay on I''m In.', 'The sender just hears it didn''t happen, no details');

-- ── Date Mode ────────────────────────────────────────────────────────────
select pg_temp.act_as('ana');
select throws_ok($$ select start_date_mode(pg_temp.uid('di'), 38.9, -77.0, 10) $$, '23514', null, 'Only with someone you connected with');
select lives_ok($$ select start_date_mode(pg_temp.uid('bo'), 38.9000, -77.0000, 10) $$, 'Start Date Mode');
select is(date_mode_status()->>'status', 'waiting', 'Waiting for your date to confirm');
select is(date_mode_status()->>'problem', 'Bo E. hasn''t confirmed yet.', 'The screen says why it isn''t on yet');
select pg_temp.act_as('bo');
select is((confirm_date_mode((select id from date_sessions limit 1), 38.9500, -77.0000, 10))->>'status', 'waiting',
  'Too far apart (3.4 mi): does not activate');
select ok((date_mode_status()->>'problem') like 'You''re 3.4 mi apart%', 'and says how far apart you are');
select is((confirm_date_mode((select id from date_sessions limit 1), 38.9050, -77.0000, 10))->>'status', 'active',
  'Within 1 mile: Date Mode is on');
select isnt(date_mode_status()->>'next_checkin_at', null, 'Check-in timer is running');

-- Missed check-ins are flagged.
select pg_temp.admin();
update date_session_members set next_checkin_at = now() - interval '1 minute' where user_id = pg_temp.uid('ana');
select private.flag_missed_checkins();
select ok(exists (select 1 from safety_checkins where user_id = pg_temp.uid('ana') and kind = 'missed'), 'A missed check-in is recorded and the person is reminded');

-- ── Trusted contacts + help ──────────────────────────────────────────────
select pg_temp.act_as('ana');
select throws_ok($$ insert into trusted_contacts (user_id, name, phone) values (auth.uid(), 'Mom', '202-555-0102') $$, '23514', null,
  'Phone numbers must be in +1… format');
insert into trusted_contacts (user_id, name, phone) values (pg_temp.uid('ana'), 'Mom', '+12025550102');
select is(jsonb_array_length(raise_safety_alert('unsafe', 38.9, -77.0)->'contacts'), 1, '"I feel unsafe" returns who to text');
select is((select level::text from safety_alerts where user_id = pg_temp.uid('ana') and resolved_at is null), 'unsafe', 'The alert is recorded');

select * from finish();
rollback;
