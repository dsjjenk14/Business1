-- I'm In: 012 Going out (Phase 4)
-- Tonight / This Weekend feeds, going-out posts, events (host, RSVP with
-- capacity, event check-in, recap), venues, groups (create, invite, join,
-- request, approve) and group chat kept in sync with membership.

insert into public.app_config (key, value, description) values
  ('group_create_requires', '"phone"', 'What a member needs before creating a group: "none", "phone" (verified phone) or "photo" (photo verification).'),
  ('tonight_radius_max_mi', '75', 'Max radius on the Tonight slider (also capped by the plan''s search radius).')
on conflict (key) do nothing;

-- ── Weekend window helpers (DC time) ──────────────────────────────────────
-- "This weekend" = from now until Sunday 11:59 PM (DC time).
create or replace function public.weekend_ends_at()
returns timestamptz language sql stable set search_path = '' as $$
  select ((date_trunc('week', (now() at time zone 'America/New_York')) + interval '6 days 23 hours 59 minutes'))
         at time zone 'America/New_York'
$$;

-- ── Going-out posts (Tonight / This Weekend / a specific time) ────────────
-- Other people's posts are read through going_out_feed(), which applies the
-- "show my venue" setting; the table itself only shows you your own.
drop policy "going-out posts visible" on public.going_out_posts;
create policy "own going-out posts" on public.going_out_posts for select to authenticated
  using (user_id = auth.uid());

