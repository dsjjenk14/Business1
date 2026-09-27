-- I'm In: 009 Social core (Phase 2)
-- Pin feeds, location snapping, pin photo access, profile cards, Go Live,
-- the Home "Going Out Tonight" strip and the tonight pick.

-- ── Location snapping on write ────────────────────────────────────────────
-- Pins and going-out posts are shared publicly, so their location is ALWAYS
-- snapped to the grid (app_config.location_snap_meters), whatever the app sends.
create or replace function public.snap_geography(p extensions.geography)
returns extensions.geography language sql stable set search_path = '' as $$
  select case when p is null then null else
    public.snap_location(extensions.st_x(p::extensions.geometry), extensions.st_y(p::extensions.geometry)) end
$$;

create or replace function public.pins_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.approx_location is null then
    select approx_location into new.approx_location from public.profiles where id = new.author_id;
  end if;
  new.approx_location := public.snap_geography(new.approx_location);
  if new.city_id is null then
    select city_id into new.city_id from public.profiles where id = new.author_id;
  end if;
  return new;
end $$;
create trigger pins_before_insert before insert on public.pins
  for each row execute function public.pins_before_insert();

create or replace function public.going_out_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.approx_location is null and new.venue_id is not null then
    select location into new.approx_location from public.venues where id = new.venue_id;
  end if;
  if new.approx_location is null then
    select approx_location into new.approx_location from public.profiles where id = new.user_id;
  end if;
  new.approx_location := public.snap_geography(new.approx_location);
  return new;
end $$;
create trigger going_out_before_insert before insert on public.going_out_posts
  for each row execute function public.going_out_before_insert();

-- Also snap profile locations when members update them.
create or replace function public.profiles_snap_location()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.location_precision = 'approximate' and new.approx_location is distinct from old.approx_location then
    new.approx_location := public.snap_geography(new.approx_location);
  end if;
  return new;
end $$;
create trigger profiles_snap_location before update on public.profiles
  for each row execute function public.profiles_snap_location();

