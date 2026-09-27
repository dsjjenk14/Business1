-- I'm In: 010 Trust graph flows (Phase 3)
-- GPS check-in → encounters, vouching rules + notifications, vouch requests,
-- intros (make / request / respond), Circles + Network data, member search,
-- and the 30-day purge of raw GPS readings.

insert into public.app_config (key, value, description) values
  ('vouch_window_days',          '14',  'A vouch must be given within this many days of the GPS meetup.'),
  ('checkin_max_accuracy_m',     '150', 'Check-ins with worse GPS accuracy than this are rejected.'),
  ('checkin_recent_hours',       '6',   'Meetups from the last N hours are shown right after checking in.')
on conflict (key) do nothing;

-- ── Notifications helper ──────────────────────────────────────────────────
create or replace function private.notify(p_user uuid, p_kind text, p_title text, p_body text, p_actor uuid, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, actor_id, link)
  values (p_user, p_kind, p_title, coalesce(p_body, ''), p_actor, p_link)
$$;

-- ── GPS check-in → encounters ─────────────────────────────────────────────
-- Both people tap "Check in" while together. Each check-in stores a private,
-- exact GPS reading (never readable by anyone, deleted after 30 days). When two
-- readings are within encounter_max_distance_m and encounter_time_window_min of
-- each other, the server records an encounter: the proof that unlocks vouching.
create or replace function public.check_in(
  p_lat double precision, p_lng double precision, p_accuracy_m real default null,
  p_venue_id bigint default null, p_event_id bigint default null)
