-- For the App Store build: the phone watches the places you said I'm In to
-- (a "geofence" around each), so you're marked there even when the app is
-- closed. This lists them: events you're going to in the next day and your
-- night-out place tonight. Venue locations are public; nothing about you is.
create or replace function public.arrival_regions()
returns table (key text, title text, lat double precision, lng double precision, radius_m double precision)
language sql stable security definer set search_path = '' as $$
  select * from (
    select 'event-' || e.id, e.title,
           extensions.st_y(v.location::extensions.geometry), extensions.st_x(v.location::extensions.geometry),
           public.config_num('arrival_radius_m')::double precision
    from public.event_rsvps r
    join public.events e on e.id = r.event_id
    join public.venues v on v.id = e.venue_id
    where r.user_id = auth.uid()
      and e.starts_at < now() + interval '1 day'
      and coalesce(e.ends_at, e.starts_at + interval '3 hours') + interval '3 hours' > now()
      and not exists (select 1 from public.location_pings lp where lp.user_id = auth.uid() and lp.event_id = e.id and lp.purpose = 'checkin')
    union all
    select 'place-' || g.id, v.name,
           extensions.st_y(v.location::extensions.geometry), extensions.st_x(v.location::extensions.geometry),
           public.config_num('arrival_radius_m')::double precision
    from public.going_out_posts g join public.venues v on v.id = g.venue_id
    where g.user_id = auth.uid() and g.when_kind = 'tonight' and g.expires_at > now()
  ) x
  limit 20  -- iPhones watch at most 20 places per app
$$;

revoke execute on function public.arrival_regions() from public, anon;
grant execute on function public.arrival_regions() to authenticated;
