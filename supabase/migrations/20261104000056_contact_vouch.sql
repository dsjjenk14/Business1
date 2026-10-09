-- Vouch for someone who's in your phone's contacts.
--
-- You pick them from your phone's contact picker (only that one contact's
-- numbers leave your phone, and they're never stored). If one of the numbers
-- matches their verified phone number, you can vouch without an in-app meetup.
-- Rules:
--   * both of you have verified your phone numbers
--   * you don't already have an active vouch for them, and neither has blocked the other
--   * it counts toward your vouches for the month, like any vouch
--   * 10 tries that don't match per day, so nobody can use it to guess numbers
-- Their profile shows "In their contacts" instead of "Met in person".

alter table public.vouches drop constraint if exists vouches_contact_shape;
alter table public.vouches add constraint vouches_contact_shape
  check (type <> 'contact' or (word_id is not null and encounter_id is null));

create unique index if not exists vouches_contact_once on public.vouches (voucher_id, vouchee_id)
  where type = 'contact' and status <> 'revoked';

create table if not exists private.contact_vouch_misses (
  id bigint generated always as identity primary key,
  voucher_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists contact_vouch_misses_voucher_idx on private.contact_vouch_misses (voucher_id, created_at desc);

-- Contact vouches: both phones verified, and they share the monthly limit
-- with meetup vouches.
do $$
declare
  pairs text[][] := array[
    array['public.validate_vouch()',
          $p$where voucher_id = new.voucher_id and type = 'gps'$p$,
          $p$where voucher_id = new.voucher_id and type in ('gps', 'contact')$p$],
    array['public.validate_vouch()',
          $p$  if new.type = 'gps' then$p$,
          $p$  if new.type = 'contact' then
    if not exists (
       select 1 from public.profile_private a, public.profile_private b
        where a.id = new.voucher_id and b.id = new.vouchee_id
          and a.phone_verified_at is not null and b.phone_verified_at is not null) then
      raise exception 'Contact vouches need both of you to have verified your phone numbers.'
        using errcode = 'check_violation';
    end if;
    monthly := public.plan_limit(new.voucher_id, 'vouches_per_month');
    if monthly is not null then
      select count(*) into given_this_month from public.vouches
       where voucher_id = new.voucher_id and type in ('gps', 'contact')
         and date_trunc('month', created_at at time zone 'America/New_York')
           = date_trunc('month', at_time at time zone 'America/New_York');
      if given_this_month >= monthly then
        raise exception 'You''ve used your % vouches for this month. You get more on the 1st, or go unlimited with Premium.', monthly::int
          using errcode = 'check_violation';
      end if;
    end if;
  end if;
  if new.type = 'gps' then$p$],
    array['public.my_vouches_left_this_month()',
          $p$where voucher_id = auth.uid() and type = 'gps'$p$,
          $p$where voucher_id = auth.uid() and type in ('gps', 'contact')$p$],
    array['public.vouch_after_insert()',
          $p$if new.type = 'gps' and$p$,
          $p$if new.type in ('gps', 'contact') and$p$]
  ];
  i int;
  src text;
begin
  for i in 1 .. array_length(pairs, 1) loop
    src := pg_get_functiondef(pairs[i][1]::regprocedure);
    if position(pairs[i][2] in src) = 0 then
      raise exception 'contact vouch patch %: text not found in %', i, pairs[i][1];
    end if;
    execute replace(src, pairs[i][2], pairs[i][3]);
  end loop;
end $$;

-- Vouch from contacts. p_phones are the numbers saved for the contact you
-- picked (E.164, like +12025550102). Returns 'vouched' or 'no_match'.
create or replace function public.vouch_from_contacts(p_vouchee uuid, p_word smallint, p_phones text[])
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  their_phone text;
begin
  if me is null then raise exception 'Sign in first.' using errcode = 'insufficient_privilege'; end if;
  if p_vouchee is null or p_vouchee = me then
    raise exception 'Pick someone else to vouch for.' using errcode = 'check_violation';
  end if;
  if private.is_blocked(me, p_vouchee) or not exists (select 1 from public.profiles where id = p_vouchee) then
    raise exception 'You can''t vouch for this person.' using errcode = 'check_violation';
  end if;
  if p_word is null or not exists (select 1 from public.vouch_words where id = p_word and active) then
    raise exception 'Pick a word first.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.profile_private where id = me and phone_verified_at is not null) then
    raise exception 'Verify your phone number first, then you can vouch from your contacts.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.vouches where voucher_id = me and vouchee_id = p_vouchee and status = 'active') then
    raise exception 'You already vouch for them.' using errcode = 'check_violation';
  end if;
  if (select count(*) from private.contact_vouch_misses
       where voucher_id = me and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many tries. Try again tomorrow.' using errcode = 'check_violation';
  end if;

  select pp.phone into their_phone from public.profile_private pp
   where pp.id = p_vouchee and pp.phone_verified_at is not null;
  if their_phone is null
     or not their_phone = any (coalesce((select array_agg(x) from unnest(p_phones[1:20]) x), '{}')) then
    insert into private.contact_vouch_misses (voucher_id) values (me);
    return 'no_match';
  end if;

  insert into public.vouches (voucher_id, vouchee_id, type, word_id)
  values (me, p_vouchee, 'contact', p_word);
  return 'vouched';
end $$;
revoke execute on function public.vouch_from_contacts(uuid, smallint, text[]) from public, anon;
grant execute on function public.vouch_from_contacts(uuid, smallint, text[]) to authenticated;
