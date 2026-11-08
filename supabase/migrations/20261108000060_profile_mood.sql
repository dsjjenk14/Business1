-- Profile mood: a short line under your name ("Mood: ready for the weekend").
alter table public.profiles add column if not exists mood text
  check (mood is null or char_length(mood) <= 60);

grant update (mood) on public.profiles to authenticated;

do $$
declare
  src text := pg_get_functiondef('public.profile_card(uuid)'::regprocedure);
  old text := $p$'song', p.song,$p$;
begin
  if position(old in src) = 0 then
    raise exception 'profile mood patch: text not found in profile_card';
  end if;
  execute replace(src, old, $p$'song', p.song, 'mood', p.mood, 'pin_count', (select count(*) from public.pins x where x.author_id = p.id and x.deleted_at is null),$p$);
end $$;
