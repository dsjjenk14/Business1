-- Changes from the tester feedback round.

-- ── Premium is $4.99 a month ────────────────────────────────────────────────
update public.app_config set value = '499' where key = 'premium_price_cents';
update public.app_config set value = '4.99' where key = 'premium_price_usd';

-- ── Outs can last until the next morning (the new default) ─────────────────
-- 11 AM in DC: today's if that's at least 6 hours away, otherwise tomorrow's.
create or replace function private.next_morning() returns timestamptz
language sql stable set search_path = '' as $$
  select case when m > now() + interval '6 hours' then m else m + interval '1 day' end
  from (select (date_trunc('day', now() at time zone 'America/New_York') + interval '11 hours') at time zone 'America/New_York' as m) s
$$;

do $$
declare
  pairs text[][] := array[
    array['public.send_out(text,text,uuid[],boolean,text,integer,uuid[])',
          $p$now() + make_interval(hours => hours), ev,$p$,
          $p$case when p_hours = 0 then private.next_morning() else now() + make_interval(hours => hours) end, ev,$p$],
    array['public.send_out(text,text,uuid[],boolean,text,integer,uuid[])',
          $p$'Tap to open it. It disappears in ' || hours || ' hours unless you pin it.'$p$,
          $p$case when p_hours = 0 then 'Tap to open it. It disappears tomorrow morning unless you pin it.'
               else 'Tap to open it. It disappears in ' || hours || ' hours unless you pin it.' end$p$]
  ];
  i int;
  src text;
begin
  for i in 1 .. array_length(pairs, 1) loop
    src := pg_get_functiondef(pairs[i][1]::regprocedure);
    if position(pairs[i][2] in src) = 0 then
      raise exception 'tester feedback patch %: text not found in %', i, pairs[i][1];
    end if;
    execute replace(src, pairs[i][2], pairs[i][3]);
  end loop;
end $$;

-- ── Event tags: 30+, Low-key, New faces welcome ────────────────────────────
alter table public.events add column if not exists tags text[] not null default '{}';
alter table public.events drop constraint if exists events_tags_known;
alter table public.events add constraint events_tags_known check (tags <@ array['thirty_plus', 'low_key', 'newcomers']);

create or replace function public.set_event_tags(p_event bigint, p_tags text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.events where id = p_event and host_id = auth.uid()) then
    raise exception 'Only the host can change this.' using errcode = 'insufficient_privilege';
  end if;
  update public.events
     set tags = (select coalesce(array_agg(distinct t order by t), '{}') from unnest(coalesce(p_tags, '{}')) t
                  where t in ('thirty_plus', 'low_key', 'newcomers'))
   where id = p_event;
end $$;
revoke execute on function public.set_event_tags(bigint, text[]) from public, anon;
grant execute on function public.set_event_tags(bigint, text[]) to authenticated;

