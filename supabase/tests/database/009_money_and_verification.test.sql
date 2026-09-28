-- Phase 6: founding Premium, analytics (Premium only), placements, partner
-- inquiries, photo verification review, admin-only tools.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

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

-- Ana joins while founding spots are open; Bo and Boss after they've run out.
update app_config set value = '1000000' where key = 'founding_member_limit';
insert into t values ('ana', pg_temp.new_user('ana9@test.dev', 'Ana Nine'));
update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('bo',  pg_temp.new_user('bo9@test.dev',  'Bo Nine')),
                     ('boss', pg_temp.new_user('boss9@test.dev', 'Boss Nine'));
update profiles set role = 'admin' where id = pg_temp.uid('boss');

-- ── Premium ──────────────────────────────────────────────────────────────
select pg_temp.act_as('ana');
select ok((my_plan()->>'is_premium')::boolean, 'Founding Members get Premium right away');
select is(my_plan()->>'source', 'founding', 'from the founding offer');
select ok((my_plan()->>'premium_until')::timestamptz between now() + interval '89 days' and now() + interval '93 days', 'for 3 months');
select pg_temp.act_as('bo');
select ok(not (my_plan()->>'is_premium')::boolean, 'Later members start on the free plan');

-- ── Analytics ────────────────────────────────────────────────────────────
select record_profile_view(pg_temp.uid('ana'));
select record_profile_view(pg_temp.uid('ana'));
select ok((profile_analytics()->>'locked')::boolean, 'Analytics are Premium only');
select pg_temp.act_as('ana');
select is((profile_analytics()->>'views_7d')::int, 1, 'Views count once per person per day');
select is((profile_analytics()->>'viewers_other_30d')::int, 1, 'Split by circle / network / others, never by name');
select record_profile_view(pg_temp.uid('ana'));
select is((profile_analytics()->>'views_7d')::int, 1, 'Viewing your own profile doesn''t count');

-- ── Featured places ──────────────────────────────────────────────────────
select pg_temp.admin();
insert into venues (name, neighborhood, location, emoji)
values ('Perk Bar', 'Testville', extensions.st_setsrid(extensions.st_makepoint(-77.30, 38.60), 4326)::extensions.geography, 'drinks');
select pg_temp.act_as('bo');
select throws_ok($$ insert into venue_placements (venue_id, kind, perk, starts_at, ends_at)
  values ((select id from venues where name = 'Perk Bar'), 'sponsored', '10% off', now(), now() + interval '7 days') $$,
  '42501', null, 'Members can''t create placements');
select pg_temp.act_as('boss');
update venue_placements set ends_at = now() - interval '1 minute';  -- only this test's placement is live
insert into venue_placements (venue_id, kind, perk, starts_at, ends_at)
values ((select id from venues where name = 'Perk Bar'), 'sponsored', '10% off for I''m In members', now() - interval '1 hour', now() + interval '7 days');
select pg_temp.act_as('bo');
select is((select perk from featured_places(38.60, -77.30) where name = 'Perk Bar'), '10% off for I''m In members', 'Featured Places lists active placements with the perk');
select is((select name from feed_placement(38.60, -77.30)), 'Perk Bar', 'One labeled placement for the feed');
select is(venue_detail((select id from venues where name = 'Perk Bar'))->'placement'->>'kind', 'sponsored', 'The venue page shows the placement');
select pg_temp.act_as('boss');
update venue_placements set ends_at = now() - interval '1 minute';
select pg_temp.act_as('bo');
select is((select count(*)::int from featured_places()), 0, 'Ended placements disappear');

-- ── Partner inquiries ────────────────────────────────────────────────────
select lives_ok($$ select submit_partner_inquiry('Perk Bar', 'Pat Owner', 'pat@perkbar.test', null, null, 'We''d love to partner') $$, 'A venue can ask to partner');
select is((select count(*)::int from partner_inquiries), 0, 'Members can''t read inquiries');
select pg_temp.act_as('boss');
select is((select count(*)::int from partner_inquiries where business_name = 'Perk Bar'), 1, 'Admins can');

-- ── Photo verification ───────────────────────────────────────────────────
select pg_temp.act_as('bo');
select isnt(photo_verification_challenge()->>'gesture', null, 'The photo check gives a random gesture');
select lives_ok(format($$ select submit_photo_verification((select id from verification_requests where user_id = %L), %L) $$,
  pg_temp.uid('bo'), pg_temp.uid('bo')::text || '/selfie.jpg'), 'Submit the selfie');
select throws_ok($$ select admin_verifications() $$, '42501', 'Admins only.', 'Only admins see the review queue');
select pg_temp.act_as('boss');
select is((select count(*)::int from admin_verifications()), 1, 'The admin sees it waiting');
select admin_review_verification((select id from verification_requests where user_id = pg_temp.uid('bo')), true);
select pg_temp.act_as('bo');
select isnt(my_verification()->>'photo_verified_at', null, 'Approved: the member is photo verified');
select pg_temp.act_as('boss');
select ok(admin_grant_premium('bo9@test.dev', 30) > now(), 'Admins can grant Premium by email');

select * from finish();
rollback;
