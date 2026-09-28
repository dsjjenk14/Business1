-- "I'm In" is what you say when someone invites you: you're down to go.
-- When you join someone's plan, they're told "Ana is in" (not "is joining you").
do $$
declare
  src text := pg_get_functiondef('public.join_going_out(bigint,public.going_out_join_status)'::regprocedure);
  out text;
begin
  out := replace(src, $x$case p_status when 'here' then ' is in too' else ' is joining you' end$x$,
                      $x$case p_status when 'here' then ' is there too' else ' is in' end$x$);
  if out = src then raise exception 'join_going_out patch did not apply'; end if;
  execute out;
end $$;
