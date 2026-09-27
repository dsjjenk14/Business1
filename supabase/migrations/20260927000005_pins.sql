-- I'm In: 005 Pins (posts): the heart of the app

create type public.pin_category as enum ('thought', 'question', 'photos', 'event', 'going_out', 'recap');
-- everyone = Nearby + They're In; network = 1st + 2nd degree; circle = 1st degree only
create type public.pin_audience as enum ('everyone', 'network', 'circle');

create table public.pins (
  id              bigserial primary key,
  author_id       uuid not null references public.profiles (id) on delete cascade,
  category        public.pin_category not null,
  body            text not null check (char_length(body) between 1 and 2000),
  audience        public.pin_audience not null default 'everyone',
  approx_location extensions.geography(Point, 4326),   -- snapped, never exact
  city_id         smallint references public.cities (id),
  place_label     text,                                -- "Bresca", "Rock Creek"
  venue_id        bigint references public.venues (id) on delete set null,
  event_id        bigint references public.events (id) on delete set null,
  going_out_post_id bigint references public.going_out_posts (id) on delete cascade,
  like_count      integer not null default 0,
  reply_count     integer not null default 0,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz
);
create index pins_created_idx on public.pins (created_at desc) where deleted_at is null;
create index pins_geo_idx on public.pins using gist (approx_location) where deleted_at is null;
create index pins_author_idx on public.pins (author_id, created_at desc);

create table public.pin_photos (
  id          bigserial primary key,
  pin_id      bigint not null references public.pins (id) on delete cascade,
  storage_path text not null,
  position    smallint not null check (position between 1 and 6),   -- max 6 photos
  unique (pin_id, position)
);

create table public.pin_likes (
  pin_id     bigint not null references public.pins (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pin_id, user_id)
);

create table public.pin_replies (
  id         bigserial primary key,
  pin_id     bigint not null references public.pins (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index pin_replies_pin_idx on public.pin_replies (pin_id, created_at);

create table public.pin_bookmarks (
  pin_id     bigint not null references public.pins (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pin_id, user_id)
);

-- People tagged in an event recap.
create table public.pin_tags (
  pin_id  bigint not null references public.pins (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (pin_id, user_id)
);

-- ── Who can see a pin ─────────────────────────────────────────────────────
create or replace function public.can_see_pin(p_pin bigint, p_viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pins p
    where p.id = p_pin
      and p.deleted_at is null
      and not public.is_blocked(p_viewer, p.author_id)
      and (
        p.author_id = p_viewer
        or p.audience = 'everyone'
        or (p.audience = 'circle'  and public.are_connected(p_viewer, p.author_id))
        or (p.audience = 'network' and public.degree_between(p_viewer, p.author_id) in (1, 2))
      )
  )
$$;

-- ── Counters and interactions ─────────────────────────────────────────────
create or replace function public.pin_like_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_author uuid;
begin
  if tg_op = 'INSERT' then
    update public.pins set like_count = like_count + 1 where id = new.pin_id returning author_id into v_author;
    perform public.record_interaction(new.user_id, v_author, 'pin_like', new.pin_id);
  else
    update public.pins set like_count = greatest(like_count - 1, 0) where id = old.pin_id;
  end if;
  return null;
end $$;
create trigger pin_likes_count after insert or delete on public.pin_likes
  for each row execute function public.pin_like_trigger();

create or replace function public.pin_reply_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_author uuid;
begin
  update public.pins set reply_count = reply_count + 1 where id = new.pin_id returning author_id into v_author;
  perform public.record_interaction(new.author_id, v_author, 'pin_reply', new.pin_id);
  return null;
end $$;
create trigger pin_replies_count after insert on public.pin_replies
  for each row execute function public.pin_reply_trigger();

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.pins          enable row level security;
alter table public.pin_photos    enable row level security;
alter table public.pin_likes     enable row level security;
alter table public.pin_replies   enable row level security;
alter table public.pin_bookmarks enable row level security;
alter table public.pin_tags      enable row level security;

create policy "visible pins" on public.pins for select to authenticated
  using (public.can_see_pin(id, auth.uid()));
create policy "post own pins" on public.pins for insert to authenticated
  with check (author_id = auth.uid() and like_count = 0 and reply_count = 0);
create policy "edit own pins" on public.pins for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
revoke update on public.pins from authenticated, anon;
grant update (body, category, audience, edited_at, deleted_at) on public.pins to authenticated;

create policy "photos of visible pins" on public.pin_photos for select to authenticated
  using (public.can_see_pin(pin_id, auth.uid()));
create policy "add photos to own pins" on public.pin_photos for insert to authenticated
  with check (exists (select 1 from public.pins where id = pin_id and author_id = auth.uid()));
create policy "remove photos from own pins" on public.pin_photos for delete to authenticated
  using (exists (select 1 from public.pins where id = pin_id and author_id = auth.uid()));

create policy "likes on visible pins" on public.pin_likes for select to authenticated
  using (public.can_see_pin(pin_id, auth.uid()));
create policy "like visible pins" on public.pin_likes for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_pin(pin_id, auth.uid()));
create policy "unlike" on public.pin_likes for delete to authenticated using (user_id = auth.uid());

create policy "replies on visible pins" on public.pin_replies for select to authenticated
  using (public.can_see_pin(pin_id, auth.uid()) and not public.is_blocked(auth.uid(), author_id));
create policy "reply to visible pins" on public.pin_replies for insert to authenticated
  with check (author_id = auth.uid() and public.can_see_pin(pin_id, auth.uid()));
create policy "delete own replies" on public.pin_replies for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
revoke update on public.pin_replies from authenticated, anon;
grant update (deleted_at) on public.pin_replies to authenticated;

create policy "own bookmarks" on public.pin_bookmarks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_see_pin(pin_id, auth.uid()));

create policy "tags on visible pins" on public.pin_tags for select to authenticated
  using (public.can_see_pin(pin_id, auth.uid()));
create policy "tag on own pins" on public.pin_tags for insert to authenticated
  with check (exists (select 1 from public.pins where id = pin_id and author_id = auth.uid()));
