// End-to-end tests for rooms you walk around in (D-066, web/client/interior.js) on the single-player page: the game
// core in the tab answers move_inside / sit / stand exactly as the server would. Run with run_solo_e2e.sh:
//
//   livera/web/tests/run_solo_e2e.sh interiors_e2e.js
//
// Phone (390x844, touch) then desktop (1440x900): New town → Dominique → Heritage Coffee from Places → the room
// covers the town, lit by the clock → tap a chair (the server seats her: look.here.room; it faces away from the
// camera, so she's her standing back frame lowered onto it) → tap the Chesterfield (her seated sofa frame from her
// sprite sheet, anchored on the seat, legs and all: D-072) → tap the counter (the scene card's Buy) → buy (served at
// the counter) → tap the floor (move_inside) → Stand up → the map button shows the town and back → the stage asks for
// a song → Exit by tapping the door → the town again. Then two people in one room through Play together's stand-in
// platform: one sits (the other sees her seated chair frame), the other sees it and is refused that chair until she
// leaves. No console errors.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = process.env.LIVERA_SOLO_URL || "http://127.0.0.1:18950/solo/";
const SHOTS = process.env.LIVERA_SHOTS || path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

const results = [];
let failed = 0;
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push(["PASS", name]); console.log(`PASS ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
  catch (e) {
    failed++; results.push(["FAIL", name, e.message]); console.log(`FAIL ${name}: ${e.stack || e.message}`);
    for (const p of players) await p.page.screenshot({ path: path.join(SHOTS, `room_FAIL_${failed}_${p.label}.png`) }).catch(() => {});
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const players = [];
async function newPlayer(browser, device, label) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const p = { ctx, page, label, touch: !!device.hasTouch, errors: [] };
  page.on("console", m => { if (m.type() === "error") p.errors.push(`console: ${m.text()}`); });
  page.on("pageerror", e => p.errors.push(`pageerror: ${e.message}`));
  page.on("dialog", d => { p.errors.push(`dialog: ${d.message()}`); d.dismiss().catch(() => {}); });
  players.push(p);
  return p;
}
const W = (p, fn, arg) => p.page.evaluate(fn, arg);
const waitFor = (p, fn, arg, timeout = 15000) => p.page.waitForFunction(fn, arg, { timeout, polling: 150 });
async function tap(p, xy) { if (p.touch) await p.page.touchscreen.tap(xy[0], xy[1]); else await p.page.mouse.click(xy[0], xy[1]); }
const look = async p => { const r = await W(p, () => window.__livera.look()); assert(r.ok, "look failed"); return r.data; };
const meInRoom = async p => { const l = await look(p); return ((l.here.room || {}).people || []).find(x => x.id === l.you.id) || null; };

async function start(p) {
  await p.page.goto(URL);
  await p.page.waitForSelector("#solo-new", { timeout: 30000 });
  await p.page.click("#solo-new");
  await p.page.waitForSelector('.castcard[data-character="dominique"]', { timeout: 15000 });
  await p.page.click('.castcard[data-character="dominique"]');
  await waitFor(p, () => window.__livera && window.__livera.phase() === "playing" && window.__livera.world.buildings.length > 0, null, 20000);
}
// Places → Heritage Coffee → Go: she walks there (the clock fast-forwarded) and goes in.
async function goInside(p, place) {
  if (await W(p, () => !!window.__livera.world.self.inside)) {
    if (await p.page.$("#exit-btn")) await p.page.click("#exit-btn"); else await p.page.click("#sheet .mini-pill .btn:last-child");
    await waitFor(p, () => window.__livera.world.self.inside === "");
  }
  if (!(await p.page.$("#places-search"))) await p.page.click("#places-btn");
  await p.page.fill("#places-search", place.name);
  await p.page.click(`#places-list li[data-place="${place.id}"] .place-go`);
  for (let i = 0; i < 80; i++) {
    if (await W(p, id => window.__livera.world.self.inside === id, place.id)) return;
    await W(p, () => window.__liveraSolo.advance(2));
    await sleep(150);
  }
  throw new Error(`never got inside ${place.id}`);
}
const roomActive = p => waitFor(p, () => window.__liveraRoom && window.__liveraRoom.active(), null, 15000);
// A life event's card (moments.js, D-068) can come up whenever the clock allows (sooner since D-075): "Later" keeps it
// in the phone and out of the way of the taps this test is about.
async function later(p) {
  for (let i = 0; i < 3; i++) {
    const b = await p.page.$("#moments .mo-later-x");
    if (!b || !(await b.isVisible().catch(() => false))) return;
    await b.click().catch(() => {});
    await sleep(400);
  }
}
// The room eases into place when a card opens or closes: wait until it holds still before aiming a tap.
async function settled(p) {
  let last = null;
  for (let i = 0; i < 40; i++) {
    const v = await W(p, () => window.__liveraRoom.view());
    if (v && last && Math.abs(v.s - last.s) < 1e-4 && Math.abs(v.ox - last.ox) < 0.3 && Math.abs(v.oy - last.oy) < 0.3) return;
    last = v; await sleep(100);
  }
}
// A point is tappable when the room itself is what's under it (toasts and cards come and go over it).
const onRoom = (p, pt) => W(p, ([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && e.id === "room"; }, pt);
async function tapSpot(p, id) {
  await later(p);
  await settled(p);
  // Off the edge of a phone's screen: pan to it first, as a drag would.
  const vis = await W(p, id => { const q = window.__liveraRoom.spotPoint(id); return q && q[0] > 30 && q[1] > 120 && q[0] < innerWidth - 30 && q[1] < innerHeight - 260; }, id);
  if (!vis) { await W(p, id => { const s = window.__livera.world.here.room.interior.spots.find(x => x.id === id); return window.__liveraRoom.centerOn(s.at[0], s.at[1] - 60); }, id); await sleep(300); }
  let pt = null;
  for (let i = 0; i < 40; i++) {
    pt = await W(p, id => window.__liveraRoom.spotPoint(id), id);
    assert(pt, `${id} isn't on screen`);
    if (await onRoom(p, pt)) break;
    await later(p);
    await sleep(250);
  }
  await tap(p, pt);
}
// Open floor the finger can reach: the first of these room points that is walkable and not under a card or a toast.
async function floorTap(p, candidates) {
  await later(p);
  await settled(p);
  for (let i = 0; i < 40; i++) {
    for (const [x, y] of candidates) {
      const pt = await W(p, ([x, y]) => window.__liveraRoom.floorPoint(x, y), [x, y]);
      if (!pt || pt[0] < 8 || pt[1] < 8 || pt[0] > p.page.viewportSize().width - 8) continue;
      const h = await W(p, ([cx, cy]) => window.__liveraRoom.hitAt(cx, cy), pt);
      if (h && h.kind === "floor" && (await onRoom(p, pt))) { await tap(p, pt); return [x, y]; }
    }
    await later(p);
    await sleep(250);
  }
  throw new Error("no open floor under the finger");
}

async function flow(p, tag) {
  await test(`${tag}: inside Heritage Coffee the room covers the town, lit by the clock, with you at the door`, async () => {
    await start(p);
    await goInside(p, { id: "heritage_coffee", name: "Heritage Coffee" });
    await roomActive(p);
    const state = await W(p, () => ({ interior: window.__liveraRoom.interior(), room: !document.getElementById("room").hidden,
      town: getComputedStyle(document.getElementById("town")).visibility, toggle: !document.getElementById("room-toggle").hidden }));
    assert(state.interior === "heritage_coffee" && state.room && state.town === "hidden" && state.toggle, "the room isn't shown: " + JSON.stringify(state));
    const me = await meInRoom(p);
    const l = await look(p);
    assert(me && JSON.stringify(me.at) === JSON.stringify(l.here.room.interior.entrance.at), "not at the entrance: " + JSON.stringify(me));
    await sleep(500);
    await p.page.screenshot({ path: path.join(SHOTS, `room_${tag}_01_entered.png`) });
  });

  await test(`${tag}: tap a chair at the long table → the server seats you there`, async () => {
    await tapSpot(p, "table_near_3");
    await waitFor(p, () => (window.__liveraRoom.people().find(x => x.id === window.__livera.world.selfId) || {}).spot === "table_near_3");
    const me = await meInRoom(p);
    assert(me.spot === "table_near_3", "the server doesn't have you in the chair: " + JSON.stringify(me));
    await waitFor(p, () => !document.getElementById("room-stand").hidden);
    await sleep(3200);
    await p.page.screenshot({ path: path.join(SHOTS, `room_${tag}_02_seated.png`) });
    // That chair faces the table, away from the camera: the sheets have no seated frame from behind, so her standing
    // back frame is lowered onto the seat (D-072).
    await waitFor(p, () => { const d = window.__liveraRoom.drawn(window.__livera.world.selfId); return d && d.frame === "idle_back34" && d.mode === "lowered"; });
  });

  await test(`${tag}: tap the Chesterfield → she sits on it in her seated sofa frame, anchored on the seat (D-072)`, async () => {
    await tapSpot(p, "sofa_right");
    await waitFor(p, () => (window.__liveraRoom.people().find(x => x.id === window.__livera.world.selfId) || {}).spot === "sofa_right");
    await sleep(3200);   // the walk to the sofa, drawn
    await waitFor(p, () => { const d = window.__liveraRoom.drawn(window.__livera.world.selfId); return d && d.pose === "sit" && d.frame === "sit_sofa" && d.mode === "seat"; });
    // The seated frame is drawn whole (legs and all), not a standing picture clipped at the seat: its box reaches
    // below the seat, down past the floor point it sits over.
    const r = await W(p, () => { const id = window.__livera.world.selfId, d = window.__liveraRoom.drawn(id), s = window.__livera.world.here.room.interior.spots.find(x => x.id === "sofa_right"), q = window.__liveraRoom.floorPoint(s.at[0], s.at[1]), c = document.getElementById("room").getBoundingClientRect(); return { box: d.box, floorY: q[1] - c.top }; });
    assert(r.box[1] + r.box[3] > r.floorY - 4, "the seated frame stops at the seat: " + JSON.stringify(r));
    await p.page.screenshot({ path: path.join(SHOTS, `room_${tag}_02b_on_the_sofa.png`) });
    // The scene card back to its pill, so the next tap lands on the room.
    await p.page.click('#sheet:not([hidden]) .sheet-head [aria-label="Shrink to a pill"]', { timeout: 3000 }).catch(() => {});
  });

  await test(`${tag}: tap the counter → the card's Buy; buying serves you at the counter`, async () => {
    await tapSpot(p, "counter");
    await p.page.waitForSelector('#sheet[data-kind="scene"] [data-buy]');
    const before = (await W(p, () => window.__livera.world.money)) || {};
    for (let i = 0; ; i++) {
      await later(p);
      try { await p.page.click('#sheet [data-buy="latte"][data-method="card"]', { timeout: 4000 }); break; } catch (e) { if (i >= 4) throw e; }
    }
    await waitFor(p, () => (window.__liveraRoom.people().find(x => x.id === window.__livera.world.selfId) || {}).spot === "counter");
    const me = await meInRoom(p);
    assert(me.spot === "counter", "not served at the counter: " + JSON.stringify(me));
    await waitFor(p, b => window.__livera.world.money && window.__livera.world.money.bank_cents < b, before.bank_cents);
  });

  await test(`${tag}: tap the open floor → move_inside walks you there; the map button shows the town and back`, async () => {
    await p.page.click('#sheet:not([hidden]) .sheet-head [aria-label="Shrink to a pill"]', { timeout: 3000 }).catch(() => {});
    const [fx, fy] = await floorTap(p, [[700, 770], [820, 700], [600, 640], [1000, 660], [520, 700], [900, 620], [760, 680]]);
    await waitFor(p, ([fx, fy]) => { const me = window.__liveraRoom.people().find(x => x.id === window.__livera.world.selfId); return me && !me.spot && Math.hypot(me.at[0] - fx, me.at[1] - fy) < 40; }, [fx, fy]);
    const me = await meInRoom(p);
    assert(!me.spot && Math.hypot(me.at[0] - fx, me.at[1] - fy) < 40, "the server has you elsewhere: " + JSON.stringify(me));
    await p.page.click("#room-toggle");
    await waitFor(p, () => !window.__liveraRoom.active() && getComputedStyle(document.getElementById("town")).visibility === "visible");
    assert(await W(p, () => window.__livera.world.self.inside === "heritage_coffee"), "the map button took you outside");
    await p.page.click("#room-toggle");
    await roomActive(p);
  });

  await test(`${tag}: tap the stage → it asks for a song (none yet); tap the door → you're outside and the town is back`, async () => {
    await tapSpot(p, "stage");
    await waitFor(p, () => [...document.querySelectorAll("#feed .line, .toast")].some(n => /need a song/.test(n.textContent)) || document.querySelector('#sheet [data-verb^="perform:"]'), null, 8000);
    await p.page.click('#sheet:not([hidden]) .sheet-head [aria-label="Shrink to a pill"]', { timeout: 3000 }).catch(() => {});
    await tapSpot(p, "door");
    await waitFor(p, () => window.__livera.world.self.inside === "" && !window.__liveraRoom.active() && document.getElementById("room").hidden);
  });
}

// Two people in one room, through Play together (together/ on its stand-in platform, both tabs in one browser): the
// host sits; the friend sees her in that chair, can't take it (the server says so), and can once she has left.
async function twoPeople(browser) {
  const TOGETHER = URL.replace(/\/solo\/?$/, "/together/"), space = `r${Date.now() % 1e8}`;
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const open = async (as, level, name) => {
    const page = await ctx.newPage();
    const p = { ctx, page, label: `together ${name}`, touch: false, errors: [] };
    page.on("console", m => { if (m.type() === "error") p.errors.push(`console: ${m.text()}`); });
    page.on("pageerror", e => p.errors.push(`pageerror: ${e.message}`));
    await page.goto(`${TOGETHER}?space=${space}&as=${as}&level=${level}&name=${name}&drop=0`);
    players.push(p);
    return p;
  };
  const treq = (p, op, args = {}) => W(p, ([op, args]) => window.__liveraTogether.request(op, args), [op, args]);
  const playingAs = (p, id) => waitFor(p, id => window.__livera && window.__livera.phase() === "playing" && window.__livera.world.selfId === id && window.__livera.world.buildings.length > 0, id, 40000);
  let H, F;
  await test("two people: both inside Heritage Coffee see the room and each other in it", async () => {
    H = await open("u_owner", "owner", "Dee");
    await H.page.waitForSelector("#together-host", { timeout: 30000 });
    await H.page.click("#together-host");
    await H.page.waitForSelector('.castcard[data-character="dominique"]', { timeout: 30000 });
    await H.page.click('.castcard[data-character="dominique"]');
    await playingAs(H, "dominique");
    F = await open("u_ali", "interact", "Ali");
    await F.page.waitForSelector("#together-join", { timeout: 30000 });
    await F.page.click("#together-join");
    await F.page.waitForSelector('.castcard[data-character="aaliyah"]', { timeout: 30000 });
    await F.page.click('.castcard[data-character="aaliyah"]');
    await playingAs(F, "aaliyah");
    // Both walk over (the host's clock fast-forwarded) and go in, as any client would ask.
    for (const p of [H, F]) { await treq(p, "exit"); const r = await treq(p, "move", { location: "heritage_coffee" }); assert(r.ok, "move: " + JSON.stringify(r.error)); }
    for (let i = 0; i < 60; i++) {
      const moving = await Promise.all([H, F].map(async p => { const l = await treq(p, "look"); return l.ok && l.data.you.moving; }));
      if (!moving.some(Boolean)) break;
      await W(H, () => window.__liveraTogether.host.advance(3)); await sleep(250);
    }
    for (const p of [H, F]) { const r = await treq(p, "enter", { location: "heritage_coffee" }); assert(r.ok, "enter: " + JSON.stringify(r.error)); }
    for (const p of [H, F]) await roomActive(p);
    await waitFor(H, () => window.__liveraRoom.people().some(x => x.id === "aaliyah"));
    await waitFor(F, () => window.__liveraRoom.people().some(x => x.id === "dominique"));
  });
  await test("two people: the host sits; the friend sees her in that chair and can't take it", async () => {
    await tapSpot(H, "table_far_2");
    await waitFor(H, () => (window.__liveraRoom.people().find(x => x.id === "dominique") || {}).spot === "table_far_2");
    await waitFor(F, () => (window.__liveraRoom.people().find(x => x.id === "dominique") || {}).spot === "table_far_2");
    await sleep(3200);  // her walk to the chair, drawn
    // The friend sees her in her seated chair frame: that chair faces the camera (D-072).
    await waitFor(F, () => { const d = window.__liveraRoom.drawn("dominique"); return d && d.frame === "sit_chair" && d.mode === "seat"; });
    await F.page.screenshot({ path: path.join(SHOTS, "room_two_people_friend_sees_host_seated.png") });
    // Her chair, tapped, is her: the person card opens. Asking the server for the chair anyway is refused.
    await tapSpot(F, "table_far_2");
    await waitFor(F, () => { const s = document.getElementById("sheet"); return !s.hidden && s.dataset.kind === "person"; }, null, 8000);
    const sit = await treq(F, "sit", { spot: "table_far_2" });
    assert(!sit.ok && sit.error.code === "spot_taken", "the friend took her chair: " + JSON.stringify(sit));
    const l = await treq(F, "look");
    const me = l.data.here.room.people.find(x => x.id === "aaliyah"), her = l.data.here.room.people.find(x => x.id === "dominique");
    assert(me && me.spot !== "table_far_2" && her.spot === "table_far_2", "the seat isn't hers alone: " + JSON.stringify(l.data.here.room.people));
  });
  await test("two people: she leaves by the door; the friend sees her go, and the chair is free", async () => {
    await H.page.click('#sheet:not([hidden]) .sheet-head [aria-label="Shrink to a pill"]', { timeout: 3000 }).catch(() => {});
    await F.page.click('#sheet:not([hidden]) .sheet-head [aria-label="Close"]', { timeout: 3000 }).catch(() => {});
    await tapSpot(H, "door");
    await waitFor(H, () => window.__livera.world.self.inside === "" && !window.__liveraRoom.active());
    await waitFor(F, () => !window.__liveraRoom.people().some(x => x.id === "dominique"));
    await tapSpot(F, "table_far_2");
    await waitFor(F, () => (window.__liveraRoom.people().find(x => x.id === "aaliyah") || {}).spot === "table_far_2");
    await sleep(3200);
    await F.page.screenshot({ path: path.join(SHOTS, "room_two_people_friend_seated.png") });
  });
}

(async () => {
  const browser = await chromium.launch();
  const A = await newPlayer(browser, PHONE, "phone");
  await flow(A, "phone");
  const B = await newPlayer(browser, DESKTOP, "desktop");
  await flow(B, "desktop");
  await twoPeople(browser);
  await test("no console errors", async () => {
    const errs = players.flatMap(p => p.errors.map(e => `${p.label}: ${e}`));
    assert(!errs.length, errs.join("\n"));
  });
  await browser.close();
  console.log(`\n${results.filter(r => r[0] === "PASS").length} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
