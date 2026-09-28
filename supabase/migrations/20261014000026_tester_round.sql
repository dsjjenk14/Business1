-- Tester round (10 testers, 21–45): changes Dominique asked for.
--  • New members: Home shows community pins, open groups and public events
--    until they have friends. Messaging unlocks after 3 back-and-forths (was 5).
--  • Location: default radius 25 mi; "I'm In" can be shown to only chosen people.
--  • Quieter defaults: "people joining your plans" notifications start off.
--  • Hosts: event waitlists (a freed spot goes to the next person automatically),
--    group co-hosts and pinned announcements (sent to every member).
--  • Reactions on pins with our own symbols (the heart is still one tap).

-- ── Defaults ─────────────────────────────────────────────────────────────
update public.app_config set value = '25'::jsonb where key = 'default_radius_mi';
alter table public.user_settings alter column radius_mi set default 25;
update public.plan_limits set free_value = 3 where key = 'messaging_min_exchanges';
alter table public.user_settings alter column notify_rsvps set default false;

-- ── "I'm In" for chosen people only ──────────────────────────────────────
alter table public.going_out_posts drop constraint if exists going_out_posts_here_audience_check;
alter table public.going_out_posts add constraint going_out_posts_here_audience_check check (here_audience in ('circle', 'network', 'custom'));

create table public.going_out_viewers (
  post_id bigint not null references public.going_out_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (post_id, user_id)
);
create index going_out_viewers_user_idx on public.going_out_viewers (user_id);
alter table public.going_out_viewers enable row level security;
create policy "owner sees viewers" on public.going_out_viewers for select to authenticated
  using (exists (select 1 from public.going_out_posts g where g.id = post_id and g.user_id = auth.uid()));

-- Who may see that you're there now.
create or replace function private.can_see_here(p_post bigint, p_owner uuid, p_audience text, p_degree smallint)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner = auth.uid()
    or (p_audience = 'circle' and p_degree = 1)
    or (p_audience = 'network' and p_degree in (1, 2))
    or (p_audience = 'custom' and exists (select 1 from public.going_out_viewers v where v.post_id = p_post and v.user_id = auth.uid()))
$$;

-- Choose exactly who sees you're there (people in your circle only).
create or replace function public.set_here_viewers(p_post bigint, p_viewers uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not exists (select 1 from public.going_out_posts where id = p_post and user_id = auth.uid()) then
    raise exception 'That''s not your plan.' using errcode = 'insufficient_privilege';
  end if;
  delete from public.going_out_viewers where post_id = p_post;
  insert into public.going_out_viewers (post_id, user_id)
  select p_post, u from unnest(coalesce(p_viewers, '{}')) u where private.are_connected(auth.uid(), u)
  on conflict do nothing;
  get diagnostics n = row_count;
  update public.going_out_posts set here_audience = 'custom' where id = p_post;
  return n;
end $$;

create or replace function public.here_viewers(p_post bigint)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(v.user_id), '{}') from public.going_out_viewers v
  join public.going_out_posts g on g.id = v.post_id and g.user_id = auth.uid() where v.post_id = p_post
$$;

