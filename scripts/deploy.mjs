#!/usr/bin/env node
/**
 * Production deploy of I'm In.
 *
 *   SUPABASE_ACCESS_TOKEN=… EXPO_TOKEN=… node scripts/deploy.mjs
 *
 * 1. Finds or creates the Supabase project "imin" (East US).
 * 2. Pushes database migrations and Edge Functions.
 * 3. Marks the database as PRODUCTION: the demo-data script refuses to run
 *    against it, and texting "demo mode" (codes shown on screen) is off.
 * 4. Sets login settings (email confirmation on, app redirect URLs).
 * 5. Publishes the app to Expo (branch "production").
 *
 * Never loads demo data. Safe to re-run: it reuses the project and only
 * pushes new changes.
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const PROJECT_NAME = process.env.IMIN_PROJECT_NAME ?? 'imin';
const REGION = 'us-east-1';
const API = 'https://api.supabase.com/v1';
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set.');
if (!process.env.EXPO_TOKEN) console.warn('⚠️  EXPO_TOKEN is not set: the app publish step will be skipped.');

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase API ${init.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Project ────────────────────────────────────────────────────────────
const projects = await api('/projects');
let project = projects.find((p) => p.name === PROJECT_NAME);
let dbPassword = process.env.SUPABASE_DB_PASSWORD;

if (!project) {
  const orgs = await api('/organizations');
  if (!orgs.length) throw new Error('No Supabase organization found on this account.');
  dbPassword = randomBytes(18).toString('base64url');
  console.log(`Creating Supabase project "${PROJECT_NAME}" in ${REGION}…`);
  project = await api('/projects', {
    method: 'POST',
    body: JSON.stringify({ name: PROJECT_NAME, organization_id: orgs[0].id, region: REGION, db_pass: dbPassword }),
  });
  console.log(`\n🔑 Database password. Save it in a password manager now (it can be reset in the dashboard):\n   ${dbPassword}\n`);
}
const ref = project.id ?? project.ref;

process.stdout.write('Waiting for the project to be ready');
for (let i = 0; i < 90; i++) {
  const p = await api(`/projects/${ref}`);
  if (p.status === 'ACTIVE_HEALTHY') break;
  process.stdout.write('.');
  await sleep(10_000);
}
console.log(' ready.');

// ── 2. Database + functions ───────────────────────────────────────────────
if (!dbPassword) {
  throw new Error('Project exists but SUPABASE_DB_PASSWORD is not set. Reset it in Supabase → Project Settings → Database, then re-run with it.');
}
run(`npx supabase link --project-ref ${ref}`, { SUPABASE_DB_PASSWORD: dbPassword });
run('npx supabase db push --include-all', { SUPABASE_DB_PASSWORD: dbPassword });
run(`npx supabase secrets set IMIN_ENV=production --project-ref ${ref}`);
run(`npx supabase functions deploy --project-ref ${ref}`);

// ── Keys ─────────────────────────────────────────────────────────────────
const keys = await api(`/projects/${ref}/api-keys?reveal=true`);
const anon = keys.find((k) => k.name === 'anon')?.api_key ?? keys.find((k) => k.type === 'publishable')?.api_key;
const service = keys.find((k) => k.name === 'service_role')?.api_key ?? keys.find((k) => k.type === 'secret')?.api_key;
const url = `https://${ref}.supabase.co`;
if (!anon || !service) throw new Error('Could not read the project API keys.');

// ── 3. Mark as production ─────────────────────────────────────────────────
run('node scripts/mark-production.mjs', { SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_ID: ref });

// ── 4. Login settings ─────────────────────────────────────────────────────
await api(`/projects/${ref}/config/auth`, {
  method: 'PATCH',
  body: JSON.stringify({ site_url: 'imin://', uri_allow_list: 'imin://**,exp://**', mailer_autoconfirm: false }),
});

// ── 5. App ───────────────────────────────────────────────────────────────
if (process.env.EXPO_TOKEN) {
  const appEnv = { EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: anon };
  run('npx eas-cli@latest init --non-interactive --force', appEnv);
  run('npx eas-cli@latest update:configure --platform all --non-interactive', appEnv);
  run('npx eas-cli@latest update --branch production --message "Production deploy" --non-interactive', appEnv);
}

console.log(`\n✅ Deployed (no demo data).\n   Supabase: https://supabase.com/dashboard/project/${ref}\n   App: expo.dev → imin → Updates → production → scan the QR code with Expo Go.`);
