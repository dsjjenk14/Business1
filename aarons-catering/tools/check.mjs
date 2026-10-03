// Checks the built site. Run after `node build.mjs`:
//
//   node tools/check.mjs
//
// 1. Allergens: every dish's allergen line matches what its ingredients say.
// 2. Links and images: every local link, image and #anchor points at something real.
// 3. Pages: one <h1>, a title, a description, alt text on every image.
// 4. Copy: no exclamation points anywhere a visitor can read.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dishes } from '../src/content/dishes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

// ---------- 1. Allergens ----------
// Words that mean an allergen is in the ingredient list. Phrases in `ignore`
// are removed first so they don't trip a false match ("butter beans" has no dairy).
const allergenWords = {
  dairy: ['butter', 'buttermilk', 'milk', 'cream', 'cheese', 'cheddar', 'gouda', 'colby', 'ghee', 'yogurt', 'whey'],
  eggs: ['egg', 'eggs', 'mayonnaise', 'egg yolks'],
  wheat: ['wheat', 'flour', 'semolina', 'bread', 'bun', 'rolls', 'crust', 'wafers', 'croutons', 'breadcrumbs', 'panko'],
  shellfish: ['shrimp', 'crab', 'lobster', 'crawfish', 'oyster', 'scallop'],
  fish: ['fish', 'salmon', 'catfish', 'whiting', 'tilapia', 'anchovy', 'worcestershire'],
  'tree nuts': ['pecan', 'pecans', 'walnut', 'almond', 'cashew', 'pistachio', 'hazelnut'],
  peanuts: ['peanut', 'peanuts'],
  soy: ['soy', 'soybean', 'tofu', 'edamame'],
  sesame: ['sesame', 'tahini'],
};
const ignore = ['butter beans', 'coconut milk', 'cornstarch', 'peanut-free'];

for (const [id, d] of Object.entries(dishes)) {
  let text = d.ingredients.join(', ').toLowerCase();
  for (const phrase of ignore) text = text.split(phrase).join(' ');
  const found = new Set();
  for (const [allergen, words] of Object.entries(allergenWords)) {
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(text))) found.add(allergen);
  }
  const declared = new Set(d.allergens);
  for (const a of found) if (!declared.has(a)) fail(`dish "${id}"`, `ingredients contain ${a} but the allergen line doesn't list it`);
  for (const a of declared) {
    if (!allergenWords[a]) fail(`dish "${id}"`, `unknown allergen "${a}"`);
    else if (!found.has(a)) fail(`dish "${id}"`, `lists ${a} but no ingredient mentions it`);
  }
}

// ---------- 2-4. Built pages ----------
const pages = readdirSync(site).filter((f) => f.endsWith('.html'));
const ids = {};
for (const file of pages) {
  const html = readFileSync(join(site, file), 'utf8');
  ids[file] = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

for (const file of pages) {
  const html = readFileSync(join(site, file), 'utf8');
  const is404 = file === '404.html';

  if ((html.match(/<h1[\s>]/g) || []).length !== 1) fail(file, 'needs exactly one <h1>');
  if (!/<title>[^<]{10,}<\/title>/.test(html)) fail(file, 'missing <title>');
  const desc = html.match(/<meta name="description" content="([^"]*)"/);
  if (!desc) fail(file, 'missing meta description');
  else if (desc[1].length > 170 || desc[1].length < 25) fail(file, `meta description is ${desc[1].length} characters (aim for 120 to 160)`);
  if (!/noindex/.test(html) && !/<link rel="canonical"/.test(html)) fail(file, 'missing canonical link');

  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/\salt="/.test(m[0])) fail(file, `image without alt text: ${m[0].slice(0, 80)}`);
  }

  // Local references
  const refs = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|tel:|data:)/.test(ref)) continue;
    const [pathPart, hash] = ref.split('#');
    const path = pathPart.split('?')[0];
    const target = path === '' ? file : path.replace(/^\//, '');
    if (path && !existsSync(join(site, target))) {
      if (!(is404 && target === '')) fail(file, `broken link or file: ${ref}`);
      continue;
    }
    if (hash && ids[target] && !ids[target].has(hash)) fail(file, `link to missing anchor: ${ref}`);
  }

  // Visible text: strip scripts, styles, comments and tags.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<!doctype[^>]*>/i, ' ')
    .replace(/<[^>]+>/g, ' ');
  const alts = [...html.matchAll(/\s(?:alt|aria-label|title|content|placeholder)="([^"]*)"/g)].map((m) => m[1]).join(' ');
  for (const [i, chunk] of [text, alts].entries()) {
    const bang = chunk.match(/[^\s]{0,30}!(?!=)[^\s]{0,30}/);
    if (bang) fail(file, `exclamation point in ${i ? 'an attribute' : 'visible text'}: "${bang[0]}"`);
  }
}

// The script's own visible strings (form errors, status text)
const js = readFileSync(join(site, 'js', 'site.js'), 'utf8');
for (const m of js.matchAll(/'([^'\n]*[A-Za-z][^'\n]*)'/g)) {
  if (/[A-Za-z]!\s|[A-Za-z]!$/.test(m[1])) fail('js/site.js', `exclamation point in "${m[1]}"`);
}

if (problems.length) {
  console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'}:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`All good: ${Object.keys(dishes).length} dishes, ${pages.length} pages checked.`);
