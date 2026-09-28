-- Arriving is automatic: I'm In says you're going; GPS at the place marks you there.
-- Radius is 75 miles for everyone.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

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
insert into t values ('al', pg_temp.new_user('al10@test.dev', 'Al Ten')),
                     ('hy', pg_temp.new_user('hy10@test.dev', 'Hy Ten'));

-- ── 75 miles for everyone ────────────────────────────────────────────────
select is((select free_value from plan_limits where key = 'search_radius_mi'), 75::numeric, 'Free plan searches 75 miles');
select is((select premium_value from plan_limits where key = 'search_radius_mi'), 75::numeric, 'Premium is the same 75 miles');
select is((select radius_mi from user_settings where user_id = pg_temp.uid('al'))::numeric, 75::numeric, 'New members start at 75 miles');

-- ── Event arrival ────────────────────────────────────────────────────────
insert into venues (name, neighborhood, location, category)
values ('Arrive Hall', 'Testville', extensions.st_setsrid(extensions.st_makepoint(-77.30, 38.60), 4326)::extensions.geography, 'music');
insert into events (host_id, title, starts_at, ends_at, venue_id)
values (pg_temp.uid('hy'), 'Arrive Night', now() - interval '10 minutes', now() + interval '2 hours', (select id from venues where name = 'Arrive Hall'));
insert into event_rsvps (event_id, user_id) values ((select id from events where title = 'Arrive Night'), pg_temp.uid('al'));

select pg_temp.act_as('al');
select is(arrival_targets(), 1, 'Going to an event that''s on now: the phone should watch for arrival');
select is(jsonb_array_length(auto_arrive(38.70, -77.30, 10)), 0, 'Miles away: not marked there');
select is(jsonb_array_length(auto_arrive(38.6005, -77.30, 500)), 0, 'Weak GPS: not marked there');
select ok(not (event_detail((select id from events where title = 'Arrive Night'))->>'i_am_here')::boolean, 'Not there yet');
select is(auto_arrive(38.6005, -77.3002, 10)->0->>'title', 'Arrive Night', 'At the venue: marked there automatically');
select ok((event_detail((select id from events where title = 'Arrive Night'))->>'i_am_here')::boolean, 'The event shows you''re there');
select is(jsonb_array_length(auto_arrive(38.6005, -77.3002, 10)), 0, 'Only once per event');
select is(arrival_targets(), 0, 'Nothing left to watch for');

-- ── Night-out place arrival ──────────────────────────────────────────────
select pg_temp.admin();
insert into going_out_posts (user_id, when_kind, starts_at, expires_at, venue_id)
values (pg_temp.uid('al'), 'tonight', now() - interval '5 minutes', now() + interval '5 hours', (select id from venues where name = 'Arrive Hall'));
select pg_temp.act_as('al');
select is(arrival_targets(), 1, 'Going out to a place tonight: the phone watches for arrival');
select is(auto_arrive(38.6005, -77.3002, 10)->0->>'kind', 'place', 'At the place: marked there automatically');
select pg_temp.admin();
select isnt((select arrived_at from going_out_posts where user_id = pg_temp.uid('al')), null, 'Your night out shows you''re there');

select * from finish();
rollback;
