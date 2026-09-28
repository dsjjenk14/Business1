-- 1. Connecting (Dominique's two ways, on top of GPS check-ins and intros):
--    • In person: one of you shows a QR code, the other scans it. That also
--      counts as meeting in person, so you can vouch for each other.
--    • Know each other outside the app: one of you gets a short code, shares
--      it however you like (text, in person), and the other types it in.
-- 2. Group chats in Messages: start a chat with several people you know,
--    without creating a Group.

alter type public.connection_source add value if not exists 'qr';
alter type public.connection_source add value if not exists 'code';

-- ── Connect codes ─────────────────────────────────────────────────────────
create table public.connect_codes (
  code       text primary key,
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('qr', 'code')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by    uuid references public.profiles (id) on delete set null,
  used_at    timestamptz
);
create index connect_codes_owner_idx on public.connect_codes (owner_id, created_at desc);
create index connect_codes_used_by_idx on public.connect_codes (used_by);
alter table public.connect_codes enable row level security;
create policy "see own codes" on public.connect_codes for select to authenticated using (owner_id = auth.uid());

-- Failed code attempts (to stop guessing).
create table private.connect_attempts (
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index connect_attempts_idx on private.connect_attempts (user_id, at desc);

insert into public.app_config (key, value, description) values
  ('connect_qr_minutes', '5', 'How long an in-person QR code works.'),
  ('connect_code_hours', '24', 'How long a shared connect code works.'),
  ('connect_codes_per_day', '20', 'Most connect codes one member can make in a day.')
on conflict (key) do nothing;

-- A random code. Shared codes avoid look-alike characters (0/O, 1/I/L).
create or replace function private.random_code(p_len int, p_alphabet text)
returns text language sql volatile set search_path = '' as $$
  select string_agg(substr(p_alphabet, 1 + (get_byte(b, i) % length(p_alphabet)), 1), '')
  from (select extensions.gen_random_bytes(p_len) as b) x, generate_series(0, p_len - 1) i
$$;

create or replace function public.create_connect_code(p_kind text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  c text;
  exp timestamptz;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if p_kind not in ('qr', 'code') then raise exception 'Unknown kind.' using errcode = 'check_violation'; end if;
  if (select count(*) from public.connect_codes where owner_id = me and created_at > now() - interval '1 day')
     >= public.config_num('connect_codes_per_day') then
    raise exception 'That''s a lot of codes today. Try again tomorrow.' using errcode = 'check_violation';
  end if;
  -- One live code of each kind at a time.
  update public.connect_codes set expires_at = now() where owner_id = me and kind = p_kind and used_at is null and expires_at > now();
  exp := now() + case when p_kind = 'qr' then make_interval(mins => public.config_num('connect_qr_minutes')::int)
                      else make_interval(hours => public.config_num('connect_code_hours')::int) end;
  loop
    c := case when p_kind = 'qr' then private.random_code(16, 'abcdefghijkmnpqrstuvwxyz23456789')
              else private.random_code(6, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789') end;
    exit when not exists (select 1 from public.connect_codes where code = c);
  end loop;
  insert into public.connect_codes (code, owner_id, kind, expires_at) values (c, me, p_kind, exp);
  return jsonb_build_object('code', c, 'kind', p_kind, 'expires_at', exp);
end $$;

-- Scan a QR or type a code. Connects you both (and, for an in-person QR,
-- records the meetup so you can vouch for each other).
create or replace function public.redeem_connect_code(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  cc public.connect_codes;
  normalized text := case when length(trim(p_code)) <= 8 then upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')) else trim(p_code) end;
  already boolean;
  enc bigint;
  other public.profiles;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if (select count(*) from private.connect_attempts where user_id = me and at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many tries. Wait a bit and try again.' using errcode = 'check_violation';
  end if;

  select * into cc from public.connect_codes where code = normalized for update;
  if cc.code is null or cc.expires_at <= now() or cc.used_at is not null then
    insert into private.connect_attempts (user_id) values (me);
    raise exception 'That code didn''t work. Codes expire, and each one works once. Ask for a new one.' using errcode = 'check_violation';
  end if;
  if cc.owner_id = me then raise exception 'That''s your own code. The other person types or scans it.' using errcode = 'check_violation'; end if;
  if private.is_blocked(me, cc.owner_id) then raise exception 'That code didn''t work.' using errcode = 'check_violation'; end if;

  update public.connect_codes set used_by = me, used_at = now() where code = cc.code;
  already := private.are_connected(me, cc.owner_id);
  if not already then
    insert into public.connections (user_a, user_b, source)
    values (least(me, cc.owner_id), greatest(me, cc.owner_id), cc.kind::public.connection_source)
    on conflict do nothing;
  end if;

  -- A QR scan means you're standing together: that's a real-life meetup.
  if cc.kind = 'qr' then
    insert into public.encounters (user_a, user_b, context, place_label, distance_m, overlap_start, overlap_end)
    values (least(me, cc.owner_id), greatest(me, cc.owner_id), 'nearby', 'Met in person (QR)', 0, now(), now())
    returning id into enc;
  end if;

  select * into other from public.profiles where id = cc.owner_id;
  perform private.notify(cc.owner_id, 'connected',
    (select display_name from public.profiles where id = me) || case when already then ' used your code' else ' is now in your circle' end,
    case when cc.kind = 'qr' then 'You met in person, so you can vouch for each other.' else 'You can message each other now.' end,
    me, '/people/' || me);

  return jsonb_build_object('status', case when already then 'already' else 'connected' end,
    'kind', cc.kind, 'encounter_id', enc,
    'user', jsonb_build_object('id', other.id, 'display_name', other.display_name, 'avatar_url', other.avatar_url));
end $$;

-- ── Group chats ──────────────────────────────────────────────────────────
alter table public.conversations add column name text check (char_length(name) between 1 and 60);
alter table public.conversations add column created_by uuid references public.profiles (id) on delete set null;
create index conversations_created_by_idx on public.conversations (created_by);
alter table public.conversations drop constraint conversations_kind_check;
alter table public.conversations drop constraint conversations_check;
alter table public.conversations add constraint conversations_kind_check check (kind in ('direct', 'group', 'chat'));
alter table public.conversations add constraint conversations_check check (
  (kind = 'group' and group_id is not null and direct_a is null)
  or (kind = 'direct' and group_id is null and direct_a < direct_b)
  or (kind = 'chat' and group_id is null and direct_a is null and direct_b is null));

insert into public.app_config (key, value, description) values
  ('group_chat_max_members', '50', 'Most people in a group chat started from Messages.')
on conflict (key) do nothing;

-- Who you can add to a group chat: people in your circle, and people you
-- already have a chat with. Never someone who blocked you or you blocked.
create or replace function private.can_add_to_chat(p_me uuid, p_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_other <> p_me and not private.is_blocked(p_me, p_other)
    and (private.are_connected(p_me, p_other)
         or exists (select 1 from public.conversations c
                    where c.kind = 'direct' and c.direct_a = least(p_me, p_other) and c.direct_b = greatest(p_me, p_other)
                      and c.last_message_at is not null))
$$;

create or replace function public.chat_candidates()
returns table (id uuid, display_name text, avatar_url text, in_circle boolean)
language sql stable security definer set search_path = '' as $$
  with people as (
    select f as id from private.first_degree_ids(auth.uid()) f
    union
    select case when c.direct_a = auth.uid() then c.direct_b else c.direct_a end
    from public.conversations c
    where c.kind = 'direct' and auth.uid() in (c.direct_a, c.direct_b) and c.last_message_at is not null)
  select p.id, p.display_name, p.avatar_url, private.are_connected(auth.uid(), p.id)
  from people x join public.profiles p on p.id = x.id
  where private.can_add_to_chat(auth.uid(), p.id)
  order by 4 desc, p.display_name
$$;

create or replace function public.create_group_chat(p_name text, p_members uuid[])
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  conv bigint;
  u uuid;
  n int := 0;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if coalesce(array_length(p_members, 1), 0) < 2 then
    raise exception 'Pick at least two people. (For one person, just message them.)' using errcode = 'check_violation';
  end if;
  if array_length(p_members, 1) + 1 > public.config_num('group_chat_max_members') then
    raise exception 'Group chats can have up to % people.', public.config_num('group_chat_max_members')::int using errcode = 'check_violation';
  end if;
  insert into public.conversations (kind, name, created_by) values ('chat', nullif(trim(p_name), ''), me) returning id into conv;
  insert into public.conversation_members (conversation_id, user_id) values (conv, me);
  foreach u in array p_members loop
    if private.can_add_to_chat(me, u) then
      insert into public.conversation_members (conversation_id, user_id) values (conv, u) on conflict do nothing;
      n := n + 1;
    end if;
  end loop;
  if n < 2 then raise exception 'You can add people in your circle and people you''ve chatted with.' using errcode = 'check_violation'; end if;
  perform private.notify(m.user_id, 'group_chat', (select display_name from public.profiles where id = me) || ' added you to a group chat',
                         coalesce(nullif(trim(p_name), ''), 'New group chat'), me, '/chat/' || conv)
  from public.conversation_members m where m.conversation_id = conv and m.user_id <> me;
  return conv;
end $$;

create or replace function public.add_to_group_chat(p_conv bigint, p_members uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  u uuid;
  n int := 0;
begin
  if not exists (select 1 from public.conversations where id = p_conv and kind = 'chat')
     or not private.is_conversation_member(p_conv, me) then
    raise exception 'You''re not in this chat.' using errcode = 'insufficient_privilege';
  end if;
  foreach u in array coalesce(p_members, '{}') loop
    if (select count(*) from public.conversation_members where conversation_id = p_conv) >= public.config_num('group_chat_max_members') then exit; end if;
    if private.can_add_to_chat(me, u) and not private.is_conversation_member(p_conv, u) then
      insert into public.conversation_members (conversation_id, user_id) values (p_conv, u);
      perform private.notify(u, 'group_chat', (select display_name from public.profiles where id = me) || ' added you to a group chat',
        coalesce((select name from public.conversations where id = p_conv), 'Group chat'), me, '/chat/' || p_conv);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.leave_group_chat(p_conv bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.conversations where id = p_conv and kind = 'chat') then
    raise exception 'Leave a Group from the group''s page.' using errcode = 'check_violation';
  end if;
  delete from public.conversation_members where conversation_id = p_conv and user_id = auth.uid();
  -- Nobody left: remove the chat.
  delete from public.conversations c where c.id = p_conv
    and not exists (select 1 from public.conversation_members where conversation_id = p_conv);
end $$;

create or replace function public.rename_group_chat(p_conv bigint, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_conversation_member(p_conv, auth.uid()) then
    raise exception 'You''re not in this chat.' using errcode = 'insufficient_privilege';
  end if;
  update public.conversations set name = nullif(trim(p_name), '') where id = p_conv and kind = 'chat';
end $$;

-- A chat's title: its name, or the first few members' names.
create or replace function private.chat_title(p_conv bigint, p_viewer uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(c.name, (
    select string_agg(split_part(p.display_name, ' ', 1), ', ' order by p.display_name)
    from (select p.display_name from public.conversation_members m join public.profiles p on p.id = m.user_id
          where m.conversation_id = p_conv and m.user_id <> p_viewer order by p.display_name limit 3) p), 'Group chat')
  from public.conversations c where c.id = p_conv
$$;

create or replace function public.inbox()
returns table (conversation_id bigint, kind text, title text, glyph text, other_id uuid, avatar_url text,
               last_body text, last_sender_id uuid, last_at timestamptz, unread boolean, group_id bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind,
         case when c.kind = 'chat' then private.chat_title(c.id, auth.uid()) else coalesce(g.name, o.display_name, 'Member') end,
         case when c.kind = 'chat' then 'chat' else g.emoji end,
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
    and (c.kind in ('group', 'chat') or c.last_message_at is not null)
    and (o.id is null or not private.is_blocked(auth.uid(), o.id))
  order by coalesce(c.last_message_at, c.created_at) desc
$$;

create or replace function public.conversation_info(p_conv bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.is_conversation_member(c.id, auth.uid()) then null else jsonb_build_object(
    'id', c.id, 'kind', c.kind, 'group_id', c.group_id, 'name', c.name,
    'title', case when c.kind = 'chat' then private.chat_title(c.id, auth.uid())
                  else coalesce(g.name, (select display_name from public.profiles where id = case when c.direct_a = auth.uid() then c.direct_b else c.direct_a end)) end,
    'emoji', case when c.kind = 'chat' then 'chat' else g.emoji end,
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'display_name', p.display_name, 'avatar_emoji', p.avatar_emoji, 'avatar_url', p.avatar_url))
                         from public.conversation_members cm join public.profiles p on p.id = cm.user_id where cm.conversation_id = c.id), '[]'::jsonb)
  ) end
  from public.conversations c left join public.groups g on g.id = c.group_id where c.id = p_conv
$$;

-- Push for a group chat uses the chat's title.
create or replace function private.queue_push_for_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  sender text := (select display_name from public.profiles where id = new.sender_id);
  conv public.conversations := (select c from public.conversations c where c.id = new.conversation_id);
  grp text := (select g.name from public.groups g where g.id = conv.group_id);
begin
  insert into public.push_outbox (user_id, title, body, link)
  select m.user_id,
         case when conv.kind = 'chat' then private.chat_title(conv.id, m.user_id) else coalesce(grp, sender) end,
         case when conv.kind <> 'direct' then sender || ': ' else '' end || left(new.body, 140),
         '/chat/' || new.conversation_id
  from public.conversation_members m
  where m.conversation_id = new.conversation_id and m.user_id <> new.sender_id
    and not private.is_blocked(m.user_id, new.sender_id)
    and private.push_allowed(m.user_id, 'message')
    and exists (select 1 from public.push_tokens t where t.user_id = m.user_id);
  return new;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.create_connect_code(text)',
    'public.redeem_connect_code(text)',
    'public.chat_candidates()',
    'public.create_group_chat(text, uuid[])',
    'public.add_to_group_chat(bigint, uuid[])',
    'public.leave_group_chat(bigint)',
    'public.rename_group_chat(bigint, text)',
    'public.inbox()',
    'public.conversation_info(bigint)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