create or replace function public.set_here_audience(p_post bigint, p_audience text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_audience not in ('circle', 'network') then raise exception 'Choose circle or network.' using errcode = 'check_violation'; end if;
  update public.going_out_posts set here_audience = p_audience where id = p_post and user_id = auth.uid();
end $$;

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
      select jsonb_agg(x order by (x->>'is_me')::boolean desc, (x->>'here_since') is not null desc, (x->>'is_priority')::boolean desc, (x->>'degree')::int, x->>'starts_at') from (
        select distinct on (g.user_id) jsonb_build_object(
          'post_id', g.id, 'user_id', g.user_id, 'display_name', p.display_name, 'avatar_emoji', p.avatar_emoji, 'avatar_url', p.avatar_url,
          'vouch_count', public.visible_vouch_count(g.user_id), 'degree', coalesce(n.degree, 3), 'is_me', g.user_id = auth.uid(),
          'place', case when public.shows_going_out_venue(g.user_id) then coalesce(v.name, g.place_text) end,
          'neighborhood', case when public.shows_going_out_venue(g.user_id) then v.neighborhood end,
          'venue_id', case when public.shows_going_out_venue(g.user_id) then g.venue_id end,
          'starts_at', g.starts_at, 'when_kind', g.when_kind, 'vibes', g.vibes, 'note', g.note,
          'is_hosting', g.is_hosting, 'event_id', g.event_id, 'is_priority', g.is_priority,
          -- "In now" is shown to you and to your circle (or your network, if you chose that).
          'here_since', case when g.arrived_at is not null and g.live_until > now()
                              and private.can_see_here(g.id, g.user_id, g.here_audience, n.degree)
                             then g.arrived_at end,
          'live_until', case when g.user_id = auth.uid() then g.live_until end,
          'here_audience', case when g.user_id = auth.uid() then g.here_audience end,
          'open_to_join', g.open_to_join and (g.user_id = auth.uid() or n.id is not null),
          'heading_count', case when g.user_id = auth.uid() or n.id is not null
                                then (select count(*) from public.going_out_joins j where j.post_id = g.id and j.status = 'heading') else 0 end,
          'joined_here_count', case when g.user_id = auth.uid() or n.id is not null
                                then (select count(*) from public.going_out_joins j where j.post_id = g.id and j.status = 'here') else 0 end,
          'my_join', (select j.status from public.going_out_joins j where j.post_id = g.id and j.user_id = auth.uid()),
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
          'host_id', ev.host_id, 'host_name', h.display_name, 'venue_id', ev.venue_id, 'venue_name', coalesce(v.name, ev.place_text), 'neighborhood', v.neighborhood,
          'group_id', ev.group_id, 'group_name', gr.name, 'capacity', ev.capacity,
          'going_count', (select count(*) from public.event_rsvps r where r.event_id = ev.id),
          'network_going', (select count(*) from public.event_rsvps r where r.event_id = ev.id and r.user_id in (select id from network)),
          'i_am_going', exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid()),
          'distance_mi', case when (select g from origin) is not null and ev.approx_location is not null
                              then round((extensions.st_distance(ev.approx_location, (select g from origin)) / 1609.344)::numeric, 1) end,
          'lat', extensions.st_y(ev.approx_location::extensions.geometry), 'lng', extensions.st_x(ev.approx_location::extensions.geometry)
        ) as e
        from public.events ev
        join public.profiles h on h.id = ev.host_id
        left join public.venues v on v.id = ev.venue_id
        left join public.groups gr on gr.id = ev.group_id
        where ev.starts_at between (select from_at from win) and (select to_at from win)
          and (p_when <> 'weekend' or ev.starts_at > public.tonight_ends_at())
          and (p_when <> 'weekend' or not ev.is_recurring)          -- decision B9: recurring group events live under Groups
          and not private.is_blocked(auth.uid(), ev.host_id)
          and (ev.host_id = auth.uid() or ev.host_id in (select id from network)
               or exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid())
               or (ev.approx_location is not null and extensions.st_dwithin(ev.approx_location, (select g from origin), (select m from radius))))
      ) q), '[]'::jsonb)
  )
$$;

create or replace function public.tonight_network()
returns table (user_id uuid, display_name text, avatar_emoji text, avatar_url text, place text,
               starts_at timestamptz, is_hosting boolean, degree smallint, is_me boolean, here_since timestamptz)
