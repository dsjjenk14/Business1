-- 1. Unvouch: take back a vouch you gave. It still counts toward this
--    month's limit (so vouches can't be recycled).
-- 2. Checking in with someone is just a meetup. Vouching is a separate,
--    optional choice (the meetup notification says so).
-- 3. Outs can only be posted while you're at an I'm In event: you said I'm In
--    (or you're hosting), it's happening now, and the app has marked you there.

-- ── 1. Unvouch ─────────────────────────────────────────────────────────────
create or replace function public.unvouch(p_user uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  update public.vouches set status = 'revoked'
   where voucher_id = auth.uid() and vouchee_id = p_user and status <> 'revoked';
  get diagnostics n = row_count;
  return n;
end $$;

-- Who I've vouched for (for Settings → Vouches you gave, and profiles).
create or replace function public.my_vouches_given()
returns table (user_id uuid, display_name text, avatar_url text, vouches integer, last_word text, last_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar_url, count(*)::int,
         (array_agg(w.word order by v.created_at desc))[1], max(v.created_at)
  from public.vouches v
  join public.profiles p on p.id = v.vouchee_id
  left join public.vouch_words w on w.id = v.word_id
  where v.voucher_id = auth.uid() and v.status <> 'revoked'
  group by p.id order by max(v.created_at) desc
$$;

-- Monthly budget counts every vouch given this month, even ones taken back.
create or replace function public.validate_vouch()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  enc public.encounters;
  invite_count int;
  given_this_month int;
  monthly numeric;
  at_time timestamptz := coalesce(new.created_at, now());
begin
  if new.type = 'gps' then
    select * into enc from public.encounters where id = new.encounter_id;
    if enc.id is null
       or least(new.voucher_id, new.vouchee_id) <> enc.user_a
       or greatest(new.voucher_id, new.vouchee_id) <> enc.user_b then
      raise exception 'A vouch needs a GPS-confirmed meetup between these two people.'
        using errcode = 'check_violation';
    end if;
    if enc.overlap_end < at_time - make_interval(days => public.config_num('vouch_window_days')::int) then
      raise exception 'That meetup was too long ago to vouch from. Meet up again and check in together.'
        using errcode = 'check_violation';
    end if;
    monthly := public.plan_limit(new.voucher_id, 'vouches_per_month');
    if monthly is not null then
      select count(*) into given_this_month from public.vouches
       where voucher_id = new.voucher_id and type = 'gps'
         and date_trunc('month', created_at at time zone 'America/New_York')
           = date_trunc('month', at_time at time zone 'America/New_York');
      if given_this_month >= monthly then
        raise exception 'You''ve used your % vouches for this month. You get more on the 1st, or go unlimited with Premium.', monthly::int
          using errcode = 'check_violation';
      end if;
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

create or replace function public.my_vouches_left_this_month()
returns integer language sql stable security definer set search_path = '' as $$
  select case when public.plan_limit(auth.uid(), 'vouches_per_month') is null then null
  else greatest(0, public.plan_limit(auth.uid(), 'vouches_per_month')::int - (
    select count(*)::int from public.vouches
     where voucher_id = auth.uid() and type = 'gps'
       and date_trunc('month', created_at at time zone 'America/New_York')
         = date_trunc('month', now() at time zone 'America/New_York'))) end
$$;

-- ── 2. A check-in is just a meetup ────────────────────────────────────────
-- Reword the meetup notification: vouching is optional.
create or replace function private.meetup_notice_text(p_who text, p_place text)
returns text language sql immutable as $$
  select p_who || ' checked in with you' || coalesce(' at ' || p_place, '') || '. If you''d recommend them, you can vouch. It''s up to you.'
$$;

do $$
declare src text;
begin
  -- Swap the old "You can vouch for each other." line in check_in for the optional wording.
  select pg_get_functiondef('public.check_in(double precision, double precision, real, bigint, bigint)'::regprocedure) into src;
  src := replace(src,
    $old$(select display_name from public.profiles where id = me) || ' checked in with you' || coalesce(' at ' || v_place, '') || '. You can vouch for each other.'$old$,
    $new$private.meetup_notice_text((select display_name from public.profiles where id = me), v_place)$new$);
  execute src;
end $$;

-- ── 3. Outs only at events ────────────────────────────────────────────────
alter table public.outs add column if not exists event_id bigint references public.events (id) on delete set null;

-- The event you're at right now: going (or hosting), happening now, and the
-- app has marked you there (GPS arrival or "I'm here").
create or replace function private.current_event(p_user uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select ev.id from public.events ev
  where now() between ev.starts_at - interval '1 hour' and coalesce(ev.ends_at, ev.starts_at + interval '3 hours') + interval '1 hour'
    and (ev.host_id = p_user or exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = p_user))
    and exists (select 1 from public.location_pings lp where lp.user_id = p_user and lp.event_id = ev.id and lp.purpose = 'checkin')
  order by ev.starts_at desc limit 1
$$;

-- For the Outs tab: can I post right now, and where?
create or replace function public.my_out_event()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when e.id is null then null else jsonb_build_object('id', e.id, 'title', e.title,
    'place', coalesce((select name from public.venues where id = e.venue_id), e.place_text)) end
  from (select private.current_event(auth.uid()) as eid) x
  left join public.events e on e.id = x.eid
$$;

create or replace function public.send_out(p_path text, p_caption text, p_recipients uuid[], p_to_story boolean default false)
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
  ev := private.current_event(me);
  if ev is null then
    raise exception 'You can post Outs when you''re at an I''m In event. Say I''m In to one, and the app marks you there when you arrive.'
      using errcode = 'check_violation';
  end if;
  if p_path is null or p_path not like me::text || '/%' then raise exception 'Upload the photo first.' using errcode = 'check_violation'; end if;
  if (select count(*) from public.outs where sender_id = me and created_at > now() - interval '1 day') >= public.config_num('outs_per_day') then
    raise exception 'That''s a lot of Outs today. Try again tomorrow.' using errcode = 'check_violation';
  end if;
  select coalesce(array_agg(distinct r), '{}') into targets
  from unnest(coalesce(p_recipients, '{}')) r
  where r <> me and private.are_connected(me, r) and not private.is_blocked(me, r);
  if cardinality(targets) = 0 and not coalesce(p_to_story, false) then
    raise exception 'Pick at least one friend, or post it to My Out.' using errcode = 'check_violation';
  end if;
  if cardinality(targets) > 50 then raise exception 'Send to 50 people at most.' using errcode = 'check_violation'; end if;

  insert into public.outs (sender_id, path, caption, to_story, expires_at, event_id)
  values (me, p_path, nullif(trim(p_caption), ''), coalesce(p_to_story, false),
          now() + make_interval(hours => public.config_num('out_hours')::int), ev)
  returning id into new_id;
  insert into public.out_recipients (out_id, user_id) select new_id, unnest(targets);

  select display_name into who from public.profiles where id = me;
  select title into ev_title from public.events where id = ev;
  perform private.notify(t, 'out', who || ' sent you an Out from ' || ev_title, 'Tap to open it. It disappears after you look.', me, '/outs')
  from unnest(targets) t;
  return new_id;
end $$;

-- The viewer shows which event an Out is from.
create or replace function public.out_open(p_out bigint, p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.outs; r public.out_recipients;
begin
  select * into o from public.outs where id = p_out;
  if o.id is null or o.expires_at <= now() or o.file_deleted_at is not null or private.is_blocked(p_user, o.sender_id) then
    return jsonb_build_object('error', 'This Out is gone.');
  end if;
  select * into r from public.out_recipients where out_id = p_out and user_id = p_user;
  if r.out_id is not null then
    if r.opened_at is not null then return jsonb_build_object('error', 'You already opened this Out.'); end if;
    update public.out_recipients set opened_at = now() where out_id = p_out and user_id = p_user;
  elsif o.to_story and (o.sender_id = p_user or private.are_connected(p_user, o.sender_id)) then
    if o.sender_id <> p_user then
      insert into public.out_story_views (out_id, viewer_id) values (p_out, p_user) on conflict do nothing;
    end if;
  else
    return jsonb_build_object('error', 'This Out is gone.');
  end if;
  return jsonb_build_object('path', o.path, 'caption', o.caption, 'created_at', o.created_at,
    'sender_id', o.sender_id, 'sender_name', (select display_name from public.profiles where id = o.sender_id),
    'event_title', (select title from public.events where id = o.event_id));
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.unvouch(uuid)', 'public.my_vouches_given()', 'public.my_out_event()',
                           'public.my_vouches_left_this_month()', 'public.send_out(text, text, uuid[], boolean)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  revoke execute on function public.out_open(bigint, uuid) from public, anon, authenticated;
  grant execute on function public.out_open(bigint, uuid) to service_role;
  revoke execute on function private.current_event(uuid) from public, anon, authenticated;
end $$;
