-- The In Crowd: request, approval, safest defaults, and the protections.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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
insert into t values ('star', pg_temp.new_user('star44@test.dev', 'Jordan Vale')),
                     ('pal', pg_temp.new_user('pal44@test.dev', 'Rae Picked')),
                     ('fan', pg_temp.new_user('fan44@test.dev', 'Fan Insider')),
                     ('adm', pg_temp.new_user('adm44@test.dev', 'Ada Admin'));
update profiles set role = 'admin' where id = pg_temp.uid('adm');
insert into connections (user_a, user_b, source, created_at)
select least(a.id, b.id), greatest(a.id, b.id), 'intro', now() from t a, t b where a.k = 'star' and b.k in ('pal', 'fan');
insert into pins (author_id, category, body) values (pg_temp.uid('star'), 'thought', 'New single Friday');

select pg_temp.act_as('star');
select throws_ok($$ select public.request_in_crowd('https://instagram.com/jordanvale') $$, '23514', 'Do the selfie check first.', 'the selfie check comes first');
set local role postgres;
update profiles set photo_verified_at = now() where id = pg_temp.uid('star');
select pg_temp.act_as('star');
select lives_ok($$ select public.request_in_crowd('https://instagram.com/jordanvale', 'Sam, manager') $$, 'a member can ask to join');
select ok((public.my_in_crowd()->>'code') ~ '^IMIN-[0-9A-F]{4}$', 'they get a code for their bio');
select ok(private.can_message(pg_temp.uid('fan'), pg_temp.uid('star')), 'before approval, Insiders can message as usual');

select pg_temp.act_as('fan');
select throws_ok($$ select * from public.admin_in_crowd_requests() $$, '42501', null, 'only admins see requests');

select pg_temp.act_as('adm');
select is((select code from public.admin_in_crowd_requests() limit 1), (select 'IMIN-' || upper(substr(md5(pg_temp.uid('star')::text || 'in-crowd'), 1, 4))), 'admins see the code to look for');
select public.admin_decide_in_crowd((select id from public.admin_in_crowd_requests() limit 1), true);

select pg_temp.act_as('star');
select is(public.my_in_crowd()->>'location', 'after', 'location starts at "after I leave"');
select is((public.my_in_crowd()->>'intro_requests')::boolean, false, 'intro requests start off');
select lives_ok($$ select public.set_in_crowd_pick(pg_temp.uid('pal'), true) $$, 'they can pick an Insider');

set local role postgres;
select ok(not private.can_message(pg_temp.uid('fan'), pg_temp.uid('star')), 'an Insider they didn''t pick can''t message');
select ok(private.can_message(pg_temp.uid('pal'), pg_temp.uid('star')), 'someone they picked can');
select ok(not private.can_see_out(pg_temp.uid('star'), pg_temp.uid('fan')), 'where they are is hidden from others');
select ok(private.can_see_out(pg_temp.uid('star'), pg_temp.uid('pal')), 'but not from people they picked');

select pg_temp.act_as('fan');
select throws_ok($$ insert into pin_replies (pin_id, author_id, body) values ((select id from pins where body = 'New single Friday'), auth.uid(), 'Love it') $$,
                 '42501', null, 'replies are limited to people they picked');
select ok(exists (select 1 from public.in_crowd_members() where id = pg_temp.uid('star')), 'they show in the In Crowd row');
select is((public.profile_card(pg_temp.uid('star'))->>'in_crowd')::boolean, true, 'the profile shows the badge');

select * from finish();
rollback;