-- ── Privacy helpers ───────────────────────────────────────────────────────
-- Vouch count as another member may see it (hidden if they turned it off).
create or replace function public.visible_vouch_count(p_user uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select case
    when p_user = auth.uid() or coalesce((select show_vouch_count from public.user_settings where user_id = p_user), true)
      then (select vouch_count from public.profiles where id = p_user)
    else null end
$$;

create or replace function public.shows_going_out_venue(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid() or coalesce((select show_going_out_venue from public.user_settings where user_id = p_user), true)
$$;

-- Radius this member may search, in miles (capped by their plan).
create or replace function public.effective_radius_mi(p_requested numeric, p_limit_key text)
returns numeric language sql stable security definer set search_path = '' as $$
  select least(
    greatest(1, coalesce(p_requested, public.config_num('default_radius_mi'))),
    coalesce(public.plan_limit(auth.uid(), p_limit_key), 1e9),
    coalesce(public.plan_limit(auth.uid(), 'search_radius_mi'), 1e9))
$$;

-- ── Pin feeds ─────────────────────────────────────────────────────────────
-- One function for every pin list in the app:
--   nearby     'Everyone' pins within the radius of the member (Pins → Nearby)
--   trending   the most-discussed nearby pin in the last 72 hours
--   community  all 'Everyone' pins, any distance (Pins → They're In)
--   network    pins from your 1st + 2nd degree (Home → From Your Network)
--   bookmarks  your saved pins
--   author     one member's pins (profiles)
--   single     one pin by id (pin thread)
-- Visibility always goes through can_see_pin, so audiences and blocks hold.
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

-- ── Pin photos: readable by anyone who can see the pin ────────────────────
-- Storage path: <author id>/<pin id>/<position>.<ext>
create policy "read photos of visible pins" on storage.objects for select to authenticated
  using (
    bucket_id = 'pin-photos'
    and (storage.foldername(name))[2] ~ '^\d+$'
    and private.can_see_pin(((storage.foldername(name))[2])::bigint, auth.uid())
  );

-- ── Profile card ──────────────────────────────────────────────────────────
-- Everything a profile screen needs, filtered by that member's privacy settings.
create or replace function public.profile_card(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p.id is null or private.is_blocked(auth.uid(), p_user) then null else jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'display_name', p.display_name,
    'headline', p.headline,
    'bio', p.bio,
    'pronouns', p.pronouns,
    'avatar_url', p.avatar_url,
    'avatar_emoji', p.avatar_emoji,
    'neighborhood', p.neighborhood,
    'city_name', (select name from public.cities where id = p.city_id),
    'age', public.profile_age(p.id),
    'is_founding_member', p.is_founding_member,
    'member_number', p.member_number,
    'is_premium', public.is_premium(p.id),
    'id_verified', p.id_verified_at is not null,
    'photo_verified', p.photo_verified_at is not null,
    'vouch_count', public.visible_vouch_count(p.id),
    'top_vouch_word', p.top_vouch_word,
    'is_me', p.id = auth.uid(),
    'degree', private.degree_between(auth.uid(), p.id),
    'via', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'display_name', v.display_name, 'avatar_emoji', v.avatar_emoji) order by v.vouch_count desc)
      from public.profiles v
      where v.id in (select private.first_degree_ids(auth.uid()) intersect select private.first_degree_ids(p.id))
    ), '[]'::jsonb),
    'can_message', private.can_message(auth.uid(), p.id),
    'circle_count', (select count(*) from private.first_degree_ids(p.id)),
    'tonight', (
      select jsonb_build_object(
        'place', case when public.shows_going_out_venue(p.id) then coalesce(ve.name, g.place_text) end,
        'neighborhood', ve.neighborhood,
        'starts_at', g.starts_at, 'is_hosting', g.is_hosting, 'note', g.note)
      from public.going_out_posts g left join public.venues ve on ve.id = g.venue_id
      where g.user_id = p.id and g.when_kind = 'tonight' and g.expires_at > now()
      order by g.starts_at limit 1),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('id', gr.id, 'name', gr.name, 'emoji', gr.emoji, 'role', gm.role, 'schedule', gr.schedule_label) order by gr.name)
      from public.group_members gm join public.groups gr on gr.id = gm.group_id where gm.user_id = p.id
    ), '[]'::jsonb),
    'vouches', coalesce((
      select jsonb_agg(x order by (x->>'created_at') desc) from (
        select jsonb_build_object(
          'voucher_id', vv.voucher_id, 'display_name', vr.display_name, 'avatar_emoji', vr.avatar_emoji,
          'avatar_url', vr.avatar_url, 'word', w.word, 'type', vv.type,
          'place', e.place_label, 'created_at', vv.created_at) as x
        from public.vouches vv
        join public.profiles vr on vr.id = vv.voucher_id
        left join public.vouch_words w on w.id = vv.word_id
        left join public.encounters e on e.id = vv.encounter_id
        where vv.vouchee_id = p.id and vv.status = 'active' and not private.is_blocked(auth.uid(), vv.voucher_id)
        order by vv.created_at desc limit 20) s
    ), '[]'::jsonb)
  ) end
  from (select p_user as uid) u left join public.profiles p on p.id = u.uid
$$;

-- ── Go Live (going out tonight) ───────────────────────────────────────────
-- "Tonight" ends at 4 AM DC time.
create or replace function public.tonight_ends_at()
returns timestamptz language sql stable set search_path = '' as $$
  select (date_trunc('day', (now() at time zone 'America/New_York') - interval '4 hours') + interval '1 day 4 hours')
         at time zone 'America/New_York'
$$;