create or replace function public.post_going_out(
  p_when public.going_out_when, p_starts_at timestamptz default null,
  p_venue_id bigint default null, p_place text default null, p_vibes text[] default '{}',
  p_note text default null, p_lat double precision default null, p_lng double precision default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  starts timestamptz := coalesce(p_starts_at, now());
  ends timestamptz;
  post_id bigint;
  place text;
  loc extensions.geography;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if starts < now() - interval '1 hour' then raise exception 'Pick a time that hasn''t passed.' using errcode = 'check_violation'; end if;
  if p_when = 'weekend' and starts > public.weekend_ends_at() then
    raise exception 'That''s after this weekend. Pick a specific time instead.' using errcode = 'check_violation';
  end if;
  if starts > now() + interval '14 days' then raise exception 'Going-out plans can be up to 2 weeks ahead.' using errcode = 'check_violation'; end if;

  ends := case p_when
    when 'tonight' then public.tonight_ends_at()
    when 'weekend' then greatest(public.weekend_ends_at(), starts + interval '4 hours')
    else starts + interval '6 hours' end;

  -- One "tonight" plan at a time: replace an earlier one.
  if p_when = 'tonight' then perform public.end_live(); end if;

  if p_lat is not null and p_lng is not null then loc := public.snap_location(p_lng, p_lat); end if;
  insert into public.going_out_posts (user_id, when_kind, starts_at, expires_at, venue_id, place_text, approx_location, vibes, note, is_priority)
  values (me, p_when, starts, ends, p_venue_id, nullif(trim(p_place), ''), loc, coalesce(p_vibes, '{}'),
          nullif(trim(p_note), ''), public.plan_limit(me, 'tonight_priority') = 1)
  returning id into post_id;

  select coalesce(v.name, nullif(trim(p_place), '')) into place from (select 1) x left join public.venues v on v.id = p_venue_id;
  insert into public.pins (author_id, category, body, audience, approx_location, place_label, venue_id, going_out_post_id)
  values (me, 'going_out',
          coalesce(nullif(trim(p_note), ''),
            case p_when when 'tonight' then 'Going out tonight' when 'weekend' then 'Going out this weekend' else 'Going out' end
            || coalesce(' · ' || place, '') || '. Come find me.'),
          case when public.shows_in_nearby(me) then 'everyone' else 'network' end::public.pin_audience,
          loc, place, p_venue_id, post_id);
  return post_id;
end $$;

-- Keep Go Live (Home button) working through the same path.
create or replace function public.go_live(
  p_place text default null, p_venue_id bigint default null, p_vibes text[] default '{}',
  p_note text default null, p_lat double precision default null, p_lng double precision default null)
returns bigint language sql security definer set search_path = '' as $$
  select public.post_going_out('tonight', now(), p_venue_id, p_place, p_vibes, p_note, p_lat, p_lng)
$$;

create or replace function public.delete_going_out(p_post bigint)
returns void language sql security definer set search_path = '' as $$
  delete from public.going_out_posts where id = p_post and user_id = auth.uid()
$$;

-- ── Tonight / This Weekend feed ───────────────────────────────────────────
-- People going out and events, within the member's radius (plan-capped).
create or replace function public.going_out_feed(
  p_when text, p_lat double precision default null, p_lng double precision default null, p_radius_mi numeric default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with origin as (
    select coalesce(
      case when p_lat is not null and p_lng is not null then public.snap_location(p_lng, p_lat) end,
      (select approx_location from public.profiles where id = auth.uid())) as g
  ),
  radius as (
    select least(public.effective_radius_mi(p_radius_mi, 'search_radius_mi'), public.config_num('tonight_radius_max_mi')) * 1609.344 as m
  ),
  win as (
    select case when p_when = 'weekend' then now() else now() - interval '3 hours' end as from_at,
           case when p_when = 'weekend' then public.weekend_ends_at() else public.tonight_ends_at() end as to_at
  ),
  network as (
    select f as id, 1::smallint as degree from private.first_degree_ids(auth.uid()) f
    union select user_id, 2::smallint from private.second_degree(auth.uid())
  )
  select jsonb_build_object(
    'radius_mi', round((select m from radius) / 1609.344),
    'people', coalesce((
      select jsonb_agg(x order by (x->>'is_me')::boolean desc, (x->>'is_priority')::boolean desc, (x->>'degree')::int, x->>'starts_at') from (
        select distinct on (g.user_id) jsonb_build_object(
          'post_id', g.id, 'user_id', g.user_id, 'display_name', p.display_name, 'avatar_emoji', p.avatar_emoji, 'avatar_url', p.avatar_url,
          'vouch_count', public.visible_vouch_count(g.user_id), 'degree', coalesce(n.degree, 3), 'is_me', g.user_id = auth.uid(),
          'place', case when public.shows_going_out_venue(g.user_id) then coalesce(v.name, g.place_text) end,
          'neighborhood', case when public.shows_going_out_venue(g.user_id) then v.neighborhood end,
          'venue_id', case when public.shows_going_out_venue(g.user_id) then g.venue_id end,
          'starts_at', g.starts_at, 'when_kind', g.when_kind, 'vibes', g.vibes, 'note', g.note,
          'is_hosting', g.is_hosting, 'event_id', g.event_id, 'is_priority', g.is_priority,
          'distance_mi', case when (select g from origin) is not null and g.approx_location is not null
                              then round((extensions.st_distance(g.approx_location, (select g from origin)) / 1609.344)::numeric, 1) end,
          'lat', extensions.st_y(g.approx_location::extensions.geometry), 'lng', extensions.st_x(g.approx_location::extensions.geometry)
        ) as x
        from public.going_out_posts g
        join public.profiles p on p.id = g.user_id
        left join public.venues v on v.id = g.venue_id
        left join network n on n.id = g.user_id
        where g.expires_at > now()
          and g.starts_at <= (select to_at from win)
          -- Tonight: tonight posts and anything starting before tonight ends.
          -- Weekend: weekend posts and scheduled plans after tonight.
          and case when p_when = 'weekend'
                   then g.when_kind = 'weekend' or (g.when_kind = 'scheduled' and g.starts_at > public.tonight_ends_at())
                   else g.when_kind = 'tonight' or (g.when_kind = 'scheduled' and g.starts_at <= public.tonight_ends_at()) end
          and (g.user_id = auth.uid() or (public.shows_in_nearby(g.user_id) and not private.is_blocked(auth.uid(), g.user_id)))
          and (g.user_id = auth.uid() or n.id is not null
               or (g.approx_location is not null and extensions.st_dwithin(g.approx_location, (select g from origin), (select m from radius))))
        order by g.user_id, g.starts_at
      ) q), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(e order by e->>'starts_at') from (
        select jsonb_build_object(
          'id', ev.id, 'title', ev.title, 'emoji', ev.emoji, 'starts_at', ev.starts_at, 'ends_at', ev.ends_at,
          'host_id', ev.host_id, 'host_name', h.display_name, 'venue_id', ev.venue_id, 'venue_name', v.name, 'neighborhood', v.neighborhood,
          'group_id', ev.group_id, 'group_name', gr.name, 'capacity', ev.capacity,
          'going_count', (select count(*) from public.event_rsvps r where r.event_id = ev.id),
          'network_going', (select count(*) from public.event_rsvps r where r.event_id = ev.id and r.user_id in (select id from network)),
          'i_am_going', exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid()),
          'distance_mi', case when (select g from origin) is not null and v.location is not null
                              then round((extensions.st_distance(v.location, (select g from origin)) / 1609.344)::numeric, 1) end,
          'lat', extensions.st_y(v.location::extensions.geometry), 'lng', extensions.st_x(v.location::extensions.geometry)
        ) as e
        from public.events ev
        join public.profiles h on h.id = ev.host_id
        left join public.venues v on v.id = ev.venue_id
        left join public.groups gr on gr.id = ev.group_id
        where ev.starts_at between (select from_at from win) and (select to_at from win)
          and (p_when <> 'weekend' or ev.starts_at > public.tonight_ends_at())
          and (p_when <> 'weekend' or not ev.is_recurring)          -- decision B9: recurring group events live under Groups
          and not private.is_blocked(auth.uid(), ev.host_id)
          and (ev.venue_id is null or extensions.st_dwithin(v.location, (select g from origin), (select m from radius))
               or ev.host_id in (select id from network) or ev.host_id = auth.uid())
      ) q), '[]'::jsonb)
  )
