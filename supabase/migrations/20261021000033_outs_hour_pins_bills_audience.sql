-- 1. The original colors are back (the dark "Original" palette, in the new
--    catalog layout). Everyone moves to it once; Appearance still has the rest.
-- 2. Outs: anywhere, not only at events. An Out lasts 1 hour, and friends can
--    look again during that hour. Pinning one keeps it; the person who made
--    it is told (screenshots too, as before).
-- 3. Each My Out, going-out plan and pin picks who sees it. "My Circle" means
--    1st-degree connections only.
-- 4. Split the bill: a receipt photo, the people you were with, an even split
--    or custom amounts. Friends pay you back with Venmo, Cash App or PayPal
--    (outside the app, no fees) and tap "I paid".

-- ── 1. Colors ──────────────────────────────────────────────────────────────
alter table public.user_settings alter column theme_id set default 'N';
update public.user_settings set theme_id = 'N' where theme_id <> 'N';

-- ── 2. Outs ────────────────────────────────────────────────────────────────
update public.app_config set value = '1', description = 'How long an Out lasts, in hours, unless someone pins it.'
 where key = 'out_hours';
alter table public.outs alter column expires_at set default now() + interval '1 hour';
-- Who sees a My Out: your circle (1st degree) or your network (1st and 2nd).
alter table public.outs add column if not exists audience text not null default 'circle'
  check (audience in ('circle', 'network'));

