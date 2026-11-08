-- Everyone passes the photo check before using the app; new photos wait for a reviewer once you're verified.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);
update app_config set value = 'true' where key = 'photo_check_required';
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
create or replace function pg_temp.url(k text, f text) returns text language sql as $$
  select 'http://127.0.0.1:54321/storage/v1/object/public/avatars/' || pg_temp.uid(k) || '/' || f $$;
update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('new', pg_temp.new_user('new47@test.dev', 'Nia New')), ('ver', pg_temp.new_user('ver47@test.dev', 'Vic Verified')),
                     ('rev', pg_temp.new_user('rev47@test.dev', 'Rae Reviewer')), ('adm', pg_temp.new_user('adm47@test.dev', 'Ada Admin'));
update profiles set role = 'admin' where id = pg_temp.uid('adm');
update profiles set photo_reviewer = true, photo_verified_at = now() where id = pg_temp.uid('rev');
update profiles set photo_verified_at = now(), photo_urls = array[pg_temp.url('ver', 'a.jpg')], avatar_url = pg_temp.url('ver', 'a.jpg')
  where id = pg_temp.uid('ver');

-- ── Required before using the app ─────────────────────────────────────────
select pg_temp.act_as('new');
select is((my_account_status()->>'needs_photo_check')::boolean, true, 'a new member still needs the photo check');
select is((my_account_status()->>'has_photo')::boolean, false, 'and has no photo yet');
select throws_ok($$ insert into pins (author_id, category, body) values (auth.uid(), 'thought', 'hi') $$, '42501', 'Finish your photo check first.', 'can''t post before the check');
select lives_ok(format('select set_profile_photos(array[%L])', pg_temp.url('new', '1.jpg')), 'can still add photos');
select is((select avatar_url from profiles where id = auth.uid()), pg_temp.url('new', '1.jpg'), 'first photos apply right away (the check reviews them)');
select is((my_account_status()->>'has_photo')::boolean, true, 'now has a photo');
select pg_temp.act_as('adm');
select is((my_account_status()->>'needs_photo_check')::boolean, false, 'admins don''t need it');
select pg_temp.act_as('ver');
select is((my_account_status()->>'needs_photo_check')::boolean, false, 'verified members are in');
select lives_ok($$ insert into pins (author_id, category, body) values (auth.uid(), 'thought', 'hi') $$, 'verified members can post');

-- ── New photos wait for review ────────────────────────────────────────────
select is(set_profile_photos(array[pg_temp.url('ver', 'b.jpg'), pg_temp.url('ver', 'a.jpg')])->'pending', to_jsonb(array[pg_temp.url('ver', 'b.jpg'), pg_temp.url('ver', 'a.jpg')]), 'a new photo is held');
select is((select avatar_url from profiles where id = auth.uid()), pg_temp.url('ver', 'a.jpg'), 'nobody sees it yet');
select throws_ok(format('update profiles set avatar_url = %L where id = auth.uid()', pg_temp.url('ver', 'c.jpg')), '42501', null, 'can''t swap it in directly');
select is(set_profile_photos(array[pg_temp.url('ver', 'a.jpg')])->'photos', to_jsonb(array[pg_temp.url('ver', 'a.jpg')]), 'saving only approved photos happens right away');
select is((select count(*)::int from pending_photos), 0, 'and replaces what was waiting');
select lives_ok(format('select set_profile_photos(array[%L, %L])', pg_temp.url('ver', 'b.jpg'), pg_temp.url('ver', 'a.jpg')), 'sends the new photo again');
select pg_temp.act_as('new');
select is((select count(*)::int from pending_photos), 0, 'other members can''t see held photos');
select throws_ok($$ select * from admin_pending_photos() $$, '42501', null, 'only reviewers see them');
select pg_temp.act_as('rev');
select is((select new_photos from admin_pending_photos() where user_id = pg_temp.uid('ver')), array[pg_temp.url('ver', 'b.jpg'), pg_temp.url('ver', 'a.jpg')], 'the reviewer sees the new set');
select lives_ok(format('select admin_review_photos(%L, true)', pg_temp.uid('ver')), 'reviewer approves');
select is((select avatar_url from profiles where id = pg_temp.uid('ver')), pg_temp.url('ver', 'b.jpg'), 'the new photo is live');
select pg_temp.act_as('ver');
select is((select count(*)::int from notifications where user_id = auth.uid() and title = 'Your new photos are up'), 1, 'and they''re told');
select is(set_profile_photos(array[]::text[])->'photos', '[]'::jsonb, 'removing photos happens right away');

select * from finish();
rollback;
