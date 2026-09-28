-- Interests, People like you, what the AI may see, intro odds, and AI uses.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

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
grant select on ids to authenticated;
create or replace function pg_temp.uid(k text) returns uuid language sql as $$ select id from t where t.k = uid.k $$;
create or replace function pg_temp.id(k text) returns bigint language sql as $$ select id from ids where ids.k = id.k $$;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;
create or replace function pg_temp.connect(a text, b text) returns void language sql as $$
  insert into connections (user_a, user_b, source)
  values (least(pg_temp.uid(a), pg_temp.uid(b)), greatest(pg_temp.uid(a), pg_temp.uid(b)), 'manual')
$$;
-- People like you for Ann, as a set of keys.
create or replace function pg_temp.likes() returns text[] language sql as $$
  select coalesce(array_agg(t.k order by t.k), '{}') from jsonb_array_elements(people_like_you(30)) x join t on t.id = (x->>'user_id')::uuid
$$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('a', pg_temp.new_user('a20@test.dev', 'Ann Twenty')),
                     ('b', pg_temp.new_user('b20@test.dev', 'Bo Twenty')),
                     ('c', pg_temp.new_user('c20@test.dev', 'Cy Twenty')),
                     ('d', pg_temp.new_user('d20@test.dev', 'Di Twenty')),
                     ('e', pg_temp.new_user('e20@test.dev', 'Eve Twenty')),
                     ('f', pg_temp.new_user('f20@test.dev', 'Fin Twenty')),
                     ('h', pg_temp.new_user('h20@test.dev', 'Hal Twenty')),
                     ('k', pg_temp.new_user('k20@test.dev', 'Kit Twenty'));
-- Everyone lives in a city no demo member does, so the matches are only these people.
update profiles set city_id = (select id from cities where slug = 'college-park-md') where id in (select id from t);
select pg_temp.connect('a', 'b');   -- Bo is Ann's friend
select pg_temp.connect('b', 'c');   -- so Cy is one intro away
insert into groups (name, category, owner_id) values ('Twenty Club', 'social', pg_temp.uid('d'));
insert into ids select 'group', id from groups where owner_id = pg_temp.uid('d');
insert into group_members (group_id, user_id, role) values (pg_temp.id('group'), pg_temp.uid('d'), 'owner'), (pg_temp.id('group'), pg_temp.uid('a'), 'member')
  on conflict do nothing;

-- ── Interests ─────────────────────────────────────────────────────────────
select pg_temp.act_as('a');
select throws_ok(format($q$update profiles set interests = '{nope}' where id = %L$q$, pg_temp.uid('a')), '23514', 'Pick interests from the list.', 'Only interests from the list');
update profiles set interests = '{jazz,brunch,jazz,pickleball}' where id = pg_temp.uid('a');
select is((select interests from profiles where id = pg_temp.uid('a')), '{brunch,jazz,pickleball}'::text[], 'Doubles are dropped');
select throws_ok(format($q$update profiles set interests = '{brunch,foodie,cocktails,wine,rooftops,happy_hour,cooking,coffee,live_music,hip_hop,rnb,jazz,go_go}' where id = %L$q$, pg_temp.uid('a')),
  '23514', null, 'Up to 12');
select is((select count(*)::int from interest_options), 46, 'Anyone can read the list');
select pg_temp.admin();
update profiles set interests = '{jazz}' where id = pg_temp.uid('c');
update profiles set interests = '{brunch,pickleball}' where id = pg_temp.uid('e');
update profiles set interests = '{golf}' where id = pg_temp.uid('f');
update profiles set interests = '{brunch}' where id in (pg_temp.uid('h'), pg_temp.uid('k'));

-- ── People like you ───────────────────────────────────────────────────────
select pg_temp.act_as('a');
select is(pg_temp.likes(), '{c,d,e,h,k}'::text[], 'Your 2nd degree, your groups, and people nearby who share an interest');
select is((select x->>'user_id' from jsonb_array_elements(people_like_you()) x limit 1), pg_temp.uid('e')::text, 'Most in common first');
select is((select x->'via'->>'id' from jsonb_array_elements(people_like_you()) x where x->>'user_id' = pg_temp.uid('c')::text),
  pg_temp.uid('b')::text, 'One intro away shows who to ask');
select is((select x->'shared'->'shared_groups'->>0 from jsonb_array_elements(people_like_you()) x where x->>'user_id' = pg_temp.uid('d')::text),
  'Twenty Club', 'Shared groups count');
select pg_temp.act_as('h');
select set_hidden_from(pg_temp.uid('a'), true);
select pg_temp.admin();
insert into blocks (blocker_id, blocked_id) values (pg_temp.uid('a'), pg_temp.uid('k'));
select pg_temp.act_as('a');
select is(pg_temp.likes(), '{c,d,e}'::text[], 'Not people who hid from you, or people you blocked');

-- Spots only count from open plans.
select pg_temp.admin();
insert into venues (name, city_id, location) values ('Open Spot', 11, 'POINT(-76.93 38.98)'), ('Quiet Spot', 11, 'POINT(-76.93 38.98)');
insert into ids select 'open', id from venues where name = 'Open Spot';
insert into ids select 'quiet', id from venues where name = 'Quiet Spot';
insert into going_out_posts (user_id, when_kind, starts_at, expires_at, venue_id, audience) values
  (pg_temp.uid('a'), 'tonight', now() - interval '3 days', now() - interval '2 days', pg_temp.id('open'), 'everyone'),
  (pg_temp.uid('e'), 'tonight', now() - interval '5 days', now() - interval '4 days', pg_temp.id('open'), 'everyone'),
  (pg_temp.uid('a'), 'tonight', now() - interval '3 days', now() - interval '2 days', pg_temp.id('quiet'), 'everyone'),
  (pg_temp.uid('e'), 'tonight', now() - interval '5 days', now() - interval '4 days', pg_temp.id('quiet'), 'circle');
