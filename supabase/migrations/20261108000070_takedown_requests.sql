-- Removal requests for intimate images shared without consent (federal TAKE IT DOWN Act:
-- remove within 48 hours of a valid request, along with known identical copies).
--   * Anyone can ask, with or without an account. Each request gets a confirmation number.
--   * A request from a signed-in member that points at a post or an Out hides it right away,
--     before review. Removing it for good deletes the files (done by the `takedown` function).
--   * Admins see a 48-hour countdown, and get reminded when 12 hours are left.

create table public.takedown_requests (
  id            bigint generated always as identity primary key,
  code          text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  requester_id  uuid references public.profiles (id) on delete set null,
  for_self      boolean not null default true,
  signature     text not null check (char_length(signature) between 2 and 120),
  contact       text not null check (char_length(contact) between 3 and 200),
  kind          text not null check (kind in ('post', 'out', 'profile_photo', 'other')),
  pin_id        bigint references public.pins (id) on delete set null,
  out_id        bigint references public.outs (id) on delete set null,
  poster_id     uuid references public.profiles (id) on delete set null,
  location      text check (char_length(location) <= 1000),
  statement     text not null check (char_length(statement) between 10 and 2000),
  status        text not null default 'open' check (status in ('open', 'removed', 'not_removed')),
  held          boolean not null default false,
  created_at    timestamptz not null default now(),
  due_at        timestamptz not null default now() + interval '48 hours',
  decided_at    timestamptz,
  decided_by    uuid references public.profiles (id) on delete set null,
  admin_note    text,
  reminded_at   timestamptz
);
create index takedown_open on public.takedown_requests (due_at) where status = 'open';
alter table public.takedown_requests enable row level security;
create policy takedown_admin on public.takedown_requests for select to authenticated using (public.is_admin());
revoke all on public.takedown_requests from anon, authenticated;
grant select on public.takedown_requests to authenticated;

-- Submit a request. Works signed out too (the person in the image may not be a member).
create or replace function public.submit_takedown(
  p_kind text, p_statement text, p_signature text, p_contact text, p_confirm boolean,
  p_location text default null, p_for_self boolean default true,
  p_pin bigint default null, p_out bigint default null, p_poster uuid default null)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r public.takedown_requests; target uuid := p_poster;
begin
  if p_confirm is not true then
    raise exception 'Confirm the statement before sending.' using errcode = 'check_violation';
  end if;
  if char_length(trim(coalesce(p_signature, ''))) < 2 then raise exception 'Type your full name as your signature.' using errcode = 'check_violation'; end if;
  if char_length(trim(coalesce(p_contact, ''))) < 3 then raise exception 'Add an email or phone number so we can reach you.' using errcode = 'check_violation'; end if;
  if char_length(trim(coalesce(p_statement, ''))) < 10 then raise exception 'Tell us briefly why this was shared without consent.' using errcode = 'check_violation'; end if;
  if p_kind not in ('post', 'out', 'profile_photo', 'other') then raise exception 'Pick where the image is.' using errcode = 'check_violation'; end if;
  if p_pin is null and p_out is null and p_poster is null and char_length(trim(coalesce(p_location, ''))) < 3 then
    raise exception 'Tell us where to find it: whose profile, and where it was posted.' using errcode = 'check_violation';
  end if;
  -- Keep the form from being flooded.
  if (select count(*) from public.takedown_requests t
      where t.created_at > now() - interval '1 day'
        and ((me is not null and t.requester_id = me) or lower(t.contact) = lower(trim(p_contact)))) >= 10 then
    raise exception 'We have your requests. We''ll get back to you soon.' using errcode = 'check_violation';
  end if;
  if p_pin is not null then select author_id into target from public.pins where id = p_pin; end if;
  if p_out is not null then select sender_id into target from public.outs where id = p_out; end if;

  insert into public.takedown_requests (requester_id, for_self, signature, contact, kind, pin_id, out_id, poster_id, location, statement)
  values (me, coalesce(p_for_self, true), trim(p_signature), trim(p_contact), p_kind, p_pin, p_out, target,
          nullif(trim(coalesce(p_location, '')), ''), trim(p_statement))
  returning * into r;

  -- A member pointing at a specific post or Out: take it out of view now, before review.
  if me is not null and (p_pin is not null or p_out is not null) then
    if p_pin is not null then update public.pins set hidden_at = coalesce(hidden_at, now()) where id = p_pin; end if;
    if p_out is not null then
      update public.outs set expires_at = least(expires_at, now()) where id = p_out;
      delete from public.out_pins where out_id = p_out;
    end if;
    update public.takedown_requests set held = true where id = r.id;
  end if;

  insert into public.notifications (user_id, kind, title, body, link)
  select p.id, 'moderation', 'Removal request: 48 hours', 'An intimate image removal request needs a decision by ' || to_char(r.due_at at time zone 'America/New_York', 'Mon DD, HH12:MI AM') || ' ET.', '/admin'
  from public.profiles p where p.role = 'admin';
  return r.code;
end $$;
revoke all on function public.submit_takedown(text, text, text, text, boolean, text, boolean, bigint, bigint, uuid) from public;
grant execute on function public.submit_takedown(text, text, text, text, boolean, text, boolean, bigint, bigint, uuid) to anon, authenticated;

