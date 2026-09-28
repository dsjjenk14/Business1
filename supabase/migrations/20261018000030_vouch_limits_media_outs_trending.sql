-- 1. Vouches: 5 a month on the free plan, unlimited with Premium.
-- 2. Video and boomerang posts (pin_media + the pin-media bucket).
-- 3. Outs: photos sent to friends that disappear after they're opened, or
--    posted to "My Out" for your circle for 24 hours.
-- 4. What's In: trending events and where people are tonight.
-- 5. In-app sounds setting.

-- ── 1. Vouch limits ─────────────────────────────────────────────────────────
insert into public.plan_limits (key, free_value, premium_value, description) values
  ('vouches_per_month', 5, null, 'GPS vouches you can give per calendar month (DC time). Premium: unlimited (null).')
on conflict (key) do update set free_value = excluded.free_value, premium_value = excluded.premium_value, description = excluded.description;

create or replace function public.validate_vouch()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  enc public.encounters;
  invite_count int;
  given_this_month int;
  monthly numeric;
  at_time timestamptz := coalesce(new.created_at, now());
begin
  if new.type = 'gps' then
    select * into enc from public.encounters where id = new.encounter_id;
    if enc.id is null
       or least(new.voucher_id, new.vouchee_id) <> enc.user_a
       or greatest(new.voucher_id, new.vouchee_id) <> enc.user_b then
      raise exception 'A vouch needs a GPS-confirmed meetup between these two people.'
        using errcode = 'check_violation';
    end if;
    if enc.overlap_end < at_time - make_interval(days => public.config_num('vouch_window_days')::int) then
      raise exception 'That meetup was too long ago to vouch from. Meet up again and check in together.'
        using errcode = 'check_violation';
    end if;
    -- Monthly budget from the member's plan (null = unlimited, i.e. Premium).
    monthly := public.plan_limit(new.voucher_id, 'vouches_per_month');
    if monthly is not null then
      select count(*) into given_this_month from public.vouches
       where voucher_id = new.voucher_id and type = 'gps' and status <> 'revoked'
         and date_trunc('month', created_at at time zone 'America/New_York')
           = date_trunc('month', at_time at time zone 'America/New_York');
      if given_this_month >= monthly then
        raise exception 'You''ve used your % vouches for this month. You get more on the 1st, or go unlimited with Premium.', monthly::int
          using errcode = 'check_violation';
      end if;
    end if;
  elsif new.type = 'invite' then
    select count(*) into invite_count from public.vouches
      where vouchee_id = new.vouchee_id and type = 'invite';
    if invite_count >= public.config_num('invite_vouch_cap') then
      raise exception 'Invite vouch limit reached for this person.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

-- Vouches left this month; null means unlimited (Premium).
create or replace function public.my_vouches_left_this_month()
returns integer language sql stable security definer set search_path = '' as $$
  select case when public.plan_limit(auth.uid(), 'vouches_per_month') is null then null
  else greatest(0, public.plan_limit(auth.uid(), 'vouches_per_month')::int - (
    select count(*)::int from public.vouches
     where voucher_id = auth.uid() and type = 'gps' and status <> 'revoked'
       and date_trunc('month', created_at at time zone 'America/New_York')
         = date_trunc('month', now() at time zone 'America/New_York'))) end
$$;

-- ── 2. Video and boomerang posts ──────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('pin-media', 'pin-media', false, 52428800, array['video/mp4','video/quicktime','image/jpeg'])
on conflict (id) do nothing;