$$;

-- Upcoming events for groups you're in (Tonight → Groups).
create or replace function public.my_group_events()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', ev.id, 'title', ev.title, 'emoji', ev.emoji, 'starts_at', ev.starts_at, 'group_id', gr.id, 'group_name', gr.name,
      'venue_name', v.name, 'going_count', (select count(*) from public.event_rsvps r where r.event_id = ev.id),
      'i_am_going', exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid()))
    order by ev.starts_at), '[]'::jsonb)
  from public.events ev
  join public.groups gr on gr.id = ev.group_id
  left join public.venues v on v.id = ev.venue_id
  where ev.starts_at > now() - interval '3 hours' and ev.starts_at < now() + interval '14 days'
    and exists (select 1 from public.group_members m where m.group_id = gr.id and m.user_id = auth.uid())
$$;

-- ── Venues ────────────────────────────────────────────────────────────────
create or replace function public.search_venues(p_query text default '', p_lat double precision default null, p_lng double precision default null)
returns table (id bigint, name text, emoji text, neighborhood text, category text, distance_mi numeric)
language sql stable security definer set search_path = '' as $$
  with origin as (
    select coalesce(case when p_lat is not null then public.snap_location(p_lng, p_lat) end,
                    (select approx_location from public.profiles where id = auth.uid())) as g)
  select v.id, v.name, v.emoji, v.neighborhood, v.category,
         case when (select g from origin) is not null then round((extensions.st_distance(v.location, (select g from origin)) / 1609.344)::numeric, 1) end
  from public.venues v
  where coalesce(trim(p_query), '') = '' or v.name ilike '%' || trim(p_query) || '%' or v.neighborhood ilike '%' || trim(p_query) || '%'
  order by extensions.st_distance(v.location, (select g from origin)) nulls last, v.name
  limit 20