create table public.out_pins (
  out_id    bigint not null references public.outs (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (out_id, user_id)
);
create index out_pins_user_idx on public.out_pins (user_id, pinned_at desc);
alter table public.out_pins enable row level security;
-- No direct access: pin_out / unpin_out / outs_inbox.

-- May this person see this My Out (by its audience)?
create or replace function private.can_view_story(p_viewer uuid, p_sender uuid, p_audience text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_viewer = p_sender
    or private.are_connected(p_viewer, p_sender)
    or (p_audience = 'network' and private.degree_between(p_viewer, p_sender) = 2)
$$;

-- Outs can be sent from anywhere. At an I'm In event, the event is attached.
drop function if exists public.send_out(text, text, uuid[], boolean);
create or replace function public.send_out(p_path text, p_caption text, p_recipients uuid[],
                                           p_to_story boolean default false, p_audience text default 'circle')
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id bigint;
  who text;
  targets uuid[];
  ev bigint;
  ev_title text;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if p_path is null or p_path not like me::text || '/%' then raise exception 'Upload the photo first.' using errcode = 'check_violation'; end if;
  if coalesce(p_audience, 'circle') not in ('circle', 'network') then
    raise exception 'Choose My Circle or My Network.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.outs where sender_id = me and created_at > now() - interval '1 day') >= public.config_num('outs_per_day') then
    raise exception 'That''s a lot of Outs today. Try again tomorrow.' using errcode = 'check_violation';
  end if;
  -- Sent directly: only your circle (1st degree), never someone blocked.
  select coalesce(array_agg(distinct r), '{}') into targets
  from unnest(coalesce(p_recipients, '{}')) r
  where r <> me and private.are_connected(me, r) and not private.is_blocked(me, r);
  if cardinality(targets) = 0 and not coalesce(p_to_story, false) then
    raise exception 'Pick at least one friend, or post it to My Out.' using errcode = 'check_violation';
  end if;
  if cardinality(targets) > 50 then raise exception 'Send to 50 people at most.' using errcode = 'check_violation'; end if;

  ev := private.current_event(me);
  insert into public.outs (sender_id, path, caption, to_story, expires_at, event_id, audience)
  values (me, p_path, nullif(trim(p_caption), ''), coalesce(p_to_story, false),
          now() + make_interval(hours => public.config_num('out_hours')::int), ev, coalesce(p_audience, 'circle'))
  returning id into new_id;
  insert into public.out_recipients (out_id, user_id) select new_id, unnest(targets);

  select display_name into who from public.profiles where id = me;
  select title into ev_title from public.events where id = ev;
  perform private.notify(t, 'out', who || ' sent you an Out' || coalesce(' from ' || ev_title, ''),
                         'Tap to open it. It disappears in an hour unless you pin it.', me, '/outs')
  from unnest(targets) t;
  return new_id;
end $$;

-- Everything the Outs tab shows, in one call.
create or replace function public.outs_inbox()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as id),
  received as (
    select o.sender_id, o.id, o.created_at, r.opened_at
    from public.out_recipients r join public.outs o on o.id = r.out_id
    where r.user_id = (select id from me) and o.expires_at > now() and o.file_deleted_at is null
      and not private.is_blocked((select id from me), o.sender_id)
  ),
  stories as (
    select o.sender_id, o.id, o.created_at,
           exists (select 1 from public.out_story_views v where v.out_id = o.id and v.viewer_id = (select id from me)) as seen
    from public.outs o
    where o.to_story and o.expires_at > now() and o.file_deleted_at is null and o.sender_id <> (select id from me)
      and private.can_view_story((select id from me), o.sender_id, o.audience)
      and not private.is_blocked((select id from me), o.sender_id)
  )
  select jsonb_build_object(
    -- One row per friend who sent you Outs in the last hour: new ones first.
    'received', coalesce((select jsonb_agg(x order by (x->>'unopened')::int > 0 desc, x->>'latest_at' desc) from (
        select jsonb_build_object('sender_id', p.id, 'name', p.display_name, 'avatar_url', p.avatar_url,
          'unopened', count(*) filter (where r.opened_at is null),
          'latest_at', max(r.created_at),
          'out_ids', jsonb_agg(r.id order by r.created_at),
          'next_out_id', coalesce(min(r.id) filter (where r.opened_at is null), min(r.id))) as x
        from received r join public.profiles p on p.id = r.sender_id group by p.id) q), '[]'::jsonb),
    -- Friends' My Out (an hour each).
    'stories', coalesce((select jsonb_agg(x order by (x->>'all_seen')::boolean, x->>'latest_at' desc) from (
        select jsonb_build_object('sender_id', p.id, 'name', p.display_name, 'avatar_url', p.avatar_url,
          'out_ids', jsonb_agg(s.id order by s.created_at), 'latest_at', max(s.created_at), 'all_seen', bool_and(s.seen)) as x
        from stories s join public.profiles p on p.id = s.sender_id group by p.id) q), '[]'::jsonb),
    -- Your own My Out, with who saw, pinned and screenshotted each one.
    'my_story', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'created_at', o.created_at, 'caption', o.caption,
          'audience', o.audience, 'expires_at', o.expires_at,
          'views', (select count(*) from public.out_story_views v where v.out_id = o.id),
          'pins', (select count(*) from public.out_pins pp where pp.out_id = o.id and pp.user_id <> o.sender_id),
          'screenshots', (select count(*) from public.out_story_views v where v.out_id = o.id and v.screenshot_at is not null))
        order by o.created_at)
        from public.outs o where o.sender_id = (select id from me) and o.to_story and o.expires_at > now()), '[]'::jsonb),
    -- Outs you sent in the last day: delivered, opened, pinned, screenshotted.
    'sent', coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
        select jsonb_build_object('id', o.id, 'created_at', o.created_at,
          'to', (select string_agg(p.display_name, ', ' order by p.display_name) from public.out_recipients r join public.profiles p on p.id = r.user_id where r.out_id = o.id),
          'recipients', (select count(*) from public.out_recipients r where r.out_id = o.id),
          'opened', (select count(*) from public.out_recipients r where r.out_id = o.id and r.opened_at is not null),
          'pins', (select count(*) from public.out_pins pp where pp.out_id = o.id and pp.user_id <> o.sender_id),
          'screenshots', (select count(*) from public.out_recipients r where r.out_id = o.id and r.screenshot_at is not null)) as x
        from public.outs o
        where o.sender_id = (select id from me) and o.created_at > now() - interval '1 day'
          and exists (select 1 from public.out_recipients r where r.out_id = o.id)
        order by o.created_at desc limit 20) q), '[]'::jsonb),
    -- Outs you pinned: they stay until you unpin them.
    'pinned', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'created_at', o.created_at, 'caption', o.caption,
          'sender_id', o.sender_id, 'sender_name', p.display_name, 'avatar_url', p.avatar_url,
          'event_title', (select title from public.events where id = o.event_id)) order by pp.pinned_at desc)
        from public.out_pins pp join public.outs o on o.id = pp.out_id join public.profiles p on p.id = o.sender_id
        where pp.user_id = (select id from me) and o.file_deleted_at is null
          and not private.is_blocked((select id from me), o.sender_id)), '[]'::jsonb)
  )
$$;

