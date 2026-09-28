-- 1. Founding Members: the first 3000 (was 500).
-- 2. Outs last 6 hours unless pinned (was 1).
-- 3. Hide and mute:
--    - "Hide my posts from": people who never see your pins, My Out or plans.
--    - "Mute": you stop seeing someone's pins, My Out and plans.
--    - Each pin can also be hidden from chosen people.
--    Blocking already exists and still hides everything both ways.
-- 4. Event modes: Public (as before), Circle only (your circle, the group's
--    members and people who said I'm In), and Surprise party (hidden from the
--    guest of honor, including notifications and posts about it, until it's over).
-- 5. Places: map places found while typing become venues when picked.

-- ── 1 & 2 ───────────────────────────────────────────────────────────────────
update public.app_config set value = '3000' where key = 'founding_member_limit';
update public.app_config set value = '6', description = 'How long an Out lasts, in hours, unless someone pins it.' where key = 'out_hours';
alter table public.outs alter column expires_at set default now() + interval '6 hours';

do $$
declare src text; before text;
begin
  select pg_get_functiondef('public.send_out(text, text, uuid[], boolean, text)'::regprocedure) into src;
  before := src;
  src := replace(src, 'It disappears in an hour unless you pin it.', 'It disappears in 6 hours unless you pin it.');
  if src = before then raise exception 'send_out text not found'; end if;
  execute src;
  select pg_get_functiondef('public.out_open(bigint, uuid)'::regprocedure) into src;
  before := src;
  src := replace(src, 'Outs last an hour unless you pin them.', 'Outs last 6 hours unless you pin them.');
  if src = before then raise exception 'out_open text not found'; end if;
  execute src;
  select pg_get_functiondef('public.pin_out(bigint)'::regprocedure) into src;
  before := src;
  src := replace(src, 'They can keep looking at it after the hour is up.', 'They can keep looking at it after its 6 hours are up.');
  if src = before then raise exception 'pin_out text not found'; end if;
  execute src;
end $$;

-- ── 3. Hide and mute ────────────────────────────────────────────────────────
create table public.hidden_from (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  hidden_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, hidden_user_id),
  check (user_id <> hidden_user_id)
);
create index hidden_from_hidden_idx on public.hidden_from (hidden_user_id);

create table public.mutes (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  muted_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, muted_user_id),
  check (user_id <> muted_user_id)
);
create index mutes_muted_idx on public.mutes (muted_user_id);

create table public.pin_hidden_from (
  pin_id  bigint not null references public.pins (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (pin_id, user_id)
);
create index pin_hidden_from_user_idx on public.pin_hidden_from (user_id);

alter table public.hidden_from enable row level security;
alter table public.mutes enable row level security;
alter table public.pin_hidden_from enable row level security;
-- Only your own lists, and only through the functions below. Nobody can see
-- that you hid them or muted them.

-- Is this person's content hidden from this viewer (hidden from them, or muted by them)?
create or replace function private.post_hidden(p_owner uuid, p_viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner <> p_viewer and (
    exists (select 1 from public.hidden_from where user_id = p_owner and hidden_user_id = p_viewer)
    or exists (select 1 from public.mutes where user_id = p_viewer and muted_user_id = p_owner))
$$;

-- ── 4. Event modes ──────────────────────────────────────────────────────────
alter table public.events add column if not exists visibility text not null default 'public'
  check (visibility in ('public', 'circle'));
alter table public.events add column if not exists surprise_for uuid references public.profiles (id) on delete set null;
alter table public.events add constraint events_surprise_not_host check (surprise_for is null or surprise_for <> host_id);
create index if not exists events_surprise_idx on public.events (surprise_for) where surprise_for is not null;

-- Is this event hidden from this person? (Never from its host.)
create or replace function private.event_hidden(p_event bigint, p_viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event and e.host_id <> p_viewer
      and (
        -- Surprise: hidden from the guest of honor until it's over.
        (e.surprise_for = p_viewer and now() < coalesce(e.ends_at, e.starts_at + interval '3 hours'))
        -- Circle only: the host's circle, the group's members, and people who said I'm In.
        or (e.visibility = 'circle'
            and not private.are_connected(e.host_id, p_viewer)
            and not (e.group_id is not null and private.is_group_member(e.group_id, p_viewer))
            and not exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = p_viewer))
      ))
$$;

drop policy "events readable" on public.events;
create policy "events readable" on public.events for select to authenticated
  using (not private.is_blocked(auth.uid(), host_id) and not private.event_hidden(id, auth.uid()));

-- Nothing about a hidden event reaches the person it's hidden from (group
-- notices, shares, reminders): any notification that links to it is dropped.
create or replace function private.drop_hidden_event_notice()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.link ~ '^/events/[0-9]+' and private.event_hidden(substring(new.link from '^/events/([0-9]+)')::bigint, new.user_id) then
    return null;
  end if;
  return new;
