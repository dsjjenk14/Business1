-- Phase 2 rules: location snapping, pin feeds, radius caps, profile privacy, Go Live.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- Test members are on the free plan (no founding Premium) unless a test says otherwise.
update app_config set value = '0' where key = 'founding_member_limit';

create or replace function pg_temp.new_user(p_email text, p_name text) returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '',
          jsonb_build_object('accepted_terms', true, 'full_name', p_name, 'birthdate', '1990-01-01', 'city_slug', 'fairfax-va'), now(), now());
  return uid;
end $$;
create or replace function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;

create temp table t (k text primary key, id uuid);
grant select on t to authenticated;
insert into t values
  ('ana', pg_temp.new_user('ana2@test.dev', 'Ana Two')),
  ('bo',  pg_temp.new_user('bo2@test.dev',  'Bo Two')),
  ('cy',  pg_temp.new_user('cy2@test.dev',  'Cy Two'));
-- Everyone lives in Fairfax; Ana and Bo are connected, Cy is a stranger.
update profiles set approx_location = extensions.st_point(-77.3064, 38.8462, 4326)::extensions.geography where id in (select id from t);
insert into connections (user_a, user_b, source)
select least(a.id, b.id), greatest(a.id, b.id), 'manual' from t a, t b where a.k = 'ana' and b.k = 'bo';

-- ── Location snapping ────────────────────────────────────────────────────
select pg_temp.act_as((select id from t where k = 'ana'));
insert into pins (author_id, category, body, approx_location)
values ((select id from t where k = 'ana'), 'thought', 'exact spot test', extensions.st_point(-77.30123, 38.84987, 4326)::extensions.geography);
select pg_temp.admin();
select ok(
  (select extensions.st_distance(approx_location, extensions.st_point(-77.30123, 38.84987, 4326)::extensions.geography) > 1
     from pins where body = 'exact spot test'),
  'A pin''s exact location is never stored (snapped to the grid)');
select is((select city_id from pins where body = 'exact spot test'), (select id from cities where slug = 'fairfax-va'),
  'Pins get the author''s city automatically');

-- A pin ~7 miles away (Tysons) and one ~40 miles away (Frederick, MD).
insert into pins (author_id, category, body, approx_location) values
  ((select id from t where k = 'bo'), 'thought', 'tysons pin', extensions.st_point(-77.2311, 38.9187, 4326)::extensions.geography),
  ((select id from t where k = 'bo'), 'thought', 'far pin', extensions.st_point(-77.4105, 39.4143, 4326)::extensions.geography),
  ((select id from t where k = 'bo'), 'thought', 'circle only pin', null);
update pins set audience = 'circle' where body = 'circle only pin';

-- ── Feeds and radius caps ────────────────────────────────────────────────
select pg_temp.act_as((select id from t where k = 'cy'));
select ok(not exists (select 1 from pins_feed('nearby', p_radius_mi => 5) where body = 'tysons pin'), '5 mi radius: the Tysons pin is out of range');
select ok(exists (select 1 from pins_feed('nearby', p_radius_mi => 10) where body = 'tysons pin'), '10 mi radius: the Tysons pin is in range');
select ok(exists (select 1 from pins_feed('nearby', p_radius_mi => 50) where body = 'far pin'), 'Free plan: 50 mi reaches the far pin (75 mi for everyone)');
select ok(exists (select 1 from pins_feed('community') where body = 'far pin'), 'They''re In shows pins at any distance');
select ok(not exists (select 1 from pins_feed('community') where body = 'circle only pin'), 'Strangers never see circle-only pins');
select ok((select distance_mi from pins_feed('nearby', p_radius_mi => 10) where body = 'tysons pin') between 5 and 8,
  'Distance is shown in miles, rounded');
select pg_temp.admin();
insert into entitlements (user_id, premium_until) values ((select id from t where k = 'cy'), now() + interval '30 days');
select pg_temp.act_as((select id from t where k = 'cy'));
select ok(exists (select 1 from pins_feed('nearby', p_radius_mi => 50) where body = 'far pin'), 'Premium: 50 mi radius reaches the far pin');

select pg_temp.act_as((select id from t where k = 'ana'));
select ok(exists (select 1 from pins_feed('network') where body = 'circle only pin'), 'Your circle sees circle-only pins in the network feed');

-- ── Profile privacy ──────────────────────────────────────────────────────
select pg_temp.act_as((select id from t where k = 'bo'));
update user_settings set show_vouch_count = false where user_id = (select id from t where k = 'bo');
select pg_temp.act_as((select id from t where k = 'cy'));
select is(profile_card((select id from t where k = 'bo'))->'vouch_count', 'null'::jsonb, 'A hidden vouch count stays hidden from others');
select pg_temp.act_as((select id from t where k = 'bo'));
select isnt(profile_card((select id from t where k = 'bo'))->'vouch_count', 'null'::jsonb, 'You always see your own vouch count');

-- ── Go Live ──────────────────────────────────────────────────────────────
select pg_temp.act_as((select id from t where k = 'ana'));
select go_live(p_place => 'Mosaic District');
select ok(exists (select 1 from pins_feed('author', p_author => (select id from t where k = 'ana')) where category = 'going_out'),
  'Going live drops a Going Out pin');
select end_live();
select ok(not exists (select 1 from pins where author_id = (select id from t where k = 'ana') and category = 'going_out'),
  'Ending Go Live removes the post and its pin');

select * from finish();
rollback;
