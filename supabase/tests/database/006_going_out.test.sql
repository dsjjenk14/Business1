-- Phase 4: going out (tonight/weekend feed), events (capacity, check-in window,
-- recap tags), groups (create needs a verified phone, invites, join requests,
-- group chat membership kept in sync).
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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
  ('ana', pg_temp.new_user('ana6@test.dev', 'Ana Six')),
  ('bo',  pg_temp.new_user('bo6@test.dev',  'Bo Six')),
  ('cy',  pg_temp.new_user('cy6@test.dev',  'Cy Six')),
  ('di',  pg_temp.new_user('di6@test.dev',  'Di Six')),
  ('far', pg_temp.new_user('far6@test.dev', 'Far Six'));
-- ana–bo connected; cy and di are strangers nearby; far is a stranger far away.
insert into connections (user_a, user_b, source) values
  (least(pg_temp.uid('ana'), pg_temp.uid('bo')), greatest(pg_temp.uid('ana'), pg_temp.uid('bo')), 'manual');
insert into venues (name, neighborhood, location) values
  ('Test Hall', 'Testville', extensions.st_setsrid(extensions.st_makepoint(-77.30, 38.60), 4326)::extensions.geography);
update user_settings set show_going_out_venue = false where user_id = pg_temp.uid('di');

-- ── Going out ────────────────────────────────────────────────────────────
select pg_temp.act_as('bo');
select lives_ok($$ select post_going_out('tonight', p_place => 'Rooftop', p_vibes => array['drinks'], p_lat => 38.60, p_lng => -77.30) $$, 'Post "going out tonight"');
select ok(exists (select 1 from pins where author_id = pg_temp.uid('bo') and category = 'going_out'), 'It also drops a going-out pin');
select pg_temp.act_as('cy');
select post_going_out('weekend', p_place => 'Brunch spot', p_lat => 38.61, p_lng => -77.31);
select pg_temp.act_as('di');
select post_going_out('tonight', p_place => 'Secret bar', p_lat => 38.60, p_lng => -77.30);
select pg_temp.act_as('far');
select post_going_out('tonight', p_place => 'Far away', p_lat => 40.70, p_lng => -74.00);

select pg_temp.act_as('ana');
select ok((select going_out_feed('tonight', 38.60, -77.30, 10)->'people' @> jsonb_build_array(jsonb_build_object('display_name', 'Bo S.', 'degree', 1))),
  'Tonight shows my circle with their degree');
select ok(not (select going_out_feed('tonight', 38.60, -77.30, 10)->'people' @> '[{"display_name":"Cy S."}]'), 'Weekend plans stay off Tonight');
select ok((select going_out_feed('weekend', 38.60, -77.30, 10)->'people' @> '[{"display_name":"Cy S."}]'), 'They show under This Weekend');
select ok(not (select going_out_feed('tonight', 38.60, -77.30, 10)->'people' @> '[{"display_name":"Far S."}]'), 'Strangers outside the radius are hidden');
select is((select x->>'place' from jsonb_array_elements(going_out_feed('tonight', 38.60, -77.30, 10)->'people') x where x->>'display_name' = 'Di S.'),
  null, 'Venue hidden when the member turned off "show my venue"');
select is((select (going_out_feed('tonight', 38.60, -77.30, 500)->>'radius_mi')::int), 10, 'Free plan radius is capped at 10 miles');
select is((select count(*)::int from going_out_posts), 0, 'Other people''s posts can''t be read directly (only through the feed)');
select pg_temp.act_as('bo');
select post_going_out('tonight', p_place => 'Changed plans', p_lat => 38.60, p_lng => -77.30);
select is((select count(*)::int from going_out_posts where user_id = pg_temp.uid('bo') and expires_at > now()), 1, 'A new tonight post replaces the earlier one');

