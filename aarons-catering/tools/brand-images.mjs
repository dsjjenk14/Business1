// Builds the images made from the logo and the chef photo:
//   share.jpg         the preview shown when a link is shared (1200 x 630)
//   favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png
//
//   node tools/brand-images.mjs
//
// Run it again after replacing site/images/logo.png or chef-aaron.jpg.
// Needs Playwright: `npm i -g playwright && npx playwright install chromium`.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { site } from '../src/content/site.mjs';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(join(execSync('npm root -g').toString().trim(), 'playwright'));
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const images = join(root, 'site', 'images');
const data = (file, type) => `data:${type};base64,${readFileSync(join(root, 'site', file)).toString('base64')}`;
const logo = data('images/logo.png', 'image/png');
const chef = data('images/chef-aaron.jpg', 'image/jpeg');
const fonts = `
@font-face { font-family: Anton; src: url(${data('fonts/anton-latin.woff2', 'font/woff2')}) format('woff2'); }
@font-face { font-family: Jakarta; font-weight: 400 700; src: url(${data('fonts/jakarta-latin.woff2', 'font/woff2')}) format('woff2'); }
html, body { margin: 0; }`;

const shareHtml = `<!doctype html><html><head><style>${fonts}
body { width: 1200px; height: 630px; overflow: hidden; background: #0B0B0C; position: relative; font-family: Jakarta; }
.photo { position: absolute; right: 0; top: 0; width: 820px; height: 630px; background: url(${chef}) 100% 25% / cover no-repeat; }
.photo::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, #0B0B0C 0%, rgba(11,11,12,.94) 14%, rgba(11,11,12,.8) 26%, rgba(11,11,12,.55) 38%, rgba(11,11,12,.25) 50%, rgba(11,11,12,.08) 60%, rgba(11,11,12,0) 70%); }
.left { position: absolute; left: 64px; top: 0; bottom: 0; width: 500px; display: flex; flex-direction: column; justify-content: center; }
.left img { height: 250px; width: auto; align-self: flex-start; margin-bottom: 28px; filter: drop-shadow(0 10px 30px rgba(0,0,0,.5)); }
h1 { margin: 0; font-family: Anton; font-weight: 400; font-size: 54px; line-height: 1; letter-spacing: .01em; text-transform: uppercase; color: #F7F5F2; }
p { margin: 18px 0 0; font-size: 18px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #F26A21; }
</style></head><body><div class="photo"></div><div class="left">
<img src="${logo}" alt=""><h1>${site.tagline}</h1><p>Soul food catering &middot; Fairfax, VA</p></div></body></html>`;

const iconHtml = (s) => `<!doctype html><html><head><style>
html, body { margin: 0; }
body { width: ${s}px; height: ${s}px; display: flex; align-items: center; justify-content: center; background: #0B0B0C; }
img { height: ${Math.round(s * 0.9)}px; width: auto; }
</style></head><body><img src="${logo}" alt=""></body></html>`;

const jobs = [
  { file: 'share.jpg', w: 1200, h: 630, html: shareHtml, type: 'jpeg' },
  ...[
    ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ].map(([file, s]) => ({ file, w: s, h: s, html: iconHtml(s), type: 'png' })),
];

const browser = await playwright.chromium.launch();
const page = await browser.newPage();
for (const job of jobs) {
  await page.setViewportSize({ width: job.w, height: job.h });
  await page.setContent(job.html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(images, job.file), type: job.type, ...(job.type === 'jpeg' ? { quality: 84 } : {}) });
}
await browser.close();
console.log(`Made ${jobs.map((j) => j.file).join(', ')}`);
