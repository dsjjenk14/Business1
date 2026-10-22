// End-to-end tests for the town's people (D-073) in the single-player page: the pick list grouped by who people are
// to the town, a townsperson with no art drawn as a stand-in in their own colours and saying so on their card, and the
// Copper Tap full in the evening. Run with web/tests/run_solo_e2e.sh people_e2e.js. Phone 390x844 and desktop 1440x900.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = process.env.LIVERA_SOLO_URL || "http://127.0.0.1:18950/solo/";
const SHOTS = process.env.LIVERA_SHOTS || path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

let failed = 0;
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); console.log(`PASS ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack || e.message}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const W = (p, fn, arg) => p.page.evaluate(fn, arg);

async function open(browser, device, label) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const p = { ctx, page, label, errors: [] };
  page.on("console", m => { if (m.type() === "error") p.errors.push(`console: ${m.text()}`); });
  page.on("pageerror", e => p.errors.push(`pageerror: ${e.message}`));
  await page.goto(URL);
  await page.waitForSelector("#solo-new", { timeout: 30000 });
  await page.click("#solo-new");
  await page.waitForSelector(".castcard", { timeout: 15000 });
  return p;
}
async function dismiss(p) {
  for (let i = 0; i < 8; i++) {
    const later = await p.page.$(".mo-card.mo-life:not(.mo-done) .mo-foot .btn.link");
    if (later) { await later.click().catch(() => {}); await sleep(200); continue; }
    const done = await p.page.$(".mo-card.mo-done .btn.primary, .mo-card[data-moment] .mo-actions .btn.primary");
    if (done) { await done.click().catch(() => {}); await sleep(200); continue; }
    const close = await p.page.$('#sheet:not([hidden]) .sheet-head [aria-label="Close"]');
    if (close) { await close.click().catch(() => {}); await sleep(200); continue; }
    return;
  }
}
async function minuteOfDay(p) { const l = await W(p, () => window.__livera.look()); return l.data.time.minute % 1440; }
// Fast-forwards to hh:mm: the page's hook takes real seconds, at the data's game minutes a second.
async function advanceTo(p, hh, mm) {
  const rate = await W(p, () => (window.__livera.world.rules && window.__livera.world.rules.minutes_per_real_second) || 1);
  for (let g = 0; g < 4000; g++) {
    const m = await minuteOfDay(p);
    if (m >= hh * 60 + mm) return;
    await W(p, s => window.__liveraSolo.advance(s), Math.max(0.5, Math.min(20, (hh * 60 + mm - m) / rate)));
    await W(p, () => window.__liveraSolo.care());  // hours skipped without eating would end in the hospital (D-080)
    if (g % 5 === 0) await dismiss(p);
  }
}
async function goInto(p, search, place) {
  await dismiss(p);
  if (await W(p, () => !!window.__livera.world.self.inside)) {
    // As solo_e2e.js: the Exit button, or the scene pill's exit when the card is open.
    const b = (await p.page.$("#exit-btn:visible")) || (await p.page.$("#ctx-btn"));
    assert(b, "no way out of the building on screen");
    await b.click();
    await p.page.waitForFunction(() => window.__livera.world.self.inside === "", null, { timeout: 10000 });
  }
  await p.page.click("#places-btn");
  await p.page.fill("#places-search", search);
  await p.page.click(`#places-list li[data-place="${place}"] .place-go`);
  await p.page.waitForFunction(want => window.__livera.world.self.inside === want, place, { timeout: 60000 });
}

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, PHONE, "phone");

  await test("phone: the pick list has the whole town, grouped: founders, residents, townspeople", async () => {
    const heads = await A.page.$$eval(".cast-head", n => n.map(h => h.dataset.cast));
    assert(JSON.stringify(heads) === JSON.stringify(["founder", "resident", "townsperson"]), "groups: " + heads);
    const cards = await A.page.$$eval(".castcard", n => n.map(c => c.dataset.character));
    assert(cards.length === 27, `${cards.length} cards`);
    for (const id of ["kai-morgan", "bernie-walsh", "marcus-bell"]) assert(cards.includes(id), "no card for " + id);
    const wide = await W(A, () => document.documentElement.scrollWidth <= innerWidth);
    assert(wide, "the pick list scrolls sideways");
    await A.page.screenshot({ path: path.join(SHOTS, "people_01_pick.png"), fullPage: true });
  });

  await test("phone: Tess Osei at the hospital is a stand-in in her colours, and her card says so", async () => {
    await A.page.click('.castcard[data-character="dominique"]');
    await A.page.waitForFunction(() => window.__livera && window.__livera.phase() === "playing", null, { timeout: 30000 });
    await advanceTo(A, 11, 30);
    await goInto(A, "general", "livera_general");
    await advanceTo(A, 12, 30);
    await dismiss(A);
    await A.page.screenshot({ path: path.join(SHOTS, "people_02_hospital.png") });
    // The full card lists who's here (the tray's More, D-078).
    if (!(await A.page.$('#sheet:not([hidden]) .person[data-person="tess-osei"]'))) await A.page.click('#sheet [data-tray="more"]');
    await A.page.waitForSelector('#sheet .person[data-person="tess-osei"]', { timeout: 15000 });
    await A.page.click('#sheet .person[data-person="tess-osei"]');
    await A.page.waitForSelector('#sheet[data-kind="person"] [data-art="standin"]', { timeout: 5000 });
    const text = await A.page.textContent('#sheet[data-kind="person"]');
    assert(/played by a script/.test(text), "Tess's card doesn't say a script plays her: " + text);
    assert(/stand-in in their own colours/.test(text), "the card doesn't say she's a stand-in");
    await A.page.screenshot({ path: path.join(SHOTS, "people_03_standin_card.png") });
    await dismiss(A);
  });

  await test("phone: the Copper Tap has its bartender and patrons in the evening", async () => {
    await advanceTo(A, 18, 50);
    await goInto(A, "copper", "copper_tap");
    await advanceTo(A, 19, 45);
    await dismiss(A);
    await sleep(600);
    const inside = await W(A, () => { const r = window.__livera.world.here && window.__livera.world.here.room; return r && r.people ? r.people.map(p => p.id) : []; });
    assert(inside.includes("bernie-walsh"), "Bernie isn't behind the bar: " + inside);
    const others = inside.filter(id => id !== "bernie-walsh" && id !== "dominique");
    assert(others.length >= 2, "fewer than two patrons: " + inside);
    await A.page.screenshot({ path: path.join(SHOTS, "people_04_coppertap_evening.png") });
  });

  await test("no console errors on the phone", async () => { assert(!A.errors.length, A.errors.join("\n")); });

  const D = await open(browser, DESKTOP, "desktop");
  await test("desktop: the grouped pick list fits, two columns", async () => {
    const cols = await W(D, () => getComputedStyle(document.querySelector(".cast")).gridTemplateColumns.split(" ").length);
    assert(cols === 2, `${cols} columns`);
    await D.page.screenshot({ path: path.join(SHOTS, "people_05_pick_desktop.png") });
    assert(!D.errors.length, D.errors.join("\n"));
  });

  await browser.close();
  console.log(failed ? `${failed} failed` : "all passed");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
