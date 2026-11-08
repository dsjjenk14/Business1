-- Header photo and profile color: yours to set, checked, and shown on your card.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

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
insert into t values ('ana', pg_temp.new_user('ana37@test.dev', 'Ana Seven')), ('ben', pg_temp.new_user('ben37@test.dev', 'Ben Seven'));

select pg_temp.act_as('ana');
select throws_ok(format($$ select public.set_profile_header('https://x.supabase.co/storage/v1/object/public/avatars/%s/h.jpg') $$, pg_temp.uid('ben')),
  '23514', 'Upload the photo first.', 'you cannot use someone else''s photo as your header');
select lives_ok(format($$ select public.set_profile_header('https://x.supabase.co/storage/v1/object/public/avatars/%s/h.jpg') $$, pg_temp.uid('ana')), 'you can set your own header');
select lives_ok($$ update profiles set profile_color = 'gold' where id = auth.uid() $$, 'you can pick a profile color');
select throws_ok($$ update profiles set profile_color = 'neon' where id = auth.uid() $$, '23514', null, 'only the offered colors');
select is(public.profile_card(pg_temp.uid('ana'))->>'profile_color', 'gold', 'your card has your color');
select ok(public.profile_card(pg_temp.uid('ana'))->>'header_url' like '%/h.jpg', 'your card has your header');

select * from finish();
rollback;
