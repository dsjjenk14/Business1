-- Reports need enough to act on, and serious ones go to police with the reporter's OK.
--   * Details are required. Assault and violence reports need a real description, when and where.
--   * The reporter says whether they've gone to police, and whether we may give police the
--     messages between them. (Federal law lets a service share a message with the consent of
--     someone who sent or received it: 18 U.S.C. 2702(b)(3).)
--   * Our team can ask the reporter follow-up questions in the app; the reported member never sees them.
--   * Every time records go to police, it's logged with the reason (consent, legal process, emergency).

alter table public.reports
  add column if not exists incident_when text,
  add column if not exists incident_place text,
  add column if not exists police_status text check (police_status in ('reported', 'not_yet', 'no')),
  add column if not exists police_agency text,
  add column if not exists police_case text,
  add column if not exists share_with_police boolean,
  add column if not exists can_contact boolean not null default true;

-- Details are required everywhere; serious reports need at least a couple of sentences.
do $$
declare
  src text := pg_get_functiondef('public.report(public.report_reason,text,uuid,bigint,bigint,bigint)'::regprocedure);
  anchor text := $p$  if target_user = me then raise exception 'You can''t report yourself.' using errcode = 'check_violation'; end if;$p$;
begin
  if position(anchor in src) = 0 then raise exception 'report patch: text not found'; end if;
  src := replace(src, anchor, anchor || $p$
  perform private.check_report_details(p_reason, p_details);$p$);
  execute src;
end $$;