-- Age, worked out privately from the birthday (never shown).
create or replace function private.age_of(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select extract(year from age(birthdate))::int from public.profile_private where id = p_user
$$;

-- 30+ events and plans: people under 30 can't say I'm In (the host always can).
create or replace function private.thirty_plus_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare is_30 boolean; host uuid;
begin
  if tg_table_name = 'event_rsvps' then
    select 'thirty_plus' = any(tags), host_id into is_30, host from public.events where id = new.event_id;
  else
    select 'thirty_plus' = any(vibes), user_id into is_30, host from public.going_out_posts where id = new.post_id;
  end if;
  if coalesce(is_30, false) and new.user_id <> host and coalesce(private.age_of(new.user_id), 0) < 30 then
    raise exception 'This one''s for people 30 and over.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists event_rsvps_thirty_plus on public.event_rsvps;
create trigger event_rsvps_thirty_plus before insert on public.event_rsvps
  for each row execute function private.thirty_plus_gate();
drop trigger if exists going_out_joins_thirty_plus on public.going_out_joins;
create trigger going_out_joins_thirty_plus before insert on public.going_out_joins
  for each row execute function private.thirty_plus_gate();

-- Events you can go to without knowing anyone: public, coming up this week,
-- with room left. "New faces welcome" events first.
create or replace function public.newcomer_events(p_limit int default 6)
returns table (id bigint, title text, emoji text, cover_url text, starts_at timestamptz, place text,
               host_name text, going_count int, newcomers boolean, tags text[])
language sql stable security definer set search_path = '' as $$
  select e.id, e.title, e.emoji, e.cover_url, e.starts_at, coalesce(v.name, e.place_text), h.display_name,
         (select count(*)::int from public.event_rsvps r where r.event_id = e.id),
         'newcomers' = any(e.tags), e.tags
  from public.events e
  join public.profiles h on h.id = e.host_id
  left join public.venues v on v.id = e.venue_id
  where e.visibility = 'public' and e.surprise_for is null
    and e.starts_at between now() and now() + interval '7 days'
    and not private.is_blocked(auth.uid(), e.host_id) and not private.event_hidden(e.id, auth.uid())
    and not exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = auth.uid())
    and (e.capacity is null or (select count(*) from public.event_rsvps r where r.event_id = e.id) < e.capacity)
    and ('newcomers' = any(e.tags) or e.ticket_price_cents is null or e.ticket_price_cents = 0)
  order by ('newcomers' = any(e.tags)) desc, e.starts_at
  limit least(greatest(coalesce(p_limit, 6), 1), 20)
$$;
revoke execute on function public.newcomer_events(int) from public, anon;
grant execute on function public.newcomer_events(int) to authenticated;