$$;

create or replace function public.venue_detail(p_venue bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  with network as (select f as id from private.first_degree_ids(auth.uid()) f union select user_id from private.second_degree(auth.uid()))
  select jsonb_build_object(
    'id', v.id, 'name', v.name, 'emoji', v.emoji, 'address', v.address, 'neighborhood', v.neighborhood,
    'category', v.category, 'price_level', v.price_level, 'description', v.description,
    'lat', extensions.st_y(v.location::extensions.geometry), 'lng', extensions.st_x(v.location::extensions.geometry),
    -- "14 of your network have been here": people you know with a GPS meetup at this venue.
    'network_visited', (select count(distinct u) from (
        select e.user_a as u from public.encounters e where e.venue_id = v.id
        union select e.user_b from public.encounters e where e.venue_id = v.id) x where u in (select id from network)),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'title', ev.title, 'emoji', ev.emoji, 'starts_at', ev.starts_at,
                  'host_name', (select display_name from public.profiles where id = ev.host_id),
                  'going_count', (select count(*) from public.event_rsvps r where r.event_id = ev.id), 'capacity', ev.capacity)
                  order by ev.starts_at)
                from public.events ev where ev.venue_id = v.id and ev.starts_at > now() - interval '3 hours'
                  and ev.starts_at < now() + interval '14 days' and not private.is_blocked(auth.uid(), ev.host_id)), '[]'::jsonb)
  )
  from public.venues v where v.id = p_venue
$$;

-- ── Events ────────────────────────────────────────────────────────────────
create or replace function public.create_event(
  p_title text, p_starts_at timestamptz, p_venue_id bigint default null, p_emoji text default null,
  p_description text default '', p_capacity integer default null, p_group bigint default null, p_duration_hours numeric default 3)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id bigint;
begin
  if coalesce(trim(p_title), '') = '' then raise exception 'Give your event a name.' using errcode = 'check_violation'; end if;
  if p_starts_at < now() - interval '30 minutes' then raise exception 'Pick a time that hasn''t passed.' using errcode = 'check_violation'; end if;
  if p_group is not null and not private.is_group_admin(p_group, me) then
    raise exception 'Only group admins can post group events.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.events (host_id, group_id, venue_id, title, emoji, description, starts_at, ends_at, capacity)
  values (me, p_group, p_venue_id, trim(p_title), nullif(p_emoji, ''), coalesce(p_description, ''), p_starts_at,
          p_starts_at + make_interval(mins => (coalesce(p_duration_hours, 3) * 60)::int), p_capacity)
  returning id into new_id;
  insert into public.event_rsvps (event_id, user_id) values (new_id, me);
  -- Group events: tell the members.
  if p_group is not null then
    insert into public.notifications (user_id, kind, title, body, actor_id, link)
    select m.user_id, 'group_event', (select name from public.groups where id = p_group) || ': ' || trim(p_title),
           to_char(p_starts_at at time zone 'America/New_York', 'Dy Mon DD, HH12:MI AM'), me, '/events/' || new_id
    from public.group_members m where m.group_id = p_group and m.user_id <> me;
  end if;
  return new_id;
end $$;

-- RSVPs respect capacity.
create or replace function public.rsvp_capacity_check()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cap int; going int;
begin
  select capacity into cap from public.events where id = new.event_id;
  if cap is not null then
    select count(*) into going from public.event_rsvps where event_id = new.event_id;
    if going >= cap then raise exception 'This event is full.' using errcode = 'check_violation'; end if;
  end if;
  return new;
end $$;
create trigger event_rsvps_capacity before insert on public.event_rsvps
  for each row execute function public.rsvp_capacity_check();