-- Path: <author id>/<pin id>/<file>. Readable by anyone who can see the pin.
create policy "upload own pin media" on storage.objects for insert to authenticated
  with check (bucket_id = 'pin-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own pin media" on storage.objects for delete to authenticated
  using (bucket_id = 'pin-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read media of visible pins" on storage.objects for select to authenticated
  using (
    bucket_id = 'pin-media'
    and (storage.foldername(name))[2] ~ '^\d+$'
    and private.can_see_pin(((storage.foldername(name))[2])::bigint, auth.uid())
  );

create table public.pin_media (
  pin_id      bigint primary key references public.pins (id) on delete cascade,
  kind        text not null check (kind in ('video', 'boomerang')),
  path        text,               -- the video file
  poster_path text,               -- first frame, shown before playing
  frames      text[],             -- boomerang frames, played forward then back
  duration_s  real check (duration_s is null or duration_s <= 61),
  created_at  timestamptz not null default now(),
  check (kind <> 'video' or path is not null),
  check (kind <> 'boomerang' or coalesce(array_length(frames, 1), 0) between 3 and 20)
);
alter table public.pin_media enable row level security;
create policy "media on visible pins" on public.pin_media for select to authenticated
  using (private.can_see_pin(pin_id, auth.uid()));
-- Only on your own pin, and only files in your own folder for that pin.
create policy "add media to own pins" on public.pin_media for insert to authenticated
  with check (
    exists (select 1 from public.pins where id = pin_id and author_id = auth.uid())
    and (path is null or path like auth.uid()::text || '/' || pin_id::text || '/%')
    and (poster_path is null or poster_path like auth.uid()::text || '/' || pin_id::text || '/%')
    and (frames is null or not exists (select 1 from unnest(frames) f where f not like auth.uid()::text || '/' || pin_id::text || '/%')));
create policy "remove media from own pins" on public.pin_media for delete to authenticated
  using (exists (select 1 from public.pins where id = pin_id and author_id = auth.uid()));
grant select, insert, delete on public.pin_media to authenticated;

-- ── 3. Outs ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('outs', 'outs', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;
-- Upload into your own folder. Nobody can read Outs directly: the open-out
-- function hands out a one-minute link after checking you may open it.
create policy "upload own outs" on storage.objects for insert to authenticated
  with check (bucket_id = 'outs' and (storage.foldername(name))[1] = auth.uid()::text);

insert into public.app_config (key, value, description) values
  ('out_hours', '24', 'How long an Out lasts (unopened Outs and My Out).'),
  ('outs_per_day', '200', 'Most Outs one member can send in a day.')
on conflict (key) do nothing;

create table public.outs (
  id              bigserial primary key,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  path            text not null,
  caption         text check (char_length(caption) <= 120),
  to_story        boolean not null default false,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '24 hours',
  file_deleted_at timestamptz
);
create index outs_sender_idx on public.outs (sender_id, created_at desc);
create index outs_live_idx on public.outs (expires_at) where file_deleted_at is null;

create table public.out_recipients (
  out_id        bigint not null references public.outs (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  opened_at     timestamptz,
  screenshot_at timestamptz,
  primary key (out_id, user_id)
);
create index out_recipients_user_idx on public.out_recipients (user_id, out_id desc);

create table public.out_story_views (
  out_id        bigint not null references public.outs (id) on delete cascade,
  viewer_id     uuid not null references public.profiles (id) on delete cascade,
  viewed_at     timestamptz not null default now(),
  screenshot_at timestamptz,
  primary key (out_id, viewer_id)
);
alter table public.outs enable row level security;
alter table public.out_recipients enable row level security;
alter table public.out_story_views enable row level security;
-- No direct access: everything goes through the functions below.

create or replace function public.send_out(p_path text, p_caption text, p_recipients uuid[], p_to_story boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id bigint;
  who text;
  targets uuid[];
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if p_path is null or p_path not like me::text || '/%' then raise exception 'Upload the photo first.' using errcode = 'check_violation'; end if;
  if (select count(*) from public.outs where sender_id = me and created_at > now() - interval '1 day') >= public.config_num('outs_per_day') then
    raise exception 'That''s a lot of Outs today. Try again tomorrow.' using errcode = 'check_violation';
  end if;
  -- Only people in your circle, never someone blocked.
  select coalesce(array_agg(distinct r), '{}') into targets
  from unnest(coalesce(p_recipients, '{}')) r
  where r <> me and private.are_connected(me, r) and not private.is_blocked(me, r);
  if cardinality(targets) = 0 and not coalesce(p_to_story, false) then
    raise exception 'Pick at least one friend, or post it to My Out.' using errcode = 'check_violation';
  end if;
  if cardinality(targets) > 50 then raise exception 'Send to 50 people at most.' using errcode = 'check_violation'; end if;

  insert into public.outs (sender_id, path, caption, to_story, expires_at)
  values (me, p_path, nullif(trim(p_caption), ''), coalesce(p_to_story, false),
          now() + make_interval(hours => public.config_num('out_hours')::int))
  returning id into new_id;
  insert into public.out_recipients (out_id, user_id) select new_id, unnest(targets);

  select display_name into who from public.profiles where id = me;
  perform private.notify(t, 'out', who || ' sent you an Out', 'Tap to open it. It disappears after you look.', me, '/outs')
  from unnest(targets) t;
  return new_id;
end $$;

-- Everything the Outs tab shows, in one call.
create or replace function public.outs_inbox()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as id),
  received as (
    select o.sender_id, o.id, o.created_at, r.opened_at
    from public.out_recipients r join public.outs o on o.id = r.out_id
    where r.user_id = (select id from me) and o.expires_at > now()
      and not private.is_blocked((select id from me), o.sender_id)
  ),
  stories as (
    select o.sender_id, o.id, o.created_at,
           exists (select 1 from public.out_story_views v where v.out_id = o.id and v.viewer_id = (select id from me)) as seen
    from public.outs o
    where o.to_story and o.expires_at > now() and o.sender_id <> (select id from me)
      and private.are_connected((select id from me), o.sender_id)
      and not private.is_blocked((select id from me), o.sender_id)
  )
  select jsonb_build_object(
    -- One row per friend who sent you Outs: new ones first.
    'received', coalesce((select jsonb_agg(x order by (x->>'unopened')::int > 0 desc, x->>'latest_at' desc) from (
        select jsonb_build_object('sender_id', p.id, 'name', p.display_name, 'avatar_url', p.avatar_url,
          'unopened', count(*) filter (where r.opened_at is null),
          'latest_at', max(r.created_at),
          'next_out_id', min(r.id) filter (where r.opened_at is null)) as x
        from received r join public.profiles p on p.id = r.sender_id group by p.id) q), '[]'::jsonb),
    -- Friends' My Out (24 hours).
    'stories', coalesce((select jsonb_agg(x order by (x->>'all_seen')::boolean, x->>'latest_at' desc) from (
        select jsonb_build_object('sender_id', p.id, 'name', p.display_name, 'avatar_url', p.avatar_url,
          'out_ids', jsonb_agg(s.id order by s.created_at), 'latest_at', max(s.created_at), 'all_seen', bool_and(s.seen)) as x
        from stories s join public.profiles p on p.id = s.sender_id group by p.id) q), '[]'::jsonb),
    -- Your own My Out, with how many people saw each one.
    'my_story', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'created_at', o.created_at, 'caption', o.caption,
          'views', (select count(*) from public.out_story_views v where v.out_id = o.id),
          'screenshots', (select count(*) from public.out_story_views v where v.out_id = o.id and v.screenshot_at is not null))
        order by o.created_at)
        from public.outs o where o.sender_id = (select id from me) and o.to_story and o.expires_at > now()), '[]'::jsonb),
    -- Outs you sent in the last day: delivered, opened, screenshotted.
    'sent', coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
        select jsonb_build_object('id', o.id, 'created_at', o.created_at,
          'to', (select string_agg(p.display_name, ', ' order by p.display_name) from public.out_recipients r join public.profiles p on p.id = r.user_id where r.out_id = o.id),
          'recipients', (select count(*) from public.out_recipients r where r.out_id = o.id),
          'opened', (select count(*) from public.out_recipients r where r.out_id = o.id and r.opened_at is not null),
          'screenshots', (select count(*) from public.out_recipients r where r.out_id = o.id and r.screenshot_at is not null)) as x
        from public.outs o
        where o.sender_id = (select id from me) and o.created_at > now() - interval '1 day'
          and exists (select 1 from public.out_recipients r where r.out_id = o.id)
        order by o.created_at desc limit 20) q), '[]'::jsonb)
  )