returns table (encounter_id bigint, user_id uuid, display_name text, avatar_emoji text, avatar_url text,
               vouch_count integer, degree smallint, place_label text, met_at timestamptz, already_vouched boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  here extensions.geography := extensions.st_setsrid(extensions.st_point(p_lng, p_lat), 4326)::extensions.geography;
  max_dist double precision := public.config_num('encounter_max_distance_m');
  window_min double precision := public.config_num('encounter_time_window_min');
  v_place text;
  v_venue bigint := p_venue_id;
  r record;
  existing bigint;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then
    raise exception 'We couldn''t read your location. Turn on location and try again.' using errcode = 'check_violation';
  end if;
  if p_accuracy_m is not null and p_accuracy_m > public.config_num('checkin_max_accuracy_m') then
    raise exception 'Your GPS signal is too weak right now. Step outside or wait a moment, then try again.' using errcode = 'check_violation';
  end if;

  -- Label the place with the nearest known venue, if any.
  if v_venue is null then
    select v.id into v_venue from public.venues v
     where extensions.st_dwithin(v.location, here, 200) order by extensions.st_distance(v.location, here) limit 1;
  end if;
  select name into v_place from public.venues where id = v_venue;

  insert into public.location_pings (user_id, location, accuracy_m, purpose, venue_id, event_id)
  values (me, here, p_accuracy_m, 'checkin', v_venue, p_event_id);

  -- Everyone else who checked in close by, recently (their nearest reading).
  for r in
    select distinct on (lp.user_id) lp.user_id as other, lp.recorded_at,
           extensions.st_distance(lp.location, here) as dist
    from public.location_pings lp
    where lp.user_id <> me
      and lp.purpose in ('checkin', 'date_mode')
      and lp.recorded_at > now() - make_interval(mins => window_min::int)
      and extensions.st_dwithin(lp.location, here, max_dist)
      and not private.is_blocked(me, lp.user_id)
    order by lp.user_id, extensions.st_distance(lp.location, here)
  loop
    select e.id into existing from public.encounters e
     where e.user_a = least(me, r.other) and e.user_b = greatest(me, r.other)
       and e.overlap_end > now() - interval '3 hours'
     order by e.overlap_end desc limit 1;

    if existing is null then
      insert into public.encounters (user_a, user_b, context, venue_id, event_id, place_label, distance_m, overlap_start, overlap_end)
      values (least(me, r.other), greatest(me, r.other),
              case when p_event_id is not null then 'event' when v_venue is not null then 'venue' else 'nearby' end::public.encounter_context,
              v_venue, p_event_id, v_place, r.dist, least(r.recorded_at, now()), now());
      perform private.notify(r.other, 'meetup', 'You''re both here ✓',
        (select display_name from public.profiles where id = me) || ' checked in with you' || coalesce(' at ' || v_place, '') || '. You can vouch for each other.',
        me, '/circles/vouch');
    else
      update public.encounters set overlap_end = now(), distance_m = least(distance_m, r.dist) where id = existing;
    end if;
  end loop;

  return query select * from public.my_recent_meetups(public.config_num('checkin_recent_hours')::int * 60);
end $$;

-- Meetups you can still vouch from (within the vouch window), newest first.
create or replace function public.my_recent_meetups(p_minutes integer default null)
returns table (encounter_id bigint, user_id uuid, display_name text, avatar_emoji text, avatar_url text,
               vouch_count integer, degree smallint, place_label text, met_at timestamptz, already_vouched boolean)
language sql stable security definer set search_path = '' as $$
  select e.id, o.id, o.display_name, o.avatar_emoji, o.avatar_url, public.visible_vouch_count(o.id),
         private.degree_between(auth.uid(), o.id), e.place_label, e.overlap_end,
         exists (select 1 from public.vouches v where v.encounter_id = e.id and v.voucher_id = auth.uid())
  from public.encounters e
  join public.profiles o on o.id = case when e.user_a = auth.uid() then e.user_b else e.user_a end
  where auth.uid() in (e.user_a, e.user_b)
    and e.overlap_end > now() - make_interval(days => public.config_num('vouch_window_days')::int)
    and (p_minutes is null or e.overlap_end > now() - make_interval(mins => p_minutes))
    and not private.is_blocked(auth.uid(), o.id)
  order by e.overlap_end desc
$$;

-- ── Vouch rules (replaces the Phase 1 version) ────────────────────────────
create or replace function public.validate_vouch()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  enc public.encounters;
  invite_count int;
  given_this_month int;
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
    -- Monthly budget: each member can give N vouches per calendar month (DC time).
    select count(*) into given_this_month from public.vouches
     where voucher_id = new.voucher_id and type = 'gps' and status <> 'revoked'
       and date_trunc('month', created_at at time zone 'America/New_York')
         = date_trunc('month', at_time at time zone 'America/New_York');
    if given_this_month >= public.config_num('vouches_per_month') then
      raise exception 'You''ve used your vouches for this month. You get more on the 1st.'
        using errcode = 'check_violation';
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

-- After a vouch: tell the person, close any matching vouch request.
create or replace function public.vouch_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.type = 'gps' and new.created_at > now() - interval '1 minute' then
    perform private.notify(new.vouchee_id, 'vouch',
      (select display_name from public.profiles where id = new.voucher_id) || ' vouched for you 🏅',
      'Word: ' || coalesce((select word from public.vouch_words where id = new.word_id), ''),
      new.voucher_id, '/profile');
  end if;
  update public.vouch_requests set status = 'accepted'
   where requester_id = new.vouchee_id and target_id = new.voucher_id and status = 'pending';
  return null;
end $$;
create trigger vouches_after_insert after insert on public.vouches
  for each row execute function public.vouch_after_insert();

-- ── Vouch requests ────────────────────────────────────────────────────────
-- You can ask someone to vouch only if you have a recent GPS meetup with them
-- that they haven't vouched from yet.
create or replace function public.request_vouch(p_target uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id bigint;
begin
  if not exists (
    select 1 from public.encounters e
    where e.user_a = least(me, p_target) and e.user_b = greatest(me, p_target)
      and e.overlap_end > now() - make_interval(days => public.config_num('vouch_window_days')::int)
      and not exists (select 1 from public.vouches v where v.encounter_id = e.id and v.voucher_id = p_target)
  ) then
    raise exception 'You can ask for a vouch after you''ve met in person and checked in together.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.vouch_requests where requester_id = me and target_id = p_target and status = 'pending') then
    raise exception 'You already asked. They''ll see it in their notifications.' using errcode = 'check_violation';
  end if;
  insert into public.vouch_requests (requester_id, target_id) values (me, p_target) returning id into new_id;
  perform private.notify(p_target, 'vouch_request',
    (select display_name from public.profiles where id = me) || ' asked you for a vouch',
    'You met recently. Vouch if it felt right. No pressure.', me, '/circles/vouch');
  return new_id;
end $$;

-- ── Intros ────────────────────────────────────────────────────────────────
-- A connector introduces person A (their 1st degree) to person B (their 1st
-- or 2nd degree). Both must accept. On acceptance they're connected (source
-- 'intro', which also unlocks messaging right away) and the connector gets credit.
create or replace function public.make_intro(p_a uuid, p_b uuid, p_message text, p_request bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  req public.intro_requests;
  new_id bigint;
  me_name text := (select display_name from public.profiles where id = me);
begin
  if p_a = p_b or me in (p_a, p_b) then
    raise exception 'Pick two different people (not yourself).' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_message), '') = '' then
    raise exception 'Say why they should meet.' using errcode = 'check_violation';
  end if;
  if not private.are_connected(me, p_a) or coalesce(private.degree_between(me, p_b), 9) > 2 then
    raise exception 'You can introduce people from your circle and network only.' using errcode = 'check_violation';
  end if;
  if private.are_connected(p_a, p_b) then
    raise exception 'They''re already connected.' using errcode = 'check_violation';
  end if;
  if private.is_blocked(p_a, p_b) then
    raise exception 'This intro isn''t possible.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.intros
             where least(person_a, person_b) = least(p_a, p_b) and greatest(person_a, person_b) = greatest(p_a, p_b)
               and a_status <> 'declined' and b_status <> 'declined'
               and not (a_status = 'accepted' and b_status = 'accepted')) then
    raise exception 'There''s already an intro waiting between these two.' using errcode = 'check_violation';
  end if;

  if p_request is not null then
    select * into req from public.intro_requests where id = p_request and via_id = me and status = 'pending';
    if req.id is null or req.requester_id <> p_a or req.target_id <> p_b then
      raise exception 'That intro request isn''t available.' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.intros (connector_id, person_a, person_b, message, a_status)
  values (me, p_a, p_b, trim(p_message), case when p_request is not null then 'accepted' else 'pending' end::public.intro_status)
  returning id into new_id;

  if p_request is not null then
    update public.intro_requests set status = 'accepted', intro_id = new_id where id = p_request;
  else
    perform private.notify(p_a, 'intro', me_name || ' wants you to meet ' || (select display_name from public.profiles where id = p_b),
      trim(p_message), me, '/circles/intros');
  end if;
  perform private.notify(p_b, 'intro', me_name || ' wants you to meet ' || (select display_name from public.profiles where id = p_a),
    trim(p_message), me, '/circles/intros');
  return new_id;
