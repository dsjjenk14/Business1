-- I'm In: 011 App Store requirements
-- Reports (members, pins, replies), block/unblock, auto-hide of heavily
-- reported content, terms acceptance at signup, and account deletion support.

insert into public.app_config (key, value, description) values
  ('report_hide_threshold', '3', 'Content reported by this many different members is hidden until a moderator reviews it.'),
  ('support_email', '"support@imin.app"', 'Shown in the app for help and safety questions. Change to the real address before launch.')
on conflict (key) do nothing;

-- ── Moderation: hidden content ────────────────────────────────────────────
alter table public.pins        add column hidden_at timestamptz;
alter table public.pin_replies add column hidden_at timestamptz;

-- Hidden pins stay visible to their author only (so nothing silently vanishes for them).
create or replace function private.can_see_pin(p_pin bigint, p_viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pins p
    where p.id = p_pin
      and p.deleted_at is null
      and not private.is_blocked(p_viewer, p.author_id)
      and (p.hidden_at is null or p.author_id = p_viewer)
      and (
        p.author_id = p_viewer
        or p.audience = 'everyone'
        or (p.audience = 'circle'  and private.are_connected(p_viewer, p.author_id))
        or (p.audience = 'network' and private.degree_between(p_viewer, p.author_id) in (1, 2))
      )
  )
$$;

drop policy "replies on visible pins" on public.pin_replies;
create policy "replies on visible pins" on public.pin_replies for select to authenticated
  using (
    private.can_see_pin(pin_id, auth.uid())
    and not private.is_blocked(auth.uid(), author_id)
    and (hidden_at is null or author_id = auth.uid())
  );

-- ── Reports ───────────────────────────────────────────────────────────────
create type public.report_reason as enum ('misrepresentation', 'harassment', 'unsafe', 'privacy', 'spam', 'inappropriate', 'other');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create table public.reports (
  id               bigserial primary key,
  reporter_id      uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid references public.profiles (id) on delete set null,
  pin_id           bigint references public.pins (id) on delete set null,
  reply_id         bigint references public.pin_replies (id) on delete set null,
  reason           public.report_reason not null,
  details          text not null default '' check (char_length(details) <= 2000),
  status           public.report_status not null default 'open',
  admin_notes      text,                -- moderators only, never shown to members
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  check (reported_user_id is not null or pin_id is not null or reply_id is not null)
);
create index reports_status_idx on public.reports (status, created_at);
alter table public.reports enable row level security;

