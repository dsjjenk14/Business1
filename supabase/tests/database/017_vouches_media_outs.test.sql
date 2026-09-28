-- Vouch limits by plan, video/boomerang posts, Outs (send, open once,
-- stories, screenshots, cleanup) and What's In.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

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

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('a', pg_temp.new_user('a17@test.dev', 'Ava Seventeen')),
                     ('b', pg_temp.new_user('b17@test.dev', 'Ben Seventeen')),
                     ('c', pg_temp.new_user('c17@test.dev', 'Cal Seventeen'));
-- a and b are in each other's circle; c isn't connected to anyone.
insert into connections (user_a, user_b, source) values (least(pg_temp.uid('a'), pg_temp.uid('b')), greatest(pg_temp.uid('a'), pg_temp.uid('b')), 'manual');

-- ── Vouch limits ──────────────────────────────────────────────────────────
select is(plan_limit(pg_temp.uid('a'), 'vouches_per_month'), 5::numeric, 'Free plan: 5 vouches a month');
select pg_temp.act_as('a');
select is(my_vouches_left_this_month(), 5, 'A new month starts with 5 left');
select pg_temp.admin();
insert into entitlements (user_id, premium_until, source) values (pg_temp.uid('a'), now() + interval '30 days', 'admin')
on conflict (user_id) do update set premium_until = excluded.premium_until;
select is(plan_limit(pg_temp.uid('a'), 'vouches_per_month'), null, 'Premium: no limit');
select pg_temp.act_as('a');
select is(my_vouches_left_this_month(), null, 'Premium shows unlimited');

-- ── Video and boomerang posts ────────────────────────────────────────────
select pg_temp.admin();
insert into pins (author_id, category, body, audience) values (pg_temp.uid('a'), 'photos', 'Clip', 'circle');
insert into ids select 'pin', id from pins where body = 'Clip';
select pg_temp.act_as('a');
select lives_ok(format($q$insert into pin_media (pin_id, kind, path, poster_path, duration_s) values (%s, 'video', %L, %L, 12)$q$,
  pg_temp.id('pin'), pg_temp.uid('a') || '/' || pg_temp.id('pin') || '/video.mp4', pg_temp.uid('a') || '/' || pg_temp.id('pin') || '/poster.jpg'),
  'Add a video to your post');
select pg_temp.act_as('b');
select is((select kind from pin_media where pin_id = pg_temp.id('pin')), 'video', 'Your circle sees the video');
select pg_temp.act_as('c');
select is((select count(*)::int from pin_media where pin_id = pg_temp.id('pin')), 0, 'Others don''t see a circle-only video');
select pg_temp.admin();
delete from pin_media where pin_id = pg_temp.id('pin');
select pg_temp.act_as('a');
select throws_ok(format($q$insert into pin_media (pin_id, kind, path) values (%s, 'video', %L)$q$, pg_temp.id('pin'), pg_temp.uid('b') || '/1/x.mp4'),
  '42501', null, 'Media must be your own files for this post');
select throws_ok(format($q$insert into pin_media (pin_id, kind, frames) values (%s, 'boomerang', array[%L])$q$, pg_temp.id('pin'),
  pg_temp.uid('a') || '/' || pg_temp.id('pin') || '/f1.jpg'), '23514', null, 'A boomerang needs at least 3 frames');
select lives_ok(format($q$insert into pin_media (pin_id, kind, frames) values (%s, 'boomerang', array[%L, %L, %L])$q$, pg_temp.id('pin'),
  pg_temp.uid('a') || '/' || pg_temp.id('pin') || '/f1.jpg', pg_temp.uid('a') || '/' || pg_temp.id('pin') || '/f2.jpg',
  pg_temp.uid('a') || '/' || pg_temp.id('pin') || '/f3.jpg'), 'Add a boomerang');

