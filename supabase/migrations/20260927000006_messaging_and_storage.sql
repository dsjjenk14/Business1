-- I'm In: 006 Premium entitlement, messaging, storage buckets

-- ── Premium entitlement ───────────────────────────────────────────────────
-- Written only by the server (RevenueCat webhook in Phase 6).
create table public.entitlements (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  premium_until  timestamptz,
  source         text not null default 'revenuecat',   -- 'revenuecat', 'founding', 'admin'
  updated_at     timestamptz not null default now()
);
alter table public.entitlements enable row level security;
create policy "own entitlement" on public.entitlements for select to authenticated using (user_id = auth.uid());

create or replace function public.is_premium(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select premium_until > now() from public.entitlements where user_id = p_user), false)
$$;

-- A plan limit for this user (NULL = unlimited).
create or replace function public.plan_limit(p_user uuid, p_key text)
returns numeric language sql stable security definer set search_path = '' as $$
  select case when public.is_premium(p_user) then premium_value else free_value end
  from public.plan_limits where key = p_key
$$;

-- Messaging rule: must be 1st degree (an accepted intro makes you 1st degree),
-- and free members need N interactions first. Premium skips the wait, never the intro.
create or replace function public.can_message(p_from uuid, p_to uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_from <> p_to
    and not public.is_blocked(p_from, p_to)
    and public.are_connected(p_from, p_to)
    and coalesce((select count from public.interactions
                  where user_a = least(p_from, p_to) and user_b = greatest(p_from, p_to)), 0)
        >= coalesce(public.plan_limit(p_from, 'messaging_min_interactions'), 0)
$$;

-- ── Conversations ─────────────────────────────────────────────────────────
create table public.conversations (
  id          bigserial primary key,
  kind        text not null check (kind in ('direct', 'group')),
  group_id    bigint unique references public.groups (id) on delete cascade,
  -- For direct chats: the pair, ordered, so there's one chat per pair.
  direct_a    uuid references public.profiles (id) on delete cascade,
  direct_b    uuid references public.profiles (id) on delete cascade,
  last_message_at timestamptz,
  created_at  timestamptz not null default now(),
  check ((kind = 'group' and group_id is not null and direct_a is null)
      or (kind = 'direct' and group_id is null and direct_a < direct_b)),
  unique (direct_a, direct_b)
);

create table public.conversation_members (
  conversation_id bigint not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id              bigserial primary key,
  conversation_id bigint not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 4000),
  -- Behavioral AI features may read ONLY these two numbers, never the body.
  char_length     integer generated always as (char_length(body)) stored,
  reply_seconds   integer,   -- time since the other person's last message, set by trigger
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

create or replace function public.is_conversation_member(p_conv bigint, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members where conversation_id = p_conv and user_id = p_user)
$$;

-- Opens (or returns) the direct chat with someone, if messaging is allowed.
create or replace function public.open_direct_conversation(p_other uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  conv bigint;
begin
  select id into conv from public.conversations
   where kind = 'direct' and direct_a = least(me, p_other) and direct_b = greatest(me, p_other);
  if conv is not null then return conv; end if;
  if not public.can_message(me, p_other) then
    raise exception 'You can''t message this person yet.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.conversations (kind, direct_a, direct_b)
  values ('direct', least(me, p_other), greatest(me, p_other)) returning id into conv;
  insert into public.conversation_members (conversation_id, user_id) values (conv, me), (conv, p_other);
  return conv;
end $$;

create or replace function public.message_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c public.conversations;
  other uuid;
  last_other timestamptz;
begin
  select * into c from public.conversations where id = new.conversation_id;
  if c.kind = 'direct' then
    other := case when c.direct_a = new.sender_id then c.direct_b else c.direct_a end;
    if public.is_blocked(new.sender_id, other) then
      raise exception 'Message not allowed.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  select max(created_at) into last_other from public.messages
   where conversation_id = new.conversation_id and sender_id <> new.sender_id;
  new.reply_seconds := case when last_other is null then null
                            else extract(epoch from (now() - last_other))::int end;
  update public.conversations
     set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
   where id = new.conversation_id;
  return new;
end $$;
create trigger messages_before_insert before insert on public.messages
  for each row execute function public.message_before_insert();

alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;

create policy "my conversations" on public.conversations for select to authenticated
  using (public.is_conversation_member(id, auth.uid()));
create policy "members of my conversations" on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));
create policy "mark read" on public.conversation_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.conversation_members from authenticated, anon;
grant update (last_read_at) on public.conversation_members to authenticated;

create policy "read my messages" on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));
create policy "send in my conversations" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id, auth.uid()));

-- ── Storage buckets ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',    'avatars',    true,  5242880,  array['image/jpeg','image/png','image/webp','image/heic']),
  ('pin-photos', 'pin-photos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

-- Files go in a folder named after the user's id: avatars/<uid>/photo.jpg
create policy "upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "replace own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "upload own pin photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'pin-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own pin photos" on storage.objects for delete to authenticated
  using (bucket_id = 'pin-photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- Reading pin photos goes through signed URLs issued after a can_see_pin check (Phase 2).
