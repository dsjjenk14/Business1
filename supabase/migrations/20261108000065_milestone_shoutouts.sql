-- A shoutout from the official I'm In account when a member hits 1,000 vouches.
-- The member is asked first (it uses their name and photo); nothing is posted without a yes.
-- Set app_config.official_account_id to the official account's user id to turn posting on.
-- Until then, yeses wait in line and post automatically once it's set.

insert into public.app_config (key, value, description) values
  ('official_account_id', 'null', 'User id of the official I''m In account that posts shoutouts')
on conflict (key) do nothing;

create table public.shoutouts (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  milestone   int not null,
  status      text not null check (status in ('waiting', 'posted', 'declined')),
  pin_id      bigint references public.pins (id) on delete set null,
  created_at  timestamptz not null default now(),
  posted_at   timestamptz
);
alter table public.shoutouts enable row level security;
create policy shoutouts_own on public.shoutouts for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.shoutouts from anon, authenticated;
grant select on public.shoutouts to authenticated;

create or replace function private.official_account() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.profiles p
  where p.id::text = (select value #>> '{}' from public.app_config where key = 'official_account_id')
$$;

-- Post one waiting shoutout from the official account.
create or replace function private.post_shoutout(p_user uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  official uuid := private.official_account();
  who public.profiles;
  new_pin bigint;
begin
  if official is null then return null; end if;
  select * into who from public.profiles where id = p_user;
  if who.id is null then return null; end if;
  insert into public.pins (author_id, category, body, audience, city_id)
  values (official, 'thought',
          format('Shoutout to %s for hitting 1,000 vouches. One thousand people met %s and vouched for them. That’s real.',
                 who.display_name, split_part(who.display_name, ' ', 1)),
          'everyone', who.city_id)
  returning id into new_pin;
  update public.shoutouts set status = 'posted', pin_id = new_pin, posted_at = now() where user_id = p_user;
  perform private.notify(p_user, 'shoutout', 'I’m In gave you a shoutout', 'Your 1,000 vouches are on the official I’m In account.', official, '/pins/' || new_pin::text);
  return new_pin;
end $$;

-- The member's answer at their 1,000-vouch moment.
create or replace function public.answer_shoutout(p_yes boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if coalesce((select vouch_count from public.profiles where id = me), 0) < 1000 then
    raise exception 'Shoutouts are for 1,000 vouches.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.shoutouts where user_id = me and status = 'posted') then return 'posted'; end if;
  insert into public.shoutouts (user_id, milestone, status)
  values (me, 1000, case when coalesce(p_yes, false) then 'waiting' else 'declined' end)
  on conflict (user_id) do update set status = excluded.status, created_at = now();
  if coalesce(p_yes, false) and private.post_shoutout(me) is not null then return 'posted'; end if;
  return case when coalesce(p_yes, false) then 'waiting' else 'declined' end;
end $$;

-- Posts any shoutouts still waiting (runs on a schedule, so they go out once the official account is set).
create or replace function private.post_waiting_shoutouts() returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  if private.official_account() is null then return; end if;
  for u in select user_id from public.shoutouts where status = 'waiting' order by created_at loop
    perform private.post_shoutout(u);
  end loop;
end $$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('post-waiting-shoutouts', '*/15 * * * *', 'select private.post_waiting_shoutouts()');
exception when others then
  raise notice 'pg_cron not available; run private.post_waiting_shoutouts() another way (%).', sqlerrm;
end $$;

revoke all on function public.answer_shoutout(boolean) from public, anon;
grant execute on function public.answer_shoutout(boolean) to authenticated;

-- The official account gets an "Official" badge on its profile.
do $$
declare
  src text := pg_get_functiondef('public.profile_card(uuid)'::regprocedure);
  old text := $p$'mood', p.mood,$p$;
begin
  if position(old in src) = 0 then raise exception 'official patch: text not found in profile_card'; end if;
  execute replace(src, old, $p$'mood', p.mood, 'is_official', p.id = private.official_account(),$p$);
end $$;
