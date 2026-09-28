-- I'm In: 017 Money and verification (Phase 6)
-- Founding Members' free Premium, profile analytics (Premium), Featured and
-- Sponsored places with member perks, "Become a Partner" inquiries, photo
-- verification (reviewed by an admin), and the admin tools.

-- ── Founding Members get Premium free for 3 months ────────────────────────
create or replace function public.grant_founding_premium()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_founding_member then
    insert into public.entitlements (user_id, premium_until, source)
    values (new.id, now() + make_interval(months => public.config_num('founding_trial_months')::int), 'founding')
    on conflict (user_id) do update
      set premium_until = greatest(public.entitlements.premium_until, excluded.premium_until),
          source = case when public.entitlements.premium_until > excluded.premium_until then public.entitlements.source else 'founding' end,
          updated_at = now();
  end if;
  return null;
end $$;
create trigger profiles_founding_premium after insert on public.profiles
  for each row execute function public.grant_founding_premium();

-- Founding Members who joined before this existed get their 3 months from their join date.
insert into public.entitlements (user_id, premium_until, source)
select p.id, p.created_at + make_interval(months => public.config_num('founding_trial_months')::int), 'founding'
from public.profiles p
where p.is_founding_member and not exists (select 1 from public.entitlements e where e.user_id = p.id)
on conflict (user_id) do nothing;

-- The signed-in member's plan.
create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'is_premium', public.is_premium(auth.uid()),
    'premium_until', e.premium_until,
    'source', e.source,
    'is_founding_member', p.is_founding_member,
    'member_number', p.member_number
  )
  from public.profiles p left join public.entitlements e on e.user_id = p.id
  where p.id = auth.uid()
$$;

-- ── Profile views and analytics (Premium) ─────────────────────────────────
-- One row per viewer per profile per day. Viewers are never revealed; the
-- analytics only show counts.
create table public.profile_views (
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_id uuid not null references public.profiles (id) on delete cascade,
  day       date not null default (now() at time zone 'America/New_York')::date,
  primary key (viewed_id, day, viewer_id)
);
alter table public.profile_views enable row level security;   -- no direct access

create or replace function public.record_profile_view(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.profile_views (viewer_id, viewed_id)
  select auth.uid(), p_user
  where auth.uid() is not null and p_user <> auth.uid() and not private.is_blocked(auth.uid(), p_user)
  on conflict do nothing
$$;

create or replace function public.profile_analytics()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'America/New_York')::date;
begin
  if public.plan_limit(me, 'profile_analytics') is distinct from 1 then
    return jsonb_build_object('locked', true);
  end if;
  return jsonb_build_object(
    'locked', false,
    'views_7d', (select count(*) from public.profile_views where viewed_id = me and day > today - 7),
    'views_30d', (select count(*) from public.profile_views where viewed_id = me and day > today - 30),
    'viewers_circle_30d', (select count(distinct viewer_id) from public.profile_views v
                            where v.viewed_id = me and v.day > today - 30 and private.degree_between(me, v.viewer_id) = 1),
    'viewers_network_30d', (select count(distinct viewer_id) from public.profile_views v
                             where v.viewed_id = me and v.day > today - 30 and private.degree_between(me, v.viewer_id) = 2),
    'viewers_other_30d', (select count(distinct viewer_id) from public.profile_views v
                           where v.viewed_id = me and v.day > today - 30 and private.degree_between(me, v.viewer_id) is null),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'views',
                         (select count(*) from public.profile_views v where v.viewed_id = me and v.day = d::date)) order by d)
                       from generate_series(today - 13, today, interval '1 day') d), '[]'::jsonb),
    'pin_likes_30d', (select count(*) from public.pin_likes l join public.pins p on p.id = l.pin_id
                      where p.author_id = me and l.created_at > now() - interval '30 days'),
    'pin_replies_30d', (select count(*) from public.pin_replies r join public.pins p on p.id = r.pin_id
                        where p.author_id = me and r.author_id <> me and r.created_at > now() - interval '30 days'),
    'vouches_30d', (select count(*) from public.vouches where vouchee_id = me and created_at > now() - interval '30 days' and status <> 'revoked'),
    'intro_requests_30d', (select count(*) from public.intro_requests where target_id = me and created_at > now() - interval '30 days')
  );
