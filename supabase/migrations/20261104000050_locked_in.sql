-- Locked In: the people you go out with most, on your profile (in place of a
-- "Top 8"). Filled in automatically and never ranked by hand. It shows names
-- and photos only, never where or when, and only your Insiders can see it.
--
-- "Go out with" = met in person (GPS-confirmed encounters, counted triple) or
-- went to the same event, in the last 120 days. Only your Insiders appear.

alter table public.user_settings add column if not exists show_locked_in boolean not null default true;

create or replace function public.locked_in(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_user is null then
    return '[]'::jsonb;
  end if;
  if me <> p_user then
    -- Only the person's Insiders, and only if they show it.
    if not private.are_connected(me, p_user) or private.is_blocked(me, p_user) then
      return '[]'::jsonb;
    end if;
    if not coalesce((select show_locked_in from public.user_settings where user_id = p_user), true) then
      return '[]'::jsonb;
    end if;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'display_name', x.display_name, 'avatar_url', x.avatar_url) order by x.score desc, x.display_name)
    from (
     select * from (
      select p.id, p.display_name, p.avatar_url,
             3 * (select count(*) from public.encounters e
                  where e.user_a = least(p_user, p.id) and e.user_b = greatest(p_user, p.id)
                    and e.overlap_start > now() - interval '120 days')
             + (select count(*) from public.event_rsvps r1
                join public.event_rsvps r2 on r2.event_id = r1.event_id and r2.user_id = p.id
                join public.events ev on ev.id = r1.event_id
                where r1.user_id = p_user
                  and ev.starts_at between now() - interval '120 days' and now()) as score
      from public.connections c
      join public.profiles p on p.id = case when c.user_a = p_user then c.user_b else c.user_a end
      left join public.user_settings s on s.user_id = p.id
      where (c.user_a = p_user or c.user_b = p_user)
        and coalesce(s.show_locked_in, true)
        and not private.is_blocked(p_user, p.id)
        -- Never show the viewer someone they've blocked (or who blocked them).
        and (p.id = me or not private.is_blocked(me, p.id))
     ) scored
     where scored.score > 0
     order by scored.score desc, scored.display_name
     limit 6
    ) x
  ), '[]'::jsonb);
end $$;
revoke execute on function public.locked_in(uuid) from public, anon;
grant execute on function public.locked_in(uuid) to authenticated;
