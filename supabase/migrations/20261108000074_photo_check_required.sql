-- 1. Everyone passes the photo check before using the app (admins excepted, so someone can review).
--    The app shows a "finish your photo check" screen; the server blocks posting, messaging,
--    vouching, RSVPs, Outs, requests, plans and live video until it's approved.
-- 2. After you're verified, new profile photos wait for a reviewer before anyone sees them.
--    Reordering or removing photos you already have happens right away.

insert into public.app_config (key, value, description)
values ('photo_check_required', 'true', 'Everyone must pass the photo check before using the app.')
on conflict (key) do nothing;

create or replace function private.needs_photo_check(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select value #>> '{}' from public.app_config where key = 'photo_check_required'), 'false') = 'true'
     and coalesce((select p.photo_verified_at is null and p.role <> 'admin' from public.profiles p where p.id = p_user), false)
$$;

create or replace function private.block_if_restricted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and private.is_restricted(auth.uid()) then
    raise exception 'Your account is suspended right now.' using errcode = 'insufficient_privilege';
  end if;
  if auth.uid() is not null and private.needs_photo_check(auth.uid()) then
    raise exception 'Finish your photo check first.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- The app's start-up check also says whether the photo check is still needed, and where it stands.
create or replace function public.my_account_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'banned', p.banned_at is not null,
    'under_review', p.under_review,
    'suspended_until', case when p.suspended_until > now() then p.suspended_until end,
    'appeal_open', exists (select 1 from public.appeals a where a.user_id = p.id and a.status = 'open'),
    'needs_photo_check', private.needs_photo_check(p.id),
    'has_photo', p.avatar_url is not null,
    'photo_check', (select r.status from public.verification_requests r
                    where r.user_id = p.id and r.kind = 'photo' and r.status <> 'draft' order by r.created_at desc limit 1),
    'photo_check_note', (select r.review_note from public.verification_requests r
                         where r.user_id = p.id and r.kind = 'photo' and r.status = 'declined' order by r.created_at desc limit 1))
  from public.profiles p where p.id = auth.uid()
$$;

-- ── New photos wait for review ────────────────────────────────────────────
create table public.pending_photos (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  photo_urls  text[] not null check (cardinality(photo_urls) between 1 and 3),
  created_at  timestamptz not null default now()
);
alter table public.pending_photos enable row level security;
create policy pending_photos_read on public.pending_photos for select to authenticated using (user_id = auth.uid() or public.is_photo_reviewer());
revoke all on public.pending_photos from anon, authenticated;
grant select on public.pending_photos to authenticated;

drop function if exists public.set_profile_photos(text[]);
create function public.set_profile_photos(p_urls text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  urls text[] := (select coalesce(array_agg(u order by i), '{}') from unnest(coalesce(p_urls, '{}')) with ordinality x(u, i)
                  where nullif(trim(u), '') is not null);
  cur text[];
  verified boolean;
  u text;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if cardinality(urls) > 3 then raise exception 'Up to 3 profile photos.' using errcode = 'check_violation'; end if;
  foreach u in array urls loop
    if u not like '%/storage/v1/object/public/avatars/' || me::text || '/%' then
      raise exception 'Upload the photo first.' using errcode = 'check_violation';
    end if;
  end loop;
  select coalesce(photo_urls, '{}'), photo_verified_at is not null into cur, verified from public.profiles where id = me;
  -- Verified, with a photo nobody has checked yet: hold the new set for review.
  if verified and exists (select 1 from unnest(urls) n where not (n = any(cur))) then
    insert into public.pending_photos (user_id, photo_urls) values (me, urls)
    on conflict (user_id) do update set photo_urls = excluded.photo_urls, created_at = now();
    insert into public.notifications (user_id, kind, title, body, actor_id, link)
    select p.id, 'moderation', 'New photos to review', (select display_name from public.profiles where id = me), me,
           case when p.role = 'admin' then '/admin' else '/review' end
    from public.profiles p where (p.role = 'admin' or p.photo_reviewer) and p.id <> me and p.banned_at is null;
    return jsonb_build_object('photos', to_jsonb(cur), 'pending', to_jsonb(urls));
  end if;
  -- Only photos already checked: they show right away, and replace anything that was waiting.
  delete from public.pending_photos where user_id = me;
  update public.profiles set photo_urls = urls, avatar_url = urls[1] where id = me;
  return jsonb_build_object('photos', to_jsonb(urls), 'pending', null);
end $$;
revoke all on function public.set_profile_photos(text[]) from public, anon;
grant execute on function public.set_profile_photos(text[]) to authenticated;

create or replace function public.cancel_pending_photos() returns void
language sql security definer set search_path = '' as $$
  delete from public.pending_photos where user_id = auth.uid()
$$;
revoke all on function public.cancel_pending_photos() from public, anon;
grant execute on function public.cancel_pending_photos() to authenticated;

-- Verified members can't swap their main photo directly (old app versions); it goes through review.
create or replace function private.guard_verified_avatar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() = new.id and old.photo_verified_at is not null and new.avatar_url is not null
     and new.avatar_url is distinct from old.avatar_url and not (new.avatar_url = any(coalesce(old.photo_urls, '{}'))) then
    raise exception 'New photos are checked first. Add them in Edit photos.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_verified_avatar on public.profiles;
create trigger profiles_guard_verified_avatar before update of avatar_url on public.profiles
  for each row execute function private.guard_verified_avatar();

-- Reviewers: new photos next to the member's verified selfie.
create or replace function public.admin_pending_photos() returns table (
  user_id uuid, display_name text, current_photos text[], new_photos text[], selfie_path text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_photo_reviewer();
  return query
  select p.id, p.display_name, coalesce(p.photo_urls, '{}'), pp.photo_urls,
         (select r.selfie_path from public.verification_requests r where r.user_id = p.id and r.kind = 'photo' and r.status = 'approved'
          order by r.reviewed_at desc nulls last limit 1),
         pp.created_at
  from public.pending_photos pp join public.profiles p on p.id = pp.user_id
  where pp.user_id <> auth.uid()
  order by pp.created_at;
end $$;

create or replace function public.admin_review_photos(p_user uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare pp public.pending_photos;
begin
  perform private.require_photo_reviewer();
  if p_user = auth.uid() then raise exception 'You can''t review your own photos.' using errcode = 'insufficient_privilege'; end if;
  select * into pp from public.pending_photos where user_id = p_user;
  if pp.user_id is null then raise exception 'Those photos aren''t waiting anymore.' using errcode = 'check_violation'; end if;
  delete from public.pending_photos where user_id = p_user;
  if p_approve then
    update public.profiles set photo_urls = pp.photo_urls, avatar_url = pp.photo_urls[1] where id = p_user;
    perform private.notify(p_user, 'verification', 'Your new photos are up', 'They matched your photo check.', null, '/settings/photos');
  else
    perform private.notify(p_user, 'verification', 'Your new photos weren''t approved',
      coalesce(nullif(trim(p_note), ''), 'They didn''t match your photo check. Profile photos must be real photos of you.'), null, '/settings/photos');
  end if;
end $$;
revoke all on function public.admin_pending_photos() from public, anon;
revoke all on function public.admin_review_photos(uuid, boolean, text) from public, anon;
grant execute on function public.admin_pending_photos() to authenticated;
grant execute on function public.admin_review_photos(uuid, boolean, text) to authenticated;