end $$;

-- ── Featured / Sponsored places ───────────────────────────────────────────
create table public.venue_placements (
  id           bigserial primary key,
  venue_id     bigint not null references public.venues (id) on delete cascade,
  kind         text not null check (kind in ('featured', 'sponsored')),
  perk         text not null check (char_length(perk) between 2 and 80),     -- "15% off for I'm In members"
  perk_details text not null default '' check (char_length(perk_details) <= 400),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index venue_placements_active_idx on public.venue_placements (starts_at, ends_at);
alter table public.venue_placements enable row level security;
create policy "active placements readable" on public.venue_placements for select to authenticated
  using (now() between starts_at and ends_at or public.is_admin());
create policy "admins manage placements" on public.venue_placements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.featured_places(p_lat double precision default null, p_lng double precision default null)
returns table (placement_id bigint, kind text, perk text, perk_details text, ends_at timestamptz,
               venue_id bigint, name text, glyph text, neighborhood text, category text, price_level smallint,
               distance_mi numeric, network_visited integer)
language sql stable security definer set search_path = '' as $$
  with origin as (
    select coalesce(case when p_lat is not null and p_lng is not null then public.snap_location(p_lng, p_lat) end,
                    (select approx_location from public.profiles where id = auth.uid())) as g
  ),
  network as (select f as id from private.first_degree_ids(auth.uid()) f union select user_id from private.second_degree(auth.uid()))
  select distinct on (v.id)
    pl.id, pl.kind, pl.perk, pl.perk_details, pl.ends_at,
    v.id, v.name, v.emoji, v.neighborhood, v.category, v.price_level,
    case when (select g from origin) is not null then round((extensions.st_distance(v.location, (select g from origin)) / 1609.344)::numeric, 1) end,
    (select count(distinct u)::int from (
        select e.user_a as u from public.encounters e where e.venue_id = v.id
        union select e.user_b from public.encounters e where e.venue_id = v.id) x where u in (select id from network))
  from public.venue_placements pl
  join public.venues v on v.id = pl.venue_id
  where now() between pl.starts_at and pl.ends_at
  order by v.id, (pl.kind = 'sponsored') desc, pl.starts_at desc
$$;

-- One labeled placement for a feed slot (Home or Pins). Rotates daily so
-- the same card isn't shown forever; sponsored first.
create or replace function public.feed_placement(p_lat double precision default null, p_lng double precision default null)
returns table (placement_id bigint, kind text, perk text, venue_id bigint, name text, glyph text, neighborhood text,
               distance_mi numeric, network_visited integer)
language sql stable security definer set search_path = '' as $$
  select f.placement_id, f.kind, f.perk, f.venue_id, f.name, f.glyph, f.neighborhood, f.distance_mi, f.network_visited
  from public.featured_places(p_lat, p_lng) f
  order by (f.kind = 'sponsored') desc,
           md5(f.placement_id::text || (now() at time zone 'America/New_York')::date::text)
  limit 1
$$;

create or replace function public.venue_detail(p_venue bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  with network as (select f as id from private.first_degree_ids(auth.uid()) f union select user_id from private.second_degree(auth.uid()))
  select jsonb_build_object(
    'id', v.id, 'name', v.name, 'emoji', v.emoji, 'address', v.address, 'neighborhood', v.neighborhood,
    'category', v.category, 'price_level', v.price_level, 'description', v.description,
    -- Active Featured / Sponsored placement and its member perk, if any.
    'placement', (select jsonb_build_object('kind', pl.kind, 'perk', pl.perk, 'perk_details', pl.perk_details, 'ends_at', pl.ends_at)
                  from public.venue_placements pl
                  where pl.venue_id = v.id and now() between pl.starts_at and pl.ends_at
                  order by (pl.kind = 'sponsored') desc, pl.starts_at desc limit 1),
    'lat', extensions.st_y(v.location::extensions.geometry), 'lng', extensions.st_x(v.location::extensions.geometry),
    -- "14 of your network have been here": people you know with a GPS meetup at this venue.
    'network_visited', (select count(distinct u) from (
        select e.user_a as u from public.encounters e where e.venue_id = v.id
        union select e.user_b from public.encounters e where e.venue_id = v.id) x where u in (select id from network)),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'title', ev.title, 'emoji', ev.emoji, 'starts_at', ev.starts_at,
                  'host_name', (select display_name from public.profiles where id = ev.host_id),
                  'going_count', (select count(*) from public.event_rsvps r where r.event_id = ev.id), 'capacity', ev.capacity)
                  order by ev.starts_at)
                from public.events ev where ev.venue_id = v.id and ev.starts_at > now() - interval '3 hours'
                  and ev.starts_at < now() + interval '14 days' and not private.is_blocked(auth.uid(), ev.host_id)), '[]'::jsonb)
  )
  from public.venues v where v.id = p_venue
