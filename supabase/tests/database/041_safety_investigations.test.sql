-- In-person safety reports: priority, automatic hold (only when they really interacted), saved
-- evidence, an answer to the reporter, removal blocking the phone number and the member's vouches,
-- appeals, and clearing a hold.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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
create or replace function pg_temp.idn(k text) returns bigint language sql as $$ select id from ids where ids.k = idn.k $$;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
end $$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('ana', pg_temp.new_user('ana41@test.dev', 'Ana FortyOne')),
                     ('bad', pg_temp.new_user('bad41@test.dev', 'Bo FortyOne')),
                     ('str', pg_temp.new_user('str41@test.dev', 'Sy Stranger')),
                     ('cat', pg_temp.new_user('cat41@test.dev', 'Cat FortyOne')),
                     ('adm', pg_temp.new_user('adm41@test.dev', 'Ada Admin'));
update profiles set role = 'admin' where id = pg_temp.uid('adm');
update profile_private set phone = '+12025550141', phone_verified_at = now() where id = pg_temp.uid('bad');
-- Ana and Bo met on a date; Bo vouched for Cat.
insert into encounters (user_a, user_b, context, place_label, distance_m, overlap_start, overlap_end)
values (least(pg_temp.uid('ana'), pg_temp.uid('bad')), greatest(pg_temp.uid('ana'), pg_temp.uid('bad')), 'date', 'U Street', 5, now() - interval '3 hours', now() - interval '1 hour');
insert into date_requests (from_id, to_id, when_kind, note, status)
values (pg_temp.uid('bad'), pg_temp.uid('ana'), 'tonight', 'Drinks?', 'accepted');
insert into vouches (voucher_id, vouchee_id, type) values (pg_temp.uid('bad'), pg_temp.uid('cat'), 'invite');

-- A low-priority report first, then the serious one.
select pg_temp.act_as('str');
insert into ids select 'low', public.report('spam', 'Ads', p_user => pg_temp.uid('cat'));
select pg_temp.act_as('ana');
insert into ids select 'r1', public.report('assault', 'After our date', p_user => pg_temp.uid('bad'));

set local role postgres;
select is((select priority::int from reports where id = pg_temp.idn('r1')), 1, 'assault reports are urgent');
select ok((select under_review from profiles where id = pg_temp.uid('bad')), 'the reported member is put on hold right away');
select ok(exists (select 1 from blocks where blocker_id = pg_temp.uid('ana') and blocked_id = pg_temp.uid('bad')), 'the two are blocked from each other');
select ok(exists (select 1 from notifications where user_id = pg_temp.uid('ana') and kind = 'report_received' and body like '%RAINN%' and body like '%911%'),
          'the reporter is answered, with help resources');
select is((select jsonb_array_length(data->'met_in_person') from private.report_evidence where report_id = pg_temp.idn('r1')), 1, 'where they met is saved');
select is((select jsonb_array_length(data->'date_requests') from private.report_evidence where report_id = pg_temp.idn('r1')), 1, 'date plans are saved');
select ok(private.is_restricted(pg_temp.uid('bad')), 'a member on hold is restricted');

select pg_temp.act_as('bad');
select throws_ok($$ insert into pins (author_id, category, body) values (auth.uid(), 'thought', 'hi') $$, '42501', null, 'a member on hold can''t post');
select is((public.my_account_status()->>'under_review')::boolean, true, 'the app knows the account is on hold');
select is((select count(*)::int from notifications where user_id = auth.uid() and body ilike '%Ana%'), 0, 'the reported member is never told who reported');

-- A report about a stranger they never interacted with: urgent, but no automatic hold.
select pg_temp.act_as('str');
insert into ids select 'r2', public.report('violence', 'Threats', p_user => pg_temp.uid('cat'));
set local role postgres;
select ok(not (select under_review from profiles where id = pg_temp.uid('cat')), 'no automatic hold without a real interaction');
select ok(exists (select 1 from notifications where user_id = pg_temp.uid('str') and kind = 'report_received' and body like 'We’re reviewing it first%'),
          'the reporter isn''t told there''s a hold when there isn''t');

select pg_temp.act_as('adm');
select is((select id from public.admin_reports() limit 1) in (pg_temp.idn('r1'), pg_temp.idn('r2')), true, 'the most serious reports come first');
select is((select priority::int from public.admin_reports() where id = pg_temp.idn('low')), 4, 'spam is low priority');
select is((public.admin_report_evidence(pg_temp.idn('r1'))->'saved'->'met_in_person'->0->>'place'), 'U Street', 'admins can see the saved evidence');
select is((public.admin_report_evidence(pg_temp.idn('r1'))->>'reporter_reports_made')::int, 1, 'admins see the reporter''s history');
select pg_temp.act_as('ana');
select throws_ok($$ select public.admin_report_evidence(pg_temp.idn('r1')) $$, '42501', null, 'only admins see evidence');

-- Removal: the phone number is blocked and their vouches stop counting.
select pg_temp.act_as('adm');
select public.admin_member_action(pg_temp.idn('r1'), 'ban');
set local role postgres;
select is((select vouch_count from profiles where id = pg_temp.uid('cat')), 0, 'a removed member''s vouches stop counting');
insert into t values ('new', pg_temp.new_user('bad41b@test.dev', 'Bo Again'));
update profile_private set phone = '+1 (202) 555-0141' where id = pg_temp.uid('new');
select ok((select banned_at is not null from profiles where id = pg_temp.uid('new')), 'a new account with the same phone is removed too');

-- Appeals.
select pg_temp.act_as('bad');
select lives_ok($$ select public.submit_appeal('I did not do this') $$, 'a removed member can ask for a review');
select throws_ok($$ select public.submit_appeal('again') $$, '23514', null, 'only one open request at a time');
select pg_temp.act_as('adm');
select public.admin_decide_appeal((select id from public.admin_appeals() where user_id = pg_temp.uid('bad')), true);
set local role postgres;
select ok((select banned_at is null and not under_review from profiles where id = pg_temp.uid('bad'))
          and (select vouch_count from profiles where id = pg_temp.uid('cat')) = 1, 'lifting restores the account and its vouches');

-- Clearing a hold after review.
update profiles set under_review = true where id = pg_temp.uid('cat');
select pg_temp.act_as('cat');
select lives_ok($$ select public.submit_appeal('Please check') $$, 'a member on hold can ask for a review');
select pg_temp.act_as('adm');
select public.admin_clear_hold(pg_temp.uid('cat'));
set local role postgres;
select ok(not private.is_restricted(pg_temp.uid('cat')), 'an admin can clear a hold');

-- Dismissing an urgent report lifts its hold.
update profiles set under_review = true where id = pg_temp.uid('cat');
select pg_temp.act_as('adm');
select public.admin_act_on_report(pg_temp.idn('r2'), 'dismiss');
set local role postgres;
select ok(not (select under_review from profiles where id = pg_temp.uid('cat')), 'dismissing the report lifts the hold');
select ok(exists (select 1 from private.delayed_notices where user_id = pg_temp.uid('str') and kind = 'report_outcome'), 'the reporter hears back when a report is closed');

select * from finish();
rollback;
