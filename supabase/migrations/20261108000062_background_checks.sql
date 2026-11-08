-- Background checks. A member chooses to get checked and agrees to it first.
-- They pay a one-time fee, or it's free once they've had Premium for 30 days.
-- Only the result "clear" is ever shown to others, as a "Background checked" tag.
-- Nothing else about the check (what was found, when it failed) is shown to anyone.
-- Off until an outside background-check company is set up (background_check_enabled).

insert into public.app_config (key, value, description) values
  ('background_check_enabled', 'false', 'Turn on once a background-check company is connected'),
  ('background_check_price_cents', '1999', 'One-time price for a background check, in cents'),
  ('background_check_premium_days', '30', 'Days of Premium before a background check is free'),
  ('background_check_valid_days', '365', 'How long the Background checked tag lasts')
on conflict (key) do nothing;

-- When Premium started, so "free after 30 days of Premium" can be checked.
alter table public.entitlements add column if not exists premium_since timestamptz;
update public.entitlements set premium_since = updated_at where premium_until > now() and premium_since is null;

create or replace function private.entitlements_premium_since() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.premium_until is not null and new.premium_until > now() then
    if tg_op = 'INSERT' or old.premium_until is null or old.premium_until <= now() then
      new.premium_since := now();
    else
      new.premium_since := coalesce(old.premium_since, now());
    end if;
  else
    new.premium_since := null;
  end if;
  return new;
end $$;

drop trigger if exists entitlements_premium_since on public.entitlements;
create trigger entitlements_premium_since before insert or update of premium_until on public.entitlements
  for each row execute function private.entitlements_premium_since();

create type public.background_check_status as enum ('awaiting_payment', 'pending', 'clear', 'not_clear', 'cancelled');

create table public.background_checks (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  status        public.background_check_status not null,
  paid_with     text not null check (paid_with in ('payment', 'premium', 'admin')),
  consented_at  timestamptz not null default now(),
  provider      text,
  provider_ref  text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index background_checks_user_idx on public.background_checks (user_id, created_at desc);
alter table public.background_checks enable row level security;
create policy background_checks_own on public.background_checks for select to authenticated using (user_id = auth.uid());
revoke all on public.background_checks from anon, authenticated;
grant select on public.background_checks to authenticated;

-- Set only by the server when a check comes back clear. Members can't edit it.
alter table public.profiles add column if not exists background_checked_at timestamptz;

create or replace function private.background_checked(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.background_checked_at > now() - make_interval(days => coalesce((select (value #>> '{}')::int from public.app_config where key = 'background_check_valid_days'), 365))
    from public.profiles p where p.id = p_user), false)
$$;

create or replace function private.background_check_free(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select e.premium_until > now()
       and e.premium_since <= now() - make_interval(days => coalesce((select (value #>> '{}')::int from public.app_config where key = 'background_check_premium_days'), 30))
    from public.entitlements e where e.user_id = p_user), false)
$$;

-- Everything the Background check screen needs.
create or replace function public.background_check_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  days int := coalesce((select (value #>> '{}')::int from public.app_config where key = 'background_check_premium_days'), 30);
  since timestamptz;
  latest public.background_checks;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  select e.premium_since into since from public.entitlements e where e.user_id = me and e.premium_until > now();
  select * into latest from public.background_checks where user_id = me order by created_at desc limit 1;
  return jsonb_build_object(
    'enabled', coalesce((select (value #>> '{}')::boolean from public.app_config where key = 'background_check_enabled'), false),
    'price_cents', coalesce((select (value #>> '{}')::int from public.app_config where key = 'background_check_price_cents'), 1999),
    'premium_days', days,
    'is_premium', since is not null,
    'free', private.background_check_free(me),
    'free_on', case when since is not null then since + make_interval(days => days) end,
    'checked', private.background_checked(me),
    'checked_at', (select background_checked_at from public.profiles where id = me),
    'latest_status', latest.status,
    'latest_at', latest.created_at
  );
end $$;

-- Start a check. The member must agree first. Free for long-time Premium, otherwise it waits for payment.
create or replace function public.start_background_check(p_consent boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  free boolean;
  new_id bigint;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if not coalesce((select (value #>> '{}')::boolean from public.app_config where key = 'background_check_enabled'), false) then
    raise exception 'Background checks are coming soon.' using errcode = 'check_violation';
  end if;
  if not coalesce(p_consent, false) then
    raise exception 'Please agree to the background check first.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.background_checks where user_id = me and status = 'pending') then
    raise exception 'Your background check is already in progress.' using errcode = 'check_violation';
  end if;
  if private.background_checked(me) then
    raise exception 'You''re already background checked.' using errcode = 'check_violation';
  end if;
  -- A check left waiting for payment is replaced by the new one.
  update public.background_checks set status = 'cancelled', completed_at = now() where user_id = me and status = 'awaiting_payment';
  free := private.background_check_free(me);
  insert into public.background_checks (user_id, status, paid_with)
  values (me, case when free then 'pending' else 'awaiting_payment' end::public.background_check_status, case when free then 'premium' else 'payment' end)
  returning id into new_id;
  return jsonb_build_object('check_id', new_id, 'needs_payment', not free);
end $$;

-- Called by the payment webhook once the fee is paid.
create or replace function public.background_check_paid(p_check bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.background_checks set status = 'pending' where id = p_check and status = 'awaiting_payment';
end $$;

-- Called with the result: by the background-check company's webhook, or by an admin.
create or replace function public.background_check_result(p_check bigint, p_clear boolean, p_provider text default null, p_provider_ref text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  -- Admins, or the server itself (service role). Not current_user: inside this function it is always the owner.
  if not (public.is_admin() or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role') then
    raise exception 'Admins only.' using errcode = 'insufficient_privilege';
  end if;
  update public.background_checks
     set status = case when p_clear then 'clear' else 'not_clear' end::public.background_check_status,
         completed_at = now(),
         provider = coalesce(p_provider, provider),
         provider_ref = coalesce(p_provider_ref, provider_ref)
   where id = p_check and status = 'pending'
  returning user_id into uid;
  if uid is null then raise exception 'That check isn''t waiting for a result.' using errcode = 'check_violation'; end if;
  if p_clear then
    update public.profiles set background_checked_at = now() where id = uid;
    perform private.notify(uid, 'background_check', 'You''re background checked', 'Your profile now shows the Background checked tag.', null, '/profile');
  else
    perform private.notify(uid, 'background_check', 'Your background check is done', 'We couldn''t add the tag. Only you can see this. Tap for details.', null, '/safety/background-check');
  end if;
end $$;

revoke all on function public.background_check_status() from public, anon;
revoke all on function public.start_background_check(boolean) from public, anon;
revoke all on function public.background_check_paid(bigint) from public, anon, authenticated;
revoke all on function public.background_check_result(bigint, boolean, text, text) from public, anon;
grant execute on function public.background_check_status() to authenticated;
grant execute on function public.start_background_check(boolean) to authenticated;
grant execute on function public.background_check_paid(bigint) to service_role;
grant execute on function public.background_check_result(bigint, boolean, text, text) to authenticated, service_role;

-- The tag on profiles.
do $$
declare
  src text := pg_get_functiondef('public.profile_card(uuid)'::regprocedure);
  old text := $p$'mood', p.mood,$p$;
begin
  if position(old in src) = 0 then raise exception 'background check patch: text not found in profile_card'; end if;
  execute replace(src, old, $p$'mood', p.mood, 'background_checked', private.background_checked(p.id),$p$);
end $$;
