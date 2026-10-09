-- Joining with someone's invite code:
--   * no longer gives anyone a vouch. Vouches only come from meeting in person.
--   * links you to the person who invited you (you become Insiders) only once
--     you've verified your phone number. Until then the code does nothing.

-- 1. New sign-ups: remember who invited them, nothing more.
do $$
declare
  src text := pg_get_functiondef('public.handle_new_user()'::regprocedure);
  old text := $q$  -- Invite code: auto-connect and both get an invite vouch (inviter's is capped).
  if v_inviter is not null then
    insert into public.connections (user_a, user_b, source)
    values (least(new.id, v_inviter), greatest(new.id, v_inviter), 'invite');

    insert into public.vouches (voucher_id, vouchee_id, type)
    values (v_inviter, new.id, 'invite');

    if (select count(*) from public.vouches where vouchee_id = v_inviter and type = 'invite')
         < public.config_num('invite_vouch_cap') then
      insert into public.vouches (voucher_id, vouchee_id, type)
      values (new.id, v_inviter, 'invite');
    end if;

  end if;
$q$;
begin
  if position(old in src) = 0 then
    raise exception 'handle_new_user: invite block not found';
  end if;
  execute replace(src, old, $q$  -- Invite code: just remember who invited them. They become Insiders once the
  -- new member verifies their phone (see private.connect_inviter), and nobody
  -- gets a vouch for it: vouches only come from meeting in person.
$q$);
end $$;

-- 2. Verified phone: connect with the person who invited you.
create or replace function private.connect_inviter() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  inviter uuid;
  newbie_name text;
begin
  if old.phone_verified_at is not null or new.phone_verified_at is null then
    return new;
  end if;
  select p.invited_by, p.display_name into inviter, newbie_name from public.profiles p where p.id = new.id;
  if inviter is null or inviter = new.id or private.is_blocked(inviter, new.id)
     or not exists (select 1 from public.profiles where id = inviter) then
    return new;
  end if;
  insert into public.connections (user_a, user_b, source)
  values (least(new.id, inviter), greatest(new.id, inviter), 'invite')
  on conflict do nothing;
  perform private.notify(inviter, 'insider_added', newbie_name || ' joined with your code',
                         'They verified their phone, so you''re now Insiders.', new.id, '/people/' || new.id);
  return new;
end $$;

drop trigger if exists profile_private_phone_verified on public.profile_private;
create trigger profile_private_phone_verified
  after update of phone_verified_at on public.profile_private
  for each row execute function private.connect_inviter();

-- 3. Take back the automatic invite vouches already given (vouch counts
--    update themselves).
delete from public.vouches where type = 'invite';
