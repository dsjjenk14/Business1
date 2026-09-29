-- Virtual events. If you run a group, you can host an event online for it
-- (or both online and in person). The room can be:
--   voice  : a group voice chat, everyone can talk
--   video  : a group video call, everyone on camera
--   stream : a livestream, the host (and group admins) on camera, everyone
--            else watches and chats
--   link   : your own link (Zoom, Google Meet, Instagram Live, YouTube…)
-- Only the people going (and the host) get in; rooms open 15 minutes before
-- the start. Voice and video run on LiveKit, like live video.
alter table public.events
  add column format text not null default 'in_person' check (format in ('in_person', 'virtual', 'hybrid')),
  add column room_kind text check (room_kind in ('voice', 'video', 'stream', 'link')),
  add constraint events_virtual_has_room check (format = 'in_person' or room_kind is not null);

-- Links are only for people going, so they live apart from the events table.
create table public.event_links (
  event_id bigint primary key references public.events (id) on delete cascade,
  url      text not null check (url ~* '^https://[^\s]+$' and char_length(url) <= 500)
);
alter table public.event_links enable row level security;
revoke all on public.event_links from anon, authenticated;

/** Make an event virtual, hybrid, or back to in person. Online events are for groups you run. */
create or replace function public.set_event_virtual(p_event bigint, p_format text, p_room_kind text default null, p_join_url text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  ev public.events;
  url text := nullif(trim(p_join_url), '');
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null or ev.host_id <> auth.uid() then
    raise exception 'Only the host can change this.' using errcode = 'insufficient_privilege';
  end if;
  if p_format not in ('in_person', 'virtual', 'hybrid') then
    raise exception 'Pick in person, online, or both.' using errcode = 'check_violation';
  end if;
  if p_format = 'in_person' then
    update public.events set format = 'in_person', room_kind = null where id = p_event;
    delete from public.event_links where event_id = p_event;
    return;
  end if;
  if ev.group_id is null or not private.is_group_admin(ev.group_id, auth.uid()) then
    raise exception 'Online events are for groups you run. Post it for your group.' using errcode = 'check_violation';
  end if;
  if p_room_kind not in ('voice', 'video', 'stream', 'link') then
    raise exception 'Pick how people join.' using errcode = 'check_violation';
  end if;
  if p_room_kind = 'link' then
    if url is null or url !~* '^https://[^\s]+$' or char_length(url) > 500 then
      raise exception 'Add a link that starts with https://' using errcode = 'check_violation';
    end if;
    insert into public.event_links (event_id, url) values (p_event, url)
      on conflict (event_id) do update set url = excluded.url;
  else
    delete from public.event_links where event_id = p_event;
  end if;
  update public.events set format = p_format, room_kind = p_room_kind where id = p_event;
end $$;
revoke execute on function public.set_event_virtual(bigint, text, text, text) from public, anon;
grant execute on function public.set_event_virtual(bigint, text, text, text) to authenticated;

/** Can this person run the room (host, or an admin of the event's group)? */
create or replace function private.event_room_host(p_event bigint, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event
                 and (e.host_id = p_user or (e.group_id is not null and private.is_group_admin(e.group_id, p_user))))
$$;

/** When the room is open: 15 minutes before the start until 30 minutes after the end. */
create or replace function private.event_room_open(e public.events) returns boolean
language sql stable set search_path = '' as $$
  select now() between e.starts_at - interval '15 minutes' and coalesce(e.ends_at, e.starts_at + interval '4 hours') + interval '30 minutes'
$$;

/** Server only: may this person join the event's room, and as what? */
create or replace function public.event_room_join_check(p_event bigint, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.events;
  host boolean;
begin
  select * into e from public.events where id = p_event;
  if e.id is null or private.event_hidden(p_event, p_user) or private.is_blocked(p_user, e.host_id) then
    return jsonb_build_object('error', 'Event not found.');
  end if;
  if e.format = 'in_person' or e.room_kind not in ('voice', 'video', 'stream') then
    return jsonb_build_object('error', 'This event doesn''t have a room.');
  end if;
  host := private.event_room_host(p_event, p_user);
  if not host and not exists (select 1 from public.event_rsvps where event_id = p_event and user_id = p_user) then
    return jsonb_build_object('error', 'Say I''m In to join the room.');
  end if;
  if not private.event_room_open(e) then
    return jsonb_build_object('error', case when now() < e.starts_at then 'The room opens 15 minutes before the start.' else 'This event has ended.' end);
  end if;
  return jsonb_build_object(
    'room', 'event-' || e.id,
    'kind', e.room_kind,
    'role', case when host then 'host' else 'guest' end,
    'name', (select display_name from public.profiles where id = p_user),
    'title', e.title,
    'minutes', greatest(30, ceil(extract(epoch from (coalesce(e.ends_at, e.starts_at + interval '4 hours') + interval '30 minutes' - now())) / 60)));
end $$;
revoke execute on function public.event_room_join_check(bigint, uuid) from public, anon, authenticated;
grant execute on function public.event_room_join_check(bigint, uuid) to service_role;

-- The event page shows how it happens, whether the room is open, and the
-- link (only to the people going).
do $$
declare
  src text := pg_get_functiondef('public.event_detail(bigint)'::regprocedure);
  out text;
begin
  out := replace(src, $x$'is_host', ev.host_id = auth.uid(), 'visibility', ev.visibility,$x$,
    $x$'is_host', ev.host_id = auth.uid(), 'visibility', ev.visibility,
    'format', ev.format, 'room_kind', ev.room_kind, 'room_open', ev.format <> 'in_person' and private.event_room_open(ev),
    'can_run_room', private.event_room_host(ev.id, auth.uid()),
    'join_url', case when ev.room_kind = 'link'
                      and (private.event_room_host(ev.id, auth.uid())
                           or exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid()))
                     then (select url from public.event_links where event_id = ev.id) end,$x$);
  if out = src then raise exception 'event_detail patch did not apply'; end if;
  execute out;
end $$;
