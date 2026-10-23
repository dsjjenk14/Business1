// Can the SERVER decide who hears whom in LiveKit? Runs against a local `livekit-server --dev`.
// A and B publish with canSubscribe=false; the game server (this script) uses RoomServiceClient.
// M is a modified client with canSubscribe=true that tries to subscribe to everything.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const here = path.dirname(new URL(import.meta.url).pathname);
const LK_HTTP = 'http://127.0.0.1:7880', LK_WS = 'ws://127.0.0.1:7880', KEY = 'devkey', SECRET = 'secret', ROOM = 'town';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'INFO'} ${name} ${detail !== undefined ? JSON.stringify(detail) : ''}`); };

const web = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/token') {
    const at = new AccessToken(KEY, SECRET, { identity: url.searchParams.get('who'), ttl: '10m' });
    at.addGrant({ roomJoin: true, room: ROOM, canPublish: true, canPublishData: false, canSubscribe: url.searchParams.get('sub') === '1' });
    res.end(await at.toJwt());
  } else if (url.pathname === '/livekit-client.umd.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(fs.readFileSync(path.join(here, 'node_modules/livekit-client/dist/livekit-client.umd.js')));
  } else {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(fs.readFileSync(path.join(here, 'lkpage.html')));
  }
}).listen(8098, '127.0.0.1');

const svc = new RoomServiceClient(LK_HTTP, KEY, SECRET);
const args = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns'];
const browser = await chromium.launch({ args });
const ctx = await browser.newContext();
const open = async (who, sub, auto, publish) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${who}] pageerror`, e.message));
  await page.goto(`http://127.0.0.1:8098/?who=${who}&sub=${sub}&auto=${auto}&publish=${publish}&url=${encodeURIComponent(LK_WS)}`);
  await page.waitForFunction(() => window.lk && (window.lk.ready || window.lk.error), null, { timeout: 20000 });
  const err = await page.evaluate(() => window.lk.error);
  if (err) throw new Error(`${who}: ${err}`);
  return page;
};
const recv = (p) => p.evaluate(() => window.lk.received());

const A = await open('a', 0, 1, 1);
const B = await open('b', 0, 1, 1);
await sleep(3000);
let rb = await recv(B);
check('1. B (canSubscribe=false, autoSubscribe=true) gets nothing on its own', !rb.a || rb.a.bytes === 0, rb);

const aSid = await A.evaluate(() => window.lk.myAudioSid());
let apiError = null;
try { await svc.updateSubscriptions(ROOM, 'b', [aSid], true); } catch (e) { apiError = String(e); }
await sleep(4000);
rb = await recv(B);
const serverSubWorks = !!(rb.a && rb.a.bytes > 0);
check('2. server updateSubscriptions(b, [A audio], true) while b has canSubscribe=false', true,
  { bReceivesA: serverSubWorks, apiError, b: rb, bLog: await B.evaluate(() => window.lk.log) });

// The workaround if (2) fails: grant canSubscribe via UpdateParticipant, then subscribe.
await svc.updateParticipant(ROOM, 'b', { permission: { canSubscribe: true, canPublish: true, canPublishData: false } });
await sleep(1000);
try { await svc.updateSubscriptions(ROOM, 'b', [aSid], true); } catch (e) { apiError = String(e); }
await sleep(4000);
rb = await recv(B);
check('3. after updateParticipant(canSubscribe=true) + updateSubscriptions, B receives A', !!(rb.a && rb.a.bytes > 0), rb);

// A modified client with canSubscribe=true and autoSubscribe off subscribes to everyone by itself.
const M = await open('m', 1, 0, 0);
await sleep(1500);
await M.evaluate(() => window.lk.trySubscribeAll());
await sleep(4000);
let rm = await recv(M);
check('4. modified client with canSubscribe=true subscribes to A by itself (eavesdrop possible)', !!(rm.a && rm.a.bytes > 0), rm);

// Publisher-side permission (honest sender, like the mesh): A allows only B.
await A.evaluate(() => window.lk.allowOnly(['b']));
await sleep(3000);
const m0 = await recv(M); await sleep(2000); const m1 = await recv(M);
rb = await recv(B);
check('5. after A.setTrackSubscriptionPermissions(false, [b]) M stops getting A', !m1.a || !m1.a.subscribed || (m1.a.bytes - (m0.a ? m0.a.bytes : 0)) < 200,
  { m0: m0.a, m1: m1.a, mLog: await M.evaluate(() => window.lk.log) });
check('5b. B still receives A', !!(rb.a && rb.a.bytes > 0), rb.a);
check('6. every client sees the full participant list (identities leak who is in voice)', true, { mSees: await M.evaluate(() => window.lk.identities()) });

await browser.close();
web.close();
process.exit(0);
