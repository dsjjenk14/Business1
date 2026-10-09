-- Safety suite. Nobody should be able to use I'm In to find someone.
--
--   1. Ghost mode: one switch hides you from everything that shows where you
--      are or that you're out (Tonight, rings, "out tonight", What's In
--      counts, going-out pins) until you turn it off.
--   2. Tonight map: other people are no longer placed on the map; it shows
--      you and events. (Only your own plan's spot is ever sent.)
--   3. Plans hide the venue by default for new members, and the automatic
--      "Going out tonight" pin only names the place if you chose to show it.
--   4. Delayed "I'm here": others see that you've arrived only after a delay
--      you pick (15 minutes by default; off, 15, 30 or 60).
--   5. Two vouches to see people out: to see plans, "here now" and going-out
--      pins from people who aren't your Insiders, you need 2 vouches (vouches
--      only come from meeting people in person). Your Insiders always see you.
--   6. Message limit: you can choose to only get new messages from people
--      with 2 vouches.

alter table public.user_settings
  add column if not exists ghost_mode boolean not null default false,
  add column if not exists here_delay_minutes smallint not null default 15,
  add column if not exists messages_need_vouches boolean not null default false;
alter table public.user_settings drop constraint if exists here_delay_choices;
alter table public.user_settings add constraint here_delay_choices check (here_delay_minutes in (0, 15, 30, 60));
alter table public.user_settings alter column show_going_out_venue set default false;

insert into public.app_config (key, value, description)
values ('safety_min_vouches', '2', 'Vouches needed to see people out who aren''t your Insiders, and to message people who require it.')
on conflict (key) do nothing;

