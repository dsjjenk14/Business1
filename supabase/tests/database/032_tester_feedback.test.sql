-- Tester feedback round: Outs until morning, event tags and 30+, newcomer
-- events, host updates, group invite links, profile songs, partner specials,
-- the safety timer and the Premium price.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

create or replace function pg_temp.new_user(p_email text, p_name text, p_birth date default '1990-01-01') returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '',
          jsonb_build_object('accepted_terms', true, 'full_name', p_name, 'birthdate', p_birth::text), now(), now());
  return uid;
end $$;
create temp table t (k text primary key, id uuid);
grant select on t to authenticated;
create temp table ids (k text primary key, id bigint);
grant select on ids to authenticated;
create or replace function pg_temp.uid(k text) returns uuid language sql as $$ select id from t where t.k = uid.k $$;
create or replace function pg_temp.idn(k text) returns bigint language sql as $$ select id from ids where ids.k = idn.k $$;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('host', pg_temp.new_user('host32@test.dev', 'Hana Host', '1985-05-05')),
                     ('old',  pg_temp.new_user('old32@test.dev',  'Otto Older', '1980-01-01')),
                     ('kid',  pg_temp.new_user('kid32@test.dev',  'Kai Younger', (current_date - interval '24 years')::date)),
                     ('mgr',  pg_temp.new_user('mgr32@test.dev',  'Mia Manager')),
                     ('adm',  pg_temp.new_user('adm32@test.dev',  'Ada Admin'));
update profiles set role = 'admin' where id = pg_temp.uid('adm');

-- Premium price.
select is((select value::text from app_config where key = 'premium_price_cents'), '499', 'Premium is $4.99');

-- Outs until morning.
select ok(private.next_morning() > now() + interval '6 hours' and private.next_morning() <= now() + interval '30 hours', '"Until morning" ends at the next 11 AM at least 6 hours away');
select is(extract(hour from private.next_morning() at time zone 'America/New_York')::int, 11, '...at 11 AM in DC');

-- Event tags.
with x as (insert into events (host_id, title, starts_at, visibility) values (pg_temp.uid('host'), 'Wine night', now() + interval '2 days', 'public') returning id) insert into ids select 'ev', id from x;
select pg_temp.act_as('old');
select throws_ok(format('select set_event_tags(%s, array[''low_key''])', pg_temp.idn('ev')), '42501', null, 'Only the host can tag an event');
select pg_temp.act_as('host');
select lives_ok(format('select set_event_tags(%s, array[''thirty_plus'', ''newcomers'', ''nonsense''])', pg_temp.idn('ev')), 'The host tags it');
select is((select tags from events where id = pg_temp.idn('ev')), array['newcomers', 'thirty_plus'], '...and unknown tags are dropped');
select is((select event_detail(pg_temp.idn('ev'))->'tags'), '["newcomers", "thirty_plus"]'::jsonb, 'The event page shows the tags');

-- 30+.
select pg_temp.act_as('kid');
select throws_ok(format('insert into event_rsvps (event_id, user_id) values (%s, %L)', pg_temp.idn('ev'), pg_temp.uid('kid')), '23514', 'This one''s for people 30 and over.', 'Under 30 can''t say I''m In to a 30+ event');
select pg_temp.act_as('old');
select lives_ok(format('insert into event_rsvps (event_id, user_id) values (%s, %L)', pg_temp.idn('ev'), pg_temp.uid('old')), '30 and over can');

-- Newcomer events.
select pg_temp.act_as('kid');
select ok(exists (select 1 from newcomer_events() where id = pg_temp.idn('ev') and newcomers), 'New faces welcome events show for newcomers');
select pg_temp.act_as('old');
select ok(not exists (select 1 from newcomer_events() where id = pg_temp.idn('ev')), '...but not events you already said I''m In to');

-- Host updates.
select pg_temp.act_as('old');
select throws_ok(format('select message_event_guests(%s, ''hi'')', pg_temp.idn('ev')), '42501', null, 'Only the host can message everyone going');
select pg_temp.act_as('host');
select is((select message_event_guests(pg_temp.idn('ev'), 'Doors moved to 10')), 1, 'The host messages everyone going');
select pg_temp.admin();
select is((select count(*)::int from notifications where user_id = pg_temp.uid('old') and kind = 'event_update' and body = 'Doors moved to 10'), 1, '...and they get a notification');
select pg_temp.act_as('old');
select is((select count(*)::int from event_updates_for(pg_temp.idn('ev'))), 1, 'People going see the update on the event page');
select pg_temp.act_as('kid');
select is((select count(*)::int from event_updates_for(pg_temp.idn('ev'))), 0, 'People not going don''t');
select pg_temp.act_as('host');
select message_event_guests(pg_temp.idn('ev'), 'update ' || g) from generate_series(1, 4) g;
select throws_ok(format('select message_event_guests(%s, ''one more'')', pg_temp.idn('ev')), '23514', null, 'Five updates a day at most');

