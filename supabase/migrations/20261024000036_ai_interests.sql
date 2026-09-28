-- Phase 7: AI.
--
-- • Interests on profiles (picked from a fixed list, so matching is exact).
-- • People like you: people who share your interests, groups, spots and going-out
--   days, ranked here in SQL (free, instant). The AI then picks and explains the best.
-- • The facts each AI feature is allowed to see, gathered here so the rules about
--   who can see what stay in one place (the AI function calls these as the user).
-- • Intro odds: a plain score + reasons for any two people you could introduce.
-- • AI results cache and usage count (3 free AI uses, unlimited with Premium).
--
-- Members never need an AI account: the app's server calls the AI with one key
-- the business owns.

-- ── Interests ─────────────────────────────────────────────────────────────
create table public.interest_options (
  key      text primary key check (key ~ '^[a-z0-9_]{2,30}$'),
  label    text not null,
  category text not null,
  sort     smallint not null default 0
);
alter table public.interest_options enable row level security;
create policy "interests readable" on public.interest_options for select using (true);
grant select on public.interest_options to anon, authenticated;

insert into public.interest_options (key, label, category, sort) values
  ('brunch',        'Brunch',            'Food & drink', 10),
  ('foodie',        'Trying new spots',  'Food & drink', 11),
  ('cocktails',     'Cocktails',         'Food & drink', 12),
  ('wine',          'Wine bars',         'Food & drink', 13),
  ('rooftops',      'Rooftops',          'Food & drink', 14),
  ('happy_hour',    'Happy hour',        'Food & drink', 15),
  ('cooking',       'Cooking',           'Food & drink', 16),
  ('coffee',        'Coffee shops',      'Food & drink', 17),
  ('live_music',    'Live music',        'Music & nights', 20),
  ('hip_hop',       'Hip-hop',           'Music & nights', 21),
  ('rnb',           'R&B',               'Music & nights', 22),
  ('jazz',          'Jazz',              'Music & nights', 23),
  ('go_go',         'Go-go',             'Music & nights', 24),
  ('house',         'House & dance',     'Music & nights', 25),
  ('dancing',       'Dancing',           'Music & nights', 26),
  ('karaoke',       'Karaoke',           'Music & nights', 27),
  ('comedy',        'Comedy',            'Music & nights', 28),
  ('festivals',     'Festivals',         'Music & nights', 29),
  ('running',       'Running',           'Active', 30),
  ('fitness',       'Fitness classes',   'Active', 31),
  ('pickleball',    'Pickleball',        'Active', 32),
  ('tennis',        'Tennis',            'Active', 33),
  ('yoga',          'Yoga',              'Active', 34),
  ('hiking',        'Hiking',            'Active', 35),
  ('cycling',       'Cycling',           'Active', 36),
  ('basketball',    'Basketball',        'Active', 37),
  ('golf',          'Golf',              'Active', 38),
  ('watch_sports',  'Watching sports',   'Active', 39),
  ('art',           'Art & museums',     'Culture', 40),
  ('books',         'Books',             'Culture', 41),
  ('film',          'Movies',            'Culture', 42),
  ('theater',       'Theater',           'Culture', 43),
  ('fashion',       'Fashion',           'Culture', 44),
  ('photography',   'Photography',       'Culture', 45),
  ('gaming',        'Gaming',            'Culture', 46),
  ('board_games',   'Board games',       'Culture', 47),
  ('travel',        'Travel',            'Life', 50),
  ('startups',      'Startups',          'Life', 51),
  ('tech',          'Tech',              'Life', 52),
  ('networking',    'Networking',        'Life', 53),
  ('volunteering',  'Volunteering',      'Life', 54),
  ('faith',         'Faith',             'Life', 55),
  ('dogs',          'Dogs',              'Life', 56),
  ('wellness',      'Wellness',          'Life', 57),
  ('politics',      'Politics & policy', 'Life', 58),
  ('hbcu',          'HBCU life',         'Life', 59);

alter table public.profiles add column interests text[] not null default '{}'
  check (cardinality(interests) <= 12);
grant select (interests) on public.profiles to anon, authenticated;
grant update (interests) on public.profiles to authenticated;

create or replace function private.clean_interests() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from unnest(new.interests) k where k not in (select key from public.interest_options)) then
    raise exception 'Pick interests from the list.' using errcode = 'check_violation';
  end if;
  new.interests := array(select distinct k from unnest(new.interests) k order by k);
  return new;