-- Can the viewer see that this person is out (plans, "here now", going-out pins)?
create or replace function private.can_see_out(p_owner uuid, p_viewer uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner = p_viewer or (
    p_viewer is not null
    and not coalesce((select ghost_mode from public.user_settings where user_id = p_owner), false)
    and (private.are_connected(p_viewer, p_owner)
         or coalesce((select vouch_count from public.profiles where id = p_viewer), 0)
            >= coalesce(public.config_num('safety_min_vouches'), 2)))
$$;
revoke execute on function private.can_see_out(uuid, uuid) from public, anon, authenticated;

-- Plans (going out): the plan's audience, plus the rules above.
create or replace function private.can_see_plan(p_owner uuid, p_audience text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner = auth.uid()
    or (private.can_see_out(p_owner)
        and not private.post_hidden(p_owner, auth.uid()) and (
          p_audience = 'everyone'
          or (p_audience = 'circle' and private.are_connected(auth.uid(), p_owner))
          or (p_audience = 'network' and private.degree_between(auth.uid(), p_owner) in (1, 2))))
$$;

-- "Here now": the here audience, the rules above, and the arrival delay.
create or replace function private.can_see_here(p_post bigint, p_owner uuid, p_audience text, p_degree smallint)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner = auth.uid()
    or (private.can_see_out(p_owner)
        and not private.post_hidden(p_owner, auth.uid())
        and coalesce((select g.arrived_at from public.going_out_posts g where g.id = p_post), now())
            <= now() - make_interval(mins => coalesce((select s.here_delay_minutes from public.user_settings s where s.user_id = p_owner), 15))
        and (
          (p_audience = 'circle' and p_degree = 1)
          or (p_audience = 'network' and p_degree in (1, 2))
          or (p_audience = 'custom' and exists (select 1 from public.going_out_viewers v where v.post_id = p_post and v.user_id = auth.uid()))))
$$;

-- 6. Message limit.
create or replace function private.can_message(p_from uuid, p_to uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_from <> p_to
    and not private.is_blocked(p_from, p_to)
    and private.are_connected(p_from, p_to)
    and (
      exists (select 1 from public.connections
              where user_a = least(p_from, p_to) and user_b = greatest(p_from, p_to) and source = 'intro')
      or coalesce((select exchanges from public.interactions
                  where user_a = least(p_from, p_to) and user_b = greatest(p_from, p_to)), 0)
        >= coalesce(public.plan_limit(p_from, 'messaging_min_exchanges'), 0)
    )
    and (not coalesce((select messages_need_vouches from public.user_settings where user_id = p_to), false)
         or coalesce((select vouch_count from public.profiles where id = p_from), 0)
            >= coalesce(public.config_num('safety_min_vouches'), 2))
$$;

-- Patch the functions that read going-out data directly.
do $$
declare
  pairs text[][] := array[
    -- Going-out pins follow the same rules as plans.
    array['private.can_see_pin(bigint,uuid)',
          'and (p.hidden_at is null or p.author_id = p_viewer)',
          'and (p.hidden_at is null or p.author_id = p_viewer)
      and (p.category <> ''going_out'' or private.can_see_out(p.author_id, p_viewer))'],
    -- Ghost mode also hides "in a virtual event".
    array['public.people_status(uuid[])',
          'when (p.id = (select id from me) or private.are_connected((select id from me), p.id))',
          'when (p.id = (select id from me) or (private.are_connected((select id from me), p.id) and private.can_see_out(p.id)))'],
    -- "Out tonight" on your Insiders list.
    array['public.circle_overview()',
          'exists (select 1 from public.going_out_posts g where g.user_id = p.id and g.when_kind = ''tonight'' and g.expires_at > now())',
          'exists (select 1 from public.going_out_posts g where g.user_id = p.id and g.when_kind = ''tonight'' and g.expires_at > now() and private.can_see_plan(g.user_id, g.audience))'],
    -- "Going out" in your Insiders' activity.
    array['public.network_activity(integer)',
          'where g.user_id in (select id from circle) and g.when_kind = ''tonight'' and g.expires_at > now()',
          'where g.user_id in (select id from circle) and g.when_kind = ''tonight'' and g.expires_at > now() and private.can_see_plan(g.user_id, g.audience)'],
    -- What's In counts leave out people in ghost mode.
    array['public.whats_in(double precision,double precision,double precision)',
          'and s.show_going_out_venue and not private.is_blocked(auth.uid(), g.user_id)',
          'and s.show_going_out_venue and not s.ghost_mode and not private.is_blocked(auth.uid(), g.user_id)'],
    -- The map: only your own plan's spot is sent.
    array['public.going_out_feed(text,double precision,double precision,numeric)',
          '''lat'', extensions.st_y(g.approx_location::extensions.geometry), ''lng'', extensions.st_x(g.approx_location::extensions.geometry)',
          '''lat'', case when g.user_id = auth.uid() then extensions.st_y(g.approx_location::extensions.geometry) end, ''lng'', case when g.user_id = auth.uid() then extensions.st_x(g.approx_location::extensions.geometry) end'],
    -- The automatic going-out pin names the place only if you show it.
    array['public.post_going_out(public.going_out_when,timestamp with time zone,bigint,text,text[],text,double precision,double precision)',
          '|| coalesce('' · '' || place, '''') || ''. Come find me.'')',
          '|| coalesce('' · '' || case when coalesce((select s.show_going_out_venue from public.user_settings s where s.user_id = me), false) then place end, '''') || ''.'')'],
    array['public.post_going_out(public.going_out_when,timestamp with time zone,bigint,text,text[],text,double precision,double precision)',
          'loc, place, p_venue_id, post_id);',
          'loc, case when coalesce((select s.show_going_out_venue from public.user_settings s where s.user_id = me), false) then place end,
          case when coalesce((select s.show_going_out_venue from public.user_settings s where s.user_id = me), false) then p_venue_id end, post_id);']
  ];
  i int;
  src text;
begin
  for i in 1 .. array_length(pairs, 1) loop
    src := pg_get_functiondef(pairs[i][1]::regprocedure);
    if position(pairs[i][2] in src) = 0 then
      raise exception 'safety patch %: text not found in %', i, pairs[i][1];
    end if;
    execute replace(src, pairs[i][2], pairs[i][3]);
  end loop;
end $$;