create or replace function public.event_detail(p_event bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  with network as (select f as id, 1 as degree from private.first_degree_ids(auth.uid()) f
                   union select user_id, 2 from private.second_degree(auth.uid()))
  select case when ev.id is null or private.is_blocked(auth.uid(), ev.host_id) then null else jsonb_build_object(
    'id', ev.id, 'title', ev.title, 'emoji', ev.emoji, 'description', ev.description,
    'starts_at', ev.starts_at, 'ends_at', ev.ends_at, 'capacity', ev.capacity, 'is_recurring', ev.is_recurring,
    'host', jsonb_build_object('id', h.id, 'display_name', h.display_name, 'avatar_emoji', h.avatar_emoji, 'avatar_url', h.avatar_url,
                               'vouch_count', public.visible_vouch_count(h.id)),
    'is_host', ev.host_id = auth.uid(),
    'venue', case when v.id is null then null else jsonb_build_object('id', v.id, 'name', v.name, 'address', v.address, 'neighborhood', v.neighborhood) end,
    'group', case when gr.id is null then null else jsonb_build_object('id', gr.id, 'name', gr.name, 'emoji', gr.emoji) end,
    'i_am_going', exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid()),
    'going_count', (select count(*) from public.event_rsvps r where r.event_id = ev.id),
    'going', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_emoji', p.avatar_emoji,
                         'avatar_url', p.avatar_url, 'degree', coalesce(n.degree, case when p.id = auth.uid() then 0 else 3 end))
                       order by coalesce(n.degree, case when p.id = auth.uid() then 0 else 3 end), p.vouch_count desc)
                     from public.event_rsvps r join public.profiles p on p.id = r.user_id left join network n on n.id = p.id
                     where r.event_id = ev.id and not private.is_blocked(auth.uid(), p.id)), '[]'::jsonb),
    'has_recap', exists (select 1 from public.pins pn where pn.event_id = ev.id and pn.category = 'recap' and pn.author_id = auth.uid() and pn.deleted_at is null)
  ) end
  from (select p_event as id0) z
  left join public.events ev on ev.id = z.id0
  left join public.profiles h on h.id = ev.host_id
  left join public.venues v on v.id = ev.venue_id
  left join public.groups gr on gr.id = ev.group_id
$$;

-- Check in at an event: same as a normal check-in, tagged with the event
-- (so the meetup says where it happened). Allowed from 1 hour before start
-- until 3 hours after the end, for people who RSVP'd.
create or replace function public.event_check_in(p_event bigint, p_lat double precision, p_lng double precision, p_accuracy_m real default null)
returns table (encounter_id bigint, user_id uuid, display_name text, avatar_emoji text, avatar_url text,
               vouch_count integer, degree smallint, place_label text, met_at timestamptz, already_vouched boolean)
language plpgsql security definer set search_path = '' as $$
declare ev public.events;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null then raise exception 'Event not found.' using errcode = 'check_violation'; end if;
  if now() < ev.starts_at - interval '1 hour' or now() > coalesce(ev.ends_at, ev.starts_at + interval '3 hours') + interval '3 hours' then
    raise exception 'Check-in opens an hour before the event starts.' using errcode = 'check_violation';
  end if;
  return query select * from public.check_in(p_lat, p_lng, p_accuracy_m, ev.venue_id, ev.id);
end $$;

