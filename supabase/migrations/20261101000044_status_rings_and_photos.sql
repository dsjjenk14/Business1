-- Status rings and rotating profile photos.
--   · A colored ring shows when someone is live, out (here now), or in a
--     virtual event's room, to the people allowed to see that.
--   · Up to 3 profile photos; the app rotates through them. The first one is
--     the main photo (profiles.avatar_url).

-- ── Profile photos ────────────────────────────────────────────────────────
alter table public.profiles add column if not exists photo_urls text[] not null default '{}'
  check (cardinality(photo_urls) <= 3);

-- Set your photos (1 to 3, in order). Each must be your own upload in the
-- avatars bucket. The first becomes your main photo.
create or replace function public.set_profile_photos(p_urls text[])
returns text[] language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  urls text[] := (select coalesce(array_agg(u order by i), '{}') from unnest(coalesce(p_urls, '{}')) with ordinality x(u, i)
                  where nullif(trim(u), '') is not null);
  u text;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if cardinality(urls) > 3 then raise exception 'Up to 3 profile photos.' using errcode = 'check_violation'; end if;
  foreach u in array urls loop
    if u not like '%/storage/v1/object/public/avatars/' || me::text || '/%' then
      raise exception 'Upload the photo first.' using errcode = 'check_violation';
    end if;
  end loop;
  update public.profiles set photo_urls = urls, avatar_url = urls[1] where id = me;
  return urls;
end $$;
revoke execute on function public.set_profile_photos(text[]) from public, anon;
grant execute on function public.set_profile_photos(text[]) to authenticated;

-- Keep your first photo in the list when the main photo changes the old way
-- (signup, or an older app version).
create or replace function private.sync_photo_urls() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.avatar_url is distinct from old.avatar_url and new.photo_urls is not distinct from old.photo_urls then
    new.photo_urls := case
      when new.avatar_url is null then '{}'::text[]
      when cardinality(new.photo_urls) = 0 then array[new.avatar_url]
      else (array[new.avatar_url] || new.photo_urls[2:3]) end;
  end if;
  return new;
end $$;
drop trigger if exists profiles_sync_photo_urls on public.profiles;
create trigger profiles_sync_photo_urls before update of avatar_url on public.profiles
  for each row execute function private.sync_photo_urls();
update public.profiles set photo_urls = array[avatar_url] where avatar_url is not null and cardinality(photo_urls) = 0;

-- ── Who's in a virtual event's room right now ─────────────────────────────
-- The room checks in about once a minute while you're connected.
create table if not exists public.event_room_presence (
  event_id bigint not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_seen timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_room_presence_user_idx on public.event_room_presence (user_id, last_seen desc);
alter table public.event_room_presence enable row level security;  -- server only
revoke all on public.event_room_presence from anon, authenticated;

-- Server only (the event-room function, after checking the room pass).
create or replace function public.event_room_ping(p_room text, p_user uuid, p_leave boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare ev bigint;
begin
  if p_room !~ '^event-[0-9]+$' then return false; end if;
  ev := substring(p_room from 7)::bigint;
  if not exists (select 1 from public.events where id = ev) then return false; end if;
  if coalesce(p_leave, false) then
    delete from public.event_room_presence where event_id = ev and user_id = p_user;
  else
    insert into public.event_room_presence (event_id, user_id) values (ev, p_user)
    on conflict (event_id, user_id) do update set last_seen = now();
  end if;
  return true;
end $$;
revoke execute on function public.event_room_ping(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.event_room_ping(text, uuid, boolean) to service_role;

-- ── Status + photos for a set of people ───────────────────────────────────
-- status: 'live' (on a live video you can watch), 'virtual' (in a virtual
-- event's room; your Insiders see it), 'out' (here now somewhere, to people
-- that post's "here" audience allows), or null. Live wins, then virtual.
create or replace function public.people_status(p_ids uuid[])
returns table (user_id uuid, status text, photos text[])
language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as id),
  ids as (
    select distinct x as id from unnest(coalesce(p_ids, '{}')) with ordinality u(x, i)
    where x is not null and i <= 200
  )
  select p.id,
    case
      when exists (select 1 from public.live_streams s
                   where s.host_id = p.id and private.live_is_on(s) and private.can_see_live(s.id, (select id from me))) then 'live'
      when (p.id = (select id from me) or private.are_connected((select id from me), p.id))
           and exists (select 1 from public.event_room_presence r
                       where r.user_id = p.id and r.last_seen > now() - interval '2 minutes') then 'virtual'
      when exists (select 1 from public.going_out_posts g
                   where g.user_id = p.id and g.arrived_at is not null and g.live_until > now()
                     and private.can_see_here(g.id, g.user_id, g.here_audience, private.degree_between((select id from me), g.user_id))) then 'out'
    end,
    case when cardinality(p.photo_urls) > 0 then p.photo_urls
         when p.avatar_url is not null then array[p.avatar_url] else '{}'::text[] end
  from ids join public.profiles p on p.id = ids.id
  where (select id from me) is not null
    and not private.is_blocked((select id from me), p.id)
$$;
revoke execute on function public.people_status(uuid[]) from public, anon;
grant execute on function public.people_status(uuid[]) to authenticated;

-- Old room check-ins are cleared daily.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('prune-room-presence', '41 4 * * *',
      'delete from public.event_room_presence where last_seen < now() - interval ''1 day''');
  end if;
end $$;