-- ── Outs ──────────────────────────────────────────────────────────────────
-- Anywhere (not only at events). At an event, the event is attached.
select pg_temp.act_as('a');
select ok(send_out(pg_temp.uid('a') || '/anywhere.jpg', null, array[pg_temp.uid('b')]::uuid[], false) is not null, 'Outs work anywhere');
select pg_temp.admin();
select is((select title from notifications where user_id = pg_temp.uid('b') and kind = 'out' order by id desc limit 1), 'Ava S. sent you an Out', 'Not at an event: plain notice');
select is((select round(extract(epoch from expires_at - created_at) / 60)::int from outs where path like '%/anywhere.jpg'), 360, 'An Out lasts 6 hours');
select pg_temp.act_as('a');
select is(my_out_event(), null, 'Not at an event');
select pg_temp.admin();
insert into events (host_id, title, starts_at) values (pg_temp.uid('b'), 'Out Party', now() - interval '30 minutes');
insert into ids select 'ev', id from events where title = 'Out Party';
insert into event_rsvps (event_id, user_id) values (pg_temp.id('ev'), pg_temp.uid('a'));
insert into location_pings (user_id, location, purpose, event_id)
values (pg_temp.uid('a'), 'SRID=4326;POINT(-77.03 38.9)', 'checkin', pg_temp.id('ev'));
select pg_temp.act_as('a');
select is(my_out_event()->>'title', 'Out Party', 'Once you''re marked there, the app knows your event');
select throws_ok(format('select send_out(%L, null, array[%L]::uuid[], false)', pg_temp.uid('b') || '/x.jpg', pg_temp.uid('b')),
  '23514', null, 'Outs must be your own upload');
select throws_ok(format('select send_out(%L, null, array[%L]::uuid[], false)', pg_temp.uid('a') || '/x.jpg', pg_temp.uid('c')),
  '23514', null, 'Only people in your circle (strangers are dropped, so nothing to send)');
select ok(send_out(pg_temp.uid('a') || '/one.jpg', 'Look!', array[pg_temp.uid('b'), pg_temp.uid('c')], false) is not null, 'Send an Out to a friend');
select pg_temp.admin();
insert into ids select 'out1', id from outs where path like '%/one.jpg';
select is((select count(*)::int from out_recipients where out_id = pg_temp.id('out1')), 1, 'Strangers in the list are left out');
select is((select title from notifications where user_id = pg_temp.uid('b') and kind = 'out' order by id desc limit 1), 'Ava S. sent you an Out from Out Party', 'The notification names the event');
select pg_temp.act_as('b');
select is((select (x->>'unopened')::int from jsonb_array_elements(outs_inbox()->'received') x), 2, 'Both show as new in their Outs');
select is((select count(*)::int from outs), 0, 'Outs can''t be read directly');
select throws_ok(format('select out_open(%s, %L)', pg_temp.id('out1'), pg_temp.uid('b')), '42501', null, 'Only the server opens Outs');
select pg_temp.admin();
select is(out_open(pg_temp.id('out1'), pg_temp.uid('b'))->>'caption', 'Look!', 'The friend opens it');
select is(out_open(pg_temp.id('out1'), pg_temp.uid('b'))->>'caption', 'Look!', 'And can look again during the hour');
select is(out_open(pg_temp.id('out1'), pg_temp.uid('c'))->>'error', 'This Out is gone.', 'Nobody else can open it');
select pg_temp.act_as('b');
select out_screenshot(pg_temp.id('out1'));
select pg_temp.admin();
select is((select count(*)::int from notifications where user_id = pg_temp.uid('a') and kind = 'out_screenshot'), 1, 'Screenshots are reported to the sender');
select pg_temp.act_as('c');
select throws_ok(format('select pin_out(%s)', pg_temp.id('out1')), '23514', null, 'You can''t pin an Out that wasn''t sent to you');
select pg_temp.act_as('b');
select ok(pin_out(pg_temp.id('out1')), 'Pin it to keep it');
select pin_out(pg_temp.id('out1'));
select pg_temp.admin();
select is((select count(*)::int from notifications where user_id = pg_temp.uid('a') and kind = 'out_pinned'), 1, 'The sender is told once');
select is((select title from notifications where user_id = pg_temp.uid('a') and kind = 'out_pinned'), 'Ben S. pinned your Out', 'By name');
-- The hour passes.
update outs set expires_at = now() - interval '1 minute' where sender_id = pg_temp.uid('a') and not to_story;
select is(out_open(pg_temp.id('out1'), pg_temp.uid('b'))->>'caption', 'Look!', 'Pinned: still there after the hour');
select is(out_open(pg_temp.id('out1'), pg_temp.uid('a'))->>'error', 'This Out is gone. Outs last 6 hours unless you pin them.', 'Not pinned: gone after 6 hours');
select ok(not exists (select 1 from outs_to_clean() where id = pg_temp.id('out1')), 'A pinned Out''s photo is kept');
select ok(exists (select 1 from outs_to_clean() o join outs x on x.id = o.id where x.path like '%/anywhere.jpg'), 'An unpinned one is deleted');
select pg_temp.act_as('b');
select is(jsonb_array_length(outs_inbox()->'pinned'), 1, 'Pinned Outs have their own list');
select is(jsonb_array_length(outs_inbox()->'received'), 0, 'And leave the new-Outs list after the hour');
select unpin_out(pg_temp.id('out1'));
select pg_temp.admin();
select ok(exists (select 1 from outs_to_clean() where id = pg_temp.id('out1')), 'Unpinned after the hour: its photo is deleted');
select outs_cleaned(array[pg_temp.id('out1')]);
select is(out_open(pg_temp.id('out1'), pg_temp.uid('b'))->>'error', 'This Out is gone.', 'Gone after cleanup');

