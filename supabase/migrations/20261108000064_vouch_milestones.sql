-- Vouch milestones: 10, 30, 75, 100, 300, 500, 1000. No names, just the number.
-- Each one is a bigger moment in the app. From 100 on, your Insiders hear about it,
-- and 1000 vouches makes you famous on I'm In (a star by your name, a spot on Home).

-- The milestone ladder replaces the old named levels.
delete from public.vouch_tiers;
insert into public.vouch_tiers (name, min_vouches, emoji) values
  ('10 vouches', 10, 'medal'),
  ('30 vouches', 30, 'medal'),
  ('75 vouches', 75, 'medal'),
  ('100 vouches', 100, 'crown'),
  ('300 vouches', 300, 'crown'),
  ('500 vouches', 500, 'crown'),
  ('1000 vouches', 1000, 'star');

create or replace function private.milestone_for(p_count int) returns int
language sql immutable set search_path = '' as $$
  select coalesce(max(m), 0) from unnest(array[10, 30, 75, 100, 300, 500, 1000]) m where m <= coalesce(p_count, 0)
$$;

-- The biggest milestone you've already celebrated in the app. Existing members start
-- at what they've already reached, so nobody gets a pile of old celebrations at once.
alter table public.profiles add column if not exists milestone_celebrated int not null default 0;
update public.profiles set milestone_celebrated = private.milestone_for(vouch_count);

-- When your vouch count passes a milestone: tell you, and from 100 on, tell your Insiders.
create or replace function private.on_vouch_milestone() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m int := private.milestone_for(new.vouch_count);
  first text := split_part(new.display_name, ' ', 1);
  friend uuid;
begin
  if m = 0 or m <= private.milestone_for(old.vouch_count) then return new; end if;
  perform private.notify(new.id, 'milestone',
    case when m >= 1000 then 'You''re famous on I''m In' else format('You hit %s vouches', m) end,
    case when m >= 1000 then '1,000 people vouched for you. Your star is on your profile now.' else format('%s people vouched for you. Open the app to see it.', m) end,
    null, '/profile');
  if m >= 100 then
    for friend in
      select case when c.user_a = new.id then c.user_b else c.user_a end
      from public.connections c
      where (c.user_a = new.id or c.user_b = new.id)
    loop
      if not private.is_blocked(friend, new.id) then
        perform private.notify(friend, 'milestone_friend', format('%s hit %s vouches', first, m), 'Send them some love.', new.id, '/people/' || new.id::text);
      end if;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists profiles_vouch_milestone on public.profiles;
create trigger profiles_vouch_milestone after update of vouch_count on public.profiles
  for each row when (new.vouch_count > old.vouch_count) execute function private.on_vouch_milestone();

-- A milestone you've reached but not seen celebrated yet (0 if none).
create or replace function public.my_pending_milestone() returns int
language sql stable security definer set search_path = '' as $$
  select case when private.milestone_for(p.vouch_count) > p.milestone_celebrated then private.milestone_for(p.vouch_count) else 0 end
  from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.celebrate_milestone(p_milestone int) returns void
language sql security definer set search_path = '' as $$
  update public.profiles
     set milestone_celebrated = greatest(milestone_celebrated, least(coalesce(p_milestone, 0), private.milestone_for(vouch_count)))
   where id = auth.uid()
$$;

-- Famous on I'm In: members with 1000+ vouches, for the row on Home.
create or replace function public.famous_members() returns table (id uuid, display_name text, avatar_url text, vouch_count int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.avatar_url, public.visible_vouch_count(p.id)
  from public.profiles p
  where public.visible_vouch_count(p.id) >= 1000
    and p.id <> auth.uid()
    and not private.is_blocked(auth.uid(), p.id)
  order by public.visible_vouch_count(p.id) desc
  limit 12
$$;

revoke all on function public.my_pending_milestone() from public, anon;
revoke all on function public.celebrate_milestone(int) from public, anon;
revoke all on function public.famous_members() from public, anon;
grant execute on function public.my_pending_milestone() to authenticated;
grant execute on function public.celebrate_milestone(int) to authenticated;
grant execute on function public.famous_members() to authenticated;
