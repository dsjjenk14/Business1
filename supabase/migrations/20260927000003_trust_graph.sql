-- I'm In: 003 Trust graph
-- Connections (1st degree), 2nd degree (calculated), intros, GPS encounters,
-- vouches, vouch requests, interaction counts, and the signup trigger.

create type public.connection_source as enum ('invite', 'intro', 'event', 'group', 'date', 'manual');
create type public.intro_status as enum ('pending', 'accepted', 'declined');
create type public.vouch_type as enum ('gps', 'invite');
create type public.vouch_status as enum ('active', 'flagged', 'revoked');
create type public.encounter_context as enum ('venue', 'event', 'group', 'date', 'nearby');
create type public.request_status as enum ('pending', 'accepted', 'declined', 'cancelled');

-- ── Connections (1st degree) ──────────────────────────────────────────────
-- One row per pair, stored with user_a < user_b so a pair can't be duplicated.
create table public.connections (
  user_a     uuid not null references public.profiles (id) on delete cascade,
  user_b     uuid not null references public.profiles (id) on delete cascade,
  source     public.connection_source not null,
  connector_id uuid references public.profiles (id) on delete set null,  -- who made the intro
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index connections_b_idx on public.connections (user_b);

-- All of a user's 1st-degree connection ids.
create or replace function private.first_degree_ids(p_user uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select case when user_a = p_user then user_b else user_a end
  from public.connections where user_a = p_user or user_b = p_user
$$;

create or replace function private.are_connected(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.connections where user_a = least(a, b) and user_b = greatest(a, b))
$$;

-- 2nd degree: people your 1st degree knows, who aren't already 1st degree,
-- with the mutual connections you'd ask for an intro ("Ask Maya →").
create or replace function private.second_degree(p_user uuid)
returns table (user_id uuid, via_ids uuid[]) language sql stable security definer set search_path = '' as $$
  with f as (select private.first_degree_ids(p_user) as id)
  select s.id as user_id, array_agg(distinct f.id) as via_ids
  from f
  cross join lateral private.first_degree_ids(f.id) as s(id)
  where s.id <> p_user
    and s.id not in (select id from f)
    and not private.is_blocked(p_user, s.id)
  group by s.id
$$;

-- 1 = directly connected, 2 = one intro away, NULL = further / unrelated.
create or replace function private.degree_between(a uuid, b uuid)
returns smallint language sql stable security definer set search_path = '' as $$
  select case
    when a = b then 0::smallint
    when private.are_connected(a, b) then 1::smallint
    when exists (
      select 1 from private.first_degree_ids(a) fa
      join private.first_degree_ids(b) fb on fa = fb
    ) then 2::smallint
    else null
  end
$$;

-- ── Intros ────────────────────────────────────────────────────────────────
create table public.intros (
  id              bigserial primary key,
  connector_id    uuid not null references public.profiles (id) on delete cascade,
  person_a        uuid not null references public.profiles (id) on delete cascade,
  person_b        uuid not null references public.profiles (id) on delete cascade,
  message         text not null check (char_length(message) between 1 and 500),
  a_status        public.intro_status not null default 'pending',
  b_status        public.intro_status not null default 'pending',
  predicted_score smallint check (predicted_score between 0 and 100),
  created_at      timestamptz not null default now(),
  check (person_a <> person_b and connector_id <> person_a and connector_id <> person_b)
);

-- "Ask Maya to intro me to Simone"
create table public.intro_requests (
  id           bigserial primary key,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id    uuid not null references public.profiles (id) on delete cascade,
  via_id       uuid not null references public.profiles (id) on delete cascade,
  note         text check (char_length(note) <= 300),
  status       public.request_status not null default 'pending',
  intro_id     bigint references public.intros (id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ── GPS: private pings and server-computed encounters ─────────────────────
-- Raw readings. Nobody can read these through the API (no select policy).
-- Only server code (service role) turns them into encounters.
create table public.location_pings (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  location    extensions.geography(Point, 4326) not null,
  accuracy_m  real,
  purpose     text not null check (purpose in ('checkin', 'vouch', 'date_mode', 'going_out')),
  venue_id    bigint,   -- FK added in 005 once venues exist
  event_id    bigint,   -- FK added in 005 once events exist
  recorded_at timestamptz not null default now()
);
create index location_pings_user_time_idx on public.location_pings (user_id, recorded_at desc);
create index location_pings_geo_idx on public.location_pings using gist (location);

-- Proof two people were together. Created by the server only.
create table public.encounters (
  id          bigserial primary key,
  user_a      uuid not null references public.profiles (id) on delete cascade,
  user_b      uuid not null references public.profiles (id) on delete cascade,
  context     public.encounter_context not null,
  venue_id    bigint,
  event_id    bigint,
  place_label text,                       -- "Bresca", "Rock Creek"
  distance_m  real not null,
  overlap_start timestamptz not null,
  overlap_end   timestamptz not null,
  created_at  timestamptz not null default now(),
  check (user_a < user_b),
  check (overlap_end >= overlap_start)
);
create index encounters_a_idx on public.encounters (user_a);
create index encounters_b_idx on public.encounters (user_b);

-- ── Vouches ───────────────────────────────────────────────────────────────
create table public.vouches (
  id           bigserial primary key,
  voucher_id   uuid not null references public.profiles (id) on delete cascade,
  vouchee_id   uuid not null references public.profiles (id) on delete cascade,
  type         public.vouch_type not null,
  word_id      smallint references public.vouch_words (id),
  encounter_id bigint references public.encounters (id) on delete restrict,
  status       public.vouch_status not null default 'active',
  created_at   timestamptz not null default now(),
  check (voucher_id <> vouchee_id),
  -- A GPS vouch always has a word and a GPS encounter behind it.
  check (type <> 'gps' or (word_id is not null and encounter_id is not null)),
  check (type <> 'invite' or encounter_id is null)
);
-- A GPS vouch uses one GPS meetup once. You can vouch the same friend again
-- after a new meetup, limited by your monthly budget (see validate_vouch).
create unique index vouches_once_per_encounter on public.vouches (voucher_id, vouchee_id, encounter_id) where type = 'gps';
create unique index vouches_invite_once on public.vouches (voucher_id, vouchee_id) where type = 'invite';
create index vouches_vouchee_idx on public.vouches (vouchee_id, created_at desc);

-- Enforces the vouch rules even if the app has a bug.
create or replace function public.validate_vouch()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  enc public.encounters;
  invite_count int;
  given_this_month int;
begin
  if new.type = 'gps' then
    select * into enc from public.encounters where id = new.encounter_id;
    if enc.id is null
       or least(new.voucher_id, new.vouchee_id) <> enc.user_a
       or greatest(new.voucher_id, new.vouchee_id) <> enc.user_b then
      raise exception 'A vouch needs a GPS-confirmed meetup between these two people.'
        using errcode = 'check_violation';
    end if;
    -- Monthly budget: each member can give N vouches per calendar month (DC time).
    select count(*) into given_this_month from public.vouches
     where voucher_id = new.voucher_id
       and type = 'gps'
       and status <> 'revoked'
       and date_trunc('month', created_at at time zone 'America/New_York')
         = date_trunc('month', coalesce(new.created_at, now()) at time zone 'America/New_York');
    if given_this_month >= public.config_num('vouches_per_month') then
      raise exception 'You''ve used your vouches for this month. You get more on the 1st.'
        using errcode = 'check_violation';
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

create trigger vouches_validate before insert on public.vouches
  for each row execute function public.validate_vouch();

-- "You have 2 vouches left this month" for the signed-in member.
create or replace function public.my_vouches_left_this_month()
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(0, public.config_num('vouches_per_month')::int - (
    select count(*)::int from public.vouches
     where voucher_id = auth.uid() and type = 'gps' and status <> 'revoked'
       and date_trunc('month', created_at at time zone 'America/New_York')
         = date_trunc('month', now() at time zone 'America/New_York')))
$$;

-- Keeps profiles.vouch_count and profiles.top_vouch_word current.
create or replace function public.refresh_vouch_stats(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  update public.profiles p set
    vouch_count = (select count(*) from public.vouches v where v.vouchee_id = p_user and v.status = 'active'),
    top_vouch_word = (
      select w.word from public.vouches v join public.vouch_words w on w.id = v.word_id
      where v.vouchee_id = p_user and v.status = 'active'
      group by w.word order by count(*) desc, max(v.created_at) desc limit 1)
  where p.id = p_user
$$;

create or replace function public.vouch_stats_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_vouch_stats(coalesce(new.vouchee_id, old.vouchee_id));
  if tg_op = 'UPDATE' and old.vouchee_id <> new.vouchee_id then
    perform public.refresh_vouch_stats(old.vouchee_id);
  end if;
  return null;
end $$;

create trigger vouches_stats after insert or update or delete on public.vouches
  for each row execute function public.vouch_stats_trigger();

create table public.vouch_requests (
  id           bigserial primary key,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id    uuid not null references public.profiles (id) on delete cascade,
  encounter_id bigint references public.encounters (id) on delete set null,
  status       public.request_status not null default 'pending',
  created_at   timestamptz not null default now(),
  check (requester_id <> target_id)
);

-- ── Back-and-forths (free-tier messaging unlock) ─────────────────────────
-- Free members can message a connection after N back-and-forths with them.
-- One back-and-forth = one person says something to the other and the other
-- replies. Before messaging unlocks, that happens on Pins: commenting on
-- someone's pin, and the pin owner replying back in the thread.
-- Likes, RSVPs and being at the same place don't count.
--
-- We track "turns": consecutive messages from the same person collapse into
-- one turn, and every change of speaker is a new turn. Two turns (A then B)
-- make one back-and-forth.
create table public.interactions (
  user_a       uuid not null references public.profiles (id) on delete cascade,
  user_b       uuid not null references public.profiles (id) on delete cascade,
  turns        integer not null default 0,
  exchanges    integer not null default 0,     -- completed back-and-forths = floor(turns / 2)
  last_sender  uuid,
  updated_at   timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create or replace function public.record_communication(p_from uuid, p_to uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_from = p_to then return; end if;
  insert into public.interactions as i (user_a, user_b, turns, exchanges, last_sender)
  values (least(p_from, p_to), greatest(p_from, p_to), 1, 0, p_from)
  on conflict (user_a, user_b) do update set
    turns       = case when i.last_sender = p_from then i.turns else i.turns + 1 end,
    exchanges   = (case when i.last_sender = p_from then i.turns else i.turns + 1 end) / 2,
    last_sender = p_from,
    updated_at  = now();
end $$;
revoke execute on function public.record_communication(uuid, uuid) from public, anon, authenticated;

-- ── Signup: create profile, apply invite code, founding member ────────────
-- Runs for every new auth user. Reads the signup form from user metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_full_name text  := trim(coalesce(meta ->> 'full_name', ''));
  v_birthdate date  := nullif(meta ->> 'birthdate', '')::date;
  v_code      text  := upper(trim(coalesce(meta ->> 'invite_code', '')));
  v_city_id   smallint;
  v_inviter   uuid;
  v_member_no integer;
begin
  if v_full_name = '' then
    raise exception 'Full name is required.' using errcode = 'check_violation';
  end if;
  if v_birthdate is null then
    raise exception 'Date of birth is required.' using errcode = 'check_violation';
  end if;
  if extract(year from age(v_birthdate)) < public.config_num('min_age') then
    raise exception 'You must be 18 or older to join I''m In.' using errcode = 'check_violation';
  end if;

  select id into v_city_id from public.cities where slug = meta ->> 'city_slug';

  if v_code <> '' then
    select id into v_inviter from public.profiles where invite_code = v_code;
    if v_inviter is null then
      raise exception 'That invite code doesn''t match anyone.' using errcode = 'check_violation';
    end if;
  end if;

  v_member_no := nextval('public.member_number_seq');

  insert into public.profiles (
    id, full_name, display_name, avatar_url, city_id, invite_code, invited_by,
    member_number, is_founding_member)
  values (
    new.id, v_full_name,
    coalesce(nullif(trim(meta ->> 'display_name'), ''), public.short_name(v_full_name)),
    nullif(meta ->> 'avatar_url', ''),
    v_city_id, public.generate_invite_code(), v_inviter,
    v_member_no, v_member_no <= public.config_num('founding_member_limit'));

  insert into public.profile_private (id, email, phone, birthdate)
  values (new.id, new.email, nullif(trim(meta ->> 'phone'), ''), v_birthdate);

  insert into public.user_settings (user_id, radius_mi)
  values (new.id, public.config_num('default_radius_mi'));

  -- Invite code: auto-connect and both get an invite vouch (inviter's is capped).
  if v_inviter is not null then
    insert into public.connections (user_a, user_b, source)
    values (least(new.id, v_inviter), greatest(new.id, v_inviter), 'invite');

    insert into public.vouches (voucher_id, vouchee_id, type)
    values (v_inviter, new.id, 'invite');

    if (select count(*) from public.vouches where vouchee_id = v_inviter and type = 'invite')
         < public.config_num('invite_vouch_cap') then
      insert into public.vouches (voucher_id, vouchee_id, type)
      values (new.id, v_inviter, 'invite');
    end if;

  end if;

  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.connections    enable row level security;
alter table public.intros         enable row level security;
alter table public.intro_requests enable row level security;
alter table public.location_pings enable row level security;
alter table public.encounters     enable row level security;
alter table public.vouches        enable row level security;
alter table public.vouch_requests enable row level security;
alter table public.interactions   enable row level security;

-- Connections: you can see your own, and your connections' (needed for 2nd degree UI).
create policy "see own and friends' connections" on public.connections for select to authenticated
  using (
    auth.uid() in (user_a, user_b)
    or private.are_connected(auth.uid(), user_a)
    or private.are_connected(auth.uid(), user_b)
  );
-- Connections are created by server logic only (invites, accepted intros...).

create policy "intro participants" on public.intros for select to authenticated
  using (auth.uid() in (connector_id, person_a, person_b));
create policy "make intros between your connections" on public.intros for insert to authenticated
  with check (
    connector_id = auth.uid()
    and private.are_connected(auth.uid(), person_a)
    and private.degree_between(auth.uid(), person_b) in (1, 2)
  );

create policy "intro request participants" on public.intro_requests for select to authenticated
  using (auth.uid() in (requester_id, target_id, via_id));
create policy "request an intro via a mutual" on public.intro_requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and private.are_connected(auth.uid(), via_id)
    and private.are_connected(via_id, target_id)
  );

-- location_pings: insert own only, never readable through the API.
create policy "send own pings" on public.location_pings for insert to authenticated
  with check (user_id = auth.uid());

create policy "own encounters" on public.encounters for select to authenticated
  using (auth.uid() in (user_a, user_b));

-- Vouches are public trust signals (who vouched whom, with which word).
create policy "vouches visible" on public.vouches for select to authenticated
  using (not private.is_blocked(auth.uid(), voucher_id) and not private.is_blocked(auth.uid(), vouchee_id));
create policy "give a gps vouch" on public.vouches for insert to authenticated
  with check (voucher_id = auth.uid() and type = 'gps' and status = 'active');

create policy "vouch request participants" on public.vouch_requests for select to authenticated
  using (auth.uid() in (requester_id, target_id));
create policy "ask for a vouch" on public.vouch_requests for insert to authenticated
  with check (requester_id = auth.uid());

create policy "own back-and-forth counts" on public.interactions for select to authenticated
  using (auth.uid() in (user_a, user_b));
