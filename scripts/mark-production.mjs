#!/usr/bin/env node
/**
 * Marks a Supabase database as PRODUCTION (app_config.environment = "production").
 * The demo-data script checks this and refuses to run.
 *
 * Uses the Supabase Management API with the account access token (the same
 * token the deploy already uses), so no service key is needed:
 *   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_ID=… node scripts/mark-production.mjs
 */
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_ID;
if (!token || !ref) throw new Error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID are required.');

const query = `insert into public.app_config (key, value, description)
  values ('environment', '"production"', 'Marks the live database. Demo data can never be loaded into it.')
  on conflict (key) do update set value = excluded.value;
  select value from public.app_config where key = 'environment';`;

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const text = await res.text();
if (!res.ok) throw new Error(`Could not mark production: ${res.status} ${text}`);
if (!text.includes('production')) throw new Error(`Unexpected answer while marking production: ${text}`);
console.log('✓ Database marked as production (demo data blocked).');
