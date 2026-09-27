-- I'm In: business-rule tests. Run with: npx supabase test db
-- Each test creates its own users inside a transaction that is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- Helper to create an auth user (fires the real signup trigger).
create or replace function pg_temp.new_user(p_email text, p_meta jsonb)
returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '', p_meta || '{"accepted_terms": true}', now(), now());
  return uid;
end $$;

create or replace function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.act_as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
end $$;

-- ── Signup rules ─────────────────────────────────────────────────────────
select throws_ok(
  $$ select pg_temp.new_user('kid@test.dev', '{"full_name":"Too Young","birthdate":"2012-01-01"}') $$,
  '23514', 'You must be 18 or older to join I''m In.', 'Under-18 signups are blocked');

select throws_ok(
  $$ select pg_temp.new_user('nodob@test.dev', '{"full_name":"No Birthday"}') $$,
  '23514', 'Date of birth is required.', 'Date of birth is required');

select throws_ok(
  $$ select pg_temp.new_user('badcode@test.dev', '{"full_name":"Bad Code","birthdate":"1995-01-01","invite_code":"NOPE123"}') $$,
  '23514', 'That invite code doesn''t match anyone.', 'Unknown invite codes are rejected');

create temp table t (k text primary key, id uuid);
grant all on t to authenticated;
insert into t values ('ana', pg_temp.new_user('ana@test.dev', '{"full_name":"Ana Rivera","birthdate":"1990-05-05","city_slug":"washington-dc"}'));

select is((select display_name from profiles where id = (select id from t where k='ana')), 'Ana R.', 'Display name defaults to "First L."');
select ok((select is_founding_member from profiles where id = (select id from t where k='ana')), 'Early members are Founding Members');
select ok((select invite_code ~ '^[A-Z2-9]{7}$' from profiles where id = (select id from t where k='ana')), 'Every member gets an invite code');

insert into t values ('ben', pg_temp.new_user('ben@test.dev', jsonb_build_object(
  'full_name', 'Ben Cho', 'birthdate', '1992-02-02',
  'invite_code', lower((select invite_code from profiles where id = (select id from t where k='ana'))))));

select ok(private.are_connected((select id from t where k='ana'), (select id from t where k='ben')), 'Invite code auto-connects both people');
select is((select count(*)::int from vouches where type='invite' and vouchee_id = (select id from t where k='ben')), 1, 'Invitee gets an invite vouch');
select is((select count(*)::int from vouches where type='invite' and vouchee_id = (select id from t where k='ana')), 1, 'Inviter gets an invite vouch');

insert into t values ('cam', pg_temp.new_user('cam@test.dev', jsonb_build_object(
  'full_name', 'Cam Diaz', 'birthdate', '1993-03-03',
  'invite_code', (select invite_code from profiles where id = (select id from t where k='ana')))));
select is((select count(*)::int from vouches where type='invite' and vouchee_id = (select id from t where k='ana')), 1,
  'Inviter''s invite vouches are capped (config: invite_vouch_cap)');

-- ── Vouch rules ──────────────────────────────────────────────────────────
select pg_temp.act_as((select id from t where k='ana'));
select throws_ok(
  format($$ insert into vouches (voucher_id, vouchee_id, type, word_id) values (%L, %L, 'gps', 1) $$,
    (select id from t where k='ana'), (select id from t where k='cam')),
  '23514', null, 'A GPS vouch without a GPS encounter is rejected');
select pg_temp.act_as_admin();
insert into t values ('eve', pg_temp.new_user('eve@test.dev', '{"full_name":"Eve Fox","birthdate":"1994-04-04"}'));
select pg_temp.act_as((select id from t where k='ana'));
select throws_ok(
  format($$ insert into vouches (voucher_id, vouchee_id, type) values (%L, %L, 'invite') $$,
    (select id from t where k='ana'), (select id from t where k='eve')),
  '42501', null, 'Members cannot create invite vouches themselves');
select pg_temp.act_as_admin();

