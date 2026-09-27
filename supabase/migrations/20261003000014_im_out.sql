-- I'm In: 014 I'm Out (the live version of "going out")
-- A going-out post now has a live state:
--   heading out (posted)  →  here now (you tapped "I'm here")  →  heading home (ended)
-- "Here now" lasts 3 hours unless you tap "Still here", and only your circle
-- and network ever see it. People you know can tap "Join" ("I'm coming"), and
-- you're told who's heading your way.

alter table public.going_out_posts add column arrived_at timestamptz;
alter table public.going_out_posts add column live_until timestamptz;
alter table public.going_out_posts add column open_to_join boolean not null default true;

insert into public.app_config (key, value, description) values
  ('here_now_hours', '3', 'How long "Here now" lasts before it asks "Still here?".')
on conflict (key) do nothing;

create type public.going_out_join_status as enum ('heading', 'here');

create table public.going_out_joins (
  post_id    bigint not null references public.going_out_posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     public.going_out_join_status not null default 'heading',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.going_out_joins enable row level security;
-- Read through going_out_feed / my_going_out; writes go through join_going_out().
create policy "own joins and joins to my posts" on public.going_out_joins for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.going_out_posts g where g.id = post_id and g.user_id = auth.uid()));

-- ── "I'm here" / "Still here" ─────────────────────────────────────────────
create or replace function public.im_here(p_post bigint default null, p_lat double precision default null, p_lng double precision default null)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  post public.going_out_posts;
  first_arrival boolean;
  until timestamptz;
begin
  select * into post from public.going_out_posts
   where user_id = me and expires_at > now() and when_kind = 'tonight'
     and (p_post is null or id = p_post)
   order by created_at desc limit 1;
  if post.id is null then raise exception 'Post that you''re going out first.' using errcode = 'check_violation'; end if;

  first_arrival := post.arrived_at is null or post.live_until <= now();
  until := least(now() + make_interval(hours => public.config_num('here_now_hours')::int), post.expires_at);
  update public.going_out_posts
     set arrived_at = case when first_arrival then now() else arrived_at end,
         live_until = until,
         approx_location = coalesce(case when p_lat is not null and p_lng is not null then public.snap_location(p_lng, p_lat) end, approx_location)
   where id = post.id;

  -- Tell the people heading there.
  if first_arrival then
    insert into public.notifications (user_id, kind, title, body, actor_id, link)
    select j.user_id, 'going_out_here',
           (select display_name from public.profiles where id = me) || ' is there now',
           coalesce((select name from public.venues where id = post.venue_id), post.place_text, 'Out tonight'), me, '/tonight'
    from public.going_out_joins j where j.post_id = post.id and j.status = 'heading';
  end if;
  return until;
end $$;

-- ── "Join" (I'm coming) ────────────────────────────────────────────────────
-- p_status: 'heading', 'here', or null to cancel. Only people in your circle
-- or network can join, and only when the post is open to joins.
create or replace function public.join_going_out(p_post bigint, p_status public.going_out_join_status default 'heading')
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  post public.going_out_posts;
  was public.going_out_join_status;
begin
  select * into post from public.going_out_posts where id = p_post and expires_at > now();
  if post.id is null or post.user_id = me or private.is_blocked(me, post.user_id)
     or coalesce(private.degree_between(me, post.user_id), 9) not in (1, 2) then
    raise exception 'You can''t join this one.' using errcode = 'check_violation';
  end if;
  if p_status is null then
    delete from public.going_out_joins where post_id = p_post and user_id = me;
    return;
  end if;
  if not post.open_to_join then raise exception 'They''re not taking company tonight.' using errcode = 'check_violation'; end if;

  select status into was from public.going_out_joins where post_id = p_post and user_id = me;
  insert into public.going_out_joins (post_id, user_id, status) values (p_post, me, p_status)
  on conflict (post_id, user_id) do update set status = excluded.status, updated_at = now();

  if was is distinct from p_status then
    perform private.notify(post.user_id, 'going_out_join',
      (select display_name from public.profiles where id = me) ||
        case p_status when 'here' then ' is here too' else ' is heading your way' end,
      coalesce((select name from public.venues where id = post.venue_id), post.place_text, 'Tonight'), me, '/people/' || me);
  end if;
end $$;

create or replace function public.set_open_to_join(p_post bigint, p_open boolean)
returns void language sql security definer set search_path = '' as $$
  update public.going_out_posts set open_to_join = p_open where id = p_post and user_id = auth.uid()
$$;

-- Who's coming (for your own post).
create or replace function public.my_going_out_company(p_post bigint)
returns table (user_id uuid, display_name text, avatar_url text, status public.going_out_join_status, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select j.user_id, p.display_name, p.avatar_url, j.status, j.updated_at
  from public.going_out_joins j
  join public.going_out_posts g on g.id = j.post_id and g.user_id = auth.uid()
  join public.profiles p on p.id = j.user_id
  where j.post_id = p_post and not private.is_blocked(auth.uid(), j.user_id)
  order by j.status desc, j.updated_at desc
$$;

-- ── Feeds include the live state ──────────────────────────────────────────
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
          -- "Here now" is shown only to you and people you know (1st/2nd degree).
          'here_since', case when (g.user_id = auth.uid() or n.id is not null) and g.arrived_at is not null and g.live_until > now()
                             then g.arrived_at end,
          'live_until', case when g.user_id = auth.uid() then g.live_until end,
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

drop function public.tonight_network();
create function public.tonight_network()
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
    case when g.arrived_at is not null and g.live_until > now() then g.arrived_at end
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

-- ── Permissions ───────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.im_here(bigint, double precision, double precision)',
    'public.join_going_out(bigint, public.going_out_join_status)',
    'public.set_open_to_join(bigint, boolean)',
    'public.my_going_out_company(bigint)',
    'public.going_out_feed(text, double precision, double precision, numeric)',
    'public.tonight_network()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
