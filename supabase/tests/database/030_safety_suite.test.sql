-- Safety suite: ghost mode, the map, venue hidden by default, delayed
-- "here", 2 vouches to see people out, and the message limit.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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
-- Does the viewer see this person in tonight's people list?
create or replace function pg_temp.sees(k text) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(going_out_feed('tonight', 38.60, -77.30, 25)->'people') x where x->>'user_id' = pg_temp.uid(k)::text)
$$;
create or replace function pg_temp.person(k text) returns jsonb language sql as $$
  select x from jsonb_array_elements(going_out_feed('tonight', 38.60, -77.30, 25)->'people') x where x->>'user_id' = pg_temp.uid(k)::text
$$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('ana', pg_temp.new_user('ana30@test.dev', 'Ana Thirty')),
                     ('ins', pg_temp.new_user('ins30@test.dev', 'Ian Insider')),
                     ('new', pg_temp.new_user('new30@test.dev', 'Nia Newcomer')),
                     ('vet', pg_temp.new_user('vet30@test.dev', 'Val Vouched'));
insert into connections (user_a, user_b, source) values (least(pg_temp.uid('ana'), pg_temp.uid('ins')), greatest(pg_temp.uid('ana'), pg_temp.uid('ins')), 'manual');
update profiles set vouch_count = 2 where id = pg_temp.uid('vet');

-- Defaults.
select is((select show_going_out_venue from user_settings where user_id = pg_temp.uid('new')), false, 'New members hide the venue by default');
select is((select here_delay_minutes from user_settings where user_id = pg_temp.uid('new')), 15::smallint, '"I''m here" is delayed 15 minutes by default');
select is((select ghost_mode from user_settings where user_id = pg_temp.uid('new')), false, 'Ghost mode starts off');

-- Ana goes out tonight, open to everyone nearby, at a named place.
select pg_temp.act_as('ana');
select post_going_out('tonight', p_place => 'Secret Bar', p_lat => 38.60, p_lng => -77.30);
select set_plan_audience((select id from going_out_posts where user_id = pg_temp.uid('ana')), 'everyone');
select is((select body from pins where author_id = pg_temp.uid('ana') and category = 'going_out'), 'Going out tonight.', 'The automatic pin doesn''t name the place when the venue is hidden');
select is((select place_label from pins where author_id = pg_temp.uid('ana') and category = 'going_out'), null, '...and doesn''t carry it either');

-- 5. Two vouches to see people out (Insiders always can).
select pg_temp.act_as('ins');
select ok(pg_temp.sees('ana'), 'Her Insiders see she''s going out');
select pg_temp.act_as('vet');
select ok(pg_temp.sees('ana'), 'Someone with 2 vouches sees a plan open to everyone');
select pg_temp.act_as('new');
select ok(not pg_temp.sees('ana'), 'Someone with fewer than 2 vouches doesn''t');
select ok(not exists (select 1 from pins_feed('community') where author_id = pg_temp.uid('ana') and category = 'going_out'), '...and doesn''t see her going-out pin');
select is((select (profile_card(pg_temp.uid('ana'))->'tonight')), 'null'::jsonb, '...or "going out tonight" on her profile');

-- 2. The map: nobody else's spot is sent.
select pg_temp.act_as('vet');
select is(pg_temp.person('ana')->'lat', 'null'::jsonb, 'Other people''s spot isn''t sent for the map');
select pg_temp.act_as('ana');
select isnt(pg_temp.person('ana')->'lat', 'null'::jsonb, 'Your own spot is');

-- 4. Delayed "here".
select pg_temp.act_as('ana');
select set_here_audience((select id from going_out_posts where user_id = pg_temp.uid('ana')), 'circle');
select lives_ok($$ select im_here() $$, 'Ana arrives');
select isnt(pg_temp.person('ana')->'here_since', 'null'::jsonb, 'She sees she''s there right away');
select pg_temp.act_as('ins');
select is(pg_temp.person('ana')->'here_since', 'null'::jsonb, 'Her Insiders don''t, for the first 15 minutes');
select is((select status from people_status(array[pg_temp.uid('ana')])), null, '...and her ring doesn''t say she''s out yet');
select pg_temp.admin();
update going_out_posts set arrived_at = now() - interval '16 minutes' where user_id = pg_temp.uid('ana');
select pg_temp.act_as('ins');
select isnt(pg_temp.person('ana')->'here_since', 'null'::jsonb, 'After the delay, her Insiders see she''s there');
select is((select status from people_status(array[pg_temp.uid('ana')])), 'out', '...and her ring says out');

-- 1. Ghost mode hides all of it, even from Insiders.
select pg_temp.admin();
update user_settings set ghost_mode = true where user_id = pg_temp.uid('ana');
select pg_temp.act_as('ins');
select ok(not pg_temp.sees('ana'), 'Ghost mode: her Insiders don''t see her going out');
select is((select status from people_status(array[pg_temp.uid('ana')])), null, 'Ghost mode: no "out" ring');
select ok(not ((circle_overview()->'first') @> jsonb_build_array(jsonb_build_object('id', pg_temp.uid('ana'), 'out_tonight', true))), 'Ghost mode: not "out tonight" on the Insiders list');
select pg_temp.act_as('ana');
select ok(pg_temp.sees('ana'), 'She still sees her own plan');

-- 6. Message limit.
select pg_temp.admin();
insert into connections (user_a, user_b, source) values (least(pg_temp.uid('ana'), pg_temp.uid('new')), greatest(pg_temp.uid('ana'), pg_temp.uid('new')), 'intro');
update user_settings set messages_need_vouches = true where user_id = pg_temp.uid('ana');
select pg_temp.act_as('new');
select throws_ok(format('select open_direct_conversation(%L)', pg_temp.uid('ana')), '42501', null, 'With the message limit on, people under 2 vouches can''t start a chat');
select pg_temp.admin();
update profiles set vouch_count = 2 where id = pg_temp.uid('new');
select pg_temp.act_as('new');
select lives_ok(format('select open_direct_conversation(%L)', pg_temp.uid('ana')), '...with 2 vouches they can');

select * from finish();
rollback;
