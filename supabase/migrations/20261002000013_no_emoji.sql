-- I'm In: 013 No emoji
-- The app draws its own symbols (see src/components/ui/Glyph.tsx) and never
-- shows emoji. Symbol columns (groups/events/venues.emoji, vouch_tiers.emoji)
-- now hold symbol names like 'dinner' or 'crown'. Avatars use initials or a
-- photo; profiles.avatar_emoji is no longer shown.

-- Tier symbols.
update public.vouch_tiers set emoji = case name
  when 'New Face' then 'seed'
  when 'In the Mix' then 'loop'
  when 'Connector' then 'link'
  when 'Plugged In' then 'bolt'
  when 'Icon' then 'crown'
  else 'medal' end;

-- Groups: default symbol, and convert any emoji already stored.
alter table public.groups alter column emoji set default 'spark';

create or replace function private.emoji_to_glyph(p text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p is null then null
    when p ~ '^[a-z_]+$' then p
    when p like '%🍽%' or p like '%🍝%' then 'dinner'
    when p like '%🍹%' or p like '%🍸%' or p like '%🍺%' then 'drinks'
    when p like '%🍷%' or p like '%🥂%' then 'wine'
    when p like '%🎵%' or p like '%🎶%' then 'music'
    when p like '%🏋%' or p like '%🧘%' then 'fitness'
    when p like '%🏃%' then 'route'
    when p like '%🏓%' then 'paddle'
    when p like '%🎨%' then 'art'
    when p like '%🎓%' then 'cap'
    when p like '%💼%' then 'briefcase'
    when p like '%📚%' then 'book'
    when p like '%🌿%' then 'outdoors'
    when p like '%☕%' then 'coffee'
    when p like '%🎉%' then 'party'
    else 'spark' end
$$;
update public.groups set emoji = private.emoji_to_glyph(emoji) where emoji !~ '^[a-z_]+$';
update public.events set emoji = private.emoji_to_glyph(emoji) where emoji is not null and emoji !~ '^[a-z_]+$';
update public.venues set emoji = private.emoji_to_glyph(emoji) where emoji is not null and emoji !~ '^[a-z_]+$';
update public.profiles set avatar_emoji = null where avatar_emoji is not null;

-- Only symbol names from now on (lowercase words, e.g. 'dinner').
alter table public.groups add constraint groups_emoji_is_symbol check (emoji ~ '^[a-z_]+$');
alter table public.events add constraint events_emoji_is_symbol check (emoji is null or emoji ~ '^[a-z_]+$');
alter table public.venues add constraint venues_emoji_is_symbol check (emoji is null or emoji ~ '^[a-z_]+$');

-- create_group defaulted to an emoji.
create or replace function public.create_group(
  p_name text, p_category text, p_description text default '', p_join_type public.join_type default 'request',
  p_emoji text default null, p_schedule text default null, p_invite uuid[] default '{}')
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id bigint;
  u uuid;
begin
  if not private.can_create_group(me) then
    raise exception 'Verify your phone number first (Settings → Verify phone). It keeps groups trustworthy.' using errcode = 'check_violation';
  end if;
  if char_length(coalesce(trim(p_name), '')) < 2 then raise exception 'Give your group a name.' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.groups where lower(name) = lower(trim(p_name))) then
    raise exception 'A group with that name already exists.' using errcode = 'check_violation';
  end if;
  insert into public.groups (name, emoji, category, description, join_type, owner_id, city_id, schedule_label)
  values (trim(p_name), coalesce(private.emoji_to_glyph(nullif(p_emoji, '')), 'spark'), p_category, coalesce(trim(p_description), ''), p_join_type, me,
          (select city_id from public.profiles where id = me), nullif(trim(p_schedule), ''))
  returning id into new_id;
  insert into public.group_members (group_id, user_id, role) values (new_id, me, 'owner');

  -- Invite founding members (people from your circle).
  foreach u in array coalesce(p_invite, '{}') loop
    if private.are_connected(me, u) then
      insert into public.group_invites (group_id, user_id, invited_by) values (new_id, u, me) on conflict do nothing;
      perform private.notify(u, 'group_invite', (select display_name from public.profiles where id = me) || ' invited you to ' || trim(p_name),
        'Join as a founding member.', me, '/groups/' || new_id);
    end if;
  end loop;
  return new_id;
end $$;

-- Notification titles without emoji.
create or replace function public.vouch_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.type = 'gps' and new.created_at > now() - interval '1 minute' then
    perform private.notify(new.vouchee_id, 'vouch',
      (select display_name from public.profiles where id = new.voucher_id) || ' vouched for you',
      'Word: ' || coalesce((select word from public.vouch_words where id = new.word_id), ''),
      new.voucher_id, '/profile');
  end if;
  update public.vouch_requests set status = 'accepted'
   where requester_id = new.vouchee_id and target_id = new.voucher_id and status = 'pending';
  return null;
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
    perform private.notify(i.connector_id, 'intro_success', 'Your intro worked',
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
      perform private.notify(r.other, 'meetup', 'You''re both here',
        (select display_name from public.profiles where id = me) || ' checked in with you' || coalesce(' at ' || v_place, '') || '. You can vouch for each other.',
        me, '/circles/vouch');
    else
      update public.encounters set overlap_end = now(), distance_m = least(distance_m, r.dist) where id = existing;
    end if;
  end loop;

  return query select * from public.my_recent_meetups(public.config_num('checkin_recent_hours')::int * 60);
end $$;
