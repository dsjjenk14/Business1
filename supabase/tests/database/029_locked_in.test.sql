-- Locked In: the Insiders you go out with most, names only, Insiders-only.
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
create or replace function pg_temp.connect(a text, b text) returns void language sql as $$
  insert into connections (user_a, user_b, source) values (least(pg_temp.uid(a), pg_temp.uid(b)), greatest(pg_temp.uid(a), pg_temp.uid(b)), 'manual')
$$;
create or replace function pg_temp.met(a text, b text, n int) returns void language sql as $$
  insert into encounters (user_a, user_b, context, distance_m, overlap_start, overlap_end)
  select least(pg_temp.uid(a), pg_temp.uid(b)), greatest(pg_temp.uid(a), pg_temp.uid(b)), 'nearby', 10, now() - (i || ' days')::interval, now() - (i || ' days')::interval + interval '1 hour'
  from generate_series(1, n) i
$$;
create or replace function pg_temp.names(j jsonb) returns text language sql as $$
  select coalesce(string_agg(split_part(e->>'display_name', ' ', 1), ',' order by o), '') from jsonb_array_elements(j) with ordinality x(e, o)
$$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('me', pg_temp.new_user('me29@test.dev', 'Mia TwentyNine')),
                     ('ben', pg_temp.new_user('ben29@test.dev', 'Ben TwentyNine')),
                     ('cal', pg_temp.new_user('cal29@test.dev', 'Cal TwentyNine')),
                     ('dee', pg_temp.new_user('dee29@test.dev', 'Dee TwentyNine')),
                     ('eve', pg_temp.new_user('eve29@test.dev', 'Eve TwentyNine')),
                     ('out', pg_temp.new_user('out29@test.dev', 'Oz Outsider'));
select pg_temp.connect('me', 'ben');
select pg_temp.connect('me', 'cal');
select pg_temp.connect('me', 'dee');
select pg_temp.connect('me', 'eve');

-- Ben: met 3 times (score 9). Cal: 2 shared past events (score 2). Dee: never out together.
-- Eve: met once (3). Oz: met lots, but not an Insider.
select pg_temp.met('me', 'ben', 3);
select pg_temp.met('me', 'eve', 1);
select pg_temp.met('me', 'out', 5);
insert into events (host_id, title, starts_at) values (pg_temp.uid('cal'), 'Past 1', now() - interval '10 days'), (pg_temp.uid('cal'), 'Past 2', now() - interval '20 days'),
  (pg_temp.uid('cal'), 'Future', now() + interval '5 days');
insert into event_rsvps (event_id, user_id) select id, pg_temp.uid('me') from events where title in ('Past 1', 'Past 2', 'Future') and host_id = pg_temp.uid('cal')
  on conflict do nothing;
insert into event_rsvps (event_id, user_id) select id, pg_temp.uid('cal') from events where title in ('Past 1', 'Past 2', 'Future') and host_id = pg_temp.uid('cal')
  on conflict do nothing;

select pg_temp.act_as('me');
select is(pg_temp.names(locked_in(pg_temp.uid('me'))), 'Ben,Eve,Cal', 'Most nights out first; future plans and non-Insiders don''t count');
select ok(not exists (select 1 from jsonb_array_elements(locked_in(pg_temp.uid('me'))) e where e ? 'place' or e ? 'venue' or e ? 'last_seen'),
  'Names and photos only, never places or times');
select is((select array_agg(k order by k) from jsonb_object_keys(locked_in(pg_temp.uid('me')) -> 0) k), array['avatar_url', 'display_name', 'id'], 'Exactly id, name, photo');

select pg_temp.act_as('ben');
select is(pg_temp.names(locked_in(pg_temp.uid('me'))), 'Ben,Eve,Cal', 'Insiders can see it');
select pg_temp.act_as('out');
select is(locked_in(pg_temp.uid('me')), '[]'::jsonb, 'People outside your Insiders can''t');

-- Turning it off hides yours from others (you still see it) and leaves you out of others'.
select pg_temp.admin();
update user_settings set show_locked_in = false where user_id = pg_temp.uid('me');
select pg_temp.act_as('ben');
select is(locked_in(pg_temp.uid('me')), '[]'::jsonb, 'Off: your Insiders don''t see it');
select pg_temp.act_as('me');
select is(pg_temp.names(locked_in(pg_temp.uid('me'))), 'Ben,Eve,Cal', 'Off: you still see your own');
select pg_temp.act_as('ben');
select is(pg_temp.names(locked_in(pg_temp.uid('ben'))), '', 'Off: you''re left out of other people''s');
select pg_temp.admin();
update user_settings set show_locked_in = true where user_id = pg_temp.uid('me');
update user_settings set show_locked_in = false where user_id = pg_temp.uid('eve');
select pg_temp.act_as('me');
select is(pg_temp.names(locked_in(pg_temp.uid('me'))), 'Ben,Cal', 'Someone who turned it off isn''t shown');

-- Blocks.
select pg_temp.admin();
update user_settings set show_locked_in = true where user_id = pg_temp.uid('eve');
select pg_temp.act_as('cal');
select lives_ok(format('select block_user(%L)', pg_temp.uid('ben')), 'Cal blocks Ben');
select is(pg_temp.names(locked_in(pg_temp.uid('me'))), 'Eve,Cal', 'You never see someone you blocked in a Locked In');
select pg_temp.act_as('ben');
select is(pg_temp.names(locked_in(pg_temp.uid('me'))), 'Ben,Eve', '...and they never see you in one');

select * from finish();
rollback;