-- Anyone with the confirmation number can check where it stands (nothing else is shown).
create or replace function public.takedown_status(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('status', t.status, 'created_at', t.created_at, 'due_at', t.due_at, 'decided_at', t.decided_at)
  from public.takedown_requests t where t.code = upper(trim(p_code))
$$;
revoke all on function public.takedown_status(text) from public;
grant execute on function public.takedown_status(text) to anon, authenticated;

create or replace function public.admin_takedowns() returns table (
  id bigint, code text, status text, kind text, held boolean, for_self boolean, signature text, contact text,
  location text, statement text, created_at timestamptz, due_at timestamptz, decided_at timestamptz,
  pin_id bigint, pin_body text, out_id bigint, poster_id uuid, poster_name text, requester_name text, admin_note text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_admin();
  return query
  select t.id, t.code, t.status, t.kind, t.held, t.for_self, t.signature, t.contact, t.location, t.statement,
         t.created_at, t.due_at, t.decided_at, t.pin_id, pn.body, t.out_id, t.poster_id, pp.display_name, rp.display_name, t.admin_note
  from public.takedown_requests t
  left join public.pins pn on pn.id = t.pin_id
  left join public.profiles pp on pp.id = t.poster_id
  left join public.profiles rp on rp.id = t.requester_id
  order by (t.status = 'open') desc, t.due_at, t.created_at desc
  limit 200;
end $$;
revoke all on function public.admin_takedowns() from public, anon;
grant execute on function public.admin_takedowns() to authenticated;

-- Remove for good. Returns the files to delete; the `takedown` function deletes them.
create or replace function public.admin_takedown_remove(p_id bigint, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.takedown_requests; files jsonb := '[]'::jsonb; o public.outs;
begin
  perform private.require_admin();
  select * into t from public.takedown_requests where id = p_id;
  if t.id is null then raise exception 'Request not found.' using errcode = 'check_violation'; end if;
  if t.pin_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('bucket', 'pin-media', 'path', m.path)) || coalesce(jsonb_agg(jsonb_build_object('bucket', 'pin-media', 'path', m.poster_path)) filter (where m.poster_path is not null), '[]'::jsonb), '[]'::jsonb)
      into files from public.pin_media m where m.pin_id = t.pin_id;
    files := files || jsonb_build_array(jsonb_build_object('bucket', 'pin-photos', 'folder', (select author_id::text from public.pins where id = t.pin_id) || '/' || t.pin_id));
    delete from public.pins where id = t.pin_id;
  end if;
  if t.out_id is not null then
    select * into o from public.outs where id = t.out_id;
    if o.id is not null then
      files := files || jsonb_build_array(jsonb_build_object('bucket', 'outs', 'path', o.path));
      delete from public.outs where id = o.id;
    end if;
  end if;
  if t.kind = 'profile_photo' and t.poster_id is not null then
    files := files || jsonb_build_array(jsonb_build_object('bucket', 'avatars', 'folder', t.poster_id::text));
    update public.profiles set avatar_url = null, header_url = null, photo_urls = '{}' where id = t.poster_id;
  end if;
  update public.takedown_requests set status = 'removed', decided_at = now(), decided_by = auth.uid(), admin_note = nullif(trim(coalesce(p_note, '')), '')
  where id = t.id;
  if t.requester_id is not null then
    perform private.notify(t.requester_id, 'moderation', 'We removed it', 'The image you asked us to remove has been taken down (request ' || t.code || ').', null, null);
  end if;
  return files;
end $$;
revoke all on function public.admin_takedown_remove(bigint, text) from public, anon;
grant execute on function public.admin_takedown_remove(bigint, text) to authenticated;

-- Not removed (for example, it isn't an intimate image, or we couldn't find it). Anything held comes back.
create or replace function public.admin_takedown_decline(p_id bigint, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.takedown_requests;
begin
  perform private.require_admin();
  if char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'Say why, for the record.' using errcode = 'check_violation'; end if;
  select * into t from public.takedown_requests where id = p_id;
  if t.id is null then raise exception 'Request not found.' using errcode = 'check_violation'; end if;
  if t.held and t.pin_id is not null then update public.pins set hidden_at = null where id = t.pin_id; end if;
  update public.takedown_requests set status = 'not_removed', decided_at = now(), decided_by = auth.uid(), admin_note = trim(p_note) where id = t.id;
  if t.requester_id is not null then
    perform private.notify(t.requester_id, 'moderation', 'About your removal request',
      'We looked into request ' || t.code || ' and couldn''t remove anything. Reply from My reports or email support if you can tell us more.', null, null);
  end if;
end $$;
revoke all on function public.admin_takedown_decline(bigint, text) from public, anon;
grant execute on function public.admin_takedown_decline(bigint, text) to authenticated;

-- 12 hours left and still open: remind every admin, once.
create or replace function private.remind_takedowns() returns void
language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  for t in select id, code, due_at from public.takedown_requests
           where status = 'open' and reminded_at is null and due_at < now() + interval '12 hours' loop
    insert into public.notifications (user_id, kind, title, body, link)
    select p.id, 'moderation', 'Removal request due soon', 'Request ' || t.code || ' must be decided within 12 hours.', '/admin'
    from public.profiles p where p.role = 'admin';
    update public.takedown_requests set reminded_at = now() where id = t.id;
  end loop;
end $$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('remind-takedowns', '*/15 * * * *', 'select private.remind_takedowns()');
exception when others then
  raise notice 'pg_cron not available; run private.remind_takedowns() another way (%).', sqlerrm;
end $$;
