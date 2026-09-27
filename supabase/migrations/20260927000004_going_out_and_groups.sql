-- I'm In: 004 Venues, events, going-out posts, groups

create type public.join_type as enum ('request', 'open');
create type public.group_role as enum ('owner', 'admin', 'member');
create type public.going_out_when as enum ('tonight', 'weekend', 'scheduled');

-- ── Venues ────────────────────────────────────────────────────────────────
create table public.venues (
  id           bigserial primary key,
  name         text not null,
  emoji        text,
  address      text,
  neighborhood text,
  city_id      smallint references public.cities (id),
  location     extensions.geography(Point, 4326) not null,
  category     text,           -- 'restaurant', 'bar', 'music', 'fitness', 'park'
  price_level  smallint check (price_level between 1 and 4),
  description  text not null default '',
  created_at   timestamptz not null default now()
);
create index venues_location_idx on public.venues using gist (location);

-- ── Groups ────────────────────────────────────────────────────────────────
create table public.groups (
  id           bigserial primary key,
  name         text not null check (char_length(name) between 2 and 60),
  emoji        text not null default '✨',
  category     text not null check (category in ('fitness','food','music_arts','outdoors','social','alumni','professional','other')),
  description  text not null default '' check (char_length(description) <= 500),
  join_type    public.join_type not null default 'request',
  owner_id     uuid not null references public.profiles (id) on delete restrict,
  city_id      smallint references public.cities (id),
  schedule_label text,          -- "Sat 9AM"
  created_at   timestamptz not null default now()
);

create table public.group_members (
  group_id   bigint not null references public.groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.group_role not null default 'member',
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.group_join_requests (
  id          bigserial primary key,
  group_id    bigint not null references public.groups (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  why         text not null default '' check (char_length(why) <= 500),
  how_found   text check (how_found in ('through_member', 'discovery', 'search', 'word_of_mouth')),
  status      public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index group_join_requests_one_pending on public.group_join_requests (group_id, user_id) where status = 'pending';

create or replace function private.is_group_member(p_group bigint, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = p_group and user_id = p_user)
$$;

create or replace function private.is_group_admin(p_group bigint, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members
                 where group_id = p_group and user_id = p_user and role in ('owner', 'admin'))
$$;

-- ── Events ────────────────────────────────────────────────────────────────
create table public.events (
  id          bigserial primary key,
  host_id     uuid not null references public.profiles (id) on delete cascade,
  group_id    bigint references public.groups (id) on delete set null,
  venue_id    bigint references public.venues (id) on delete set null,
  title       text not null check (char_length(title) between 2 and 100),
  emoji       text,
  description text not null default '',
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  capacity    integer check (capacity > 0),
  is_recurring boolean not null default false,
  created_at  timestamptz not null default now()
);
create index events_starts_idx on public.events (starts_at);

create table public.event_rsvps (
  event_id   bigint not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ── Going-out posts (the Tonight feed) ────────────────────────────────────
create table public.going_out_posts (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  when_kind   public.going_out_when not null,
  starts_at   timestamptz not null,
  expires_at  timestamptz not null,
  venue_id    bigint references public.venues (id) on delete set null,
  place_text  text,                   -- when not a known venue
  approx_location extensions.geography(Point, 4326),
  vibes       text[] not null default '{}' check (vibes <@ array['solo','small_group','drinks','dinner','music','brunch','fitness','outdoors']),
  note        text check (char_length(note) <= 200),
  is_hosting  boolean not null default false,
  event_id    bigint references public.events (id) on delete set null,
  is_priority boolean not null default false,   -- Premium boost, set by server
  created_at  timestamptz not null default now(),
  check (expires_at > starts_at)
);
create index going_out_posts_time_idx on public.going_out_posts (expires_at desc);
create index going_out_posts_geo_idx on public.going_out_posts using gist (approx_location);

-- Now that venues/events exist, link GPS tables to them.
alter table public.location_pings
  add constraint location_pings_venue_fk foreign key (venue_id) references public.venues (id) on delete set null,
  add constraint location_pings_event_fk foreign key (event_id) references public.events (id) on delete set null;
alter table public.encounters
  add constraint encounters_venue_fk foreign key (venue_id) references public.venues (id) on delete set null,
  add constraint encounters_event_fk foreign key (event_id) references public.events (id) on delete set null;

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.venues               enable row level security;
alter table public.groups               enable row level security;
alter table public.group_members        enable row level security;
alter table public.group_join_requests  enable row level security;
alter table public.events               enable row level security;
alter table public.event_rsvps          enable row level security;
alter table public.going_out_posts      enable row level security;

create policy "venues readable" on public.venues for select to authenticated using (true);
create policy "admins manage venues" on public.venues for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "groups readable" on public.groups for select to authenticated using (true);
-- Creating groups requires photo verification (decision C10).
create policy "verified members create groups" on public.groups for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and photo_verified_at is not null)
  );
create policy "group admins edit" on public.groups for update to authenticated
  using (private.is_group_admin(id, auth.uid())) with check (private.is_group_admin(id, auth.uid()));

create policy "memberships readable" on public.group_members for select to authenticated using (true);
create policy "join open groups" on public.group_members for insert to authenticated
  with check (
    user_id = auth.uid() and role = 'member'
    and exists (select 1 from public.groups g where g.id = group_id and g.join_type = 'open')
  );
create policy "leave a group" on public.group_members for delete to authenticated
  using (user_id = auth.uid() or private.is_group_admin(group_id, auth.uid()));

create policy "see own and managed join requests" on public.group_join_requests for select to authenticated
  using (user_id = auth.uid() or private.is_group_admin(group_id, auth.uid()));
create policy "ask to join" on public.group_join_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy "admins review requests" on public.group_join_requests for update to authenticated
  using (private.is_group_admin(group_id, auth.uid())) with check (private.is_group_admin(group_id, auth.uid()));

create policy "events readable" on public.events for select to authenticated
  using (not private.is_blocked(auth.uid(), host_id));
create policy "host events" on public.events for insert to authenticated
  with check (host_id = auth.uid() and (group_id is null or private.is_group_admin(group_id, auth.uid())));
create policy "edit own events" on public.events for update to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

create policy "rsvps readable" on public.event_rsvps for select to authenticated using (true);
create policy "rsvp self" on public.event_rsvps for insert to authenticated with check (user_id = auth.uid());
create policy "un-rsvp self" on public.event_rsvps for delete to authenticated using (user_id = auth.uid());

-- Reads another user's privacy setting (user_settings itself is owner-only).
create or replace function public.shows_in_nearby(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select show_in_nearby from public.user_settings where user_id = p_user), true)
$$;

-- Going-out posts respect the poster's "show in nearby feed" setting and blocks.
create policy "going-out posts visible" on public.going_out_posts for select to authenticated
  using (
    user_id = auth.uid()
    or (
      not private.is_blocked(auth.uid(), user_id)
      and public.shows_in_nearby(user_id)
    )
  );
create policy "post own going-out" on public.going_out_posts for insert to authenticated
  with check (user_id = auth.uid() and is_priority = false);
create policy "delete own going-out" on public.going_out_posts for delete to authenticated
  using (user_id = auth.uid());