language sql stable security definer set search_path = '' as $$
  with circle as (select private.first_degree_ids(auth.uid()) as id),
  network as (select id, 1::smallint as degree from circle
              union select user_id, 2::smallint from private.second_degree(auth.uid()))
  select distinct on (g.user_id)
    g.user_id, p.display_name, p.avatar_emoji, p.avatar_url,
    case when public.shows_going_out_venue(g.user_id) then coalesce(v.name, g.place_text) end,
    g.starts_at, g.is_hosting, coalesce(n.degree, 0::smallint), g.user_id = auth.uid(),
    case when g.arrived_at is not null and g.live_until > now()
              and private.can_see_here(g.id, g.user_id, g.here_audience, n.degree) then g.arrived_at end
  from public.going_out_posts g
  join public.profiles p on p.id = g.user_id
  left join network n on n.id = g.user_id
  left join public.venues v on v.id = g.venue_id
  where g.when_kind = 'tonight' and g.expires_at > now()
    and (g.user_id = auth.uid() or n.id is not null)
    and (g.user_id = auth.uid() or public.shows_in_nearby(g.user_id))
    and not private.is_blocked(auth.uid(), g.user_id)
  order by g.user_id, g.starts_at
$$;

-- ── Event waitlists ──────────────────────────────────────────────────────
create table public.event_waitlist (
  event_id   bigint not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_waitlist_user_idx on public.event_waitlist (user_id);
alter table public.event_waitlist enable row level security;
create policy "see own waitlist spots" on public.event_waitlist for select to authenticated using (user_id = auth.uid());

create or replace function public.join_waitlist(p_event bigint)
returns integer language plpgsql security definer set search_path = '' as $$
declare ev public.events;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null or private.is_blocked(auth.uid(), ev.host_id)
     or (ev.group_id is not null and not private.is_group_member(ev.group_id, auth.uid())) then
    raise exception 'Event not found.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.event_rsvps where event_id = p_event and user_id = auth.uid()) then
    raise exception 'You''re already in.' using errcode = 'check_violation';
  end if;
  if ev.capacity is null or (select count(*) from public.event_rsvps where event_id = p_event) < ev.capacity then
    raise exception 'There''s still room. Tap I''m In.' using errcode = 'check_violation';
  end if;
  insert into public.event_waitlist (event_id, user_id) values (p_event, auth.uid()) on conflict do nothing;
  return (select count(*) from public.event_waitlist w where w.event_id = p_event
            and w.created_at <= (select created_at from public.event_waitlist where event_id = p_event and user_id = auth.uid()));
end $$;

create or replace function public.leave_waitlist(p_event bigint)
returns void language sql security definer set search_path = '' as $$
  delete from public.event_waitlist where event_id = p_event and user_id = auth.uid()
$$;

-- When someone drops out of a full event, the next person on the waitlist gets the spot.
create or replace function private.promote_waitlist()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ev public.events;
  nxt uuid;
begin
  select * into ev from public.events where id = old.event_id;
  if ev.id is null or ev.capacity is null or ev.starts_at < now() then return old; end if;
  if (select count(*) from public.event_rsvps where event_id = ev.id) >= ev.capacity then return old; end if;
  select user_id into nxt from public.event_waitlist where event_id = ev.id order by created_at limit 1;
  if nxt is null then return old; end if;
  delete from public.event_waitlist where event_id = ev.id and user_id = nxt;
  insert into public.event_rsvps (event_id, user_id) values (ev.id, nxt) on conflict do nothing;
  perform private.notify(nxt, 'waitlist_in', 'A spot opened: you''re in', ev.title, null, '/events/' || ev.id);
  return old;
end $$;
create trigger event_rsvps_promote after delete on public.event_rsvps for each row execute function private.promote_waitlist();

-- Going to the event takes you off its waitlist.
create or replace function private.clear_waitlist_on_rsvp()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.event_waitlist where event_id = new.event_id and user_id = new.user_id;
  return new;
end $$;
create trigger event_rsvps_clear_waitlist after insert on public.event_rsvps for each row execute function private.clear_waitlist_on_rsvp();

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
    'place', ev.place_text,
    'group', case when gr.id is null then null else jsonb_build_object('id', gr.id, 'name', gr.name, 'emoji', gr.emoji) end,
    'i_am_going', exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid()),
    'i_am_here', exists (select 1 from public.location_pings lp where lp.event_id = ev.id and lp.user_id = auth.uid() and lp.purpose = 'checkin'),
    'going_count', (select count(*) from public.event_rsvps r where r.event_id = ev.id),
    'on_waitlist', exists (select 1 from public.event_waitlist w where w.event_id = ev.id and w.user_id = auth.uid()),
    'waitlist_position', (select pos from (select w.user_id, row_number() over (order by w.created_at) as pos from public.event_waitlist w where w.event_id = ev.id) q where q.user_id = auth.uid()),
    'waitlist_count', (select count(*) from public.event_waitlist w where w.event_id = ev.id),
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

