// N people standing together, all in "say": a full mesh of N*(N-1)/2 links. Checks every link carries audio.
import { createRequire } from 'node:module';
const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');
const N = Number(process.argv[2] || 8);
const BASE = 'http://127.0.0.1:8099';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
if (process.env.WAV) args.push(`--use-file-for-fake-audio-capture=${process.env.WAV}`);
const browser = await chromium.launch({ args });
const ctx = await browser.newContext();
const pages = [];
for (let i = 0; i < N; i++) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/?me=p${i}&x=${100 + i}&y=100`);
  await p.waitForFunction(() => window.voice && window.voice.ready());
  pages.push(p);
}
for (let i = 0; i < N; i++) await fetch(`${BASE}/admin?who=p${i}&mode=say`);
await sleep(6000);
let links = 0, flowing = 0;
for (const p of pages) {
  const s = await p.evaluate(async () => { const o = {}; for (const [k, v] of Object.entries(await window.voice.stats())) o[k] = { st: v.state, in: v.in }; return o; });
  for (const v of Object.values(s)) { links++; if (v.st === 'connected' && v.in > 0) flowing++; }
}
console.log(JSON.stringify({ people: N, expectedDirectedLinks: N * (N - 1), links, flowing }));
await browser.close();
