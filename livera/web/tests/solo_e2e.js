// End-to-end tests for the single-player page: real Chromium playing web/client/solo/ with the
// game core running in the tab (livera_solo.js). Run with run_solo_e2e.sh (it serves web/client
// and sets LIVERA_SOLO_URL). Same conventions as e2e.js: plain Node, PASS / FAIL / SKIP per
// test, non-zero exit on any FAIL. Phone: 390x844, touch, isMobile. Desktop: 1280x800.
//
// What the page is checked for: the town screen (no login), New town → pick Dominique → the
// map draws → the other founders appear as scripted and one of them moves within 60 s of game
// time (the page's fast-forward hook) → tap to walk → Heritage Coffee: go inside, buy → say
// something ("Heard by N" or "Nobody heard you") → save → reload → Continue: balance and
// position survived → export and import the save file → the clock pauses while the tab is
// hidden → change who you play (the picker says who is on autopilot) → the creator → layout at
// phone and desktop sizes → no console errors. The redesign (Release 1) adds: the Next card points
// at the workplace before a shift, an activity shows its need change, Places finds a place, the
// doing-now pill stops a walk, Esc closes the top layer, and nothing overlaps the bottom bar.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = process.env.LIVERA_SOLO_URL || "http://127.0.0.1:18950/solo/";
const SHOTS = process.env.LIVERA_SHOTS || path.join(__dirname, "shots");
const E2E_DIR = process.env.LIVERA_E2E_DIR || SHOTS;
const STANDIN = !!process.env.LIVERA_SOLO_STANDIN;   // a mock module stands in for the wasm build
fs.mkdirSync(SHOTS, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true };
const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const XSS = "<img src=x onerror=alert(1)>";

