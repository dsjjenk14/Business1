-- Status rings (live, in a virtual event, out) and up to 3 profile photos.
begin;
create extension if not exists pgtap with schema extensions;
-- These tests predate the safety suite (030): no arrival delay, no 2-vouch rule.
update app_config set value = '0' where key = 'safety_min_vouches';
alter table user_settings alter column here_delay_minutes set default 0;
select plan(21);

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
create or replace function pg_temp.status_of(k text) returns text language sql as $$
  select status from people_status(array[pg_temp.uid(k)]) $$;
create or replace function pg_temp.url(k text, f text) returns text language sql as $$
  select 'http://127.0.0.1:54321/storage/v1/object/public/avatars/' || pg_temp.uid(k) || '/' || f $$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('a', pg_temp.new_user('a26@test.dev', 'Ava TwentySix')),
                     ('b', pg_temp.new_user('b26@test.dev', 'Ben TwentySix')),
                     ('c', pg_temp.new_user('c26@test.dev', 'Cal TwentySix'));
-- a and b are Insiders; c isn't connected to anyone.
insert into connections (user_a, user_b, source) values (least(pg_temp.uid('a'), pg_temp.uid('b')), greatest(pg_temp.uid('a'), pg_temp.uid('b')), 'manual');

-- ── Photos ────────────────────────────────────────────────────────────────
select pg_temp.act_as('a');
select is(set_profile_photos(array[pg_temp.url('a', '1.jpg'), pg_temp.url('a', '2.jpg'), pg_temp.url('a', '3.jpg')]), array[pg_temp.url('a', '1.jpg'), pg_temp.url('a', '2.jpg'), pg_temp.url('a', '3.jpg')], 'Save 3 photos');
select is((select avatar_url from profiles where id = pg_temp.uid('a')), pg_temp.url('a', '1.jpg'), 'The first is the main photo');
select throws_ok(format('select set_profile_photos(array[%L,%L,%L,%L])', pg_temp.url('a', '1.jpg'), pg_temp.url('a', '2.jpg'), pg_temp.url('a', '3.jpg'), pg_temp.url('a', '4.jpg')),
  '23514', 'Up to 3 profile photos.', 'No more than 3');
select throws_ok(format('select set_profile_photos(array[%L])', pg_temp.url('b', 'x.jpg')),
  '23514', 'Upload the photo first.', 'Only your own uploads');
select throws_ok($$ select set_profile_photos(array['https://example.com/me.jpg']) $$, '23514', null, 'No outside links');
select pg_temp.act_as('b');
select is((select photos from people_status(array[pg_temp.uid('a')])), array[pg_temp.url('a', '1.jpg'), pg_temp.url('a', '2.jpg'), pg_temp.url('a', '3.jpg')], 'Others get all 3 photos to rotate');
select pg_temp.act_as('a');
update profiles set avatar_url = pg_temp.url('a', 'new.jpg') where id = pg_temp.uid('a');
select is((select photo_urls from profiles where id = pg_temp.uid('a')), array[pg_temp.url('a', 'new.jpg'), pg_temp.url('a', '2.jpg'), pg_temp.url('a', '3.jpg')], 'Changing the main photo the old way keeps the others');
select is(set_profile_photos(array[]::text[]), array[]::text[], 'Remove all photos');
select is((select avatar_url from profiles where id = pg_temp.uid('a')), null, 'No main photo left');

-- ── Status ────────────────────────────────────────────────────────────────
select pg_temp.act_as('b');
select is(pg_temp.status_of('a'), null, 'Nothing going on: no ring');

-- In a virtual event's room (checked in by the server).
select pg_temp.admin();
insert into events (host_id, title, starts_at, ends_at) values (pg_temp.uid('a'), 'Watch party', now(), now() + interval '2 hours');
select ok(event_room_ping('event-' || (select max(id) from events), pg_temp.uid('a')), 'The room checks Ava in');
select pg_temp.act_as('b');
select is(pg_temp.status_of('a'), 'virtual', 'Her Insiders see she''s in a virtual event');
select pg_temp.act_as('c');
select is(pg_temp.status_of('a'), null, 'People who aren''t her Insiders don''t');
select pg_temp.admin();
select ok(event_room_ping('event-' || (select max(id) from events), pg_temp.uid('a'), true), 'She leaves the room');
select pg_temp.act_as('b');
select is(pg_temp.status_of('a'), null, 'The ring goes away');

-- Out: here now somewhere, with a "here" audience of her Insiders.
select pg_temp.admin();
insert into going_out_posts (user_id, when_kind, starts_at, expires_at, arrived_at, live_until, here_audience)
values (pg_temp.uid('a'), 'tonight', now(), now() + interval '4 hours', now(), now() + interval '2 hours', 'circle');
select pg_temp.act_as('b');
select is(pg_temp.status_of('a'), 'out', 'Her Insiders see she''s out');
select pg_temp.act_as('c');
select is(pg_temp.status_of('a'), null, 'Others don''t');

-- Live wins over out.
select pg_temp.admin();
insert into live_streams (host_id, title, audience, status, started_at) values (pg_temp.uid('a'), 'Rooftop', 'circle', 'live', now());
select pg_temp.act_as('b');
select is(pg_temp.status_of('a'), 'live', 'Live shows over out');
select pg_temp.admin();
update live_streams set status = 'ended', ended_at = now() where host_id = pg_temp.uid('a');
select pg_temp.act_as('b');
select is(pg_temp.status_of('a'), 'out', 'Back to out when the live ends');

-- Server only.
select throws_ok(format('select event_room_ping(%L, %L)', 'event-1', pg_temp.uid('b')), '42501', null, 'Members can''t check people into rooms');
select pg_temp.act_as('b');
select is((select count(*)::int from people_status(array[pg_temp.uid('a'), pg_temp.uid('c')])), 2, 'One call covers everyone on screen');

select * from finish();
rollback;
