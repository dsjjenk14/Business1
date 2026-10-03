// Draws the labeled placeholder photos in site/images/.
// Only needed again if you add a new photo slot to src/content/photos.mjs.
//
//   node tools/placeholders.mjs            # creates any photo that doesn't exist yet
//   node tools/placeholders.mjs --force    # redraws every placeholder
//
// Slots with a `source` (real photos from the flyers, or images made by
// tools/brand-images.mjs) are never drawn over, even with --force.
//
// Needs Playwright: `npm i -g playwright && npx playwright install chromium`.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { photos, gallery, instagramTiles } from '../src/content/photos.mjs';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const images = join(root, 'site', 'images');
const force = process.argv.includes('--force');

const font = (f) => `data:font/woff2;base64,${readFileSync(join(root, 'site', 'fonts', f)).toString('base64')}`;
const fontCss = `
@font-face { font-family: Anton; src: url(${font('anton-latin.woff2')}) format('woff2'); }
@font-face { font-family: Jakarta; font-weight: 400 700; src: url(${font('jakarta-latin.woff2')}) format('woff2'); }
html, body { margin: 0; }`;

const tones = ['#2b1a10', '#281511', '#22170f', '#2a1c13', '#26130f', '#1f1712'];

function photoHtml(p, i) {
  const u = Math.min(p.w, p.h) / 100; // 1% of the short side
  const tone = tones[i % tones.length];
  const k = p.compact ? 0.62 : 1; // hero shots: smaller text, kept clear of the headline
  return `<!doctype html><html><head><style>${fontCss}
body { width:${p.w}px; height:${p.h}px; overflow:hidden; font-family: Jakarta; color:#F7F5F2;
  background:
    repeating-linear-gradient(135deg, rgba(247,245,242,.025) 0 ${u * 1.2}px, transparent ${u * 1.2}px ${u * 2.4}px),
    radial-gradient(ellipse 80% 70% at 50% 38%, ${tone} 0%, #141112 65%, #0B0B0C 100%); }
.frame { position:absolute; inset:${u * 4}px; border:${Math.max(2, u * 0.25)}px dashed rgba(247,245,242,.22); }
.wrap { position:absolute; left:${u * 9}px; right:${u * 9}px; top:${u * 9}px; bottom:${u * 9}px; display:flex; flex-direction:column; }
${p.compact ? `.wrap { left:25%; right:25%; top:${u * 12}px; align-items:center; text-align:center; }` : ''}
.tag { font-weight:700; font-size:${u * 3 * k}px; letter-spacing:.2em; color:#F26A21; text-transform:uppercase; }
.shot { margin-top:${u * 4 * k}px; font-size:${u * 4.6 * k}px; line-height:1.35; max-width:30em; color:rgba(247,245,242,.9); }
.file { margin-top:${p.compact ? `${u * 3}px` : 'auto'}; font-size:${u * 2.8 * k}px; color:rgba(247,245,242,.5); letter-spacing:.04em; }
.file b { font-weight:700; color:rgba(247,245,242,.75); }
</style></head><body><div class="frame"></div><div class="wrap">
<div class="tag">Photo placeholder</div>
${p.compact ? '' : `<div class="shot">${p.shot}</div>`}
<div class="file"><b>images/${p.file}</b> &middot; ${p.w} &times; ${p.h}</div>
</div></body></html>`;
}



const jobs = [
  ...Object.values(photos).map((p, i) => ({ ...p, html: photoHtml(p, i) })),
  ...gallery.map((p, i) => ({ ...p, html: photoHtml(p, i + 2) })),
  ...instagramTiles.map((p, i) => ({ ...p, html: photoHtml(p, i + 4) })),
].filter((job) => !job.source);

const browser = await playwright.chromium.launch();
const page = await browser.newPage();
let made = 0;
for (const job of jobs) {
  const target = join(images, job.file);
  if (existsSync(target) && !force) continue;
  await page.setViewportSize({ width: job.w, height: job.h });
  await page.setContent(job.html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: target, type: 'jpeg', quality: 72 });
  made++;
}
await browser.close();
console.log(`Drew ${made} placeholder photo${made === 1 ? '' : 's'} into site/images/`);