-- ── Groups ────────────────────────────────────────────────────────────────
create table public.group_invites (
  group_id   bigint not null references public.groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.group_invites enable row level security;
create policy "see own invites" on public.group_invites for select to authenticated
  using (user_id = auth.uid() or private.is_group_admin(group_id, auth.uid()));

create or replace function private.can_create_group(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case (select value #>> '{}' from public.app_config where key = 'group_create_requires')
    when 'none' then true
    when 'photo' then exists (select 1 from public.profiles where id = p_user and photo_verified_at is not null)
    else exists (select 1 from public.profile_private where id = p_user and phone_verified_at is not null)
         or exists (select 1 from public.profiles where id = p_user and photo_verified_at is not null)
  end
$$;

-- The Phase 1 insert policy required photo verification; creation now goes
-- through create_group(), which uses the configurable rule above.
drop policy "verified members create groups" on public.groups;

create or replace function public.create_group(
  p_name text, p_category text, p_description text default '', p_join_type public.join_type default 'request',
  p_emoji text default null, p_schedule text default null, p_invite uuid[] default '{}')
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id bigint;
  u uuid;
begin
  if not private.can_create_group(me) then
    raise exception 'Verify your phone number first (Settings → Verify phone). It keeps groups trustworthy.' using errcode = 'check_violation';
  end if;
  if char_length(coalesce(trim(p_name), '')) < 2 then raise exception 'Give your group a name.' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.groups where lower(name) = lower(trim(p_name))) then
    raise exception 'A group with that name already exists.' using errcode = 'check_violation';
  end if;
  insert into public.groups (name, emoji, category, description, join_type, owner_id, city_id, schedule_label)
  values (trim(p_name), coalesce(nullif(p_emoji, ''), '✨'), p_category, coalesce(trim(p_description), ''), p_join_type, me,
          (select city_id from public.profiles where id = me), nullif(trim(p_schedule), ''))
  returning id into new_id;
  insert into public.group_members (group_id, user_id, role) values (new_id, me, 'owner');

  -- Invite founding members (people from your circle).
  foreach u in array coalesce(p_invite, '{}') loop
    if private.are_connected(me, u) then
      insert into public.group_invites (group_id, user_id, invited_by) values (new_id, u, me) on conflict do nothing;
      perform private.notify(u, 'group_invite', (select display_name from public.profiles where id = me) || ' invited you to ' || trim(p_name),
        'Join as a founding member.', me, '/groups/' || new_id);
    end if;
  end loop;
  return new_id;
end $$;

-- Join: open groups and invitations join instantly.
create or replace function public.join_group(p_group bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); g public.groups;
begin
  select * into g from public.groups where id = p_group;
  if g.id is null then raise exception 'Group not found.' using errcode = 'check_violation'; end if;
  if private.is_group_member(p_group, me) then return 'member'; end if;
  if g.join_type = 'open' or exists (select 1 from public.group_invites where group_id = p_group and user_id = me) then
    insert into public.group_members (group_id, user_id) values (p_group, me);
    delete from public.group_invites where group_id = p_group and user_id = me;
    return 'joined';
  end if;
  raise exception 'This group reviews each member. Send a join request.' using errcode = 'check_violation';
end $$;

create or replace function public.request_join_group(p_group bigint, p_why text, p_how text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); new_id bigint;
begin
  if private.is_group_member(p_group, me) then raise exception 'You''re already a member.' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.group_join_requests where group_id = p_group and user_id = me and status = 'pending') then
    raise exception 'Your request is already waiting.' using errcode = 'check_violation';
  end if;
  insert into public.group_join_requests (group_id, user_id, why, how_found)
  values (p_group, me, coalesce(trim(p_why), ''), p_how) returning id into new_id;
  insert into public.notifications (user_id, kind, title, body, actor_id, link)
  select m.user_id, 'group_request', (select display_name from public.profiles where id = me) || ' wants to join ' || (select name from public.groups where id = p_group),
         left(coalesce(trim(p_why), ''), 140), me, '/groups/' || p_group
  from public.group_members m where m.group_id = p_group and m.role in ('owner', 'admin');
  return new_id;
end $$;

create or replace function public.review_join_request(p_request bigint, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.group_join_requests;
begin
  select * into r from public.group_join_requests where id = p_request and status = 'pending';
  if r.id is null or not private.is_group_admin(r.group_id, auth.uid()) then
    raise exception 'That request isn''t available.' using errcode = 'check_violation';
  end if;
  update public.group_join_requests set status = case when p_approve then 'accepted' else 'declined' end::public.request_status,
         reviewed_by = auth.uid() where id = p_request;
  if p_approve then
    insert into public.group_members (group_id, user_id) values (r.group_id, r.user_id) on conflict do nothing;
    perform private.notify(r.user_id, 'group_joined', 'You''re in: ' || (select name from public.groups where id = r.group_id),
      'Say hi in the group chat.', auth.uid(), '/groups/' || r.group_id);
  end if;
end $$;

create or replace function public.leave_group(p_group bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.groups where id = p_group and owner_id = auth.uid()) then
    raise exception 'Owners can''t leave their group yet. Hand it to another member first.' using errcode = 'check_violation';
  end if;
  delete from public.group_members where group_id = p_group and user_id = auth.uid();
end $$;

create or replace function public.group_detail(p_group bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  with circle as (select f as id from private.first_degree_ids(auth.uid()) f)
  select case when g.id is null then null else jsonb_build_object(
    'id', g.id, 'name', g.name, 'emoji', g.emoji, 'category', g.category, 'description', g.description,
    'join_type', g.join_type, 'schedule_label', g.schedule_label,
    'owner', (select jsonb_build_object('id', p.id, 'display_name', p.display_name) from public.profiles p where p.id = g.owner_id),
    'member_count', (select count(*) from public.group_members m where m.group_id = g.id),
    'my_role', (select role from public.group_members m where m.group_id = g.id and m.user_id = auth.uid()),
    'invited', exists (select 1 from public.group_invites i where i.group_id = g.id and i.user_id = auth.uid()),
    'requested', exists (select 1 from public.group_join_requests r where r.group_id = g.id and r.user_id = auth.uid() and r.status = 'pending'),
    'conversation_id', case when private.is_group_member(g.id, auth.uid()) then (select id from public.conversations c where c.group_id = g.id) end,
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_emoji', p.avatar_emoji,
                   'avatar_url', p.avatar_url, 'role', m.role, 'vouch_count', public.visible_vouch_count(p.id),
                   'in_circle', p.id in (select id from circle))
                 order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, (p.id in (select id from circle)) desc, p.vouch_count desc)
               from public.group_members m join public.profiles p on p.id = m.user_id
               where m.group_id = g.id and not private.is_blocked(auth.uid(), p.id)), '[]'::jsonb),
    'next_event', (select jsonb_build_object('id', ev.id, 'title', ev.title, 'starts_at', ev.starts_at,
                     'venue_name', (select name from public.venues where id = ev.venue_id),
                     'going_count', (select count(*) from public.event_rsvps r where r.event_id = ev.id),
                     'i_am_going', exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid()))
                   from public.events ev where ev.group_id = g.id and ev.starts_at > now() - interval '3 hours' order by ev.starts_at limit 1),
    'pending_requests', case when private.is_group_admin(g.id, auth.uid()) then coalesce((
        select jsonb_agg(jsonb_build_object('id', r.id, 'why', r.why, 'how_found', r.how_found, 'created_at', r.created_at,
               'user', jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_emoji', p.avatar_emoji, 'avatar_url', p.avatar_url,
                                          'vouch_count', public.visible_vouch_count(p.id))) order by r.created_at)
        from public.group_join_requests r join public.profiles p on p.id = r.user_id
        where r.group_id = g.id and r.status = 'pending'), '[]'::jsonb) else '[]'::jsonb end
  ) end
  from (select p_group as id0) z left join public.groups g on g.id = z.id0
