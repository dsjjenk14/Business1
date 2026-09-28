-- Hide my posts from someone, mute someone, hide one pin, event modes
-- (circle only, surprise party), places becoming venues, Founding 3000.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

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
grant select on ids to authenticated;
create or replace function pg_temp.uid(k text) returns uuid language sql as $$ select id from t where t.k = uid.k $$;
create or replace function pg_temp.id(k text) returns bigint language sql as $$ select id from ids where ids.k = id.k $$;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.admin() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); end $$;
create or replace function pg_temp.connect(a text, b text) returns void language sql as $$
  insert into connections (user_a, user_b, source)
  values (least(pg_temp.uid(a), pg_temp.uid(b)), greatest(pg_temp.uid(a), pg_temp.uid(b)), 'manual')
$$;

select is(config_num('founding_member_limit'), 3000::numeric, 'Founding Members: the first 3000');
select is(config_num('out_hours'), 6::numeric, 'Outs last 6 hours');

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('a', pg_temp.new_user('a19@test.dev', 'Ann Nineteen')),
                     ('b', pg_temp.new_user('b19@test.dev', 'Bea Nineteen')),
                     ('c', pg_temp.new_user('c19@test.dev', 'Cam Nineteen')),
                     ('s', pg_temp.new_user('s19@test.dev', 'Sol Nineteen'));
select pg_temp.connect('a', 'b');
select pg_temp.connect('a', 'c');

-- ── Hide my posts from / mute ─────────────────────────────────────────────
select pg_temp.admin();
insert into pins (author_id, category, body, audience) values (pg_temp.uid('a'), 'thought', 'Hello circle', 'circle');
insert into ids select 'pin', id from pins where body = 'Hello circle';
select pg_temp.act_as('b');
select is((select count(*)::int from pins where id = pg_temp.id('pin')), 1, 'A friend sees the pin');
select pg_temp.act_as('a');
select set_hidden_from(pg_temp.uid('b'), true);
select pg_temp.act_as('b');
select is((select count(*)::int from pins where id = pg_temp.id('pin')), 0, 'Hidden from them: they don''t');
select pg_temp.act_as('c');
select is((select count(*)::int from pins where id = pg_temp.id('pin')), 1, 'Everyone else still does');
select pg_temp.act_as('b');
select is((select count(*)::int from hidden_from), 0, 'Nobody can see who hid them');
select pg_temp.act_as('a');
select is((person_privacy(pg_temp.uid('b'))->>'hidden')::boolean, true, 'Their profile menu shows it');
select set_hidden_from(pg_temp.uid('b'), false);
select pg_temp.act_as('c');
select set_muted(pg_temp.uid('a'), true);
select is((select count(*)::int from pins where id = pg_temp.id('pin')), 0, 'Muted: you stop seeing their posts');
select is((select count(*)::int from my_hidden_and_muted() where muted), 1, 'Listed in Hidden and muted');
select set_muted(pg_temp.uid('a'), false);
select is((select count(*)::int from pins where id = pg_temp.id('pin')), 1, 'Unmute: back again');

-- One pin hidden from one person.
select pg_temp.act_as('a');
select is(set_pin_hidden_from(pg_temp.id('pin'), array[pg_temp.uid('c')]), 1, 'Hide this pin from Cam');
select pg_temp.act_as('c');
select is((select count(*)::int from pins where id = pg_temp.id('pin')), 0, 'Cam doesn''t see that pin');
select pg_temp.act_as('b');
select is((select count(*)::int from pins where id = pg_temp.id('pin')), 1, 'Bea still does');
select throws_ok(format('select set_pin_hidden_from(%s, %L)', pg_temp.id('pin'), array[pg_temp.uid('c')]), '42501', null, 'Only the author chooses');

