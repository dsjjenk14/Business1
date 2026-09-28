-- 1. Venue ratings: rate the place after an event you went to (1–5 stars,
--    optional note). Venue pages show the average; Places ranks the best.
-- 2. Music on posts: a 30-second Apple Music preview attached to a pin.
-- 3. Live video: go live to your circle, network or everyone, with live
--    comments. Off until a video service is connected (live_video_enabled).

-- ── 1. Venue ratings ─────────────────────────────────────────────────────
create table public.venue_ratings (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  event_id   bigint not null references public.events (id) on delete cascade,
  venue_id   bigint not null references public.venues (id) on delete cascade,
  stars      smallint not null check (stars between 1 and 5),
  note       text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index venue_ratings_venue_idx on public.venue_ratings (venue_id);
alter table public.venue_ratings enable row level security;
-- No direct access: read and write through the functions below.

-- You went if you were on the list (or hosted), the event has started, and
-- it was at a known venue. Ratings stay open for 30 days.
create or replace function private.can_rate_event(p_event bigint, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event and e.venue_id is not null
      and e.starts_at <= now() and e.starts_at > now() - interval '30 days'
      and (e.host_id = p_user or exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = p_user)))
$$;

create or replace function public.rate_venue(p_event bigint, p_stars integer, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if p_stars is null or p_stars not between 1 and 5 then raise exception 'Pick 1 to 5 stars.' using errcode = 'check_violation'; end if;
  if not private.can_rate_event(p_event, auth.uid()) then
    raise exception 'You can rate a place after an event you went to there.' using errcode = 'insufficient_privilege';
  end if;
  select venue_id into v from public.events where id = p_event;
  insert into public.venue_ratings (user_id, event_id, venue_id, stars, note)
  values (auth.uid(), p_event, v, p_stars, nullif(trim(p_note), ''))
  on conflict (user_id, event_id) do update set stars = excluded.stars, note = excluded.note, updated_at = now();
end $$;

-- For the event page: can I rate this, and what did I say?
create or replace function public.event_rating(p_event bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'can_rate', private.can_rate_event(p_event, auth.uid()),
    'venue_id', e.venue_id,
    'venue_name', (select name from public.venues where id = e.venue_id),
    'my_stars', r.stars,
    'my_note', r.note)
  from public.events e
  left join public.venue_ratings r on r.event_id = e.id and r.user_id = auth.uid()
  where e.id = p_event
$$;

-- Events you went to that you haven't rated yet (newest first).
create or replace function public.places_to_rate()
returns table (event_id bigint, title text, starts_at timestamptz, venue_id bigint, venue_name text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.title, e.starts_at, v.id, v.name
  from public.events e join public.venues v on v.id = e.venue_id
  where private.can_rate_event(e.id, auth.uid())
    and not exists (select 1 from public.venue_ratings r where r.event_id = e.id and r.user_id = auth.uid())
  order by e.starts_at desc limit 10
$$;

-- Best places near you. Ranked by a weighted average so one 5-star rating
-- doesn't beat forty 4.8s: (sum + 3 × 3.5) / (count + 3).
create or replace function public.top_venues(p_lat double precision default null, p_lng double precision default null,
                                             p_radius_mi double precision default 25)
returns table (venue_id bigint, name text, glyph text, neighborhood text, category text, avg_stars numeric, ratings integer,
               distance_mi numeric)
language sql stable security definer set search_path = '' as $$
  with origin as (
    select coalesce(case when p_lat is not null and p_lng is not null then public.snap_location(p_lng, p_lat) end,
                    (select approx_location from public.profiles where id = auth.uid())) as g
  ),
  scored as (
    select r.venue_id, round(avg(r.stars)::numeric, 1) as avg_stars, count(*)::int as n,
           (sum(r.stars) + 3 * 3.5) / (count(*) + 3) as score
    from public.venue_ratings r
    where not private.is_blocked(auth.uid(), r.user_id)
    group by r.venue_id
  )
  select v.id, v.name, v.emoji, v.neighborhood, v.category, s.avg_stars, s.n,
         case when (select g from origin) is not null then round((extensions.st_distance(v.location, (select g from origin)) / 1609.344)::numeric, 1) end
  from scored s join public.venues v on v.id = s.venue_id
  where (select g from origin) is null
     or extensions.st_dwithin(v.location, (select g from origin), least(greatest(p_radius_mi, 1), 75) * 1609.344)
  order by s.score desc, s.n desc limit 20
$$;

create or replace function public.venue_detail(p_venue bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  with network as (select f as id from private.first_degree_ids(auth.uid()) f union select user_id from private.second_degree(auth.uid()))
  select jsonb_build_object(
    'id', v.id, 'name', v.name, 'emoji', v.emoji, 'address', v.address, 'neighborhood', v.neighborhood,
    'category', v.category, 'price_level', v.price_level, 'description', v.description,
    'placement', (select jsonb_build_object('kind', pl.kind, 'perk', pl.perk, 'perk_details', pl.perk_details, 'ends_at', pl.ends_at)
                  from public.venue_placements pl
                  where pl.venue_id = v.id and now() between pl.starts_at and pl.ends_at
                  order by (pl.kind = 'sponsored') desc, pl.starts_at desc limit 1),
    'lat', extensions.st_y(v.location::extensions.geometry), 'lng', extensions.st_x(v.location::extensions.geometry),
    'network_visited', (select count(distinct u) from (
        select e.user_a as u from public.encounters e where e.venue_id = v.id
        union select e.user_b from public.encounters e where e.venue_id = v.id) x where u in (select id from network)),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'title', ev.title, 'emoji', ev.emoji, 'starts_at', ev.starts_at,
                  'host_name', (select display_name from public.profiles where id = ev.host_id),
                  'going_count', (select count(*) from public.event_rsvps r where r.event_id = ev.id), 'capacity', ev.capacity)
                  order by ev.starts_at)
                from public.events ev where ev.venue_id = v.id and ev.starts_at > now() - interval '3 hours'
                  and ev.starts_at < now() + interval '14 days' and not private.is_blocked(auth.uid(), ev.host_id)), '[]'::jsonb),
    -- Ratings from people who went to events here.
    'rating', (select jsonb_build_object('avg', round(avg(r.stars)::numeric, 1), 'count', count(*))
               from public.venue_ratings r where r.venue_id = v.id and not private.is_blocked(auth.uid(), r.user_id)),
    'reviews', coalesce((select jsonb_agg(x order by x->>'at' desc) from (
                  select jsonb_build_object('name', p.display_name, 'stars', r.stars, 'note', r.note, 'at', r.updated_at) as x
                  from public.venue_ratings r join public.profiles p on p.id = r.user_id
                  where r.venue_id = v.id and r.note is not null and not private.is_blocked(auth.uid(), r.user_id)
                  order by r.updated_at desc limit 10) q), '[]'::jsonb)
  )
  from public.venues v where v.id = p_venue