end $$;

create or replace function public.respond_intro(p_intro bigint, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  i public.intros;
  status public.intro_status := case when p_accept then 'accepted' else 'declined' end;
begin
  select * into i from public.intros where id = p_intro;
  if i.id is null or me not in (i.person_a, i.person_b) then
    raise exception 'That intro isn''t available.' using errcode = 'check_violation';
  end if;
  if me = i.person_a then update public.intros set a_status = status where id = p_intro returning * into i;
  else update public.intros set b_status = status where id = p_intro returning * into i; end if;

  if i.a_status = 'accepted' and i.b_status = 'accepted' then
    insert into public.connections (user_a, user_b, source, connector_id)
    values (least(i.person_a, i.person_b), greatest(i.person_a, i.person_b), 'intro', i.connector_id)
    on conflict do nothing;
    perform private.notify(i.connector_id, 'intro_success', 'Your intro worked 👋',
      (select display_name from public.profiles where id = i.person_a) || ' and ' ||
      (select display_name from public.profiles where id = i.person_b) || ' are now connected, thanks to you.', null, '/circles');
    perform private.notify(case when me = i.person_a then i.person_b else i.person_a end, 'intro_success',
      'You''re connected with ' || (select display_name from public.profiles where id = me),
      'Intro by ' || (select display_name from public.profiles where id = i.connector_id) || '. You can message each other now.', me,
      '/people/' || me);
    return 'connected';
  elsif status = 'declined' then
    -- Passing is always graceful: only the connector hears, and without detail.
    perform private.notify(i.connector_id, 'intro_declined', 'An intro didn''t happen this time',
      'No worries. Not every match clicks.', null, '/circles');
    return 'declined';
  end if;
  return 'waiting';
end $$;

-- 2nd degree: "Ask Maya to intro me to Simone".
create or replace function public.request_intro(p_target uuid, p_via uuid, p_note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id bigint;
begin
  if not private.are_connected(me, p_via) or not private.are_connected(p_via, p_target) then
    raise exception 'Pick someone you both know.' using errcode = 'check_violation';
  end if;
  if private.are_connected(me, p_target) then
    raise exception 'You''re already connected.' using errcode = 'check_violation';
  end if;
  if private.is_blocked(me, p_target) then
    raise exception 'This intro isn''t possible.' using errcode = 'check_violation';
  end if;
  if not coalesce((select allow_intro_requests from public.user_settings where user_id = p_target), true) then
    raise exception 'This member isn''t taking intro requests right now.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.intro_requests where requester_id = me and target_id = p_target and status = 'pending') then
    raise exception 'You already asked for this intro.' using errcode = 'check_violation';
  end if;
  insert into public.intro_requests (requester_id, target_id, via_id, note)
  values (me, p_target, p_via, nullif(trim(p_note), '')) returning id into new_id;
  perform private.notify(p_via, 'intro_request',
    (select display_name from public.profiles where id = me) || ' wants an intro to ' || (select display_name from public.profiles where id = p_target),
    coalesce(nullif(trim(p_note), ''), 'Your reputation travels with the intro, so only make it if it feels right.'), me, '/circles/intros');
  return new_id;
end $$;

create or replace function public.decline_intro_request(p_request bigint)
returns void language sql security definer set search_path = '' as $$
  update public.intro_requests set status = 'declined' where id = p_request and via_id = auth.uid() and status = 'pending'
$$;

-- Everything intro-related waiting on me.
create or replace function public.my_intros()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'to_answer', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'message', i.message, 'created_at', i.created_at,
        'connector', jsonb_build_object('id', c.id, 'display_name', c.display_name, 'avatar_emoji', c.avatar_emoji, 'avatar_url', c.avatar_url),
        'other', jsonb_build_object('id', o.id, 'display_name', o.display_name, 'avatar_emoji', o.avatar_emoji, 'avatar_url', o.avatar_url,
                                    'headline', o.headline, 'vouch_count', public.visible_vouch_count(o.id))
      ) order by i.created_at desc)
      from public.intros i
      join public.profiles c on c.id = i.connector_id
      join public.profiles o on o.id = case when i.person_a = auth.uid() then i.person_b else i.person_a end
      where (i.person_a = auth.uid() and i.a_status = 'pending' and i.b_status <> 'declined')
         or (i.person_b = auth.uid() and i.b_status = 'pending' and i.a_status <> 'declined')), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'note', r.note, 'created_at', r.created_at,
        'requester', jsonb_build_object('id', a.id, 'display_name', a.display_name, 'avatar_emoji', a.avatar_emoji, 'avatar_url', a.avatar_url),
        'target', jsonb_build_object('id', b.id, 'display_name', b.display_name, 'avatar_emoji', b.avatar_emoji, 'avatar_url', b.avatar_url)
      ) order by r.created_at desc)
      from public.intro_requests r
      join public.profiles a on a.id = r.requester_id
      join public.profiles b on b.id = r.target_id
      where r.via_id = auth.uid() and r.status = 'pending'), '[]'::jsonb),
    'made_count', (select count(*) from public.intros i where i.connector_id = auth.uid() and i.a_status = 'accepted' and i.b_status = 'accepted')
  )