const results = [];
let failed = 0;
async function test(name, fn, { skipIf } = {}) {
  const t0 = Date.now();
  try {
    const why = skipIf ? await skipIf() : null;
    if (why) { results.push(["SKIP", name, why]); console.log(`SKIP ${name}: ${why}`); return; }
    await fn();
    results.push(["PASS", name]); console.log(`PASS ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failed++; results.push(["FAIL", name, e.message]); console.log(`FAIL ${name}: ${e.stack || e.message}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------ players
const players = [];
async function newPlayer(browser, device, label) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const p = { ctx, page, label, touch: !!device.hasTouch, errors: [], dialogs: [] };
  page.on("console", m => { if (m.type() === "error") p.errors.push(`console: ${m.text()}`); });
  page.on("pageerror", e => p.errors.push(`pageerror: ${e.message}`));
  page.on("dialog", d => { p.dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  players.push(p);
  return p;
}
const W = (p, fn, arg) => p.page.evaluate(fn, arg);
const waitFor = (p, fn, arg, timeout = 15000) => p.page.waitForFunction(fn, arg, { timeout, polling: 200 });
const waitPlaying = p => waitFor(p, () => window.__livera && window.__livera.phase() === "playing" && window.__livera.world.buildings.length > 0, null, 20000);
async function townScreen(p) { await p.page.goto(URL); await p.page.waitForSelector("#solo-new, #solo-continue, #screen .err:not(:empty)", { timeout: 30000 }); }
async function corePos(p) { const r = await W(p, () => window.__livera.look()); assert(r.ok, "look failed: " + JSON.stringify(r.error)); return r.data.you.position; }
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
async function feedHas(p, text, timeout = 8000) {
  await waitFor(p, t => [...document.querySelectorAll("#feed .line")].some(n => (t instanceof RegExp ? t.test(n.textContent) : n.textContent.includes(t))), text, timeout);
}
async function feedMatches(p, re, timeout = 8000) {
  await waitFor(p, src => [...document.querySelectorAll("#feed .line")].some(n => new RegExp(src).test(n.textContent)), re.source, timeout);
}
async function tap(p, cx, cy) { if (p.touch) await p.page.touchscreen.tap(cx, cy); else await p.page.mouse.click(cx, cy); }
async function findPoint(p, candidates, want) {
  for (const [x, y, z] of candidates) {
    const r = await W(p, ([x, y, z]) => {
      const [cx, cy] = window.__livera.project(x, y, z);
      if (cx < 4 || cy < 4 || cx > innerWidth - 4 || cy > innerHeight - 4) return null;
      if (document.elementFromPoint(cx, cy) !== document.getElementById("town")) return null;
      return { cx, cy, hit: window.__livera.hitAt(cx, cy) };
    }, [x, y, z || 0]);
    if (!r) continue;
    if (want === null ? !r.hit : r.hit && r.hit.kind === want.kind && r.hit.id === want.id) return r;
  }
  return null;
}
async function settle(p) {
  let last = null;
  for (let i = 0; i < 30; i++) {
    const now = await W(p, () => window.__livera.project(500, 500));
    if (last && Math.abs(now[0] - last[0]) < 0.5 && Math.abs(now[1] - last[1]) < 0.5) return;
    last = now; await sleep(120);
  }
}
async function tapWorld(p, candidates, want, what) {
  await settle(p);
  const pt = await findPoint(p, candidates, want);
  assert(pt, `no visible point to tap for ${what}`);
  await tap(p, pt.cx, pt.cy);
}
async function groundAround(p, center, ...radii) {
  const c = [];
  for (const radius of radii) for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) c.push([center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius, 0]);
  return c;
}
async function exitBuilding(p) {
  const inside = await W(p, () => window.__livera.world.self.inside);
  if (!inside) return;
  if (!(await p.page.$("#exit-btn"))) await p.page.click("#sheet .mini-pill .btn:last-child");
  else await p.page.click("#exit-btn");
  await waitFor(p, () => window.__livera.world.self.inside === "");
}
async function closeSheet(p) {
  const b = await p.page.$('#sheet:not([hidden]) .sheet-head [aria-label="Close"]');
  if (b) await b.click();
}
// After a failed test the page may be left on the picker: get back into the world as Dominique.
async function ensurePlaying(p) {
  if ((await W(p, () => window.__livera.phase())) === "playing") return;
  if (await p.page.$('.castcard[data-character="dominique"]')) { await p.page.click('.castcard[data-character="dominique"]'); await waitPlaying(p); return; }
  if (await p.page.$("#solo-continue")) { await p.page.click("#solo-continue"); await waitPlaying(p); return; }
  throw new Error("not playing and no way back in from here");
}
async function openMenu(p) { await closeSheet(p); await p.page.click("#menu-btn"); await p.page.waitForSelector("#solo-save"); }
// On a phone the composer is docked behind Talk; on a desktop it's always there.
async function openTalk(p) { if (await p.page.$("#chatbar[hidden]")) await p.page.click("#talk-btn"); await p.page.waitForSelector("#chatbar:not([hidden])"); }
const shot = (p, name) => p.page.screenshot({ path: path.join(SHOTS, name) });
const scripted = p => W(p, () => [...window.__livera.world.people.values()].filter(x => x.scripted && x.pos).map(x => ({ id: x.id, pos: x.pos, target: x.target, inside: x.inside })));

// ------------------------------------------------------------------ the run
(async () => {
  const browser = await chromium.launch();
  const A = await newPlayer(browser, PHONE, "A (phone, Dominique)");
  let price = 0, saved = null, exported = null;

  await test("phone: the town screen has no login; New town → pick Dominique → she starts at home", async () => {
    await townScreen(A);
    assert(!(await A.page.$("#login-user")), "a login form is on the single-player page");
    const text = await A.page.textContent("#screen");
    assert(/How it works/i.test(text) && /Tap the ground to walk/.test(text), "the town screen doesn't say how it works");
    assert(/Single-player: the town runs in your browser\. Nobody else can join this save\./.test(text), "the single-player notice is missing from the town screen");
    assert(/The town pauses while this tab is closed\./.test(text), "the pause notice is missing from the town screen");
    await shot(A, "solo_01_town.png");
    await A.page.click("#solo-new");
    await A.page.waitForSelector(".castcard", { timeout: 15000 });
    const cards = await A.page.$$eval(".castcard", n => n.length);
    assert(cards >= 10, `expected the founding cast, got ${cards} cards`);
    await shot(A, "solo_02_pick.png");
    await A.page.click('.castcard[data-character="dominique"]');
    await waitPlaying(A);
    const me = await W(A, () => ({ id: window.__livera.world.selfId, inside: window.__livera.world.self.inside, auto: window.__liveraSolo.autopilot() }));
    assert(me.id === "dominique", "playing the wrong character: " + me.id);
    assert(me.inside, "a founding character starts at home");
    assert(me.auto.running, "the autopilot isn't running: " + JSON.stringify(me.auto));
    await A.page.waitForSelector('#sheet[data-kind="scene"]');
    const notes = await W(A, () => [document.getElementById("sketch-note").textContent, document.getElementById("solo-note").textContent]);
    assert(/sketches/.test(notes[0]), "the sketch note is missing");
    assert(/Nobody else can join this save/.test(notes[1]), "the single-player note is missing from the HUD");
    // The attribution line is on screen (its short form on a phone; the full sentences open on a tap).
    const attrib = await W(A, () => { const b = document.getElementById("attrib-btn").getBoundingClientRect(); return { h: b.height, w: b.width, text: document.getElementById("attrib-btn").textContent }; });
    assert(attrib.h >= 43.5 && attrib.w > 100 && /single-player/.test(attrib.text), "the attribution line isn't on screen: " + JSON.stringify(attrib));
    await sleep(600);
    await shot(A, "solo_03_home_scene.png");
  });

  await test("the Next card points at the workplace before a shift (from the Calendar)", async () => {
    await waitFor(A, () => { const n = window.__livera.next(); return n && n.target; }, null, 15000);
    const n = await W(A, () => ({ next: window.__livera.next(), work: (window.__livera.world.career || {}).workplaces || [], text: document.getElementById("next").textContent, hidden: document.getElementById("next").hidden }));
    assert(n.work.length, "the career app didn't arrive: " + JSON.stringify(n));
    assert(n.work.includes(n.next.title) || n.next.target === "meridian_talent", `the Next card points at ${JSON.stringify(n.next)}, not the workplace ${n.work}`);
    assert(/From your (Calendar|Career)/.test(n.next.source), "the Next card doesn't say where it comes from: " + n.next.source);
    // A phone with the scene card open keeps the card out of the way; outside it's on screen.
    await A.page.click("#exit-btn");
    await waitFor(A, () => window.__livera.world.self.inside === "" && !document.getElementById("next").hidden);
    const card = await A.page.textContent("#next");
    assert(/Meridian Talent Partners/.test(card) && /Go/.test(card), "the Next card on the map doesn't offer the workplace: " + card);
    // The context button follows on the client's next tick after the exit.
    await waitFor(A, () => /Go/.test(document.getElementById("ctx-btn").textContent), null, 5000).catch(() => {});
    const ctx = await A.page.textContent("#ctx-btn");
    assert(/Go/.test(ctx), "the context button doesn't offer Go to the Next target: " + ctx);
    await shot(A, "solo_03b_next_card.png");
    // Back home for the tests that follow (they start inside).
    await A.page.click("#places-btn");
    await A.page.click('#places-list li[data-place="lexington"] .place-go');
    await waitFor(A, () => window.__livera.world.self.inside === "lexington_1204", null, 20000);
  });

  await test("an activity shows its need change (Take a shower · Hygiene 85 → 100)", async () => {
    await A.page.waitForSelector('#sheet[data-kind="scene"] [data-activity="shower"]');
    const before = await W(A, () => window.__livera.world.self.needs.hygiene);
    await A.page.click('#sheet [data-activity="shower"]');
    await feedMatches(A, /Take a shower · .*Hygiene \d+ → \d+/);
    const line = await W(A, () => [...document.querySelectorAll("#feed .line")].map(n => n.textContent).find(t => /Take a shower/.test(t)));
    const m = /Hygiene (\d+) → (\d+)/.exec(line);
    assert(m && Number(m[2]) > Number(m[1]) && Math.abs(Number(m[1]) - before) <= 2, `the shower's change reads "${line}" (hygiene was ${before})`);
    // The Activity log keeps it.
    await A.page.click("#you-btn");
    await A.page.waitForSelector('#sheet[data-kind="needs"]');
    await shot(A, "solo_03c_you.png");
    await closeSheet(A);
  });

  await test("the map draws (buildings, stops, a lit canvas)", async () => {
    const info = await W(A, () => {
      const w = window.__livera.world, cv = document.getElementById("town"), ctx = cv.getContext("2d");
      const data = ctx.getImageData(0, 0, cv.width, cv.height).data, colors = new Set();
      for (let i = 0; i < data.length; i += 4 * 997) colors.add((data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | (data[i + 2] >> 3));
      return { buildings: w.buildings.length, stops: w.allStops().length, colors: colors.size, places: w.places.length, rules: w.rulesFromServer };
    });
    assert(info.places > 50, `map has ${info.places} places`);
    assert(info.buildings > 30, `only ${info.buildings} buildings`);
    assert(info.stops >= 7, `only ${info.stops} bus stops`);
    assert(info.colors > 40, `canvas looks blank (${info.colors} colours)`);
    assert(info.rules, "the rules didn't arrive with the welcome / map");
  });

  await test("the other founders live on autopilot: scripted people appear and one moves within 60 s of game time", async () => {
    await exitBuilding(A);
    await shot(A, "solo_04_outside.png");
    // Give it a few real seconds first; then fast-forward in 10 s slices up to 60 s of game time.
    const moved = async (before, now) => now.some(n => { const b = before.get(n.id); return n.target || (b && d2(b, n.pos) > 2); });
    let before = new Map(), seen = [], ok = false, advanced = 0;
    for (let i = 0; i < 20 && !ok; i++) {
      await sleep(500);
      seen = await scripted(A);
      for (const s of seen) if (!before.has(s.id)) before.set(s.id, s.pos);
      ok = seen.length > 0 && await moved(before, seen);
    }
    while (!ok && advanced < 60) {
      await W(A, () => window.__liveraSolo.advance(10)); advanced += 10;
      await sleep(300);
      seen = await scripted(A);
      for (const s of seen) if (!before.has(s.id)) before.set(s.id, s.pos);
      ok = seen.length > 0 && await moved(before, seen);
    }
    assert(seen.length > 0, "no scripted founder came into sight (outdoors at the Lexington door) within 60 s of game time");
    assert(ok, `scripted founders in sight but none moved within 60 s of game time: ${JSON.stringify(seen)}`);
    console.log(`  (${seen.length} scripted in sight after ${advanced} s fast-forwarded)`);
    // A scripted person's card says so. They walk, so try a few of them.
    let labelled = false;
    for (const s of seen.slice(0, 6)) {
      await settle(A);
      const face = await W(A, id => window.__livera.tapPoint("person", id), s.id);
      if (!face) continue;
      await tap(A, face[0], face[1]);
      const sheet = await A.page.waitForSelector('#sheet[data-kind="person"]', { timeout: 3000 }).catch(() => null);
      if (!sheet) continue;
      if (await A.page.$('#sheet[data-kind="person"] >> text="played by a script"')) { labelled = true; await shot(A, "solo_05_person.png"); break; }
      await closeSheet(A);
    }
    assert(labelled, "no scripted person's card could be opened with the \"played by a script\" label");
    await closeSheet(A);
  });

  await test("tap the ground to walk: the core moves you", async () => {
    await waitFor(A, () => !window.__livera.world.self.target, null, 20000);
    const p0 = await corePos(A);
    await tapWorld(A, await groundAround(A, p0, 22, 30), null, "ground");
    await waitFor(A, () => !!window.__livera.world.self.target, null, 5000);
    let moved = 0;
    for (let i = 0; i < 40 && moved < 5; i++) { await sleep(250); moved = d2(await corePos(A), p0); }
    assert(moved >= 5, `the core moved you only ${moved.toFixed(1)} m`);
    await waitFor(A, () => !window.__livera.world.self.target, null, 15000);
  });

  await test("enter Heritage Coffee and buy a coffee: money goes down by the price", async () => {
    // A founder walking by between the hit test and the tap takes the tap: close their card and tap again.
    for (let i = 0; ; i++) {
      await tapWorld(A, [[470, 422, 9], [470, 428, 4], [476, 420, 5], [465, 426, 6], [478, 416, 9]], { kind: "place", id: "heritage_coffee" }, "Heritage Coffee");
      if (await A.page.waitForSelector('#sheet[data-kind="place"]', { timeout: 5000 }).then(() => true, () => false)) break;
      assert(i < 2, "tapping Heritage Coffee never opened its card");
      await closeSheet(A);
    }
    await A.page.click('#sheet >> text="Go inside"');
    await waitFor(A, () => window.__livera.world.self.inside === "heritage_coffee", null, 40000);
    await A.page.waitForSelector('#sheet[data-kind="scene"] [data-buy]');
    await waitFor(A, () => !!window.__livera.world.money);
    const offer = await W(A, () => window.__livera.world.here.offers[0]);
    price = offer.price_cents;
    const before = await W(A, () => window.__livera.world.money.bank_cents);
    await shot(A, "solo_06_coffee_scene.png");
    await A.page.click(`#sheet [data-buy="${offer.id}"][data-method="card"]`);
    await feedHas(A, "Bought");
    await waitFor(A, want => window.__livera.world.money && window.__livera.world.money.bank_cents === want, before - price, 10000);
  });

  await test("say something: the honest answer is \"Heard by N\" or \"Nobody heard you\"", async () => {
    await openTalk(A);
    await A.page.fill("#chat-input", `Hello town ${XSS}`);
    await A.page.click("#chat-send");
    await feedMatches(A, /^(Heard by \d+|Nobody heard you)$/);
    const imgs = await W(A, () => document.querySelectorAll('img[src="x"], img:not([src^="faces/"])').length);
    assert(imgs === 0, "an <img> was created from speech");
    assert(!A.dialogs.length, "a dialog opened: " + A.dialogs.join(", "));
  });

  await test("Places search finds Heritage Coffee; the doing-now pill shows a walk and Stop stops it", async () => {
    await exitBuilding(A);
    await closeSheet(A);
    await A.page.click("#places-btn");
    await A.page.waitForSelector('#sheet[data-kind="places"] #places-search');
    await A.page.fill("#places-search", "heritage");
    await waitFor(A, () => document.querySelectorAll("#places-list li").length === 1);
    const row = await A.page.textContent('#places-list li[data-place="heritage_coffee"]');
    assert(/Heritage Coffee/.test(row) && /\d+ m/.test(row), "the search didn't find Heritage Coffee with its distance: " + row);
    await shot(A, "solo_06b_places.png");
    // A long walk: the pill says where you're going, with Stop; Stop ends it where you stand.
    await A.page.fill("#places-search", "university");
    await A.page.click('#places-list li[data-place="livera_university"] .place-go');
    await A.page.waitForSelector("#doing:not([hidden]) #doing-stop", { timeout: 8000 });
    const pill = await A.page.textContent("#doing");
    assert(/Walking to Livéra University/.test(pill), "the doing-now pill says: " + pill);
    assert(/Stop/.test(await A.page.textContent("#ctx-btn")), "the context button isn't Stop while walking");
    await shot(A, "solo_06c_walking.png");
    await sleep(1500);
    await A.page.click("#doing-stop");
    await waitFor(A, () => !window.__livera.world.self.target && document.getElementById("doing").hidden, null, 8000);
    const p1 = await corePos(A);
    await sleep(1500);
    const p2 = await corePos(A);
    assert(d2(p1, p2) < 1, `Stop didn't stop the walk: ${p1} → ${p2}`);
    const uni = await W(A, () => window.__livera.world.placeById.get("livera_university").door);
    assert(d2(p2, uni) > 30, "stopped at the university anyway");
  });

  await test("Save now, then a reload offers Continue: balance and position survive", async () => {
    saved = await W(A, () => ({ bank: window.__livera.world.money.bank_cents, pos: window.__livera.world.self.pos, inside: window.__livera.world.self.inside }));
    await openMenu(A);
    const menu = await A.page.textContent("#sheet");
    assert(/Nobody else can join this save/.test(menu) && /pauses while this tab is closed/.test(menu), "the menu lacks the single-player notices");
    assert(/autopilot/.test(menu), "the menu doesn't explain the autopilot");
    await shot(A, "solo_07_menu.png");
    await A.page.click("#solo-save");
    await feedHas(A, "Saved to this browser");
    const s = await W(A, () => ({ last: window.__liveraSolo.lastSave(), backend: window.__liveraSolo.backend(), rec: window.__liveraSolo.record() }));
    assert(s.last && s.last.how === "manual" && s.rec && s.rec.character === "dominique", "the save didn't record: " + JSON.stringify(s));
    console.log(`  (saved to ${s.backend})`);
    await A.page.reload();
    await A.page.waitForSelector("#solo-continue", { timeout: 30000 });
    const text = await A.page.textContent("#screen");
    assert(/playing Dominique Ashford/.test(text), "the town screen doesn't name who was being played: " + text.slice(0, 200));
    await shot(A, "solo_08_continue.png");
    await A.page.click("#solo-continue");
    await waitPlaying(A);
    await waitFor(A, () => !!window.__livera.world.money);
    const after = await W(A, () => ({ id: window.__livera.world.selfId, bank: window.__livera.world.money.bank_cents, pos: window.__livera.world.self.pos, inside: window.__livera.world.self.inside }));
    assert(after.id === "dominique", "continued as " + after.id);
    assert(after.bank === saved.bank, `the balance didn't survive: ${after.bank} vs ${saved.bank}`);
    assert(after.inside === saved.inside, `the place didn't survive: ${after.inside} vs ${saved.inside}`);
    assert(d2(after.pos, saved.pos) < 1, `the position didn't survive: ${after.pos} vs ${saved.pos}`);
    const core = await corePos(A);
    assert(d2(core, saved.pos) < 1, `the core's position after the load is ${core}, saved ${saved.pos}`);
  });

  await test("export writes the save as a JSON file; Start over asks first; import reads the file back", async () => {
    await openMenu(A);
    const [download] = await Promise.all([A.page.waitForEvent("download", { timeout: 10000 }), A.page.click("#solo-export")]);
    exported = path.join(E2E_DIR, download.suggestedFilename());
    await download.saveAs(exported);
    const rec = JSON.parse(fs.readFileSync(exported, "utf8"));
    assert(rec.format === "livera-solo-save/1" && rec.character === "dominique" && rec.state && typeof rec.state === "object", "the exported file isn't a save record: " + Object.keys(rec));
    assert("format" in rec.state, "the world state inside the save has no `format` field");
    console.log(`  (${download.suggestedFilename()}, ${fs.statSync(exported).size} bytes)`);
    // Start over: a confirm step, then a fresh town and the picker.
    await A.page.click("#solo-start-over");
    await A.page.waitForSelector("#solo-start-over-yes");
    await A.page.click("#solo-start-over-yes");
    await A.page.waitForSelector(".castcard", { timeout: 15000 });
    await A.page.click("#solo-back");
    await A.page.waitForSelector("#solo-new");
    assert(!(await A.page.$("#solo-continue")), "Start over left the old save in place");
    // Import the file: back in the café with the same balance.
    await A.page.setInputFiles("#solo-import-file", exported);
    await waitPlaying(A);
    await waitFor(A, () => !!window.__livera.world.money);
    const after = await W(A, () => ({ id: window.__livera.world.selfId, bank: window.__livera.world.money.bank_cents, inside: window.__livera.world.self.inside }));
    assert(after.id === "dominique" && after.bank === saved.bank && after.inside === saved.inside, "the imported save differs: " + JSON.stringify({ after, saved }));
    await A.page.reload();
    await A.page.waitForSelector("#solo-continue", { timeout: 30000 });
    await A.page.click("#solo-continue");
    await waitPlaying(A);
  });

  await test("the clock pauses while the tab is hidden (and the game saves); it goes on when the tab is back", async () => {
    const hide = hidden => W(A, hidden => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
    const t0 = await W(A, () => window.__liveraSolo.ticks());
    await hide(true);
    await sleep(2600);
    const t1 = await W(A, () => ({ ticks: window.__liveraSolo.ticks(), save: window.__liveraSolo.lastSave() }));
    assert(t1.ticks - t0 <= 1, `the world ticked ${t1.ticks - t0} times while hidden`);
    assert(t1.save && t1.save.how === "hidden", "hiding the tab didn't save: " + JSON.stringify(t1.save));
    await hide(false);
    await feedHas(A, "paused while this tab was in the background", 4000);
    await sleep(1000);
    const t2 = await W(A, () => window.__liveraSolo.ticks());
    assert(t2 > t1.ticks + 3, "the world didn't go on after the tab came back");
  });

  await test("change who you play: the picker says who is on autopilot; the one you leave joins them", async () => {
    // The core labels a founder "scripted" while the autopilot has them in the world: from their
    // wake time to bedtime. Founders still asleep at this hour are offline and unlabelled, so the
    // badges are compared with the core's own status report where the build has one.
    const status = await W(A, () => window.__liveraSolo.autopilotStatus());
    const awake = status.ok && status.data && typeof status.data === "object" ? Object.entries(status.data).filter(([, v]) => v && v.playing).map(([id]) => id).sort() : null;
    await openMenu(A);
    await A.page.click("#solo-change");
    await A.page.waitForSelector(".castcard", { timeout: 15000 });
    const badges = (await A.page.$$eval(".castcard .badge.script", n => n.map(b => b.closest(".castcard").dataset.character))).sort();
    assert(badges.length >= 1 && !badges.includes("dominique"), "the picker doesn't mark the autopilot founders: " + JSON.stringify(badges));
    if (awake) assert(JSON.stringify(badges) === JSON.stringify(awake), `the picker marks ${JSON.stringify(badges)} but the autopilot has ${JSON.stringify(awake)} in the world`);
    console.log(`  (${badges.length} founders marked on autopilot${awake ? ", matching the core's status" : ""})`);
    await A.page.click('.castcard[data-character="aaliyah"]');
    await waitPlaying(A);
    assert((await W(A, () => window.__livera.world.selfId)) === "aaliyah", "didn't switch to Aaliyah");
    await openMenu(A);
    await A.page.click("#solo-change");
    await A.page.waitForSelector(".castcard", { timeout: 15000 });
    assert(await A.page.$('.castcard[data-character="dominique"] .badge.script'), "Dominique isn't on autopilot after being left");
    assert(!(await A.page.$('.castcard[data-character="aaliyah"] .badge.script')), "Aaliyah is marked on autopilot while being left just now");
    await A.page.click('.castcard[data-character="dominique"]');
    await waitPlaying(A);
  });

  await test("the phone opens: the bank matches the top bar; the map app shows a place", async () => {
    await ensurePlaying(A);
    await A.page.click("#phone-btn");
    await A.page.waitForSelector("#phone .app");
    // The everyday seven on the home screen (D-074); the rest under More apps.
    const apps = await A.page.$$eval("#phone .app", x => x.length);
    assert(apps === 7, `expected the seven everyday apps on the home screen, got ${apps}`);
    await A.page.click("#phone [data-more]");
    await A.page.waitForSelector('#phone [data-app="story"]');
    const more = await A.page.$$eval("#phone .app", x => x.length);
    assert(more >= 20, `expected the other apps under More apps (20, the coin store hidden in single-player), got ${more}`);
    await A.page.click('#phone [aria-label="Back to apps"]');
    await A.page.click('#phone [data-app="bank"]');
    await A.page.waitForSelector('#phone >> text="Balances"');
    await shot(A, "solo_09_bank.png");
    await A.page.click('#phone [aria-label="Back to apps"]');
    await A.page.click('#phone [data-app="map"]');
    // Heritage Coffee: under Open now when it's open and near, else under All places (D-074's Map).
    await A.page.waitForSelector("#phone svg.minimap");
    const open = await A.page.$('#phone [data-open="heritage_coffee"]');
    if (!open) await A.page.click("#phone .all-places > summary");
    await A.page.click(open ? '#phone [data-open="heritage_coffee"] >> text="Show"' : '#phone .all-places li:has-text("Heritage Coffee") >> text="Show"');
    await A.page.waitForSelector('#sheet[data-kind="place"]');
    await closeSheet(A);
  });

  await test("Esc closes the top layer: the phone, then a card", async () => {
    await ensurePlaying(A);
    const phone = await A.page.$('#phone:not([hidden]) [aria-label="Close phone"]');
    if (phone) await phone.click();
    await exitBuilding(A);
    await A.page.click("#phone-btn");
    await A.page.waitForSelector("#phone:not([hidden])");
    await A.page.keyboard.press("Escape");
    await waitFor(A, () => document.getElementById("phone").hidden, null, 3000);
    await A.page.click("#you-btn");
    await A.page.waitForSelector('#sheet[data-kind="needs"]');
    await A.page.keyboard.press("Escape");
    await waitFor(A, () => document.getElementById("sheet").hidden, null, 3000);
    const live = await W(A, () => document.getElementById("sheet").getAttribute("aria-live"));
    assert(!live, "the card is still a live region");
  });

  await test("phone layout: 44 px tap targets, 16 px inputs, no sideways scroll, nothing overlapping", async () => {
    await ensurePlaying(A);
    const phone = await A.page.$('#phone:not([hidden]) [aria-label="Close phone"]');
    if (phone) await phone.click();
    await closeSheet(A);
    const r = await W(A, () => {
      const vis = n => { const b = n.getBoundingClientRect(); const s = getComputedStyle(n); return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
      const small = [...document.querySelectorAll("#hud button, #chatbar button, #mapctl button, #sheet button, #chatbar input, #bar button, #next button, #doing button, #attrib button")].filter(vis)
        .filter(n => { const b = n.getBoundingClientRect(); return b.height < 43.5 || b.width < 43.5; }).map(n => `${n.tagName}:${(n.textContent || n.getAttribute("aria-label") || "").trim().slice(0, 20)} ${Math.round(n.getBoundingClientRect().width)}x${Math.round(n.getBoundingClientRect().height)}`);
      const fonts = [...document.querySelectorAll("input, select, textarea")].filter(vis).filter(n => parseFloat(getComputedStyle(n).fontSize) < 16).length;
      const box = id => { const n = document.getElementById(id); return n && !n.hidden ? n.getBoundingClientRect() : null; };
      const hit = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const topbar = document.querySelector("#hud .topbar").getBoundingClientRect(), chat = box("chatbar"), ctl = box("mapctl"), hud = box("hud");
      // Nothing overlaps the bottom bar: the Next card, the attribution, the composer, the pill, the map controls, the feed.
      const bar = box("bar"), others = ["next", "attrib-btn", "chatbar", "doing", "mapctl", "sheet", "needs", "faces"].map(id => [id, box(id)]).filter(([, b]) => b && b.height)
        .concat([...document.querySelectorAll("#feed .line")].map(n => ["feed", n.getBoundingClientRect()]));
      const onBar = others.filter(([, b]) => hit(bar, b)).map(([id]) => id);
      return { small, fonts, scroll: document.documentElement.scrollWidth - innerWidth, overlap: [hit(topbar, chat), hit(topbar, ctl), hit(ctl, chat), hit(ctl, box("next"))].filter(Boolean).length, hudBottom: hud && hud.bottom, onBar, bar: !!bar };
    });
    assert(r.bar, "the bottom bar isn't on screen");
    assert(!r.onBar.length, "these overlap the bottom bar: " + r.onBar.join(", "));
    assert(!r.small.length, "tap targets under 44 px: " + r.small.join("; "));
    assert(r.fonts === 0, `${r.fonts} inputs under 16 px`);
    assert(r.scroll <= 0, `page scrolls sideways by ${r.scroll}px`);
    assert(r.overlap === 0, "top bar, map controls and chat bar overlap");
    assert(r.hudBottom < 240, `the top of the screen takes ${Math.round(r.hudBottom)} px`);
    // Talk docks the composer above the bar, still clear of it.
    await openTalk(A);
    const t = await W(A, () => { const a = document.getElementById("chatbar").getBoundingClientRect(), b = document.getElementById("bar").getBoundingClientRect(); return { chatBottom: a.bottom, barTop: b.top }; });
    assert(t.chatBottom <= t.barTop + 0.5, "the composer overlaps the bottom bar: " + JSON.stringify(t));
    await shot(A, "solo_10b_talk.png");
    await A.page.click("#talk-btn");
    await shot(A, "solo_10_map.png");
  });

  await test("desktop: the town screen, a new town and the map at 1280x800", async () => {
    const B = await newPlayer(browser, DESKTOP, "B (desktop)");
    await townScreen(B);
    await B.page.click("#solo-new");
    await B.page.waitForSelector(".castcard", { timeout: 15000 });
    await B.page.click('.castcard[data-character="dax"]');
    await waitPlaying(B);
    await exitBuilding(B);
    await sleep(500);
    await shot(B, "solo_desktop_01_map.png");
    const r = await W(B, () => {
      const box = sel => { const n = document.querySelector(sel); return n && !n.hidden ? n.getBoundingClientRect() : null; };
      const hit = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const t = box("#hud .topbar"), c = box("#chatbar"), m = box("#mapctl"), b = box("#bar"), n = box("#next"), a = box("#attrib-btn");
      return { overlap: [hit(t, c), hit(t, m), hit(m, c), hit(b, m), hit(b, n), hit(b, c), hit(a, m), hit(a, b)].filter(Boolean).length, scroll: document.documentElement.scrollWidth - innerWidth,
        chat: !!c, attrib: a && document.getElementById("attrib-btn").textContent };
    });
    assert(r.overlap === 0 && r.scroll <= 0, JSON.stringify(r));
    assert(r.chat, "the composer isn't docked on a desktop");
    assert(/Nobody else can join this save/.test(r.attrib), "the desktop attribution doesn't carry the single-player sentence");
  });

  await test("character creator: a form from creator_options makes a playable character", async () => {
    const D = await newPlayer(browser, PHONE, "D (phone, creator)");
    await townScreen(D);
    await D.page.click("#solo-new");
    await D.page.waitForSelector("#create-btn", { timeout: 15000 });
    await D.page.click("#create-btn");
    const form = await D.page.waitForSelector("form.creator, #screen .err:not(:empty)", { timeout: 15000 });
    const err = await D.page.$("#screen .err:not(:empty)");
    if (err && !(await D.page.$("form.creator"))) throw new Error("creator_options refused: " + (await err.textContent()));
    assert(form, "no creator form");
    await shot(D, "solo_11_creator.png");
    // The quick start: a name is enough (the rest has legal values, or is picked at random on submit).
    const inputs = await D.page.$$("form.creator fieldset:first-of-type input[type=text]");
    await inputs[0].fill("Robin"); await inputs[1].fill("Vale");
    await D.page.click('form.creator button[type="submit"]');
    await waitPlaying(D);
    const name = await W(D, () => window.__livera.world.selfName);
    assert(name === "Robin Vale", "created character is " + name);
    await shot(D, "solo_12_created.png");
  });

  await test("no console errors and no dialogs in any browser", async () => {
    const bad = players.flatMap(p => [...p.errors.map(e => `${p.label}: ${e}`), ...p.dialogs.map(d => `${p.label}: dialog ${d}`)]);
    assert(!bad.length, bad.join("\n"));
  });

  await browser.close();
  console.log(`\n${results.filter(r => r[0] === "PASS").length} passed, ${failed} failed, ${results.filter(r => r[0] === "SKIP").length} skipped${STANDIN ? " (against a stand-in module, not the wasm build)" : ""}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