$$;

-- ── Become a Partner ──────────────────────────────────────────────────────
create table public.partner_inquiries (
  id            bigserial primary key,
  business_name text not null check (char_length(trim(business_name)) between 2 and 120),
  contact_name  text not null check (char_length(trim(contact_name)) between 2 and 80),
  email         text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone         text check (char_length(phone) <= 30),
  address       text check (char_length(address) <= 200),
  message       text not null default '' check (char_length(message) <= 2000),
  submitted_by  uuid references public.profiles (id) on delete set null,
  status        text not null default 'new' check (status in ('new', 'contacted', 'signed', 'closed')),
  created_at    timestamptz not null default now()
);
alter table public.partner_inquiries enable row level security;
create policy "admins manage inquiries" on public.partner_inquiries for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.submit_partner_inquiry(
  p_business text, p_contact text, p_email text, p_phone text default null, p_address text default null, p_message text default '')
returns bigint language plpgsql security definer set search_path = '' as $$
declare new_id bigint;
begin
  if auth.uid() is not null and (select count(*) from public.partner_inquiries
      where submitted_by = auth.uid() and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Thanks, we already have your inquiry. We''ll be in touch.' using errcode = 'check_violation';
  end if;
  insert into public.partner_inquiries (business_name, contact_name, email, phone, address, message, submitted_by)
  values (trim(p_business), trim(p_contact), lower(trim(p_email)), nullif(trim(p_phone), ''), nullif(trim(p_address), ''),
          coalesce(trim(p_message), ''), auth.uid())
  returning id into new_id;
  insert into public.notifications (user_id, kind, title, body, actor_id, link)
  select p.id, 'moderation', 'New partner inquiry', trim(p_business), null, '/admin' from public.profiles p where p.role = 'admin';
  return new_id;
end $$;

-- ── Verification ──────────────────────────────────────────────────────────
-- Photo verification: the member takes a live selfie doing a random gesture;
-- an admin compares it with their profile photos and approves or declines.
-- ID verification and background checks need a paid partner (e.g. Persona,
-- Checkr): the kinds exist so the screens can show their status, but they
-- stay 'unavailable' until a partner is connected.
create table public.verification_requests (
  id           bigserial primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (kind in ('photo', 'id', 'background')),
  status       text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'declined')),
  gesture      text,
  selfie_path  text,
  review_note  text,                       -- shown to the member if declined
  created_at   timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz
);
create index verification_requests_queue_idx on public.verification_requests (status, submitted_at);
alter table public.verification_requests enable row level security;
create policy "own verification requests" on public.verification_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('verifications', 'verifications', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;
-- Path: <user id>/<request id>.<ext>. Members upload their own; only admins read them.
create policy "upload own verification selfie" on storage.objects for insert to authenticated
  with check (bucket_id = 'verifications' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "admins read verification selfies" on storage.objects for select to authenticated
  using (bucket_id = 'verifications' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));

create or replace function public.photo_verification_challenge()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  gestures text[] := array['Hold up two fingers', 'Touch your chin', 'Give a thumbs up', 'Hold up three fingers',
                           'Touch your ear', 'Cover one eye with your hand'];
  req public.verification_requests;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.profiles where id = me and photo_verified_at is not null) then
    raise exception 'You''re already photo verified.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.verification_requests where user_id = me and kind = 'photo' and status = 'pending') then
    raise exception 'Your photo is being reviewed. We''ll let you know soon.' using errcode = 'check_violation';
  end if;
  delete from public.verification_requests where user_id = me and kind = 'photo' and status = 'draft';
  insert into public.verification_requests (user_id, kind, gesture)
  values (me, 'photo', gestures[1 + floor(random() * array_length(gestures, 1))::int])
  returning * into req;
  return jsonb_build_object('request_id', req.id, 'gesture', req.gesture);