end $$;
create trigger notifications_hidden_event before insert on public.notifications
  for each row execute function private.drop_hidden_event_notice();

-- Pins: hidden from chosen people, from people the author hides from, from
-- people who muted the author, and about events hidden from the viewer.
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
      and (p.author_id = p_viewer or (
        not private.post_hidden(p.author_id, p_viewer)
        and not exists (select 1 from public.pin_hidden_from h where h.pin_id = p.id and h.user_id = p_viewer)
        and not (p.event_id is not null and private.event_hidden(p.event_id, p_viewer))))
  )
$$;

-- My Out follows hide and mute too.
create or replace function private.can_view_story(p_viewer uuid, p_sender uuid, p_audience text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_viewer = p_sender
    or (not private.post_hidden(p_sender, p_viewer)
        and (private.are_connected(p_viewer, p_sender)
             or (p_audience = 'network' and private.degree_between(p_viewer, p_sender) = 2)))
$$;

-- Plans (and where you're going) follow hide and mute.
create or replace function private.can_see_plan(p_owner uuid, p_audience text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner = auth.uid()
    or (not private.post_hidden(p_owner, auth.uid()) and (
      p_audience = 'everyone'
      or (p_audience = 'circle' and private.are_connected(auth.uid(), p_owner))
      or (p_audience = 'network' and private.degree_between(auth.uid(), p_owner) in (1, 2))))
$$;

-- "You're there" follows hide and mute too.
create or replace function private.can_see_here(p_post bigint, p_owner uuid, p_audience text, p_degree smallint)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner = auth.uid()
    or (not private.post_hidden(p_owner, auth.uid()) and (
      (p_audience = 'circle' and p_degree = 1)
      or (p_audience = 'network' and p_degree in (1, 2))
      or (p_audience = 'custom' and exists (select 1 from public.going_out_viewers v where v.post_id = p_post and v.user_id = auth.uid()))))
$$;

-- Apply event visibility wherever events and plans are listed.
do $$
declare
  src text; before text; i int;
  fns text[] := array[
    'public.event_detail(bigint)',
    'public.going_out_feed(text, double precision, double precision, numeric)',
    'public.going_out_feed(text, double precision, double precision, numeric)',
    'public.home_feed(text, double precision, double precision)',
    'public.venue_detail(bigint)',
    'public.whats_in(double precision, double precision, double precision)',
    'public.tonight_pick()',
    'public.group_detail(bigint)',
    'public.my_group_events()',
    'public.tonight_network()',
    'public.profile_card(uuid)'];
  olds text[] := array[
    'ev.id is null or private.is_blocked(auth.uid(), ev.host_id) then null',
    'not private.is_blocked(auth.uid(), ev.host_id)',
    'private.can_see_plan(g.user_id, g.audience)',
    'not private.is_blocked(auth.uid(), ev.host_id)',
    'not private.is_blocked(auth.uid(), ev.host_id)',
    'not private.is_blocked(auth.uid(), ev.host_id)',
    'not private.is_blocked(auth.uid(), e.host_id)',
    'where ev.group_id = g.id and ev.starts_at > now() - interval ''3 hours''',
    'where ev.starts_at > now() - interval ''3 hours'' and ev.starts_at < now() + interval ''14 days''',
    'private.can_see_plan(g.user_id, g.audience)',
    'private.can_see_plan(g.user_id, g.audience)'];
  news text[] := array[
    'ev.id is null or private.is_blocked(auth.uid(), ev.host_id) or private.event_hidden(ev.id, auth.uid()) then null',
    'not private.is_blocked(auth.uid(), ev.host_id) and not private.event_hidden(ev.id, auth.uid())',
    'private.can_see_plan(g.user_id, g.audience) and not private.event_hidden(g.event_id, auth.uid())',
    'not private.is_blocked(auth.uid(), ev.host_id) and not private.event_hidden(ev.id, auth.uid())',
    'not private.is_blocked(auth.uid(), ev.host_id) and not private.event_hidden(ev.id, auth.uid())',
    'not private.is_blocked(auth.uid(), ev.host_id) and not private.event_hidden(ev.id, auth.uid())',
    'not private.is_blocked(auth.uid(), e.host_id) and not private.event_hidden(e.id, auth.uid())',
    'where ev.group_id = g.id and not private.event_hidden(ev.id, auth.uid()) and ev.starts_at > now() - interval ''3 hours''',
    'where not private.event_hidden(ev.id, auth.uid()) and ev.starts_at > now() - interval ''3 hours'' and ev.starts_at < now() + interval ''14 days''',
    'private.can_see_plan(g.user_id, g.audience) and not private.event_hidden(g.event_id, auth.uid())',
    'private.can_see_plan(g.user_id, g.audience) and not private.event_hidden(g.event_id, auth.uid())'];
begin
  for i in 1 .. array_length(fns, 1) loop
    select pg_get_functiondef(fns[i]::regprocedure) into src;
    before := src;
    src := replace(src, olds[i], news[i]);
    if src = before then raise exception 'Could not add event visibility to % (%)', fns[i], olds[i]; end if;
    execute src;
  end loop;
  -- The event page tells guests who the surprise is for, and the host which mode it's in.
  select pg_get_functiondef('public.event_detail(bigint)'::regprocedure) into src;
  before := src;
  src := replace(src, '''is_host'', ev.host_id = auth.uid(),',
    '''is_host'', ev.host_id = auth.uid(), ''visibility'', ev.visibility,
    ''surprise_for'', (select jsonb_build_object(''id'', sp.id, ''display_name'', sp.display_name) from public.profiles sp where sp.id = ev.surprise_for),');
  if src = before then raise exception 'Could not add event mode to event_detail'; end if;
  execute src;
end $$;

-- Create an event with its mode, so nothing leaks before the mode is set.
drop function if exists public.create_event(text, timestamptz, bigint, text, text, integer, bigint, numeric, text, double precision, double precision);
create or replace function public.create_event(
  p_title text, p_starts_at timestamptz, p_venue_id bigint default null, p_emoji text default null,
  p_description text default '', p_capacity integer default null, p_group bigint default null, p_duration_hours numeric default 3,
  p_place text default null, p_lat double precision default null, p_lng double precision default null,
  p_visibility text default 'public', p_surprise_for uuid default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id bigint;
  loc extensions.geography;
begin
  if coalesce(trim(p_title), '') = '' then raise exception 'Give your event a name.' using errcode = 'check_violation'; end if;
  if p_starts_at < now() - interval '30 minutes' then raise exception 'Pick a time that hasn''t passed.' using errcode = 'check_violation'; end if;
  if p_group is not null and not private.is_group_admin(p_group, me) then
    raise exception 'Only group admins can post group events.' using errcode = 'insufficient_privilege';
  end if;
  if p_starts_at > now() + interval '90 days' then raise exception 'Events can be up to 90 days ahead.' using errcode = 'check_violation'; end if;
  if coalesce(p_visibility, 'public') not in ('public', 'circle') then raise exception 'Choose Public or Circle only.' using errcode = 'check_violation'; end if;
  if p_surprise_for = me then raise exception 'You can''t throw yourself a surprise party.' using errcode = 'check_violation'; end if;
  loc := coalesce((select location from public.venues where id = p_venue_id),
                  case when p_lat is not null and p_lng is not null then public.snap_location(p_lng, p_lat) end,
                  (select approx_location from public.profiles where id = me));
  insert into public.events (host_id, group_id, venue_id, place_text, approx_location, title, emoji, description, starts_at, ends_at, capacity,
                             visibility, surprise_for)
  values (me, p_group, p_venue_id, case when p_venue_id is null then nullif(trim(p_place), '') end, loc, trim(p_title), nullif(p_emoji, ''),
          coalesce(p_description, ''), p_starts_at,
          p_starts_at + make_interval(mins => (coalesce(p_duration_hours, 3) * 60)::int), p_capacity,
          coalesce(p_visibility, 'public'), p_surprise_for)
  returning id into new_id;
  insert into public.event_rsvps (event_id, user_id) values (new_id, me);
  -- Group events: tell the members (the guest of honor's notice is dropped automatically).
  if p_group is not null then
    insert into public.notifications (user_id, kind, title, body, actor_id, link)
    select m.user_id, 'group_event', (select name from public.groups where id = p_group) || ': ' || trim(p_title),
           to_char(p_starts_at at time zone 'America/New_York', 'Dy Mon DD, HH12:MI AM'), me, '/events/' || new_id
    from public.group_members m where m.group_id = p_group and m.user_id <> me;
  end if;
  return new_id;
end $$;

-- Change the mode later.
create or replace function public.set_event_mode(p_event bigint, p_visibility text, p_surprise_for uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare ev public.events;
begin
  select * into ev from public.events where id = p_event and host_id = auth.uid();
  if ev.id is null then raise exception 'That''s not your event.' using errcode = 'insufficient_privilege'; end if;
  if p_visibility not in ('public', 'circle') then raise exception 'Choose Public or Circle only.' using errcode = 'check_violation'; end if;
  if p_surprise_for = auth.uid() then raise exception 'You can''t throw yourself a surprise party.' using errcode = 'check_violation'; end if;
  if p_surprise_for is not null and exists (select 1 from public.event_rsvps where event_id = p_event and user_id = p_surprise_for) then
    raise exception '% already said I''m In, so it wouldn''t be a surprise.', (select display_name from public.profiles where id = p_surprise_for)
      using errcode = 'check_violation';
  end if;
  update public.events set visibility = p_visibility, surprise_for = p_surprise_for where id = p_event;
end $$;

-- The guest of honor can't say I'm In to their own surprise (even with the link).
create or replace function private.rsvp_hidden_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.event_hidden(new.event_id, new.user_id) then
    raise exception 'Event not found.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger event_rsvps_hidden_check before insert on public.event_rsvps
  for each row execute function private.rsvp_hidden_check();

-- ── Hide / mute functions ──────────────────────────────────────────────────
create or replace function public.set_hidden_from(p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_user = auth.uid() then raise exception 'Pick someone else.' using errcode = 'check_violation'; end if;
  if p_on then insert into public.hidden_from (user_id, hidden_user_id) values (auth.uid(), p_user) on conflict do nothing;
  else delete from public.hidden_from where user_id = auth.uid() and hidden_user_id = p_user; end if;
end $$;

create or replace function public.set_muted(p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_user = auth.uid() then raise exception 'Pick someone else.' using errcode = 'check_violation'; end if;
  if p_on then insert into public.mutes (user_id, muted_user_id) values (auth.uid(), p_user) on conflict do nothing;
  else delete from public.mutes where user_id = auth.uid() and muted_user_id = p_user; end if;
end $$;

-- What I've set for one person (for their profile menu).
create or replace function public.person_privacy(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'blocked', exists (select 1 from public.blocks where blocker_id = auth.uid() and blocked_id = p_user),
    'muted', exists (select 1 from public.mutes where user_id = auth.uid() and muted_user_id = p_user),
    'hidden', exists (select 1 from public.hidden_from where user_id = auth.uid() and hidden_user_id = p_user))
$$;

-- Everyone I hid my posts from or muted (Settings → Hidden and muted).
create or replace function public.my_hidden_and_muted()
returns table (user_id uuid, display_name text, avatar_url text, hidden boolean, muted boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar_url,
         exists (select 1 from public.hidden_from h where h.user_id = auth.uid() and h.hidden_user_id = p.id),
         exists (select 1 from public.mutes m where m.user_id = auth.uid() and m.muted_user_id = p.id)
  from public.profiles p
  where p.id in (select hidden_user_id from public.hidden_from where user_id = auth.uid()
                 union select muted_user_id from public.mutes where user_id = auth.uid())
  order by p.display_name
$$;

-- Hide one pin from chosen people (replaces the list).
create or replace function public.set_pin_hidden_from(p_pin bigint, p_users uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not exists (select 1 from public.pins where id = p_pin and author_id = auth.uid()) then
    raise exception 'That''s not your pin.' using errcode = 'insufficient_privilege';
  end if;
  delete from public.pin_hidden_from where pin_id = p_pin;
  insert into public.pin_hidden_from (pin_id, user_id)
  select p_pin, u from unnest(coalesce(p_users, '{}')) u where u <> auth.uid() on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ── 5. Places → venues ─────────────────────────────────────────────────────
-- A place picked from the map search becomes a venue (once), so events,
-- ratings and "who's here" work for it.
alter table public.venues add column if not exists osm_id text unique;

create or replace function public.venue_from_place(p_osm text, p_name text, p_lat double precision, p_lng double precision,
                                                   p_address text default null, p_neighborhood text default null, p_category text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare vid bigint; glyph text;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if p_osm !~ '^[NWR][0-9]{1,15}$' then raise exception 'Unknown place.' using errcode = 'check_violation'; end if;
  if char_length(coalesce(trim(p_name), '')) not between 1 and 120 or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Unknown place.' using errcode = 'check_violation';
  end if;
  select id into vid from public.venues where osm_id = p_osm;
  if vid is not null then return vid; end if;
  glyph := case
    when p_category in ('restaurant', 'fast_food', 'food_court') then 'dinner'
    when p_category in ('bar', 'pub', 'biergarten') then 'drinks'
    when p_category in ('wine_bar') then 'wine'
    when p_category in ('cafe', 'coffee_shop') then 'coffee'
    when p_category in ('nightclub', 'music_venue', 'theatre', 'arts_centre', 'concert_hall') then 'music'
    when p_category in ('park', 'garden', 'beach', 'nature_reserve', 'playground') then 'outdoors'
    when p_category in ('fitness_centre', 'sports_centre', 'gym', 'pitch', 'stadium') then 'fitness'
    else 'pin' end;
  insert into public.venues (name, emoji, address, neighborhood, location, category, osm_id)
  values (trim(p_name), glyph, nullif(trim(p_address), ''), nullif(trim(p_neighborhood), ''),
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
          nullif(trim(p_category), ''), p_osm)
  on conflict (osm_id) do update set name = excluded.name
  returning id into vid;
  return vid;
end $$;

-- Server only (place-search): where to center a search when the phone didn't
-- send a location: the member's approximate area, or their city.
create or replace function public.search_origin(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('lat', extensions.st_y(g::extensions.geometry), 'lng', extensions.st_x(g::extensions.geometry))
  from (select coalesce(p.approx_location, c.center) as g
        from public.profiles p left join public.cities c on c.id = p.city_id where p.id = p_user) x
  where g is not null
$$;
revoke execute on function public.search_origin(uuid) from public, anon, authenticated;
grant execute on function public.search_origin(uuid) to service_role;

-- ── Grants ─────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.set_hidden_from(uuid, boolean)', 'public.set_muted(uuid, boolean)', 'public.person_privacy(uuid)',
    'public.my_hidden_and_muted()', 'public.set_pin_hidden_from(bigint, uuid[])', 'public.set_event_mode(bigint, text, uuid)',
    'public.create_event(text, timestamptz, bigint, text, text, integer, bigint, numeric, text, double precision, double precision, text, uuid)',
    'public.venue_from_place(text, text, double precision, double precision, text, text, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Used by policies and triggers as the signed-in member.
  foreach f in array array['private.event_hidden(bigint, uuid)', 'private.post_hidden(uuid, uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
