-- Outs can be a photo or a video of up to 9 seconds (the app stops recording
-- at 9 seconds and won't pick longer videos). A video Out works exactly like a
-- photo one: 6 hours, pins, screenshots, who can see it.
update storage.buckets
   set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','video/webm'],
       file_size_limit = 31457280  -- 30 MB: plenty for 9 seconds of phone video
 where id = 'outs';

-- Opening an Out says whether it's a photo or a video.
do $$
declare src text; before text;
begin
  select pg_get_functiondef('public.out_open(bigint, uuid)'::regprocedure) into src;
  before := src;
  src := replace(src, 'jsonb_build_object(''id'', o.id, ''path'', o.path,',
    'jsonb_build_object(''id'', o.id, ''path'', o.path, ''kind'', case when o.path ~* ''\.(mp4|mov|m4v|webm)$'' then ''video'' else ''photo'' end,');
  if src = before then raise exception 'out_open: could not add kind'; end if;
  execute src;
end $$;
