-- Follow, the Friends feed, sharing an event, usage counts, and home_feed().
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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
insert into t values ('fa', pg_temp.new_user('fa13@test.dev', 'Fa Thirteen')),
                     ('go', pg_temp.new_user('go13@test.dev', 'Go Thirteen')),
                     ('ha', pg_temp.new_user('ha13@test.dev', 'Ha Thirteen'));
insert into pins (author_id, category, body, audience) values
  (pg_temp.uid('go'), 'thought', 'go public pin', 'everyone'),
  (pg_temp.uid('go'), 'thought', 'go circle pin', 'circle');

-- ── Follow ───────────────────────────────────────────────────────────────
select pg_temp.act_as('fa');
select ok(not exists (select 1 from pins_feed('friends') where body = 'go public pin'), 'Before following: not in your Friends feed');
select lives_ok(format('select follow_user(%L)', pg_temp.uid('go')), 'Follow someone');
select ok(exists (select 1 from pins_feed('friends') where body = 'go public pin'), 'Their Everyone pins show in Friends');
select ok(not exists (select 1 from pins_feed('friends') where body = 'go circle pin'), 'Following never shows circle-only pins');
select is((follow_info(pg_temp.uid('go'))->>'followers')::int, 1, 'Follower count');
select ok((follow_info(pg_temp.uid('go'))->>'i_follow')::boolean, 'You follow them');
select ok(not (select (message_status(pg_temp.uid('go'))->>'can_message')::boolean), 'Following doesn''t unlock messaging');
select throws_ok(format('select follow_user(%L)', pg_temp.uid('fa')), '23514', null, 'You can''t follow yourself');
select pg_temp.admin();
select is((select count(*)::int from notifications where user_id = pg_temp.uid('go') and kind = 'follow'), 1, 'They''re told');
insert into blocks (blocker_id, blocked_id) values (pg_temp.uid('go'), pg_temp.uid('fa'));
select is((select count(*)::int from follows where follower_id = pg_temp.uid('fa') or followee_id = pg_temp.uid('fa')), 0, 'Blocking ends the follow');

-- ── Share an event ───────────────────────────────────────────────────────
insert into events (host_id, title, starts_at) values (pg_temp.uid('ha'), 'Rooftop Friday', now() + interval '1 day');
select pg_temp.act_as('fa');
select isnt(share_event((select id from events where title = 'Rooftop Friday')), null, 'Share an event to your circle');
select pg_temp.admin();
select is((select audience::text || '/' || category::text from pins where author_id = pg_temp.uid('fa')), 'circle/event', 'It''s a circle-only event pin');
select pg_temp.act_as('fa');
select throws_ok(format('select share_event(%s)', (select id from events where title = 'Rooftop Friday')), '23514', 'You already shared this event.', 'Sharing twice is blocked');
select is((select event_title from pins_feed('friends') where event_id is not null limit 1), 'Rooftop Friday', 'The feed carries the event, for the I''m In button');
select pg_temp.admin();

-- ── Usage counts ─────────────────────────────────────────────────────────
select pg_temp.act_as('fa');
select lives_ok($$ select track('home_opened', '{"scope":"friends"}') $$, 'Track a feature use');
select throws_ok($$ select track('Not A Name!') $$, '23514', null, 'Only simple event names');
select throws_ok($$ select admin_usage() $$, '42501', 'Admins only.', 'Only admins read usage');

-- ── Home ─────────────────────────────────────────────────────────────────
select ok(home_feed() ?& array['people', 'live', 'events', 'pins', 'group_chats', 'circle_count', 'me'], 'Home comes back in one request');

select * from finish();
rollback;
