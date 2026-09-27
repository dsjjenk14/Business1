-- I'm In: 002 People
-- Public profile, private account details (owner-only), settings, blocks.

create type public.location_precision as enum ('approximate', 'precise');
create type public.user_role as enum ('user', 'admin');

create sequence public.member_number_seq;

-- ── Public profile ────────────────────────────────────────────────────────
-- Anything in this table can be seen by other signed-in members.
-- Private details (phone, email, birthdate) live in profile_private.
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  full_name           text not null check (char_length(full_name) between 1 and 80),
  display_name        text not null check (char_length(display_name) between 1 and 40),
  bio                 text not null default '' check (char_length(bio) <= 500),
  pronouns            text check (char_length(pronouns) <= 30),
  headline            text not null default '' check (char_length(headline) <= 80), -- "Howard Alum · Fairfax, VA"
  avatar_url          text,
  avatar_emoji        text,                       -- fallback avatar (used by demo data)
  city_id             smallint references public.cities (id),
  neighborhood        text,
  approx_location     extensions.geography(Point, 4326),  -- snapped to a grid, never exact
  location_precision  public.location_precision not null default 'approximate',
  invite_code         text not null unique,
  invited_by          uuid references public.profiles (id) on delete set null,
  member_number       integer not null unique default nextval('public.member_number_seq'),
  is_founding_member  boolean not null default false,
  role                public.user_role not null default 'user',
  show_age            boolean not null default true,
  id_verified_at      timestamptz,
  photo_verified_at   timestamptz,
  vouch_count         integer not null default 0,   -- maintained by trigger
  top_vouch_word      text,                         -- most-received word, maintained by trigger
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index profiles_city_idx on public.profiles (city_id);
create index profiles_location_idx on public.profiles using gist (approx_location);

-- ── Private account details (only the owner can read) ─────────────────────
create table public.profile_private (
  id            uuid primary key references public.profiles (id) on delete cascade,
  email         extensions.citext,
  phone         text unique,
  phone_verified_at timestamptz,
  birthdate     date not null,
  ai_chat_opt_in boolean not null default false,   -- AI badges may read chat only if true
  onboarding_checklist_dismissed_at timestamptz,
  created_at    timestamptz not null default now()
);

-- ── Settings ──────────────────────────────────────────────────────────────
create table public.user_settings (
  user_id                 uuid primary key references public.profiles (id) on delete cascade,
  radius_mi               numeric not null default 5 check (radius_mi between 1 and 75),
  theme_id                text not null default 'O' check (theme_id in ('O','A','B','C','D')),
  -- privacy
  show_in_nearby          boolean not null default true,
  allow_intro_requests    boolean not null default true,
  show_vouch_count        boolean not null default true,
  show_going_out_venue    boolean not null default true,
  discoverable            boolean not null default true,
  -- notifications
  notify_rsvps            boolean not null default true,
  notify_pin_replies      boolean not null default true,
  notify_messages         boolean not null default true,
  notify_date_requests    boolean not null default true,
  notify_gps_vouch        boolean not null default true,
  notify_intro_requests   boolean not null default true,
  updated_at              timestamptz not null default now()
);

-- ── Blocks ────────────────────────────────────────────────────────────────
create table public.blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ── Push tokens & notifications ───────────────────────────────────────────
create table public.push_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null,          -- 'going_out', 'pin_reply', 'ai_pick', 'momentum', 'message', 'vouch', ...
  title      text not null,
  body       text not null default '',
  actor_id   uuid references public.profiles (id) on delete set null,
  link       text,                   -- in-app route, e.g. '/pins/123'
  is_ai      boolean not null default false,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ── Helpers ───────────────────────────────────────────────────────────────
-- True if either person has blocked the other.
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- Age shown on a profile, only if that person allows it.
create or replace function public.profile_age(p_user uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select extract(year from age(pp.birthdate))::int
  from public.profile_private pp
  join public.profiles p on p.id = pp.id
  where pp.id = p_user and p.show_age
$$;

-- "Maya Thompson" → "Maya T."
create or replace function public.short_name(p_full text)
returns text language sql immutable set search_path = '' as $$
  select case
    when array_length(regexp_split_to_array(trim(p_full), '\s+'), 1) > 1
      then split_part(trim(p_full), ' ', 1) || ' ' ||
           left((regexp_split_to_array(trim(p_full), '\s+'))[array_length(regexp_split_to_array(trim(p_full), '\s+'), 1)], 1) || '.'
    else trim(p_full)
  end
$$;

-- Snap a point to a grid so exact locations are never stored for display.
create or replace function public.snap_location(p_lng double precision, p_lat double precision)
returns extensions.geography language sql stable set search_path = '' as $$
  select extensions.st_transform(
           extensions.st_snaptogrid(
             extensions.st_transform(extensions.st_setsrid(extensions.st_point(p_lng, p_lat), 4326), 3857),
             public.config_num('location_snap_meters')::double precision),
           4326)::extensions.geography
$$;

create or replace function public.generate_invite_code()
returns text language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I
  code text;
begin
  loop
    code := '';
    for i in 1..7 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where invite_code = code);
  end loop;
  return code;
end $$;

-- Public (pre-login) check used by the signup screen: "Maya T. invited you".
create or replace function public.check_invite_code(p_code text)
returns text language sql stable security definer set search_path = '' as $$
  select display_name from public.profiles where invite_code = upper(trim(p_code))
$$;
grant execute on function public.check_invite_code(text) to anon, authenticated;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.profiles        enable row level security;
alter table public.profile_private enable row level security;
alter table public.user_settings   enable row level security;
alter table public.blocks          enable row level security;
alter table public.push_tokens     enable row level security;
alter table public.notifications   enable row level security;

create policy "members see unblocked profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or not public.is_blocked(auth.uid(), id));
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Users may only change their own presentational fields; counts, roles,
-- membership numbers and verification dates are server-controlled.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, display_name, bio, pronouns, headline, avatar_url, avatar_emoji,
              city_id, neighborhood, location_precision, show_age)
  on public.profiles to authenticated;

create policy "own private row" on public.profile_private for select to authenticated
  using (id = auth.uid());
create policy "edit own private row" on public.profile_private for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profile_private from authenticated, anon;
grant update (ai_chat_opt_in, onboarding_checklist_dismissed_at) on public.profile_private to authenticated;

create policy "own settings" on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own blocks" on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy "own push tokens" on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "mark own notifications read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;
