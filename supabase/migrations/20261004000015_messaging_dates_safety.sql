-- I'm In: 015 Messaging, dates and safety (Phase 5)
-- Inbox + message status, date requests (accept / suggest another time /
-- pass), Date Mode (both people GPS-verified within 1 mile), safety
-- check-ins, trusted contacts, and the "I need help" flow.

insert into public.app_config (key, value, description) values
  ('date_mode_max_distance_m', '1609', 'Both people must be within this distance (1 mile) to start Date Mode.'),
  ('date_mode_reading_window_min', '10', 'The two GPS readings must be taken within this many minutes of each other.'),
  ('date_mode_checkin_minutes', '60', 'Default time between "I''m safe" check-ins during Date Mode.'),
  ('trusted_contacts_max', '5', 'How many trusted contacts a member can add.')
on conflict (key) do nothing;

-- ── Messaging ─────────────────────────────────────────────────────────────
-- Why you can or can't message someone yet (for the profile and chat).
create or replace function public.message_status(p_other uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with pair as (
    select least(auth.uid(), p_other) as a, greatest(auth.uid(), p_other) as b
  )
  select jsonb_build_object(
    'can_message', private.can_message(auth.uid(), p_other),
    'blocked', private.is_blocked(auth.uid(), p_other),
    'degree', private.degree_between(auth.uid(), p_other),
    'via_intro', exists (select 1 from public.connections c, pair where c.user_a = pair.a and c.user_b = pair.b and c.source = 'intro'),
    'exchanges', coalesce((select i.exchanges from public.interactions i, pair where i.user_a = pair.a and i.user_b = pair.b), 0),
    'needed', coalesce(public.plan_limit(auth.uid(), 'messaging_min_exchanges'), 0),
    'conversation_id', (select c.id from public.conversations c, pair where c.kind = 'direct' and c.direct_a = pair.a and c.direct_b = pair.b)
  )
$$;

-- The inbox: every conversation you're in, newest first, with the last message.
create or replace function public.inbox()
returns table (conversation_id bigint, kind text, title text, glyph text, other_id uuid, avatar_url text,
               last_body text, last_sender_id uuid, last_at timestamptz, unread boolean, group_id bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind,
         coalesce(g.name, o.display_name, 'Member'),
         g.emoji,
         o.id, o.avatar_url,
         lm.body, lm.sender_id, c.last_message_at,
         c.last_message_at is not null and (cm.last_read_at is null or c.last_message_at > cm.last_read_at)
           and lm.sender_id is distinct from auth.uid(),
         c.group_id
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  left join public.groups g on g.id = c.group_id
  left join public.profiles o on c.kind = 'direct' and o.id = case when c.direct_a = auth.uid() then c.direct_b else c.direct_a end
  left join lateral (select m.body, m.sender_id from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1) lm on true
  where cm.user_id = auth.uid()
    and (c.kind = 'group' or c.last_message_at is not null)
    and (o.id is null or not private.is_blocked(auth.uid(), o.id))
  order by c.last_message_at desc nulls last
$$;

-- ── Date requests ─────────────────────────────────────────────────────────
create type public.date_when as enum ('tonight', 'this_weekend', 'next_week', 'specific');
create type public.date_status as enum ('pending', 'accepted', 'countered', 'passed', 'cancelled');

create table public.date_requests (
  id           bigserial primary key,
  from_id      uuid not null references public.profiles (id) on delete cascade,
  to_id        uuid not null references public.profiles (id) on delete cascade,
  when_kind    public.date_when not null,
  starts_at    timestamptz,              -- set when when_kind = 'specific'
  vibe         text check (vibe in ('dinner', 'drinks', 'coffee', 'walk', 'music', 'brunch', 'activity')),
  venue_id     bigint references public.venues (id) on delete set null,
  place_text   text check (char_length(place_text) <= 120),
  note         text check (char_length(note) <= 300),
  status       public.date_status not null default 'pending',
  parent_id    bigint references public.date_requests (id) on delete set null,   -- a counter-proposal answers this
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (from_id <> to_id)
);
create index date_requests_to_idx on public.date_requests (to_id, status);
create index date_requests_from_idx on public.date_requests (from_id, status);
create unique index date_requests_one_pending on public.date_requests (least(from_id, to_id), greatest(from_id, to_id)) where status = 'pending';
alter table public.date_requests enable row level security;
create policy "my date requests" on public.date_requests for select to authenticated
  using ((from_id = auth.uid() or to_id = auth.uid()) and not private.is_blocked(from_id, to_id));

create or replace function private.date_label(r public.date_requests)
returns text language sql stable set search_path = '' as $$
  select case r.when_kind when 'tonight' then 'Tonight' when 'this_weekend' then 'This weekend' when 'next_week' then 'Next week'
           else to_char(r.starts_at at time zone 'America/New_York', 'Dy Mon DD, HH12:MI AM') end
    || coalesce(' · ' || coalesce((select name from public.venues where id = r.venue_id), r.place_text), '')
$$;

create or replace function public.send_date_request(
  p_to uuid, p_when public.date_when, p_starts_at timestamptz default null, p_vibe text default null,
  p_venue_id bigint default null, p_place text default null, p_note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r public.date_requests;
begin
  if not private.can_message(me, p_to) then
    raise exception 'You can only ask someone you can message.' using errcode = 'check_violation';
  end if;
  if p_when = 'specific' and (p_starts_at is null or p_starts_at < now()) then
    raise exception 'Pick a time that hasn''t passed.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.date_requests where least(from_id, to_id) = least(me, p_to)
             and greatest(from_id, to_id) = greatest(me, p_to) and status = 'pending') then
    raise exception 'There''s already a date request waiting between you two.' using errcode = 'check_violation';
  end if;
  insert into public.date_requests (from_id, to_id, when_kind, starts_at, vibe, venue_id, place_text, note)
  values (me, p_to, p_when, case when p_when = 'specific' then p_starts_at end, p_vibe, p_venue_id,
          case when p_venue_id is null then nullif(trim(p_place), '') end, nullif(trim(p_note), ''))
  returning * into r;
  perform private.notify(p_to, 'date_request', (select display_name from public.profiles where id = me) || ' asked you on a date',
    private.date_label(r), me, '/dates/' || r.id);
  return r.id;
end $$;

-- Accept or pass (recipient only). Passing is graceful: the sender just hears "not this time".
create or replace function public.respond_date_request(p_request bigint, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r public.date_requests;
begin
  select * into r from public.date_requests where id = p_request and to_id = me and status = 'pending';
  if r.id is null then raise exception 'That date request isn''t available.' using errcode = 'check_violation'; end if;
  update public.date_requests set status = case when p_accept then 'accepted' else 'passed' end::public.date_status,
         responded_at = now() where id = r.id;
  if p_accept then
    perform private.notify(r.from_id, 'date_accepted', 'It''s a date: ' || (select display_name from public.profiles where id = me) || ' said yes',
      private.date_label(r), me, '/dates/' || r.id);
    return 'accepted';
  end if;
  perform private.notify(r.from_id, 'date_passed', 'Not this time',
    'No explanation needed. Passing is always okay on I''m In.', null, '/dates/' || r.id);
  return 'passed';
end $$;

-- Suggest a different time: closes the request and sends a new one back.
create or replace function public.counter_date_request(
  p_request bigint, p_when public.date_when, p_starts_at timestamptz default null, p_vibe text default null,
  p_venue_id bigint default null, p_place text default null, p_note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  r public.date_requests;
  n public.date_requests;
begin
  select * into r from public.date_requests where id = p_request and to_id = me and status = 'pending';
  if r.id is null then raise exception 'That date request isn''t available.' using errcode = 'check_violation'; end if;
  if p_when = 'specific' and (p_starts_at is null or p_starts_at < now()) then
    raise exception 'Pick a time that hasn''t passed.' using errcode = 'check_violation';
  end if;
  update public.date_requests set status = 'countered', responded_at = now() where id = r.id;
  insert into public.date_requests (from_id, to_id, when_kind, starts_at, vibe, venue_id, place_text, note, parent_id)
  values (me, r.from_id, p_when, case when p_when = 'specific' then p_starts_at end,
          coalesce(p_vibe, r.vibe),
          -- Keep the original spot unless a new one is suggested.
          case when p_venue_id is not null then p_venue_id when nullif(trim(p_place), '') is not null then null else r.venue_id end,
          case when p_venue_id is not null then null else coalesce(nullif(trim(p_place), ''), case when r.venue_id is null then r.place_text end) end,
          nullif(trim(p_note), ''), r.id)
  returning * into n;
  perform private.notify(r.from_id, 'date_counter', (select display_name from public.profiles where id = me) || ' suggested a different time',
    private.date_label(n), me, '/dates/' || n.id);
  return n.id;
end $$;

create or replace function public.cancel_date_request(p_request bigint)
returns void language sql security definer set search_path = '' as $$
  update public.date_requests set status = 'cancelled', responded_at = now()
   where id = p_request and from_id = auth.uid() and status = 'pending'
$$;

create or replace function public.date_request_detail(p_request bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when r.id is null then null else jsonb_build_object(
    'id', r.id, 'when_kind', r.when_kind, 'starts_at', r.starts_at, 'vibe', r.vibe, 'note', r.note,
    'place', coalesce(v.name, r.place_text), 'venue_id', r.venue_id, 'neighborhood', v.neighborhood,
    'status', r.status, 'created_at', r.created_at, 'responded_at', r.responded_at, 'parent_id', r.parent_id,
    'label', private.date_label(r),
    'i_sent', r.from_id = auth.uid(),
    -- The counter-proposal that answered this one, if any.
    'counter_id', (select c.id from public.date_requests c where c.parent_id = r.id order by c.id desc limit 1),
    'other', (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
                     'vouch_count', public.visible_vouch_count(p.id), 'degree', private.degree_between(auth.uid(), p.id),
                     'via', (select v2.display_name from public.profiles v2
                              where v2.id in (select private.first_degree_ids(auth.uid()) intersect select private.first_degree_ids(p.id))
                              order by v2.vouch_count desc limit 1))
              from public.profiles p where p.id = case when r.from_id = auth.uid() then r.to_id else r.from_id end),
    'conversation_id', (select c.id from public.conversations c where c.kind = 'direct'
                          and c.direct_a = least(r.from_id, r.to_id) and c.direct_b = greatest(r.from_id, r.to_id))
  ) end
  from (select p_request as id0) z
  left join public.date_requests r on r.id = z.id0 and auth.uid() in (r.from_id, r.to_id) and not private.is_blocked(r.from_id, r.to_id)
  left join public.venues v on v.id = r.venue_id
$$;

create or replace function public.my_dates()
returns table (id bigint, other_id uuid, other_name text, other_avatar_url text, i_sent boolean,
               status public.date_status, label text, vibe text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, p.id, p.display_name, p.avatar_url, r.from_id = auth.uid(), r.status, private.date_label(r), r.vibe, r.created_at
  from public.date_requests r
  join public.profiles p on p.id = case when r.from_id = auth.uid() then r.to_id else r.from_id end
  where auth.uid() in (r.from_id, r.to_id)
    and not private.is_blocked(r.from_id, r.to_id)
    and (r.status = 'pending' or (r.status = 'accepted' and r.responded_at > now() - interval '14 days'))
  order by (r.status = 'pending' and r.to_id = auth.uid()) desc, r.created_at desc
$$;

-- ── Trusted contacts ──────────────────────────────────────────────────────
-- People (not necessarily members) who are told if you need help.
create table public.trusted_contacts (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null check (char_length(trim(name)) between 1 and 60),
  phone      text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now()
);
create index trusted_contacts_user_idx on public.trusted_contacts (user_id);
alter table public.trusted_contacts enable row level security;
create policy "own contacts" on public.trusted_contacts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.trusted_contacts_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.trusted_contacts where user_id = new.user_id) >= public.config_num('trusted_contacts_max') then
    raise exception 'You can have up to % trusted contacts.', public.config_num('trusted_contacts_max')::int using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger trusted_contacts_limit before insert on public.trusted_contacts
  for each row execute function public.trusted_contacts_limit();

-- ── Date Mode ─────────────────────────────────────────────────────────────
create type public.date_session_status as enum ('waiting', 'active', 'ended', 'cancelled');

create table public.date_sessions (
  id                 bigserial primary key,
  initiator_id       uuid not null references public.profiles (id) on delete cascade,
  partner_id         uuid not null references public.profiles (id) on delete cascade,
  date_request_id    bigint references public.date_requests (id) on delete set null,
  status             public.date_session_status not null default 'waiting',
  distance_m         integer,             -- verified distance when it activated (or the last attempt)
  last_problem       text,                -- why it hasn't activated yet, in plain words
  activated_at       timestamptz,
  ended_at           timestamptz,
  checkin_minutes    integer not null default 60 check (checkin_minutes between 15 and 240),
  created_at         timestamptz not null default now(),
  check (initiator_id <> partner_id)
);
create unique index date_sessions_one_open on public.date_sessions (least(initiator_id, partner_id), greatest(initiator_id, partner_id))
  where status in ('waiting', 'active');
alter table public.date_sessions enable row level security;
create policy "my date sessions" on public.date_sessions for select to authenticated
  using (auth.uid() in (initiator_id, partner_id));

-- Each person's own safety check-in timer (private to them).
create table public.safety_checkins (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  session_id  bigint references public.date_sessions (id) on delete cascade,
  kind        text not null check (kind in ('safe', 'missed')),
  created_at  timestamptz not null default now()
);
create index safety_checkins_user_idx on public.safety_checkins (user_id, created_at desc);
alter table public.safety_checkins enable row level security;
create policy "own check-ins" on public.safety_checkins for select to authenticated using (user_id = auth.uid());

create table public.date_session_members (
  session_id      bigint not null references public.date_sessions (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  next_checkin_at timestamptz,
  missed_notified boolean not null default false,
  primary key (session_id, user_id)
);
alter table public.date_session_members enable row level security;
create policy "own timer" on public.date_session_members for select to authenticated using (user_id = auth.uid());

-- Who you can start Date Mode with: an accepted date request or a connection.
create or replace function private.can_date_mode(p_me uuid, p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_me <> p_other and not private.is_blocked(p_me, p_other)
    and (private.are_connected(p_me, p_other)
         or exists (select 1 from public.date_requests r where r.status = 'accepted'
                    and least(r.from_id, r.to_id) = least(p_me, p_other) and greatest(r.from_id, r.to_id) = greatest(p_me, p_other)))
$$;

create or replace function public.date_mode_candidates()
returns table (user_id uuid, display_name text, avatar_url text, vouch_count integer, detail text)
language sql stable security definer set search_path = '' as $$
  with accepted as (
    select case when r.from_id = auth.uid() then r.to_id else r.from_id end as uid, max(r.responded_at) as at,
           (array_agg(private.date_label(r) order by r.responded_at desc))[1] as label
    from public.date_requests r
    where auth.uid() in (r.from_id, r.to_id) and r.status = 'accepted'
    group by 1
  ),
  people as (
    select uid, 0 as rank, 'Date accepted · ' || label as detail from accepted
    union all
    select f, 1, 'Connected' from private.first_degree_ids(auth.uid()) f where f not in (select uid from accepted)
  )
  select p.id, p.display_name, p.avatar_url, public.visible_vouch_count(p.id), x.detail
  from people x join public.profiles p on p.id = x.uid
  where not private.is_blocked(auth.uid(), p.id)
  order by x.rank, p.display_name
$$;

-- Step 1: you tap Activate. Your reading is stored privately and your date is
-- asked to confirm they're there too.
create or replace function public.start_date_mode(p_partner uuid, p_lat double precision, p_lng double precision, p_accuracy_m real default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  sess public.date_sessions;
begin
  if not private.can_date_mode(me, p_partner) then
    raise exception 'Date Mode works with someone you connected with on I''m In (an accepted date or a connection).' using errcode = 'check_violation';
  end if;
  if p_accuracy_m is not null and p_accuracy_m > 200 then
    raise exception 'Your GPS signal is weak right now. Step outside or wait a moment, then try again.' using errcode = 'check_violation';
  end if;
  insert into public.location_pings (user_id, location, accuracy_m, purpose)
  values (me, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography, p_accuracy_m, 'date_mode');

  select * into sess from public.date_sessions
   where status in ('waiting', 'active') and least(initiator_id, partner_id) = least(me, p_partner)
     and greatest(initiator_id, partner_id) = greatest(me, p_partner);
  if sess.id is null then
    insert into public.date_sessions (initiator_id, partner_id, date_request_id, checkin_minutes, last_problem)
    values (me, p_partner,
            (select r.id from public.date_requests r where r.status = 'accepted'
               and least(r.from_id, r.to_id) = least(me, p_partner) and greatest(r.from_id, r.to_id) = greatest(me, p_partner)
             order by r.responded_at desc limit 1),
            public.config_num('date_mode_checkin_minutes')::int,
            'Waiting for ' || (select display_name from public.profiles where id = p_partner) || ' to confirm they''re there.')
    returning * into sess;
    insert into public.date_session_members (session_id, user_id) values (sess.id, me), (sess.id, p_partner);
  end if;
  perform private.notify(p_partner, 'date_mode', (select display_name from public.profiles where id = me) || ' wants to start Date Mode',
    'Confirm you''re there so safety check-ins start for both of you.', me, '/date-mode');
  -- If the partner already confirmed recently, this may activate right away.
  perform private.try_activate_date_mode(sess.id);
  return sess.id;
end $$;

-- Step 2: your date confirms. Activates only if both readings are within
-- 1 mile and taken within 10 minutes of each other.
create or replace function public.confirm_date_mode(p_session bigint, p_lat double precision, p_lng double precision, p_accuracy_m real default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  sess public.date_sessions;
begin
  select * into sess from public.date_sessions where id = p_session and me in (initiator_id, partner_id) and status in ('waiting', 'active');
  if sess.id is null then raise exception 'That Date Mode request isn''t available.' using errcode = 'check_violation'; end if;
  if p_accuracy_m is not null and p_accuracy_m > 200 then
    raise exception 'Your GPS signal is weak right now. Step outside or wait a moment, then try again.' using errcode = 'check_violation';
  end if;
  insert into public.location_pings (user_id, location, accuracy_m, purpose)
  values (me, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography, p_accuracy_m, 'date_mode');
  perform private.try_activate_date_mode(sess.id);
  return public.date_mode_status();
end $$;

create or replace function private.try_activate_date_mode(p_session bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  sess public.date_sessions;
  a record;
  b record;
  window_min int := public.config_num('date_mode_reading_window_min')::int;
  max_m int := public.config_num('date_mode_max_distance_m')::int;
  dist int;
  problem text;
begin
  select * into sess from public.date_sessions where id = p_session;
  if sess.status <> 'waiting' then return; end if;
  select location, recorded_at into a from public.location_pings
   where user_id = sess.initiator_id and purpose = 'date_mode' and recorded_at > now() - make_interval(mins => window_min)
   order by recorded_at desc, id desc limit 1;
  select location, recorded_at into b from public.location_pings
   where user_id = sess.partner_id and purpose = 'date_mode' and recorded_at > now() - make_interval(mins => window_min)
   order by recorded_at desc, id desc limit 1;
  if a.location is null then
    problem := (select display_name from public.profiles where id = sess.initiator_id) || '''s location is more than ' || window_min || ' minutes old. Tap Activate again.';
  elsif b.location is null then
    problem := (select display_name from public.profiles where id = sess.partner_id) || ' hasn''t confirmed yet.';
  else
    dist := round(extensions.st_distance(a.location, b.location))::int;
    if dist > max_m then
      problem := 'You''re ' || round((dist / 1609.344)::numeric, 1) || ' mi apart. Date Mode needs you within 1 mile of each other.';
    end if;
  end if;

  if problem is not null then
    update public.date_sessions set last_problem = problem, distance_m = coalesce(dist, distance_m) where id = sess.id;
    return;
  end if;

  update public.date_sessions set status = 'active', activated_at = now(), distance_m = dist, last_problem = null where id = sess.id;
  update public.date_session_members set next_checkin_at = now() + make_interval(mins => sess.checkin_minutes), missed_notified = false
   where session_id = sess.id;
  insert into public.notifications (user_id, kind, title, body, actor_id, link)
  select m.user_id, 'date_mode', 'Date Mode is on',
         'Safety check-ins every ' || sess.checkin_minutes || ' minutes. Your trusted contacts are on standby.', null, '/date-mode'
  from public.date_session_members m where m.session_id = sess.id;
end $$;

create or replace function public.date_mode_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when s.id is null then null else jsonb_build_object(
    'id', s.id, 'status', s.status, 'i_started', s.initiator_id = auth.uid(),
    'problem', s.last_problem, 'distance_mi', round((s.distance_m / 1609.344)::numeric, 2),
    'activated_at', s.activated_at, 'checkin_minutes', s.checkin_minutes,
    'next_checkin_at', (select m.next_checkin_at from public.date_session_members m where m.session_id = s.id and m.user_id = auth.uid()),
    'partner', (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
                                          'vouch_count', public.visible_vouch_count(p.id))
                from public.profiles p where p.id = case when s.initiator_id = auth.uid() then s.partner_id else s.initiator_id end),
    'date_label', (select private.date_label(r) from public.date_requests r where r.id = s.date_request_id),
    'contacts', (select count(*) from public.trusted_contacts t where t.user_id = auth.uid())
  ) end
  from (select 1) z
  left join lateral (
    select * from public.date_sessions ds
    where auth.uid() in (ds.initiator_id, ds.partner_id) and ds.status in ('waiting', 'active')
    order by ds.created_at desc limit 1
  ) s on true
$$;

-- "I'm safe": resets your own check-in timer.
create or replace function public.safety_check_in()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  sess public.date_sessions;
  nxt timestamptz;
begin
  select * into sess from public.date_sessions
   where me in (initiator_id, partner_id) and status = 'active' order by created_at desc limit 1;
  insert into public.safety_checkins (user_id, session_id, kind) values (me, sess.id, 'safe');
  if sess.id is null then return null; end if;
  nxt := now() + make_interval(mins => sess.checkin_minutes);
  update public.date_session_members set next_checkin_at = nxt, missed_notified = false where session_id = sess.id and user_id = me;
  return nxt;
end $$;

create or replace function public.set_checkin_interval(p_minutes integer)
returns void language plpgsql security definer set search_path = '' as $$
declare sess public.date_sessions;
begin
  select * into sess from public.date_sessions
   where auth.uid() in (initiator_id, partner_id) and status in ('waiting', 'active') order by created_at desc limit 1;
  if sess.id is null then return; end if;
  update public.date_sessions set checkin_minutes = p_minutes where id = sess.id;
  update public.date_session_members set next_checkin_at = now() + make_interval(mins => p_minutes)
   where session_id = sess.id and user_id = auth.uid() and next_checkin_at is not null;
end $$;

create or replace function public.end_date_mode()
returns void language plpgsql security definer set search_path = '' as $$
declare sess public.date_sessions;
begin
  select * into sess from public.date_sessions
   where auth.uid() in (initiator_id, partner_id) and status in ('waiting', 'active') order by created_at desc limit 1;
  if sess.id is null then return; end if;
  update public.date_sessions set status = case when status = 'active' then 'ended' else 'cancelled' end::public.date_session_status,
         ended_at = now() where id = sess.id;
  perform private.notify(case when sess.initiator_id = auth.uid() then sess.partner_id else sess.initiator_id end, 'date_mode',
    'Date Mode ended', (select display_name from public.profiles where id = auth.uid()) || ' ended Date Mode.', auth.uid(), '/date-mode');
end $$;

-- Missed check-ins: every 5 minutes, anyone past due gets reminded once and
-- the miss is recorded. (Texting trusted contacts needs Twilio; until then
-- the app shows the reminder and the one-tap "I need help" flow.)
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
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('flag-missed-safety-checkins', '*/5 * * * *', 'select private.flag_missed_checkins()');
  end if;
end $$;

-- ── "I need help" ─────────────────────────────────────────────────────────
create type public.safety_level as enum ('unsafe', 'leaving', 'emergency');

create table public.safety_alerts (
  id           bigserial primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  session_id   bigint references public.date_sessions (id) on delete set null,
  level        public.safety_level not null,
  contacts_notified integer not null default 0,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
alter table public.safety_alerts enable row level security;
create policy "own alerts" on public.safety_alerts for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Records the alert (and the private GPS reading) and returns what the app
-- needs to message the trusted contacts.
create or replace function public.raise_safety_alert(p_level public.safety_level, p_lat double precision default null, p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  alert_id bigint;
  sess public.date_sessions;
begin
  select * into sess from public.date_sessions
   where me in (initiator_id, partner_id) and status = 'active' order by created_at desc limit 1;
  if p_lat is not null and p_lng is not null then
    insert into public.location_pings (user_id, location, purpose)
    values (me, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography, 'date_mode');
  end if;
  -- Escalating an open alert updates it; otherwise start a new one.
  update public.safety_alerts set level = p_level where user_id = me and resolved_at is null and level < p_level
  returning id into alert_id;
  if alert_id is null then
    select id into alert_id from public.safety_alerts where user_id = me and resolved_at is null order by created_at desc limit 1;
  end if;
  if alert_id is null then
    insert into public.safety_alerts (user_id, session_id, level) values (me, sess.id, p_level) returning id into alert_id;
  end if;
  -- Moderators hear about every emergency.
  if p_level = 'emergency' then
    insert into public.notifications (user_id, kind, title, body, actor_id, link)
    select p.id, 'moderation', 'Safety emergency raised', (select display_name from public.profiles where id = me), me, null
    from public.profiles p where p.role = 'admin';
  end if;
  return jsonb_build_object(
    'alert_id', alert_id,
    'name', (select display_name from public.profiles where id = me),
    'with', (select display_name from public.profiles where id = case when sess.initiator_id = me then sess.partner_id else sess.initiator_id end),
    'contacts', coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'phone', t.phone) order by t.id)
                          from public.trusted_contacts t where t.user_id = me), '[]'::jsonb)
  );
end $$;

create or replace function public.resolve_safety_alert()
returns void language sql security definer set search_path = '' as $$
  update public.safety_alerts set resolved_at = now() where user_id = auth.uid() and resolved_at is null
$$;

create or replace function public.mark_contacts_notified(p_alert bigint, p_count integer)
returns void language sql security definer set search_path = '' as $$
  update public.safety_alerts set contacts_notified = greatest(contacts_notified, p_count) where id = p_alert and user_id = auth.uid()
$$;

-- ── Permissions ───────────────────────────────────────────────────────────
revoke execute on function private.flag_missed_checkins() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.message_status(uuid)',
    'public.inbox()',
    'public.send_date_request(uuid, public.date_when, timestamptz, text, bigint, text, text)',
    'public.respond_date_request(bigint, boolean)',
    'public.counter_date_request(bigint, public.date_when, timestamptz, text, bigint, text, text)',
    'public.cancel_date_request(bigint)',
    'public.date_request_detail(bigint)',
    'public.my_dates()',
    'public.date_mode_candidates()',
    'public.start_date_mode(uuid, double precision, double precision, real)',
    'public.confirm_date_mode(bigint, double precision, double precision, real)',
    'public.date_mode_status()',
    'public.safety_check_in()',
    'public.set_checkin_interval(integer)',
    'public.end_date_mode()',
    'public.raise_safety_alert(public.safety_level, double precision, double precision)',
    'public.resolve_safety_alert()',
    'public.mark_contacts_notified(bigint, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
