-- I'm In: 001 Config
-- Everything the founder may want to tune without shipping new code lives here:
-- cities, plan limits, tiers, vouch words, and misc app settings.

create extension if not exists postgis with schema extensions;
create extension if not exists citext with schema extensions;

-- ── Cities ────────────────────────────────────────────────────────────────
create table public.cities (
  id          smallserial primary key,
  slug        text not null unique,
  name        text not null,
  region      text not null,               -- 'DC', 'Northern Virginia', 'Maryland'
  metro       text not null default 'DC Metro',
  center      extensions.geography(Point, 4326) not null,
  active      boolean not null default true,
  sort        smallint not null default 0
);
comment on table public.cities is 'Launch market is DC Metro. New cities or metros are new rows.';

-- ── App config (key → JSON) ───────────────────────────────────────────────
create table public.app_config (
  key         text primary key,
  value       jsonb not null,
  description text not null default ''
);

-- ── Plan limits: Free vs Premium ──────────────────────────────────────────
-- A NULL value means "unlimited".
create table public.plan_limits (
  key           text primary key,
  free_value    numeric,
  premium_value numeric,
  description   text not null default ''
);

-- ── Vouch tiers ───────────────────────────────────────────────────────────
create table public.vouch_tiers (
  id          smallserial primary key,
  name        text not null unique,
  min_vouches integer not null unique check (min_vouches >= 0),
  emoji       text not null default ''
);

-- ── Vouch words ───────────────────────────────────────────────────────────
create table public.vouch_words (
  id      smallserial primary key,
  word    text not null unique,
  active  boolean not null default true,
  sort    smallint not null default 0
);

-- Config is readable by everyone signed in (the app needs it); only admins or
-- the service role can change it.
alter table public.cities      enable row level security;
alter table public.app_config  enable row level security;
alter table public.plan_limits enable row level security;
alter table public.vouch_tiers enable row level security;
alter table public.vouch_words enable row level security;

create policy "config readable" on public.cities      for select using (true);
create policy "config readable" on public.app_config  for select using (true);
create policy "config readable" on public.plan_limits for select using (true);
create policy "config readable" on public.vouch_tiers for select using (true);
create policy "config readable" on public.vouch_words for select using (true);

-- ── Default values (production-safe; these are settings, not demo data) ──
insert into public.cities (slug, name, region, center, sort) values
  ('washington-dc',  'Washington, DC',  'DC',                extensions.st_point(-77.0369, 38.9072, 4326)::extensions.geography, 1),
  ('arlington-va',   'Arlington, VA',   'Northern Virginia', extensions.st_point(-77.1067, 38.8816, 4326)::extensions.geography, 2),
  ('alexandria-va',  'Alexandria, VA',  'Northern Virginia', extensions.st_point(-77.0469, 38.8048, 4326)::extensions.geography, 3),
  ('fairfax-va',     'Fairfax, VA',     'Northern Virginia', extensions.st_point(-77.3064, 38.8462, 4326)::extensions.geography, 4),
  ('tysons-va',      'Tysons, VA',      'Northern Virginia', extensions.st_point(-77.2311, 38.9187, 4326)::extensions.geography, 5),
  ('mclean-va',      'McLean, VA',      'Northern Virginia', extensions.st_point(-77.1772, 38.9339, 4326)::extensions.geography, 6),
  ('falls-church-va','Falls Church, VA','Northern Virginia', extensions.st_point(-77.1711, 38.8823, 4326)::extensions.geography, 7),
  ('bethesda-md',    'Bethesda, MD',    'Maryland',          extensions.st_point(-77.0947, 38.9807, 4326)::extensions.geography, 8),
  ('silver-spring-md','Silver Spring, MD','Maryland',        extensions.st_point(-77.0261, 38.9907, 4326)::extensions.geography, 9),
  ('rockville-md',   'Rockville, MD',   'Maryland',          extensions.st_point(-77.1528, 39.0840, 4326)::extensions.geography, 10),
  ('college-park-md','College Park, MD','Maryland',          extensions.st_point(-76.9369, 38.9807, 4326)::extensions.geography, 11);

insert into public.app_config (key, value, description) values
  ('founding_member_limit',    '500',   'The first N members are Founding Members (3 months Premium free).'),
  ('founding_trial_months',    '3',     'Free Premium months for Founding Members.'),
  ('premium_price_usd',        '14.99', 'Display price. The real price is set in App Store Connect / RevenueCat.'),
  ('min_age',                  '18',    'Signups under this age are blocked.'),
  ('invite_vouch_cap',         '1',     'Max invite-code vouches a person can RECEIVE. Invite vouches skip GPS, so they are capped.'),
  ('default_radius_mi',        '5',     'Default radius for Nearby and Tonight.'),
  ('location_snap_meters',     '400',   'Shared locations are snapped to a grid this size unless the user chooses precise.'),
  ('encounter_max_distance_m', '150',   'Two GPS pings closer than this, at overlapping times, count as being together.'),
  ('encounter_time_window_min','30',    'Pings within this many minutes of each other count as overlapping.'),
  ('date_mode_max_distance_mi','1',     'Both people must be within this distance to activate Date Mode.'),
  ('date_mode_ping_window_min','10',    'Both Date Mode GPS readings must be this recent.'),
  ('location_ping_retention_days','30', 'Raw GPS readings are deleted after this many days.'),
  ('momentum_hours',           '{"start":"17:00","end":"02:00","every_min":30}', 'When the Social Momentum score updates.');

insert into public.plan_limits (key, free_value, premium_value, description) values
  ('search_radius_mi',           10,   75,   'How far you can search for people, events and Tonight.'),
  ('pins_radius_max_mi',         50,   50,   'Max radius on the Pins Nearby slider (also capped by search_radius_mi for free).'),
  ('messaging_min_interactions', 5,    0,    'Interactions needed before you can message a connection.'),
  ('ai_uses',                    3,    null, 'User-started AI generations (NULL = unlimited).'),
  ('tonight_priority',           0,    1,    '1 = going-out posts are boosted on the Tonight feed.'),
  ('profile_analytics',          0,    1,    '1 = profile analytics are available.'),
  ('premium_badge',              0,    1,    '1 = Premium badge shows on profile.');

insert into public.vouch_tiers (name, min_vouches, emoji) values
  ('New Face',    0,   '👋'),
  ('In the Mix',  5,   '🌀'),
  ('Connector',   20,  '🔗'),
  ('Plugged In',  50,  '⚡'),
  ('Icon',        100, '👑');

insert into public.vouch_words (word, sort) values
  ('Welcoming', 1), ('Authentic', 2), ('Connector', 3), ('Thoughtful', 4),
  ('Reliable', 5), ('Adventurous', 6), ('Community', 7), ('Generous', 8),
  ('Leader', 9), ('Creative', 10), ('Foodie', 11), ('Fun', 12);

-- Helper: read a numeric app_config value.
create or replace function public.config_num(p_key text)
returns numeric language sql stable set search_path = '' as $$
  select (value #>> '{}')::numeric from public.app_config where key = p_key
$$;
