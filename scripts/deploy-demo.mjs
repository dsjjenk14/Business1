#!/usr/bin/env node
/**
 * One-command deploy of the I'm In DEMO environment.
 *
 *   SUPABASE_ACCESS_TOKEN=… EXPO_TOKEN=… node scripts/deploy-demo.mjs
 *
 * 1. Finds or creates the Supabase project "imin-demo" (East US).
 * 2. Pushes all database migrations and Edge Functions.
 * 3. Sets login redirect URLs.
 * 4. Loads the demo cast (only into this demo project).
 * 5. Publishes the app to Expo (branch "preview") for Expo Go.
 *
 * Safe to re-run: it reuses the existing project and only pushes new changes.
 * Pass --no-seed to skip reloading demo data on re-runs.
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const PROJECT_NAME = 'imin-demo';
const REGION = 'us-east-1';
const API = 'https://api.supabase.com/v1';
const token = process.env.SUPABASE_ACCESS_TOKEN;
const skipSeed = process.argv.includes('--no-seed');

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
let projects = await api('/projects');
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
  console.log(`\n🔑 Database password (save it in a password manager; it can be reset in the dashboard):\n   ${dbPassword}\n`);
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
run(`npx supabase functions deploy --project-ref ${ref}`);

// ── 3. Auth redirect URLs ─────────────────────────────────────────────────
await api(`/projects/${ref}/config/auth`, {
  method: 'PATCH',
  body: JSON.stringify({ site_url: 'imin://', uri_allow_list: 'imin://**,exp://**' }),
});

// ── Keys ─────────────────────────────────────────────────────────────────
const keys = await api(`/projects/${ref}/api-keys?reveal=true`);
const anon = keys.find((k) => k.name === 'anon')?.api_key ?? keys.find((k) => k.type === 'publishable')?.api_key;
const service = keys.find((k) => k.name === 'service_role')?.api_key ?? keys.find((k) => k.type === 'secret')?.api_key;
const url = `https://${ref}.supabase.co`;
if (!anon || !service) throw new Error('Could not read the project API keys.');

// ── 4. Demo data ─────────────────────────────────────────────────────────
if (!skipSeed) {
  const { count } = await fetch(`${url}/rest/v1/profiles?select=id`, {
    headers: { apikey: service, Authorization: `Bearer ${service}`, Prefer: 'count=exact', Range: '0-0' },
  }).then(async (r) => ({ count: Number(r.headers.get('content-range')?.split('/')[1] ?? 0) }));
  if (count === 0) run('node supabase/seed/run-seed.mjs', { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: service, SEED_ALLOW_REMOTE: 'yes' });
  else console.log(`Demo data already loaded (${count} members); skipping seed.`);
}

// ── 5. App ───────────────────────────────────────────────────────────────
if (process.env.EXPO_TOKEN) {
  const appEnv = { EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: anon };
  run('npx eas-cli@latest init --non-interactive --force', appEnv);
  run('npx eas-cli@latest update:configure --platform all --non-interactive', appEnv);
  run('npx eas-cli@latest update --branch preview --message "Demo deploy" --non-interactive', appEnv);
}

console.log(`\n✅ Deployed.\n   Supabase: https://supabase.com/dashboard/project/${ref}\n   App: open expo.dev → imin → Updates → preview → scan the QR code with Expo Go.\n   Demo login: dom@imin.test / ImIn-demo-2026`);
