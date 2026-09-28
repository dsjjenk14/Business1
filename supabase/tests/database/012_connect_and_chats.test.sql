-- Connecting by QR (in person) and by a shared code; group chats in Messages.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('an', pg_temp.new_user('an12@test.dev', 'An Twelve')),
                     ('be', pg_temp.new_user('be12@test.dev', 'Be Twelve')),
                     ('cy', pg_temp.new_user('cy12@test.dev', 'Cy Twelve')),
                     ('dz', pg_temp.new_user('dz12@test.dev', 'Dz Twelve'));

-- ── Shared code (know each other outside the app) ────────────────────────
select pg_temp.act_as('an');
create temp table codes (k text primary key, code text);
grant all on codes to authenticated;
insert into codes select 'an', create_connect_code('code')->>'code';
select ok((select code from codes where k = 'an') ~ '^[A-HJ-NP-Z2-9]{6}$', 'A shared code is 6 easy-to-type characters');
select throws_ok(format('select redeem_connect_code(%L)', (select code from codes where k = 'an')), '23514',
  'That''s your own code. The other person types or scans it.', 'You can''t use your own code');
select pg_temp.act_as('be');
select is((redeem_connect_code(lower((select code from codes where k = 'an'))))->>'status', 'connected', 'The other person types it (any case): connected');
select pg_temp.admin();
select is((select source::text from connections where user_a = least(pg_temp.uid('an'), pg_temp.uid('be')) and user_b = greatest(pg_temp.uid('an'), pg_temp.uid('be'))), 'code', 'In each other''s circle, marked as a code connection');
select is((select count(*)::int from encounters where least(pg_temp.uid('an'), pg_temp.uid('be')) = user_a and greatest(pg_temp.uid('an'), pg_temp.uid('be')) = user_b), 0, 'A code isn''t a meetup (no vouching yet)');
select is((select count(*)::int from notifications where user_id = pg_temp.uid('an') and kind = 'connected'), 1, 'The code''s owner is told');
select pg_temp.act_as('cy');
select throws_ok(format('select redeem_connect_code(%L)', (select code from codes where k = 'an')), '23514', null, 'Each code works once');
select throws_ok($$ select redeem_connect_code('ZZZZZZ') $$, '23514', null, 'Made-up codes fail');

-- ── QR in person ─────────────────────────────────────────────────────────
select pg_temp.act_as('an');
insert into codes select 'qr', create_connect_code('qr')->>'code';
select ok(length((select code from codes where k = 'qr')) = 16, 'A QR code is long and random');
select pg_temp.act_as('cy');
select isnt((redeem_connect_code((select code from codes where k = 'qr')))->>'encounter_id', null, 'Scanning in person records a meetup');
select pg_temp.admin();
select is((select source::text from connections where user_a = least(pg_temp.uid('an'), pg_temp.uid('cy')) and user_b = greatest(pg_temp.uid('an'), pg_temp.uid('cy'))), 'qr', 'Connected by QR');
update connect_codes set expires_at = now() - interval '1 second';
select pg_temp.act_as('an');
insert into codes select 'old', create_connect_code('qr')->>'code';
select pg_temp.admin();
update connect_codes set expires_at = now() - interval '1 second' where code = (select code from codes where k = 'old');
select pg_temp.act_as('dz');
select throws_ok(format('select redeem_connect_code(%L)', (select code from codes where k = 'old')), '23514', null, 'Expired codes fail');

-- ── Group chats ──────────────────────────────────────────────────────────
select pg_temp.act_as('an');
select is((select count(*)::int from chat_candidates()), 2, 'You can add people in your circle');
select throws_ok(format('select create_group_chat(%L, array[%L]::uuid[])', 'Solo', pg_temp.uid('be')), '23514', null, 'A group chat needs at least two others');
select throws_ok(format('select create_group_chat(%L, array[%L, %L]::uuid[])', 'Strangers', pg_temp.uid('be'), pg_temp.uid('dz')), '23514', null, 'You can''t add strangers');
create temp table chat (id bigint);
grant all on chat to authenticated;
insert into chat select create_group_chat('Brunch crew', array[pg_temp.uid('be'), pg_temp.uid('cy')]);
select is((select title from inbox() where conversation_id = (select id from chat)), 'Brunch crew', 'The chat shows in Messages');
select pg_temp.act_as('be');
select lives_ok(format('insert into messages (conversation_id, sender_id, body) values (%s, %L, %L)', (select id from chat), pg_temp.uid('be'), 'Sunday?'), 'Members can talk');
select pg_temp.act_as('dz');
select is((select count(*)::int from messages where conversation_id = (select id from chat)), 0, 'Non-members can''t read it');
select pg_temp.act_as('cy');
select leave_group_chat((select id from chat));
select is((select count(*)::int from inbox() where conversation_id = (select id from chat)), 0, 'Leaving removes it from your Messages');
select pg_temp.act_as('an');
select is((select count(*)::int from conversation_members where conversation_id = (select id from chat)), 2, 'The others stay in the chat');

select * from finish();
rollback;