-- ── Group co-hosts and announcements ─────────────────────────────────────
alter table public.groups add column announcement text check (char_length(announcement) <= 500);
alter table public.groups add column announcement_at timestamptz;
alter table public.groups add column announcement_by uuid references public.profiles (id) on delete set null;
create index groups_announcement_by_idx on public.groups (announcement_by);

-- The owner makes members co-hosts (admins) or turns them back into members.
create or replace function public.set_group_role(p_group bigint, p_user uuid, p_role public.group_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = auth.uid() and role = 'owner') then
    raise exception 'Only the group''s owner can do that.' using errcode = 'insufficient_privilege';
  end if;
  if p_role = 'owner' or p_user = auth.uid() then raise exception 'That can''t be changed here.' using errcode = 'check_violation'; end if;
  update public.group_members set role = p_role where group_id = p_group and user_id = p_user;
  if not found then raise exception 'They''re not in this group.' using errcode = 'check_violation'; end if;
  if p_role = 'admin' then
    perform private.notify(p_user, 'group_role', 'You''re now a co-host of ' || (select name from public.groups where id = p_group),
      'You can post announcements, add events and approve requests.', auth.uid(), '/groups/' || p_group);
  end if;
end $$;

-- Pin an announcement to the group and tell every member.
create or replace function public.post_group_announcement(p_group bigint, p_text text)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.groups;
begin
  if not private.is_group_admin(p_group, auth.uid()) then
    raise exception 'Only the owner and co-hosts can post announcements.' using errcode = 'insufficient_privilege';
  end if;
  select * into g from public.groups where id = p_group;
  if coalesce(trim(p_text), '') = '' then
    update public.groups set announcement = null, announcement_at = null, announcement_by = null where id = p_group;
    return;
  end if;
  if char_length(trim(p_text)) > 500 then raise exception 'Keep it under 500 characters.' using errcode = 'check_violation'; end if;
  update public.groups set announcement = trim(p_text), announcement_at = now(), announcement_by = auth.uid() where id = p_group;
  perform private.notify(m.user_id, 'group_announcement', g.name, left(trim(p_text), 140), auth.uid(), '/groups/' || p_group)
  from public.group_members m where m.group_id = p_group and m.user_id <> auth.uid();
end $$;

-- ── Reactions ────────────────────────────────────────────────────────────
alter table public.pin_likes add column kind text not null default 'heart'
  check (kind in ('heart', 'flame', 'smile', 'spark', 'star'));

