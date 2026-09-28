-- I'm Out: "I'm here" (live), who can see it, joining ("I'm coming"), and no emoji.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- Test members are on the free plan (no founding Premium) unless a test says otherwise.
update app_config set value = '0' where key = 'founding_member_limit';

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
create or replace function pg_temp.person(p_when text, p_name text) returns jsonb language sql as $$
  select x from jsonb_array_elements(going_out_feed(p_when, 38.60, -77.30, 10)->'people') x where x->>'display_name' = p_name
$$;

insert into t values
  ('ana', pg_temp.new_user('ana7@test.dev', 'Ana Seven')),
  ('bo',  pg_temp.new_user('bo7@test.dev',  'Bo Seven')),
  ('cy',  pg_temp.new_user('cy7@test.dev',  'Cy Seven')),
  ('di',  pg_temp.new_user('di7@test.dev',  'Di Seven'));
-- ana–bo connected, bo–di connected (di is ana's 2nd degree); cy is a stranger nearby.
insert into connections (user_a, user_b, source) values
  (least(pg_temp.uid('ana'), pg_temp.uid('bo')), greatest(pg_temp.uid('ana'), pg_temp.uid('bo')), 'manual'),
  (least(pg_temp.uid('bo'), pg_temp.uid('di')), greatest(pg_temp.uid('bo'), pg_temp.uid('di')), 'manual');

select pg_temp.act_as('ana');
select post_going_out('tonight', p_place => 'Rooftop', p_lat => 38.60, p_lng => -77.30);
select is((pg_temp.person('tonight', 'Ana S.')->>'here_since'), null, 'Posted: heading out, not here yet');
select lives_ok($$ select im_here() $$, '"I''m here"');
select isnt((pg_temp.person('tonight', 'Ana S.')->>'here_since'), null, 'Now "here now" on your own feed');

select pg_temp.act_as('bo');
select isnt((pg_temp.person('tonight', 'Ana S.')->>'here_since'), null, 'Your circle sees "here now"');
select pg_temp.act_as('cy');
select is((pg_temp.person('tonight', 'Ana S.')->>'here_since'), null, 'Strangers nearby don''t see "here now"');
select pg_temp.act_as('di');
select is((pg_temp.person('tonight', 'Ana S.')->>'here_since'), null, 'Your network (2nd degree) doesn''t see it by default: circle only');
select pg_temp.act_as('ana');
select set_here_audience((select id from going_out_posts where user_id = pg_temp.uid('ana')), 'network');
select pg_temp.act_as('di');
select isnt((pg_temp.person('tonight', 'Ana S.')->>'here_since'), null, 'Choose My Network and they see it too');
select pg_temp.act_as('cy');
select throws_ok($$ select join_going_out((pg_temp.person('tonight', 'Ana S.')->>'post_id')::bigint) $$, '23514', null,
  'Strangers can''t join');

select pg_temp.act_as('bo');
select lives_ok($$ select join_going_out((pg_temp.person('tonight', 'Ana S.')->>'post_id')::bigint) $$,
  'Someone in your circle taps "I''m coming"');
select is((pg_temp.person('tonight', 'Ana S.')->>'my_join'), 'heading', 'Their feed shows they''re heading there');
select pg_temp.act_as('ana');
select is((pg_temp.person('tonight', 'Ana S.')->>'heading_count')::int, 1, 'You see one person heading your way');
select ok(exists (select 1 from notifications where user_id = pg_temp.uid('ana') and kind = 'going_out_join'), 'You''re told who''s coming');
select set_open_to_join((select id from going_out_posts where user_id = pg_temp.uid('ana')), false);
select pg_temp.act_as('bo');
select throws_ok($$ select join_going_out((pg_temp.person('tonight', 'Ana S.')->>'post_id')::bigint, 'here') $$,
  '23514', 'They''re not taking company tonight.', 'Closed to joins: nobody new can join');

-- ── No emoji ─────────────────────────────────────────────────────────────
select set_config('role', 'postgres', true);
select throws_ok($$ insert into groups (name, category, owner_id, emoji) values ('Emoji Club', 'social', pg_temp.uid('ana'), '🍷') $$, '23514', null,
  'Groups only take symbol names, not emoji');
select is((select string_agg(emoji, ',' order by min_vouches) from vouch_tiers), 'seed,loop,link,bolt,crown', 'Tiers use symbols');

select * from finish();
rollback;