-- ── Hosts can message everyone going ──────────────────────────────────────
create table if not exists public.event_updates (
  id bigserial primary key,
  event_id bigint not null references public.events (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists event_updates_event_idx on public.event_updates (event_id, created_at desc);
alter table public.event_updates enable row level security;
-- Read and written through the functions below only.

create or replace function public.message_event_guests(p_event bigint, p_body text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ev public.events;
  msg text := trim(coalesce(p_body, ''));
  n int;
begin
  select * into ev from public.events where id = p_event;
  if ev.id is null or ev.host_id <> me then
    raise exception 'Only the host can message everyone going.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(msg) < 1 or char_length(msg) > 280 then
    raise exception 'Write a short update (280 characters at most).' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.event_updates where event_id = p_event and created_at > now() - interval '1 day') >= 5 then
    raise exception 'That''s 5 updates today. Try again tomorrow.' using errcode = 'check_violation';
  end if;
  insert into public.event_updates (event_id, author_id, body) values (p_event, me, msg);
  perform private.notify(r.user_id, 'event_update', 'Update: ' || ev.title, msg, me, '/events/' || ev.id)
  from public.event_rsvps r
  where r.event_id = p_event and r.user_id <> me and not private.is_blocked(me, r.user_id);
  get diagnostics n = row_count;
  return (select count(*)::int from public.event_rsvps where event_id = p_event and user_id <> me);
end $$;
revoke execute on function public.message_event_guests(bigint, text) from public, anon;
grant execute on function public.message_event_guests(bigint, text) to authenticated;

-- Updates show on the event page to the host and everyone going.
create or replace function public.event_updates_for(p_event bigint)
returns table (id bigint, body text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.id, u.body, u.created_at from public.event_updates u
  where u.event_id = p_event
    and (exists (select 1 from public.events e where e.id = p_event and e.host_id = auth.uid())
         or exists (select 1 from public.event_rsvps r where r.event_id = p_event and r.user_id = auth.uid()))
  order by u.created_at desc limit 20
$$;
revoke execute on function public.event_updates_for(bigint) from public, anon;
grant execute on function public.event_updates_for(bigint) to authenticated;

-- ── Group invite links ─────────────────────────────────────────────────────
alter table public.groups add column if not exists invite_token text unique;

create or replace function private.can_manage_group(p_group bigint, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.groups where id = p_group and owner_id = p_user)
      or exists (select 1 from public.group_members where group_id = p_group and user_id = p_user and role in ('owner', 'admin'))
$$;

-- The owner and co-hosts get one link for the whole group. p_new makes a new
-- link, so the old one stops working.
create or replace function public.group_invite_link(p_group bigint, p_new boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare tok text;
begin
  if not private.can_manage_group(p_group) then
    raise exception 'Only the owner and co-hosts can share the invite link.' using errcode = 'insufficient_privilege';
  end if;
  select invite_token into tok from public.groups where id = p_group;
  if tok is null or coalesce(p_new, false) then
    tok := translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_');
    update public.groups set invite_token = tok where id = p_group;
  end if;
  return tok;
end $$;
revoke execute on function public.group_invite_link(bigint, boolean) from public, anon;
grant execute on function public.group_invite_link(bigint, boolean) to authenticated;

-- Opening the link joins the group right away (no request to approve).
create or replace function public.join_group_by_link(p_token text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare g public.groups; me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  select * into g from public.groups where invite_token = p_token and p_token is not null and length(p_token) >= 8;
  if g.id is null then raise exception 'That invite link doesn''t work anymore. Ask for a new one.' using errcode = 'check_violation'; end if;
  if private.is_blocked(me, g.owner_id) then raise exception 'You can''t join this group.' using errcode = 'check_violation'; end if;
  if not exists (select 1 from public.group_members where group_id = g.id and user_id = me) then
    insert into public.group_members (group_id, user_id, role) values (g.id, me, 'member');
    perform private.notify(g.owner_id, 'group_joined',
      (select display_name from public.profiles where id = me) || ' joined ' || g.name, 'They used your invite link.', me, '/groups/' || g.id);
  end if;
  return g.id;
end $$;
revoke execute on function public.join_group_by_link(text) from public, anon;
grant execute on function public.join_group_by_link(text) to authenticated;

-- ── A song on your profile ─────────────────────────────────────────────────
alter table public.profiles add column if not exists song jsonb;

create or replace function public.set_profile_song(p_song jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if p_song is not null and (
       jsonb_typeof(p_song->'track_id') <> 'number'
       or coalesce(char_length(p_song->>'title'), 0) not between 1 and 200
       or coalesce(char_length(p_song->>'artist'), 0) not between 1 and 200
       or coalesce(p_song->>'preview_url', '') not like 'https://%'
       or coalesce(p_song->>'apple_url', '') not like 'https://%'
       or (p_song->>'artwork_url' is not null and p_song->>'artwork_url' not like 'https://%')) then
    raise exception 'Pick a song from the search.' using errcode = 'check_violation';
  end if;
  update public.profiles
     set song = case when p_song is null then null else jsonb_build_object(
           'track_id', p_song->'track_id', 'title', p_song->>'title', 'artist', p_song->>'artist',
           'artwork_url', p_song->>'artwork_url', 'preview_url', p_song->>'preview_url', 'apple_url', p_song->>'apple_url') end
   where id = auth.uid();
end $$;
revoke execute on function public.set_profile_song(jsonb) from public, anon;
grant execute on function public.set_profile_song(jsonb) to authenticated;

-- ── Tonight's specials from partner places ─────────────────────────────────
-- A place's manager (set by the admin) can post a special while the place
-- has a live Featured or Sponsored placement.
create table if not exists public.venue_managers (
  venue_id bigint not null references public.venues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (venue_id, user_id)
);
alter table public.venue_managers enable row level security;

create table if not exists public.venue_specials (
  id bigserial primary key,
  venue_id bigint not null references public.venues (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  details text check (char_length(details) <= 300),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  ends_at timestamptz not null
);
create index if not exists venue_specials_live_idx on public.venue_specials (venue_id, ends_at desc);
alter table public.venue_specials enable row level security;

create or replace function private.is_partner(p_venue bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.venue_placements where venue_id = p_venue and starts_at <= now() and ends_at > now())
$$;

create or replace function public.admin_set_venue_manager(p_venue bigint, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'Admins only.' using errcode = 'insufficient_privilege'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'No member has that email.' using errcode = 'check_violation'; end if;
  insert into public.venue_managers (venue_id, user_id) values (p_venue, uid) on conflict do nothing;
  perform private.notify(uid, 'venue_manager', 'You can post specials for ' || (select name from public.venues where id = p_venue),
                         'Open the place''s page and tap Post tonight''s special.', null, '/venues/' || p_venue);
end $$;
revoke execute on function public.admin_set_venue_manager(bigint, text) from public, anon;
grant execute on function public.admin_set_venue_manager(bigint, text) to authenticated;

-- One special a day per place. It runs until tonight ends (4 AM).
create or replace function public.post_venue_special(p_venue bigint, p_title text, p_details text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare new_id bigint;
begin
  if not exists (select 1 from public.venue_managers where venue_id = p_venue and user_id = auth.uid()) then
    raise exception 'Only this place''s manager can post specials.' using errcode = 'insufficient_privilege';
  end if;
  if not private.is_partner(p_venue) then
    raise exception 'Specials are for partner places. Contact I''m In to become a partner.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.venue_specials where venue_id = p_venue and created_at > now() - interval '20 hours') then
    raise exception 'You''ve posted today''s special. Post again tomorrow.' using errcode = 'check_violation';
  end if;
  insert into public.venue_specials (venue_id, title, details, created_by, ends_at)
  values (p_venue, trim(p_title), nullif(trim(coalesce(p_details, '')), ''), auth.uid(), public.tonight_ends_at())
  returning id into new_id;
  return new_id;
end $$;
revoke execute on function public.post_venue_special(bigint, text, text) from public, anon;
grant execute on function public.post_venue_special(bigint, text, text) to authenticated;

-- Tonight's specials: for one place, or every partner place (What's In).
create or replace function public.specials_tonight(p_venue bigint default null)
returns table (id bigint, venue_id bigint, venue_name text, neighborhood text, title text, details text, ends_at timestamptz, can_manage boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.venue_id, v.name, v.neighborhood, s.title, s.details, s.ends_at,
         exists (select 1 from public.venue_managers m where m.venue_id = s.venue_id and m.user_id = auth.uid())
  from public.venue_specials s join public.venues v on v.id = s.venue_id
  where s.ends_at > now() and private.is_partner(s.venue_id) and (p_venue is null or s.venue_id = p_venue)
  order by s.created_at desc limit 20
$$;
revoke execute on function public.specials_tonight(bigint) from public, anon;
grant execute on function public.specials_tonight(bigint) to authenticated;

create or replace function public.can_post_special(p_venue bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.venue_managers where venue_id = p_venue and user_id = auth.uid()) and private.is_partner(p_venue)
$$;
revoke execute on function public.can_post_special(bigint) from public, anon;
grant execute on function public.can_post_special(bigint) to authenticated;

-- ── Safety timer before a date ─────────────────────────────────────────────
-- "Check on me at 8:30." If you don't tap I'm safe in time, you get the same
-- missed check-in alert as Date Mode.
create table if not exists public.safety_timers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  check_at timestamptz not null,
  note text check (char_length(note) <= 120),
  started_at timestamptz not null default now(),
  missed_notified boolean not null default false
);
alter table public.safety_timers enable row level security;
drop policy if exists "own timer" on public.safety_timers;
create policy "own timer" on public.safety_timers for select using (user_id = auth.uid());

create or replace function public.start_safety_timer(p_minutes int, p_note text default null)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare at_time timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if p_minutes is null or p_minutes not between 10 and 360 then
    raise exception 'Pick a time between 10 minutes and 6 hours.' using errcode = 'check_violation';
  end if;
  at_time := now() + make_interval(mins => p_minutes);
  insert into public.safety_timers (user_id, check_at, note) values (auth.uid(), at_time, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (user_id) do update set check_at = excluded.check_at, note = excluded.note, started_at = now(), missed_notified = false;
  return at_time;
end $$;

create or replace function public.extend_safety_timer(p_minutes int)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare at_time timestamptz;
begin
  if p_minutes is null or p_minutes not between 10 and 120 then
    raise exception 'Add between 10 minutes and 2 hours.' using errcode = 'check_violation';
  end if;
  update public.safety_timers set check_at = greatest(check_at, now()) + make_interval(mins => p_minutes), missed_notified = false
   where user_id = auth.uid() returning check_at into at_time;
  if at_time is null then raise exception 'No timer is running.' using errcode = 'check_violation'; end if;
  return at_time;
end $$;

-- I'm safe: the timer ends.
create or replace function public.end_safety_timer()
returns void language sql security definer set search_path = '' as $$
  delete from public.safety_timers where user_id = auth.uid()
$$;

revoke execute on function public.start_safety_timer(int, text), public.extend_safety_timer(int), public.end_safety_timer() from public, anon;
grant execute on function public.start_safety_timer(int, text), public.extend_safety_timer(int), public.end_safety_timer() to authenticated;

-- The 5-minute sweep now also checks timers.
create or replace function private.flag_missed_checkins()
returns void language plpgsql security definer set search_path = '' as $$
begin
  with due as (
    update public.date_session_members m set missed_notified = true
    from public.date_sessions s
    where s.id = m.session_id and s.status = 'active' and not m.missed_notified
      and m.next_checkin_at < now()
    returning m.user_id, m.session_id
  ), rec as (
    insert into public.safety_checkins (user_id, session_id, kind) select user_id, session_id, 'missed' from due
  )
  insert into public.notifications (user_id, kind, title, body, actor_id, link)
  select user_id, 'safety', 'Check in: are you okay?', 'Tap I''m safe, or get help in one tap.', null, '/date-mode' from due;

  with due as (
    update public.safety_timers set missed_notified = true
    where not missed_notified and check_at < now()
    returning user_id
  ), rec as (
    insert into public.safety_checkins (user_id, session_id, kind) select user_id, null, 'missed' from due
  )
  insert into public.notifications (user_id, kind, title, body, actor_id, link)
  select user_id, 'safety', 'Check in: are you okay?', 'Your safety timer ran out. Tap I''m safe, or get help in one tap.', null, '/date-mode' from due;
end $$;

-- ── Feeds and pages pick up the new fields ─────────────────────────────────
do $$
declare
  pairs text[][] := array[
    array['public.going_out_feed(text,double precision,double precision,numeric)',
          $p$'group_id', ev.group_id, 'group_name', gr.name, 'capacity', ev.capacity,$p$,
          $p$'group_id', ev.group_id, 'group_name', gr.name, 'capacity', ev.capacity, 'tags', ev.tags,$p$],
    array['public.event_detail(bigint)',
          $p$'is_host', ev.host_id = auth.uid(), 'visibility', ev.visibility,$p$,
          $p$'is_host', ev.host_id = auth.uid(), 'visibility', ev.visibility, 'tags', ev.tags,$p$],
    array['public.profile_card(uuid)',
          $p$'top_vouch_word', p.top_vouch_word,$p$,
          $p$'top_vouch_word', p.top_vouch_word, 'song', p.song,$p$]
  ];
  i int;
  src text;
begin
  for i in 1 .. array_length(pairs, 1) loop
    src := pg_get_functiondef(pairs[i][1]::regprocedure);
    if position(pairs[i][2] in src) = 0 then
      raise exception 'tester feedback feed patch %: text not found in %', i, pairs[i][1];
    end if;
    execute replace(src, pairs[i][2], pairs[i][3]);
  end loop;
end $$;