end $$;

create or replace function public.submit_photo_verification(p_request bigint, p_path text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if split_part(p_path, '/', 1) <> me::text then raise exception 'Upload failed. Try again.' using errcode = 'check_violation'; end if;
  update public.verification_requests set selfie_path = p_path, status = 'pending', submitted_at = now()
   where id = p_request and user_id = me and kind = 'photo' and status = 'draft';
  if not found then raise exception 'Start the photo check again.' using errcode = 'check_violation'; end if;
  insert into public.notifications (user_id, kind, title, body, actor_id, link)
  select p.id, 'moderation', 'Photo verification to review', (select display_name from public.profiles where id = me), me, '/admin'
  from public.profiles p where p.role = 'admin';
end $$;

create or replace function public.my_verification()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'photo_verified_at', p.photo_verified_at,
    'id_verified_at', p.id_verified_at,
    'phone_verified', (select phone_verified_at is not null from public.profile_private where id = p.id),
    'photo_request', (select jsonb_build_object('status', r.status, 'review_note', r.review_note, 'submitted_at', r.submitted_at)
                      from public.verification_requests r where r.user_id = p.id and r.kind = 'photo' and r.status <> 'draft'
                      order by r.created_at desc limit 1)
  )
  from public.profiles p where p.id = auth.uid()
$$;

-- ── Admin tools ───────────────────────────────────────────────────────────
create or replace function private.require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.' using errcode = 'insufficient_privilege'; end if;
end $$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'members', (select count(*) from public.profiles),
    'founding_left', greatest(0, public.config_num('founding_member_limit')::int - (select count(*) from public.profiles where is_founding_member)),
    'open_reports', (select count(*) from public.reports where status in ('open', 'reviewing')),
    'pending_verifications', (select count(*) from public.verification_requests where status = 'pending'),
    'new_inquiries', (select count(*) from public.partner_inquiries where status = 'new'),
    'active_placements', (select count(*) from public.venue_placements where now() between starts_at and ends_at),
    'venues', (select count(*) from public.venues)
  );
end $$;