$$;

-- Server only (the open-out Edge Function): may this person open this Out?
-- A direct Out opens once; a My Out can be watched again for 24 hours.
create or replace function public.out_open(p_out bigint, p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.outs; r public.out_recipients;
begin
  select * into o from public.outs where id = p_out;
  if o.id is null or o.expires_at <= now() or o.file_deleted_at is not null or private.is_blocked(p_user, o.sender_id) then
    return jsonb_build_object('error', 'This Out is gone.');
  end if;
  select * into r from public.out_recipients where out_id = p_out and user_id = p_user;
  if r.out_id is not null then
    if r.opened_at is not null then return jsonb_build_object('error', 'You already opened this Out.'); end if;
    update public.out_recipients set opened_at = now() where out_id = p_out and user_id = p_user;
  elsif o.to_story and (o.sender_id = p_user or private.are_connected(p_user, o.sender_id)) then
    if o.sender_id <> p_user then
      insert into public.out_story_views (out_id, viewer_id) values (p_out, p_user) on conflict do nothing;
    end if;
  else
    return jsonb_build_object('error', 'This Out is gone.');
  end if;
  return jsonb_build_object('path', o.path, 'caption', o.caption, 'created_at', o.created_at,
    'sender_id', o.sender_id, 'sender_name', (select display_name from public.profiles where id = o.sender_id));
end $$;

-- Someone took a screenshot of an Out they opened: tell the sender.
create or replace function public.out_screenshot(p_out bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.outs; me uuid := auth.uid(); hit int := 0; who text;
begin
  select * into o from public.outs where id = p_out;
  if o.id is null or o.sender_id = me then return; end if;
  update public.out_recipients set screenshot_at = coalesce(screenshot_at, now())
   where out_id = p_out and user_id = me and opened_at is not null;
  get diagnostics hit = row_count;
  if hit = 0 then
    update public.out_story_views set screenshot_at = coalesce(screenshot_at, now()) where out_id = p_out and viewer_id = me;
    get diagnostics hit = row_count;
  end if;
  if hit > 0 then
    select display_name into who from public.profiles where id = me;
    perform private.notify(o.sender_id, 'out_screenshot', who || ' took a screenshot of your Out', '', me, '/outs');
  end if;
end $$;

-- Server only: Outs whose photo can be deleted (opened by everyone, or expired).
create or replace function public.outs_to_clean(p_limit integer default 100)
returns table (id bigint, path text) language sql stable security definer set search_path = '' as $$
  select o.id, o.path from public.outs o
  where o.file_deleted_at is null
    and (o.expires_at <= now()
         -- Opened by everyone, at least 2 minutes ago (the link to view it lasts 1 minute).
         or (not o.to_story and not exists (select 1 from public.out_recipients r where r.out_id = o.id
                                              and (r.opened_at is null or r.opened_at > now() - interval '2 minutes'))))
  order by o.id limit least(greatest(p_limit, 1), 500)
$$;

create or replace function public.outs_cleaned(p_ids bigint[])
returns void language sql security definer set search_path = '' as $$
  update public.outs set file_deleted_at = now() where id = any(p_ids)
$$;

-- ── 4. What's In (trending) ─────────────────────────────────────────────────
create or replace function public.whats_in(p_lat double precision default null, p_lng double precision default null,
                                           p_radius_mi double precision default 25)
returns jsonb language sql stable security definer set search_path = '' as $$
  with origin as (
    select coalesce(case when p_lat is not null and p_lng is not null then public.snap_location(p_lng, p_lat) end,
                    (select approx_location from public.profiles where id = auth.uid())) as g
  ),
  radius as (select least(greatest(p_radius_mi, 1), 75) * 1609.344 as m),
  my_groups as (select group_id from public.group_members where user_id = auth.uid()),
  friends as (select private.first_degree_ids(auth.uid()) as id),
  -- Where people are In tonight: counts only (never names), and only people
  -- who let others see their venue.
  tonight as (
    select g.venue_id, count(*) as n, count(*) filter (where g.user_id in (select id from friends)) as friends_n
    from public.going_out_posts g
    join public.user_settings s on s.user_id = g.user_id
    where g.when_kind = 'tonight' and g.expires_at > now() and g.venue_id is not null
      and s.show_going_out_venue and not private.is_blocked(auth.uid(), g.user_id)
    group by g.venue_id
  ),
  events as (
    select ev.id, ev.title, ev.emoji, ev.starts_at, ev.group_id, ev.host_id, ev.capacity, ev.ticket_price_cents,
           coalesce(v.name, ev.place_text) as place, gr.name as group_name, h.display_name as host_name, h.avatar_url as host_avatar,
           (select count(*) from public.event_rsvps r where r.event_id = ev.id)::int as going_count,
           (select count(*) from public.event_rsvps r where r.event_id = ev.id and r.user_id in (select id from friends))::int as friends_going,
           exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid()) as i_am_going,
           (select count(*) from public.event_rsvps r where r.event_id = ev.id and r.created_at > now() - interval '48 hours')::int as new_going
    from public.events ev
    left join public.venues v on v.id = ev.venue_id
    left join public.groups gr on gr.id = ev.group_id
    join public.profiles h on h.id = ev.host_id
    where coalesce(ev.ends_at, ev.starts_at + interval '3 hours') > now()
      and ev.starts_at < now() + interval '14 days'
      and not private.is_blocked(auth.uid(), ev.host_id)
      and (ev.group_id is null or ev.group_id in (select group_id from my_groups))
      and (v.id is null or (select g from origin) is null
           or extensions.st_dwithin(v.location, (select g from origin), (select m from radius)))
  )
  select jsonb_build_object(
    'hot_tonight', coalesce((select jsonb_agg(x order by (x->>'people')::int desc) from (
        select jsonb_build_object('venue_id', v.id, 'name', v.name, 'glyph', v.emoji, 'neighborhood', v.neighborhood,
          'people', t.n, 'friends', t.friends_n,
          'distance_mi', case when (select g from origin) is not null then round((extensions.st_distance(v.location, (select g from origin)) / 1609.344)::numeric, 1) end) as x
        from tonight t join public.venues v on v.id = t.venue_id
        where (select g from origin) is null or extensions.st_dwithin(v.location, (select g from origin), (select m from radius))
        order by t.n desc limit 8) q), '[]'::jsonb),
    -- Events picking up the most people (new sign-ups count triple).
    'events', coalesce((select jsonb_agg(to_jsonb(e) - 'new_going' order by e.new_going * 3 + e.going_count + e.friends_going * 2 desc, e.starts_at)
        from (select * from events order by new_going * 3 + going_count + friends_going * 2 desc, starts_at limit 10) e
        where e.going_count > 0), '[]'::jsonb)
  )
$$;

-- ── 5. In-app sounds ────────────────────────────────────────────────────────
alter table public.user_settings add column if not exists app_sounds boolean not null default true;
-- The app listens for new notifications live (for the chime and badges).
-- Row-level security still applies: you only ever get your own.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.my_vouches_left_this_month()', 'public.send_out(text, text, uuid[], boolean)', 'public.outs_inbox()',
    'public.out_screenshot(bigint)', 'public.whats_in(double precision, double precision, double precision)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.out_open(bigint, uuid)', 'public.outs_to_clean(integer)', 'public.outs_cleaned(bigint[])'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
