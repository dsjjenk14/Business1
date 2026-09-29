-- The launch batch: launch-mode switches, private plans, Friday Drop, the
-- admin launch numbers, chat polls, and event cover photos.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

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

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('a', pg_temp.new_user('a28@test.dev', 'Ava TwentyEight')),
                     ('b', pg_temp.new_user('b28@test.dev', 'Ben TwentyEight')),
                     ('c', pg_temp.new_user('c28@test.dev', 'Cam TwentyEight'));
insert into connections (user_a, user_b, source) values (least(pg_temp.uid('a'), pg_temp.uid('b')), greatest(pg_temp.uid('a'), pg_temp.uid('b')), 'manual');

-- ── Launch mode: drinks and online events are off ─────────────────────────
select pg_temp.admin();
with x as (insert into events (host_id, title, starts_at) values (pg_temp.uid('a'), 'Rooftop night 28', now() + interval '1 day') returning id)
insert into ids select 'ev', id from x;
select pg_temp.act_as('b');
select throws_ok('select send_drink(''old_fashioned'', null, null, false)', '23514', 'Drinks aren''t on yet.', 'Drinks are off for launch');
select pg_temp.act_as('a');
select throws_ok(format('select set_event_virtual(%s, ''virtual'', ''video'', null)', pg_temp.id('ev')), '23514', 'Online events aren''t on yet.', 'Online events are off for launch');
select pg_temp.admin();
select is(event_room_join_check(pg_temp.id('ev'), pg_temp.uid('a'))->>'error', 'Online events aren''t on yet.', 'Online rooms won''t open');
select is((select value #>> '{}' from app_config where key = 'live_video_enabled'), 'false', 'Live video stays off too');

-- ── Private by default ────────────────────────────────────────────────────
select col_default_is('public', 'going_out_posts', 'audience', 'network', 'New plans start with Insiders and their Insiders');

-- ── Friday Drop ───────────────────────────────────────────────────────────
select is(private.friday_drop_lines(pg_temp.uid('b')), 'Rooftop night 28', 'Ben''s drop has Ava''s event');
select is(private.friday_drop_lines(pg_temp.uid('a')), null, 'Your own events aren''t in your drop');
update user_settings set friday_drop = false where user_id = pg_temp.uid('c');
select lives_ok('select private.send_friday_drop()', 'The drop sends');
select is((select link from notifications where user_id = pg_temp.uid('b') and kind = 'friday_drop' order by id desc limit 1), '/whats-in', 'Ben gets it, and it opens What''s In');
with x as (insert into events (host_id, title, starts_at) values (pg_temp.uid('b'), 'Open mic 28', now() + interval '2 days') returning id)
insert into ids select 'ev2', id from x;
select private.send_friday_drop();
select is((select count(*)::int from notifications where user_id = pg_temp.uid('c') and kind = 'friday_drop'), 0, 'Turned off: no drop');

-- ── Launch numbers (admins only) ──────────────────────────────────────────
select pg_temp.act_as('a');
select throws_ok('select launch_metrics()', '42501', null, 'Members can''t see the launch numbers');
select pg_temp.admin();
update profiles set role = 'admin' where id = pg_temp.uid('c');
select pg_temp.act_as('c');
select ok((launch_metrics() ->> 'members')::int >= 3, 'Admins see the launch numbers');
select ok(launch_metrics() ? 'nights_out_7d' and launch_metrics() ? 'week4_pct' and launch_metrics() ? 'activation_pct', 'Nights out, activation and week 4 are there');

-- ── Polls in chats ────────────────────────────────────────────────────────
select pg_temp.admin();
with x as (insert into conversations (kind) values ('chat') returning id) insert into ids select 'conv', id from x;
insert into conversation_members (conversation_id, user_id) values (pg_temp.id('conv'), pg_temp.uid('a')), (pg_temp.id('conv'), pg_temp.uid('b'));
select pg_temp.act_as('c');
select throws_ok(format('select create_chat_poll(%s, ''Where?'', array[''A'',''B''])', pg_temp.id('conv')), '42501', null, 'Only people in the chat can start a poll');
select pg_temp.act_as('a');
select throws_ok(format('select create_chat_poll(%s, ''Where?'', array[''A'', ''  ''])', pg_temp.id('conv')), '23514', 'Give 2 to 4 choices.', 'A poll needs 2 real choices');
insert into ids select 'poll', create_chat_poll(pg_temp.id('conv'), '', array['U Street', 'The Wharf', 'Navy Yard']);
select pg_temp.admin();
select is((select body from messages where poll_id = pg_temp.id('poll')), 'Where tonight?', 'It posts in the chat, "Where tonight?" by default');
select pg_temp.act_as('b');
select lives_ok(format('select vote_chat_poll(%s, 1)', pg_temp.id('poll')), 'Ben votes');
select pg_temp.act_as('a');
select lives_ok(format('select vote_chat_poll(%s, 1)', pg_temp.id('poll')), 'Ava votes');
select is(chat_poll(pg_temp.id('poll'))->'counts', '[0, 2, 0]'::jsonb, 'Counts per choice');
select lives_ok(format('select vote_chat_poll(%s, 0)', pg_temp.id('poll')), 'Ava switches');
select is(chat_poll(pg_temp.id('poll'))->'counts', '[1, 1, 0]'::jsonb, 'Switching moves the vote');
select lives_ok(format('select vote_chat_poll(%s, 0)', pg_temp.id('poll')), 'Ava taps it again');
select is((chat_poll(pg_temp.id('poll'))->>'mine'), null, 'Tapping your choice again takes it back');
select throws_ok(format('select vote_chat_poll(%s, 3)', pg_temp.id('poll')), '23514', null, 'Only real choices');
select pg_temp.act_as('c');
select is(chat_poll(pg_temp.id('poll')), null, 'People outside the chat can''t see it');

-- ── Event cover photos ────────────────────────────────────────────────────
select pg_temp.act_as('b');
select throws_ok(format('select set_event_cover(%s, ''http://x/storage/v1/object/public/event-covers/%s/c.jpg'')', pg_temp.id('ev'), pg_temp.uid('b')), '42501', null, 'Only the host sets the cover');
select pg_temp.act_as('a');
select throws_ok(format('select set_event_cover(%s, ''https://elsewhere.example/c.jpg'')', pg_temp.id('ev')), '23514', null, 'Only photos uploaded to I''m In');
select lives_ok(format('select set_event_cover(%s, ''http://x/storage/v1/object/public/event-covers/%s/c.jpg'')', pg_temp.id('ev'), pg_temp.uid('a')), 'The host sets a cover');
select pg_temp.act_as('b');
select ok(event_detail(pg_temp.id('ev'))->>'cover_url' like '%/event-covers/%', 'Everyone sees it on the event');

select * from finish();
rollback;