create or replace function public.admin_reports()
returns table (id bigint, reason public.report_reason, details text, status public.report_status, created_at timestamptz,
               reporter_name text, reported_id uuid, reported_name text, about text, content text, hidden boolean,
               pin_id bigint, reply_id bigint, message_id bigint, admin_notes text, reports_on_target bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select r.id, r.reason, r.details, r.status, r.created_at, rp.display_name, r.reported_user_id, tp.display_name,
         case when r.pin_id is not null then 'pin' when r.reply_id is not null then 'reply'
              when r.message_id is not null then 'message' else 'member' end,
         coalesce(pn.body, pr.body, m.body),
         coalesce(pn.hidden_at, pr.hidden_at) is not null,
         r.pin_id, r.reply_id, r.message_id, r.admin_notes,
         (select count(*) from public.reports r2 where r2.reported_user_id = r.reported_user_id)
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles tp on tp.id = r.reported_user_id
  left join public.pins pn on pn.id = r.pin_id
  left join public.pin_replies pr on pr.id = r.reply_id
  left join public.messages m on m.id = r.message_id
  order by (r.status in ('open', 'reviewing')) desc, r.created_at desc
  limit 200;
end $$;

-- action: 'resolve' (keep content), 'remove' (hide the content), 'restore' (unhide), 'dismiss'
create or replace function public.admin_act_on_report(p_report bigint, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.reports;
begin
  perform private.require_admin();
  select * into r from public.reports where id = p_report;
  if r.id is null then raise exception 'Report not found.' using errcode = 'check_violation'; end if;
  if p_action = 'remove' then
    update public.pins set hidden_at = coalesce(hidden_at, now()) where id = r.pin_id;
    update public.pin_replies set hidden_at = coalesce(hidden_at, now()) where id = r.reply_id;
  elsif p_action = 'restore' then
    update public.pins set hidden_at = null where id = r.pin_id;
    update public.pin_replies set hidden_at = null where id = r.reply_id;
  elsif p_action not in ('resolve', 'dismiss') then
    raise exception 'Unknown action.' using errcode = 'check_violation';
  end if;
  -- Close every open report about the same content (or the same member, for member reports).
  update public.reports set
    status = case when p_action = 'dismiss' then 'dismissed' else 'resolved' end::public.report_status,
    resolved_at = now(),
    admin_notes = coalesce(nullif(trim(p_note), ''), admin_notes)
  where status in ('open', 'reviewing')
    and (id = r.id
         or (r.pin_id is not null and pin_id = r.pin_id)
         or (r.reply_id is not null and reply_id = r.reply_id)
         or (r.message_id is not null and message_id = r.message_id));
end $$;

create or replace function public.admin_verifications()
returns table (id bigint, user_id uuid, display_name text, avatar_url text, kind text, gesture text, selfie_path text,
               submitted_at timestamptz, member_since timestamptz, vouch_count integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select r.id, p.id, p.display_name, p.avatar_url, r.kind, r.gesture, r.selfie_path, r.submitted_at, p.created_at, p.vouch_count
  from public.verification_requests r join public.profiles p on p.id = r.user_id
  where r.status = 'pending'
  order by r.submitted_at;
end $$;

create or replace function public.admin_review_verification(p_request bigint, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.verification_requests;
begin
  perform private.require_admin();
  select * into r from public.verification_requests where id = p_request and status = 'pending';
  if r.id is null then raise exception 'That request isn''t waiting for review.' using errcode = 'check_violation'; end if;
  update public.verification_requests set status = case when p_approve then 'approved' else 'declined' end,
         review_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now() where id = r.id;
  if p_approve and r.kind = 'photo' then
    update public.profiles set photo_verified_at = now() where id = r.user_id;
  end if;
  perform private.notify(r.user_id, 'verification',
    case when p_approve then 'You''re photo verified' else 'Your photo check needs another try' end,
    case when p_approve then 'A verified check now shows on your profile.' else coalesce(nullif(trim(p_note), ''), 'Take a new selfie doing the gesture shown.') end,
    null, '/settings/verification');
end $$;

-- Premium by hand (support, comps, testing). Days = 0 removes it.
create or replace function public.admin_grant_premium(p_email text, p_days integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare uid uuid; until timestamptz;
begin
  perform private.require_admin();
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'No member with that email.' using errcode = 'check_violation'; end if;
  until := case when p_days > 0 then now() + make_interval(days => p_days) else now() end;
  insert into public.entitlements (user_id, premium_until, source) values (uid, until, 'admin')
  on conflict (user_id) do update set premium_until = excluded.premium_until, source = 'admin', updated_at = now();
  return until;
end $$;

-- ── Permissions ───────────────────────────────────────────────────────────
revoke execute on function public.grant_founding_premium() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.my_plan()',
    'public.record_profile_view(uuid)',
    'public.profile_analytics()',
    'public.featured_places(double precision, double precision)',
    'public.feed_placement(double precision, double precision)',
    'public.venue_detail(bigint)',
    'public.submit_partner_inquiry(text, text, text, text, text, text)',
    'public.photo_verification_challenge()',
    'public.submit_photo_verification(bigint, text)',
    'public.my_verification()',
    'public.admin_overview()',
    'public.admin_reports()',
    'public.admin_act_on_report(bigint, text, text)',
    'public.admin_verifications()',
    'public.admin_review_verification(bigint, boolean, text)',
    'public.admin_grant_premium(text, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
