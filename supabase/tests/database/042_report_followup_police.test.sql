-- Reports need details; the reporter answers when, where and police; our team can ask questions;
-- records go to police only with the reporter's OK (or legal process / an emergency), and it's logged.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
update app_config set value = 'false' where key = 'photo_check_required'; -- tests that aren't about the photo check

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
create or replace function pg_temp.idn(k text) returns bigint language sql as $$ select id from ids where ids.k = idn.k $$;
create or replace function pg_temp.act_as(k text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(k), 'role', 'authenticated')::text, true);
end $$;

update app_config set value = '0' where key = 'founding_member_limit';
insert into t values ('ana', pg_temp.new_user('ana42@test.dev', 'Ana FortyTwo')),
                     ('bad', pg_temp.new_user('bad42@test.dev', 'Bo FortyTwo')),
                     ('adm', pg_temp.new_user('adm42@test.dev', 'Ada Admin'));
update profiles set role = 'admin' where id = pg_temp.uid('adm');
insert into date_requests (from_id, to_id, when_kind, note, status)
values (pg_temp.uid('bad'), pg_temp.uid('ana'), 'tonight', 'Meet at 9?', 'accepted');

select pg_temp.act_as('ana');
select throws_ok($$ select public.report('harassment', '  ', p_user => pg_temp.uid('bad')) $$, '23514', 'Tell us what happened.', 'details are required');
select throws_ok($$ select public.report('assault', 'He hurt me', p_user => pg_temp.uid('bad')) $$, '23514', null, 'serious reports need a real description');
insert into ids select 'r', public.report('assault', 'He would not stop when I told him no, at his place after the date.', p_user => pg_temp.uid('bad'));
select throws_ok($$ select public.report_incident(pg_temp.idn('r'), '', '', 'not_yet') $$, '23514', null, 'when and where are required for serious reports');
select lives_ok($$ select public.report_incident(pg_temp.idn('r'), 'Saturday around 11pm', 'His apartment', 'not_yet', null, null, false, true) $$, 'the reporter adds when, where and police');

select pg_temp.act_as('adm');
select throws_ok($$ select public.admin_police_packet(pg_temp.idn('r'), 'reporter_consent', 'DC Metropolitan Police') $$, '23514', null,
                 'no records to police on consent until the reporter agrees');
select lives_ok($$ select public.admin_ask_reporter(pg_temp.idn('r'), 'Did anyone see you leave together?') $$, 'an admin can ask the reporter a question');
set local role postgres;
select ok(exists (select 1 from notifications where user_id = pg_temp.uid('ana') and kind = 'report_question'), 'the reporter is told there''s a question');
select is((select status::text from reports where id = pg_temp.idn('r')), 'reviewing', 'asking moves the report to under review');

select pg_temp.act_as('bad');
select is((select count(*)::int from report_followups), 0, 'the reported member can''t see the questions');
select is(public.my_report_detail(pg_temp.idn('r')), null, 'or the report');

select pg_temp.act_as('ana');
select lives_ok($$ select public.answer_report_question(pg_temp.idn('r'), 'His roommate saw us come in.') $$, 'the reporter answers');
select is(jsonb_array_length(public.my_report_detail(pg_temp.idn('r'))->'thread'), 2, 'the reporter sees the conversation');
select lives_ok($$ select public.report_incident(pg_temp.idn('r'), 'Saturday around 11pm', 'His apartment', 'reported', 'DC Metropolitan Police', '26-123456', true, true) $$,
                'the reporter adds a police case and agrees to share');

select pg_temp.act_as('adm');
select is(jsonb_array_length(public.admin_police_packet(pg_temp.idn('r'), 'reporter_consent', 'DC Metropolitan Police', '26-123456')->'date_requests'), 1,
          'with consent, the packet has their date plans');
select is(public.admin_police_packet(pg_temp.idn('r'), 'reporter_consent', 'DC Metropolitan Police')->'met_in_person', 'null'::jsonb,
          'location records need legal process or an emergency');
set local role postgres;
select is((select count(*)::int from private.police_disclosures where report_id = pg_temp.idn('r')), 2, 'every disclosure is logged');

select * from finish();
rollback;
