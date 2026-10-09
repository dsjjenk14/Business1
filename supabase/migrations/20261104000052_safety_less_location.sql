-- Safety: show less about where people are.
--   1. Vouch counts always show (they're how people judge who to trust), so
--      the "hide my vouch count" option is gone.
--   2. Vouches no longer say where two people met.
--   3. The Tonight list no longer says how far away someone going out is.
--      (Each plan's own "who sees it" and "show where I'm going" still apply.)

-- 1. Vouch counts always show.
update public.user_settings set show_vouch_count = true where not show_vouch_count;
alter table public.user_settings alter column show_vouch_count set default true;
alter table public.user_settings drop constraint if exists vouch_count_always_shown;
alter table public.user_settings add constraint vouch_count_always_shown check (show_vouch_count);

create or replace function public.visible_vouch_count(p_user uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select vouch_count from public.profiles where id = p_user
$$;

-- 2 and 3: patch the two functions in place.
do $$
declare
  src text;
begin
  src := pg_get_functiondef('public.profile_card(uuid)'::regprocedure);
  if position($q$'place', e.place_label, 'created_at', vv.created_at$q$ in src) = 0 then
    raise exception 'profile_card: vouch place not found';
  end if;
  execute replace(src, $q$'place', e.place_label, 'created_at', vv.created_at$q$, $q$'place', null, 'created_at', vv.created_at$q$);

  src := pg_get_functiondef('public.going_out_feed(text,double precision,double precision,numeric)'::regprocedure);
  if position(E'''distance_mi'', case when (select g from origin) is not null and g.approx_location is not null\n                              then round((extensions.st_distance(g.approx_location, (select g from origin)) / 1609.344)::numeric, 1) end,' in src) = 0 then
    raise exception 'going_out_feed: person distance not found';
  end if;
  execute replace(src,
    E'''distance_mi'', case when (select g from origin) is not null and g.approx_location is not null\n                              then round((extensions.st_distance(g.approx_location, (select g from origin)) / 1609.344)::numeric, 1) end,',
    '''distance_mi'', null,');
end $$;
