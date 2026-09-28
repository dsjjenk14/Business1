#!/usr/bin/env node
/**
 * Makes a member an admin (or removes admin with REMOVE=yes), by email.
 * Runs against the live database through the Supabase Management API.
 *
 *   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_ID=… EMAIL=you@example.com node scripts/make-admin.mjs
 */
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_ID;
const email = (process.env.EMAIL ?? '').trim().toLowerCase();
const remove = process.env.REMOVE === 'yes';
if (!token || !ref) throw new Error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID are required.');
// Strict check so the email can be placed in SQL safely.
if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) throw new Error('That does not look like an email address.');

const role = remove ? 'user' : 'admin';
const query = `update public.profiles set role = '${role}'
  where id = (select id from auth.users where lower(email) = '${email}')
  returning display_name;`;
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
const text = await res.text();
if (!res.ok) throw new Error(`Failed: ${res.status} ${text}`);
const rows = JSON.parse(text);
if (!Array.isArray(rows) || rows.length === 0) throw new Error(`No member with the email ${email}. Sign up in the app first.`);
console.log(`✓ ${rows[0].display_name} is ${remove ? 'no longer an admin' : 'now an admin'}.`);
