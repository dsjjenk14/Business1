-- Photo reviewers: approve photo checks, nothing else; the gesture expires; browser selfies are flagged.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
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
update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('ana', pg_temp.new_user('ana46@test.dev', 'Ana FortySix')), ('rev', pg_temp.new_user('rev46@test.dev', 'Rae Reviewer')),
                     ('adm', pg_temp.new_user('adm46@test.dev', 'Ada Admin'));
update profiles set role = 'admin' where id = pg_temp.uid('adm');

select pg_temp.act_as('rev');
select throws_ok($$ update profiles set photo_reviewer = true where id = auth.uid() $$, '42501', null, 'members can''t make themselves reviewers');
select throws_ok($$ select * from public.admin_verifications() $$, '42501', null, 'not a reviewer yet');

select pg_temp.act_as('adm');
select is(public.admin_set_photo_reviewer('REV46@test.dev', true), 'Rae R.', 'an admin makes someone a reviewer by email');

-- Ana starts a check and sends it from a browser.
select pg_temp.act_as('ana');
select public.photo_verification_challenge();
select lives_ok($$ select public.submit_photo_verification((select id from verification_requests where user_id = auth.uid()), auth.uid() || '/1.jpg', true) $$, 'sent in time');

select pg_temp.act_as('rev');
select is((select from_browser from public.admin_verifications() where user_id = pg_temp.uid('ana')), true, 'the reviewer sees it was sent from a browser');
select throws_ok($$ select * from public.admin_reports() $$, '42501', null, 'reviewers can''t see reports');
select lives_ok($$ select public.admin_review_verification((select id from public.admin_verifications() limit 1), true) $$, 'the reviewer approves it');
set local role postgres;
select ok((select photo_verified_at is not null from profiles where id = pg_temp.uid('ana')), 'Ana is photo verified');

-- The reviewer's own check: they can't approve it.
select pg_temp.act_as('rev');
select public.photo_verification_challenge();
select public.submit_photo_verification((select id from verification_requests where user_id = auth.uid()), auth.uid() || '/1.jpg');
select is((select count(*)::int from public.admin_verifications()), 0, 'reviewers don''t see their own check');

-- Expired gesture.
set local role postgres;
update verification_requests set status = 'declined' where user_id = pg_temp.uid('rev');
select pg_temp.act_as('rev');
select public.photo_verification_challenge();
set local role postgres;
update verification_requests set created_at = now() - interval '11 minutes' where user_id = pg_temp.uid('rev') and status = 'draft';
select pg_temp.act_as('rev');
select throws_ok($$ select public.submit_photo_verification((select id from verification_requests where user_id = auth.uid() and status = 'draft'), auth.uid() || '/2.jpg') $$,
                 '23514', 'That gesture expired. Start the photo check again for a new one.', 'the gesture expires after 10 minutes');
select pg_temp.act_as('adm');
select is((select count(*)::int from public.admin_photo_reviewers()), 1, 'admins see their reviewers');
select * from finish();
rollback;
