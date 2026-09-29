-- Outs: hide one from chosen people. They don't see it on your Out, can't
-- open or pin it, and aren't sent it directly even if they were picked.
alter table public.outs add column if not exists hidden_from uuid[] not null default '{}';

-- send_out gains p_hide_from (up to 200 people).
do $$
declare
  src text := pg_get_functiondef('public.send_out(text,text,uuid[],boolean,text,integer)'::regprocedure);
  out text := src;
  pairs text[][] := array[
    array['p_hours integer DEFAULT NULL::integer)', 'p_hours integer DEFAULT NULL::integer, p_hide_from uuid[] DEFAULT NULL::uuid[])'],
    array['  ev_title text;', '  ev_title text;
  hide uuid[] := (select coalesce(array_agg(distinct h), ''{}'') from unnest(coalesce(p_hide_from, ''{}'')) h where h is not null);'],
    array['  -- Sent directly:', '  if cardinality(hide) > 200 then raise exception ''Hide from 200 people at most.'' using errcode = ''check_violation''; end if;
  -- Sent directly:'],
    array['where r <> me and private.are_connected(me, r)', 'where r <> me and not r = any(hide) and private.are_connected(me, r)'],
    array['insert into public.outs (sender_id, path, caption, to_story, expires_at, event_id, audience)', 'insert into public.outs (sender_id, path, caption, to_story, expires_at, event_id, audience, hidden_from)'],
    array['ev, coalesce(p_audience, ''circle''))', 'ev, coalesce(p_audience, ''circle''), hide)']
  ];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    if position(pairs[i][1] in out) = 0 then raise exception 'send_out: "%" not found', pairs[i][1]; end if;
    out := replace(out, pairs[i][1], pairs[i][2]);
  end loop;
  drop function public.send_out(text, text, uuid[], boolean, text, integer);
  execute out;
end $$;
revoke execute on function public.send_out(text, text, uuid[], boolean, text, integer, uuid[]) from public, anon;
grant execute on function public.send_out(text, text, uuid[], boolean, text, integer, uuid[]) to authenticated;

-- Everywhere a story Out is checked, people it's hidden from are left out.
do $$
declare
  fixes jsonb := $j$[
    ["public.outs_inbox()", [["private.can_view_story((select id from me), o.sender_id, o.audience)", "private.can_view_story((select id from me), o.sender_id, o.audience) and not (select id from me) = any(o.hidden_from)"]]],
    ["public.pin_out(bigint)", [["private.can_view_story(me, o.sender_id, o.audience))", "private.can_view_story(me, o.sender_id, o.audience) and not me = any(o.hidden_from))"]]],
    ["public.out_open(bigint,uuid)", [["private.can_view_story(p_user, o.sender_id, o.audience) then", "private.can_view_story(p_user, o.sender_id, o.audience) and not p_user = any(o.hidden_from) then"]]]
  ]$j$;
  f jsonb;
  r jsonb;
  out text;
begin
  for f in select * from jsonb_array_elements(fixes) loop
    out := pg_get_functiondef((f->>0)::regprocedure);
    for r in select * from jsonb_array_elements(f->1) loop
      if position(r->>0 in out) = 0 then raise exception '% : "%" not found', f->>0, r->>0; end if;
      out := replace(out, r->>0, r->>1);
    end loop;
    execute out;
  end loop;
end $$;
