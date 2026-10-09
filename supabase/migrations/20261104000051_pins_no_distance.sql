-- Pins no longer say how far away they were posted ("~11 mi away"): together
-- with a few posts, a distance can help someone work out where a person is.
-- The feed still only shows pins within your radius; it just stops sending
-- the distance (the column stays, always empty, so older app versions work).
do $$
declare
  fn regprocedure := 'public.pins_feed(text,double precision,double precision,numeric,public.pin_category,uuid,bigint,timestamp with time zone,integer)';
  src text := pg_get_functiondef(fn);
  old text := E'case when (select g from origin) is not null and p.approx_location is not null\n      then round((extensions.st_distance(p.approx_location, (select g from origin)) / 1609.344)::numeric, 1) end,';
begin
  if position(old in src) = 0 then
    raise exception 'pins_feed: distance expression not found';
  end if;
  execute replace(src, old, 'null::numeric,');
end $$;
