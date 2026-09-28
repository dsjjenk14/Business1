-- Push notifications: phones register, notifications and chat messages are
-- queued for push, Settings switches and blocks are respected.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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
insert into t values ('pa', pg_temp.new_user('pa11@test.dev', 'Pa Eleven')),
                     ('qu', pg_temp.new_user('qu11@test.dev', 'Qu Eleven')),
                     ('ro', pg_temp.new_user('ro11@test.dev', 'Ro Eleven'));

-- ── Registering a phone ──────────────────────────────────────────────────
select pg_temp.act_as('pa');
select throws_ok($$ select register_push_token('not-a-token', 'ios') $$, '23514', 'Not a push token.', 'Only real Expo push tokens');
select lives_ok($$ select register_push_token('ExponentPushToken[pa-phone]', 'ios') $$, 'A phone registers for push');
select pg_temp.act_as('qu');
select register_push_token('ExponentPushToken[shared]', 'ios');
select pg_temp.act_as('ro');
select register_push_token('ExponentPushToken[shared]', 'android');
select pg_temp.admin();
select is((select user_id from push_tokens where token = 'ExponentPushToken[shared]'), pg_temp.uid('ro'), 'A shared phone belongs to whoever signed in last');
select pg_temp.act_as('qu');
select register_push_token('ExponentPushToken[qu-phone]', 'ios');
select is((select count(*)::int from push_tokens), 1, 'Members only see their own phones');

-- ── Notifications become pushes ──────────────────────────────────────────
select pg_temp.admin();
select private.notify(pg_temp.uid('pa'), 'vouch_request', 'Qu asked you for a vouch', '', pg_temp.uid('qu'), '/people/' || pg_temp.uid('qu'));
select is((select title from push_outbox where user_id = pg_temp.uid('pa')), 'Qu asked you for a vouch', 'A notification is pushed');
update user_settings set notify_intro_requests = false where user_id = pg_temp.uid('pa');
select private.notify(pg_temp.uid('pa'), 'intro_request', 'Someone wants an intro', '', pg_temp.uid('qu'), null);
select is((select count(*)::int from push_outbox where user_id = pg_temp.uid('pa')), 1, 'Turned off in Settings: no push (still in the app)');
select private.notify(pg_temp.uid('pa'), 'safety', 'Safety alert', '', null, null);
select is((select count(*)::int from push_outbox where user_id = pg_temp.uid('pa') and title = 'Safety alert'), 1, 'Safety alerts always push');
insert into blocks (blocker_id, blocked_id) values (pg_temp.uid('pa'), pg_temp.uid('ro'));
select private.notify(pg_temp.uid('pa'), 'vouch', 'Ro vouched for you', '', pg_temp.uid('ro'), null);
select is((select count(*)::int from push_outbox where title = 'Ro vouched for you'), 0, 'Blocked people never reach you');
select private.notify(pg_temp.uid('ro'), 'vouch', 'No phone', '', null, null);
select is((select count(*)::int from push_outbox where title = 'No phone' and user_id = pg_temp.uid('ro')), 1, 'Phones registered get pushes');

-- ── Chat messages ────────────────────────────────────────────────────────
insert into conversations (kind, direct_a, direct_b)
values ('direct', least(pg_temp.uid('pa'), pg_temp.uid('qu')), greatest(pg_temp.uid('pa'), pg_temp.uid('qu')));
insert into conversation_members (conversation_id, user_id)
select (select max(id) from conversations), u from unnest(array[pg_temp.uid('pa'), pg_temp.uid('qu')]) u;
insert into messages (conversation_id, sender_id, body) values ((select max(id) from conversations), pg_temp.uid('pa'), 'See you at 8?');
select is((select title || ' | ' || body from push_outbox where user_id = pg_temp.uid('qu')), 'Pa E. | See you at 8?', 'A new message pushes the other person');
select is((select count(*)::int from push_outbox where user_id = pg_temp.uid('pa') and link like '/chat/%'), 0, 'Not the sender');
update user_settings set notify_messages = false where user_id = pg_temp.uid('qu');
insert into messages (conversation_id, sender_id, body) values ((select max(id) from conversations), pg_temp.uid('pa'), 'Hello?');
select is((select count(*)::int from push_outbox where user_id = pg_temp.uid('qu')), 1, 'Messages switched off: no push');

select * from finish();
rollback;
