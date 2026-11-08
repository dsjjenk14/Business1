-- Make your profile your own: a header photo and a profile color.
alter table public.profiles add column if not exists header_url text;
alter table public.profiles add column if not exists profile_color text
  check (profile_color is null or profile_color in ('red', 'gold', 'green', 'blue'));

grant update (profile_color) on public.profiles to authenticated;

-- The header photo must be one you uploaded to your own folder. Null removes it.
create or replace function public.set_profile_header(p_url text) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); u text := nullif(trim(coalesce(p_url, '')), '');
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if u is not null and u not like '%/storage/v1/object/public/avatars/' || me::text || '/%' then
    raise exception 'Upload the photo first.' using errcode = 'check_violation';
  end if;
  update public.profiles set header_url = u where id = me;
  return u;
end $$;
revoke all on function public.set_profile_header(text) from public, anon;
grant execute on function public.set_profile_header(text) to authenticated;

do $$
declare
  src text := pg_get_functiondef('public.profile_card(uuid)'::regprocedure);
  old text := $p$'mood', p.mood,$p$;
begin
  if position(old in src) = 0 then raise exception 'header patch: text not found in profile_card'; end if;
  execute replace(src, old, $p$'mood', p.mood, 'header_url', p.header_url, 'profile_color', p.profile_color,$p$);
end $$;
