-- Venue ratings (only after an event you went to), music on posts (Apple
-- links only, visible like the post), and live video (off by default,
-- audience rules, comments, server-only join check).
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

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
create temp table ids (k text primary key, id bigint);
grant select on ids to authenticated;
create or replace function pg_temp.id(k text) returns bigint language sql as $$ select id from ids where ids.k = id.k $$;
create or replace function pg_temp.admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('ho', pg_temp.new_user('ho16@test.dev', 'Ho Sixteen')),
                     ('go', pg_temp.new_user('go16@test.dev', 'Go Sixteen')),
                     ('no', pg_temp.new_user('no16@test.dev', 'No Sixteen')),
                     ('fr', pg_temp.new_user('fr16@test.dev', 'Fr Sixteen'));
-- ho and fr are connected; go and no aren't connected to anyone.
insert into connections (user_a, user_b, source) values (least(pg_temp.uid('ho'), pg_temp.uid('fr')), greatest(pg_temp.uid('ho'), pg_temp.uid('fr')), 'manual');
insert into venues (name, location) values ('Rating Test Bar', 'SRID=4326;POINT(-77.0365 38.8977)');
insert into events (host_id, title, starts_at, venue_id) values
  (pg_temp.uid('ho'), 'Past Party', now() - interval '1 day', (select id from venues where name = 'Rating Test Bar')),
  (pg_temp.uid('ho'), 'Future Party', now() + interval '1 day', (select id from venues where name = 'Rating Test Bar'));
insert into event_rsvps (event_id, user_id) select id, pg_temp.uid('go') from events where title in ('Past Party', 'Future Party');

-- ── Venue ratings ─────────────────────────────────────────────────────────
select pg_temp.act_as('go');
select is((event_rating((select id from events where title = 'Past Party'))->>'can_rate')::boolean, true, 'A guest can rate after the event');
select is((event_rating((select id from events where title = 'Future Party'))->>'can_rate')::boolean, false, 'Not before it starts');
select is((select count(*)::int from places_to_rate() where title = 'Past Party'), 1, 'Places to rate lists the event');
select lives_ok(format('select rate_venue(%s, 4, %L)', (select id from events where title = 'Past Party'), 'Great music'), 'Rate it 4 stars');
select lives_ok(format('select rate_venue(%s, 5, null)', (select id from events where title = 'Past Party')), 'Change it to 5');
select is((event_rating((select id from events where title = 'Past Party'))->>'my_stars')::int, 5, 'One rating per event, updated');
select is((select count(*)::int from places_to_rate() where title = 'Past Party'), 0, 'Rated events leave the list');
select throws_ok(format('select rate_venue(%s, 5, null)', (select id from events where title = 'Future Party')), '42501', null, 'Can''t rate an event that hasn''t happened');
select throws_ok(format('select rate_venue(%s, 9, null)', (select id from events where title = 'Past Party')), '23514', null, 'Stars are 1 to 5');
select pg_temp.act_as('no');
select throws_ok(format('select rate_venue(%s, 1, null)', (select id from events where title = 'Past Party')), '42501', null, 'You can''t rate a place you didn''t go to');
select is((venue_detail((select id from venues where name = 'Rating Test Bar'))->'rating'->>'avg')::numeric, 5.0, 'The venue page shows the average');
select is((venue_detail((select id from venues where name = 'Rating Test Bar'))->'rating'->>'count')::int, 1, 'And how many ratings');
select ok(exists (select 1 from top_venues() where name = 'Rating Test Bar'), 'Rated places show up in the ranking');
select pg_temp.act_as('go');
select is((select count(*)::int from venue_ratings), 0, 'Ratings can''t be read directly (only through the venue page)');

-- ── Music on posts ────────────────────────────────────────────────────────
select pg_temp.admin();
insert into pins (author_id, category, body, audience) values (pg_temp.uid('ho'), 'photos', 'Rooftop', 'circle');
insert into ids select 'pin', id from pins where body = 'Rooftop';
select pg_temp.act_as('ho');
select lives_ok(format($q$insert into pin_music (pin_id, track_id, title, artist, artwork_url, preview_url, apple_url)
  values (%s, 1, 'Song', 'Artist', 'https://is1-ssl.mzstatic.com/a.jpg', 'https://audio-ssl.itunes.apple.com/p.m4a', 'https://music.apple.com/us/album/1')$q$,
  pg_temp.id('pin')), 'Add a song to your post');
select throws_ok(format($q$insert into pin_music (pin_id, track_id, title, artist, preview_url, apple_url)
  values (%s, 2, 'X', 'Y', 'https://evil.example.com/a.mp3', 'https://music.apple.com/x')$q$,
  pg_temp.id('pin')), '23514', null, 'Only Apple''s preview links are allowed');
select pg_temp.act_as('fr');
select is((select title from pin_music where pin_id = pg_temp.id('pin')), 'Song', 'Your circle sees the song');
select pg_temp.act_as('no');
select is((select count(*)::int from pin_music where pin_id = pg_temp.id('pin')), 0, 'Others don''t see a circle-only post''s song');
select throws_ok(format($q$insert into pin_music (pin_id, track_id, title, artist, preview_url, apple_url)
  values (%s, 3, 'X', 'Y', 'https://audio-ssl.itunes.apple.com/p.m4a', 'https://music.apple.com/x')$q$,
  pg_temp.id('pin')), '42501', null, 'You can''t add music to someone else''s post');

-- ── Live video ────────────────────────────────────────────────────────────
select pg_temp.act_as('ho');
select throws_ok('select start_live(''Hi'', ''circle'')', '0A000', null, 'Off until a video service is connected');
select pg_temp.admin();
update app_config set value = 'true' where key = 'live_video_enabled';
select pg_temp.act_as('ho');
select ok(start_live('Rooftop live', 'circle') is not null, 'Go live to your circle');
select pg_temp.admin();
insert into ids select 'live', id from live_streams where title = 'Rooftop live';
select is((select count(*)::int from notifications where user_id = pg_temp.uid('fr') and kind = 'live'), 1, 'Your circle is told');
select pg_temp.act_as('fr');
select is((select count(*)::int from live_now() where title = 'Rooftop live'), 1, 'Your circle sees you''re live');
select ok(post_live_comment(pg_temp.id('live'), 'Hey!') is not null, 'Friends can comment');
select is(jsonb_array_length(live_detail(pg_temp.id('live'))->'comments'), 1, 'Comments show on the live video');
select pg_temp.act_as('no');
select is((select count(*)::int from live_now() where title = 'Rooftop live'), 0, 'Circle-only live is hidden from others');
select is(live_detail(pg_temp.id('live')), null, 'And can''t be opened');
select throws_ok(format('select live_join_check(%s, %L)', pg_temp.id('live'), pg_temp.uid('no')), '42501', null,
  'Only the server hands out video access');
select pg_temp.admin();
select is(live_join_check(pg_temp.id('live'), pg_temp.uid('fr'))->>'role', 'viewer', 'Friends join as viewers');
select pg_temp.act_as('ho');
select end_live(pg_temp.id('live'));
select is((select count(*)::int from live_now() where title = 'Rooftop live'), 0, 'Ending it takes it off the list');

select * from finish();
rollback;