-- React to a pin (replaces your earlier reaction); null takes it back.
create or replace function public.react_to_pin(p_pin bigint, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_see_pin(p_pin, auth.uid()) then raise exception 'Pin not found.' using errcode = 'check_violation'; end if;
  if p_kind is null then
    delete from public.pin_likes where pin_id = p_pin and user_id = auth.uid();
    return;
  end if;
  insert into public.pin_likes (pin_id, user_id, kind) values (p_pin, auth.uid(), p_kind)
  on conflict (pin_id, user_id) do update set kind = excluded.kind;
end $$;

drop function public.pins_feed(text, double precision, double precision, numeric, public.pin_category, uuid, bigint, timestamptz, integer);
create function public.pins_feed(
  p_mode      text,
  p_lat       double precision default null,
  p_lng       double precision default null,
  p_radius_mi numeric default null,
  p_category  public.pin_category default null,
  p_author    uuid default null,
  p_pin       bigint default null,
  p_before    timestamptz default null,
  p_limit     integer default 30)
returns table (
  id bigint, author_id uuid, author_name text, author_emoji text, author_avatar text,
  author_vouches integer, author_verified boolean,
  category public.pin_category, body text, audience public.pin_audience, place_label text, city_name text,
  created_at timestamptz, edited_at timestamptz, like_count integer, reply_count integer,
  distance_mi numeric, liked boolean, bookmarked boolean, photo_paths text[], is_mine boolean,
  event_id bigint, event_title text, event_starts_at timestamptz, event_going_count integer, event_i_am_going boolean,
  my_reaction text, top_reactions text[])
language sql stable security definer set search_path = '' as $$
  with origin as (
    select coalesce(
      case when p_lat is not null and p_lng is not null then public.snap_location(p_lng, p_lat) end,
      (select approx_location from public.profiles where id = auth.uid())) as g
  ),
  radius as (select public.effective_radius_mi(p_radius_mi, 'pins_radius_max_mi') * 1609.344 as m),
  circle as (select private.first_degree_ids(auth.uid()) as id),
  network as (select id from circle union select user_id from private.second_degree(auth.uid()))
  select
    p.id, p.author_id, a.display_name, a.avatar_emoji, a.avatar_url,
    public.visible_vouch_count(p.author_id), a.id_verified_at is not null or a.photo_verified_at is not null,
    p.category, p.body, p.audience, p.place_label, c.name, p.created_at, p.edited_at, p.like_count, p.reply_count,
    case when (select g from origin) is not null and p.approx_location is not null
      then round((extensions.st_distance(p.approx_location, (select g from origin)) / 1609.344)::numeric, 1) end,
    exists (select 1 from public.pin_likes l where l.pin_id = p.id and l.user_id = auth.uid()),
    exists (select 1 from public.pin_bookmarks b where b.pin_id = p.id and b.user_id = auth.uid()),
    coalesce((select array_agg(ph.storage_path order by ph.position) from public.pin_photos ph where ph.pin_id = p.id), '{}'),
    p.author_id = auth.uid(),
    ev.id, ev.title, ev.starts_at,
    case when ev.id is not null then (select count(*)::integer from public.event_rsvps r where r.event_id = ev.id) end,
    case when ev.id is not null then exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid()) end,
    (select l.kind from public.pin_likes l where l.pin_id = p.id and l.user_id = auth.uid()),
    coalesce((select array_agg(k.kind order by k.n desc, k.kind) from (
      select l.kind, count(*) as n from public.pin_likes l where l.pin_id = p.id group by l.kind order by 2 desc limit 3) k), '{}')
  from public.pins p
  join public.profiles a on a.id = p.author_id
  left join public.cities c on c.id = p.city_id
  -- An event pin (a shared event or a recap) carries the event, so the card can offer I'm In.
  left join public.events ev on ev.id = p.event_id
    and (ev.group_id is null or private.is_group_member(ev.group_id, auth.uid()))
    and not private.is_blocked(auth.uid(), ev.host_id)
  where p.deleted_at is null
    and private.can_see_pin(p.id, auth.uid())
    and (p_category is null or p.category = p_category)
    and (p_before is null or p.created_at < p_before)
    and case p_mode
      when 'nearby' then p.audience = 'everyone' and p.approx_location is not null
        and extensions.st_dwithin(p.approx_location, (select g from origin), (select m from radius))
      when 'trending' then p.audience = 'everyone' and p.approx_location is not null
        and p.created_at > now() - interval '72 hours'
        and extensions.st_dwithin(p.approx_location, (select g from origin), (select m from radius))
      when 'community' then p.audience = 'everyone'
      when 'network' then p.author_id in (select id from network)
      -- Friends: you, your circle and network, and public pins from people you follow.
      when 'friends' then p.author_id = auth.uid() or p.author_id in (select id from network)
        or (p.audience = 'everyone' and p.author_id in (select f.followee_id from public.follows f where f.follower_id = auth.uid()))
      when 'bookmarks' then exists (select 1 from public.pin_bookmarks b where b.pin_id = p.id and b.user_id = auth.uid())
      when 'author' then p.author_id = p_author
      when 'single' then p.id = p_pin
      else false
    end
  order by
    case when p_mode = 'trending' then p.reply_count * 2 + p.like_count end desc nulls last,
    p.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;