$$;

-- ── Group chat stays in sync with membership ─────────────────────────────
create or replace function public.group_conversation_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
declare conv bigint;
begin
  if tg_table_name = 'groups' then
    insert into public.conversations (kind, group_id) values ('group', new.id) on conflict do nothing;
    return null;
  end if;
  if tg_op = 'INSERT' then
    select id into conv from public.conversations where group_id = new.group_id;
    if conv is null then
      insert into public.conversations (kind, group_id) values ('group', new.group_id) returning id into conv;
    end if;
    insert into public.conversation_members (conversation_id, user_id) values (conv, new.user_id) on conflict do nothing;
  elsif tg_op = 'DELETE' then
    delete from public.conversation_members cm using public.conversations c
     where cm.conversation_id = c.id and c.group_id = old.group_id and cm.user_id = old.user_id;
  end if;
  return null;
end $$;
create trigger groups_conversation after insert on public.groups
  for each row execute function public.group_conversation_sync();
create trigger group_members_conversation after insert or delete on public.group_members
  for each row execute function public.group_conversation_sync();

-- Chat messages in realtime (row-level security still applies).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Conversation screen data: title + members, only for members.
create or replace function public.conversation_info(p_conv bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.is_conversation_member(c.id, auth.uid()) then null else jsonb_build_object(
    'id', c.id, 'kind', c.kind, 'group_id', c.group_id,
    'title', coalesce(g.name, (select display_name from public.profiles where id = case when c.direct_a = auth.uid() then c.direct_b else c.direct_a end)),
    'emoji', g.emoji,
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_emoji', p.avatar_emoji, 'avatar_url', p.avatar_url))
                         from public.conversation_members cm join public.profiles p on p.id = cm.user_id where cm.conversation_id = c.id), '[]'::jsonb)
  ) end
  from public.conversations c left join public.groups g on g.id = c.group_id where c.id = p_conv
