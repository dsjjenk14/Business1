-- Members can't set server-controlled columns (timestamps, counters, flags).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

create or replace function pg_temp.new_user(p_email text) returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '',
          '{"full_name":"Test Person","birthdate":"1990-01-01"}', now(), now());
  return uid;
end $$;

create temp table t (id uuid);
grant select on t to authenticated;
insert into t values (pg_temp.new_user('col@test.dev'));
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', (select id from t), 'role', 'authenticated')::text, true);

select lives_ok(
  format($$ insert into pins (author_id, category, body) values (%L, 'thought', 'hello') $$, (select id from t)),
  'Members can post a normal pin');
select lives_ok(
  format($$ insert into pins (author_id, category, body) values (%L, 'photos', 'with returning') returning id $$, (select id from t)),
  'Creating a pin and reading back its id works (what the app does)');
select throws_ok(
  format($$ insert into pins (author_id, category, body, created_at) values (%L, 'thought', 'backdated', '2020-01-01') $$, (select id from t)),
  '42501', null, 'Members cannot backdate a pin');
select throws_ok(
  format($$ insert into pins (author_id, category, body, like_count) values (%L, 'thought', 'fake likes', 999) $$, (select id from t)),
  '42501', null, 'Members cannot pre-fill like counts');
select throws_ok(
  format($$ insert into going_out_posts (user_id, when_kind, starts_at, expires_at, is_priority) values (%L, 'tonight', now(), now() + interval '4 hours', true) $$, (select id from t)),
  '42501', null, 'Members cannot give themselves Premium priority');

select * from finish();
rollback;
