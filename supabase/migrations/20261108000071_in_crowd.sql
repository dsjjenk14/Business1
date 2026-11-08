-- The In Crowd: verified public figures (musicians, athletes, creators, chefs, local personalities).
--   * They ask from Settings; an admin approves after checking it's really them (selfie check,
--     plus a code in the bio of their official account). Stops fake celebrity accounts.
--   * Protections start at the safest setting:
--       - where they are: shown only after they leave (or never, or right away)
--       - messages: only people they pick (or their Insiders)
--       - replies to their posts: only people they pick (or Insiders, or everyone)
--       - arrival ("here now"): off
--       - intro requests: off
--   * They get their own row on Home and are left out of "Most vouched".

alter table public.profiles add column if not exists in_crowd_at timestamptz;

alter table public.user_settings
  add column if not exists in_crowd_location text not null default 'after' check (in_crowd_location in ('never', 'after', 'live')),
  add column if not exists in_crowd_messages text not null default 'picked' check (in_crowd_messages in ('picked', 'insiders')),
  add column if not exists in_crowd_replies text not null default 'picked' check (in_crowd_replies in ('picked', 'insiders', 'everyone')),
  add column if not exists in_crowd_arrivals boolean not null default false;

-- The people an In Crowd member picked: they see where they are, and can message and reply.
create table public.in_crowd_picks (
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  member_id   uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (owner_id, member_id),
  check (owner_id <> member_id)
);
alter table public.in_crowd_picks enable row level security;
create policy in_crowd_picks_own on public.in_crowd_picks for select to authenticated using (owner_id = auth.uid());
revoke all on public.in_crowd_picks from anon, authenticated;
grant select on public.in_crowd_picks to authenticated;

create table public.in_crowd_requests (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  official_url  text not null check (char_length(official_url) between 8 and 300),
  manager       text check (char_length(manager) <= 200),
  status        text not null default 'open' check (status in ('open', 'approved', 'declined')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references public.profiles (id) on delete set null,
  note          text
);
alter table public.in_crowd_requests enable row level security;
create policy in_crowd_requests_read on public.in_crowd_requests for select to authenticated using (public.is_admin() or user_id = auth.uid());
revoke all on public.in_crowd_requests from anon, authenticated;
grant select on public.in_crowd_requests to authenticated;

create or replace function private.is_in_crowd(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select in_crowd_at is not null from public.profiles where id = p_user), false)
$$;