$$;

-- ── 2. Music on posts ────────────────────────────────────────────────────
-- A 30-second Apple Music preview. Only Apple's own links are allowed.
create table public.pin_music (
  pin_id      bigint primary key references public.pins (id) on delete cascade,
  track_id    bigint not null,
  title       text not null check (char_length(title) between 1 and 200),
  artist      text not null check (char_length(artist) between 1 and 200),
  artwork_url text check (artwork_url ~ '^https://[a-z0-9.-]+\.(mzstatic\.com|apple\.com)/'),
  preview_url text not null check (preview_url ~ '^https://[a-z0-9.-]+\.(apple\.com|mzstatic\.com)/'),
  apple_url   text not null check (apple_url ~ '^https://(music|itunes)\.apple\.com/')
);
alter table public.pin_music enable row level security;
create policy "music on visible pins" on public.pin_music for select to authenticated
  using (private.can_see_pin(pin_id, auth.uid()));
create policy "add music to own pins" on public.pin_music for insert to authenticated
  with check (exists (select 1 from public.pins where id = pin_id and author_id = auth.uid()));
create policy "change music on own pins" on public.pin_music for delete to authenticated
  using (exists (select 1 from public.pins where id = pin_id and author_id = auth.uid()));
grant select, insert, delete on public.pin_music to authenticated;

