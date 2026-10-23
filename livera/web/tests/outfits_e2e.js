// End-to-end tests for everyone's three looks (D-079) in the single-player page: the Wardrobe card from the tray at home
// and from the You card, changing look with the server's answer on the card and in `look`, a townsperson's stand-in drawn
// in the colours of the look they're in, a refusal in plain words while walking, and a character with a sprite sheet told
// plainly that a look isn't drawn yet. Run with web/tests/run_solo_e2e.sh outfits_e2e.js. Phone 390x844, desktop 1440x900.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = process.env.LIVERA_SOLO_URL || "http://127.0.0.1:18950/solo/";
const SHOTS = process.env.LIVERA_SHOTS || path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

let failed = 0;
async function test(name, fn, { skipIf } = {}) {
  const t0 = Date.now();
  try {
    const why = skipIf ? await skipIf() : null;
    if (why) { console.log(`SKIP ${name}: ${why}`); return; }
    await fn();
    console.log(`PASS ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack || e.message}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const W = (p, fn, arg) => p.page.evaluate(fn, arg);
const waitFor = (p, fn, arg, timeout = 15000) => p.page.waitForFunction(fn, arg, { timeout, polling: 200 });

async function open(browser, device, label, character) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const p = { ctx, page, label, errors: [] };
  page.on("console", m => { if (m.type() === "error") p.errors.push(`console: ${m.text()}`); });
  page.on("pageerror", e => p.errors.push(`pageerror: ${e.message}`));
  await page.goto(URL);
  await page.waitForSelector("#solo-new", { timeout: 30000 });
  await page.click("#solo-new");
  await page.waitForSelector(".castcard", { timeout: 15000 });
  await page.click(`.castcard[data-character="${character}"]`);
  await waitFor(p, () => window.__livera && window.__livera.phase() === "playing" && window.__livera.world.buildings.length > 0, null, 30000);
  return p;
}
// Life events and cards that open on their own, out of the way (as people_e2e.js).
async function dismiss(p) {
  for (let i = 0; i < 8; i++) {
    const later = await p.page.$(".mo-card.mo-life:not(.mo-done) .mo-foot .btn.link");
    if (later) { await later.click().catch(() => {}); await sleep(200); continue; }
    const done = await p.page.$(".mo-card.mo-done .btn.primary, .mo-card[data-moment] .mo-actions .btn.primary");
    if (done) { await done.click().catch(() => {}); await sleep(200); continue; }
    return;
  }
}
async function goInto(p, search, place) {
  await dismiss(p);
  if (await W(p, () => !!window.__livera.world.self.inside)) {
    const b = (await p.page.$("#exit-btn:visible")) || (await p.page.$("#ctx-btn"));
    assert(b, "no way out of the building on screen");
    await b.click();
    await waitFor(p, () => window.__livera.world.self.inside === "", null, 10000);
  }
  await p.page.click("#places-btn");
  await p.page.fill("#places-search", search);
  await p.page.click(`#places-list li[data-place="${place}"] .place-go`);
  await waitFor(p, want => window.__livera.world.self.inside === want, place, 60000);
}
const feedHas = (p, re, timeout = 8000) =>
  waitFor(p, src => [...document.querySelectorAll("#feed .line")].some(n => new RegExp(src).test(n.textContent)), re.source, timeout);
// The wardrobe card's looks as shown: [{look, wearing, text}].
const shownLooks = p => W(p, () => [...document.querySelectorAll('#sheet[data-kind="wardrobe"] .wd-look')]
  .map(b => ({ look: b.dataset.look, wearing: b.classList.contains("wearing"), pressed: b.getAttribute("aria-pressed"), text: b.textContent })));
const youLook = async p => { const r = await W(p, () => window.__livera.look()); assert(r.ok, "look failed"); return r.data.you.look; };
const standin = (p, id) => W(p, id => fetch("figures/standins.json").then(r => r.json()).then(s => s[id]), id);
// How the room drew someone last frame (interior.js's read-only hook).
const drawnIn = (p, id) => W(p, id => (window.__liveraRoom ? window.__liveraRoom.drawn(id) : null), id);
async function wear(p, look) {
  await p.page.click(`#sheet[data-kind="wardrobe"] .wd-look[data-look="${look}"]`);
  await waitFor(p, l => !!document.querySelector(`#sheet[data-kind="wardrobe"] .wd-look.wearing[data-look="${l}"]`), look, 10000);
}

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, PHONE, "phone", "imani-clarke");
  const ID = "imani-clarke";
  let colours = null;

  await test("phone: at home, the tray's Change clothes opens the Wardrobe: three looks, her own clothes, the one she's drawn in", async () => {
    await dismiss(A);
    await waitFor(A, () => !!document.querySelector('#sheet [data-tray="wardrobe"]'), null, 30000);
    await A.page.screenshot({ path: path.join(SHOTS, "outfits_01_tray.png") });
    await A.page.click('#sheet [data-tray="wardrobe"]');
    await A.page.waitForSelector('#sheet[data-kind="wardrobe"] .wd-look', { timeout: 10000 });
    const looks = await shownLooks(A);
    assert(JSON.stringify(looks.map(l => l.look)) === JSON.stringify(["everyday", "work", "evening"]), "looks: " + JSON.stringify(looks));
    assert(looks.find(l => l.look === "work").wearing, "she isn't shown in her work look (the one she's drawn in)");
    assert(/barista apron/i.test(looks.find(l => l.look === "work").text), "her work look isn't her own clothes: " + looks[1].text);
    assert(/clean/i.test(looks[0].text), "no condition on a look");
    const note = await A.page.textContent('#sheet[data-kind="wardrobe"] .wd-art');
    assert(/stand-in/.test(note), "the card doesn't say she's a stand-in: " + note);
    const wide = await W(A, () => document.documentElement.scrollWidth <= innerWidth);
    assert(wide, "the wardrobe scrolls sideways");
    for (const b of await A.page.$$('#sheet[data-kind="wardrobe"] .wd-look')) {
      const box = await b.boundingBox();
      assert(box.height >= 44 && box.width >= 44, "a look button smaller than 44 px");
    }
    colours = await standin(A, ID);
    assert(colours && colours.looks && colours.looks.evening && colours.looks.everyday, "standins.json has no looks for her");
    await A.page.screenshot({ path: path.join(SHOTS, "outfits_02_wardrobe.png") });
  });

  await test("phone: changing into her going-out clothes: the card and the server agree", async () => {
    await wear(A, "evening");
    const said = await A.page.textContent('#sheet[data-kind="wardrobe"] .wd-result');
    assert(/going-out clothes/.test(said), "the card doesn't say what happened: " + said);
    assert((await youLook(A)) === "evening", "the server doesn't have her in her going-out look");
    const looks = await shownLooks(A);
    assert(looks.filter(l => l.wearing).length === 1 && looks.find(l => l.look === "evening").pressed === "true", "the card shows the wrong look worn");
    await A.page.screenshot({ path: path.join(SHOTS, "outfits_03_evening.png") });
  });

  await test("phone: at Heritage Coffee her stand-in is in her going-out colours; from the You card, everyday, and the colours follow", async () => {
    await goInto(A, "heritage", "heritage_coffee");
    await dismiss(A);
    await waitFor(A, id => window.__liveraRoom && window.__liveraRoom.active() && !!window.__liveraRoom.drawn(id), ID, 20000);
    let d = await drawnIn(A, ID);
    assert(d.look === "evening" && d.colors && d.colors.top === colours.looks.evening.top, "drawn in the wrong colours: " + JSON.stringify(d));
    assert(d.colors.top !== colours.top, "her going-out top is the same colour as her work top");
    await A.page.screenshot({ path: path.join(SHOTS, "outfits_04_cafe_evening.png") });
    await A.page.click("#you-btn");
    await A.page.waitForSelector("#you-wardrobe", { timeout: 5000 });
    await A.page.click("#you-wardrobe");
    await A.page.waitForSelector('#sheet[data-kind="wardrobe"] .wd-look', { timeout: 10000 });
    await wear(A, "everyday");
    await waitFor(A, ([id, top]) => { const d = window.__liveraRoom.drawn(id); return d && d.colors && d.colors.top === top; }, [ID, colours.looks.everyday.top], 10000);
    d = await drawnIn(A, ID);
    assert(d.look === "everyday" && d.colors.bottom === colours.looks.everyday.bottom && d.colors.shoes === colours.looks.everyday.shoes, "not her everyday colours: " + JSON.stringify(d));
    await A.page.click('#sheet[data-kind="wardrobe"] [aria-label="Close"]');
    await A.page.screenshot({ path: path.join(SHOTS, "outfits_05_cafe_everyday.png") });
  });

  await test("phone: changing on the move is refused in plain words, and nothing changes", async () => {
    await A.page.click("#ctx-btn");   // Exit
    await waitFor(A, () => window.__livera.world.self.inside === "", null, 10000);
    await A.page.click("#places-btn");
    await A.page.fill("#places-search", "university");
    await A.page.click('#places-list li[data-place="livera_university"] .place-go');
    await waitFor(A, () => !!window.__livera.world.self.target, null, 10000);
    await A.page.click("#you-btn");
    await A.page.click("#you-wardrobe");
    await A.page.waitForSelector('#sheet[data-kind="wardrobe"] .wd-look', { timeout: 10000 });
    await A.page.click('#sheet[data-kind="wardrobe"] .wd-look[data-look="work"]');
    await feedHas(A, /Stop walking first: you can't change clothes on the move/);
    assert((await youLook(A)) === "everyday", "a refused change changed her clothes");
    await A.page.screenshot({ path: path.join(SHOTS, "outfits_06_refused.png") });
  });

  await test("no console errors on the phone", async () => { assert(!A.errors.length, A.errors.join("\n")); });

  const D = await open(browser, DESKTOP, "desktop", "dominique");
  await test("desktop: Dominique, drawn from her sprite sheet, is told her going-out look isn't drawn yet", async () => {
    await dismiss(D);
    await waitFor(D, () => !!document.querySelector('#sheet [data-tray="wardrobe"]'), null, 30000);
    await D.page.click('#sheet [data-tray="wardrobe"]');
    await D.page.waitForSelector('#sheet[data-kind="wardrobe"] .wd-look', { timeout: 10000 });
    const cols = await W(D, () => getComputedStyle(document.querySelector(".wd-looks")).gridTemplateColumns.split(" ").length);
    assert(cols === 3, `${cols} columns of looks on a desktop`);
    await wear(D, "evening");
    const note = await D.page.textContent('#sheet[data-kind="wardrobe"] .wd-art');
    assert(note.includes("Your going-out look isn't drawn yet: you're drawn in your work look until its sprite sheet is made."), "no plain note: " + note);
    const undrawn = await D.page.$$eval('#sheet[data-kind="wardrobe"] .wd-undrawn', n => n.map(x => x.closest(".wd-look").dataset.look));
    assert(JSON.stringify(undrawn.sort()) === JSON.stringify(["evening", "everyday"]), "not-drawn marks: " + undrawn);
    assert((await youLook(D)) === "evening", "the server doesn't have her in her going-out look");
    await D.page.screenshot({ path: path.join(SHOTS, "outfits_07_desktop_wardrobe.png") });
    await D.page.click('#sheet[data-kind="wardrobe"] [aria-label="Close"]');
    await waitFor(D, () => window.__liveraRoom && window.__liveraRoom.active() && !!window.__liveraRoom.drawn("dominique"), null, 20000);
    const d = await drawnIn(D, "dominique");
    assert(d.frame && d.look === null, "she isn't drawn from her own sheet's frames: " + JSON.stringify(d));
    assert(!D.errors.length, D.errors.join("\n"));
  });

  // Only when a look has its own sheet (none is filed yet: tried with a copy of a sheet, never committed).
  const manifest = await W(D, () => fetch("figures/manifest.json").then(r => r.json()));
  const withLook = Object.entries(manifest).find(([k, e]) => !k.startsWith("$") && e.looks && Object.keys(e.looks).length);
  await test("desktop: a look with its own sprite sheet is drawn from its frames", async () => {
    const [id, e] = withLook, look = Object.keys(e.looks)[0];
    const P = await open(browser, DESKTOP, "desktop-look", id);
    await dismiss(P);
    await P.page.click("#you-btn");
    await P.page.click("#you-wardrobe");
    await P.page.waitForSelector('#sheet[data-kind="wardrobe"] .wd-look', { timeout: 10000 });
    await wear(P, look);
    const note = await P.page.textContent('#sheet[data-kind="wardrobe"] .wd-art');
    assert(!/isn't drawn yet/.test(note), "says the look isn't drawn: " + note);
    await P.page.click('#sheet[data-kind="wardrobe"] [aria-label="Close"]');
    await goInto(P, "heritage", "heritage_coffee");
    await waitFor(P, ([id, look]) => { const d = window.__liveraRoom && window.__liveraRoom.drawn(id); return d && d.look === look && !!d.frame; }, [id, look], 20000);
    await P.page.screenshot({ path: path.join(SHOTS, "outfits_08_look_art.png") });
    assert(!P.errors.length, P.errors.join("\n"));
  }, { skipIf: () => (withLook ? null : "no look has its own sprite sheet yet") });

  await browser.close();
  console.log(failed ? `${failed} failed` : "all passed");
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
