// Drives three headless Chromium pages through relay.mjs and checks, with getStats, that audio
// flows only where the relay allowed it. Usage: node test.mjs [turnUrl relayOnly]
import { createRequire } from 'node:module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const BASE = `http://127.0.0.1:${process.env.PORT || 8099}`;
const TURN = process.argv[2] || '';
const RELAY_ONLY = process.argv[3] === 'relay';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const admin = (q) => fetch(`${BASE}/admin?${q}`).then((r) => r.text());
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail ? JSON.stringify(detail) : ''}`); };

const args = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
if (process.env.WAV) args.push(`--use-file-for-fake-audio-capture=${process.env.WAV}`);
const browser = await chromium.launch({ args });
console.log('chromium', browser.version());
const ctx = await browser.newContext();
const open = async (me, x, y) => {
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${me}]`, m.text()); });
  page.on('pageerror', (e) => console.log(`[${me}] pageerror`, e.message));
  const q = new URLSearchParams({ me, x, y });
  if (TURN) q.set('turn', TURN);
  if (RELAY_ONLY) q.set('relay', '1');
  await page.goto(`${BASE}/?${q}`);
  await page.waitForFunction(() => window.voice && window.voice.ready());
  return page;
};
const stats = (p) => p.evaluate(() => window.voice.stats());

// A and B stand 10 m apart; C is across town (500 m).
const A = await open('a', 100, 100);
const B = await open('b', 110, 100);
const C = await open('c', 600, 100);
await admin('who=a&mode=say');
await admin('who=b&mode=say');
await sleep(4000);

let sa = await stats(A), sb = await stats(B), sc = await stats(C);
check('A linked only to B', JSON.stringify(Object.keys(sa)) === '["b"]', Object.keys(sa));
check('C linked to nobody', Object.keys(sc).length === 0, Object.keys(sc));
check('A receives B audio (bytesReceived > 0)', sa.b && sa.b.in > 0, sa.b);
check('B receives A audio (bytesReceived > 0)', sb.a && sb.a.in > 0, sb.a);
check('A hears non-silent audio (WebAudio analyser peak > 0.01)', sa.b && sa.b.peak > 0.01, sa.b && { peak: sa.b.peak, energy: sa.b.energy });
check('B hears non-silent audio (WebAudio analyser peak > 0.01)', sb.a && sb.a.peak > 0.01, sb.a && { peak: sb.a.peak, energy: sb.a.energy });

// Bitrate of one Opus stream over 5 s.
const t0 = (await stats(B)).a; await sleep(5000); const t1 = (await stats(B)).a;
const dt = 5 + 1; // stats() itself takes ~1 s per peer for the analyser sampling
const r1 = (v) => Math.round(v * 10) / 10;
const kbps = ((t1.in - t0.in) * 8) / dt / 1000;
const hdr = ((t1.hdrIn - t0.hdrIn) * 8) / dt / 1000;
const wire = ((t1.wireIn - t0.wireIn) * 8) / dt / 1000;
const pps = (t1.packetsIn - t0.packetsIn) / dt;
check('one Opus stream bitrate measured', kbps > 0, { payloadKbps: r1(kbps), rtpHeaderKbps: r1(hdr), transportKbps: r1(wire), packetsPerSecond: r1(pps), codec: t1.codec, path: t1.candidate });

// A modified client C forges an offer to A: the relay must refuse; A must never see it.
await C.evaluate(() => window.voice.forgeOffer('a'));
await sleep(1000);
const errs = await C.evaluate(() => window.voice.errors());
check('forged offer from out-of-range C refused', errs.includes('not_in_range'), errs);
check('A still linked only to B after forgery', JSON.stringify(Object.keys(await stats(A))) === '["b"]');

// C walks to 15 m from A: the relay links C with A and B; C hears A's "say".
await admin('who=c&x=115&y=100');
await sleep(4000);
sc = await stats(C);
check('C linked to A and B after walking into range', Object.keys(sc).sort().join() === 'a,b', Object.keys(sc));
check('C receives A audio now', sc.a && sc.a.in > 0, sc.a);

// A whispers to B (A and B are 10 m apart, too far: nobody gets A's track), then B steps to 1.5 m.
await admin('who=a&mode=whisper&to=b');
await admin('who=b&x=101.5&y=100');
await sleep(1500);
const w0 = { b: (await stats(B)).a, c: (await stats(C)).a };
await sleep(3000);
const w1 = { b: (await stats(B)).a, c: (await stats(C)).a };
const bGain = w1.b.in - w0.b.in, cGain = w1.c.in - w0.c.in;
check('whisper: target B keeps receiving A', bGain > 2000, { bytes3s: bGain });
check('whisper: bystander C stops receiving A (honest sender, replaceTrack(null))', cGain < 200, { bytes3s: cGain });

// C walks away (500 m): the relay hangs up both of C's links.
await admin('who=c&x=600&y=100');
await sleep(1500);
sc = await stats(C); sa = await stats(A);
check('hang-up on leaving range: C has no peers', Object.keys(sc).length === 0, Object.keys(sc));
check('hang-up on leaving range: A no longer has C', !('c' in sa), Object.keys(sa));

console.log('relay log', await fetch(`${BASE}/log`).then((r) => r.text()));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