create or replace function private.check_report_details(p_reason public.report_reason, p_details text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if char_length(trim(coalesce(p_details, ''))) = 0 then
    raise exception 'Tell us what happened.' using errcode = 'check_violation';
  end if;
  if p_reason::text in ('assault', 'violence') and char_length(trim(p_details)) < 20 then
    raise exception 'Tell us a little more about what happened, in your own words.' using errcode = 'check_violation';
  end if;
end $$;

do $$
declare
  src text := pg_get_functiondef('public.report_date(uuid,public.report_reason,text,bigint)'::regprocedure);
  anchor text := $p$  insert into public.reports (reporter_id, reported_user_id, reason, details, date_request_id)$p$;
begin
  if position(anchor in src) = 0 then raise exception 'report_date patch: text not found'; end if;
  src := replace(src, anchor, $p$  perform private.check_report_details(p_reason, p_details);
$p$ || anchor);
  execute src;
end $$;

-- The reporter adds when, where, police, and consent (right after sending, or later in My reports).
create or replace function public.report_incident(p_report bigint, p_when text, p_place text, p_police text,
  p_agency text default null, p_case text default null, p_share boolean default null, p_contact boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  select * into r from public.reports where id = p_report and reporter_id = auth.uid();
  if r.id is null then raise exception 'That report isn''t yours.' using errcode = 'insufficient_privilege'; end if;
  if r.reason::text in ('assault', 'violence') and (char_length(trim(coalesce(p_when, ''))) = 0 or char_length(trim(coalesce(p_place, ''))) = 0) then
    raise exception 'Tell us when and where it happened.' using errcode = 'check_violation';
  end if;
  if p_police is not null and p_police not in ('reported', 'not_yet', 'no') then
    raise exception 'Pick an answer about police.' using errcode = 'check_violation';
  end if;
  update public.reports set
    incident_when = left(nullif(trim(coalesce(p_when, '')), ''), 200),
    incident_place = left(nullif(trim(coalesce(p_place, '')), ''), 200),
    police_status = p_police,
    police_agency = left(nullif(trim(coalesce(p_agency, '')), ''), 120),
    police_case = left(nullif(trim(coalesce(p_case, '')), ''), 80),
    share_with_police = p_share,
    can_contact = coalesce(p_contact, true)
  where id = r.id;
  -- A newly added police case is worth an admin's attention.
  if p_police = 'reported' and coalesce(r.police_status, '') <> 'reported' then
    insert into public.notifications (user_id, kind, title, body)
    select p.id, 'moderation', 'Police report filed', 'A member who reported someone has also gone to police.' from public.profiles p where p.role = 'admin';
  end if;
end $$;
revoke all on function public.report_incident(bigint, text, text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.report_incident(bigint, text, text, text, text, text, boolean, boolean) to authenticated;

-- Follow-up questions between our team and the reporter.
create table public.report_followups (
  id          bigint generated always as identity primary key,
  report_id   bigint not null references public.reports (id) on delete cascade,
  from_admin  boolean not null,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index report_followups_report on public.report_followups (report_id, created_at);
alter table public.report_followups enable row level security;
create policy report_followups_read on public.report_followups for select to authenticated
  using (public.is_admin() or exists (select 1 from public.reports r where r.id = report_id and r.reporter_id = auth.uid()));
revoke all on public.report_followups from anon, authenticated;
grant select on public.report_followups to authenticated;

create or replace function public.admin_ask_reporter(p_report bigint, p_question text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  perform private.require_admin();
  select * into r from public.reports where id = p_report;
  if r.id is null or r.reporter_id is null then raise exception 'There''s no one to ask.' using errcode = 'check_violation'; end if;
  if not r.can_contact then raise exception 'The reporter asked not to be contacted.' using errcode = 'check_violation'; end if;
  insert into public.report_followups (report_id, from_admin, body) values (r.id, true, left(trim(p_question), 2000));
  update public.reports set status = 'reviewing' where id = r.id and status = 'open';
  perform private.notify(r.reporter_id, 'report_question', 'Our safety team has a question',
    'About a report you made. Only you can see this.', null, '/settings/reports');
end $$;

create or replace function public.answer_report_question(p_report bigint, p_answer text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.reports where id = p_report and reporter_id = auth.uid()) then
    raise exception 'That report isn''t yours.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(trim(coalesce(p_answer, ''))) = 0 then raise exception 'Write your answer first.' using errcode = 'check_violation'; end if;
  insert into public.report_followups (report_id, from_admin, body) values (p_report, false, left(trim(p_answer), 2000));
  insert into public.notifications (user_id, kind, title, body)
  select p.id, 'moderation', 'A reporter answered', 'New information on a report.' from public.profiles p where p.role = 'admin';
end $$;
revoke all on function public.admin_ask_reporter(bigint, text) from public, anon;
revoke all on function public.answer_report_question(bigint, text) from public, anon;
grant execute on function public.admin_ask_reporter(bigint, text) to authenticated;
grant execute on function public.answer_report_question(bigint, text) to authenticated;

-- What a reporter sees about their own report (never admin notes, never the outcome for the other person).
create or replace function public.my_report_detail(p_report bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'reason', r.reason, 'serious', r.reason::text in ('assault', 'violence'),
    'incident_when', r.incident_when, 'incident_place', r.incident_place,
    'police_status', r.police_status, 'police_agency', r.police_agency, 'police_case', r.police_case,
    'share_with_police', r.share_with_police, 'can_contact', r.can_contact,
    'thread', coalesce((select jsonb_agg(jsonb_build_object('from_admin', f.from_admin, 'body', f.body, 'at', f.created_at) order by f.created_at)
                        from public.report_followups f where f.report_id = r.id), '[]'::jsonb))
  from public.reports r where r.id = p_report and r.reporter_id = auth.uid()
$$;
revoke all on function public.my_report_detail(bigint) from public, anon;
grant execute on function public.my_report_detail(bigint) to authenticated;

-- Every time records leave I'm In for police, it's logged with the legal reason.
create table private.police_disclosures (
  id          bigint generated always as identity primary key,
  report_id   bigint references public.reports (id) on delete set null,
  basis       text not null check (basis in ('reporter_consent', 'legal_process', 'emergency')),
  agency      text not null,
  case_number text,
  admin_id    uuid,
  created_at  timestamptz not null default now()
);

-- The records to give police for one report.
--   reporter_consent: messages between the two and their date plans (things the reporter sent or received).
--   legal_process / emergency: also where they were in the same place and Date Mode details.
create or replace function public.admin_police_packet(p_report bigint, p_basis text, p_agency text, p_case text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.reports; ev jsonb; full_access boolean := p_basis in ('legal_process', 'emergency');
begin
  perform private.require_admin();
  if p_basis not in ('reporter_consent', 'legal_process', 'emergency') then raise exception 'Pick why you''re sharing.' using errcode = 'check_violation'; end if;
  if char_length(trim(coalesce(p_agency, ''))) = 0 then raise exception 'Which police department?' using errcode = 'check_violation'; end if;
  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'Report not found.' using errcode = 'check_violation'; end if;
  if p_basis = 'reporter_consent' and r.share_with_police is not true then
    raise exception 'The reporter hasn''t agreed to share their messages with police.' using errcode = 'check_violation';
  end if;
  select data into ev from private.report_evidence where report_id = r.id;
  insert into private.police_disclosures (report_id, basis, agency, case_number, admin_id)
  values (r.id, p_basis, trim(p_agency), nullif(trim(coalesce(p_case, '')), ''), auth.uid());
  return jsonb_build_object(
    'report', jsonb_build_object('id', r.id, 'reason', r.reason, 'filed_at', r.created_at, 'details', r.details,
                                 'incident_when', r.incident_when, 'incident_place', r.incident_place,
                                 'reporter', (select display_name from public.profiles where id = r.reporter_id),
                                 'reported', (select display_name from public.profiles where id = r.reported_user_id)),
    'basis', p_basis, 'agency', trim(p_agency), 'case', p_case,
    'messages', coalesce(ev->'messages', '[]'::jsonb),
    'date_requests', coalesce(ev->'date_requests', '[]'::jsonb),
    'met_in_person', case when full_access then coalesce(ev->'met_in_person', '[]'::jsonb) end,
    'date_mode', case when full_access then coalesce(ev->'date_mode', '[]'::jsonb) end,
    'past_disclosures', (select count(*) from private.police_disclosures d where d.report_id = r.id) - 1);
end $$;
revoke all on function public.admin_police_packet(bigint, text, text, text) from public, anon;
grant execute on function public.admin_police_packet(bigint, text, text, text) to authenticated;

-- Admin list: add the reporter's answers and whether a question is waiting on them.
drop function if exists public.admin_reports();
create function public.admin_reports()
returns table(id bigint, reason public.report_reason, details text, status public.report_status, created_at timestamptz, reporter_name text,
              reported_id uuid, reported_name text, about text, content text, hidden boolean, pin_id bigint, reply_id bigint, message_id bigint,
              admin_notes text, reports_on_target bigint, priority smallint, independent_reporters bigint, on_hold boolean,
              incident_when text, incident_place text, police_status text, police_agency text, police_case text,
              share_with_police boolean, can_contact boolean, thread jsonb, sent_to_police bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select r.id, r.reason, r.details, r.status, r.created_at, rp.display_name, r.reported_user_id, tp.display_name,
         case when r.pin_id is not null then 'pin' when r.reply_id is not null then 'reply'
              when r.message_id is not null then 'message' else 'member' end,
         coalesce(pn.body, pr.body, m.body),
         coalesce(pn.hidden_at, pr.hidden_at) is not null,
         r.pin_id, r.reply_id, r.message_id, r.admin_notes,
         (select count(*) from public.reports r2 where r2.reported_user_id = r.reported_user_id),
         coalesce(r.priority, private.report_priority(r.reason)),
         (select count(distinct r3.reporter_id) from public.reports r3 where r3.reported_user_id = r.reported_user_id),
         coalesce(tp.under_review, false),
         r.incident_when, r.incident_place, r.police_status, r.police_agency, r.police_case, r.share_with_police, r.can_contact,
         coalesce((select jsonb_agg(jsonb_build_object('from_admin', f.from_admin, 'body', f.body, 'at', f.created_at) order by f.created_at)
                   from public.report_followups f where f.report_id = r.id), '[]'::jsonb),
         (select count(*) from private.police_disclosures d where d.report_id = r.id)
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles tp on tp.id = r.reported_user_id
  left join public.pins pn on pn.id = r.pin_id
  left join public.pin_replies pr on pr.id = r.reply_id
  left join public.messages m on m.id = r.message_id
  order by (r.status in ('open', 'reviewing')) desc, coalesce(r.priority, 4), r.created_at desc
  limit 200;
end $$;
revoke all on function public.admin_reports() from public, anon;
grant execute on function public.admin_reports() to authenticated;
