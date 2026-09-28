-- Nearby works for members who haven't shared a location: it uses their city.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

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

insert into t values ('a', pg_temp.new_user('a21@test.dev', 'Ada TwentyOne')), ('b', pg_temp.new_user('b21@test.dev', 'Bo TwentyOne'));
update profiles set approx_location = null, city_id = (select id from cities where slug = 'rockville-md') where id in (select id from t);

select pg_temp.act_as('b');
insert into pins (author_id, category, body, audience) values (pg_temp.uid('b'), 'thought', 'Rockville hello', 'everyone');
select pg_temp.act_as('a');
select isnt((select approx_location from pins where body = 'Rockville hello'), null, 'A pin posted without a location lands in the author''s city');
select is((select count(*)::int from pins_feed('nearby') x where x.body = 'Rockville hello'), 1, 'Nearby shows it to someone in the same city without GPS');
select is((select count(*)::int from pins_feed('nearby', 38.9072, -77.0369, 5) x where x.body = 'Rockville hello'), 0, 'GPS still wins when the phone shares it');
select lives_ok($$ select going_out_feed('tonight', null, null, 25) $$, 'Tonight works without GPS too');

select * from finish();
rollback;
