-- Photo reviewers: trusted helpers who can approve photo checks and nothing else.
-- Also tightens the photo check:
--   * the gesture expires after 10 minutes, so nobody can prepare a photo ahead of time
--   * a selfie sent from a web browser is flagged (a browser may let someone pick a saved photo)
--   * reviewers see every profile photo, not just the main one
--   * nobody reviews their own photo check

-- Members can't set this themselves: profile columns are only editable where granted, and this one isn't.
alter table public.profiles add column if not exists photo_reviewer boolean not null default false;
alter table public.verification_requests add column if not exists from_browser boolean not null default false;

create or replace function public.is_photo_reviewer() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or coalesce((select photo_reviewer from public.profiles where id = auth.uid() and banned_at is null), false)
$$;
revoke all on function public.is_photo_reviewer() from public, anon;
grant execute on function public.is_photo_reviewer() to authenticated;

create or replace function private.require_photo_reviewer() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_photo_reviewer() then raise exception 'Photo reviewers only.' using errcode = 'insufficient_privilege'; end if;
end $$;

-- Reviewers can open the selfies and see the requests.
drop policy if exists "admins read verification selfies" on storage.objects;
create policy "reviewers read verification selfies" on storage.objects for select to authenticated
  using (bucket_id = 'verifications' and (public.is_photo_reviewer() or (storage.foldername(name))[1] = auth.uid()::text));
drop policy if exists "own verification requests" on public.verification_requests;
create policy "own verification requests" on public.verification_requests for select to authenticated
  using (user_id = auth.uid() or public.is_photo_reviewer());

-- Submit: within 10 minutes of getting the gesture. Admins and reviewers are told.
drop function if exists public.submit_photo_verification(bigint, text);
create function public.submit_photo_verification(p_request bigint, p_path text, p_from_browser boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.verification_requests;
begin
  if split_part(p_path, '/', 1) <> me::text then raise exception 'Upload failed. Try again.' using errcode = 'check_violation'; end if;
  select * into r from public.verification_requests where id = p_request and user_id = me and kind = 'photo' and status = 'draft';
  if r.id is null then raise exception 'Start the photo check again.' using errcode = 'check_violation'; end if;
  if r.created_at < now() - interval '10 minutes' then
    raise exception 'That gesture expired. Start the photo check again for a new one.' using errcode = 'check_violation';
  end if;
  update public.verification_requests set selfie_path = p_path, status = 'pending', submitted_at = now(), from_browser = coalesce(p_from_browser, false)
  where id = r.id;
  insert into public.notifications (user_id, kind, title, body, actor_id, link)
  select p.id, 'moderation', 'Photo check to review', (select display_name from public.profiles where id = me), me,
         case when p.role = 'admin' then '/admin' else '/review' end
  from public.profiles p where (p.role = 'admin' or p.photo_reviewer) and p.id <> me and p.banned_at is null;
end $$;
revoke all on function public.submit_photo_verification(bigint, text, boolean) from public, anon;
grant execute on function public.submit_photo_verification(bigint, text, boolean) to authenticated;

-- The queue: every profile photo next to the selfie. Never your own.
drop function if exists public.admin_verifications();
create function public.admin_verifications()
returns table (id bigint, user_id uuid, display_name text, avatar_url text, photo_urls text[], kind text, gesture text, selfie_path text,
               submitted_at timestamptz, member_since timestamptz, vouch_count integer, from_browser boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_photo_reviewer();
  return query
  select r.id, p.id, p.display_name, p.avatar_url, coalesce(p.photo_urls, '{}'), r.kind, r.gesture, r.selfie_path, r.submitted_at, p.created_at, p.vouch_count, r.from_browser
  from public.verification_requests r join public.profiles p on p.id = r.user_id
  where r.status = 'pending' and r.user_id <> auth.uid()
  order by r.submitted_at;
end $$;
revoke all on function public.admin_verifications() from public, anon;
grant execute on function public.admin_verifications() to authenticated;

do $$
declare src text := pg_get_functiondef('public.admin_review_verification(bigint,boolean,text)'::regprocedure);
  a text := 'perform private.require_admin();';
  b text := $p$  if r.id is null then raise exception 'That request isn''t waiting for review.' using errcode = 'check_violation'; end if;$p$;
begin
  if position(a in src) = 0 or position(b in src) = 0 then raise exception 'reviewer patch: text not found'; end if;
  src := replace(src, a, 'perform private.require_photo_reviewer();');
  src := replace(src, b, b || $p$
  if r.user_id = auth.uid() then raise exception 'You can''t review your own photo check.' using errcode = 'insufficient_privilege'; end if;$p$);
  execute src;
end $$;

-- Admins add and remove reviewers.
create or replace function public.admin_set_photo_reviewer(p_email text, p_on boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare target uuid; name text;
begin
  perform private.require_admin();
  select u.id into target from auth.users u where lower(u.email) = lower(trim(p_email));
  if target is null then raise exception 'No member with that email.' using errcode = 'check_violation'; end if;
  update public.profiles set photo_reviewer = coalesce(p_on, false) where id = target returning display_name into name;
  if p_on then
    perform private.notify(target, 'moderation', 'You''re a photo reviewer', 'Thank you for helping. Photo checks to review are under Menu, Review photos.', null, '/review');
  end if;
  return name;
end $$;

create or replace function public.admin_photo_reviewers() returns table (id uuid, display_name text, email text, reviewed bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select p.id, p.display_name, u.email::text,
         (select count(*) from public.verification_requests r where r.reviewed_by = p.id)
  from public.profiles p join auth.users u on u.id = p.id
  where p.photo_reviewer order by p.display_name;
end $$;
revoke all on function public.admin_set_photo_reviewer(text, boolean) from public, anon;
revoke all on function public.admin_photo_reviewers() from public, anon;
grant execute on function public.admin_set_photo_reviewer(text, boolean) to authenticated;
grant execute on function public.admin_photo_reviewers() to authenticated;
