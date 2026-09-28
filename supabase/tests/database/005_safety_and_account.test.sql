-- App Store requirements: terms at signup, reports + auto-hide, block, account deletion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Test members are on the free plan (no founding Premium) unless a test says otherwise.
update app_config set value = '0' where key = 'founding_member_limit';

create or replace function pg_temp.new_user(p_email text, p_name text, p_terms boolean default true) returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '',
          jsonb_build_object('accepted_terms', p_terms, 'full_name', p_name, 'birthdate', '1990-01-01'), now(), now());
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

-- ── Terms ────────────────────────────────────────────────────────────────
select throws_ok($$ select pg_temp.new_user('noterms@test.dev', 'No Terms', false) $$, '23514',
  'You need to agree to the Terms and Community Guidelines to join.', 'Signup requires agreeing to the Terms');

insert into t values
  ('ana', pg_temp.new_user('ana5@test.dev', 'Ana Five')),
  ('bo',  pg_temp.new_user('bo5@test.dev',  'Bo Five')),
  ('cy',  pg_temp.new_user('cy5@test.dev',  'Cy Five')),
  ('di',  pg_temp.new_user('di5@test.dev',  'Di Five'));
select ok((select terms_accepted_at is not null from profile_private where id = pg_temp.uid('ana')), 'When they agreed is recorded');

-- ── Reports + auto-hide ──────────────────────────────────────────────────
insert into pins (author_id, category, body) values (pg_temp.uid('ana'), 'thought', 'reported pin');
select pg_temp.act_as('ana');
select throws_ok(format($$ select report('spam', '', %L) $$, pg_temp.uid('ana')), '23514', null, 'You can''t report yourself');
select pg_temp.act_as('bo');
select lives_ok($$ select report('spam', 'selling stuff', p_pin => (select id from pins where body = 'reported pin')) $$, 'A member reports a pin');
select is((select count(*)::int from reports), 0, 'Members can''t read the reports table (moderator notes live there)');
select is((select status::text from my_reports() limit 1), 'open', 'Reporters can see their report''s status');
select pg_temp.act_as('cy');
select report('inappropriate', '', p_pin => (select id from pins where body = 'reported pin'));
select ok(exists (select 1 from pins_feed('community') where body = 'reported pin'), 'Two reports: still visible');
select pg_temp.act_as('di');
select report('inappropriate', '', p_pin => (select id from pins where body = 'reported pin'));
select ok(not exists (select 1 from pins_feed('community') where body = 'reported pin'), 'Three different reporters: hidden from everyone else');
select pg_temp.act_as('ana');
select ok(exists (select 1 from pins_feed('author', p_author => pg_temp.uid('ana')) where body = 'reported pin'), 'The author still sees their own hidden pin');

-- ── Block ────────────────────────────────────────────────────────────────
select pg_temp.admin();
insert into connections (user_a, user_b, source) values (least(pg_temp.uid('ana'), pg_temp.uid('bo')), greatest(pg_temp.uid('ana'), pg_temp.uid('bo')), 'manual');
insert into pins (author_id, category, body) values (pg_temp.uid('bo'), 'thought', 'bo pin');
select pg_temp.act_as('ana');
select block_user(pg_temp.uid('bo'));
select pg_temp.admin();
select ok(not private.are_connected(pg_temp.uid('ana'), pg_temp.uid('bo')), 'Blocking removes the connection');
select pg_temp.act_as('ana');
select ok(not exists (select 1 from pins_feed('community') where body = 'bo pin'), 'Blocked member''s pins disappear');
select is(profile_card(pg_temp.uid('bo')), null, 'Blocked member''s profile is unavailable');
select pg_temp.act_as('bo');
select is(profile_card(pg_temp.uid('ana')), null, 'Blocking works both ways');
select pg_temp.act_as('ana');
select unblock_user(pg_temp.uid('bo'));
select ok(exists (select 1 from pins_feed('community') where body = 'bo pin'), 'Unblocking makes them visible again');

-- ── Account deletion ─────────────────────────────────────────────────────
select pg_temp.admin();
insert into groups (name, category, owner_id) values ('Cy Crew', 'social', pg_temp.uid('cy'));
insert into group_members (group_id, user_id, role) values
  ((select id from groups where name = 'Cy Crew'), pg_temp.uid('cy'), 'owner'),
  ((select id from groups where name = 'Cy Crew'), pg_temp.uid('di'), 'member');
select prepare_account_deletion(pg_temp.uid('cy'));
delete from auth.users where id = pg_temp.uid('cy');
select is((select owner_id from groups where name = 'Cy Crew'), pg_temp.uid('di'), 'Deleting an account hands its groups to another member');
select ok(not exists (select 1 from profiles where id = pg_temp.uid('cy')), 'Deleting the login removes the profile and everything tied to it');

select * from finish();
rollback;
