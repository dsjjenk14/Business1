-- Camera modes like boomerang (slo-mo, rewind, loop) and effects on videos.
--
-- • pin_media.motion: how a burst of frames plays. boomerang = forward then
--   back; slowmo = boomerang at half speed; rewind = backward on a loop;
--   loop = forward on a loop.
-- • pin_media.effect / outs.effect: a look drawn over a video when it plays
--   (photos and frames have their filter and effect baked in instead).
create or replace function private.valid_effect(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p is null or p in ('vignette', 'glow', 'leak', 'dream', 'film')
$$;

alter table public.pin_media
  add column motion text not null default 'boomerang' check (motion in ('boomerang', 'slowmo', 'rewind', 'loop')),
  add column effect text check (private.valid_effect(effect));

alter table public.outs add column effect text check (private.valid_effect(effect));

/** The sender picks a look for their video Out, right after sending it. */
create or replace function public.set_out_effect(p_out bigint, p_effect text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.valid_effect(nullif(p_effect, '')) then
    raise exception 'Unknown effect.' using errcode = 'check_violation';
  end if;
  update public.outs set effect = nullif(p_effect, '') where id = p_out and sender_id = auth.uid();
  if not found then raise exception 'Not your Out.' using errcode = 'insufficient_privilege'; end if;
end $$;
revoke execute on function public.set_out_effect(bigint, text) from public, anon;
grant execute on function public.set_out_effect(bigint, text) to authenticated;

-- Opening an Out returns its effect too.
do $$
declare
  src text := pg_get_functiondef('public.out_open(bigint,uuid)'::regprocedure);
  out text;
begin
  out := replace(src, $x$'kind', case$x$, $x$'effect', o.effect, 'kind', case$x$);
  if out = src then raise exception 'out_open patch did not apply'; end if;
  execute out;
end $$;
