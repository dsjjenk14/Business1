-- Delete anything you post: Outs, messages, events (and pins/replies).
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
create temp table ids (k text primary key, id bigint);
grant select, insert on ids to authenticated;
create or replace function pg_temp.uid(k text) returns uuid language sql as $$ select id from t where t.k = uid.k $$;
create or replace function pg_temp.id(k text) returns bigint language sql as $$ select id from ids where ids.k = id.k $$;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('a', pg_temp.new_user('a27@test.dev', 'Ava TwentySeven')),
                     ('b', pg_temp.new_user('b27@test.dev', 'Ben TwentySeven'));
insert into connections (user_a, user_b, source) values (least(pg_temp.uid('a'), pg_temp.uid('b')), greatest(pg_temp.uid('a'), pg_temp.uid('b')), 'manual');

-- ── Outs ──────────────────────────────────────────────────────────────────
select pg_temp.act_as('a');
insert into ids select 'out', send_out(pg_temp.uid('a') || '/gone.jpg', null, array[pg_temp.uid('b')]::uuid[], true);
select pg_temp.admin();
select ok(not (select out_open(pg_temp.id('out'), pg_temp.uid('b'))) ? 'error', 'Ben can open it before');
select pg_temp.act_as('b');
select lives_ok(format('select pin_out(%s)', pg_temp.id('out')), 'Ben pins it');
select throws_ok(format('select delete_out(%s)', pg_temp.id('out')), '42501', null, 'Only the sender can delete an Out');
select pg_temp.act_as('a');
select is(delete_out(pg_temp.id('out')), pg_temp.uid('a') || '/gone.jpg', 'Ava deletes it (returns the file to remove)');
select pg_temp.admin();
select is((select count(*)::int from out_recipients where out_id = pg_temp.id('out')), 0, 'Gone from every inbox');
select is((select count(*)::int from out_pins where out_id = pg_temp.id('out')), 0, 'Pins on it are gone too');
select ok((select out_open(pg_temp.id('out'), pg_temp.uid('b'))) ? 'error', 'Nobody can open it again');
select ok(exists (select 1 from outs_to_clean(500) where id = pg_temp.id('out')), 'Its file is queued for removal');
select pg_temp.act_as('b');
select ok(not exists (select 1 from jsonb_array_elements(outs_inbox()->'stories') s where s->>'sender_id' = pg_temp.uid('a')::text), 'Off Ava''s Out');

-- ── Messages ──────────────────────────────────────────────────────────────
select pg_temp.admin();
with x as (insert into conversations (kind) values ('direct') returning id) insert into ids select 'conv', id from x;
insert into conversation_members (conversation_id, user_id) values (pg_temp.id('conv'), pg_temp.uid('a')), (pg_temp.id('conv'), pg_temp.uid('b'));
with x as (insert into messages (conversation_id, sender_id, body) values (pg_temp.id('conv'), pg_temp.uid('a'), 'oops') returning id) insert into ids select 'msg', id from x;
select pg_temp.act_as('b');
select throws_ok(format('select delete_message(%s)', pg_temp.id('msg')), '42501', null, 'You can''t delete someone else''s message');
select pg_temp.act_as('a');
select lives_ok(format('select delete_message(%s)', pg_temp.id('msg')), 'Delete your own message');
select pg_temp.admin();
select is((select count(*)::int from messages where id = pg_temp.id('msg')), 0, 'It''s gone for everyone');

-- ── Events ────────────────────────────────────────────────────────────────
with x as (insert into events (host_id, title, starts_at) values (pg_temp.uid('a'), 'Rooftop night', now() + interval '1 day') returning id) insert into ids select 'ev', id from x;
insert into event_rsvps (event_id, user_id) values (pg_temp.id('ev'), pg_temp.uid('b'));
select pg_temp.act_as('b');
select throws_ok(format('select delete_event(%s)', pg_temp.id('ev')), '42501', null, 'Only the host can delete an event');
select pg_temp.admin();
insert into event_tickets (event_id, user_id, amount_cents, fee_cents, stripe_session_id) values (pg_temp.id('ev'), pg_temp.uid('b'), 2000, 240, 'cs_test_27');
select pg_temp.act_as('a');
select throws_ok(format('select delete_event(%s)', pg_temp.id('ev')), '23514', null, 'Refund paid tickets first');
select pg_temp.admin();
update event_tickets set status = 'refunded' where stripe_session_id = 'cs_test_27';
select pg_temp.act_as('a');
select lives_ok(format('select delete_event(%s)', pg_temp.id('ev')), 'After refunds, the host deletes it');
select pg_temp.admin();
select is((select count(*)::int from events where id = pg_temp.id('ev')), 0, 'The event is gone');
select is((select title from notifications where user_id = pg_temp.uid('b') and kind = 'event_canceled' order by id desc limit 1), 'Rooftop night was canceled', 'People going are told');

-- ── Pins and replies (already possible; kept working) ─────────────────────
with x as (insert into pins (author_id, category, body, audience) values (pg_temp.uid('a'), 'thought', 'delete me', 'circle') returning id) insert into ids select 'pin', id from x;
with x as (insert into pin_replies (pin_id, author_id, body) values (pg_temp.id('pin'), pg_temp.uid('b'), 'nice') returning id) insert into ids select 'reply', id from x;
select pg_temp.act_as('b');
update pin_replies set deleted_at = now() where id = pg_temp.id('reply');
select pg_temp.admin();
select isnt((select deleted_at from pin_replies where id = pg_temp.id('reply')), null, 'Ben deletes his reply');
select pg_temp.act_as('a');
update pins set deleted_at = now() where id = pg_temp.id('pin');
select pg_temp.admin();
select isnt((select deleted_at from pins where id = pg_temp.id('pin')), null, 'Ava deletes her pin');
select pg_temp.act_as('b');
update pins set deleted_at = now() where id = pg_temp.id('pin') and deleted_at is null;
select pg_temp.admin();
select is((select count(*)::int from pins where id = pg_temp.id('pin') and deleted_at is not null), 1, 'Nobody else can touch it');

select * from finish();
rollback;