-- My Out and plans follow it too.
select pg_temp.act_as('a');
select ok(send_out(pg_temp.uid('a') || '/s.jpg', null, array[]::uuid[], true) is not null, 'Post to My Out');
select set_hidden_from(pg_temp.uid('b'), true);
select pg_temp.act_as('b');
select is(jsonb_array_length(outs_inbox()->'stories'), 0, 'Hidden from them: no My Out');
select pg_temp.act_as('c');
select is(jsonb_array_length(outs_inbox()->'stories'), 1, 'Others still see it');
select pg_temp.act_as('a');
select ok(post_going_out('tonight', null, null, 'Rooftop', '{}', null, 38.9, -77.03) is not null, 'Post a plan');
select pg_temp.act_as('b');
select is((select count(*)::int from tonight_network() where user_id = pg_temp.uid('a')), 0, 'Hidden from them: no plan');
select pg_temp.act_as('c');
select is((select count(*)::int from tonight_network() where user_id = pg_temp.uid('a')), 1, 'Others see the plan');
select pg_temp.act_as('a');
select set_hidden_from(pg_temp.uid('b'), false);

-- ── Surprise party ────────────────────────────────────────────────────────
select pg_temp.act_as('a');
select ok(create_event('Bea''s 30th', now() + interval '2 days', p_surprise_for => pg_temp.uid('b')) is not null, 'Plan a surprise for Bea');
select pg_temp.admin();
insert into ids select 'party', id from events where title = 'Bea''s 30th';
select pg_temp.act_as('b');
select is(event_detail(pg_temp.id('party')), null, 'Bea can''t open it');
select is((select count(*)::int from events where id = pg_temp.id('party')), 0, 'Or find it');
select throws_ok(format('insert into event_rsvps (event_id, user_id) values (%s, %L)', pg_temp.id('party'), pg_temp.uid('b')),
  '23514', null, 'Or say I''m In');
select pg_temp.act_as('c');
select is(event_detail(pg_temp.id('party'))->'surprise_for'->>'display_name', 'Bea N.', 'Guests see who it''s for');
select ok(share_event(pg_temp.id('party'), 'Shh') is not null, 'A guest shares it with their circle');
select pg_temp.admin();
insert into ids select 'share', id from pins where event_id = pg_temp.id('party');
select pg_temp.connect('b', 'c');
select pg_temp.act_as('b');
select is((select count(*)::int from pins where id = pg_temp.id('share')), 0, 'Posts about it are hidden from Bea too');
select pg_temp.admin();
select private.notify(pg_temp.uid('b'), 'test', 'Party', '', pg_temp.uid('a'), '/events/' || pg_temp.id('party'));
select is((select count(*)::int from notifications where user_id = pg_temp.uid('b') and link = '/events/' || pg_temp.id('party')), 0, 'No notices about it reach Bea');
update events set starts_at = now() - interval '5 hours', ends_at = now() - interval '1 hour' where id = pg_temp.id('party');
select pg_temp.act_as('b');
select ok(event_detail(pg_temp.id('party')) is not null, 'After the party, Bea can see it');

-- ── Circle only ───────────────────────────────────────────────────────────
select pg_temp.act_as('a');
select ok(create_event('Game night', now() + interval '1 day', p_visibility => 'circle') is not null, 'A circle-only event');
select pg_temp.admin();
insert into ids select 'game', id from events where title = 'Game night';
select pg_temp.act_as('c');
select ok(event_detail(pg_temp.id('game')) is not null, 'The host''s circle sees it');
select pg_temp.act_as('s');
select is(event_detail(pg_temp.id('game')), null, 'Strangers don''t');
select pg_temp.admin();
insert into event_rsvps (event_id, user_id) values (pg_temp.id('game'), pg_temp.uid('c'));
select pg_temp.act_as('a');
select throws_ok(format('select set_event_mode(%s, %L, %L)', pg_temp.id('game'), 'public', pg_temp.uid('c')), '23514', null,
  'A surprise can''t be for someone who already said I''m In');

-- ── Places ────────────────────────────────────────────────────────────────
select pg_temp.act_as('s');
select ok(venue_from_place('N12345', 'Test Tavern', 38.91, -77.04, '1 Main St', 'Shaw', 'pub') is not null, 'A picked place becomes a venue');
select is(venue_from_place('N12345', 'Test Tavern', 38.91, -77.04), venue_from_place('N12345', 'Test Tavern', 38.91, -77.04), 'Only once');
select pg_temp.admin();
select is((select count(*)::int from venues where osm_id = 'N12345'), 1, 'One venue per place');

select * from finish();
rollback;