create or replace function public.home_feed(p_scope text default 'friends', p_lat double precision default null, p_lng double precision default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with friends as (
    -- Your circle, plus people you follow.
    select f as id from private.first_degree_ids(auth.uid()) f
    union select followee_id from public.follows where follower_id = auth.uid()),
  my_groups as (select group_id from public.group_members where user_id = auth.uid()),
  event_rows as (
    select ev.id, ev.title, ev.emoji, ev.starts_at, ev.group_id, ev.host_id, ev.capacity,
           coalesce(v.name, ev.place_text) as place, g.name as group_name, h.display_name as host_name, h.avatar_url as host_avatar,
           (select count(*) from public.event_rsvps r where r.event_id = ev.id)::int as going_count,
           (select count(*) from public.event_rsvps r where r.event_id = ev.id and r.user_id in (select private.first_degree_ids(auth.uid())))::int as friends_going,
           exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid()) as i_am_going
    from public.events ev
    left join public.venues v on v.id = ev.venue_id
    left join public.groups g on g.id = ev.group_id
    join public.profiles h on h.id = ev.host_id
    where coalesce(ev.ends_at, ev.starts_at + interval '3 hours') > now()
      and ev.starts_at < now() + interval '30 days'
      and not private.is_blocked(auth.uid(), ev.host_id)
      and (ev.group_id is null or ev.group_id in (select group_id from my_groups)))
  select jsonb_build_object(
    'friend_count', (select count(*) from friends),
    -- 1. Your friends' pins (not yours, not strangers').
    'pins', coalesce((
      select jsonb_agg(to_jsonb(f))
      from public.pins_feed('friends', p_lat, p_lng, null, null, null, null, null, 40) f
      where f.author_id in (select id from friends)), '[]'::jsonb),
    -- 2. Likes and replies people sent you (last 14 days).
    'activity', coalesce((
      select jsonb_agg(a order by a->>'at' desc) from (select a from (
        -- Likes: one line per pin ("Hana, Isaiah and 6 others liked your pin").
        select jsonb_build_object('kind', 'like', 'actor_id', (array_agg(u.id order by l.created_at desc))[1],
                 'actor_name', (array_agg(u.display_name order by l.created_at desc))[1],
                 'actor_avatar', (array_agg(u.avatar_url order by l.created_at desc))[1],
                 'second_name', (array_agg(u.display_name order by l.created_at desc))[2],
                 'count', count(*), 'pin_id', p.id, 'pin_body', left(p.body, 80), 'text', null, 'at', max(l.created_at)) as a
        from public.pin_likes l
        join public.pins p on p.id = l.pin_id and p.author_id = auth.uid() and p.deleted_at is null
        join public.profiles u on u.id = l.user_id
        where l.user_id <> auth.uid() and l.created_at > now() - interval '14 days' and not private.is_blocked(auth.uid(), l.user_id)
        group by p.id, p.body
        union all
        select jsonb_build_object('kind', 'reply', 'actor_id', u.id, 'actor_name', u.display_name, 'actor_avatar', u.avatar_url,
                 'second_name', null, 'count', 1, 'pin_id', p.id, 'pin_body', left(p.body, 80), 'text', left(r.body, 140), 'at', r.created_at)
        from public.pin_replies r
        join public.pins p on p.id = r.pin_id and p.author_id = auth.uid() and p.deleted_at is null
        join public.profiles u on u.id = r.author_id
        where r.author_id <> auth.uid() and r.deleted_at is null and r.hidden_at is null
          and r.created_at > now() - interval '14 days' and not private.is_blocked(auth.uid(), r.author_id)
        ) u order by a->>'at' desc limit 8) s), '[]'::jsonb),
    -- 3. Events in groups you're in.
    'group_events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.starts_at)
      from (select * from event_rows where group_id in (select group_id from my_groups) order by starts_at limit 6) e), '[]'::jsonb),
    -- 4. Events your friends are hosting (not already shown as a group event).
    'friends_hosting', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.starts_at)
      from (select * from event_rows
            where host_id in (select private.first_degree_ids(auth.uid()))
              and (group_id is null or group_id not in (select group_id from my_groups))
            order by starts_at limit 6) e), '[]'::jsonb),
    -- For new members (few friends yet): what's happening in the whole community,
    -- open groups to join, and public events nearby.
    'everyone_pins', case when (select count(*) from friends) < 3 then coalesce((
      select jsonb_agg(to_jsonb(f)) from public.pins_feed('community', p_lat, p_lng, null, null, null, null, null, 10) f
      where not f.is_mine), '[]'::jsonb) else '[]'::jsonb end,
    'suggested_groups', case when (select count(*) from my_groups) < 3 then coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'emoji', g.emoji, 'category', g.category, 'join_type', g.join_type,
               'members', (select count(*) from public.group_members m where m.group_id = g.id), 'schedule', g.schedule_label) order by x.n desc)
      from public.groups g
      cross join lateral (select count(*) as n from public.group_members m where m.group_id = g.id) x
      where g.id not in (select group_id from my_groups) and not private.is_blocked(auth.uid(), g.owner_id)
        and (g.city_id is null or g.city_id = (select city_id from public.profiles where id = auth.uid()))
      limit 5), '[]'::jsonb) else '[]'::jsonb end,
    'nearby_events', case when (select count(*) from friends) < 3 then coalesce((
      select jsonb_agg(to_jsonb(e) order by e.starts_at) from (
        select * from event_rows where group_id is null and host_id <> auth.uid() order by starts_at limit 5) e), '[]'::jsonb) else '[]'::jsonb end
  )
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.set_here_viewers(bigint, uuid[])', 'public.here_viewers(bigint)', 'public.set_here_audience(bigint, text)',
    'public.going_out_feed(text, double precision, double precision, numeric)', 'public.tonight_network()',
    'public.join_waitlist(bigint)', 'public.leave_waitlist(bigint)', 'public.event_detail(bigint)',
    'public.set_group_role(bigint, uuid, public.group_role)', 'public.post_group_announcement(bigint, text)',
    'public.react_to_pin(bigint, text)',
    'public.pins_feed(text, double precision, double precision, numeric, public.pin_category, uuid, bigint, timestamptz, integer)',
    'public.home_feed(text, double precision, double precision)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Announcements are for members only: hide the columns from direct reads and
-- serve them through group_announcement().
revoke select on public.groups from authenticated, anon;
grant select (id, name, emoji, category, description, join_type, owner_id, city_id, schedule_label, created_at) on public.groups to authenticated;

create or replace function public.group_announcement(p_group bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when g.announcement is null or not private.is_group_member(g.id, auth.uid()) then null else jsonb_build_object(
    'text', g.announcement, 'at', g.announcement_at,
    'by', (select display_name from public.profiles where id = g.announcement_by)) end
  from public.groups g where g.id = p_group
$$;
revoke execute on function public.group_announcement(bigint) from public, anon;
grant execute on function public.group_announcement(bigint) to authenticated;