-- Members can't read the reports table directly (admin notes live there);
-- they see their own reports' status through my_reports().
create policy "admins manage reports" on public.reports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.report(
  p_reason public.report_reason, p_details text default '',
  p_user uuid default null, p_pin bigint default null, p_reply bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  target_user uuid := p_user;
  new_id bigint;
  reporters int;
  threshold int := public.config_num('report_hide_threshold')::int;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if p_pin is not null then
    select author_id into target_user from public.pins where id = p_pin;
  elsif p_reply is not null then
    select author_id into target_user from public.pin_replies where id = p_reply;
  end if;
  if target_user is null then raise exception 'Nothing to report.' using errcode = 'check_violation'; end if;
  if target_user = me then raise exception 'You can''t report yourself.' using errcode = 'check_violation'; end if;

  insert into public.reports (reporter_id, reported_user_id, pin_id, reply_id, reason, details)
  values (me, target_user, p_pin, p_reply, p_reason, coalesce(trim(p_details), ''))
  returning id into new_id;

  -- Auto-hide content once enough different members report it.
  if p_pin is not null then
    select count(distinct reporter_id) into reporters from public.reports where pin_id = p_pin and status in ('open', 'reviewing');
    if reporters >= threshold then update public.pins set hidden_at = coalesce(hidden_at, now()) where id = p_pin; end if;
  elsif p_reply is not null then
    select count(distinct reporter_id) into reporters from public.reports where reply_id = p_reply and status in ('open', 'reviewing');
    if reporters >= threshold then update public.pin_replies set hidden_at = coalesce(hidden_at, now()) where id = p_reply; end if;
  end if;

  -- Tell moderators.
  insert into public.notifications (user_id, kind, title, body, actor_id, link)
  select p.id, 'moderation', 'New report: ' || p_reason::text, left(coalesce(p_details, ''), 140), null, null
  from public.profiles p where p.role = 'admin';

  return new_id;
end $$;

create or replace function public.my_reports()
returns table (id bigint, reason public.report_reason, status public.report_status, created_at timestamptz,
               reported_name text, about text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.reason, r.status, r.created_at, p.display_name,
         case when r.pin_id is not null then 'pin' when r.reply_id is not null then 'reply' else 'member' end
  from public.reports r left join public.profiles p on p.id = r.reported_user_id
  where r.reporter_id = auth.uid()
  order by r.created_at desc
$$;

-- ── Block / unblock ───────────────────────────────────────────────────────
-- Blocking removes the connection, cancels intros between you, and hides each
-- of you from the other everywhere (feeds, profiles, search, messages).
create or replace function public.block_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or p_user is null or p_user = me then raise exception 'Can''t block that member.' using errcode = 'check_violation'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (me, p_user) on conflict do nothing;
  delete from public.connections where user_a = least(me, p_user) and user_b = greatest(me, p_user);
  update public.intros set a_status = 'declined'
   where least(person_a, person_b) = least(me, p_user) and greatest(person_a, person_b) = greatest(me, p_user)
     and a_status = 'pending';
  update public.intros set b_status = 'declined'
   where least(person_a, person_b) = least(me, p_user) and greatest(person_a, person_b) = greatest(me, p_user)
     and b_status = 'pending';
  update public.intro_requests set status = 'cancelled'
   where status = 'pending' and ((requester_id = me and target_id = p_user) or (requester_id = p_user and target_id = me));
end $$;

create or replace function public.unblock_user(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_user
$$;

create or replace function public.my_blocked()
returns table (user_id uuid, display_name text, avatar_emoji text, avatar_url text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.blocked_id, p.display_name, p.avatar_emoji, p.avatar_url, b.created_at
  from public.blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc
$$;

-- profile_card returns null for blocked pairs, but a member you blocked should
-- still be unblockable from the Blocked list (handled by my_blocked above).

-- ── Terms acceptance at signup ────────────────────────────────────────────
alter table public.profile_private add column terms_accepted_at timestamptz;

-- Runs after handle_new_user (triggers fire in name order).
create or replace function public.record_terms_acceptance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((new.raw_user_meta_data ->> 'accepted_terms')::boolean, false) is not true then
    raise exception 'You need to agree to the Terms and Community Guidelines to join.' using errcode = 'check_violation';
  end if;
  update public.profile_private set terms_accepted_at = now() where id = new.id;
  return new;
end $$;
create trigger on_auth_user_terms after insert on auth.users
  for each row execute function public.record_terms_acceptance();

-- ── Account deletion ──────────────────────────────────────────────────────
-- Vouches tied to a deleted meetup go with it (only happens on account deletion).
alter table public.vouches drop constraint vouches_encounter_id_fkey;
alter table public.vouches add constraint vouches_encounter_id_fkey
  foreign key (encounter_id) references public.encounters (id) on delete cascade;

-- Before deleting a member: hand each group they own to its longest-standing
-- admin/member, or delete the group if nobody else is in it. Everything else
-- is removed automatically when the login is deleted (cascades).
create or replace function public.prepare_account_deletion(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g record;
  heir uuid;
begin
  for g in select id from public.groups where owner_id = p_user loop
    select user_id into heir from public.group_members
     where group_id = g.id and user_id <> p_user
     order by case role when 'admin' then 0 else 1 end, joined_at
     limit 1;
    if heir is null then
      delete from public.groups where id = g.id;
    else
      update public.groups set owner_id = heir where id = g.id;
      update public.group_members set role = 'owner' where group_id = g.id and user_id = heir;
    end if;
  end loop;
end $$;

-- ── Permissions ───────────────────────────────────────────────────────────
revoke execute on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

do $$
declare f text;
begin
  foreach f in array array[
    'public.report(public.report_reason, text, uuid, bigint, bigint)',
    'public.my_reports()',
    'public.block_user(uuid)',
    'public.unblock_user(uuid)',
    'public.my_blocked()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
