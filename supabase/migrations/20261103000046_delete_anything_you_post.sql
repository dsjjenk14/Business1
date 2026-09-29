-- Delete anything you post, whenever you want.
--   · Outs: the sender can delete one at any time. Nobody can open it again,
--     it leaves everyone's inbox and your Out, pins on it go too, and the
--     photo/video file is removed.
--   · Messages (direct and group chats): the sender can delete their own.
--   · Events: the host can delete one. Everyone going is told. If anyone
--     paid for a ticket, refund them first (so no payment record is lost).
-- Pins, replies, plans, live videos, live comments, bills and group
-- announcements could already be removed.

-- ── Outs ──────────────────────────────────────────────────────────────────
create or replace function public.delete_out(p_out bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  o public.outs;
begin
  select * into o from public.outs where id = p_out and sender_id = me;
  if not found then raise exception 'That Out isn''t yours.' using errcode = 'insufficient_privilege'; end if;
  delete from public.out_pins where out_id = p_out;
  delete from public.out_story_views where out_id = p_out;
  delete from public.out_recipients where out_id = p_out;
  -- Expired and on nobody's list: gone from every screen. The file is removed
  -- by the app now and by the regular clean-up if that fails.
  update public.outs set expires_at = least(expires_at, now()), to_story = false where id = p_out;
  return o.path;
end $$;
revoke execute on function public.delete_out(bigint) from public, anon;
grant execute on function public.delete_out(bigint) to authenticated;

-- The sender may remove their own Out files (their own folder only).
drop policy if exists "delete own outs" on storage.objects;
create policy "delete own outs" on storage.objects for delete to authenticated
  using (bucket_id = 'outs' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Messages ──────────────────────────────────────────────────────────────
create or replace function public.delete_message(p_message bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.messages;
begin
  select * into m from public.messages where id = p_message and sender_id = auth.uid();
  if not found then raise exception 'You can only delete your own messages.' using errcode = 'insufficient_privilege'; end if;
  delete from public.messages where id = p_message;
end $$;
revoke execute on function public.delete_message(bigint) from public, anon;
grant execute on function public.delete_message(bigint) to authenticated;

-- ── Events ────────────────────────────────────────────────────────────────
create or replace function public.delete_event(p_event bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event and host_id = auth.uid();
  if not found then raise exception 'Only the host can delete this event.' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.event_tickets t where t.event_id = p_event and t.status in ('paid', 'overflow')) then
    raise exception 'Refund everyone who bought a ticket first, then you can delete the event.' using errcode = 'check_violation';
  end if;
  -- Tell everyone who was going (the event only, not where or when).
  perform private.notify(r.user_id, 'event_canceled', e.title || ' was canceled',
                         'The host canceled it.', auth.uid(), '/tonight')
  from public.event_rsvps r where r.event_id = p_event and r.user_id <> auth.uid();
  delete from public.events where id = p_event;
end $$;
revoke execute on function public.delete_event(bigint) from public, anon;
grant execute on function public.delete_event(bigint) to authenticated;
