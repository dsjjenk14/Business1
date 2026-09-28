-- The new Home (product review, Sept 28):
--  • Follow: anyone can follow anyone's public ("Everyone") pins. Your circle
--    stays the trusted inner layer; following never unlocks messaging or vouches.
--  • home_feed(): everything Home needs in one request.
--  • share_event(): repost an event to your circle as a pin.
--  • track(): simple, private usage counts (which features get used), no content.

-- ── Follow ────────────────────────────────────────────────────────────────
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);
alter table public.follows enable row level security;
create policy "see my follows" on public.follows for select to authenticated
  using (follower_id = auth.uid() or followee_id = auth.uid());

create or replace function public.follow_user(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if p_user = me then raise exception 'That''s you.' using errcode = 'check_violation'; end if;
  if private.is_blocked(me, p_user) then raise exception 'You can''t follow this member.' using errcode = 'check_violation'; end if;
  insert into public.follows (follower_id, followee_id) values (me, p_user) on conflict do nothing;
  if found then
    perform private.notify(p_user, 'follow', (select display_name from public.profiles where id = me) || ' followed you',
      'They''ll see your Everyone pins.', me, '/people/' || me);
  end if;
end $$;

create or replace function public.unfollow_user(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.follows where follower_id = auth.uid() and followee_id = p_user
$$;

create or replace function public.follow_info(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'followers', (select count(*) from public.follows where followee_id = p_user),
    'following', (select count(*) from public.follows where follower_id = p_user),
    'i_follow', exists (select 1 from public.follows where follower_id = auth.uid() and followee_id = p_user),
    'follows_me', exists (select 1 from public.follows where follower_id = p_user and followee_id = auth.uid()))
$$;

-- Blocking ends follows both ways.
create or replace function private.unfollow_on_block()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follows
   where (follower_id = new.blocker_id and followee_id = new.blocked_id)
      or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return new;
end $$;
create trigger blocks_unfollow after insert on public.blocks for each row execute function private.unfollow_on_block();

-- A "friends" mode for the feed: you, your circle and network, and the public
-- pins of people you follow.
create or replace function public.pins_feed(
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
  distance_mi numeric, liked boolean, bookmarked boolean, photo_paths text[], is_mine boolean)
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
    p.author_id = auth.uid()
  from public.pins p
  join public.profiles a on a.id = p.author_id
  left join public.cities c on c.id = p.city_id
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

-- ── Share an event to your circle ────────────────────────────────────────
create or replace function public.share_event(p_event bigint, p_note text default null, p_audience public.pin_audience default 'circle')
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ev public.events;
  pin_id bigint;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null or private.is_blocked(me, ev.host_id) then raise exception 'Event not found.' using errcode = 'check_violation'; end if;
  if ev.group_id is not null and not private.is_group_member(ev.group_id, me) then
    raise exception 'Only group members can share this event.' using errcode = 'check_violation';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Keep it under 500 characters.' using errcode = 'check_violation'; end if;
  insert into public.pins (author_id, category, body, audience, approx_location, place_label, venue_id, event_id, city_id)
  values (me, 'event', coalesce(nullif(trim(p_note), ''), 'Who''s coming? ' || ev.title), p_audience, ev.approx_location,
          coalesce((select name from public.venues where id = ev.venue_id), ev.place_text), ev.venue_id, ev.id,
          (select city_id from public.profiles where id = me))
  returning id into pin_id;
  return pin_id;
end $$;

-- ── Usage counts ─────────────────────────────────────────────────────────
-- Event names only (e.g. 'pin_posted', 'home_opened'), plus a few small
-- details. Never message or pin text. Kept 180 days.
create table public.analytics_events (
  id         bigserial primary key,
  user_id    uuid references public.profiles (id) on delete cascade,
  name       text not null check (name ~ '^[a-z][a-z_]{1,48}$'),
  props      jsonb not null default '{}' check (pg_column_size(props) <= 1024),
  created_at timestamptz not null default now()
);
create index analytics_events_name_idx on public.analytics_events (name, created_at desc);
create index analytics_events_user_idx on public.analytics_events (user_id);
alter table public.analytics_events enable row level security;  -- admins read through admin_usage()

create or replace function public.track(p_name text, p_props jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.analytics_events (user_id, name, props) values (auth.uid(), p_name, coalesce(p_props, '{}'))
$$;

-- Admin view: how many people used each feature (last 7 and 30 days).
create or replace function public.admin_usage()
returns table (name text, people_7d integer, events_7d integer, people_30d integer, events_30d integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce((select role::text from public.profiles where id = auth.uid()), '') <> 'admin' then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;
  return query
  select e.name,
         count(distinct e.user_id) filter (where e.created_at > now() - interval '7 days')::int,
         count(*) filter (where e.created_at > now() - interval '7 days')::int,
         count(distinct e.user_id)::int, count(*)::int
  from public.analytics_events e where e.created_at > now() - interval '30 days'
  group by e.name order by 4 desc;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('prune-analytics', '31 4 * * *', 'delete from public.analytics_events where created_at < now() - interval ''180 days''');
  end if;
end $$;

-- ── Home, in one request ─────────────────────────────────────────────────
create or replace function public.home_feed(p_scope text default 'friends', p_lat double precision default null, p_lng double precision default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with circle as (select private.first_degree_ids(auth.uid()) as id),
  tonight as (select * from public.tonight_network()),
  posted as (
    select distinct on (p.author_id) p.author_id, p.created_at
    from public.pins p
    where p.deleted_at is null and p.created_at > now() - interval '24 hours'
      and p.author_id in (select id from circle) and private.can_see_pin(p.id, auth.uid())
    order by p.author_id, p.created_at desc)
  select jsonb_build_object(
    'circle_count', (select count(*) from circle),
    'me', jsonb_build_object(
      'out_tonight', exists (select 1 from tonight where is_me),
      'in_now', exists (select 1 from tonight where is_me and here_since is not null)),
    -- The people row: In now first, then going out tonight, then posted today.
    'people', coalesce((
      select jsonb_agg(x order by x->>'rank', x->>'display_name') from (
        select jsonb_build_object('id', user_id, 'display_name', display_name, 'avatar_url', avatar_url,
                 'kind', case when here_since is not null then 'in' else 'out' end, 'place', place,
                 'rank', case when here_since is not null then '1' else '2' end) as x
        from tonight where not is_me
        union all
        select jsonb_build_object('id', pr.id, 'display_name', pr.display_name, 'avatar_url', pr.avatar_url,
                 'kind', 'posted', 'place', null, 'rank', '3')
        from posted po join public.profiles pr on pr.id = po.author_id
        where po.author_id not in (select user_id from tonight)
        limit 30) s), '[]'::jsonb),
    -- Live moments: someone you know is In somewhere right now.
    'live', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.user_id, 'display_name', a.display_name, 'avatar_url', a.avatar_url,
               'place', a.place, 'since', a.here_since,
               'circle_there', (select count(*) from tonight b where b.place = a.place and b.here_since is not null and b.user_id <> a.user_id and not b.is_me))
             order by a.here_since desc)
      from tonight a where a.here_since is not null and not a.is_me and a.place is not null), '[]'::jsonb),
    -- Upcoming events your circle is going to (or you are), next 7 days.
    'events', coalesce((
      select jsonb_agg(e order by e->>'starts_at') from (
        select jsonb_build_object('id', ev.id, 'title', ev.title, 'emoji', ev.emoji, 'starts_at', ev.starts_at,
                 'venue_name', coalesce(v.name, ev.place_text),
                 'circle_going', (select count(*) from public.event_rsvps r where r.event_id = ev.id and r.user_id in (select id from circle)),
                 'going_count', (select count(*) from public.event_rsvps r where r.event_id = ev.id),
                 'i_am_going', exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid())) as e
        from public.events ev left join public.venues v on v.id = ev.venue_id
        where ev.starts_at between now() - interval '2 hours' and now() + interval '7 days'
          and not private.is_blocked(auth.uid(), ev.host_id)
          and (ev.group_id is null or private.is_group_member(ev.group_id, auth.uid()))
          and (exists (select 1 from public.event_rsvps r where r.event_id = ev.id and (r.user_id = auth.uid() or r.user_id in (select id from circle)))
               or ev.host_id in (select id from circle))
        order by ev.starts_at limit 3) s), '[]'::jsonb),
    -- New in your circle this week.
    'new_connections', coalesce((
      select jsonb_agg(jsonb_build_object('id', pr.id, 'display_name', pr.display_name, 'avatar_url', pr.avatar_url, 'since', c.created_at, 'source', c.source)
             order by c.created_at desc)
      from public.connections c
      join public.profiles pr on pr.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
      where auth.uid() in (c.user_a, c.user_b) and c.created_at > now() - interval '7 days'), '[]'::jsonb),
    'pins', coalesce((
      select jsonb_agg(to_jsonb(f)) from public.pins_feed(case when p_scope = 'everyone' then 'community' else 'friends' end,
                                                          p_lat, p_lng, null, null, null, null, null, 15) f), '[]'::jsonb),
    'placement', (select to_jsonb(fp) from public.feed_placement(p_lat, p_lng) fp limit 1),
    'group_chats', coalesce((
      select jsonb_agg(to_jsonb(i)) from (select * from public.inbox() i where i.kind <> 'direct' limit 3) i), '[]'::jsonb),
    'date_mode', public.date_mode_status(),
    'dates_waiting', (select count(*) from public.date_requests d where d.to_id = auth.uid() and d.status = 'pending'),
    'pick', (select to_jsonb(tp) from public.tonight_pick() tp limit 1)
  )
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.follow_user(uuid)', 'public.unfollow_user(uuid)', 'public.follow_info(uuid)',
    'public.pins_feed(text, double precision, double precision, numeric, public.pin_category, uuid, bigint, timestamptz, integer)',
    'public.share_event(bigint, text, public.pin_audience)',
    'public.track(text, jsonb)', 'public.admin_usage()',
    'public.home_feed(text, double precision, double precision)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
