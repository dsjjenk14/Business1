-- Second feedback round: profile prompts, photo check for dates, reporting a
-- date, 1 vouch to start (verified hosts count double), event photos,
-- groups near you, group stats, Claim your place, and contacts on the app.

-- ── Profile prompts ────────────────────────────────────────────────────────
-- Pick up to 3. Prompts never ask for a place, so profiles never say where
-- someone tends to be.
alter table public.profiles add column if not exists prompts jsonb not null default '[]'::jsonb;

create or replace function public.set_profile_prompts(p_prompts jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  allowed text[] := array['ideal_friday', 'ask_me_about', 'go_to_order', 'friend_who', 'perfect_sunday',
                          'green_flag', 'hype_song', 'learning', 'never_miss', 'two_truths'];
  clean jsonb := '[]'::jsonb;
  item jsonb;
  ans text;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(coalesce(p_prompts, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_prompts, '[]'::jsonb)) > 3 then
    raise exception 'Pick up to 3 prompts.' using errcode = 'check_violation';
  end if;
  for item in select * from jsonb_array_elements(coalesce(p_prompts, '[]'::jsonb)) loop
    ans := trim(coalesce(item->>'answer', ''));
    if not (item->>'key') = any(allowed) then
      raise exception 'Pick prompts from the list.' using errcode = 'check_violation';
    end if;
    if char_length(ans) < 1 or char_length(ans) > 150 then
      raise exception 'Answers are 1 to 150 characters.' using errcode = 'check_violation';
    end if;
    if clean @> jsonb_build_array(jsonb_build_object('key', item->>'key')) then
      raise exception 'Use each prompt once.' using errcode = 'check_violation';
    end if;
    clean := clean || jsonb_build_array(jsonb_build_object('key', item->>'key', 'answer', ans));
  end loop;
  update public.profiles set prompts = clean where id = auth.uid();
end $$;
revoke execute on function public.set_profile_prompts(jsonb) from public, anon;
grant execute on function public.set_profile_prompts(jsonb) to authenticated;

-- ── Ask on a Date needs a photo check ──────────────────────────────────────
create or replace function private.require_photo_check() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and photo_verified_at is not null) then
    raise exception 'Verify your photo first. It keeps dates safe for everyone. Settings, Verification.' using errcode = 'check_violation';
  end if;
end $$;

do $$
declare
  fns text[] := array['public.send_date_request(uuid,date_when,timestamp with time zone,text,bigint,text,text)',
                      'public.counter_date_request(bigint,date_when,timestamp with time zone,text,bigint,text,text)'];
  f text;
  src text;
begin
  foreach f in array fns loop
    src := pg_get_functiondef(f::regprocedure);
    if position(E'\nbegin\n' in src) = 0 then raise exception 'photo check: no begin in %', f; end if;
    execute regexp_replace(src, E'\nbegin\n', E'\nbegin\n  perform private.require_photo_check();\n');
  end loop;
  -- Saying yes to a date needs one too.
  src := pg_get_functiondef('public.respond_date_request(bigint,boolean)'::regprocedure);
  if position(E'\nbegin\n' in src) = 0 then raise exception 'photo check: no begin in respond_date_request'; end if;
  execute regexp_replace(src, E'\nbegin\n', E'\nbegin\n  if p_accept then perform private.require_photo_check(); end if;\n');
end $$;

-- ── Report a whole date ────────────────────────────────────────────────────
alter table public.reports add column if not exists date_request_id bigint references public.date_requests (id) on delete set null;

-- Report what happened on a date with someone: the person, and the date if
-- there was a request. Needs a date request or Date Mode session between you.
create or replace function public.report_date(p_other uuid, p_reason public.report_reason, p_details text default null, p_date bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); new_id bigint;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if p_date is not null and not exists (select 1 from public.date_requests where id = p_date and me in (from_id, to_id) and p_other in (from_id, to_id)) then
    raise exception 'That date isn''t yours to report.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.date_requests where me in (from_id, to_id) and p_other in (from_id, to_id))
     and not exists (select 1 from public.date_sessions where me in (initiator_id, partner_id) and p_other in (initiator_id, partner_id)) then
    raise exception 'You can report a date with someone you asked out or went on Date Mode with.' using errcode = 'check_violation';
  end if;
  insert into public.reports (reporter_id, reported_user_id, reason, details, date_request_id)
  values (me, p_other, p_reason, left('[Date] ' || coalesce(trim(p_details), ''), 2000), p_date)
  returning id into new_id;
  return new_id;
end $$;
revoke execute on function public.report_date(uuid, public.report_reason, text, bigint) from public, anon;
grant execute on function public.report_date(uuid, public.report_reason, text, bigint) to authenticated;