$$;

-- ── Circles: My Circle + Network in one call ──────────────────────────────
create or replace function public.circle_overview()
returns jsonb language sql stable security definer set search_path = '' as $$
  with me as (select auth.uid() as id),
  first as (select f as id from private.first_degree_ids(auth.uid()) f),
  second as (select s.user_id as id, s.via_ids from private.second_degree(auth.uid()) s),
  my_groups as (select group_id from public.group_members where user_id = auth.uid())
  select jsonb_build_object(
    'first', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'display_name', p.display_name, 'avatar_emoji', p.avatar_emoji, 'avatar_url', p.avatar_url,
        'vouch_count', public.visible_vouch_count(p.id), 'top_vouch_word', p.top_vouch_word,
        'city', (select name from public.cities where id = p.city_id), 'neighborhood', p.neighborhood,
        'out_tonight', exists (select 1 from public.going_out_posts g where g.user_id = p.id and g.when_kind = 'tonight' and g.expires_at > now()),
        'source', (select c.source from public.connections c where c.user_a = least(auth.uid(), p.id) and c.user_b = greatest(auth.uid(), p.id))
      ) order by p.vouch_count desc)
      from public.profiles p where p.id in (select id from first) and not private.is_blocked(auth.uid(), p.id)), '[]'::jsonb),
    'second', coalesce((
      select jsonb_agg(x order by (x->>'score')::int desc, (x->>'vouch_count')::int desc nulls last) from (
        select jsonb_build_object(
          'id', p.id, 'display_name', p.display_name, 'avatar_emoji', p.avatar_emoji, 'avatar_url', p.avatar_url,
          'vouch_count', public.visible_vouch_count(p.id), 'top_vouch_word', p.top_vouch_word, 'headline', p.headline,
          'via', (select jsonb_agg(jsonb_build_object('id', v.id, 'display_name', v.display_name) order by v.vouch_count desc)
                  from public.profiles v where v.id = any(s.via_ids)),
          'shared_groups', (select count(*) from public.group_members gm where gm.user_id = p.id and gm.group_id in (select group_id from my_groups)),
          'requested', exists (select 1 from public.intro_requests r where r.requester_id = auth.uid() and r.target_id = p.id and r.status = 'pending'),
          -- Simple "you'd click" score until the AI version (Phase 7): mutual friends + shared groups.
          'score', cardinality(s.via_ids) * 2 + (select count(*) from public.group_members gm where gm.user_id = p.id and gm.group_id in (select group_id from my_groups))::int
        ) as x
        from second s join public.profiles p on p.id = s.id
        where coalesce((select discoverable from public.user_settings where user_id = p.id), true)) q), '[]'::jsonb),
    'vouches_left', public.my_vouches_left_this_month(),
    'vouch_count', (select vouch_count from public.profiles where id = auth.uid())
  )