-- Server only (the open-out Edge Function): may this person look at this Out?
-- For an hour: the sender, the people it was sent to, and (for My Out) its
-- audience, as often as they like. After that, only people who pinned it.
create or replace function public.out_open(p_out bigint, p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.outs; pinned boolean; allowed boolean := false;
begin
  select * into o from public.outs where id = p_out;
  if o.id is null or o.file_deleted_at is not null or private.is_blocked(p_user, o.sender_id) then
    return jsonb_build_object('error', 'This Out is gone.');
  end if;
  pinned := exists (select 1 from public.out_pins where out_id = p_out and user_id = p_user);
  if o.expires_at > now() then
    if o.sender_id = p_user then
      allowed := true;
    elsif exists (select 1 from public.out_recipients where out_id = p_out and user_id = p_user) then
      update public.out_recipients set opened_at = coalesce(opened_at, now()) where out_id = p_out and user_id = p_user;
      allowed := true;
    elsif o.to_story and private.can_view_story(p_user, o.sender_id, o.audience) then
      insert into public.out_story_views (out_id, viewer_id) values (p_out, p_user) on conflict do nothing;
      allowed := true;
    end if;
  end if;
  if not allowed and not pinned then
    return jsonb_build_object('error', case when o.expires_at <= now()
      then 'This Out is gone. Outs last an hour unless you pin them.' else 'This Out is gone.' end);
  end if;
  return jsonb_build_object('id', o.id, 'path', o.path, 'caption', o.caption, 'created_at', o.created_at, 'expires_at', o.expires_at,
    'sender_id', o.sender_id, 'sender_name', (select display_name from public.profiles where id = o.sender_id),
    'event_title', (select title from public.events where id = o.event_id),
    'pinned', pinned, 'is_mine', o.sender_id = p_user);
end $$;

-- Pin an Out to keep it past the hour. The person who made it is told.
create or replace function public.pin_out(p_out bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare o public.outs; me uuid := auth.uid(); hit int; who text;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  select * into o from public.outs where id = p_out;
  if o.id is null or o.file_deleted_at is not null or o.expires_at <= now() or private.is_blocked(me, o.sender_id)
     or not (o.sender_id = me
             or exists (select 1 from public.out_recipients where out_id = p_out and user_id = me)
             or (o.to_story and private.can_view_story(me, o.sender_id, o.audience))) then
    raise exception 'This Out is gone.' using errcode = 'check_violation';
  end if;
  insert into public.out_pins (out_id, user_id) values (p_out, me) on conflict do nothing;
  get diagnostics hit = row_count;
  if hit > 0 and o.sender_id <> me then
    select display_name into who from public.profiles where id = me;
    perform private.notify(o.sender_id, 'out_pinned', who || ' pinned your Out', 'They can keep looking at it after the hour is up.', me, '/outs');
  end if;
  return true;
end $$;

create or replace function public.unpin_out(p_out bigint)
returns void language sql security definer set search_path = '' as $$
  delete from public.out_pins where out_id = p_out and user_id = auth.uid()
$$;

-- Server only: Outs whose photo can be deleted (the hour is up and nobody pinned it).
create or replace function public.outs_to_clean(p_limit integer default 100)
returns table (id bigint, path text) language sql stable security definer set search_path = '' as $$
  select o.id, o.path from public.outs o
  where o.file_deleted_at is null and o.expires_at <= now()
    and not exists (select 1 from public.out_pins pp where pp.out_id = o.id)
  order by o.id limit least(greatest(p_limit, 1), 500)
$$;

-- ── 3. Who sees each going-out plan (and where you're going) ──────────────
-- everyone = your network and people nearby (as before); network = 1st + 2nd
-- degree; circle = 1st degree only.
alter table public.going_out_posts add column if not exists audience text not null default 'everyone'
  check (audience in ('everyone', 'network', 'circle'));

create or replace function private.can_see_plan(p_owner uuid, p_audience text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner = auth.uid()
    or p_audience = 'everyone'
    or (p_audience = 'circle' and private.are_connected(auth.uid(), p_owner))
    or (p_audience = 'network' and private.degree_between(auth.uid(), p_owner) in (1, 2))
$$;

create or replace function public.set_plan_audience(p_post bigint, p_audience text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_audience not in ('everyone', 'network', 'circle') then
    raise exception 'Choose Everyone, My Network or My Circle.' using errcode = 'check_violation';
  end if;
  update public.going_out_posts set audience = p_audience where id = p_post and user_id = auth.uid();
  if not found then raise exception 'That''s not your plan.' using errcode = 'insufficient_privilege'; end if;
  -- The pin that announces the plan follows the same choice.
  update public.pins set audience = (case
      when p_audience = 'everyone' and public.shows_in_nearby(auth.uid()) then 'everyone'
      when p_audience = 'circle' then 'circle' else 'network' end)::public.pin_audience
   where going_out_post_id = p_post and author_id = auth.uid();
  -- "In now" can't reach further than the plan itself.
  if p_audience = 'circle' then
    update public.going_out_posts set here_audience = 'circle' where id = p_post and here_audience = 'network';
  end if;
end $$;

-- Apply the plan's audience wherever plans are shown.
do $$
declare
  src text; before text;
  fns text[] := array['public.going_out_feed(text, double precision, double precision, numeric)',
                      'public.tonight_network()', 'public.profile_card(uuid)'];
  olds text[] := array[
    '(public.shows_in_nearby(g.user_id) and not private.is_blocked(auth.uid(), g.user_id)))',
    'and (g.user_id = auth.uid() or public.shows_in_nearby(g.user_id))',
    'where g.user_id = p.id and g.when_kind = ''tonight'' and g.expires_at > now()'];
  news text[] := array[
    '(public.shows_in_nearby(g.user_id) and not private.is_blocked(auth.uid(), g.user_id) and private.can_see_plan(g.user_id, g.audience)))',
    'and (g.user_id = auth.uid() or (public.shows_in_nearby(g.user_id) and private.can_see_plan(g.user_id, g.audience)))',
    'where g.user_id = p.id and g.when_kind = ''tonight'' and g.expires_at > now() and private.can_see_plan(g.user_id, g.audience)'];
begin
  for i in 1 .. array_length(fns, 1) loop
    select pg_get_functiondef(fns[i]::regprocedure) into src;
    before := src;
    src := replace(src, olds[i], news[i]);
    if src = before then raise exception 'Could not add plan audience to %', fns[i]; end if;
    execute src;
  end loop;
end $$;

-- ── 4. Split the bill ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('receipts', 'receipts', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

create table public.bills (
  id           bigserial primary key,
  creator_id   uuid not null references public.profiles (id) on delete cascade,
  event_id     bigint references public.events (id) on delete set null,
  title        text not null check (char_length(title) between 1 and 80),
  total_cents  integer not null check (total_cents between 1 and 1000000),
  tip_cents    integer not null default 0 check (tip_cents between 0 and 1000000),
  split        text not null check (split in ('even', 'custom')),
  receipt_path text,
  note         text check (char_length(note) <= 200),
  created_at   timestamptz not null default now(),
  canceled_at  timestamptz
);
create index bills_creator_idx on public.bills (creator_id, created_at desc);
create index bills_event_idx on public.bills (event_id);

create table public.bill_shares (
  bill_id      bigint not null references public.bills (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  status       text not null default 'owed' check (status in ('owed', 'paid', 'settled')),
  paid_at      timestamptz,
  settled_at   timestamptz,
  reminded_at  timestamptz,
  primary key (bill_id, user_id)
);
create index bill_shares_user_idx on public.bill_shares (user_id);

-- Where friends pay you back (usernames only; shown only to people who owe you).
create table public.payment_handles (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  venmo      text check (venmo ~ '^[A-Za-z0-9_.-]{1,40}$'),
  cashapp    text check (cashapp ~ '^[A-Za-z0-9_.-]{1,40}$'),
  paypal     text check (paypal ~ '^[A-Za-z0-9_.-]{1,40}$'),
  updated_at timestamptz not null default now()
);
alter table public.bills enable row level security;
alter table public.bill_shares enable row level security;
alter table public.payment_handles enable row level security;
-- No direct access: everything goes through the functions below.

create or replace function private.in_bill(p_bill bigint, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bills where id = p_bill and creator_id = p_user)
      or exists (select 1 from public.bill_shares where bill_id = p_bill and user_id = p_user)
$$;

create or replace function private.can_see_receipt(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.bills b where b.receipt_path = p_name and private.in_bill(b.id, auth.uid()))
$$;

-- Receipt photos: <your id>/<file>. Seen by you and the people on the bill.
create policy "upload own receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own receipts" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read receipts on your bills" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = auth.uid()::text or private.can_see_receipt(name)));

create or replace function private.money(p_cents integer)
returns text language sql immutable as $$
  select '$' || to_char(p_cents / 100.0, 'FM999990.00')
$$;

-- People you can put on a bill: your circle, plus people going to the event.
create or replace function public.bill_people(p_event bigint default null)
returns table (user_id uuid, display_name text, avatar_url text, at_event boolean)
language sql stable security definer set search_path = '' as $$
  with ev as (
    select r.user_id as id from public.event_rsvps r where r.event_id = p_event
    union select e.host_id from public.events e where e.id = p_event
  ),
  mine as (
    select f as id from private.first_degree_ids(auth.uid()) f
    union select id from ev
      where p_event is not null and auth.uid() in (select id from ev)
  )
  select p.id, p.display_name, p.avatar_url, p.id in (select id from ev)
  from public.profiles p
  where p.id in (select id from mine) and p.id <> auth.uid() and not private.is_blocked(auth.uid(), p.id)
  order by p.id in (select id from ev) desc, p.display_name
$$;

-- Send a bill. p_shares: [{ "user_id": "...", "amount_cents": 1250 }, ...].
-- What's left of the total (with tip) is your own share.
create or replace function public.create_bill(p_title text, p_total_cents integer, p_tip_cents integer, p_split text,
                                              p_shares jsonb, p_receipt_path text default null,
                                              p_event bigint default null, p_note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id bigint;
  who text;
  n int;
  n_distinct int;
  owed bigint;
  bad int;
  s record;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Give the bill a name, like "Dinner".' using errcode = 'check_violation'; end if;
  if coalesce(p_total_cents, 0) < 1 then raise exception 'Enter the total from the receipt.' using errcode = 'check_violation'; end if;
  if p_split not in ('even', 'custom') then raise exception 'Split evenly or enter amounts.' using errcode = 'check_violation'; end if;
  if p_receipt_path is not null and p_receipt_path not like me::text || '/%' then
    raise exception 'Upload the receipt first.' using errcode = 'check_violation';
  end if;
  if p_event is not null and not exists (
       select 1 from public.events e where e.id = p_event and (e.host_id = me
         or exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = me))) then
    raise exception 'You can split a bill for events you went to.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.bills where creator_id = me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'That''s a lot of bills today. Try again tomorrow.' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'Tag at least one friend.' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_shares) > 30 then raise exception 'Split with 30 people at most.' using errcode = 'check_violation'; end if;

  select count(*), count(distinct x.user_id), coalesce(sum(x.amount_cents), 0),
         count(*) filter (where x.user_id is null or x.amount_cents is null or x.amount_cents < 1 or x.user_id = me
                            or x.user_id not in (select b.user_id from public.bill_people(p_event) b))
    into n, n_distinct, owed, bad
  from jsonb_to_recordset(p_shares) as x(user_id uuid, amount_cents integer);
  if n_distinct <> n then raise exception 'Each friend once, please.' using errcode = 'check_violation'; end if;
  if bad > 0 then
    raise exception 'You can split with people in your circle, or people at the same event. Every amount has to be more than $0.'
      using errcode = 'check_violation';
  end if;
  if owed > p_total_cents + coalesce(p_tip_cents, 0) then
    raise exception 'The amounts add up to more than the bill.' using errcode = 'check_violation';
  end if;

  insert into public.bills (creator_id, event_id, title, total_cents, tip_cents, split, receipt_path, note)
  values (me, p_event, trim(p_title), p_total_cents, coalesce(p_tip_cents, 0), p_split, p_receipt_path, nullif(trim(p_note), ''))
  returning id into new_id;
  insert into public.bill_shares (bill_id, user_id, amount_cents)
  select new_id, x.user_id, x.amount_cents from jsonb_to_recordset(p_shares) as x(user_id uuid, amount_cents integer);

  select display_name into who from public.profiles where id = me;
  for s in select user_id, amount_cents from public.bill_shares where bill_id = new_id loop
    perform private.notify(s.user_id, 'bill', who || ' split the bill for ' || trim(p_title),
      'Your share is ' || private.money(s.amount_cents) || '. Tap to see the receipt and pay.', me, '/bills/' || new_id);
  end loop;
  return new_id;
end $$;

-- A bill, for the people on it.
create or replace function public.bill_detail(p_bill bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.in_bill(b.id, auth.uid()) then null else jsonb_build_object(
    'id', b.id, 'title', b.title, 'total_cents', b.total_cents, 'tip_cents', b.tip_cents, 'split', b.split,
    'note', b.note, 'created_at', b.created_at, 'canceled', b.canceled_at is not null, 'receipt_path', b.receipt_path,
    'event', (select jsonb_build_object('id', e.id, 'title', e.title) from public.events e where e.id = b.event_id),
    'creator', jsonb_build_object('id', c.id, 'name', c.display_name, 'avatar_url', c.avatar_url),
    'is_mine', b.creator_id = auth.uid(),
    'creator_share_cents', b.total_cents + b.tip_cents - (select coalesce(sum(amount_cents), 0) from public.bill_shares where bill_id = b.id),
    'shares', coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'name', p.display_name, 'avatar_url', p.avatar_url,
        'amount_cents', s.amount_cents, 'status', s.status, 'paid_at', s.paid_at, 'settled_at', s.settled_at,
        'can_remind', b.creator_id = auth.uid() and s.status = 'owed' and (s.reminded_at is null or s.reminded_at < now() - interval '12 hours'))
        order by s.status = 'settled', p.display_name)
      from public.bill_shares s join public.profiles p on p.id = s.user_id where s.bill_id = b.id), '[]'::jsonb),
    -- Only people who owe the creator see where to pay them.
    'pay_to', case when exists (select 1 from public.bill_shares where bill_id = b.id and user_id = auth.uid())
      then (select jsonb_build_object('venmo', h.venmo, 'cashapp', h.cashapp, 'paypal', h.paypal)
            from public.payment_handles h where h.user_id = b.creator_id) end
  ) end
  from public.bills b join public.profiles c on c.id = b.creator_id
  where b.id = p_bill
$$;

-- Bills you sent and bills you owe, newest first.
create or replace function public.my_bills()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object('id', b.id, 'title', b.title, 'created_at', b.created_at, 'is_mine', b.creator_id = auth.uid(),
      'creator_name', c.display_name, 'canceled', b.canceled_at is not null,
      'my_amount_cents', (select amount_cents from public.bill_shares where bill_id = b.id and user_id = auth.uid()),
      'my_status', (select status from public.bill_shares where bill_id = b.id and user_id = auth.uid()),
      'people', (select count(*) from public.bill_shares where bill_id = b.id),
      'settled', (select count(*) from public.bill_shares where bill_id = b.id and status = 'settled'),
      'outstanding_cents', (select coalesce(sum(amount_cents), 0) from public.bill_shares where bill_id = b.id and status <> 'settled')) as x
    from public.bills b join public.profiles c on c.id = b.creator_id
    where (b.creator_id = auth.uid() or exists (select 1 from public.bill_shares s where s.bill_id = b.id and s.user_id = auth.uid()))
      and not private.is_blocked(auth.uid(), b.creator_id)
      and b.created_at > now() - interval '180 days'
    order by b.created_at desc limit 100
  ) q
$$;

-- "I paid": tell the person who paid the bill.
create or replace function public.mark_bill_paid(p_bill bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.bill_shares; b public.bills; who text;
begin
  select * into b from public.bills where id = p_bill;
  update public.bill_shares set status = 'paid', paid_at = now()
   where bill_id = p_bill and user_id = auth.uid() and status = 'owed' returning * into s;
  if s.bill_id is null or b.canceled_at is not null then return; end if;
  select display_name into who from public.profiles where id = auth.uid();
  perform private.notify(b.creator_id, 'bill_paid', who || ' says they paid you ' || private.money(s.amount_cents),
    'For ' || b.title || '. Tap Got it once you see it.', auth.uid(), '/bills/' || p_bill);
end $$;

-- The bill's creator: "Got it" (paid in full). Works even before they tap "I paid".
create or replace function public.settle_bill_share(p_bill bigint, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare b public.bills; s public.bill_shares; who text;
begin
  select * into b from public.bills where id = p_bill and creator_id = auth.uid();
  if b.id is null then raise exception 'That''s not your bill.' using errcode = 'insufficient_privilege'; end if;
  update public.bill_shares set status = 'settled', settled_at = now(), paid_at = coalesce(paid_at, now())
   where bill_id = p_bill and user_id = p_user and status <> 'settled' returning * into s;
  if s.bill_id is null then return; end if;
  select display_name into who from public.profiles where id = auth.uid();
  perform private.notify(p_user, 'bill_settled', who || ' got your ' || private.money(s.amount_cents), 'For ' || b.title || '. You''re all square.',
    auth.uid(), '/bills/' || p_bill);
end $$;

-- A friendly nudge, at most every 12 hours per person.
create or replace function public.remind_bill(p_bill bigint, p_user uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare b public.bills; s public.bill_shares; who text;
begin
  select * into b from public.bills where id = p_bill and creator_id = auth.uid() and canceled_at is null;
  if b.id is null then raise exception 'That''s not your bill.' using errcode = 'insufficient_privilege'; end if;
  update public.bill_shares set reminded_at = now()
   where bill_id = p_bill and user_id = p_user and status = 'owed'
     and (reminded_at is null or reminded_at < now() - interval '12 hours') returning * into s;
  if s.bill_id is null then return false; end if;
  select display_name into who from public.profiles where id = auth.uid();
  perform private.notify(p_user, 'bill', 'Reminder: your share of ' || b.title || ' is ' || private.money(s.amount_cents),
    who || ' paid the bill. Tap to pay them back.', auth.uid(), '/bills/' || p_bill);
  return true;
end $$;

create or replace function public.cancel_bill(p_bill bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.bills set canceled_at = coalesce(canceled_at, now()) where id = p_bill and creator_id = auth.uid();
  if not found then raise exception 'That''s not your bill.' using errcode = 'insufficient_privilege'; end if;
end $$;

create or replace function public.my_payment_handles()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('venmo', venmo, 'cashapp', cashapp, 'paypal', paypal)
                   from public.payment_handles where user_id = auth.uid()),
                  jsonb_build_object('venmo', null, 'cashapp', null, 'paypal', null))
$$;

create or replace function public.set_payment_handles(p_venmo text, p_cashapp text, p_paypal text)
returns void language plpgsql security definer set search_path = '' as $$
declare v text; c text; p text;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  -- People type "@name", "$name" or a whole link; keep just the username.
  v := nullif(regexp_replace(regexp_replace(trim(coalesce(p_venmo, '')), '^(https?://)?(www\.)?venmo\.com/(u/)?', '', 'i'), '^@', ''), '');
  c := nullif(regexp_replace(regexp_replace(trim(coalesce(p_cashapp, '')), '^(https?://)?(www\.)?cash\.app/', '', 'i'), '^\$', ''), '');
  p := nullif(regexp_replace(trim(coalesce(p_paypal, '')), '^(https?://)?(www\.)?paypal\.me/', '', 'i'), '');
  if v !~ '^[A-Za-z0-9_.-]{1,40}$' or c !~ '^[A-Za-z0-9_.-]{1,40}$' or p !~ '^[A-Za-z0-9_.-]{1,40}$' then
    raise exception 'Use just your username (letters, numbers, dots, dashes or underscores).' using errcode = 'check_violation';
  end if;
  insert into public.payment_handles (user_id, venmo, cashapp, paypal, updated_at) values (auth.uid(), v, c, p, now())
  on conflict (user_id) do update set venmo = excluded.venmo, cashapp = excluded.cashapp, paypal = excluded.paypal, updated_at = now();
end $$;

-- ── Grants ─────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.send_out(text, text, uuid[], boolean, text)', 'public.outs_inbox()', 'public.pin_out(bigint)', 'public.unpin_out(bigint)',
    'public.set_plan_audience(bigint, text)', 'public.bill_people(bigint)',
    'public.create_bill(text, integer, integer, text, jsonb, text, bigint, text)', 'public.bill_detail(bigint)', 'public.my_bills()',
    'public.mark_bill_paid(bigint)', 'public.settle_bill_share(bigint, uuid)', 'public.remind_bill(bigint, uuid)',
    'public.cancel_bill(bigint)', 'public.my_payment_handles()', 'public.set_payment_handles(text, text, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.out_open(bigint, uuid)', 'public.outs_to_clean(integer)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['private.can_view_story(uuid, uuid, text)', 'private.can_see_plan(uuid, text)',
                           'private.in_bill(bigint, uuid)', 'private.money(integer)'] loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
  -- Storage policies call this as the signed-in member.
  revoke execute on function private.can_see_receipt(text) from public, anon;
  grant execute on function private.can_see_receipt(text) to authenticated;
end $$;
