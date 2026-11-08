-- Second feedback round: prompts, photo check for dates, reporting a date,
-- 1 vouch + verified hosts, event photos, groups near you and stats, Claim
-- your place, contacts on the app and Insider requests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);
update app_config set value = 'false' where key = 'photo_check_required'; -- tests that aren't about the photo check

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
create or replace function pg_temp.idn(k text) returns bigint language sql as $$ select id from ids where ids.k = idn.k $$;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;

update app_config set value = '0' where key = 'founding_member_limit';
update app_config set value = '10' where key = 'invite_vouch_cap';
insert into t values ('ana', pg_temp.new_user('ana33@test.dev', 'Ana Three')),
                     ('ben', pg_temp.new_user('ben33@test.dev', 'Ben Three')),
                     ('cam', pg_temp.new_user('cam33@test.dev', 'Cam Three')),
                     ('biz', pg_temp.new_user('biz33@test.dev', 'Bea Business')),
                     ('adm', pg_temp.new_user('adm33@test.dev', 'Ada Admin'));
update profiles set role = 'admin' where id = pg_temp.uid('adm');

-- Prompts.
select pg_temp.act_as('ana');
select lives_ok($$ select set_profile_prompts('[{"key":"ideal_friday","answer":" Dinner then dancing "},{"key":"ask_me_about","answer":"Pickleball"}]') $$, 'You answer prompts');
select is((select profile_card(pg_temp.uid('ana'))->'prompts'->0->>'answer'), 'Dinner then dancing', 'They show on your profile, trimmed');
select throws_ok($$ select set_profile_prompts('[{"key":"favorite_bar","answer":"x"}]') $$, '23514', null, 'Only prompts from the list');
select throws_ok($$ select set_profile_prompts('[{"key":"ideal_friday","answer":"a"},{"key":"ask_me_about","answer":"b"},{"key":"learning","answer":"c"},{"key":"never_miss","answer":"d"}]') $$, '23514', null, 'Three at most');
select throws_ok($$ select set_profile_prompts('[{"key":"ideal_friday","answer":"a"},{"key":"ideal_friday","answer":"b"}]') $$, '23514', null, 'Each prompt once');

-- Photo check for dates.
select pg_temp.admin();
insert into connections (user_a, user_b, source) values (least(pg_temp.uid('ana'), pg_temp.uid('ben')), greatest(pg_temp.uid('ana'), pg_temp.uid('ben')), 'intro');
select pg_temp.act_as('ana');
select throws_ok(format('select send_date_request(%L, ''tonight'')', pg_temp.uid('ben')), '23514', null, 'No photo check, no date requests');
select pg_temp.admin();
update profiles set photo_verified_at = now() where id = pg_temp.uid('ana');
select pg_temp.act_as('ana');
select lives_ok(format('select send_date_request(%L, ''tonight'')', pg_temp.uid('ben')), 'With a photo check you can ask');
select pg_temp.act_as('ben');
select throws_ok($$ select respond_date_request((select id from date_requests where to_id = pg_temp.uid('ben')), true) $$, '23514', null, 'Saying yes needs a photo check too');
select lives_ok($$ select respond_date_request((select id from date_requests where to_id = pg_temp.uid('ben')), false) $$, 'Passing doesn''t');

-- Report a date.
select pg_temp.act_as('ben');
select lives_ok(format('select report_date(%L, ''unsafe'', ''Made me uncomfortable'', (select id from date_requests where to_id = %L))', pg_temp.uid('ana'), pg_temp.uid('ben')), 'You report a date');
select pg_temp.admin();
select ok(exists (select 1 from reports where reporter_id = pg_temp.uid('ben') and reported_user_id = pg_temp.uid('ana') and date_request_id is not null and details like '[Date]%'), '...and the admin sees it as a date report');
select pg_temp.act_as('cam');
select throws_ok(format('select report_date(%L, ''unsafe'')', pg_temp.uid('ana')), '23514', null, 'You can''t report a date you didn''t go on');

-- 1 vouch to start; verified hosts count double.
select is((select value::text from app_config where key = 'safety_min_vouches'), '1', 'One vouch to see people out');
select pg_temp.admin();
insert into vouches (voucher_id, vouchee_id, type) values (pg_temp.uid('ana'), pg_temp.uid('cam'), 'invite');
select is(private.trust_points(pg_temp.uid('cam')), 1, 'A vouch is worth 1');
select pg_temp.act_as('adm');
select lives_ok($$ select admin_set_verified_host('ANA33@test.dev', true) $$, 'The admin makes someone a verified host');
select is(private.trust_points(pg_temp.uid('cam')), 2, 'A verified host''s vouch is worth 2');
select is((select vouch_count from profiles where id = pg_temp.uid('cam')), 1, '...but the vouch count shows the real number');
select is((select profile_card(pg_temp.uid('ana'))->>'verified_host'), 'true', 'Verified hosts show on their profile');

-- Event photos.
select pg_temp.admin();
with x as (insert into events (host_id, title, starts_at, ends_at) values (pg_temp.uid('ana'), 'Gallery Night', now() - interval '3 hours', now() - interval '1 hour') returning id)
insert into ids select 'ev', id from x;
insert into event_rsvps (event_id, user_id) values (pg_temp.idn('ev'), pg_temp.uid('ben'));
select pg_temp.act_as('cam');
select throws_ok(format('insert into pins (author_id, category, body, audience, event_id) values (%L, ''photos'', ''hi'', ''everyone'', %s)', pg_temp.uid('cam'), pg_temp.idn('ev')),
                 '23514', null, 'You can''t post photos to an event you didn''t go to');
