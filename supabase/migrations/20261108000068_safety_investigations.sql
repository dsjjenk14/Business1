-- Investigating reports, especially about things that happened in person, where there's often no proof.
--   * Sexual assault and in-person violence reports put the reported member on hold right away,
--     before review (what large dating apps say they do). The two can't see or contact each other.
--   * Evidence is saved the moment a report comes in (messages between them, whether and where
--     they met, Date Mode and safety alerts), so it can't be deleted later, for admins and police.
--   * Reports are sorted by how serious they are, and repeat reports about one person stand out.
--   * Removed members: their verified phone number is blocked from coming back, and their
--     vouches for others stop counting.
--   * Members on hold or removed can ask for a review (an appeal).

-- Priority: 1 = urgent (assault, violence), 2 = serious, 3 = normal, 4 = low.
create or replace function private.report_priority(p_reason public.report_reason) returns smallint
language sql immutable set search_path = '' as $$
  select case p_reason::text
    when 'assault' then 1 when 'violence' then 1
    when 'unsafe' then 2 when 'harassment' then 2
    when 'privacy' then 3 when 'inappropriate' then 3 when 'misrepresentation' then 3
    else 4 end::smallint
$$;

alter table public.reports add column if not exists priority smallint;
update public.reports set priority = private.report_priority(reason) where priority is null;

alter table public.profiles add column if not exists under_review boolean not null default false;

-- Evidence saved when a report comes in. Admins only; kept even if either account is deleted.
create table private.report_evidence (
  report_id     bigint primary key references public.reports (id) on delete cascade,
  reporter_id   uuid,
  reported_id   uuid,
  collected_at  timestamptz not null default now(),
  data          jsonb not null
);

create or replace function private.collect_evidence(p_report bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.reports; a uuid; b uuid;
begin
  select * into r from public.reports where id = p_report;
  a := r.reporter_id; b := r.reported_user_id;
  if a is null or b is null then return; end if;
  insert into private.report_evidence (report_id, reporter_id, reported_id, data)
  values (r.id, a, b, jsonb_build_object(
    'met_in_person', coalesce((
      select jsonb_agg(jsonb_build_object('at', e.overlap_start, 'until', e.overlap_end, 'place', e.place_label, 'context', e.context) order by e.overlap_start desc)
      from public.encounters e where (e.user_a = a and e.user_b = b) or (e.user_a = b and e.user_b = a)), '[]'::jsonb),
    'date_requests', coalesce((
      select jsonb_agg(to_jsonb(d) - 'id' order by d.created_at desc)
      from public.date_requests d where (d.from_id = a and d.to_id = b) or (d.from_id = b and d.to_id = a)), '[]'::jsonb),
    'date_mode', coalesce((
      select jsonb_agg(jsonb_build_object('status', s.status, 'activated_at', s.activated_at, 'ended_at', s.ended_at, 'last_problem', s.last_problem,
                                          'alerts', (select coalesce(jsonb_agg(jsonb_build_object('who', case when al.user_id = a then 'reporter' else 'reported' end, 'level', al.level, 'at', al.created_at)), '[]'::jsonb)
                                                     from public.safety_alerts al where al.session_id = s.id))
                       order by s.created_at desc)
      from public.date_sessions s where (s.initiator_id = a and s.partner_id = b) or (s.initiator_id = b and s.partner_id = a)), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('from', case when m.sender_id = a then 'reporter' else 'reported' end, 'body', m.body, 'at', m.created_at) order by m.created_at)
      from (select m.* from public.messages m
            where m.sender_id in (a, b)
              and m.conversation_id in (select cm.conversation_id from public.conversation_members cm where cm.user_id = a
                                        intersect select cm.conversation_id from public.conversation_members cm where cm.user_id = b)
            order by m.created_at desc limit 200) m), '[]'::jsonb)
  ))
  on conflict (report_id) do nothing;
end $$;

-- Every new report: priority, saved evidence, a reply to the reporter, and for the most
-- serious in-person reports, an immediate hold.
create or replace function private.on_report_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.priority is null then new.priority := private.report_priority(new.reason); end if;
  return new;
end $$;
drop trigger if exists reports_priority on public.reports;
create trigger reports_priority before insert on public.reports for each row execute function private.on_report_created();

