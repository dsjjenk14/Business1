-- Home, simplified (Dominique): your friends' pins, the likes and replies
-- people sent you, your group events, and events your friends are hosting.
-- That's it. Same function name and arguments, new contents.
create or replace function public.home_feed(p_scope text default 'friends', p_lat double precision default null, p_lng double precision default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with friends as (
    -- Your circle, plus people you follow.
    select f as id from private.first_degree_ids(auth.uid()) f
    union select followee_id from public.follows where follower_id = auth.uid()),
  my_groups as (select group_id from public.group_members where user_id = auth.uid()),
  event_rows as (
    select ev.id, ev.title, ev.emoji, ev.starts_at, ev.group_id, ev.host_id, ev.capacity,
           coalesce(v.name, ev.place_text) as place, g.name as group_name, h.display_name as host_name, h.avatar_url as host_avatar,
           (select count(*) from public.event_rsvps r where r.event_id = ev.id)::int as going_count,
           (select count(*) from public.event_rsvps r where r.event_id = ev.id and r.user_id in (select private.first_degree_ids(auth.uid())))::int as friends_going,
           exists (select 1 from public.event_rsvps r where r.event_id = ev.id and r.user_id = auth.uid()) as i_am_going
    from public.events ev
    left join public.venues v on v.id = ev.venue_id
    left join public.groups g on g.id = ev.group_id
    join public.profiles h on h.id = ev.host_id
    where coalesce(ev.ends_at, ev.starts_at + interval '3 hours') > now()
      and ev.starts_at < now() + interval '30 days'
      and not private.is_blocked(auth.uid(), ev.host_id)
      and (ev.group_id is null or ev.group_id in (select group_id from my_groups)))
  select jsonb_build_object(
    'friend_count', (select count(*) from friends),
    -- 1. Your friends' pins (not yours, not strangers').
    'pins', coalesce((
      select jsonb_agg(to_jsonb(f))
      from public.pins_feed('friends', p_lat, p_lng, null, null, null, null, null, 40) f
      where f.author_id in (select id from friends)), '[]'::jsonb),
    -- 2. Likes and replies people sent you (last 14 days).
    'activity', coalesce((
      select jsonb_agg(a order by a->>'at' desc) from (select a from (
        -- Likes: one line per pin ("Hana, Isaiah and 6 others liked your pin").
        select jsonb_build_object('kind', 'like', 'actor_id', (array_agg(u.id order by l.created_at desc))[1],
                 'actor_name', (array_agg(u.display_name order by l.created_at desc))[1],
                 'actor_avatar', (array_agg(u.avatar_url order by l.created_at desc))[1],
                 'second_name', (array_agg(u.display_name order by l.created_at desc))[2],
                 'count', count(*), 'pin_id', p.id, 'pin_body', left(p.body, 80), 'text', null, 'at', max(l.created_at)) as a
        from public.pin_likes l
        join public.pins p on p.id = l.pin_id and p.author_id = auth.uid() and p.deleted_at is null
        join public.profiles u on u.id = l.user_id
        where l.user_id <> auth.uid() and l.created_at > now() - interval '14 days' and not private.is_blocked(auth.uid(), l.user_id)
        group by p.id, p.body
        union all
        select jsonb_build_object('kind', 'reply', 'actor_id', u.id, 'actor_name', u.display_name, 'actor_avatar', u.avatar_url,
                 'second_name', null, 'count', 1, 'pin_id', p.id, 'pin_body', left(p.body, 80), 'text', left(r.body, 140), 'at', r.created_at)
        from public.pin_replies r
        join public.pins p on p.id = r.pin_id and p.author_id = auth.uid() and p.deleted_at is null
        join public.profiles u on u.id = r.author_id
        where r.author_id <> auth.uid() and r.deleted_at is null and r.hidden_at is null
          and r.created_at > now() - interval '14 days' and not private.is_blocked(auth.uid(), r.author_id)
        ) u order by a->>'at' desc limit 8) s), '[]'::jsonb),
    -- 3. Events in groups you're in.
    'group_events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.starts_at)
      from (select * from event_rows where group_id in (select group_id from my_groups) order by starts_at limit 6) e), '[]'::jsonb),
    -- 4. Events your friends are hosting (not already shown as a group event).
    'friends_hosting', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.starts_at)
      from (select * from event_rows
            where host_id in (select private.first_degree_ids(auth.uid()))
              and (group_id is null or group_id not in (select group_id from my_groups))
            order by starts_at limit 6) e), '[]'::jsonb)
  )
$$;