-- ── 1 vouch to start; verified hosts count double ──────────────────────────
update public.app_config set value = '1' where key = 'safety_min_vouches';
alter table public.profiles add column if not exists verified_host boolean not null default false;

-- Trust points for the safety rules: each vouch is 1, a vouch from a
-- verified host is 2. Vouch counts on profiles still show real vouches.
create or replace function private.trust_points(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when h.verified_host then 2 else 1 end), 0)::int
  from public.vouches v join public.profiles h on h.id = v.voucher_id
  where v.vouchee_id = p_user and v.status = 'active'
$$;

create or replace function public.admin_set_verified_host(p_email text, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if not public.is_admin() then raise exception 'Admins only.' using errcode = 'insufficient_privilege'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'No member has that email.' using errcode = 'check_violation'; end if;
  update public.profiles set verified_host = coalesce(p_on, false) where id = uid;
  if coalesce(p_on, false) then
    perform private.notify(uid, 'verified_host', 'You''re a verified host', 'Your vouches now count double. Thanks for bringing people together.', null, '/profile');
  end if;
end $$;
revoke execute on function public.admin_set_verified_host(text, boolean) from public, anon;
grant execute on function public.admin_set_verified_host(text, boolean) to authenticated;

-- ── Event photos ───────────────────────────────────────────────────────────
-- A photo post can be tied to an event only by its host or someone who went.
-- (Shared events and recaps carry an event too; they have their own rules.)
create or replace function private.pin_event_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.event_id is not null and new.category = 'photos' and not exists (
       select 1 from public.events e where e.id = new.event_id and e.host_id = new.author_id)
     and not exists (select 1 from public.event_rsvps r where r.event_id = new.event_id and r.user_id = new.author_id) then
    raise exception 'You can post photos to events you went to.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists pins_event_check on public.pins;
create trigger pins_event_check before insert or update of event_id on public.pins
  for each row execute function private.pin_event_check();

-- Photos people posted from an event, for its recap gallery.
create or replace function public.event_photos(p_event bigint)
returns table (pin_id bigint, path text, author_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, ph.storage_path, a.display_name, p.created_at
  from public.pins p
  join public.pin_photos ph on ph.pin_id = p.id
  join public.profiles a on a.id = p.author_id
  where p.event_id = p_event and p.deleted_at is null and private.can_see_pin(p.id, auth.uid())
  order by p.created_at, ph.position
  limit 60
$$;
revoke execute on function public.event_photos(bigint) from public, anon;
grant execute on function public.event_photos(bigint) to authenticated;

-- ── Groups near you, Beginner friendly, and stats for owners ───────────────
alter table public.groups add column if not exists beginner_friendly boolean not null default false;

create or replace function public.set_group_beginner_friendly(p_group bigint, p_on boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_group(p_group) then
    raise exception 'Only the owner and co-hosts can change this.' using errcode = 'insufficient_privilege';
  end if;
  update public.groups set beginner_friendly = coalesce(p_on, false) where id = p_group;
end $$;
revoke execute on function public.set_group_beginner_friendly(bigint, boolean) from public, anon;
grant execute on function public.set_group_beginner_friendly(bigint, boolean) to authenticated;

-- Groups in the DC area by category: your own city's first, then Beginner
-- friendly, then the biggest. (Cities here are close together, so nothing is
-- left out for living in Fairfax instead of DC.)
create or replace function public.groups_near_you(p_category text default null)
returns table (id bigint, name text, emoji text, category text, description text, schedule_label text,
               join_type public.join_type, beginner_friendly boolean, member_count int, insiders_in int, is_member boolean)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, g.emoji, g.category, g.description, g.schedule_label, g.join_type, g.beginner_friendly,
         (select count(*)::int from public.group_members m where m.group_id = g.id),
         (select count(*)::int from public.group_members m where m.group_id = g.id and private.are_connected(auth.uid(), m.user_id)),
         exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = auth.uid())
  from public.groups g
  where (p_category is null or g.category = p_category)
    and not private.is_blocked(auth.uid(), g.owner_id)
  order by g.category,
           (g.city_id is not distinct from (select city_id from public.profiles where id = auth.uid())) desc,
           g.beginner_friendly desc, (select count(*) from public.group_members m where m.group_id = g.id) desc
  limit 100
$$;
revoke execute on function public.groups_near_you(text) from public, anon;
grant execute on function public.groups_near_you(text) to authenticated;

create or replace function public.group_stats(p_group bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ev public.events;
begin
  if not private.can_manage_group(p_group) then
    raise exception 'Only the owner and co-hosts see group stats.' using errcode = 'insufficient_privilege';
  end if;
  select * into ev from public.events where group_id = p_group and starts_at > now() order by starts_at limit 1;
  return jsonb_build_object(
    'members', (select count(*) from public.group_members where group_id = p_group),
    'new_this_week', (select count(*) from public.group_members where group_id = p_group and joined_at > now() - interval '7 days'),
    'new_names', coalesce((select jsonb_agg(p.display_name order by m.joined_at desc) from public.group_members m
                            join public.profiles p on p.id = m.user_id
                           where m.group_id = p_group and m.joined_at > now() - interval '7 days'), '[]'::jsonb),
    'next_event', case when ev.id is null then null else jsonb_build_object(
      'id', ev.id, 'title', ev.title, 'starts_at', ev.starts_at,
      'going', coalesce((select jsonb_agg(p.display_name order by r.created_at) from public.event_rsvps r
                          join public.profiles p on p.id = r.user_id where r.event_id = ev.id), '[]'::jsonb)) end
  );
end $$;
revoke execute on function public.group_stats(bigint) from public, anon;
grant execute on function public.group_stats(bigint) to authenticated;

-- ── Claim your place ───────────────────────────────────────────────────────
-- A business claims its place, the admin checks it's really theirs (one tap),
-- then the business starts its subscription: $49/month, with 3 free months
-- for the first 10 places. While it's paid, the place is a partner: perk,
-- Featured label and a special every day.
insert into public.app_config (key, value, description) values
  ('place_price_cents', '4900', 'Claim your place: monthly price in cents.'),
  ('place_free_spots', '10', 'How many places get free months when approved.'),
  ('place_free_months', '3', 'Free months for those first places.')
on conflict (key) do nothing;

create table if not exists public.venue_claims (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  venue_id bigint references public.venues (id) on delete set null,
  business_name text not null check (char_length(business_name) between 2 and 80),
  address text check (char_length(address) <= 200),
  contact_name text not null check (char_length(contact_name) between 2 and 80),
  phone text check (char_length(phone) <= 30),
  perk text not null check (char_length(perk) between 2 and 80),
  perk_details text check (char_length(perk_details) <= 400),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'active', 'canceled')),
  free_months int not null default 0,
  stripe_subscription_id text,
  placement_id bigint references public.venue_placements (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.venue_claims enable row level security;
drop policy if exists "own claims" on public.venue_claims;
create policy "own claims" on public.venue_claims for select using (user_id = auth.uid() or public.is_admin());

create or replace function public.claim_place(p_venue bigint, p_business text, p_address text, p_contact text, p_phone text, p_perk text, p_perk_details text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare new_id bigint;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.venue_claims where user_id = auth.uid() and status = 'pending') then
    raise exception 'You already have a claim waiting. We''ll be in touch soon.' using errcode = 'check_violation';
  end if;
  insert into public.venue_claims (user_id, venue_id, business_name, address, contact_name, phone, perk, perk_details)
  values (auth.uid(), p_venue, trim(p_business), nullif(trim(coalesce(p_address, '')), ''), trim(p_contact),
          nullif(trim(coalesce(p_phone, '')), ''), trim(p_perk), nullif(trim(coalesce(p_perk_details, '')), ''))
  returning id into new_id;
  perform private.notify(p.id, 'place_claim', trim(p_business) || ' wants to claim their place', 'Check it and approve it in Admin, Places.', auth.uid(), '/admin')
  from public.profiles p where p.role = 'admin';
  return new_id;
end $$;
revoke execute on function public.claim_place(bigint, text, text, text, text, text, text) from public, anon;
grant execute on function public.claim_place(bigint, text, text, text, text, text, text) to authenticated;

-- The admin approves (picking the venue if it wasn't listed) or turns it down.
create or replace function public.admin_review_claim(p_claim bigint, p_approve boolean, p_venue bigint default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.venue_claims; free int := 0;
begin
  if not public.is_admin() then raise exception 'Admins only.' using errcode = 'insufficient_privilege'; end if;
  select * into c from public.venue_claims where id = p_claim and status = 'pending';
  if c.id is null then raise exception 'That claim isn''t waiting.' using errcode = 'check_violation'; end if;
  if not coalesce(p_approve, false) then
    update public.venue_claims set status = 'rejected', reviewed_at = now() where id = c.id;
    perform private.notify(c.user_id, 'place_claim', 'We couldn''t confirm ' || c.business_name, 'Reply to our email or contact support and we''ll sort it out.', null, '/places/claim');
    return;
  end if;
  if coalesce(p_venue, c.venue_id) is null then raise exception 'Pick the place first (add it in Places if it isn''t listed).' using errcode = 'check_violation'; end if;
  if (select count(*) from public.venue_claims where free_months > 0) < public.config_num('place_free_spots') then
    free := public.config_num('place_free_months')::int;
  end if;
  update public.venue_claims set status = 'approved', venue_id = coalesce(p_venue, c.venue_id), free_months = free, reviewed_at = now() where id = c.id;
  insert into public.venue_managers (venue_id, user_id) values (coalesce(p_venue, c.venue_id), c.user_id) on conflict do nothing;
  perform private.notify(c.user_id, 'place_claim', c.business_name || ' is approved',
    case when free > 0 then 'Start your ' || free || ' free months. Add a card now; you''re not charged until they end.'
         else 'Start your partnership to go live.' end, null, '/places/claim');
end $$;
revoke execute on function public.admin_review_claim(bigint, boolean, bigint) from public, anon;
grant execute on function public.admin_review_claim(bigint, boolean, bigint) to authenticated;

-- Stripe confirmed the subscription: the place goes live as a partner.
create or replace function public.place_claim_activate(p_claim bigint, p_subscription text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.venue_claims; pid bigint;
begin
  select * into c from public.venue_claims where id = p_claim;
  if c.id is null or c.status not in ('approved', 'active') then return; end if;
  if c.status = 'active' then return; end if; -- a retried webhook
  insert into public.venue_placements (venue_id, kind, perk, perk_details, starts_at, ends_at, created_by)
  values (c.venue_id, 'featured', c.perk, coalesce(c.perk_details, ''), now(), now() + interval '100 years', c.user_id)
  returning id into pid;
  update public.venue_claims set status = 'active', stripe_subscription_id = p_subscription, placement_id = pid where id = c.id;
  perform private.notify(c.user_id, 'place_claim', c.business_name || ' is live on I''m In', 'Post tonight''s special from your place''s page.', null, '/venues/' || c.venue_id);
end $$;

-- The subscription ended: the place stops being a partner.
create or replace function public.place_claim_cancel(p_subscription text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.venue_claims;
begin
  select * into c from public.venue_claims where stripe_subscription_id = p_subscription and status = 'active';
  if c.id is null then return; end if;
  update public.venue_placements set ends_at = greatest(now(), starts_at + interval '1 second') where id = c.placement_id and ends_at > now();
  update public.venue_claims set status = 'canceled' where id = c.id;
end $$;
revoke execute on function public.place_claim_activate(bigint, text), public.place_claim_cancel(text) from public, anon, authenticated;

create or replace function public.my_place_claim()
returns table (id bigint, business_name text, venue_id bigint, venue_name text, status text, free_months int, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.business_name, c.venue_id, v.name, c.status, c.free_months, c.created_at
  from public.venue_claims c left join public.venues v on v.id = c.venue_id
  where c.user_id = auth.uid() order by c.created_at desc limit 1
$$;
revoke execute on function public.my_place_claim() from public, anon;
grant execute on function public.my_place_claim() to authenticated;

-- ── Contacts already on I'm In ─────────────────────────────────────────────
-- Right after signup you can see who in your phone's contacts is here. The
-- app sends fingerprints (SHA-256) of the numbers; we compare them with
-- members' verified numbers and never store them. Anyone can turn off
-- "Let people who have my number find me".
alter table public.user_settings add column if not exists findable_by_phone boolean not null default true;

create table if not exists private.contact_match_log (
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists contact_match_log_user_idx on private.contact_match_log (user_id, created_at desc);

create table if not exists public.insider_requests (
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  primary key (from_id, to_id),
  check (from_id <> to_id)
);
alter table public.insider_requests enable row level security;
drop policy if exists "own insider requests" on public.insider_requests;
create policy "own insider requests" on public.insider_requests for select using (auth.uid() in (from_id, to_id));

create or replace function public.contacts_on_app(p_hashes text[])
returns table (id uuid, display_name text, avatar_url text, vouch_count int, phone_hash text, is_insider boolean, request_sent boolean)
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if cardinality(coalesce(p_hashes, '{}')) > 3000 then
    raise exception 'That''s a lot of contacts. We can check up to 3,000.' using errcode = 'check_violation';
  end if;
  if (select count(*) from private.contact_match_log where user_id = me and created_at > now() - interval '1 day') >= 5 then
    raise exception 'You''ve checked your contacts a few times today. Try again tomorrow.' using errcode = 'check_violation';
  end if;
  insert into private.contact_match_log (user_id) values (me);
  return query
    select p.id, p.display_name, p.avatar_url, p.vouch_count, h.hash,
           private.are_connected(me, p.id),
           exists (select 1 from public.insider_requests r where r.from_id = me and r.to_id = p.id and r.status = 'pending')
    from public.profile_private pp
    join public.profiles p on p.id = pp.id
    cross join lateral (select encode(extensions.digest(pp.phone, 'sha256'), 'hex') as hash) h
    where pp.phone_verified_at is not null and pp.id <> me
      and h.hash = any(p_hashes)
      and coalesce((select findable_by_phone from public.user_settings s where s.user_id = p.id), true)
      and not private.is_blocked(me, p.id)
    order by p.display_name
    limit 200;
end $$;
revoke execute on function public.contacts_on_app(text[]) from public, anon;
grant execute on function public.contacts_on_app(text[]) to authenticated;

create or replace function public.send_insider_request(p_to uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if p_to = me or private.is_blocked(me, p_to) or not exists (select 1 from public.profiles where id = p_to) then
    raise exception 'You can''t add this person.' using errcode = 'check_violation';
  end if;
  if private.are_connected(me, p_to) then return; end if;
  if (select count(*) from public.insider_requests where from_id = me and created_at > now() - interval '1 day') >= 50 then
    raise exception 'That''s a lot of requests today. Try again tomorrow.' using errcode = 'check_violation';
  end if;
  insert into public.insider_requests (from_id, to_id) values (me, p_to)
  on conflict (from_id, to_id) do update set status = 'pending', created_at = now() where public.insider_requests.status = 'declined'
    and public.insider_requests.created_at < now() - interval '30 days';
  perform private.notify(p_to, 'insider_request', (select display_name from public.profiles where id = me) || ' wants to be Insiders',
                         'You''re in each other''s contacts. Accept if you know them.', me, '/connect/requests');
end $$;

create or replace function public.respond_insider_request(p_from uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  update public.insider_requests set status = case when p_accept then 'accepted' else 'declined' end
   where from_id = p_from and to_id = me and status = 'pending';
  if not found then raise exception 'That request isn''t waiting.' using errcode = 'check_violation'; end if;
  if p_accept and not private.is_blocked(me, p_from) then
    insert into public.connections (user_a, user_b, source) values (least(me, p_from), greatest(me, p_from), 'contacts') on conflict do nothing;
    perform private.notify(p_from, 'insider_added', (select display_name from public.profiles where id = me) || ' accepted',
                           'You''re now Insiders.', me, '/people/' || me);
  end if;
end $$;

create or replace function public.my_insider_requests()
returns table (from_id uuid, display_name text, avatar_url text, vouch_count int, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.from_id, p.display_name, p.avatar_url, p.vouch_count, r.created_at
  from public.insider_requests r join public.profiles p on p.id = r.from_id
  where r.to_id = auth.uid() and r.status = 'pending' and not private.is_blocked(auth.uid(), r.from_id)
  order by r.created_at desc
$$;
revoke execute on function public.send_insider_request(uuid), public.respond_insider_request(uuid, boolean), public.my_insider_requests() from public, anon;
grant execute on function public.send_insider_request(uuid), public.respond_insider_request(uuid, boolean), public.my_insider_requests() to authenticated;

-- ── Patches: safety rules use trust points; profiles show prompts ──────────
do $$
declare
  pairs text[][] := array[
    array['private.can_see_out(uuid,uuid)',
          $p$coalesce((select vouch_count from public.profiles where id = p_viewer), 0)$p$,
          $p$private.trust_points(p_viewer)$p$],
    array['private.can_message(uuid,uuid)',
          $p$coalesce((select vouch_count from public.profiles where id = p_from), 0)$p$,
          $p$private.trust_points(p_from)$p$],
    array['public.group_detail(bigint)',
          $p$'join_type', g.join_type, 'schedule_label', g.schedule_label,$p$,
          $p$'join_type', g.join_type, 'schedule_label', g.schedule_label, 'beginner_friendly', g.beginner_friendly,$p$],
    array['public.profile_card(uuid)',
          $p$'song', p.song,$p$,
          $p$'song', p.song, 'prompts', p.prompts, 'verified_host', p.verified_host,$p$]
  ];
  i int;
  src text;
begin
  for i in 1 .. array_length(pairs, 1) loop
    src := pg_get_functiondef(pairs[i][1]::regprocedure);
    if position(pairs[i][2] in src) = 0 then
      raise exception 'round two patch %: text not found in %', i, pairs[i][1];
    end if;
    execute replace(src, pairs[i][2], pairs[i][3]);
  end loop;
end $$;