$$;

-- Recent happenings in your circle (vouches, new connections, nights out).
create or replace function public.network_activity(p_limit integer default 20)
returns table (kind text, at timestamptz, actor_id uuid, actor_name text, actor_emoji text, actor_avatar text,
               subject_id uuid, subject_name text, detail text)
language sql stable security definer set search_path = '' as $$
  with circle as (select f as id from private.first_degree_ids(auth.uid()) f)
  select * from (
    select 'vouch'::text, v.created_at, a.id, a.display_name, a.avatar_emoji, a.avatar_url, b.id, b.display_name,
           coalesce(w.word, '') || coalesce(' · ' || e.place_label, '')
    from public.vouches v
    join public.profiles a on a.id = v.voucher_id
    join public.profiles b on b.id = v.vouchee_id
    left join public.vouch_words w on w.id = v.word_id
    left join public.encounters e on e.id = v.encounter_id
    where v.type = 'gps' and v.status = 'active' and v.created_at > now() - interval '30 days'
      and (v.voucher_id in (select id from circle) or v.vouchee_id in (select id from circle))
      and v.vouchee_id <> auth.uid() and v.voucher_id <> auth.uid()
    union all
    select 'connected', c.created_at, a.id, a.display_name, a.avatar_emoji, a.avatar_url, b.id, b.display_name,
           case when c.source = 'intro' then 'via intro' else '' end
    from public.connections c
    join public.profiles a on a.id = c.user_a
    join public.profiles b on b.id = c.user_b
    where c.created_at > now() - interval '30 days'
      and (c.user_a in (select id from circle) or c.user_b in (select id from circle))
      and auth.uid() not in (c.user_a, c.user_b)
    union all
    select 'going_out', g.created_at, a.id, a.display_name, a.avatar_emoji, a.avatar_url, null::uuid, null::text,
           case when public.shows_going_out_venue(a.id) then coalesce(ve.name, g.place_text, '') else '' end
    from public.going_out_posts g
    join public.profiles a on a.id = g.user_id
    left join public.venues ve on ve.id = g.venue_id
    where g.user_id in (select id from circle) and g.when_kind = 'tonight' and g.expires_at > now()
  ) x (kind, at, actor_id, actor_name, actor_emoji, actor_avatar, subject_id, subject_name, detail)
  where not private.is_blocked(auth.uid(), actor_id) and (subject_id is null or not private.is_blocked(auth.uid(), subject_id))
  order by at desc
  limit least(greatest(p_limit, 1), 50)
