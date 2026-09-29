-- Virtual events: online events for groups you run, rooms only for people going.
begin;
create extension if not exists pgtap with schema extensions;
-- Launch mode keeps this off; the tests turn it on.
update app_config set value = 'true' where key in ('virtual_events_enabled', 'drinks_enabled');
select plan(15);

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

insert into t values ('a', pg_temp.new_user('a23@test.dev', 'Ann TwentyThree')),
                     ('m', pg_temp.new_user('m23@test.dev', 'Mo TwentyThree'));
insert into groups (name, category, owner_id) values ('Online Crew', 'social', pg_temp.uid('a'));
insert into ids select 'g', id from groups where name = 'Online Crew';
insert into group_members (group_id, user_id, role) values (pg_temp.id('g'), pg_temp.uid('a'), 'owner'), (pg_temp.id('g'), pg_temp.uid('m'), 'member')
  on conflict do nothing;

select pg_temp.act_as('a');
insert into ids values ('now', create_event('Watch party', now() + interval '5 minutes', p_group => pg_temp.id('g')));
insert into ids values ('later', create_event('Book club', now() + interval '2 days', p_group => pg_temp.id('g')));
insert into ids values ('solo', create_event('Just me', now() + interval '2 days'));

select lives_ok(format($q$select set_event_virtual(%s, 'virtual', 'video')$q$, pg_temp.id('now')), 'A group admin makes it a video call');
select throws_ok(format($q$select set_event_virtual(%s, 'virtual', 'voice')$q$, pg_temp.id('solo')), '23514', null, 'Online events are for groups you run');
select throws_ok(format($q$select set_event_virtual(%s, 'virtual', 'link', 'http://not-secure.example')$q$, pg_temp.id('later')), '23514', null, 'Links must be https');
select lives_ok(format($q$select set_event_virtual(%s, 'hybrid', 'link', 'https://zoom.us/j/123')$q$, pg_temp.id('later')), 'Or both, with your own link');
select is(event_detail(pg_temp.id('later'))->>'join_url', 'https://zoom.us/j/123', 'The host sees the link');
select is(event_detail(pg_temp.id('now'))->>'room_open', 'true', 'The room opens 15 minutes before');

select pg_temp.act_as('m');
select throws_ok(format($q$select set_event_virtual(%s, 'in_person')$q$, pg_temp.id('now')), '42501', null, 'Only the host changes it');
select is(event_detail(pg_temp.id('later'))->'join_url', 'null'::jsonb, 'The link is hidden until you say I''m In');
insert into event_rsvps (event_id, user_id) values (pg_temp.id('later'), pg_temp.uid('m'));
select is(event_detail(pg_temp.id('later'))->>'join_url', 'https://zoom.us/j/123', 'Then you get it');
select throws_ok('select * from event_links', '42501', null, 'Links can''t be read directly');
select throws_ok(format('select event_room_join_check(%s, %L)', pg_temp.id('now'), pg_temp.uid('m')), '42501', null, 'Only the server hands out room passes');

select pg_temp.admin();
select is(event_room_join_check(pg_temp.id('now'), pg_temp.uid('m'))->>'error', 'Say I''m In to join the room.', 'Not going, no room');
insert into event_rsvps (event_id, user_id) values (pg_temp.id('now'), pg_temp.uid('m'));
select is(event_room_join_check(pg_temp.id('now'), pg_temp.uid('m'))->>'role', 'guest', 'Going: in as a guest');
select is(event_room_join_check(pg_temp.id('now'), pg_temp.uid('a'))->>'role', 'host', 'The host runs the room');
update events set starts_at = now() + interval '1 day', ends_at = now() + interval '1 day 2 hours' where id = pg_temp.id('now');
select is(event_room_join_check(pg_temp.id('now'), pg_temp.uid('m'))->>'error', 'The room opens 15 minutes before the start.', 'Not open yet');

select * from finish();
rollback;