select pg_temp.act_as('ben');
select lives_ok(format('insert into pins (author_id, category, body, audience, event_id) values (%L, ''photos'', ''What a night'', ''everyone'', %s)', pg_temp.uid('ben'), pg_temp.idn('ev')), 'People who went post photos');
select pg_temp.admin();
insert into pin_photos (pin_id, storage_path, position) select id, pg_temp.uid('ben') || '/' || id || '/1.jpg', 1 from pins where author_id = pg_temp.uid('ben');
select pg_temp.act_as('cam');
select is((select count(*)::int from event_photos(pg_temp.idn('ev'))), 1, 'Photos show in the event''s gallery');

-- Groups near you, Beginner friendly and stats.
select pg_temp.admin();
with x as (insert into groups (name, category, owner_id) values ('Rock Creek Runners', 'fitness', pg_temp.uid('ana')) returning id) insert into ids select 'grp', id from x;
insert into group_members (group_id, user_id, role) values (pg_temp.idn('grp'), pg_temp.uid('ana'), 'owner'), (pg_temp.idn('grp'), pg_temp.uid('ben'), 'member');
select pg_temp.act_as('ben');
select throws_ok(format('select set_group_beginner_friendly(%s, true)', pg_temp.idn('grp')), '42501', null, 'Only owners and co-hosts tag a group');
select throws_ok(format('select group_stats(%s)', pg_temp.idn('grp')), '42501', null, 'Only owners and co-hosts see stats');
select pg_temp.act_as('ana');
select lives_ok(format('select set_group_beginner_friendly(%s, true)', pg_temp.idn('grp')), 'The owner tags it Beginner friendly');
select is((select (group_stats(pg_temp.idn('grp'))->>'new_this_week')::int), 2, 'Stats count new members this week');
select pg_temp.act_as('cam');
select ok(exists (select 1 from groups_near_you('fitness') where id = pg_temp.idn('grp') and beginner_friendly), 'It shows in Groups near you, tagged');

-- Claim your place.
select pg_temp.admin();
with x as (insert into venues (name, location) values ('Busboys Test', extensions.st_point(-77.03, 38.91)::extensions.geography) returning id) insert into ids select 'ven', id from x;
select pg_temp.act_as('biz');
select lives_ok(format('select claim_place(%s, ''Busboys'', null, ''Bea'', ''2025550100'', ''Free coffee'')', pg_temp.idn('ven')), 'A business claims its place');
select pg_temp.admin();
select is((select count(*)::int from notifications where user_id = pg_temp.uid('adm') and kind = 'place_claim'), 1, 'The admin is told');
select pg_temp.act_as('biz');
select throws_ok($$ select admin_review_claim((select id from venue_claims limit 1), true) $$, '42501', null, 'Only the admin approves');
select pg_temp.act_as('adm');
select lives_ok($$ select admin_review_claim((select id from venue_claims where business_name = 'Busboys'), true) $$, 'The admin approves it');
select pg_temp.admin();
select is((select free_months from venue_claims where business_name = 'Busboys'), 3, 'One of the first places: 3 free months');
select lives_ok($$ select place_claim_activate((select id from venue_claims where business_name = 'Busboys'), 'sub_test') $$, 'Stripe confirms: it goes live');
select ok(private.is_partner(pg_temp.idn('ven')), '...as a partner with a placement');
select pg_temp.act_as('biz');
select lives_ok(format('select post_venue_special(%s, ''Half-price wings'')', pg_temp.idn('ven')), 'The owner posts specials without the admin');
select pg_temp.admin();
update venue_placements set starts_at = now() - interval '1 hour' where venue_id = pg_temp.idn('ven'); -- time passes
select place_claim_cancel('sub_test');
select ok(not private.is_partner(pg_temp.idn('ven')), 'Cancelling ends the partnership');

-- Contacts on the app and Insider requests.
select pg_temp.admin();
update profile_private set phone = '+12025550133', phone_verified_at = now() where id = pg_temp.uid('cam');
select pg_temp.act_as('biz');
select is((select display_name from contacts_on_app(array[encode(extensions.digest('+12025550133', 'sha256'), 'hex')])), 'Cam T.', 'A contact''s number finds them');
select lives_ok(format('select send_insider_request(%L)', pg_temp.uid('cam')), 'You ask to be Insiders');
select pg_temp.act_as('cam');
select lives_ok(format('select respond_insider_request(%L, true)', pg_temp.uid('biz')), 'They accept');
select ok(private.are_connected(pg_temp.uid('biz'), pg_temp.uid('cam')), '...and you''re Insiders');
select pg_temp.admin();
update user_settings set findable_by_phone = false where user_id = pg_temp.uid('cam');
select pg_temp.act_as('ana');
select is((select count(*)::int from contacts_on_app(array[encode(extensions.digest('+12025550133', 'sha256'), 'hex')])), 0, 'Turning off "find me by number" hides you');

select * from finish();
rollback;