-- Two separate GPS meetups between Ana and Cam, one between Ana and Ben.
insert into encounters (user_a, user_b, context, place_label, distance_m, overlap_start, overlap_end)
select least(a.id, c.id), greatest(a.id, c.id), 'venue', place, 20, now() - interval '2 hours', now() - interval '1 hour'
from t a, t c, (values ('Bresca'), ('Songbyrd')) as places(place) where a.k = 'ana' and c.k = 'cam';
insert into encounters (user_a, user_b, context, place_label, distance_m, overlap_start, overlap_end)
select least(a.id, c.id), greatest(a.id, c.id), 'venue', 'Rock Creek', 20, now() - interval '2 hours', now() - interval '1 hour'
from t a, t c where a.k = 'ana' and c.k = 'ben';

create temp table enc as
  select e.id, e.place_label from encounters e
  where (select id from t where k='ana') in (e.user_a, e.user_b);
grant select on enc to authenticated;

select pg_temp.act_as((select id from t where k='ana'));
select lives_ok(
  format($$ insert into vouches (voucher_id, vouchee_id, type, word_id, encounter_id) values (%L, %L, 'gps', 1, %s) $$,
    (select id from t where k='ana'), (select id from t where k='cam'), (select id from enc where place_label='Bresca')),
  'A GPS vouch with a matching meetup and a word is accepted');
select throws_ok(
  format($$ insert into vouches (voucher_id, vouchee_id, type, word_id, encounter_id) values (%L, %L, 'gps', 2, %s) $$,
    (select id from t where k='ana'), (select id from t where k='cam'), (select id from enc where place_label='Bresca')),
  '23505', null, 'One meetup can only be used for one vouch');
select lives_ok(
  format($$ insert into vouches (voucher_id, vouchee_id, type, word_id, encounter_id) values (%L, %L, 'gps', 2, %s) $$,
    (select id from t where k='ana'), (select id from t where k='cam'), (select id from enc where place_label='Songbyrd')),
  'You can vouch the same friend again after a new meetup');
select is(my_vouches_left_this_month(), 0, 'Monthly budget: 2 vouches used, 0 left');
select throws_ok(
  format($$ insert into vouches (voucher_id, vouchee_id, type, word_id, encounter_id) values (%L, %L, 'gps', 3, %s) $$,
    (select id from t where k='ana'), (select id from t where k='ben'), (select id from enc where place_label='Rock Creek')),
  '23514', 'You''ve used your vouches for this month. You get more on the 1st.', 'A 3rd vouch in the same month is blocked');
select pg_temp.act_as_admin();
select is((select vouch_count from profiles where id = (select id from t where k='cam')), 3,
  'vouch_count stays in sync (invite vouch + 2 GPS vouches)');

-- ── Privacy ──────────────────────────────────────────────────────────────
select pg_temp.act_as((select id from t where k='ben'));
select is((select count(*)::int from profile_private where id = (select id from t where k='ana')), 0, 'Others cannot read your phone/email/birthdate');
select is((select count(*)::int from profile_private), 1, 'You can read your own private details');
select is((select count(*)::int from location_pings), 0, 'Raw GPS pings are never readable');
select throws_ok(
  format($$ update profiles set vouch_count = 999 where id = %L $$, (select id from t where k='ben')),
  '42501', null, 'Members cannot edit their own vouch count');
select pg_temp.act_as_admin();

-- ── Pin audience ─────────────────────────────────────────────────────────
insert into pins (author_id, category, body, audience) values
  ((select id from t where k='ana'), 'thought', 'for my circle', 'circle'),
  ((select id from t where k='ana'), 'thought', 'for everyone', 'everyone');

select pg_temp.act_as((select id from t where k='ben'));   -- Ben is 1st degree with Ana
select is((select count(*)::int from pins where author_id = (select id from t where k='ana')), 2, '1st degree sees circle pins');
select pg_temp.act_as_admin();
insert into t values ('dee', pg_temp.new_user('dee@test.dev', '{"full_name":"Dee Evans","birthdate":"1991-01-01"}'));
select pg_temp.act_as((select id from t where k='dee'));   -- Dee is unconnected
select is((select count(*)::int from pins where author_id = (select id from t where k='ana')), 1, 'Strangers only see "everyone" pins');
select pg_temp.act_as_admin();