end $$;
create trigger profiles_clean_interests before insert or update of interests on public.profiles
  for each row execute function private.clean_interests();

-- ── Shared building blocks ────────────────────────────────────────────────
-- Only what anyone could already see counts: open plans ("everyone") and
-- public events. Circle-only plans never feed a match or an AI read.

/** Days of the week someone goes out (1 = Mon … 7 = Sun), last 120 days. */
create or replace function private.out_days(p_user uuid) returns int[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct d order by d), '{}') from (
    select extract(isodow from coalesce(g.starts_at, g.created_at) at time zone 'America/New_York')::int d
    from public.going_out_posts g
    where g.user_id = p_user and g.audience = 'everyone' and g.created_at > now() - interval '120 days'
    union all
    select extract(isodow from e.starts_at at time zone 'America/New_York')::int
    from public.event_rsvps r join public.events e on e.id = r.event_id
    where r.user_id = p_user and e.visibility = 'public' and e.surprise_for is null and e.starts_at > now() - interval '120 days'
  ) x
$$;

/** Places someone has been going, last 120 days. */
create or replace function private.out_venues(p_user uuid) returns bigint[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct v), '{}') from (
    select g.venue_id v from public.going_out_posts g
    where g.user_id = p_user and g.audience = 'everyone' and g.venue_id is not null and g.created_at > now() - interval '120 days'
    union all
    select e.venue_id from public.event_rsvps r join public.events e on e.id = r.event_id
    where r.user_id = p_user and e.visibility = 'public' and e.surprise_for is null and e.venue_id is not null
      and e.starts_at > now() - interval '120 days'
  ) x
$$;

