-- Posts that share an event now carry the event (title, time, who's going,
-- whether you're in), so the post itself has an I'm In button.
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
  event_id bigint, event_title text, event_starts_at timestamptz, event_going_count integer, event_i_am_going boolean)
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
    case when ev.id is not null then exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid()) end
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

revoke execute on function public.pins_feed(text, double precision, double precision, numeric, public.pin_category, uuid, bigint, timestamptz, integer) from public, anon;
grant execute on function public.pins_feed(text, double precision, double precision, numeric, public.pin_category, uuid, bigint, timestamptz, integer) to authenticated;

-- Sharing the same event twice would just repeat the post.
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
  if exists (select 1 from public.pins where author_id = me and event_id = p_event and category = 'event' and deleted_at is null) then
    raise exception 'You already shared this event.' using errcode = 'check_violation';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Keep it under 500 characters.' using errcode = 'check_violation'; end if;
  insert into public.pins (author_id, category, body, audience, approx_location, place_label, venue_id, event_id, city_id)
  values (me, 'event', coalesce(nullif(trim(p_note), ''), 'Who''s coming? ' || ev.title), p_audience, ev.approx_location,
          coalesce((select name from public.venues where id = ev.venue_id), ev.place_text), ev.venue_id, ev.id,
          (select city_id from public.profiles where id = me))
  returning id into pin_id;
  return pin_id;
end $$;
