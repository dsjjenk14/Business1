-- Burst styles (boomerang, slo-mo, rewind, loop) and effects on videos.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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
insert into t values ('a', pg_temp.new_user('a22@test.dev', 'Ann TwentyTwo')), ('b', pg_temp.new_user('b22@test.dev', 'Bo TwentyTwo'));

-- ── Bursts on pins ────────────────────────────────────────────────────────
select pg_temp.act_as('a');
insert into pins (author_id, category, body, audience) values (pg_temp.uid('a'), 'photos', 'Rewind test', 'everyone');
insert into ids select 'pin', id from pins where body = 'Rewind test';
select lives_ok(format($q$insert into pin_media (pin_id, kind, frames, motion, effect) values (%s, 'boomerang', %L, 'rewind', 'glow')$q$,
  pg_temp.id('pin'), array[pg_temp.uid('a') || '/' || pg_temp.id('pin') || '/f1.jpg', pg_temp.uid('a') || '/' || pg_temp.id('pin') || '/f2.jpg', pg_temp.uid('a') || '/' || pg_temp.id('pin') || '/f3.jpg']),
  'A rewind with an effect');
select is((select motion || '/' || effect from pin_media where pin_id = pg_temp.id('pin')), 'rewind/glow', 'Saved as picked');
update pin_media set motion = 'loop' where pin_id = pg_temp.id('pin');
select is((select motion from pin_media where pin_id = pg_temp.id('pin')), 'rewind', 'Media can''t be edited after posting');
select pg_temp.admin();
select throws_ok(format($q$update pin_media set motion = 'sideways' where pin_id = %s$q$, pg_temp.id('pin')), '23514', null, 'Only known styles');
select throws_ok(format($q$update pin_media set effect = 'sparkles' where pin_id = %s$q$, pg_temp.id('pin')), '23514', null, 'Only known effects');

-- ── Effects on video Outs ─────────────────────────────────────────────────
select pg_temp.act_as('a');
insert into ids select 'out', send_out(pg_temp.uid('a') || '/v.mp4', null, array[]::uuid[], true, 'network');
select lives_ok(format($q$select set_out_effect(%s, 'vignette')$q$, pg_temp.id('out')), 'The sender picks an effect');
select throws_ok(format($q$select set_out_effect(%s, 'sparkles')$q$, pg_temp.id('out')), '23514', null, 'Only known effects');
select pg_temp.act_as('b');
select throws_ok(format($q$select set_out_effect(%s, 'glow')$q$, pg_temp.id('out')), '42501', null, 'Nobody else can');
select pg_temp.admin();
select is(out_open(pg_temp.id('out'), pg_temp.uid('a'))->>'effect', 'vignette', 'Opening the Out returns its effect');

select * from finish();
rollback;