-- Did these two actually meet, plan a date, or message each other? (Holds only apply then.)
create or replace function private.have_interacted(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.encounters e where (e.user_a = a and e.user_b = b) or (e.user_a = b and e.user_b = a))
      or exists (select 1 from public.date_requests d where (d.from_id = a and d.to_id = b) or (d.from_id = b and d.to_id = a))
      or exists (select 1 from public.date_sessions s where (s.initiator_id = a and s.partner_id = b) or (s.initiator_id = b and s.partner_id = a))
      or exists (select 1 from public.conversation_members x join public.conversation_members y on y.conversation_id = x.conversation_id
                 where x.user_id = a and y.user_id = b)
$$;

create or replace function private.after_report_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare serious boolean := new.reason::text in ('assault', 'violence'); held boolean := false;
begin
  perform private.collect_evidence(new.id);
  if serious and new.reported_user_id is not null and new.reporter_id is not null then
    -- The reporter never sees or hears from them again, whatever the review finds.
    insert into public.blocks (blocker_id, blocked_id) values (new.reporter_id, new.reported_user_id) on conflict do nothing;
    -- Automatic hold only when they really crossed paths, and at most twice a month per reporter,
    -- so a hold can't be used as a weapon against a stranger. Otherwise it's still top priority.
    if private.have_interacted(new.reporter_id, new.reported_user_id)
       and (select count(*) from public.moderation_actions m join public.reports x on x.id = m.report_id
            where x.reporter_id = new.reporter_id and m.note like 'Automatic hold%' and m.created_at > now() - interval '30 days') < 2 then
      update public.profiles set under_review = true where id = new.reported_user_id;
      insert into public.moderation_actions (user_id, action, report_id, note)
      values (new.reported_user_id, 'suspend', new.id, 'Automatic hold: in-person safety report, pending review');
      held := true;
    end if;
  end if;
  -- Always answer the person who reported.
  if new.reporter_id is not null then
    perform private.notify(new.reporter_id, 'report_received', 'We got your report',
      case when serious then
        case when held then 'We’ve put their account on hold while we review it. ' else 'We’re reviewing it first, before anything else. ' end
        || 'You two can’t see or contact each other. If you’re in danger, call 911. For support after sexual assault: RAINN, 800-656-4673.'
      else 'Thank you. We review reports promptly, usually within 24 hours. They’ll never know who reported them.' end,
      null, null);
  end if;
  return null;
end $$;
drop trigger if exists reports_after_insert on public.reports;
create trigger reports_after_insert after insert on public.reports for each row execute function private.after_report_created();

-- On hold counts as restricted (can't post, message, vouch and so on).
create or replace function private.is_restricted(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.banned_at is not null or p.under_review or p.suspended_until > now() from public.profiles p where p.id = p_user), false)
$$;

-- Precise check-in readings are normally deleted after 30 days; keep them for anyone in an open
-- serious report, for police.
create or replace function private.purge_location_pings() returns void
language sql security definer set search_path = '' as $$
  delete from public.location_pings lp
  where lp.recorded_at < now() - make_interval(days => public.config_num('location_ping_retention_days')::int)
    and not exists (select 1 from public.reports r
                    where r.priority <= 2 and r.created_at > now() - interval '1 year'
                      and lp.user_id in (r.reporter_id, r.reported_user_id))
$$;

-- Removed members' verified phone numbers can't be used again.
create table private.banned_phones (
  phone_hash  text primary key,
  banned_at   timestamptz not null default now()
);
create or replace function private.phone_hash(p_phone text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), 'sha256'), 'hex')
$$;
create or replace function private.check_banned_phone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is not null and exists (select 1 from private.banned_phones where phone_hash = private.phone_hash(new.phone)) then
    update public.profiles set banned_at = coalesce(banned_at, now()) where id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists profile_private_banned_phone on public.profile_private;
create trigger profile_private_banned_phone after insert or update of phone on public.profile_private
  for each row execute function private.check_banned_phone();

