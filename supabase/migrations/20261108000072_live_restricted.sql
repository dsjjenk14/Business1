-- Suspended, removed or on-hold members can't start a live video or comment on one,
-- like everything else they can't do.
do $$
declare tbl text;
begin
  foreach tbl in array array['live_streams', 'live_comments'] loop
    if to_regclass('public.' || tbl) is not null then
      execute format('drop trigger if exists %I on public.%I', tbl || '_restricted', tbl);
      execute format('create trigger %I before insert on public.%I for each row execute function private.block_if_restricted()', tbl || '_restricted', tbl);
    end if;
  end loop;
end $$;
