-- Event cover photos show on the event page, What's In and Home.
do $$
declare
  f text;
  src text;
  pairs text[][] := array[
    array['public.event_detail(bigint)', '''title'', ev.title,', '''title'', ev.title, ''cover_url'', ev.cover_url,'],
    array['public.whats_in(double precision, double precision, double precision)', 'select ev.id, ev.title, ev.emoji,', 'select ev.id, ev.title, ev.emoji, ev.cover_url,'],
    array['public.home_feed(text, double precision, double precision)', 'select ev.id, ev.title, ev.emoji,', 'select ev.id, ev.title, ev.emoji, ev.cover_url,']
  ];
begin
  for i in 1 .. array_length(pairs, 1) loop
    src := pg_get_functiondef(pairs[i][1]::regprocedure);
    if position(pairs[i][2] in src) = 0 then
      raise exception 'cover_url patch: % not found in %', pairs[i][2], pairs[i][1];
    end if;
    execute replace(src, pairs[i][2], pairs[i][3]);
  end loop;
end $$;