-- Appeals: a member on hold, suspended or removed can ask once per decision for a second look.
create table public.appeals (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  message     text not null check (char_length(message) between 1 and 1000),
  status      text not null default 'open' check (status in ('open', 'upheld', 'lifted')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);
alter table public.appeals enable row level security;
create policy appeals_admin on public.appeals for select to authenticated using (public.is_admin() or user_id = auth.uid());
revoke all on public.appeals from anon, authenticated;
grant select on public.appeals to authenticated;

create or replace function public.submit_appeal(p_message text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if not private.is_restricted(me) then raise exception 'Your account isn''t on hold.' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.appeals where user_id = me and status = 'open') then
    raise exception 'We already have your request. We''ll get back to you.' using errcode = 'check_violation';
  end if;
  insert into public.appeals (user_id, message) values (me, left(trim(coalesce(p_message, '')), 1000));
  insert into public.notifications (user_id, kind, title, body)
  select p.id, 'moderation', 'New appeal', 'Someone asked for a second look.' from public.profiles p where p.role = 'admin';
end $$;

create or replace function public.admin_appeals() returns table (id bigint, user_id uuid, name text, message text, created_at timestamptz, banned boolean, under_review boolean, suspended_until timestamptz, history jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select a.id, a.user_id, p.display_name, a.message, a.created_at, p.banned_at is not null, p.under_review,
         case when p.suspended_until > now() then p.suspended_until end,
         coalesce((select jsonb_agg(jsonb_build_object('action', m.action, 'note', m.note, 'at', m.created_at) order by m.created_at desc)
                   from public.moderation_actions m where m.user_id = a.user_id), '[]'::jsonb)
  from public.appeals a join public.profiles p on p.id = a.user_id
  where a.status = 'open' order by a.created_at;
end $$;

-- lift: account back to normal. uphold: decision stays.
create or replace function public.admin_decide_appeal(p_appeal bigint, p_lift boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.appeals;
begin
  perform private.require_admin();
  select * into a from public.appeals where id = p_appeal and status = 'open';
  if a.id is null then raise exception 'That appeal is already decided.' using errcode = 'check_violation'; end if;
  update public.appeals set status = case when p_lift then 'lifted' else 'upheld' end, decided_at = now() where id = a.id;
  if p_lift then
    update public.profiles set banned_at = null, suspended_until = null, under_review = false where id = a.user_id;
    delete from private.banned_phones where phone_hash = (select private.phone_hash(pp.phone) from public.profile_private pp where pp.id = a.user_id);
    update public.vouches set status = 'active' where voucher_id = a.user_id and status = 'flagged';
    insert into public.moderation_actions (user_id, action, admin_id, note) values (a.user_id, 'unsuspend', auth.uid(), 'Appeal: lifted');
    perform private.notify(a.user_id, 'moderation', 'Your account is back', 'We took a second look and lifted the hold on your account.', null, '/');
  else
    perform private.notify_later(a.user_id, 'moderation', 'We reviewed your request', 'We took a second look, and our decision stays the same.', '/legal/guidelines');
  end if;
end $$;

revoke all on function public.submit_appeal(text) from public, anon;
revoke all on function public.admin_appeals() from public, anon;
revoke all on function public.admin_decide_appeal(bigint, boolean) from public, anon;
grant execute on function public.submit_appeal(text) to authenticated;
grant execute on function public.admin_appeals() to authenticated;
grant execute on function public.admin_decide_appeal(bigint, boolean) to authenticated;

-- The app's account check includes "on hold".
create or replace function public.my_account_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'banned', p.banned_at is not null,
    'under_review', p.under_review,
    'suspended_until', case when p.suspended_until > now() then p.suspended_until end,
    'appeal_open', exists (select 1 from public.appeals a where a.user_id = p.id and a.status = 'open'))
  from public.profiles p where p.id = auth.uid()
$$;

-- Evidence and history for one report, for the admin panel.
create or replace function public.admin_report_evidence(p_report bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.reports; target uuid; ev jsonb;
begin
  perform private.require_admin();
  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'Report not found.' using errcode = 'check_violation'; end if;
  target := r.reported_user_id;
  select data into ev from private.report_evidence where report_id = r.id;
  return jsonb_build_object(
    'saved', coalesce(ev, '{}'::jsonb),
    'independent_reporters', (select count(distinct reporter_id) from public.reports x where x.reported_user_id = target),
    'serious_reports', (select count(*) from public.reports x where x.reported_user_id = target and x.priority <= 2),
    'past_actions', coalesce((select jsonb_agg(jsonb_build_object('action', m.action, 'note', m.note, 'at', m.created_at) order by m.created_at desc)
                              from public.moderation_actions m where m.user_id = target), '[]'::jsonb),
    'vouches_taken_back_90d', (select count(*) from public.vouches v where v.vouchee_id = target and v.status = 'revoked' and v.created_at > now() - interval '90 days'),
    'reporter_reports_made', (select count(*) from public.reports x where x.reporter_id = r.reporter_id),
    'reporter_reports_dismissed', (select count(*) from public.reports x where x.reporter_id = r.reporter_id and x.status = 'dismissed'),
    'reporter_was_reported', (select count(*) from public.reports x where x.reported_user_id = r.reporter_id)
  );
end $$;
revoke all on function public.admin_report_evidence(bigint) from public, anon;
grant execute on function public.admin_report_evidence(bigint) to authenticated;

-- Admin report list: most serious first, with how many different people reported this member.
drop function if exists public.admin_reports();
create function public.admin_reports()
returns table(id bigint, reason public.report_reason, details text, status public.report_status, created_at timestamptz, reporter_name text,
              reported_id uuid, reported_name text, about text, content text, hidden boolean, pin_id bigint, reply_id bigint, message_id bigint,
              admin_notes text, reports_on_target bigint, priority smallint, independent_reporters bigint, on_hold boolean)
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
         coalesce(tp.under_review, false)
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

-- Acting on a member now also clears an automatic hold, and removal blocks their phone number
-- and stops their vouches for others from counting.
do $$
declare
  src text := pg_get_functiondef('public.admin_member_action(bigint,text,integer,text)'::regprocedure);
  old_ban text := $p$    update public.profiles set banned_at = coalesce(banned_at, now()) where id = target;$p$;
  old_sus text := $p$    update public.profiles set suspended_until = until_at where id = target;$p$;
  old_un text := $p$    update public.profiles set suspended_until = null where id = target;$p$;
  old_warn text := $p$  if p_action = 'warn' then$p$;
begin
  if position(old_ban in src) = 0 or position(old_sus in src) = 0 or position(old_un in src) = 0 or position(old_warn in src) = 0 then
    raise exception 'moderation patch: text not found';
  end if;
  src := replace(src, old_ban, $p$    update public.profiles set banned_at = coalesce(banned_at, now()), under_review = false where id = target;
    insert into private.banned_phones (phone_hash)
      select private.phone_hash(pp.phone) from public.profile_private pp where pp.id = target and pp.phone is not null
      on conflict do nothing;
    update public.vouches set status = 'flagged' where voucher_id = target and status = 'active';$p$);
  src := replace(src, old_sus, $p$    update public.profiles set suspended_until = until_at, under_review = false where id = target;$p$);
  src := replace(src, old_un, $p$    update public.profiles set suspended_until = null, under_review = false where id = target;$p$);
  src := replace(src, old_warn, $p$  if p_action = 'warn' then
    update public.profiles set under_review = false where id = target;$p$);
  execute src;
end $$;

-- Dismissing a report lifts its automatic hold, unless another open urgent report holds them.
create or replace function private.release_hold_on_dismiss() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'dismissed' and old.status <> 'dismissed' and new.reported_user_id is not null
     and not exists (select 1 from public.reports x where x.reported_user_id = new.reported_user_id and x.id <> new.id
                     and x.status in ('open', 'reviewing') and x.priority = 1) then
    update public.profiles set under_review = false where id = new.reported_user_id and under_review;
  end if;
  return null;
end $$;
drop trigger if exists reports_release_hold on public.reports;
create trigger reports_release_hold after update of status on public.reports for each row execute function private.release_hold_on_dismiss();

-- Always close the loop with the reporter, a few hours later, without saying what we did.
-- (Acting on the member already sends them a thank-you; don't send two.)
create or replace function private.tell_reporter_closed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('resolved', 'dismissed') and old.status in ('open', 'reviewing') and new.reporter_id is not null
     and not exists (select 1 from private.delayed_notices d where d.user_id = new.reporter_id and d.kind = 'report_outcome' and d.deliver_at > now()) then
    perform private.notify_later(new.reporter_id, 'report_outcome', 'We reviewed your report',
      'Thank you for telling us. We looked into it and took the steps we could. If anything else happens, report it again, and call 911 if you’re in danger.', null);
  end if;
  return null;
end $$;
drop trigger if exists reports_tell_reporter on public.reports;
create trigger reports_tell_reporter after update of status on public.reports for each row execute function private.tell_reporter_closed();

-- An admin can also clear a hold with no action (the report didn't hold up).
create or replace function public.admin_clear_hold(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.profiles set under_review = false where id = p_user;
  insert into public.moderation_actions (user_id, action, admin_id, note) values (p_user, 'unsuspend', auth.uid(), 'Hold cleared after review');
end $$;
revoke all on function public.admin_clear_hold(uuid) from public, anon;
grant execute on function public.admin_clear_hold(uuid) to authenticated;
