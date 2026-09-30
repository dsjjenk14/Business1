-- Friday Drop goes out at 2:00 PM DC time, all year. The server clock is UTC
-- and DC moves between UTC-4 and UTC-5, so the job checks at both 18:00 and
-- 19:00 UTC on Fridays and only sends on the one that is 2 PM in DC.
create or replace function private.friday_drop_tick(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  dc timestamp := p_now at time zone 'America/New_York';
begin
  if extract(isodow from dc) <> 5 or extract(hour from dc) <> 14 then
    return 0;
  end if;
  return private.send_friday_drop();
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('friday-drop') where exists (select 1 from cron.job where jobname = 'friday-drop');
    perform cron.schedule('friday-drop', '0 18,19 * * 5', 'select private.friday_drop_tick()');
  end if;
end $$;
