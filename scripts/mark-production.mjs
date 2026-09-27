#!/usr/bin/env node
/**
 * Marks a Supabase database as PRODUCTION (app_config.environment = "production").
 * The demo-data script checks this and refuses to run.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/mark-production.mjs
 */
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

const res = await fetch(`${url}/rest/v1/app_config?on_conflict=key`, {
  method: 'POST',
  headers: {
    apikey: key,
    // New-style secret keys (sb_secret_…) go in the apikey header only.
    ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify({
    key: 'environment',
    value: 'production',
    description: 'Marks the live database. Demo data can never be loaded into it.',
  }),
});
if (!res.ok) throw new Error(`Could not mark production: ${res.status} ${await res.text()}`);
console.log('✓ Database marked as production (demo data blocked).');