select pg_temp.act_as('a');
select is((select x->'shared'->'shared_spots' from jsonb_array_elements(people_like_you()) x where x->>'user_id' = pg_temp.uid('e')::text),
  '["Open Spot"]'::jsonb, 'Circle-only plans never feed a match');

-- ── Intro odds ────────────────────────────────────────────────────────────
select pg_temp.admin();
select pg_temp.connect('a', 'd');
select pg_temp.act_as('a');
select ok((intro_odds(pg_temp.uid('b'), pg_temp.uid('d'))->>'score')::int between 5 and 95, 'A score from 5 to 95');
select ok(jsonb_array_length(intro_odds(pg_temp.uid('b'), pg_temp.uid('d'))->'signals') > 0, 'With the reasons');
select throws_ok(format('select intro_odds(%L, %L)', pg_temp.uid('b'), pg_temp.uid('e')), '42501', null, 'Only people you could introduce');
select ok(make_intro(pg_temp.uid('b'), pg_temp.uid('d'), 'You two should meet') is not null, 'Make the intro');
select pg_temp.admin();
select isnt((select predicted_score from intros where connector_id = pg_temp.uid('a')), null, 'The odds are saved with it');

-- ── What the AI may see ───────────────────────────────────────────────────
insert into pins (author_id, category, body, audience) values
  (pg_temp.uid('e'), 'thought', 'Open to all', 'everyone'),
  (pg_temp.uid('e'), 'thought', 'Circle only', 'circle');
select pg_temp.act_as('a');
select is(ai_icebreaker_facts(pg_temp.uid('e'))->'shared'->'shared_interests', '["Brunch", "Pickleball"]'::jsonb, 'Icebreakers know what you share');
select is((select array_agg(x->>'text') from jsonb_array_elements(ai_icebreaker_facts(pg_temp.uid('e'))->'their_recent_posts') x),
  '{"Open to all"}'::text[], 'And only the posts you can see');
select throws_ok(format('select ai_icebreaker_facts(%L)', pg_temp.uid('k')), '42501', null, 'Not for blocked people');
select is(ai_profile_facts(pg_temp.uid('e'))->'interests', '["Brunch", "Pickleball"]'::jsonb, 'The AI Read sees public facts');
select is((ai_profile_facts(pg_temp.uid('e'))->>'nights_out_last_90_days')::int, 1, 'Counting only open plans');
select pg_temp.admin();
insert into blocks (blocker_id, blocked_id) values (pg_temp.uid('a'), pg_temp.uid('f'));
select pg_temp.act_as('f');
select throws_ok(format('select ai_profile_facts(%L)', pg_temp.uid('a')), '42501', null, 'Blocked either way');

-- Tonight: events you can see, with your friends going.
select pg_temp.act_as('b');
select ok(create_event('Twenty Supper', now() + interval '10 minutes', p_lat => 38.98, p_lng => -76.93) is not null, 'Bo hosts tonight');
select pg_temp.admin();
insert into ids select 'supper', id from events where title = 'Twenty Supper';
insert into event_rsvps (event_id, user_id) values (pg_temp.id('supper'), pg_temp.uid('b')) on conflict do nothing;
select pg_temp.act_as('c');
select ok(create_event('Cy''s circle night', now() + interval '10 minutes', p_visibility => 'circle') is not null, 'Cy hosts a circle-only night');
select pg_temp.act_as('a');
select is((select jsonb_array_length(x->'friends_going') from jsonb_array_elements(ai_tonight_options()->'options') x where x->>'title' = 'Twenty Supper'),
  1, 'Tonight for You sees who is going');
select is((select count(*)::int from jsonb_array_elements(ai_tonight_options()->'options') x where x->>'title' = 'Cy''s circle night'),
  0, 'But not circle-only events you are not in');

-- ── AI uses and the saved results ─────────────────────────────────────────
select is(my_ai_quota(), '{"left": 3, "used": 0, "limit": 3}'::jsonb, 'Three free AI uses');
select throws_ok(format($q$select ai_save(%L, 'all', 'profile_read', %L, null, '{}'::jsonb, 60, true)$q$, pg_temp.uid('a'), pg_temp.uid('e')),
  '42501', null, 'Only the server saves results');
select throws_ok('select * from ai_cache', '42501', null, 'Or reads them');
select pg_temp.admin();
select is(ai_save(pg_temp.uid('a'), 'all', 'profile_read', pg_temp.uid('e')::text, pg_temp.uid('e'), '{"read": "Brunch regular.", "badges": []}', 60, true)->>'left',
  '2', 'Making one uses one');
select is(ai_save(pg_temp.uid('a'), pg_temp.uid('a')::text, 'people_like_you', '', null, '{"picks": []}', 60, false)->>'left',
  '2', 'Automatic ones are free');
select pg_temp.act_as('c');
select is(profile_card(pg_temp.uid('e'))->'ai_read'->>'read', 'Brunch regular.', 'Everyone sees the same AI Read');
select is(jsonb_array_length(profile_card(pg_temp.uid('e'))->'interests'), 2, 'Interests show on profiles');
select pg_temp.admin();
update ai_cache set expires_at = now() - interval '1 minute' where feature = 'profile_read';
select is(ai_cache_get('all', 'profile_read', pg_temp.uid('e')::text), null, 'Old results expire');
delete from auth.users where id = pg_temp.uid('e');
select is((select count(*)::int from ai_cache where subject = pg_temp.uid('e')::text), 0, 'And go when the person deletes their account');

select * from finish();
rollback;