create or replace function private.in_crowd_picked(p_owner uuid, p_viewer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_owner = p_viewer or exists (select 1 from public.in_crowd_picks where owner_id = p_owner and member_id = p_viewer)
$$;

-- Does their location setting hide them from this viewer right now?
create or replace function private.in_crowd_hides(p_owner uuid, p_viewer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_in_crowd(p_owner)
     and coalesce((select in_crowd_location from public.user_settings where user_id = p_owner), 'after') <> 'live'
     and not private.in_crowd_picked(p_owner, p_viewer)
$$;

-- Where they were, once they've left (setting "after I leave"). Last 3 days only.
create or replace function private.in_crowd_last_place(p_owner uuid, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('place', coalesce(v.name, g.place_text), 'at', coalesce(g.live_until, g.expires_at))
  from public.going_out_posts g left join public.venues v on v.id = g.venue_id
  where g.user_id = p_owner
    and private.is_in_crowd(p_owner)
    and coalesce((select in_crowd_location from public.user_settings where user_id = p_owner), 'after') = 'after'
    and not coalesce((select ghost_mode from public.user_settings where user_id = p_owner), false)
    and not private.is_blocked(p_owner, p_viewer)
    and g.arrived_at is not null
    and coalesce(g.live_until, g.expires_at) < now()
    and coalesce(g.live_until, g.expires_at) > now() - interval '3 days'
    and coalesce(v.name, g.place_text) is not null
  order by coalesce(g.live_until, g.expires_at) desc
  limit 1
$$;

-- Hook the protections into the existing rules.
do $$
declare
  pairs text[][] := array[
    -- Plans, "here now", going-out pins, "out tonight": hidden unless they show it live, or you're picked.
    array['private.can_see_out(uuid,uuid)',
          'and not coalesce((select ghost_mode from public.user_settings where user_id = p_owner), false)',
          'and not coalesce((select ghost_mode from public.user_settings where user_id = p_owner), false)
    and not private.in_crowd_hides(p_owner, p_viewer)'],
    -- Arrivals: off unless they turn them on, or you're picked.
    array['private.can_see_here(bigint,uuid,text,smallint)',
          'and not private.post_hidden(p_owner, auth.uid())',
          'and not private.post_hidden(p_owner, auth.uid())
        and (not private.is_in_crowd(p_owner) or private.in_crowd_picked(p_owner, auth.uid())
             or coalesce((select s.in_crowd_arrivals from public.user_settings s where s.user_id = p_owner), false))'],
    -- Messages: only people they picked, unless they open it to their Insiders.
    array['private.can_message(uuid,uuid)',
          'and not private.is_blocked(p_from, p_to)',
          'and not private.is_blocked(p_from, p_to)
    and (not private.is_in_crowd(p_to) or private.in_crowd_picked(p_to, p_from)
         or coalesce((select in_crowd_messages from public.user_settings where user_id = p_to), ''picked'') = ''insiders'')'],
    -- "Most vouched" is for regular members.
    array['public.famous_members()',
          'and p.id <> auth.uid()',
          'and p.id <> auth.uid()
    and p.in_crowd_at is null'],
    -- Profiles show the badge and, for "after I leave", where they were.
    array['public.profile_card(uuid)',
          '''is_official'', p.id = private.official_account(),',
          '''is_official'', p.id = private.official_account(), ''in_crowd'', p.in_crowd_at is not null, ''last_place'', case when p.id <> auth.uid() then private.in_crowd_last_place(p.id, auth.uid()) end,']
  ];
  i int;
  src text;
begin
  for i in 1 .. array_length(pairs, 1) loop
    src := pg_get_functiondef(pairs[i][1]::regprocedure);
    if position(pairs[i][2] in src) = 0 then
      raise exception 'in crowd patch %: text not found in %', i, pairs[i][1];
    end if;
    execute replace(src, pairs[i][2], pairs[i][3]);
  end loop;
end $$;

-- Replies to their posts.
create or replace function private.in_crowd_reply_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner uuid; rule text;
begin
  select author_id into owner from public.pins where id = new.pin_id;
  if owner is null or owner = new.author_id or not private.is_in_crowd(owner) then return new; end if;
  rule := coalesce((select in_crowd_replies from public.user_settings where user_id = owner), 'picked');
  if rule = 'everyone' then return new; end if;
  if private.in_crowd_picked(owner, new.author_id) or (rule = 'insiders' and private.are_connected(owner, new.author_id)) then return new; end if;
  raise exception 'Replies on this post are limited to people they picked.' using errcode = 'insufficient_privilege';
end $$;
drop trigger if exists pin_replies_in_crowd on public.pin_replies;
create trigger pin_replies_in_crowd before insert on public.pin_replies for each row execute function private.in_crowd_reply_check();

-- Their own settings.
create or replace function public.my_in_crowd() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'in_crowd', p.in_crowd_at is not null,
    'verified', p.photo_verified_at is not null or p.id_verified_at is not null,
    'code', 'IMIN-' || upper(substr(md5(p.id::text || 'in-crowd'), 1, 4)),
    'request', (select jsonb_build_object('status', r.status, 'created_at', r.created_at, 'official_url', r.official_url)
                from public.in_crowd_requests r where r.user_id = p.id order by r.created_at desc limit 1),
    'location', coalesce(s.in_crowd_location, 'after'),
    'messages', coalesce(s.in_crowd_messages, 'picked'),
    'replies', coalesce(s.in_crowd_replies, 'picked'),
    'arrivals', coalesce(s.in_crowd_arrivals, false),
    'intro_requests', coalesce(s.allow_intro_requests, true),
    'show_vouch_count', coalesce(s.show_vouch_count, true),
    'picks', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'display_name', m.display_name, 'avatar_url', m.avatar_url) order by m.display_name)
                       from public.in_crowd_picks k join public.profiles m on m.id = k.member_id where k.owner_id = p.id), '[]'::jsonb))
  from public.profiles p left join public.user_settings s on s.user_id = p.id
  where p.id = auth.uid()
$$;

create or replace function public.set_in_crowd_settings(p_location text, p_messages text, p_replies text, p_arrivals boolean, p_intro_requests boolean, p_show_vouch_count boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_in_crowd(auth.uid()) then raise exception 'These settings are for the In Crowd.' using errcode = 'insufficient_privilege'; end if;
  insert into public.user_settings (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update public.user_settings set
    in_crowd_location = coalesce(p_location, in_crowd_location),
    in_crowd_messages = coalesce(p_messages, in_crowd_messages),
    in_crowd_replies = coalesce(p_replies, in_crowd_replies),
    in_crowd_arrivals = coalesce(p_arrivals, in_crowd_arrivals),
    allow_intro_requests = coalesce(p_intro_requests, allow_intro_requests),
    show_vouch_count = coalesce(p_show_vouch_count, show_vouch_count),
    updated_at = now()
  where user_id = auth.uid();
end $$;

-- Pick from your Insiders.
create or replace function public.set_in_crowd_pick(p_member uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_in_crowd(auth.uid()) then raise exception 'These settings are for the In Crowd.' using errcode = 'insufficient_privilege'; end if;
  if p_on then
    if not private.are_connected(auth.uid(), p_member) then raise exception 'You can pick from your Insiders.' using errcode = 'check_violation'; end if;
    insert into public.in_crowd_picks (owner_id, member_id) values (auth.uid(), p_member) on conflict do nothing;
  else
    delete from public.in_crowd_picks where owner_id = auth.uid() and member_id = p_member;
  end if;
end $$;

-- Ask to join.
create or replace function public.request_in_crowd(p_official_url text, p_manager text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if private.is_in_crowd(me) then raise exception 'You''re already in the In Crowd.' using errcode = 'check_violation'; end if;
  -- The live selfie check (reviewed by a person), or an ID check once one is connected.
  if (select photo_verified_at is null and id_verified_at is null from public.profiles where id = me) then
    raise exception 'Do the selfie check first.' using errcode = 'check_violation';
  end if;
  if char_length(trim(coalesce(p_official_url, ''))) < 8 then raise exception 'Add the link to your official account.' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.in_crowd_requests where user_id = me and status = 'open') then
    raise exception 'We have your request. We''ll let you know.' using errcode = 'check_violation';
  end if;
  insert into public.in_crowd_requests (user_id, official_url, manager)
  values (me, trim(p_official_url), nullif(trim(coalesce(p_manager, '')), ''));
  insert into public.notifications (user_id, kind, title, body, link)
  select p.id, 'moderation', 'In Crowd request', 'A member asked to join the In Crowd.', '/admin' from public.profiles p where p.role = 'admin';
end $$;

create or replace function public.admin_in_crowd_requests() returns table (
  id bigint, user_id uuid, name text, official_url text, manager text, code text, verified boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select r.id, r.user_id, p.display_name, r.official_url, r.manager, 'IMIN-' || upper(substr(md5(p.id::text || 'in-crowd'), 1, 4)),
         p.photo_verified_at is not null or p.id_verified_at is not null, r.created_at
  from public.in_crowd_requests r join public.profiles p on p.id = r.user_id
  where r.status = 'open' order by r.created_at;
end $$;

create or replace function public.admin_decide_in_crowd(p_request bigint, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.in_crowd_requests;
begin
  perform private.require_admin();
  select * into r from public.in_crowd_requests where id = p_request and status = 'open';
  if r.id is null then raise exception 'That request is already decided.' using errcode = 'check_violation'; end if;
  update public.in_crowd_requests set status = case when p_approve then 'approved' else 'declined' end,
    decided_at = now(), decided_by = auth.uid(), note = nullif(trim(coalesce(p_note, '')), '') where id = r.id;
  if p_approve then
    update public.profiles set in_crowd_at = now() where id = r.user_id;
    -- Start at the safest settings.
    insert into public.user_settings (user_id) values (r.user_id) on conflict (user_id) do nothing;
    update public.user_settings set in_crowd_location = 'after', in_crowd_messages = 'picked', in_crowd_replies = 'picked',
      in_crowd_arrivals = false, allow_intro_requests = false, updated_at = now() where user_id = r.user_id;
    perform private.notify(r.user_id, 'moderation', 'You''re in the In Crowd', 'Your badge is on. Your extra privacy is on too; check it in Settings.', null, '/settings/in-crowd');
  else
    perform private.notify(r.user_id, 'moderation', 'About your In Crowd request', 'We couldn''t confirm it this time. You can ask again with more details.', null, '/settings/in-crowd');
  end if;
end $$;

-- An admin can take the badge away.
create or replace function public.admin_remove_in_crowd(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.profiles set in_crowd_at = null where id = p_user;
end $$;

-- The Home row.
create or replace function public.in_crowd_members() returns table (id uuid, display_name text, avatar_url text, headline text, note text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar_url, p.headline,
         coalesce(
           (select 'Event ' || to_char(e.starts_at at time zone 'America/New_York', 'Dy') from public.events e
            where e.host_id = p.id and e.starts_at > now() and e.starts_at < now() + interval '7 days' and e.visibility = 'public'
            order by e.starts_at limit 1),
           (select 'New post' from public.pins x where x.author_id = p.id and x.deleted_at is null and x.hidden_at is null
              and x.created_at > now() - interval '2 days' limit 1))
  from public.profiles p
  where p.in_crowd_at is not null and p.banned_at is null
    and not private.is_blocked(auth.uid(), p.id)
  order by p.in_crowd_at desc
  limit 20
$$;

revoke all on function public.my_in_crowd() from public, anon;
revoke all on function public.set_in_crowd_settings(text, text, text, boolean, boolean, boolean) from public, anon;
revoke all on function public.set_in_crowd_pick(uuid, boolean) from public, anon;
revoke all on function public.request_in_crowd(text, text) from public, anon;
revoke all on function public.admin_in_crowd_requests() from public, anon;
revoke all on function public.admin_decide_in_crowd(bigint, boolean, text) from public, anon;
revoke all on function public.admin_remove_in_crowd(uuid) from public, anon;
revoke all on function public.in_crowd_members() from public, anon;
grant execute on function public.my_in_crowd() to authenticated;
grant execute on function public.set_in_crowd_settings(text, text, text, boolean, boolean, boolean) to authenticated;
grant execute on function public.set_in_crowd_pick(uuid, boolean) to authenticated;
grant execute on function public.request_in_crowd(text, text) to authenticated;
grant execute on function public.admin_in_crowd_requests() to authenticated;
grant execute on function public.admin_decide_in_crowd(bigint, boolean, text) to authenticated;
grant execute on function public.admin_remove_in_crowd(uuid) to authenticated;
grant execute on function public.in_crowd_members() to authenticated;
