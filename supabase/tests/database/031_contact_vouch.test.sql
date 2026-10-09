-- Vouching for someone who's in your phone's contacts.
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
grant select on t to authenticated;
create or replace function pg_temp.uid(k text) returns uuid language sql as $$ select id from t where t.k = uid.k $$;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;
create or replace function pg_temp.vouch(k text, phones text[]) returns text language sql as $$
  select vouch_from_contacts(pg_temp.uid(k), (select min(id) from vouch_words where active), phones)
$$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('ana', pg_temp.new_user('ana31@test.dev', 'Ana Contacts')),
                     ('ben', pg_temp.new_user('ben31@test.dev', 'Ben Contacts')),
                     ('cy',  pg_temp.new_user('cy31@test.dev',  'Cy Unverified'));
update profile_private set phone = '+12025550131', phone_verified_at = now() where id = pg_temp.uid('ana');
update profile_private set phone = '+12025550132', phone_verified_at = now() where id = pg_temp.uid('ben');
update profile_private set phone = '+12025550133', phone_verified_at = null where id = pg_temp.uid('cy');

select pg_temp.act_as('ana');
select is(pg_temp.vouch('ben', array['+12025559999']), 'no_match', 'A number that isn''t theirs doesn''t vouch');
select is((select count(*)::int from vouches where vouchee_id = pg_temp.uid('ben')), 0, '...and no vouch is made');
select is(pg_temp.vouch('cy', array['+12025550133']), 'no_match', 'Someone who hasn''t verified their phone can''t get a contact vouch');
select is(pg_temp.vouch('ben', array['+12025550000', '+12025550132']), 'vouched', 'Their verified number in the contact vouches');
select is((select type::text from vouches where vouchee_id = pg_temp.uid('ben')), 'contact', '...as a contact vouch');
select is((select vouch_count from profiles where id = pg_temp.uid('ben')), 1, '...and counts on their profile');
select pg_temp.admin();
select is((select count(*)::int from notifications where user_id = pg_temp.uid('ben') and kind = 'vouch'), 1, '...and they''re told');
select pg_temp.act_as('ana');
select is((select v->>'type' from jsonb_array_elements(profile_card(pg_temp.uid('ben'))->'vouches') v), 'contact', 'Their profile says it came from contacts');
select throws_ok($$ select pg_temp.vouch('ben', array['+12025550132']) $$, '23514', 'You already vouch for them.', 'Only one active vouch per person');

-- The voucher needs a verified phone too.
select pg_temp.act_as('cy');
select throws_ok($$ select pg_temp.vouch('ana', array['+12025550131']) $$, '23514', 'Verify your phone number first, then you can vouch from your contacts.', 'You need a verified phone to vouch from contacts');

-- Shares the monthly vouch limit.
select pg_temp.act_as('ben');
select ok((select my_vouches_left_this_month()) is distinct from null, 'Free members have a monthly limit');
select pg_temp.admin();
update profile_private set phone_verified_at = now() where id = pg_temp.uid('cy');
select pg_temp.act_as('ana');
select throws_ok(format('insert into vouches (voucher_id, vouchee_id, type, word_id) values (%L, %L, ''contact'', 1)', pg_temp.uid('ana'), pg_temp.uid('cy')),
                  '42501', null, 'Contact vouches can''t be inserted directly');
select is(my_vouches_left_this_month(), (select plan_limit(pg_temp.uid('ana'), 'vouches_per_month'))::int - 1, 'A contact vouch uses one of your vouches this month');

-- Ten misses a day, then it stops.
select pg_temp.vouch('cy', array['+10000000000']) from generate_series(1, 8);
select throws_ok($$ select pg_temp.vouch('cy', array['+12025550133']) $$, '23514', 'Too many tries. Try again tomorrow.', 'Ten tries that don''t match, then it stops for the day');

select * from finish();
rollback;
