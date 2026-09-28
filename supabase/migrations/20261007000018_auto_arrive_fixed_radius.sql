-- 1. Radius is always 75 miles, for everyone (no slider, not a Premium perk).
-- 2. Arriving is automatic: "I'm In" is what you tap to say you're going.
--    When your phone's GPS shows you at the event (or at the place you said
--    you're going out to), the app marks you as there.

update public.plan_limits set free_value = 75, premium_value = 75 where key in ('search_radius_mi', 'pins_radius_max_mi');
update public.app_config set value = '75'::jsonb where key in ('default_radius_mi', 'tonight_radius_max_mi');
update public.user_settings set radius_mi = 75 where radius_mi is distinct from 75;
alter table public.user_settings alter column radius_mi set default 75;

insert into public.app_config (key, value, description) values
  ('arrival_radius_m', '150', 'How close (meters) your GPS must be to a place for the app to mark you as there.')
on conflict (key) do nothing;

-- Is there anything the app should watch for right now? (Cheap: lets the
-- phone skip GPS entirely when you have no plans.)
create or replace function public.arrival_targets()
returns integer language sql stable security definer set search_path = '' as $$
  select (
    (select count(*) from public.event_rsvps r join public.events ev on ev.id = r.event_id
      where r.user_id = auth.uid() and ev.venue_id is not null
        and now() between ev.starts_at - interval '1 hour' and coalesce(ev.ends_at, ev.starts_at + interval '3 hours') + interval '3 hours'
        and not exists (select 1 from public.location_pings lp
                         where lp.user_id = auth.uid() and lp.event_id = ev.id and lp.purpose = 'checkin'))
    + (select count(*) from public.going_out_posts g
        where g.user_id = auth.uid() and g.when_kind = 'tonight' and g.venue_id is not null
          and g.expires_at > now() and g.starts_at < now() + interval '1 hour')
  )::integer
$$;

-- Called by the phone with a GPS reading. Marks you there at any event you
-- said I'm In to (and your night-out place) that you're standing at.
-- Never errors on a bad reading: it just does nothing.
create or replace function public.auto_arrive(p_lat double precision, p_lng double precision, p_accuracy_m real default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  here extensions.geography;
  near double precision := public.config_num('arrival_radius_m');
  ev record;
  post record;
  arrived jsonb := '[]'::jsonb;
begin
  if me is null or p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then return arrived; end if;
  if p_accuracy_m is not null and p_accuracy_m > public.config_num('checkin_max_accuracy_m') then return arrived; end if;
  here := extensions.st_setsrid(extensions.st_point(p_lng, p_lat), 4326)::extensions.geography;

  for ev in
    select e.id, e.title, e.venue_id, v.name as venue_name
    from public.event_rsvps r
    join public.events e on e.id = r.event_id
    join public.venues v on v.id = e.venue_id
    where r.user_id = me
      and now() between e.starts_at - interval '1 hour' and coalesce(e.ends_at, e.starts_at + interval '3 hours') + interval '3 hours'
      and extensions.st_dwithin(v.location, here, near)
      and not exists (select 1 from public.location_pings lp where lp.user_id = me and lp.event_id = e.id and lp.purpose = 'checkin')
  loop
    perform public.check_in(p_lat, p_lng, p_accuracy_m, ev.venue_id, ev.id);
    arrived := arrived || jsonb_build_object('kind', 'event', 'id', ev.id, 'title', ev.title, 'place', ev.venue_name);
  end loop;

  select g.id, g.live_until, v.name as venue_name into post
  from public.going_out_posts g join public.venues v on v.id = g.venue_id
  where g.user_id = me and g.when_kind = 'tonight' and g.expires_at > now() and g.starts_at < now() + interval '1 hour'
    and extensions.st_dwithin(v.location, here, near)
  order by g.created_at desc limit 1;
  if post.id is not null then
    perform public.im_here(post.id, p_lat, p_lng);
    if post.live_until is null or post.live_until <= now() then
      arrived := arrived || jsonb_build_object('kind', 'place', 'id', post.id, 'title', post.venue_name, 'place', post.venue_name);
    end if;
  end if;
  return arrived;
end $$;

-- Event detail now says whether you're there.
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

do $$
declare f text;
begin
  foreach f in array array[
    'public.arrival_targets()',
    'public.auto_arrive(double precision, double precision, real)',
    'public.event_detail(bigint)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