$$;

-- ── Event recap ───────────────────────────────────────────────────────────
-- A recap pin tied to the event, with photos (uploaded separately) and tags.
-- Only people who went (RSVP'd) can post one; tagged people must have gone too.
create or replace function public.post_recap(p_event bigint, p_body text, p_tags uuid[] default '{}')
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ev public.events;
  pin_id bigint;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null then raise exception 'Event not found.' using errcode = 'check_violation'; end if;
  if not exists (select 1 from public.event_rsvps where event_id = p_event and user_id = me) then
    raise exception 'Only people who went can post a recap.' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Say how it went.' using errcode = 'check_violation'; end if;
  insert into public.pins (author_id, category, body, audience, approx_location, place_label, venue_id, event_id)
  values (me, 'recap', trim(p_body), 'everyone', (select location from public.venues where id = ev.venue_id),
          (select name from public.venues where id = ev.venue_id), ev.venue_id, ev.id)
  returning id into pin_id;
  insert into public.pin_tags (pin_id, user_id)
  select pin_id, u from unnest(coalesce(p_tags, '{}')) u
  where u <> me and exists (select 1 from public.event_rsvps r where r.event_id = p_event and r.user_id = u);
  insert into public.notifications (user_id, kind, title, body, actor_id, link)
  select u, 'tagged', (select display_name from public.profiles where id = me) || ' tagged you in a recap', ev.title, me, '/pins/' || pin_id
  from unnest(coalesce(p_tags, '{}')) u where u <> me and exists (select 1 from public.event_rsvps r where r.event_id = p_event and r.user_id = u);
  return pin_id;
end $$;

-- ── Permissions ───────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.post_going_out(public.going_out_when, timestamptz, bigint, text, text[], text, double precision, double precision)',
    'public.delete_going_out(bigint)',
    'public.going_out_feed(text, double precision, double precision, numeric)',
    'public.my_group_events()',
    'public.search_venues(text, double precision, double precision)',
    'public.venue_detail(bigint)',
    'public.create_event(text, timestamptz, bigint, text, text, integer, bigint, numeric)',
    'public.event_detail(bigint)',
    'public.event_check_in(bigint, double precision, double precision, real)',
    'public.create_group(text, text, text, public.join_type, text, text, uuid[])',
    'public.join_group(bigint)',
    'public.request_join_group(bigint, text, text)',
    'public.review_join_request(bigint, boolean)',
    'public.leave_group(bigint)',
    'public.group_detail(bigint)',
    'public.conversation_info(bigint)',
    'public.post_recap(bigint, text, uuid[])'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