-- Group invite links.
select pg_temp.admin();
with x as (insert into groups (name, category, owner_id) values ('Run Club', 'fitness', pg_temp.uid('host')) returning id) insert into ids select 'grp', id from x;
select pg_temp.act_as('old');
select throws_ok(format('select group_invite_link(%s)', pg_temp.idn('grp')), '42501', null, 'Only the owner and co-hosts get the invite link');
select pg_temp.act_as('host');
create temp table tok as select group_invite_link(pg_temp.idn('grp')) as v;
select is((select group_invite_link(pg_temp.idn('grp'))), (select v from tok), 'The link stays the same until you make a new one');
select pg_temp.act_as('kid');
select is(join_group_by_link((select v from tok)), pg_temp.idn('grp'), 'Opening the link joins the group');
select ok(exists (select 1 from group_members where group_id = pg_temp.idn('grp') and user_id = pg_temp.uid('kid')), '...right away, with no request');
select pg_temp.act_as('host');
select isnt((select group_invite_link(pg_temp.idn('grp'), true)), (select v from tok), 'A new link replaces the old one');
select pg_temp.act_as('old');
select throws_ok(format('select join_group_by_link(%L)', (select v from tok)), '23514', null, '...and the old link stops working');

-- Profile song.
select pg_temp.act_as('kid');
select throws_ok($$ select set_profile_song('{"track_id": 1, "title": "x", "artist": "y", "preview_url": "javascript:alert(1)", "apple_url": "https://music.apple.com/x"}') $$,
                 '23514', null, 'A song must come from the search');
select lives_ok($$ select set_profile_song('{"track_id": 1, "title": "Golden", "artist": "Jill Scott", "preview_url": "https://audio-ssl.itunes.apple.com/x.m4a", "apple_url": "https://music.apple.com/x", "extra": "dropped"}') $$, 'You pick a profile song');
select is((select profile_card(pg_temp.uid('kid'))->'song'->>'title'), 'Golden', 'It shows on your profile');

-- Partner specials.
select pg_temp.admin();
with x as (insert into venues (name, location) values ('Bresca Test', extensions.st_point(-77.03, 38.91)::extensions.geography) returning id) insert into ids select 'ven', id from x;
select pg_temp.act_as('adm');
select lives_ok(format('select admin_set_venue_manager(%s, ''MGR32@test.dev'')', pg_temp.idn('ven')), 'The admin makes someone a place''s manager');
select pg_temp.act_as('mgr');
select throws_ok(format('select post_venue_special(%s, ''Half-price wings'')', pg_temp.idn('ven')), '23514', null, 'No special without a live partner placement');
select pg_temp.admin();
insert into venue_placements (venue_id, kind, perk, starts_at, ends_at) values (pg_temp.idn('ven'), 'featured', 'Free bubbles', now() - interval '1 day', now() + interval '30 days');
select pg_temp.act_as('mgr');
select lives_ok(format('select post_venue_special(%s, ''Half-price wings'', ''Until 9'')', pg_temp.idn('ven')), 'The manager of a partner place posts tonight''s special');
select pg_temp.act_as('kid');
select ok(exists (select 1 from specials_tonight() where title = 'Half-price wings'), 'Everyone sees it on What''s In');
select throws_ok(format('select post_venue_special(%s, ''Fake deal'')', pg_temp.idn('ven')), '42501', null, 'Only the manager can post');

-- Safety timer.
select pg_temp.act_as('kid');
select lives_ok($$ select start_safety_timer(30, 'Meeting Jordan') $$, 'You start a timer before your date');
select pg_temp.admin();
update safety_timers set check_at = now() - interval '1 minute' where user_id = pg_temp.uid('kid');
select private.flag_missed_checkins();
select is((select count(*)::int from notifications where user_id = pg_temp.uid('kid') and kind = 'safety'), 1, 'Miss it and you get the check-in alert');

select * from finish();
rollback;
