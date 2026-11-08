-- Suspended members can't go live.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);
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
update app_config set value = '0' where key = 'founding_member_limit';
insert into app_config (key, value) values ('live_video_enabled', 'true') on conflict (key) do update set value = 'true';
insert into t values ('ok', pg_temp.new_user('ok45@test.dev', 'Ok Member')), ('sus', pg_temp.new_user('sus45@test.dev', 'Sus Member'));
update profiles set suspended_until = now() + interval '7 days' where id = (select id from t where k = 'sus');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t where k = 'ok'), 'role', 'authenticated')::text, true);
select lives_ok($$ select public.start_live('Hello', 'circle') $$, 'a member in good standing can go live');
select set_config('request.jwt.claims', json_build_object('sub', (select id from t where k = 'sus'), 'role', 'authenticated')::text, true);
select throws_ok($$ select public.start_live('Hello', 'circle') $$, '42501', null, 'a suspended member can''t');
select * from finish();
rollback;
