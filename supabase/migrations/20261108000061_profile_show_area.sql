-- Choose whether your area (neighborhood and city) shows on your profile.
-- Your city still picks what's near you; this only hides it from people looking at your profile.
alter table public.profiles add column if not exists show_area boolean not null default true;

grant update (show_area) on public.profiles to authenticated;

do $$
declare
  src text := pg_get_functiondef('public.profile_card(uuid)'::regprocedure);
  old1 text := $p$'neighborhood', p.neighborhood,$p$;
  old2 text := $p$'city_name', (select name from public.cities where id = p.city_id),$p$;
begin
  if position(old1 in src) = 0 or position(old2 in src) = 0 then
    raise exception 'show_area patch: text not found in profile_card';
  end if;
  src := replace(src, old1, $p$'neighborhood', case when p.show_area then p.neighborhood end, 'show_area', p.show_area,$p$);
  src := replace(src, old2, $p$'city_name', case when p.show_area then (select name from public.cities where id = p.city_id) end,$p$);
  execute src;
end $$;
