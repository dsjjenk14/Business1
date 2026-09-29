-- The launch batch (from the team review):
--   1. Launch mode: drinks and virtual events are off until turned on, like
--      live video already is. Each has a switch in app_config.
--   2. Private by default: new plans show to Insiders and their Insiders, not
--      everyone nearby (people can still choose Everyone).
--   3. Indexes on foreign keys that didn't have one.
--   4. Friday Drop: Friday 4pm DC, a push with the weekend's top plans. Members
--      can turn it off.
--   5. Launch dashboard numbers for admins.
--   6. "Where tonight?" polls in chats.
--   7. Event cover photos.

-- ── 1. Launch mode ───────────────────────────────────────────────────────
insert into public.app_config (key, value, description) values
  ('drinks_enabled', 'false', 'Turns on sending drinks to people who are live. Off for launch.'),
  ('virtual_events_enabled', 'false', 'Turns on online events (video, voice, livestream rooms). Off for launch.')
on conflict (key) do nothing;

create or replace function private.feature_on(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select value #>> '{}' from public.app_config where key = p_key), 'false') = 'true'
$$;

do $$
declare
  pairs text[][] := array[
    array['public.send_drink(text,bigint,bigint,boolean)',
          'begin',
          'begin
  if not private.feature_on(''drinks_enabled'') then
    raise exception ''Drinks aren''''t on yet.'' using errcode = ''check_violation'';
  end if;'],
    array['public.set_event_virtual(bigint,text,text,text)',
          'begin',
          'begin
  if coalesce(p_format, ''in_person'') <> ''in_person'' and not private.feature_on(''virtual_events_enabled'') then
    raise exception ''Online events aren''''t on yet.'' using errcode = ''check_violation'';
  end if;'],
    array['public.event_room_join_check(bigint,uuid)',
          'begin',
          'begin
  if not private.feature_on(''virtual_events_enabled'') then
    return jsonb_build_object(''error'', ''Online events aren''''t on yet.'');
  end if;']
  ];
  i int;
  src text;
  pos int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    src := pg_get_functiondef(pairs[i][1]::regprocedure);
    -- The first "begin" on its own line opens the function body.
    pos := position(E'\n' || pairs[i][2] || E'\n' in src);
    if pos = 0 then raise exception '%: body start not found', pairs[i][1]; end if;
    execute overlay(src placing E'\n' || pairs[i][3] || E'\n' from pos for length(pairs[i][2]) + 2);
  end loop;
end $$;

-- ── 2. Private by default ────────────────────────────────────────────────
alter table public.going_out_posts alter column audience set default 'network';

-- ── 3. Missing foreign key indexes ───────────────────────────────────────
create index if not exists ai_cache_created_by_idx on public.ai_cache (created_by);
create index if not exists ai_cache_person_id_idx on public.ai_cache (person_id);
create index if not exists drink_cashouts_user_id_idx on public.drink_cashouts (user_id);
create index if not exists drink_gifts_drink_key_idx on public.drink_gifts (drink_key);
create index if not exists drink_gifts_event_id_idx on public.drink_gifts (event_id);
create index if not exists drink_gifts_live_id_idx on public.drink_gifts (live_id);
create index if not exists live_comments_user_id_idx on public.live_comments (user_id);
create index if not exists out_story_views_viewer_id_idx on public.out_story_views (viewer_id);
create index if not exists outs_event_id_idx on public.outs (event_id);
create index if not exists venue_ratings_event_id_idx on public.venue_ratings (event_id);
create index if not exists wallet_topups_user_id_idx on public.wallet_topups (user_id);

-- ── 4. Friday Drop ───────────────────────────────────────────────────────
alter table public.user_settings add column if not exists friday_drop boolean not null default true;

-- The weekend's top plans for one member: public or Insider-visible events
-- from Friday evening to Sunday night, most people going first.
create or replace function private.friday_drop_lines(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select string_agg(title, ' · ' order by going desc, starts_at) from (
    select e.title, e.starts_at, (select count(*) from public.event_rsvps r where r.event_id = e.id) as going
    from public.events e
    where e.starts_at between now() and now() + interval '3 days'
      and e.host_id <> p_user
      and not private.event_hidden(e.id, p_user)
      and not private.is_blocked(p_user, e.host_id)
      and (e.visibility = 'public' or private.are_connected(p_user, e.host_id))
    order by going desc, e.starts_at
    limit 3
  ) top
$$;

-- Sends it to everyone who has it on (and has a plan to show). Run by cron.
create or replace function private.send_friday_drop() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n int := 0;
  u record;
  lines text;
begin
  for u in
    select p.id from public.profiles p
    left join public.user_settings s on s.user_id = p.id
    where coalesce(s.friday_drop, true)
  loop
    lines := private.friday_drop_lines(u.id);
    if lines is not null then
      perform private.notify(u.id, 'friday_drop', 'The Friday Drop: this weekend', lines, null, '/whats-in');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 20:00 UTC Friday is 4pm in DC during daylight time (3pm in winter).
    perform cron.schedule('friday-drop', '0 20 * * 5', 'select private.send_friday_drop()');
  end if;
end $$;

-- ── 5. Launch dashboard ──────────────────────────────────────────────────
-- Admins only. "Nights out" = I'm Ins on events that have started, in the
-- last 7 days; plus signups, activation, week-4 retention and Insiders.
create or replace function public.launch_metrics()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  signups_28 int;
  activated int;
  cohort int;
  retained int;
begin
  perform private.require_admin();
  select count(*) into signups_28 from public.profiles where created_at > now() - interval '28 days';
  -- Said I'm In to something within 7 days of joining.
  select count(*) into activated from public.profiles p
  where p.created_at > now() - interval '28 days'
    and exists (select 1 from public.event_rsvps r where r.user_id = p.id and r.created_at < p.created_at + interval '7 days');
  -- Joined 28–56 days ago, still active in their 4th week (any I'm In, pin or message).
  select count(*) into cohort from public.profiles where created_at between now() - interval '56 days' and now() - interval '28 days';
  select count(*) into retained from public.profiles p
  where p.created_at between now() - interval '56 days' and now() - interval '28 days'
    and (exists (select 1 from public.event_rsvps r where r.user_id = p.id and r.created_at between p.created_at + interval '21 days' and p.created_at + interval '28 days')
      or exists (select 1 from public.pins x where x.author_id = p.id and x.created_at between p.created_at + interval '21 days' and p.created_at + interval '28 days')
      or exists (select 1 from public.messages m where m.sender_id = p.id and m.created_at between p.created_at + interval '21 days' and p.created_at + interval '28 days'));
  return jsonb_build_object(
    'members', (select count(*) from public.profiles),
    'nights_out_7d', (select count(*) from public.event_rsvps r join public.events e on e.id = r.event_id
                      where e.starts_at between now() - interval '7 days' and now()),
    'going_out_now', (select count(*) from public.going_out_posts g where g.arrived_at is not null and g.live_until > now()),
    'signups_28d', signups_28,
    'activated_28d', activated,
    'activation_pct', case when signups_28 > 0 then round(100.0 * activated / signups_28) end,
    'week4_cohort', cohort,
    'week4_retained', retained,
    'week4_pct', case when cohort > 0 then round(100.0 * retained / cohort) end,
    'avg_insiders', (select round(avg(n)::numeric, 1) from (
        select p.id, (select count(*) from public.connections c where c.user_a = p.id or c.user_b = p.id) as n
        from public.profiles p) x),
    'events_next_7d', (select count(*) from public.events where starts_at between now() and now() + interval '7 days'),
    'open_reports', (select count(*) from public.reports where status = 'open')
  );
end $$;
revoke execute on function public.launch_metrics() from public, anon;
grant execute on function public.launch_metrics() to authenticated;

-- ── 6. "Where tonight?" polls ────────────────────────────────────────────
create table if not exists public.chat_polls (
  id bigint generated always as identity primary key,
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 120),
  options text[] not null check (cardinality(options) between 2 and 4),
  created_at timestamptz not null default now()
);
create index if not exists chat_polls_conversation_idx on public.chat_polls (conversation_id);
create index if not exists chat_polls_created_by_idx on public.chat_polls (created_by);
create table if not exists public.chat_poll_votes (
  poll_id bigint not null references public.chat_polls(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option smallint not null check (option between 0 and 3),
  voted_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);
create index if not exists chat_poll_votes_user_idx on public.chat_poll_votes (user_id);
alter table public.chat_polls enable row level security;
alter table public.chat_poll_votes enable row level security;
revoke all on public.chat_polls, public.chat_poll_votes from anon, authenticated;
alter table public.messages add column if not exists poll_id bigint references public.chat_polls(id) on delete cascade;
create index if not exists messages_poll_id_idx on public.messages (poll_id);

-- Start a poll in a chat you're in. It posts as a message everyone sees.
create or replace function public.create_chat_poll(p_conversation bigint, p_question text, p_options text[])
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  opts text[] := (select coalesce(array_agg(trim(o) order by i), '{}') from unnest(coalesce(p_options, '{}')) with ordinality x(o, i)
                  where nullif(trim(o), '') is not null);
  pid bigint;
begin
  if not exists (select 1 from public.conversation_members where conversation_id = p_conversation and user_id = me) then
    raise exception 'You''re not in this chat.' using errcode = 'insufficient_privilege';
  end if;
  if cardinality(opts) < 2 or cardinality(opts) > 4 then
    raise exception 'Give 2 to 4 choices.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from unnest(opts) o where char_length(o) > 60) then
    raise exception 'Keep each choice under 60 characters.' using errcode = 'check_violation';
  end if;
  insert into public.chat_polls (conversation_id, created_by, question, options)
  values (p_conversation, me, coalesce(nullif(trim(p_question), ''), 'Where tonight?'), opts)
  returning id into pid;
  insert into public.messages (conversation_id, sender_id, body, poll_id)
  values (p_conversation, me, coalesce(nullif(trim(p_question), ''), 'Where tonight?'), pid);
  return pid;
end $$;
revoke execute on function public.create_chat_poll(bigint, text, text[]) from public, anon;
grant execute on function public.create_chat_poll(bigint, text, text[]) to authenticated;

-- Vote (or change your vote; the same choice again takes it back).
create or replace function public.vote_chat_poll(p_poll bigint, p_option integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  p public.chat_polls;
begin
  select * into p from public.chat_polls where id = p_poll;
  if p.id is null or not exists (select 1 from public.conversation_members where conversation_id = p.conversation_id and user_id = me) then
    raise exception 'You''re not in this chat.' using errcode = 'insufficient_privilege';
  end if;
  if p_option < 0 or p_option >= cardinality(p.options) then
    raise exception 'That isn''t one of the choices.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.chat_poll_votes where poll_id = p_poll and user_id = me and option = p_option) then
    delete from public.chat_poll_votes where poll_id = p_poll and user_id = me;
  else
    insert into public.chat_poll_votes (poll_id, user_id, option) values (p_poll, me, p_option)
    on conflict (poll_id, user_id) do update set option = excluded.option, voted_at = now();
  end if;
end $$;
revoke execute on function public.vote_chat_poll(bigint, integer) from public, anon;
grant execute on function public.vote_chat_poll(bigint, integer) to authenticated;

-- A poll with its counts and your vote (chat members only).
create or replace function public.chat_poll(p_poll bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'question', p.question, 'options', to_jsonb(p.options),
    'counts', (select to_jsonb(array_agg((select count(*) from public.chat_poll_votes v where v.poll_id = p.id and v.option = i - 1) order by i))
               from generate_series(1, cardinality(p.options)) i),
    'voters', (select count(*) from public.chat_poll_votes v where v.poll_id = p.id),
    'mine', (select option from public.chat_poll_votes v where v.poll_id = p.id and v.user_id = auth.uid()))
  from public.chat_polls p
  where p.id = p_poll
    and exists (select 1 from public.conversation_members m where m.conversation_id = p.conversation_id and m.user_id = auth.uid())
$$;
revoke execute on function public.chat_poll(bigint) from public, anon;
grant execute on function public.chat_poll(bigint) to authenticated;

-- ── 7. Event cover photos ────────────────────────────────────────────────
alter table public.events add column if not exists cover_url text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-covers', 'event-covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "upload own event covers" on storage.objects;
create policy "upload own event covers" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-covers' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "remove own event covers" on storage.objects;
create policy "remove own event covers" on storage.objects for delete to authenticated
  using (bucket_id = 'event-covers' and (storage.foldername(name))[1] = auth.uid()::text);

-- The host sets or clears the cover (their own upload only).
create or replace function public.set_event_cover(p_event bigint, p_url text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.events where id = p_event and host_id = auth.uid()) then
    raise exception 'Only the host can change the cover.' using errcode = 'insufficient_privilege';
  end if;
  if p_url is not null and p_url not like '%/storage/v1/object/public/event-covers/' || auth.uid()::text || '/%' then
    raise exception 'Upload the photo first.' using errcode = 'check_violation';
  end if;
  update public.events set cover_url = p_url where id = p_event;
end $$;
revoke execute on function public.set_event_cover(bigint, text) from public, anon;
grant execute on function public.set_event_cover(bigint, text) to authenticated;
