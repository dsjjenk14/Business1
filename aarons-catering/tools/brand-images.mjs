// Builds the images made from the logo and the chef photo:
//   logo-gold.png     the one-color gold logo the website shows (header and footer)
//   share.jpg         the preview shown when a link is shared (1200 x 630)
//   favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png
//
//   node tools/brand-images.mjs
//
// Run it again after replacing site/images/logo.png or chef-aaron.jpg.
// Needs Playwright: `npm i -g playwright && npx playwright install chromium`.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
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
@font-face { font-family: Playfair; font-weight: 400 700; src: url(${data('fonts/playfair-latin.woff2', 'font/woff2')}) format('woff2'); }
@font-face { font-family: Jakarta; font-weight: 400 700; src: url(${data('fonts/jakarta-latin.woff2', 'font/woff2')}) format('woff2'); }
html, body { margin: 0; }`;

const shareHtml = `<!doctype html><html><head><style>${fonts}
body { width: 1200px; height: 630px; overflow: hidden; background: #0B0B0C; position: relative; font-family: Jakarta; }
.photo { position: absolute; right: 0; top: 0; width: 820px; height: 630px; background: url(${chef}) 100% 25% / cover no-repeat; }
.photo::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, #0B0B0C 0%, rgba(11,11,12,.94) 14%, rgba(11,11,12,.8) 26%, rgba(11,11,12,.55) 38%, rgba(11,11,12,.25) 50%, rgba(11,11,12,.08) 60%, rgba(11,11,12,0) 70%); }
.left { position: absolute; left: 64px; top: 0; bottom: 0; width: 500px; display: flex; flex-direction: column; justify-content: center; }
.left img { height: 250px; width: auto; align-self: flex-start; margin-bottom: 28px; filter: drop-shadow(0 10px 30px rgba(0,0,0,.5)); }
h1 { margin: 0; font-family: Playfair; font-weight: 600; font-size: 52px; line-height: 1.08; letter-spacing: -.01em; color: #F7F5F2; }
p { margin: 20px 0 0; font-size: 15px; font-weight: 600; letter-spacing: .26em; text-transform: uppercase; color: #C9A66B; }
</style></head><body><div class="photo"></div><div class="left">
<img src="${logo}" alt=""><h1>${site.tagline}</h1><p>Soul food catering &middot; DC &middot; MD &middot; VA</p></div></body></html>`;

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

// Gold logo: dark lines stay near-black and everything lighter turns champagne
// gold, so the logo sits in the site's colors. Drawn 240px tall, enough for the
// footer on a sharp phone screen.
await page.setContent('<!doctype html><html><body></body></html>');
const gold = await page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.height = 240;
  c.width = Math.round((img.naturalWidth * c.height) / img.naturalHeight);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const dark = [11, 11, 12];
  const light = [220, 190, 135];
  for (let i = 0; i < d.data.length; i += 4) {
    const t = Math.pow((0.2126 * d.data[i] + 0.7152 * d.data[i + 1] + 0.0722 * d.data[i + 2]) / 255, 0.6);
    for (let k = 0; k < 3; k++) d.data[i + k] = Math.round(dark[k] + (light[k] - dark[k]) * t);
  }
  ctx.putImageData(d, 0, 0);
  return c.toDataURL('image/png');
}, logo);
writeFileSync(join(images, 'logo-gold.png'), Buffer.from(gold.split(',')[1], 'base64'));
for (const job of jobs) {
  await page.setViewportSize({ width: job.w, height: job.h });
  await page.setContent(job.html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(images, job.file), type: job.type, ...(job.type === 'jpeg' ? { quality: 84 } : {}) });
}
await browser.close();
console.log(`Made logo-gold.png, ${jobs.map((j) => j.file).join(', ')}`);