-- ── 3. Live video ────────────────────────────────────────────────────────
insert into public.app_config (key, value, description) values
  ('live_video_enabled', 'false', 'Turns on Go Live. Needs a video service (LiveKit) connected first; see docs/LIVE-VIDEO.md.'),
  ('live_max_minutes', '120', 'Longest a live video can run.')
on conflict (key) do nothing;

create table public.live_streams (
  id         bigserial primary key,
  host_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 80),
  audience   text not null default 'circle' check (audience in ('circle', 'network', 'everyone')),
  room       text not null unique default gen_random_uuid()::text,
  status     text not null default 'live' check (status in ('live', 'ended')),
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);
create index live_streams_live_idx on public.live_streams (status, started_at desc);
create unique index live_streams_one_per_host on public.live_streams (host_id) where status = 'live';
alter table public.live_streams enable row level security;

create table public.live_comments (
  id         bigserial primary key,
  stream_id  bigint not null references public.live_streams (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index live_comments_stream_idx on public.live_comments (stream_id, id);
alter table public.live_comments enable row level security;
-- No direct access: everything goes through the functions below.

-- A live video ends by itself after live_max_minutes.
create or replace function private.live_is_on(s public.live_streams)
returns boolean language sql stable set search_path = '' as $$
  select s.status = 'live' and s.started_at > now() - make_interval(mins => public.config_num('live_max_minutes')::int)
$$;

create or replace function private.can_see_live(p_stream bigint, p_viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.live_streams s
    where s.id = p_stream and (
      s.host_id = p_viewer or (
        not private.is_blocked(p_viewer, s.host_id) and (
          s.audience = 'everyone'
          or private.are_connected(p_viewer, s.host_id)
          or (s.audience = 'network' and exists (select 1 from private.second_degree(s.host_id) d where d.user_id = p_viewer))))))
$$;

create or replace function public.start_live(p_title text, p_audience text default 'circle')
returns bigint language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); new_id bigint; who text;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if coalesce((select value #>> '{}' from public.app_config where key = 'live_video_enabled'), 'false') <> 'true' then
    raise exception 'Live video isn''t turned on yet.' using errcode = 'feature_not_supported';
  end if;
  if p_audience not in ('circle', 'network', 'everyone') then raise exception 'Pick who can watch.' using errcode = 'check_violation'; end if;
  -- One live video at a time: end any earlier one.
  update public.live_streams set status = 'ended', ended_at = now() where host_id = me and status = 'live';
  insert into public.live_streams (host_id, title, audience) values (me, trim(p_title), p_audience) returning id into new_id;
  -- Tell your circle (they can always watch).
  select display_name into who from public.profiles where id = me;
  perform private.notify(f, 'live', who || ' is live', trim(p_title), me, '/live/' || new_id)
  from private.first_degree_ids(me) f where not private.is_blocked(f, me);
  return new_id;
end $$;

create or replace function public.end_live(p_stream bigint)
returns void language sql security definer set search_path = '' as $$
  update public.live_streams set status = 'ended', ended_at = now()
  where id = p_stream and host_id = auth.uid() and status = 'live'
$$;

-- Live videos you can watch right now (Home shows these at the top).
create or replace function public.live_now()
returns table (stream_id bigint, host_id uuid, host_name text, avatar_url text, title text, audience text, started_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.host_id, p.display_name, p.avatar_url, s.title, s.audience, s.started_at
  from public.live_streams s join public.profiles p on p.id = s.host_id
  where private.live_is_on(s) and private.can_see_live(s.id, auth.uid())
  order by (s.host_id = auth.uid()) desc, private.are_connected(auth.uid(), s.host_id) desc, s.started_at desc
  limit 20
$$;

create or replace function public.live_detail(p_stream bigint, p_after bigint default 0)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.can_see_live(p_stream, auth.uid()) then null else jsonb_build_object(
    'id', s.id, 'host_id', s.host_id, 'host_name', p.display_name, 'avatar_url', p.avatar_url,
    'title', s.title, 'audience', s.audience, 'started_at', s.started_at,
    'is_live', private.live_is_on(s), 'is_host', s.host_id = auth.uid(),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', cp.display_name, 'body', c.body, 'at', c.created_at) order by c.id)
                 from (select * from public.live_comments c where c.stream_id = s.id and c.id > coalesce(p_after, 0)
                         and not private.is_blocked(auth.uid(), c.user_id) order by c.id desc limit 50) c
                 join public.profiles cp on cp.id = c.user_id), '[]'::jsonb)
  ) end
  from public.live_streams s join public.profiles p on p.id = s.host_id
  where s.id = p_stream
$$;

create or replace function public.post_live_comment(p_stream bigint, p_body text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare s public.live_streams; new_id bigint;
begin
  select * into s from public.live_streams where id = p_stream;
  if s.id is null or not private.can_see_live(p_stream, auth.uid()) then raise exception 'Live video not found.' using errcode = 'no_data_found'; end if;
  if not private.live_is_on(s) then raise exception 'This live video has ended.' using errcode = 'check_violation'; end if;
  if (select count(*) from public.live_comments where user_id = auth.uid() and created_at > now() - interval '10 seconds') >= 3 then
    raise exception 'Slow down a little.' using errcode = 'check_violation';
  end if;
  insert into public.live_comments (stream_id, user_id, body) values (p_stream, auth.uid(), trim(p_body)) returning id into new_id;
  return new_id;
end $$;

-- The host can remove a comment from their live video.
create or replace function public.remove_live_comment(p_comment bigint)
returns void language sql security definer set search_path = '' as $$
  delete from public.live_comments c using public.live_streams s
  where c.id = p_comment and s.id = c.stream_id and (s.host_id = auth.uid() or c.user_id = auth.uid())
$$;

-- Server (the live Edge Function): may this person join, and as what?
create or replace function public.live_join_check(p_stream bigint, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.live_streams;
begin
  select * into s from public.live_streams where id = p_stream;
  if s.id is null or not private.can_see_live(p_stream, p_user) then return jsonb_build_object('error', 'Live video not found.'); end if;
  if not private.live_is_on(s) then return jsonb_build_object('error', 'This live video has ended.'); end if;
  return jsonb_build_object('room', s.room, 'role', case when s.host_id = p_user then 'host' else 'viewer' end,
    'name', (select display_name from public.profiles where id = p_user),
    'max_minutes', public.config_num('live_max_minutes'));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.rate_venue(bigint, integer, text)', 'public.event_rating(bigint)', 'public.places_to_rate()',
    'public.top_venues(double precision, double precision, double precision)', 'public.venue_detail(bigint)',
    'public.start_live(text, text)', 'public.end_live(bigint)', 'public.live_now()', 'public.live_detail(bigint, bigint)',
    'public.post_live_comment(bigint, text)', 'public.remove_live_comment(bigint)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  revoke execute on function public.live_join_check(bigint, uuid) from public, anon, authenticated;
  grant execute on function public.live_join_check(bigint, uuid) to service_role;
  revoke execute on function private.can_rate_event(bigint, uuid) from public, anon, authenticated;
  revoke execute on function private.can_see_live(bigint, uuid) from public, anon, authenticated;
end $$;
