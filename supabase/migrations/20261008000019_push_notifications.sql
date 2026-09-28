-- Push notifications (Phase 8).
-- Phones register an Expo push token. Every in-app notification, and every
-- new chat message, is queued in push_outbox; on the live database the queue
-- is sent to Expo's push service with pg_net (no API key needed). Members'
-- notification switches in Settings are respected, and blocked people never
-- reach you.

create extension if not exists pg_net;

-- push_tokens exists since Phase 1 (members manage their own rows).
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

create table public.push_outbox (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  body       text not null default '',
  link       text,
  sent       boolean not null default false,
  created_at timestamptz not null default now()
);
create index push_outbox_created_idx on public.push_outbox (created_at);
alter table public.push_outbox enable row level security;  -- nobody reads it from the app

-- A phone signs in: this device now belongs to this member (a shared phone
-- moves to whoever signed in last).
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if p_token !~ '^(Exponent|Expo)PushToken\[.+\]$' then raise exception 'Not a push token.' using errcode = 'check_violation'; end if;
  insert into public.push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end $$;

-- Signing out: stop pushes to this phone.
create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid()
$$;

-- Which Settings switch covers a notification kind (null = always on).
create or replace function private.push_allowed(p_user uuid, p_kind text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when p_kind = 'message' then s.notify_messages
      when p_kind = 'pin_reply' then s.notify_pin_replies
      when p_kind like 'date\_%' and p_kind <> 'date_mode' then s.notify_date_requests
      when p_kind in ('meetup', 'vouch') then s.notify_gps_vouch
      when p_kind in ('intro', 'intro_request', 'intro_success', 'intro_declined', 'vouch_request') then s.notify_intro_requests
      when p_kind like '%rsvp%' or p_kind = 'going_out_join' then s.notify_rsvps
      else true end
    from public.user_settings s where s.user_id = p_user), true)
$$;

create or replace function private.queue_push_for_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.actor_id is null or not private.is_blocked(new.user_id, new.actor_id))
     and private.push_allowed(new.user_id, new.kind)
     and exists (select 1 from public.push_tokens where user_id = new.user_id) then
    insert into public.push_outbox (user_id, title, body, link) values (new.user_id, new.title, new.body, new.link);
  end if;
  return new;
end $$;
create trigger notifications_push after insert on public.notifications
  for each row execute function private.queue_push_for_notification();

-- New chat message: push everyone else in the conversation.
create or replace function private.queue_push_for_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  sender text := (select display_name from public.profiles where id = new.sender_id);
  grp text := (select g.name from public.groups g join public.conversations c on c.group_id = g.id where c.id = new.conversation_id);
begin
  insert into public.push_outbox (user_id, title, body, link)
  select m.user_id,
         coalesce(grp, sender),
         case when grp is not null then sender || ': ' else '' end || left(new.body, 140),
         '/chat/' || new.conversation_id
  from public.conversation_members m
  where m.conversation_id = new.conversation_id and m.user_id <> new.sender_id
    and not private.is_blocked(m.user_id, new.sender_id)
    and private.push_allowed(m.user_id, 'message')
    and exists (select 1 from public.push_tokens t where t.user_id = m.user_id);
  return new;
end $$;
create trigger messages_push after insert on public.messages
  for each row execute function private.queue_push_for_message();

-- Send a queued push. Only the live database talks to Expo; everywhere else
-- the outbox just records what would have been sent (handy for testing).
create or replace function private.send_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  msgs jsonb;
  unread integer;
begin
  if coalesce((select value #>> '{}' from public.app_config where key = 'environment'), '') <> 'production' then return new; end if;
  unread := (select count(*) from public.notifications where user_id = new.user_id and read_at is null);
  select jsonb_agg(jsonb_build_object('to', t.token, 'title', new.title, 'body', new.body, 'sound', 'default',
                                      'badge', unread, 'data', jsonb_build_object('link', new.link)))
    into msgs from public.push_tokens t where t.user_id = new.user_id;
  if msgs is null then return new; end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := msgs,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb);
  update public.push_outbox set sent = true where id = new.id;
  return new;
end $$;
create trigger push_outbox_send after insert on public.push_outbox
  for each row execute function private.send_push();

-- Keep the outbox small.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('prune-push-outbox', '23 4 * * *', 'delete from public.push_outbox where created_at < now() - interval ''7 days''');
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.register_push_token(text, text)',
    'public.unregister_push_token(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
