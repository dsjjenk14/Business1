-- Outs last 6, 12 or 24 hours (the sender picks), and notices say "Insiders".
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

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
create or replace function pg_temp.admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;
create or replace function pg_temp.minutes(p text) returns int language sql as $$
  select round(extract(epoch from expires_at - created_at) / 60)::int from outs where path like '%' || p $$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('a', pg_temp.new_user('a25@test.dev', 'Ava TwentyFive')),
                     ('b', pg_temp.new_user('b25@test.dev', 'Ben TwentyFive')),
                     ('c', pg_temp.new_user('c25@test.dev', 'Cal TwentyFive'));
insert into connections (user_a, user_b, source) values (least(pg_temp.uid('a'), pg_temp.uid('b')), greatest(pg_temp.uid('a'), pg_temp.uid('b')), 'manual');

-- ── Out hours ─────────────────────────────────────────────────────────────
select pg_temp.act_as('a');
select ok(send_out(pg_temp.uid('a') || '/default.jpg', null, array[pg_temp.uid('b')]::uuid[], false) is not null, 'Send without picking hours');
select ok(send_out(pg_temp.uid('a') || '/six.jpg', null, array[pg_temp.uid('b')]::uuid[], false, 'circle', 6) is not null, 'Send for 6 hours');
select ok(send_out(pg_temp.uid('a') || '/twelve.jpg', null, array[pg_temp.uid('b')]::uuid[], false, 'circle', 12) is not null, 'Send for 12 hours');
select ok(send_out(pg_temp.uid('a') || '/day.jpg', null, array[]::uuid[], true, 'circle', 24) is not null, 'Post to your Out for 24 hours');
select ok(send_out(pg_temp.uid('a') || '/odd.jpg', null, array[pg_temp.uid('b')]::uuid[], false, 'circle', 1000) is not null, 'Any other number falls back to the default');
select throws_ok(format('select send_out(%L, null, array[]::uuid[], false)', pg_temp.uid('a') || '/none.jpg'),
  '23514', 'Pick at least one Insider, or post it to your Out.', 'Says Insider, not friend');
select pg_temp.admin();
select results_eq(
  $$ select array[pg_temp.minutes('/default.jpg'), pg_temp.minutes('/six.jpg'), pg_temp.minutes('/twelve.jpg'), pg_temp.minutes('/day.jpg'), pg_temp.minutes('/odd.jpg')] $$,
  $$ values (array[360, 360, 720, 1440, 360]) $$,
  'Outs expire after the hours the sender picked');
select is((select body from notifications where user_id = pg_temp.uid('b') and kind = 'out' order by id desc limit 1 offset 1),
  'Tap to open it. It disappears in 12 hours unless you pin it.', 'The notice says how long it lasts');

-- ── Insiders wording ──────────────────────────────────────────────────────
select pg_temp.act_as('c');
select lives_ok(format('select follow_user(%L)', pg_temp.uid('a')), 'Tap in to someone');
select pg_temp.admin();
select ok((select title from notifications where user_id = pg_temp.uid('a') and actor_id = pg_temp.uid('c') order by id desc limit 1) like '%tapped in to your posts%',
  'The notice says tapped in, not followed');

select * from finish();
rollback;