create or replace function private.day_names(p_days int[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg((array['Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays','Sundays'])[d] order by d), '{}')
  from unnest(p_days) d where d between 1 and 7
$$;

/**
 * What two people have in common: interests, groups, spots, going-out days,
 * mutual friends and area. Used by People like you, icebreakers and intro odds.
 */
create or replace function private.pair_facts(p_a uuid, p_b uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with a as (select * from public.profiles where id = p_a),
       b as (select * from public.profiles where id = p_b),
       mutual as (select id from private.first_degree_ids(p_a) id intersect select private.first_degree_ids(p_b))
  select jsonb_build_object(
    'shared_interests', coalesce((
      select jsonb_agg(o.label order by o.sort) from public.interest_options o, a, b
      where o.key = any(a.interests) and o.key = any(b.interests)), '[]'::jsonb),
    'shared_groups', coalesce((
      select jsonb_agg(g.name order by g.name) from public.groups g
      where g.id in (select group_id from public.group_members where user_id = p_a)
        and g.id in (select group_id from public.group_members where user_id = p_b)), '[]'::jsonb),
    'shared_spots', coalesce((
      select jsonb_agg(v.name order by v.name) from public.venues v
      where v.id = any(private.out_venues(p_a)) and v.id = any(private.out_venues(p_b))), '[]'::jsonb),
    'shared_days', to_jsonb(private.day_names(array(
      select unnest(private.out_days(p_a)) intersect select unnest(private.out_days(p_b))))),
    'mutual_count', (select count(*) from mutual),
    'mutuals', coalesce((
      select jsonb_agg(p.display_name order by p.vouch_count desc) from (
        select p.display_name, p.vouch_count from public.profiles p where p.id in (select id from mutual)
        order by p.vouch_count desc limit 3) p), '[]'::jsonb),
    'same_neighborhood', coalesce((select lower(a.neighborhood) = lower(b.neighborhood) from a, b), false),
    'same_city', coalesce((select a.city_id = b.city_id from a, b), false)
  )
$$;

/** One number for "how much do these two have in common". */
create or replace function private.pair_score(f jsonb) returns int
language sql immutable set search_path = '' as $$
  select (12 * jsonb_array_length(f->'shared_interests')
        + 10 * least(jsonb_array_length(f->'shared_groups'), 3)
        +  6 * least(jsonb_array_length(f->'shared_spots'), 3)
        +  3 * jsonb_array_length(f->'shared_days')
        +  4 * least((f->>'mutual_count')::int, 5)
        +  case when (f->>'same_neighborhood')::boolean then 5 else 0 end)::int
$$;

-- ── People like you ───────────────────────────────────────────────────────
-- Who you could meet (not already in your circle): your 2nd degree, people in
-- your groups, and people in your city who share an interest. Blocked people,
-- people who hid from you and people you muted are left out.
create or replace function public.people_like_you(p_limit int default 15) returns jsonb
language sql stable security definer set search_path = '' as $$
  with me as (select id, interests, city_id from public.profiles where id = auth.uid()),
  first as (select private.first_degree_ids(auth.uid()) as id),
  second as (select user_id, via_ids from private.second_degree(auth.uid())),
  pool as (
    select user_id as id from second
    union
    select gm.user_id from public.group_members gm
    where gm.group_id in (select group_id from public.group_members where user_id = auth.uid())
    union
    (select p.id from public.profiles p, me
     where p.city_id = me.city_id and p.interests && me.interests
     order by cardinality(array(select unnest(p.interests) intersect select unnest(me.interests))) desc, p.vouch_count desc
     limit 200)
  ),
  cand as (
    select p.*, private.pair_facts(auth.uid(), p.id) as f, s.via_ids
    from public.profiles p
    join pool on pool.id = p.id
    left join second s on s.user_id = p.id
    where p.id <> auth.uid()
      and p.id not in (select id from first)
      and not private.is_blocked(auth.uid(), p.id)
      and not private.post_hidden(p.id, auth.uid())
      and not exists (select 1 from public.hidden_from h where h.user_id = auth.uid() and h.hidden_user_id = p.id)
  )
  select coalesce(jsonb_agg(x order by (x->>'score')::int desc, (x->>'vouch_count')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'user_id', c.id,
      'display_name', c.display_name,
      'avatar_url', c.avatar_url,
      'headline', c.headline,
      'neighborhood', c.neighborhood,
      'vouch_count', public.visible_vouch_count(c.id),
      'degree', case when c.via_ids is not null then 2 end,
      'via', case when c.via_ids is not null then (
        select jsonb_build_object('id', v.id, 'display_name', v.display_name) from public.profiles v
        where v.id = any(c.via_ids) order by v.vouch_count desc limit 1) end,
      'intro_requested', exists (select 1 from public.intro_requests r
                                 where r.requester_id = auth.uid() and r.target_id = c.id and r.status = 'pending'),
      'shared', c.f,
      'score', private.pair_score(c.f)
    ) as x
    from cand c
    where private.pair_score(c.f) > 0
    order by private.pair_score(c.f) desc, c.vouch_count desc
    limit greatest(1, least(coalesce(p_limit, 15), 30))
  ) s
$$;

-- ── What each AI feature may see ──────────────────────────────────────────
-- All of these run as the signed-in user, so they only ever include what that
-- person could already see in the app. No message content, ever.

/** Public facts about one person: interests, groups, vouch words, habits. */
create or replace function private.person_facts(p_person uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'first_name', split_part(p.display_name, ' ', 1),
    'headline', p.headline,
    'neighborhood', p.neighborhood,
    'city', (select name from public.cities where id = p.city_id),
    'member_since', to_char(p.created_at, 'Mon YYYY'),
    'interests', coalesce((select jsonb_agg(o.label order by o.sort) from public.interest_options o where o.key = any(p.interests)), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(g.name order by g.name) from public.group_members gm join public.groups g on g.id = gm.group_id
                        where gm.user_id = p.id), '[]'::jsonb),
    'vouch_count', public.visible_vouch_count(p.id),
    'vouch_words', coalesce((
      select jsonb_agg(jsonb_build_object('word', word, 'times', n) order by n desc) from (
        select w.word, count(*) n from public.vouches v join public.vouch_words w on w.id = v.word_id
        where v.vouchee_id = p.id and v.status = 'active' group by w.word order by count(*) desc limit 6) s), '[]'::jsonb),
    'circle_size', (select count(*) from private.first_degree_ids(p.id)),
    'intros_made', (select count(*) from public.intros i where i.connector_id = p.id and i.a_status = 'accepted' and i.b_status = 'accepted'),
    'events_last_90_days', (select count(*) from public.event_rsvps r join public.events e on e.id = r.event_id
                            where r.user_id = p.id and e.visibility = 'public' and e.surprise_for is null
                              and e.starts_at between now() - interval '90 days' and now()),
    'events_hosted', (select count(*) from public.events e where e.host_id = p.id and e.visibility = 'public' and e.surprise_for is null),
    'nights_out_last_90_days', (select count(*) from public.going_out_posts g
                                where g.user_id = p.id and g.audience = 'everyone' and g.created_at > now() - interval '90 days'),
    'usual_nights', to_jsonb(private.day_names(private.out_days(p.id))),
    'late_nights', (select count(*) from public.going_out_posts g
                    where g.user_id = p.id and g.audience = 'everyone' and g.created_at > now() - interval '90 days'
                      and extract(hour from coalesce(g.starts_at, g.created_at) at time zone 'America/New_York') not between 6 and 20),
    'favorite_spots', coalesce((select jsonb_agg(v.name order by v.name) from public.venues v where v.id = any(private.out_venues(p.id))
                                ), '[]'::jsonb),
    'public_pins_last_90_days', (select count(*) from public.pins pn where pn.author_id = p.id and pn.audience = 'everyone'
                                 and pn.deleted_at is null and pn.hidden_at is null and pn.created_at > now() - interval '90 days')
  )
  from public.profiles p where p.id = p_person
$$;

/** For icebreakers: them, what you share, and a few of their recent posts you can see. */
create or replace function public.ai_icebreaker_facts(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_person = auth.uid() or private.is_blocked(auth.uid(), p_person)
     or not exists (select 1 from public.profiles where id = p_person) then
    raise exception 'Not available.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'me', jsonb_build_object('first_name', (select split_part(display_name, ' ', 1) from public.profiles where id = auth.uid())),
    'them', private.person_facts(p_person),
    'shared', private.pair_facts(auth.uid(), p_person),
    'degree', private.degree_between(auth.uid(), p_person),
    'their_recent_posts', coalesce((
      select jsonb_agg(jsonb_build_object('kind', category, 'place', place_label, 'text', left(body, 160))) from (
        select pn.category, pn.place_label, pn.body from public.pins pn
        where pn.author_id = p_person and pn.deleted_at is null and pn.hidden_at is null
          and pn.created_at > now() - interval '60 days' and private.can_see_pin(pn.id, auth.uid())
        order by pn.created_at desc limit 4) s), '[]'::jsonb));
end $$;

/** For an AI Read: only what anyone could see, since everyone gets the same read. */
create or replace function public.ai_profile_facts(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or private.is_blocked(auth.uid(), p_person)
     or not exists (select 1 from public.profiles where id = p_person) then
    raise exception 'Not available.' using errcode = 'insufficient_privilege';
  end if;
  return private.person_facts(p_person);
end $$;

/** For Tonight for You: what's on tonight near you, and where your people are headed. */
create or replace function public.ai_tonight_options() returns jsonb
language sql stable security definer set search_path = '' as $$
  with f1 as (select private.first_degree_ids(auth.uid()) as id),
  f2 as (select user_id as id from private.second_degree(auth.uid())),
  origin as (select coalesce(p.approx_location, c.center) as g from public.profiles p
             left join public.cities c on c.id = p.city_id where p.id = auth.uid()),
  ev as (
    select e.*, v.name as venue_name, v.neighborhood as venue_area,
      (select count(*) from public.event_rsvps r where r.event_id = e.id) as going,
      array(select p.display_name from public.event_rsvps r join public.profiles p on p.id = r.user_id
            where r.event_id = e.id and r.user_id in (select id from f1) order by p.vouch_count desc limit 4) as friends,
      (select count(*) from public.event_rsvps r where r.event_id = e.id and r.user_id in (select id from f2)) as network,
      (select count(*) from public.event_rsvps r where r.event_id = e.id and r.user_id in (select id from f1)
         and not exists (select 1 from public.vouches vv where vv.voucher_id = auth.uid() and vv.vouchee_id = r.user_id and vv.status = 'active')) as could_vouch,
      exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = auth.uid()) as i_am_going
    from public.events e left join public.venues v on v.id = e.venue_id
    where e.starts_at between now() - interval '1 hour' and public.tonight_ends_at()
      and not private.is_blocked(auth.uid(), e.host_id)
      and not private.event_hidden(e.id, auth.uid())
      and (e.approx_location is null or (select g from origin) is null
           or extensions.st_dwithin(e.approx_location, (select g from origin), 60000))
  ),
  spots as (
    select v.id, v.name, v.neighborhood,
      array_agg(distinct p.display_name) filter (where g.user_id in (select id from f1)) as friends,
      count(*) filter (where g.user_id in (select id from f2)) as network
    from public.going_out_posts g
    join public.venues v on v.id = g.venue_id
    join public.profiles p on p.id = g.user_id
    where g.when_kind = 'tonight' and g.expires_at > now() and g.user_id <> auth.uid()
      and (g.user_id in (select id from f1) or g.user_id in (select id from f2))
      and private.can_see_plan(g.user_id, g.audience) and not private.event_hidden(g.event_id, auth.uid())
      and not private.post_hidden(g.user_id, auth.uid())
    group by v.id, v.name, v.neighborhood
  )
  select jsonb_build_object(
    'now', to_char(now() at time zone 'America/New_York', 'Dy FMHH12:MI AM'),
    'options', coalesce((select jsonb_agg(o) from (
      select jsonb_build_object(
        'key', 'event:' || ev.id, 'kind', 'event', 'id', ev.id, 'title', ev.title,
        'where', coalesce(ev.venue_name, ev.place_text), 'area', ev.venue_area,
        'starts', to_char(ev.starts_at at time zone 'America/New_York', 'FMHH12:MI AM'),
        'going', ev.going, 'friends_going', to_jsonb(ev.friends), 'network_going', ev.network,
        'friends_you_could_vouch_for', ev.could_vouch, 'you_are_going', ev.i_am_going,
        'price', case when coalesce(ev.ticket_price_cents, 0) > 0 then private.money(ev.ticket_price_cents) end) o
      from ev order by cardinality(ev.friends) desc, ev.network desc, ev.going desc limit 8) s), '[]'::jsonb)
    || coalesce((select jsonb_agg(o) from (
      select jsonb_build_object(
        'key', 'venue:' || spots.id, 'kind', 'spot', 'id', spots.id, 'title', spots.name,
        'where', spots.name, 'area', spots.neighborhood,
        'friends_going', to_jsonb(coalesce(spots.friends, '{}')), 'network_going', spots.network) o
      from spots order by cardinality(coalesce(spots.friends, '{}')) desc, spots.network desc limit 5) s), '[]'::jsonb)
  )
$$;

-- ── Intro odds ────────────────────────────────────────────────────────────
-- How likely an intro turns into a real meetup within 30 days. A plain score
-- from what the two share, whether they're both active, and the connector's
-- track record. The AI only writes the explanation on top.
create or replace function private.intro_odds(p_connector uuid, p_a uuid, p_b uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  f jsonb := private.pair_facts(p_a, p_b);
  si int := jsonb_array_length(f->'shared_interests');
  sg int := jsonb_array_length(f->'shared_groups');
  ss int := jsonb_array_length(f->'shared_spots');
  sd int := jsonb_array_length(f->'shared_days');
  mc int := greatest((f->>'mutual_count')::int - 1, 0); -- besides you
  a_name text := (select split_part(display_name, ' ', 1) from public.profiles where id = p_a);
  b_name text := (select split_part(display_name, ' ', 1) from public.profiles where id = p_b);
  a_active boolean;
  b_active boolean;
  made int;
  worked int;
  score int := 25;
  signals jsonb := '[]'::jsonb;
begin
  select exists (select 1 from public.going_out_posts where user_id = p_a and created_at > now() - interval '21 days')
      or exists (select 1 from public.event_rsvps r join public.events e on e.id = r.event_id where r.user_id = p_a and e.starts_at > now() - interval '21 days')
    into a_active;
  select exists (select 1 from public.going_out_posts where user_id = p_b and created_at > now() - interval '21 days')
      or exists (select 1 from public.event_rsvps r join public.events e on e.id = r.event_id where r.user_id = p_b and e.starts_at > now() - interval '21 days')
    into b_active;
  select count(*), count(*) filter (where a_status = 'accepted' and b_status = 'accepted')
    into made, worked from public.intros where connector_id = p_connector;

  score := score + least(si * 10, 30) + least(sg * 10, 20) + least(ss * 8, 16) + least(sd * 4, 12) + least(mc * 3, 9)
         + case when (f->>'same_neighborhood')::boolean then 6 when (f->>'same_city')::boolean then 2 else -6 end
         + case when a_active and b_active then 8 when a_active or b_active then 0 else -10 end
         + case when made >= 2 then round(worked::numeric / made * 10 - 5)::int else 0 end;
  score := greatest(5, least(95, score));

  if si > 0 then
    signals := signals || jsonb_build_object('label', 'Both into ' || (select string_agg(x, ', ') from (select jsonb_array_elements_text(f->'shared_interests') x limit 3) s), 'good', true);
  else
    signals := signals || jsonb_build_object('label', 'No shared interests listed', 'good', false);
  end if;
  if sg > 0 then signals := signals || jsonb_build_object('label', 'Same group: ' || (f->'shared_groups'->>0), 'good', true); end if;
  if ss > 0 then signals := signals || jsonb_build_object('label', 'Both go to ' || (f->'shared_spots'->>0), 'good', true); end if;
  if sd > 0 then signals := signals || jsonb_build_object('label', 'Both go out ' || (f->'shared_days'->>0), 'good', true); end if;
  if mc > 0 then signals := signals || jsonb_build_object('label', mc || ' more mutual friend' || case when mc = 1 then '' else 's' end, 'good', true); end if;
  if (f->>'same_neighborhood')::boolean then
    signals := signals || jsonb_build_object('label', 'Same neighborhood', 'good', true);
  elsif not (f->>'same_city')::boolean then
    signals := signals || jsonb_build_object('label', 'Live in different cities', 'good', false);
  end if;
  if a_active and b_active then
    signals := signals || jsonb_build_object('label', 'Both out lately', 'good', true);
  elsif not a_active then
    signals := signals || jsonb_build_object('label', a_name || ' hasn''t been out lately', 'good', false);
  end if;
  if not b_active and a_active then
    signals := signals || jsonb_build_object('label', b_name || ' hasn''t been out lately', 'good', false);
  end if;
  if made >= 2 then
    signals := signals || jsonb_build_object('label', 'Your intros: ' || worked || ' of ' || made || ' clicked', 'good', worked * 2 >= made);
  end if;

  return jsonb_build_object(
    'score', score,
    'band', case when score >= 65 then 'high' when score >= 40 then 'medium' else 'low' end,
    'signals', signals,
    'a', a_name, 'b', b_name,
    'facts', f || jsonb_build_object('both_active', a_active and b_active, 'connector_intros_made', made, 'connector_intros_clicked', worked));
end $$;

create or replace function public.intro_odds(p_a uuid, p_b uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_a = p_b or auth.uid() in (p_a, p_b)
     or not private.are_connected(auth.uid(), p_a) or coalesce(private.degree_between(auth.uid(), p_b), 9) > 2 then
    raise exception 'You can only check intros between people you know.' using errcode = 'insufficient_privilege';
  end if;
  return private.intro_odds(auth.uid(), p_a, p_b);
end $$;

-- Every intro records its predicted odds (for tuning the score later).
do $$
declare
  src text := pg_get_functiondef('public.make_intro(uuid,uuid,text,bigint)'::regprocedure);
  out text;
begin
  out := replace(src,
    'insert into public.intros (connector_id, person_a, person_b, message, a_status)
  values (me, p_a, p_b, trim(p_message), case when p_request is not null then ''accepted'' else ''pending'' end::public.intro_status)',
    'insert into public.intros (connector_id, person_a, person_b, message, a_status, predicted_score)
  values (me, p_a, p_b, trim(p_message), case when p_request is not null then ''accepted'' else ''pending'' end::public.intro_status,
          (private.intro_odds(me, p_a, p_b)->>''score'')::smallint)');
  if out = src then raise exception 'make_intro patch did not apply'; end if;
  execute out;
end $$;

-- ── AI results cache and usage ────────────────────────────────────────────
-- Only the server reads and writes the cache. `scope` is the viewer's id, or
-- 'all' when every viewer gets the same result (AI Read on a profile).
create table public.ai_cache (
  scope      text not null,
  feature    text not null check (feature in ('people_like_you', 'icebreakers', 'tonight', 'intro_odds', 'profile_read')),
  subject    text not null default '',
  person_id  uuid references auth.users (id) on delete cascade,
  result     jsonb not null,
  created_by uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (scope, feature, subject)
);
alter table public.ai_cache enable row level security;
revoke all on public.ai_cache from anon, authenticated;

create table public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  feature    text not null,
  created_at timestamptz not null default now()
);
create index ai_usage_user_idx on public.ai_usage (user_id);
alter table public.ai_usage enable row level security;
create policy "own ai usage" on public.ai_usage for select using (user_id = auth.uid());
grant select on public.ai_usage to authenticated;

/** How many AI uses you have. `limit` null = unlimited (Premium). */
create or replace function private.ai_quota(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('limit', l, 'used', u, 'left', case when l is null then null else greatest(l - u, 0) end)
  from (select public.plan_limit(p_user, 'ai_uses')::int as l,
               (select count(*)::int from public.ai_usage where user_id = p_user) as u) x
$$;

create or replace function public.my_ai_quota() returns jsonb
language sql stable security definer set search_path = '' as $$ select private.ai_quota(auth.uid()) $$;

-- Server only: read a cached result, and save a new one (counting a use when asked).
create or replace function public.ai_cache_get(p_scope text, p_feature text, p_subject text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('result', result, 'created_at', created_at) from public.ai_cache
  where scope = p_scope and feature = p_feature and subject = coalesce(p_subject, '') and expires_at > now()
$$;

create or replace function public.ai_quota_for(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$ select private.ai_quota(p_user) $$;

create or replace function public.ai_save(
  p_user uuid, p_scope text, p_feature text, p_subject text, p_person uuid,
  p_result jsonb, p_ttl_minutes int, p_count boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ai_cache (scope, feature, subject, person_id, result, created_by, expires_at)
  values (p_scope, p_feature, coalesce(p_subject, ''), p_person, p_result, p_user, now() + make_interval(mins => p_ttl_minutes))
  on conflict (scope, feature, subject) do update
    set result = excluded.result, person_id = excluded.person_id, created_by = excluded.created_by,
        created_at = now(), expires_at = excluded.expires_at;
  if p_count then
    insert into public.ai_usage (user_id, feature) values (p_user, p_feature);
  end if;
  return private.ai_quota(p_user);
end $$;

revoke execute on function public.ai_cache_get(text, text, text) from public, anon, authenticated;
revoke execute on function public.ai_quota_for(uuid) from public, anon, authenticated;
revoke execute on function public.ai_save(uuid, text, text, text, uuid, jsonb, int, boolean) from public, anon, authenticated;
grant execute on function public.ai_cache_get(text, text, text) to service_role;
grant execute on function public.ai_quota_for(uuid) to service_role;
grant execute on function public.ai_save(uuid, text, text, text, uuid, jsonb, int, boolean) to service_role;

revoke execute on function public.people_like_you(int) from public, anon;
revoke execute on function public.ai_icebreaker_facts(uuid) from public, anon;
revoke execute on function public.ai_profile_facts(uuid) from public, anon;
revoke execute on function public.ai_tonight_options() from public, anon;
revoke execute on function public.intro_odds(uuid, uuid) from public, anon;
revoke execute on function public.my_ai_quota() from public, anon;
grant execute on function public.people_like_you(int) to authenticated;
grant execute on function public.ai_icebreaker_facts(uuid) to authenticated;
grant execute on function public.ai_profile_facts(uuid) to authenticated;
grant execute on function public.ai_tonight_options() to authenticated;
grant execute on function public.intro_odds(uuid, uuid) to authenticated;
grant execute on function public.my_ai_quota() to authenticated;

-- The AI Read on a profile (when one was made) and interests show on the profile card.
do $$
declare
  src text := pg_get_functiondef('public.profile_card(uuid)'::regprocedure);
  out text;
begin
  out := replace(src,
    '''top_vouch_word'', p.top_vouch_word,',
    '''top_vouch_word'', p.top_vouch_word,
    ''interests'', coalesce((select jsonb_agg(jsonb_build_object(''key'', o.key, ''label'', o.label) order by o.sort)
                            from public.interest_options o where o.key = any(p.interests)), ''[]''::jsonb),
    ''ai_read'', (select c.result || jsonb_build_object(''created_at'', c.created_at) from public.ai_cache c
                 where c.scope = ''all'' and c.feature = ''profile_read'' and c.subject = p.id::text and c.expires_at > now()),');
  if out = src then raise exception 'profile_card patch did not apply'; end if;
  execute out;
end $$;
