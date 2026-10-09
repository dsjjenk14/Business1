-- Tester round: chosen viewers for I'm In, waitlists, group co-hosts and
-- announcements, reactions, and Home for new members.
begin;
create extension if not exists pgtap with schema extensions;
-- These tests predate the safety suite (030): no arrival delay, no 2-vouch rule.
update app_config set value = '0' where key = 'safety_min_vouches';
alter table user_settings alter column here_delay_minutes set default 0;
select plan(17);

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
insert into t values ('ka', pg_temp.new_user('ka14@test.dev', 'Ka Fourteen')),
                     ('lu', pg_temp.new_user('lu14@test.dev', 'Lu Fourteen')),
                     ('mo', pg_temp.new_user('mo14@test.dev', 'Mo Fourteen')),
                     ('ne', pg_temp.new_user('ne14@test.dev', 'Ne Fourteen'));
insert into connections (user_a, user_b, source) values
  (least(pg_temp.uid('ka'), pg_temp.uid('lu')), greatest(pg_temp.uid('ka'), pg_temp.uid('lu')), 'manual'),
  (least(pg_temp.uid('ka'), pg_temp.uid('mo')), greatest(pg_temp.uid('ka'), pg_temp.uid('mo')), 'manual');

-- ── I'm In: only chosen people ───────────────────────────────────────────
insert into going_out_posts (user_id, when_kind, starts_at, expires_at, arrived_at, live_until)
values (pg_temp.uid('ka'), 'tonight', now() - interval '10 minutes', now() + interval '4 hours', now(), now() + interval '2 hours');
select pg_temp.act_as('ka');
select is(set_here_viewers((select id from going_out_posts where user_id = pg_temp.uid('ka')), array[pg_temp.uid('lu'), pg_temp.uid('ne')]), 1,
  'Only people in your circle can be chosen');
select pg_temp.act_as('lu');
select isnt((select here_since from tonight_network() where user_id = pg_temp.uid('ka')), null, 'A chosen friend sees you''re there');
select pg_temp.act_as('mo');
select is((select here_since from tonight_network() where user_id = pg_temp.uid('ka')), null, 'Other friends don''t');

-- ── Waitlist ─────────────────────────────────────────────────────────────
select pg_temp.admin();
insert into events (host_id, title, starts_at, capacity) values (pg_temp.uid('ka'), 'Tiny Dinner', now() + interval '2 days', 1);
insert into event_rsvps (event_id, user_id) values ((select id from events where title = 'Tiny Dinner'), pg_temp.uid('lu'));
select pg_temp.act_as('mo');
select throws_ok(format('insert into event_rsvps (event_id, user_id) values (%s, %L)', (select id from events where title = 'Tiny Dinner'), pg_temp.uid('mo')),
  null, null, 'A full event takes no more RSVPs');
select is(join_waitlist((select id from events where title = 'Tiny Dinner')), 1, 'Join the waitlist: you''re first');
select ok((event_detail((select id from events where title = 'Tiny Dinner'))->>'on_waitlist')::boolean, 'The event shows you''re on the waitlist');
select pg_temp.act_as('lu');
delete from event_rsvps where event_id = (select id from events where title = 'Tiny Dinner') and user_id = pg_temp.uid('lu');
select pg_temp.admin();
select ok(exists (select 1 from event_rsvps where event_id = (select id from events where title = 'Tiny Dinner') and user_id = pg_temp.uid('mo')),
  'When someone drops out, the next person gets the spot');
select is((select count(*)::int from notifications where user_id = pg_temp.uid('mo') and kind = 'waitlist_in'), 1, 'And is told');

-- ── Group co-hosts and announcements ─────────────────────────────────────
insert into groups (name, category, owner_id) values ('Run Crew 14', 'fitness', pg_temp.uid('ka'));
insert into group_members (group_id, user_id, role) values
  ((select id from groups where name = 'Run Crew 14'), pg_temp.uid('ka'), 'owner'),
  ((select id from groups where name = 'Run Crew 14'), pg_temp.uid('lu'), 'member');
select pg_temp.act_as('lu');
select throws_ok(format('select post_group_announcement(%s, %L)', (select id from groups where name = 'Run Crew 14'), 'hi'), '42501', null, 'Members can''t post announcements');
select pg_temp.act_as('ka');
select lives_ok(format('select set_group_role(%s, %L, ''admin'')', (select id from groups where name = 'Run Crew 14'), pg_temp.uid('lu')), 'The owner makes a co-host');
select pg_temp.act_as('lu');
select lives_ok(format('select post_group_announcement(%s, %L)', (select id from groups where name = 'Run Crew 14'), 'Saturday 7am, Rock Creek'), 'Co-hosts can post announcements');
select pg_temp.act_as('ka');
select is(group_announcement((select id from groups where name = 'Run Crew 14'))->>'text', 'Saturday 7am, Rock Creek', 'Members see the announcement');
select pg_temp.admin();
select is((select count(*)::int from notifications where user_id = pg_temp.uid('ka') and kind = 'group_announcement'), 1, 'Members are told');
select pg_temp.act_as('ne');
select is(group_announcement((select id from groups where name = 'Run Crew 14')), null, 'Non-members don''t see it');
select throws_ok($$ select announcement from groups limit 1 $$, '42501', null, 'And can''t read it directly');

-- ── Reactions ────────────────────────────────────────────────────────────
select pg_temp.admin();
insert into pins (author_id, category, body, audience) values (pg_temp.uid('ka'), 'thought', 'react to me', 'everyone');
select pg_temp.act_as('lu');
select react_to_pin((select id from pins where body = 'react to me'), 'flame');
select is((select my_reaction || ':' || like_count from pins_feed('author', p_author => pg_temp.uid('ka')) where body = 'react to me'), 'flame:1', 'React with a symbol (counts as a like)');

-- ── Home for new members ─────────────────────────────────────────────────
select pg_temp.act_as('ne');
select ok(home_feed() ?& array['everyone_pins', 'suggested_groups', 'nearby_events'], 'New members get community pins, groups to join and events');

select * from finish();
rollback;
