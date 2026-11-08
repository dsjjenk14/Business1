-- Acting on reports about a member: warn, suspend for a while, or remove from the app.
-- Removal tells everyone who vouched for them. The person who reported is never named,
-- and notices to the reported person are delayed a random 2 to 24 hours so the timing
-- doesn't point to anyone.

alter table public.profiles add column if not exists suspended_until timestamptz;
alter table public.profiles add column if not exists banned_at timestamptz;
-- (No grants: members can't change these. The app reads them through my_account_status().)

create table public.moderation_actions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  action      text not null check (action in ('warn', 'suspend', 'ban', 'unsuspend')),
  until       timestamptz,
  report_id   bigint references public.reports (id) on delete set null,
  admin_id    uuid references public.profiles (id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);
alter table public.moderation_actions enable row level security;
create policy moderation_admin on public.moderation_actions for select to authenticated using (public.is_admin());
revoke all on public.moderation_actions from anon, authenticated;
grant select on public.moderation_actions to authenticated;

-- Notices that go out later, so a report and its outcome can't be matched up by timing.
create table private.delayed_notices (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text not null,
  link        text,
  deliver_at  timestamptz not null
);

create or replace function private.notify_later(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into private.delayed_notices (user_id, kind, title, body, link, deliver_at)
  values (p_user, p_kind, p_title, p_body, p_link, now() + make_interval(mins => 120 + floor(random() * 1320)::int))
$$;

create or replace function private.deliver_delayed_notices() returns void
language plpgsql security definer set search_path = '' as $$
declare n private.delayed_notices;
begin
  for n in delete from private.delayed_notices where deliver_at <= now() returning * loop
    perform private.notify(n.user_id, n.kind, n.title, n.body, null, n.link);
  end loop;
end $$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('deliver-delayed-notices', '*/10 * * * *', 'select private.deliver_delayed_notices()');
exception when others then
  raise notice 'pg_cron not available; run private.deliver_delayed_notices() another way (%).', sqlerrm;
end $$;

-- Is this member allowed to act right now?
create or replace function private.is_restricted(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.banned_at is not null or p.suspended_until > now() from public.profiles p where p.id = p_user), false)
$$;

-- Suspended or removed members can't post, reply, message, vouch, RSVP or send Outs and requests.
create or replace function private.block_if_restricted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and private.is_restricted(auth.uid()) then
    raise exception 'Your account is suspended right now.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

do $$
declare tbl text;
begin
  foreach tbl in array array['pins', 'pin_replies', 'messages', 'vouches', 'event_rsvps', 'outs', 'date_requests', 'intro_requests', 'going_out_posts'] loop
    execute format('drop trigger if exists %I on public.%I', tbl || '_restricted', tbl);
    execute format('create trigger %I before insert on public.%I for each row execute function private.block_if_restricted()', tbl || '_restricted', tbl);
  end loop;
end $$;

-- What the app checks on start: are you suspended or removed?
create or replace function public.my_account_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('banned', p.banned_at is not null, 'suspended_until', case when p.suspended_until > now() then p.suspended_until end)
  from public.profiles p where p.id = auth.uid()
$$;
revoke all on function public.my_account_status() from public, anon;
grant execute on function public.my_account_status() to authenticated;

-- An admin acts on a member. Closes that member's open reports.
--   warn: they get a general warning (later, no details about who reported)
--   suspend: they can't use the app for p_days days
--   ban: removed from the app; their posts are hidden, and everyone who vouched for them is told
--   unsuspend: lifts a suspension
create or replace function public.admin_member_action(p_report bigint, p_action text, p_days int default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.reports;
  target uuid;
  who text;
  until_at timestamptz;
  voucher uuid;
begin
  perform private.require_admin();
  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'Report not found.' using errcode = 'check_violation'; end if;
  target := coalesce(r.reported_user_id,
                     (select author_id from public.pins where id = r.pin_id),
                     (select author_id from public.pin_replies where id = r.reply_id));
  if target is null then raise exception 'This report isn''t about a member.' using errcode = 'check_violation'; end if;
  if target = auth.uid() then raise exception 'You can''t act on your own account.' using errcode = 'check_violation'; end if;
  select display_name into who from public.profiles where id = target;

  if p_action = 'warn' then
    perform private.notify_later(target, 'moderation', 'A warning from I’m In',
      'Something you did broke our Community Guidelines. Please read them again. Another problem could mean a suspension or removal.', '/legal/guidelines');
  elsif p_action = 'suspend' then
    if coalesce(p_days, 0) < 1 or p_days > 365 then raise exception 'Pick 1 to 365 days.' using errcode = 'check_violation'; end if;
    until_at := now() + make_interval(days => p_days);
    update public.profiles set suspended_until = until_at where id = target;
    perform private.notify_later(target, 'moderation', 'Your account is suspended',
      format('You broke our Community Guidelines, so you can’t use I’m In for %s days.', p_days), '/legal/guidelines');
  elsif p_action = 'unsuspend' then
    update public.profiles set suspended_until = null where id = target;
  elsif p_action = 'ban' then
    update public.profiles set banned_at = coalesce(banned_at, now()) where id = target;
    update public.pins set hidden_at = coalesce(hidden_at, now()) where author_id = target;
    update public.pin_replies set hidden_at = coalesce(hidden_at, now()) where author_id = target;
    -- Everyone who vouched for them hears it. It never mentions a report.
    for voucher in select distinct v.voucher_id from public.vouches v where v.vouchee_id = target and v.voucher_id <> target loop
      perform private.notify_later(voucher, 'moderation_voucher', 'Someone you vouched for was removed',
        format('%s was removed from I’m In for breaking our Community Guidelines.', who),
        '/legal/guidelines');
    end loop;
  else
    raise exception 'Unknown action.' using errcode = 'check_violation';
  end if;

  insert into public.moderation_actions (user_id, action, until, report_id, admin_id, note)
  values (target, p_action, until_at, r.id, auth.uid(), nullif(trim(coalesce(p_note, '')), ''));

  -- Close this member's open reports. People who reported get a thank-you later (never details).
  if p_action in ('warn', 'suspend', 'ban') then
    perform private.notify_later(x.reporter_id, 'report_outcome', 'We acted on your report',
      'Thank you. We reviewed it and took action. To protect you, we don’t share what we did, and they’ll never know who reported them.', null)
    from (select distinct reporter_id from public.reports
          where status in ('open', 'reviewing') and reporter_id is not null
            and (reported_user_id = target or id = r.id)) x;
  end if;
  update public.reports set status = 'resolved'::public.report_status, resolved_at = now(),
         admin_notes = coalesce(nullif(trim(coalesce(p_note, '')), ''), admin_notes)
   where status in ('open', 'reviewing') and (reported_user_id = target or id = r.id);
end $$;
revoke all on function public.admin_member_action(bigint, text, int, text) from public, anon;
grant execute on function public.admin_member_action(bigint, text, int, text) to authenticated;

-- A removed member's profile isn't shown to anyone but admins.
do $$
declare
  src text := pg_get_functiondef('public.profile_card(uuid)'::regprocedure);
  old text := $p$select case when p.id is null or private.is_blocked(auth.uid(), p_user) then null else$p$;
begin
  if position(old in src) = 0 then raise exception 'ban patch: text not found in profile_card'; end if;
  execute replace(src, old, $p$select case when p.id is null or private.is_blocked(auth.uid(), p_user) or (p.banned_at is not null and not public.is_admin()) then null else$p$);
end $$;
