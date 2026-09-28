-- Nearby works without GPS: when the phone hasn't shared a location and the
-- member has no saved one, Nearby (Pins, Tonight, What's In) centers on their
-- city. New pins without a location are placed at the city too, so they show
-- up in Nearby instead of disappearing.
do $$
declare
  fn text;
  src text;
  out text;
begin
  foreach fn in array array['public.pins_feed', 'public.going_out_feed', 'public.whats_in'] loop
    select pg_get_functiondef(p.oid) into src from pg_proc p where p.oid = fn::regproc;
    out := replace(src,
      '(select approx_location from public.profiles where id = auth.uid())',
      '(select coalesce(pr.approx_location, c.center) from public.profiles pr left join public.cities c on c.id = pr.city_id where pr.id = auth.uid())');
    if out = src then raise exception '% patch did not apply', fn; end if;
    execute out;
  end loop;
end $$;

create or replace function public.pins_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.approx_location is null then
    select coalesce(p.approx_location, c.center) into new.approx_location
    from public.profiles p left join public.cities c on c.id = p.city_id where p.id = new.author_id;
  end if;
  new.approx_location := public.snap_geography(new.approx_location);
  if new.city_id is null then
    select city_id into new.city_id from public.profiles where id = new.author_id;
  end if;
  return new;
end $$;

-- Pins already posted without a location get their author's city.
update public.pins p set approx_location = public.snap_geography(c.center)
from public.profiles pr join public.cities c on c.id = pr.city_id
where p.approx_location is null and pr.id = p.author_id;
