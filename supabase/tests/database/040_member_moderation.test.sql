-- Moderation: warn, suspend and remove a member; vouchers told on removal; the reporter is never revealed;
-- notices to the reported member are delayed; restricted members can't act.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);
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
insert into t values ('ana', pg_temp.new_user('ana40@test.dev', 'Ana Forty')),
                     ('bad', pg_temp.new_user('bad40@test.dev', 'Bo Forty')),
                     ('vic', pg_temp.new_user('vic40@test.dev', 'Vi Forty')),
                     ('adm', pg_temp.new_user('adm40@test.dev', 'Ada Admin'));
update profiles set role = 'admin' where id = pg_temp.uid('adm');
-- Vi vouched for Bo before.
insert into vouches (voucher_id, vouchee_id, type) values (pg_temp.uid('vic'), pg_temp.uid('bad'), 'invite');

select pg_temp.act_as('ana');
insert into ids select 'r1', public.report('harassment', 'He kept messaging me', p_user => pg_temp.uid('bad'));

select pg_temp.act_as('bad');
select is((select count(*)::int from reports), 0, 'the reported member can''t see any reports, or who made them');

select pg_temp.act_as('ana');
select throws_ok($$ select public.admin_member_action(pg_temp.idn('r1'), 'ban') $$, '42501', null, 'only admins act on reports');

select pg_temp.act_as('adm');
select lives_ok($$ select public.admin_member_action(pg_temp.idn('r1'), 'suspend', 7) $$, 'an admin can suspend');
set local role postgres;
select ok((select suspended_until > now() + interval '6 days' from profiles where id = pg_temp.uid('bad')), 'suspended for 7 days');
select is((select count(*)::int from notifications where user_id = pg_temp.uid('bad') and kind = 'moderation'), 0, 'the notice isn''t sent right away');
select ok((select bool_and(deliver_at >= now() + interval '2 hours') from private.delayed_notices where user_id = pg_temp.uid('bad')), 'it waits at least 2 hours');
select ok(not exists (select 1 from private.delayed_notices where user_id = pg_temp.uid('bad') and (body ilike '%Ana%' or title ilike '%Ana%')), 'the notice never names the reporter');
select ok(exists (select 1 from private.delayed_notices where user_id = pg_temp.uid('ana') and kind = 'report_outcome'), 'the reporter gets a thank-you');

select pg_temp.act_as('bad');
select throws_ok($$ insert into pins (author_id, category, body) values (auth.uid(), 'thought', 'hi') $$, '42501', 'Your account is suspended right now.', 'a suspended member can''t post');

select pg_temp.act_as('vic');
insert into ids select 'r2', public.report('harassment', 'Same guy', p_user => pg_temp.uid('bad'));
select pg_temp.act_as('adm');
select lives_ok($$ select public.admin_member_action(pg_temp.idn('r2'), 'ban') $$, 'an admin can remove a member');
set local role postgres;
select ok(exists (select 1 from private.delayed_notices where user_id = pg_temp.uid('vic') and kind = 'moderation_voucher'), 'everyone who vouched for them is told');
select ok(not exists (select 1 from private.delayed_notices where user_id = pg_temp.uid('vic') and kind = 'moderation_voucher' and (body ilike '%report%' or title ilike '%report%')), 'the voucher notice never mentions a report');
select pg_temp.act_as('ana');
select is(public.profile_card(pg_temp.uid('bad')), null, 'a removed member''s profile is gone for everyone else');
set local role postgres;
update private.delayed_notices set deliver_at = now() - interval '1 minute';
select private.deliver_delayed_notices();
select is((select count(*)::int from notifications where user_id = pg_temp.uid('bad') and kind = 'moderation'), 1, 'delayed notices are delivered later');

select * from finish();
rollback;
