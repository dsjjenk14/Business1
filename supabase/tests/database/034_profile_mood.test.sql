-- Profile mood: you set your own, it shows on your profile card, and it stays short.
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
insert into t values ('ana', pg_temp.new_user('ana34@test.dev', 'Ana Four')),
                     ('ben', pg_temp.new_user('ben34@test.dev', 'Ben Four'));

select pg_temp.act_as('ana');
select lives_ok($$ update profiles set mood = 'ready for the weekend' where id = pg_temp.uid('ana') $$, 'you can set your own mood');
select is((select mood from profiles where id = pg_temp.uid('ana')), 'ready for the weekend', 'the mood is saved');
select is(public.profile_card(pg_temp.uid('ana'))->>'mood', 'ready for the weekend', 'your profile card shows your mood');
select throws_ok($$ update profiles set mood = repeat('x', 61) where id = pg_temp.uid('ana') $$, '23514', null, 'a mood over 60 characters is refused');

select pg_temp.act_as('ben');
update profiles set mood = 'hijacked' where id = pg_temp.uid('ana');
set local role postgres;
select is((select mood from profiles where id = pg_temp.uid('ana')), 'ready for the weekend', 'nobody else can change your mood');

select * from finish();
rollback;