-- ── Events ───────────────────────────────────────────────────────────────
select pg_temp.act_as('bo');
select create_event('Small dinner', now() + interval '30 minutes', (select id from venues where name = 'Test Hall'), p_capacity => 2);
select is((select count(*)::int from event_rsvps where event_id = (select id from events where title = 'Small dinner')), 1, 'The host is going automatically');
select pg_temp.act_as('ana');
select lives_ok($$ insert into event_rsvps (event_id, user_id) values ((select id from events where title = 'Small dinner'), pg_temp.uid('ana')) $$, 'RSVP');
select pg_temp.act_as('cy');
select throws_ok($$ insert into event_rsvps (event_id, user_id) values ((select id from events where title = 'Small dinner'), pg_temp.uid('cy')) $$,
  '23514', 'This event is full.', 'RSVPs stop at capacity');
select ok((select going_out_feed('tonight', 38.60, -77.30, 10)->'events' @> '[{"title":"Small dinner"}]'), 'Tonight lists nearby events');
select pg_temp.act_as('bo');
select create_event('Next week', now() + interval '6 days', null);
select pg_temp.act_as('ana');
select throws_ok($$ select event_check_in((select id from events where title = 'Next week'), 38.60, -77.30) $$, '23514', null,
  'Event check-in only opens around the event');
select lives_ok($$ select event_check_in((select id from events where title = 'Small dinner'), 38.60, -77.30, 20) $$, 'Check in at the event');
select pg_temp.act_as('cy');
select throws_ok($$ select post_recap((select id from events where title = 'Small dinner'), 'Great night') $$, '23514',
  'Only people who went can post a recap.', 'Only people who went can post a recap');
select pg_temp.act_as('ana');
select post_recap((select id from events where title = 'Small dinner'), 'Great night', array[pg_temp.uid('bo'), pg_temp.uid('cy')]);
select is((select array_agg(user_id) from pin_tags where pin_id = (select id from pins where body = 'Great night')), array[pg_temp.uid('bo')],
  'Recap tags only people who went');

-- ── Groups ───────────────────────────────────────────────────────────────
select pg_temp.act_as('ana');
select throws_ok($$ select create_group('Run Club', 'fitness') $$, '23514', null, 'Creating a group needs a verified phone');
select pg_temp.admin();
update profile_private set phone_verified_at = now() where id = pg_temp.uid('ana');
select pg_temp.act_as('ana');
select lives_ok($$ select create_group('Run Club', 'fitness', 'Saturday runs', 'request', p_invite => array[pg_temp.uid('bo'), pg_temp.uid('cy')]) $$,
  'Verified member creates a group and invites their circle');
select is((select count(*)::int from group_invites where group_id = (select id from groups where name = 'Run Club')), 1,
  'Only people in your circle can be invited');
select pg_temp.act_as('bo');
select is(join_group((select id from groups where name = 'Run Club')), 'joined', 'Invited member joins instantly');
select pg_temp.act_as('cy');
select throws_ok($$ select join_group((select id from groups where name = 'Run Club')) $$, '23514', null, 'Request-only groups can''t be joined directly');
select request_join_group((select id from groups where name = 'Run Club'), 'I run every Saturday', 'search');
select pg_temp.act_as('ana');
select review_join_request((select id from group_join_requests where user_id = pg_temp.uid('cy')), true);
select is((select count(*)::int from conversation_members cm join conversations c on c.id = cm.conversation_id
           where c.group_id = (select id from groups where name = 'Run Club')), 3, 'Group chat includes every member');
select pg_temp.act_as('cy');
select leave_group((select id from groups where name = 'Run Club'));
select is(conversation_info((select id from conversations where group_id = (select id from groups where name = 'Run Club'))), null,
  'Leaving the group removes you from its chat');
select pg_temp.act_as('bo');
select lives_ok($$ insert into messages (conversation_id, sender_id, body)
  values ((select id from conversations where group_id = (select id from groups where name = 'Run Club')), pg_temp.uid('bo'), 'See you Saturday') $$,
  'Members can post in the group chat');

select * from finish();
rollback;