-- Marks the member as going out tonight and drops a matching "Going Out" pin
-- (decision C15). Replaces any earlier Go Live from tonight.
create or replace function public.go_live(
  p_place text default null, p_venue_id bigint default null, p_vibes text[] default '{}',
  p_note text default null, p_lat double precision default null, p_lng double precision default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  post_id bigint;
  place text;
  loc extensions.geography;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  perform public.end_live();
  if p_lat is not null and p_lng is not null then loc := public.snap_location(p_lng, p_lat); end if;

  insert into public.going_out_posts (user_id, when_kind, starts_at, expires_at, venue_id, place_text, approx_location, vibes, note, is_priority)
  values (me, 'tonight', now(), public.tonight_ends_at(), p_venue_id, nullif(trim(p_place), ''), loc, coalesce(p_vibes, '{}'),
          nullif(trim(p_note), ''), public.plan_limit(me, 'tonight_priority') = 1)
  returning id into post_id;

  select coalesce(v.name, nullif(trim(p_place), '')) into place from (select 1) x left join public.venues v on v.id = p_venue_id;
  insert into public.pins (author_id, category, body, audience, approx_location, place_label, venue_id, going_out_post_id)
  values (me, 'going_out',
          coalesce(nullif(trim(p_note), ''), 'Going out tonight' || coalesce(' · ' || place, '') || '. Come find me.'),
          case when public.shows_in_nearby(me) then 'everyone' else 'network' end::public.pin_audience,
          loc, place, p_venue_id, post_id);
  return post_id;
end $$;

create or replace function public.end_live()
returns void language sql security definer set search_path = '' as $$
  delete from public.going_out_posts where user_id = auth.uid() and when_kind = 'tonight' and expires_at > now()
$$;

-- ── Home: who in your network is going out tonight ────────────────────────
create or replace function public.tonight_network()
returns table (user_id uuid, display_name text, avatar_emoji text, avatar_url text, place text,
               starts_at timestamptz, is_hosting boolean, degree smallint, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with circle as (select private.first_degree_ids(auth.uid()) as id),
  network as (select id, 1::smallint as degree from circle
              union select user_id, 2::smallint from private.second_degree(auth.uid()))
  select distinct on (g.user_id)
    g.user_id, p.display_name, p.avatar_emoji, p.avatar_url,
    case when public.shows_going_out_venue(g.user_id) then coalesce(v.name, g.place_text) end,
    g.starts_at, g.is_hosting, coalesce(n.degree, 0::smallint), g.user_id = auth.uid()
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

-- ── Home: tonight's pick (rule-based; the AI version replaces it in Phase 7) ──
-- The event tonight that the most people in your network are going to.
create or replace function public.tonight_pick()
returns table (event_id bigint, title text, emoji text, venue_name text, neighborhood text, starts_at timestamptz,
               host_name text, network_going text[], going_count integer, spots_left integer)
language sql stable security definer set search_path = '' as $$
  with network as (select private.first_degree_ids(auth.uid()) as id union select user_id from private.second_degree(auth.uid()))
  select e.id, e.title, e.emoji, v.name, v.neighborhood, e.starts_at, h.display_name,
         array(select p.display_name from public.event_rsvps r join public.profiles p on p.id = r.user_id
               where r.event_id = e.id and r.user_id in (select id from network) and r.user_id <> e.host_id
               order by p.vouch_count desc limit 3),
         (select count(*)::int from public.event_rsvps r where r.event_id = e.id),
         case when e.capacity is null then null
              else greatest(0, e.capacity - (select count(*)::int from public.event_rsvps r where r.event_id = e.id)) end
  from public.events e
  join public.profiles h on h.id = e.host_id
  left join public.venues v on v.id = e.venue_id
  where e.starts_at between now() - interval '2 hours' and public.tonight_ends_at()
    and not private.is_blocked(auth.uid(), e.host_id)
    and not exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = auth.uid())
  order by (select count(*) from public.event_rsvps r where r.event_id = e.id and r.user_id in (select id from network)) desc,
           e.starts_at
  limit 1
$$;

revoke execute on function public.go_live(text, bigint, text[], text, double precision, double precision) from public, anon;
grant execute on function public.go_live(text, bigint, text[], text, double precision, double precision) to authenticated;
revoke execute on function public.end_live() from public, anon;
grant execute on function public.end_live() to authenticated;
revoke execute on function public.pins_feed(text, double precision, double precision, numeric, public.pin_category, uuid, bigint, timestamptz, integer) from public, anon;
grant execute on function public.pins_feed(text, double precision, double precision, numeric, public.pin_category, uuid, bigint, timestamptz, integer) to authenticated;
revoke execute on function public.profile_card(uuid) from public, anon;
grant execute on function public.profile_card(uuid) to authenticated;
revoke execute on function public.tonight_network() from public, anon;
grant execute on function public.tonight_network() to authenticated;
revoke execute on function public.tonight_pick() from public, anon;
grant execute on function public.tonight_pick() to authenticated;