-- ── Messaging: 5 back-and-forths (on Pins) unlock DMs for free members ────
-- Ana & Ben are connected (invite) but haven't talked yet.
select ok(not private.can_message((select id from t where k='ana'), (select id from t where k='ben')), 'Connected but no back-and-forths yet: no messaging');

-- Likes don't count.
insert into pin_likes (pin_id, user_id) values ((select id from pins where body='for everyone'), (select id from t where k='ben'));
select is(coalesce((select exchanges from interactions where (select id from t where k='ben') in (user_a, user_b) and (select id from t where k='ana') in (user_a, user_b)), 0), 0,
  'Likes are not back-and-forths');

-- Ben comments twice in a row, then Ana answers: that's 1 back-and-forth (double texts don't count twice).
insert into pin_replies (pin_id, author_id, body) values
  ((select id from pins where body='for everyone'), (select id from t where k='ben'), 'hey!'),
  ((select id from pins where body='for everyone'), (select id from t where k='ben'), 'also this');
insert into pin_replies (pin_id, author_id, body) values ((select id from pins where body='for everyone'), (select id from t where k='ana'), 'hi Ben');
select is((select exchanges from interactions where (select id from t where k='ben') in (user_a, user_b) and (select id from t where k='ana') in (user_a, user_b)), 1,
  'Comment + owner''s reply = 1 back-and-forth');

-- Three more rounds → 4 total: still locked.
do $$ begin
  for i in 1..3 loop
    insert into pin_replies (pin_id, author_id, body) values ((select id from pins where body='for everyone'), (select id from t where k='ben'), 'ben ' || i);
    insert into pin_replies (pin_id, author_id, body) values ((select id from pins where body='for everyone'), (select id from t where k='ana'), 'ana ' || i);
  end loop;
end $$;
select ok(not private.can_message((select id from t where k='ana'), (select id from t where k='ben')), '4 back-and-forths: still locked');

insert into pin_replies (pin_id, author_id, body) values ((select id from pins where body='for everyone'), (select id from t where k='ben'), 'ben 4');
insert into pin_replies (pin_id, author_id, body) values ((select id from pins where body='for everyone'), (select id from t where k='ana'), 'ana 4');
select ok(private.can_message((select id from t where k='ana'), (select id from t where k='ben')), '5 back-and-forths: messaging unlocked');

-- Premium: skips the wait, never the intro.
select ok(not private.can_message((select id from t where k='ana'), (select id from t where k='cam')), 'Free: Ana and Cam are connected but haven''t talked, so no messaging');
insert into entitlements (user_id, premium_until) values ((select id from t where k='ana'), now() + interval '30 days');
select ok(private.can_message((select id from t where k='ana'), (select id from t where k='cam')), 'Premium skips the back-and-forth wait');
select ok(not private.can_message((select id from t where k='ana'), (select id from t where k='dee')), 'Premium never skips the intro (no messaging strangers)');

-- Accepted intros: message right away, no waiting.
insert into connections (user_a, user_b, source, connector_id)
select least(c.id, d.id), greatest(c.id, d.id), 'intro', (select id from t where k='ana')
from t c, t d where c.k = 'cam' and d.k = 'dee';
select ok(private.can_message((select id from t where k='cam'), (select id from t where k='dee')), 'Introduced through an intro: can message immediately (free member)');
select ok(private.can_message((select id from t where k='dee'), (select id from t where k='cam')), 'Works both ways');

-- ── API surface: graph helpers are not callable by members ──────────────
select hasnt_function('public', 'second_degree', 'second_degree is not exposed through the API');
select hasnt_function('public', 'first_degree_ids', 'first_degree_ids is not exposed through the API');
select hasnt_function('public', 'is_blocked', 'is_blocked is not exposed through the API');
select has_function('private', 'second_degree', 'second_degree lives in the private schema');

select * from finish();
rollback;
