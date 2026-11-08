-- Shoutouts: only at 1,000 vouches, only with a yes, posted by the official account (or waiting until it's set).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

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
update app_config set value = 'null' where key = 'official_account_id';
insert into t values ('ana', pg_temp.new_user('ana39@test.dev', 'Ana Nine')),
                     ('ben', pg_temp.new_user('ben39@test.dev', 'Ben Nine')),
                     ('imin', pg_temp.new_user('official39@test.dev', 'I''m In'));
update profiles set vouch_count = 1000 where id = pg_temp.uid('ana');
update profiles set vouch_count = 40 where id = pg_temp.uid('ben');

select pg_temp.act_as('ben');
select throws_ok($$ select public.answer_shoutout(true) $$, '23514', 'Shoutouts are for 1,000 vouches.', 'only at 1,000 vouches');

select pg_temp.act_as('ana');
select is(public.answer_shoutout(true), 'waiting', 'a yes waits until the official account is set');
select is((select count(*)::int from pins where body like 'Shoutout to Ana%'), 0, 'nothing posted yet');

set local role postgres;
update app_config set value = to_jsonb(pg_temp.uid('imin')::text) where key = 'official_account_id';
select private.post_waiting_shoutouts();
select is((select author_id from pins where body like 'Shoutout to Ana%'), pg_temp.uid('imin'), 'posted by the official account once it''s set');
select is((select status from shoutouts where user_id = pg_temp.uid('ana')), 'posted', 'marked posted');
select is((select count(*)::int from notifications where user_id = pg_temp.uid('ana') and kind = 'shoutout'), 1, 'the member is told');

select pg_temp.act_as('ana');
select is(public.answer_shoutout(true), 'posted', 'asking again doesn''t post twice');
select is((public.profile_card(pg_temp.uid('imin')))->>'is_official', 'true', 'the official account shows as official');

select * from finish();
rollback;
