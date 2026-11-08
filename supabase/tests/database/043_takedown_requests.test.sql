-- Intimate image removal requests: anyone can ask, the identified post is held at once,
-- admins remove or decline with a 48-hour clock, and reminders go out.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create or replace function pg_temp.new_user(p_email text, p_name text) returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '',
          jsonb_build_object('accepted_terms', true, 'full_name', p_name, 'birthdate', '1990-01-01'), now(), now());
  return uid;
end $$;
create temp table t (k text primary key, id uuid);
grant select on t to authenticated, anon;
create temp table ids (k text primary key, id bigint, code text);
grant select, insert on ids to authenticated, anon;
create or replace function pg_temp.uid(k text) returns uuid language sql as $$ select id from t where t.k = uid.k $$;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
end $$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('ana', pg_temp.new_user('ana43@test.dev', 'Ana FortyThree')),
                     ('bad', pg_temp.new_user('bad43@test.dev', 'Bo FortyThree')),
                     ('adm', pg_temp.new_user('adm43@test.dev', 'Ada Admin'));
update profiles set role = 'admin' where id = pg_temp.uid('adm');
insert into pins (author_id, category, body) values (pg_temp.uid('bad'), 'thought', 'look at this');
insert into ids (k, id) select 'pin', id from pins where author_id = pg_temp.uid('bad');

select pg_temp.act_as('ana');
select throws_ok($$ select public.submit_takedown('post', 'It is me and I never agreed', 'Ana', 'ana@x.com', false, null, true, (select id from ids where k = 'pin')) $$,
                 '23514', null, 'the requester has to confirm the statement');
select throws_ok($$ select public.submit_takedown('other', 'It is me and I never agreed', 'Ana', 'ana@x.com', true) $$,
                 '23514', null, 'they have to say where it is');
insert into ids (k, code) select 'r1', public.submit_takedown('post', 'This is a photo of me I never agreed to share', 'Ana FortyThree', 'ana@x.com', true,
                                                             null, true, (select id from ids where k = 'pin'));
set local role postgres;
select ok((select code from ids where k = 'r1') ~ '^[0-9A-F]{8}$', 'the requester gets a confirmation number');
select ok((select hidden_at is not null from pins where id = (select id from ids where k = 'pin')), 'the post is hidden right away');
select ok((select due_at between now() + interval '47 hours' and now() + interval '49 hours' from takedown_requests where code = (select code from ids where k = 'r1')),
          'the deadline is 48 hours');
select ok(exists (select 1 from notifications where user_id = pg_temp.uid('adm') and title = 'Removal request: 48 hours'), 'admins are told');

-- Someone without an account can ask too.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into ids (k, code) select 'r2', public.submit_takedown('profile_photo', 'That profile uses a private photo of me', 'Jo Public', 'jo@x.com', true,
                                                             'The profile named Bo, main photo');
select is((public.takedown_status((select code from ids where k = 'r2'))->>'status'), 'open', 'anyone with the number can check on it');
select throws_ok($$ select * from public.admin_takedowns() $$, '42501', null, 'only admins see requests');

select pg_temp.act_as('bad');
select is((select count(*)::int from takedown_requests), 0, 'the poster can''t see requests');

select pg_temp.act_as('adm');
select is((select count(*)::int from public.admin_takedowns() where status = 'open'), 2, 'admins see both open requests');
select ok(jsonb_array_length(public.admin_takedown_remove((select id from takedown_requests where code = (select code from ids where k = 'r1')))) >= 1,
          'removing returns the files to delete');
set local role postgres;
select ok(not exists (select 1 from pins where id = (select id from ids where k = 'pin')), 'the post is gone');
select pg_temp.act_as('adm');
select throws_ok($$ select public.admin_takedown_decline((select id from takedown_requests where code = (select code from ids where k = 'r2')), '') $$,
                 '23514', null, 'declining needs a reason');

set local role postgres;
update takedown_requests set due_at = now() + interval '2 hours' where code = (select code from ids where k = 'r2');
select private.remind_takedowns();
select ok(exists (select 1 from notifications where user_id = pg_temp.uid('adm') and title = 'Removal request due soon'), 'admins are reminded before the deadline');

select * from finish();
rollback;
