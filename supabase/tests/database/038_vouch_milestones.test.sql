-- Vouch milestones: crossing 10/30/75/100/300/500/1000 notifies you once, Insiders from 100,
-- the app knows which celebration is pending, and 1000+ shows in Most vouched.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
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
create or replace function pg_temp.uid(k text) returns uuid language sql as $$ select id from t where t.k = uid.k $$;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
end $$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('ana', pg_temp.new_user('ana38@test.dev', 'Ana Eight')),
                     ('ben', pg_temp.new_user('ben38@test.dev', 'Ben Eight'));
insert into connections (user_a, user_b, source) select least(pg_temp.uid('ana'), pg_temp.uid('ben')), greatest(pg_temp.uid('ana'), pg_temp.uid('ben')), 'invite';

select is(private.milestone_for(9), 0, 'under 10: no milestone');
select is(private.milestone_for(74), 30, '74 vouches: the 30 milestone');
select is(private.milestone_for(1200), 1000, '1200 vouches: the 1000 milestone');

update profiles set vouch_count = 12 where id = pg_temp.uid('ana');
select is((select count(*)::int from notifications where user_id = pg_temp.uid('ana') and kind = 'milestone'), 1, 'crossing 10 notifies you');
select is((select count(*)::int from notifications where user_id = pg_temp.uid('ben') and kind = 'milestone_friend'), 0, 'Insiders aren''t told before 100');
update profiles set vouch_count = 13 where id = pg_temp.uid('ana');
select is((select count(*)::int from notifications where user_id = pg_temp.uid('ana') and kind = 'milestone'), 1, 'no repeat inside the same milestone');

select pg_temp.act_as('ana');
select is(public.my_pending_milestone(), 10, 'the app knows to celebrate 10');
select public.celebrate_milestone(10);
select is(public.my_pending_milestone(), 0, 'celebrated once, not again');

set local role postgres;
update profiles set vouch_count = 1000 where id = pg_temp.uid('ana');
select is((select count(*)::int from notifications where user_id = pg_temp.uid('ben') and kind = 'milestone_friend'), 1, 'from 100 on, Insiders hear about it');
select is((select title from notifications where user_id = pg_temp.uid('ana') and kind = 'milestone' order by id desc limit 1), 'You hit 1,000 vouches', '1000 is the biggest moment');

select pg_temp.act_as('ben');
select ok(exists (select 1 from public.famous_members() where id = pg_temp.uid('ana')), '1000+ shows in Most vouched');

select * from finish();
rollback;
