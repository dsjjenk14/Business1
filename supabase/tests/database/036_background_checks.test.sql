-- Background checks: consent first, pay or free after 30 days of Premium, only "clear" shows a tag.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
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
grant select, insert on ids to authenticated;
create or replace function pg_temp.uid(k text) returns uuid language sql as $$ select id from t where t.k = uid.k $$;
create or replace function pg_temp.idn(k text) returns bigint language sql as $$ select id from ids where ids.k = idn.k $$;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
end $$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('ana', pg_temp.new_user('ana36@test.dev', 'Ana Six')),
                     ('ben', pg_temp.new_user('ben36@test.dev', 'Ben Six')),
                     ('cam', pg_temp.new_user('cam36@test.dev', 'Cam Six')),
                     ('adm', pg_temp.new_user('adm36@test.dev', 'Ada Admin'));
update profiles set role = 'admin' where id = pg_temp.uid('adm');
-- Ben has had Premium for 40 days; Cam only for 5.
insert into entitlements (user_id, premium_until, source, updated_at) values
  (pg_temp.uid('ben'), now() + interval '30 days', 'stripe', now()),
  (pg_temp.uid('cam'), now() + interval '30 days', 'stripe', now());
update entitlements set premium_since = now() - interval '40 days' where user_id = pg_temp.uid('ben');
update entitlements set premium_since = now() - interval '5 days' where user_id = pg_temp.uid('cam');

-- Off until a company is connected.
select pg_temp.act_as('ana');
select throws_ok($$ select public.start_background_check(true) $$, '23514', 'Background checks are coming soon.', 'checks are off until a company is set up');
set local role postgres;
update app_config set value = 'true' where key = 'background_check_enabled';

select pg_temp.act_as('ana');
select throws_ok($$ select public.start_background_check(false) $$, '23514', 'Please agree to the background check first.', 'you have to agree first');
select is((public.start_background_check(true))->>'needs_payment', 'true', 'without Premium, you pay');
select is((select status::text from background_checks where user_id = pg_temp.uid('ana')), 'awaiting_payment', 'the check waits for payment');
select throws_ok($$ insert into background_checks (user_id, status, paid_with) values (auth.uid(), 'clear', 'admin') $$, '42501', null, 'you cannot write your own check');
select throws_ok($$ update profiles set background_checked_at = now() where id = auth.uid() $$, '42501', null, 'you cannot give yourself the tag');

select pg_temp.act_as('cam');
select is((public.start_background_check(true))->>'needs_payment', 'true', '5 days of Premium: still pay');
select is((public.background_check_status())->>'free', 'false', 'status says not free yet');

select pg_temp.act_as('ben');
select is((public.background_check_status())->>'free', 'true', '40 days of Premium: free');
insert into ids select 'ben', ((public.start_background_check(true))->>'check_id')::bigint;
select is((select status::text from background_checks where id = pg_temp.idn('ben')), 'pending', 'free check starts right away');
select throws_ok($$ select public.start_background_check(true) $$, '23514', 'Your background check is already in progress.', 'one at a time');
select throws_ok($$ select public.background_check_result(pg_temp.idn('ben'), true) $$, '42501', 'Admins only.', 'you cannot mark your own result');
select is((public.profile_card(pg_temp.uid('ben')))->>'background_checked', 'false', 'no tag before a result');

select pg_temp.act_as('adm');
select lives_ok($$ select public.background_check_result(pg_temp.idn('ben'), true, 'test', 'ref-1') $$, 'a clear result is recorded');
select pg_temp.act_as('ana');
select is((public.profile_card(pg_temp.uid('ben')))->>'background_checked', 'true', 'others see the Background checked tag');
select is((select count(*)::int from background_checks where user_id = pg_temp.uid('ben')), 0, 'nobody else can see the check itself');

select * from finish();
rollback;