-- My Out: your circle (or your network, if you pick that) can watch it for an hour.
select pg_temp.act_as('a');
select ok(send_out(pg_temp.uid('a') || '/story.jpg', null, array[]::uuid[], true) is not null, 'Post to My Out');
select pg_temp.admin();
insert into ids select 'story', id from outs where path like '%/story.jpg';
select pg_temp.act_as('b');
select is(jsonb_array_length(outs_inbox()->'stories'), 1, 'Friends see your My Out');
select pg_temp.act_as('c');
select is(jsonb_array_length(outs_inbox()->'stories'), 0, 'Others don''t');
select pg_temp.admin();
select ok(out_open(pg_temp.id('story'), pg_temp.uid('b'))->>'path' is not null, 'A friend watches it');
select ok(out_open(pg_temp.id('story'), pg_temp.uid('b'))->>'path' is not null, 'And can watch again while it lasts');
select pg_temp.act_as('a');
select is((outs_inbox()->'my_story'->0->>'views')::int, 1, 'You see how many watched');
select throws_ok(format('select send_out(%L, null, array[]::uuid[], true, %L)', pg_temp.uid('a') || '/s2.jpg', 'everyone'),
  '23514', null, 'My Out is for your circle or your network, not everyone');

-- ── Unvouch ───────────────────────────────────────────────────────────────
select pg_temp.admin();
insert into encounters (user_a, user_b, context, place_label, distance_m, overlap_start, overlap_end)
values (least(pg_temp.uid('a'), pg_temp.uid('c')), greatest(pg_temp.uid('a'), pg_temp.uid('c')), 'nearby', 'Somewhere', 5, now() - interval '1 hour', now());
update entitlements set premium_until = now() - interval '1 day' where user_id = pg_temp.uid('a');
insert into vouches (voucher_id, vouchee_id, type, word_id, encounter_id)
select pg_temp.uid('a'), pg_temp.uid('c'), 'gps', (select min(id) from vouch_words), id from encounters where place_label = 'Somewhere';
select pg_temp.act_as('a');
select is((select count(*)::int from my_vouches_given() where user_id = pg_temp.uid('c')), 1, 'You see who you''ve vouched for');
select is(my_vouches_left_this_month(), 4, '1 of 5 used');
select is(unvouch(pg_temp.uid('c')), 1, 'Take the vouch back');
select is((select count(*)::int from my_vouches_given() where user_id = pg_temp.uid('c')), 0, 'It''s gone from your list');
select is((select vouch_count from profiles where id = pg_temp.uid('c')), 0, 'And from their vouch count');
select is(my_vouches_left_this_month(), 4, 'A vouch you took back still counts this month');

-- ── What's In ─────────────────────────────────────────────────────────────
select pg_temp.act_as('c');
select ok(jsonb_typeof(whats_in()->'events') = 'array' and jsonb_typeof(whats_in()->'hot_tonight') = 'array', 'What''s In returns events and hot spots');

select * from finish();
rollback;
