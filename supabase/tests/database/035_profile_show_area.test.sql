-- Show my area: your neighborhood and city leave your profile card when you turn it off.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
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
insert into t values ('ana', pg_temp.new_user('ana35@test.dev', 'Ana Five'));
update profiles set neighborhood = 'Shaw', city_id = (select id from cities order by id limit 1) where id = pg_temp.uid('ana');

select pg_temp.act_as('ana');
select is(public.profile_card(pg_temp.uid('ana'))->>'neighborhood', 'Shaw', 'your area shows by default');
select lives_ok($$ update profiles set show_area = false where id = pg_temp.uid('ana') $$, 'you can hide your area');
select is(public.profile_card(pg_temp.uid('ana'))->>'neighborhood', null, 'hidden: no neighborhood on your profile card');
select is(public.profile_card(pg_temp.uid('ana'))->>'city_name', null, 'hidden: no city on your profile card');
set local role postgres;
select isnt((select city_id from profiles where id = pg_temp.uid('ana')), null, 'your city is kept for what is near you');

select * from finish();
rollback;
