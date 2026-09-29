-- 1. Your people are "Insiders" now (not friends, followers or connections),
--    and following someone's public posts is "tapping in". This updates the
--    messages the database writes.
-- 2. Each Out lasts 6, 12 or 24 hours: the sender picks.
do $$
declare
  fixes jsonb := $j$[
    ["public.create_bill(text,integer,integer,text,jsonb,text,bigint,text)", [
      ["Each friend once, please.", "Each person once, please."],
      ["Tag at least one friend.", "Tag at least one person."],
      ["people in your circle", "your Insiders"]]],
    ["public.create_event(text,timestamp with time zone,bigint,text,text,integer,bigint,numeric,text,double precision,double precision,text,uuid)", [
      ["Choose Public or Circle only.", "Choose Public or Insiders only."]]],
    ["public.set_event_mode(bigint,text,uuid)", [
      ["Choose Public or Circle only.", "Choose Public or Insiders only."]]],
    ["public.create_group_chat(text,uuid[])", [
      ["people in your circle", "your Insiders"]]],
    ["public.make_intro(uuid,uuid,text,bigint)", [
      ["from your circle and network only", "from your Insiders and Network only"],
      ["re already connected.", "re already Insiders."]]],
    ["public.request_intro(uuid,uuid,text)", [
      ["re already connected.", "re already Insiders."]]],
    ["public.set_here_audience(bigint,text)", [
      ["Choose circle or network.", "Choose Insiders or Network."]]],
    ["public.set_plan_audience(bigint,text)", [
      ["Choose Everyone, My Network or My Circle.", "Choose Everyone, My Network or My Insiders."]]],
    ["public.start_date_mode(uuid,double precision,double precision,real)", [
      ["someone you connected with on I", "someone you know on I"]]],
    ["private.intro_odds(uuid,uuid,uuid)", [
      [" more mutual friend", " more shared Insider"]]],
    ["public.redeem_connect_code(text)", [
      [" is now in your circle", " is now one of your Insiders"]]],
    ["public.respond_intro(bigint,boolean)", [
      [" are now connected, thanks to you.", " are now Insiders, thanks to you."],
      ["'You''re connected with ' || (select display_name from public.profiles where id = me)", "(select display_name from public.profiles where id = me) || ' is one of your Insiders now'"]]],
    ["public.follow_user(uuid)", [
      [" followed you", " tapped in to your posts"]]]
  ]$j$;
  f jsonb;
  r jsonb;
  src text;
  out text;
begin
  for f in select * from jsonb_array_elements(fixes) loop
    src := pg_get_functiondef((f->>0)::regprocedure);
    out := src;
    for r in select * from jsonb_array_elements(f->1) loop
      if position(r->>0 in out) = 0 then raise exception '% : "%" not found', f->>0, r->>0; end if;
      out := replace(out, r->>0, r->>1);
    end loop;
    execute out;
  end loop;
end $$;

-- Outs: pick 6, 12 or 24 hours. The old version (always the config's hours) is replaced.
do $$
declare
  src text := pg_get_functiondef('public.send_out(text,text,uuid[],boolean,text)'::regprocedure);
  out text := src;
  pairs text[][] := array[
    array['p_audience text DEFAULT ''circle''::text)', 'p_audience text DEFAULT ''circle''::text, p_hours integer DEFAULT NULL::integer)'],
    array['  ev_title text;', '  ev_title text;
  hours int := case when p_hours in (6, 12, 24) then p_hours else public.config_num(''out_hours'')::int end;'],
    array['make_interval(hours => public.config_num(''out_hours'')::int)', 'make_interval(hours => hours)'],
    array['''Tap to open it. It disappears in 6 hours unless you pin it.''', '''Tap to open it. It disappears in '' || hours || '' hours unless you pin it.'''],
    array['Choose My Circle or My Network.', 'Choose your Insiders or your Network.'],
    array['Pick at least one friend, or post it to My Out.', 'Pick at least one Insider, or post it to your Out.']
  ];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    if position(pairs[i][1] in out) = 0 then raise exception 'send_out: "%" not found', pairs[i][1]; end if;
    out := replace(out, pairs[i][1], pairs[i][2]);
  end loop;
  drop function public.send_out(text, text, uuid[], boolean, text);
  execute out;
end $$;
revoke execute on function public.send_out(text, text, uuid[], boolean, text, integer) from public, anon;
grant execute on function public.send_out(text, text, uuid[], boolean, text, integer) to authenticated;