$$;

-- ── Groups overview for the Circles → Groups tab ──────────────────────────
create or replace function public.groups_overview()
returns jsonb language sql stable security definer set search_path = '' as $$
  with circle as (select f as id from private.first_degree_ids(auth.uid()) f),
  g as (
    select gr.*, (select count(*) from public.group_members m where m.group_id = gr.id) as member_count,
           exists (select 1 from public.group_members m where m.group_id = gr.id and m.user_id = auth.uid()) as is_member,
           exists (select 1 from public.group_join_requests r where r.group_id = gr.id and r.user_id = auth.uid() and r.status = 'pending') as requested,
           (select array_agg(p.display_name order by p.vouch_count desc) from public.group_members m join public.profiles p on p.id = m.user_id
             where m.group_id = gr.id and m.user_id in (select id from circle)) as circle_members,
           (select display_name from public.profiles where id = gr.owner_id) as owner_name
    from public.groups gr
  )
  select jsonb_build_object(
    'mine', coalesce((select jsonb_agg(to_jsonb(g) - 'owner_id' order by g.name) from g where is_member), '[]'::jsonb),
    'from_circle', coalesce((select jsonb_agg(to_jsonb(g) - 'owner_id' order by cardinality(g.circle_members) desc) from g
                             where not is_member and circle_members is not null), '[]'::jsonb),
    'discover', coalesce((select jsonb_agg(to_jsonb(g) - 'owner_id' order by g.member_count desc) from g
                          where not is_member and circle_members is null), '[]'::jsonb)
  )
$$;

-- ── Member search ─────────────────────────────────────────────────────────
-- Finds discoverable members by name. Your circle and network rank first.
create or replace function public.search_members(p_query text, p_limit integer default 20)
returns table (id uuid, display_name text, avatar_emoji text, avatar_url text, headline text, vouch_count integer,
               degree smallint, via_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar_emoji, p.avatar_url, p.headline, public.visible_vouch_count(p.id),
         private.degree_between(auth.uid(), p.id),
         (select v.display_name from public.profiles v
           where v.id in (select private.first_degree_ids(auth.uid()) intersect select private.first_degree_ids(p.id))
           order by v.vouch_count desc limit 1)
  from public.profiles p
  where length(trim(coalesce(p_query, ''))) >= 2
    and (p.full_name ilike '%' || trim(p_query) || '%' or p.display_name ilike '%' || trim(p_query) || '%')
    and p.id <> auth.uid()
    and not private.is_blocked(auth.uid(), p.id)
    and (coalesce((select discoverable from public.user_settings where user_id = p.id), true)
         or private.are_connected(auth.uid(), p.id))
  order by coalesce(private.degree_between(auth.uid(), p.id), 9), p.vouch_count desc
  limit least(greatest(p_limit, 1), 50)
$$;

-- ── Raw GPS retention: delete readings older than 30 days, daily ─────────
create or replace function private.purge_location_pings()
returns void language sql security definer set search_path = '' as $$
  delete from public.location_pings
  where recorded_at < now() - make_interval(days => public.config_num('location_ping_retention_days')::int)
$$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('purge-location-pings', '17 4 * * *', 'select private.purge_location_pings()');
exception when others then
  raise notice 'pg_cron not available; schedule private.purge_location_pings() another way (%).', sqlerrm;
end $$;

-- ── Permissions: signed-in members only ───────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.check_in(double precision, double precision, real, bigint, bigint)',
    'public.my_recent_meetups(integer)',
    'public.request_vouch(uuid)',
    'public.make_intro(uuid, uuid, text, bigint)',
    'public.respond_intro(bigint, boolean)',
    'public.request_intro(uuid, uuid, text)',
    'public.decline_intro_request(bigint)',
    'public.my_intros()',
    'public.circle_overview()',
    'public.network_activity(integer)',
    'public.groups_overview()',
    'public.search_members(text, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
