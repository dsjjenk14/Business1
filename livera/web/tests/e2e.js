// End-to-end tests: real Chromium playing the web client against a real game server through
// the gateway. Run with run_e2e.sh (it starts both and sets LIVERA_URL). Plain Node, no test
// framework: each test prints PASS / FAIL / SKIP and the process exits non-zero on any FAIL.
//
// Phone: 390x844, touch, isMobile. Desktop: 1280x800. Tests that need the newer protocol
// (`livera/1`: people stream, positions, whispering, map.interactions, session tokens) SKIP
// against an older server and say so.

const { chromium } = require("playwright");
const net = require("net");
const fs = require("fs");
const path = require("path");

const URL = process.env.LIVERA_URL || "http://127.0.0.1:18080/";
const SHOTS = process.env.LIVERA_SHOTS || path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const RUN = String(Date.now() % 1000000);
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

// A script plays a character over raw TCP (what the town director does), so the browser can
// check the "played by a script" label.
function tcpBot(port) {
  const sock = net.connect({ host: "127.0.0.1", port });
  let buf = "", id = 0;
  const waiting = new Map();
  sock.on("data", d => {
    buf += d.toString();
    for (let i; (i = buf.indexOf("\n")) >= 0;) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      try { const m = JSON.parse(line); if (m.re != null && waiting.has(m.re)) { waiting.get(m.re)(m); waiting.delete(m.re); } } catch { /* ignore */ }
    }
  });
  const req = (op, args = {}) => new Promise(res => { const n = ++id; waiting.set(n, res); sock.write(JSON.stringify({ id: n, op, ...args }) + "\n"); });
  return { req, close: () => sock.end(), ready: new Promise(r => sock.once("connect", r)) };
}

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
async function register(p, username) {
  await p.page.goto(URL);
  await p.page.waitForSelector("#login-user", { timeout: 15000 });
  await p.page.fill("#login-user", username);
  await p.page.fill("#login-pass", "correct horse 42");
  await p.page.click("#register-btn");
  await p.page.waitForSelector(".castcard", { timeout: 15000 });
}
async function pick(p, id) {
  await p.page.click(`.castcard[data-character="${id}"]`);
  await p.page.waitForFunction(() => window.__livera && window.__livera.phase() === "playing" && window.__livera.world.buildings.length > 0, null, { timeout: 15000 });
}
const W = (p, fn, arg) => p.page.evaluate(fn, arg);
const waitFor = (p, fn, arg, timeout = 15000) => p.page.waitForFunction(fn, arg, { timeout, polling: 200 });
async function serverPos(p) { const r = await W(p, () => window.__livera.look()); assert(r.ok, "look failed: " + JSON.stringify(r.error)); return r.data.you.position; }
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
async function feedHas(p, text, timeout = 8000) {
  await waitFor(p, t => [...document.querySelectorAll("#feed .line")].some(n => n.textContent.includes(t)), text, timeout);
}
async function tap(p, cx, cy) { if (p.touch) await p.page.touchscreen.tap(cx, cy); else await p.page.mouse.click(cx, cy); }
// A screen point for a world point that hits what we expect (and isn't under a panel).
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
// The camera eases after you; wait until it stops so a computed screen point stays true.
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
// Ground points around a spot, nearest first (avatars and buildings are skipped by findPoint).
async function groundAround(p, center, ...radii) {
  const c = [];
  for (const radius of radii) for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) c.push([center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius, 0]);
  return c;
}
async function walkAway(p, ...radii) {
  const p0 = await serverPos(p);
  await tapWorld(p, await groundAround(p, p0, ...radii), null, "ground");
  await waitFor(p, () => !!window.__livera.world.self.target, null, 5000);
  await waitFor(p, () => !window.__livera.world.self.target, null, 20000);
}
// Stand with B at the Lexington door again (where both players started).
async function rejoin(p, other) {
  if (d2(await serverPos(p), await serverPos(other)) > 1) await walkToPlaceDoor(p, "lexington_0904");
}
async function exitBuilding(p) {
  const inside = await W(p, () => window.__livera.world.self.inside);
  if (!inside) return;
  if (!(await p.page.$("#exit-btn"))) await p.page.click("#sheet .mini-pill .btn:last-child");
  else await p.page.click("#exit-btn");
  await waitFor(p, () => window.__livera.world.self.inside === "");
}
async function walkToPlaceDoor(p, placeId) {
  // Through the UI: tap the building, then "Walk here".
  const door = await W(p, id => (window.__livera.world.buildingById.get(id) || window.__livera.world.buildingOfPlace.get(id)).door, placeId);
  const bid = await W(p, id => (window.__livera.world.buildingById.get(id) || window.__livera.world.buildingOfPlace.get(id)).id, placeId);
  await waitFor(p, () => !window.__livera.world.self.target, null, 20000);
  await tapWorld(p, [[door[0], door[1] - 4, 6], [door[0] - 4, door[1] - 6, 10], [door[0] + 4, door[1] - 2, 3], [door[0], door[1] - 10, 20]], { kind: "place", id: bid }, placeId);
  await p.page.waitForSelector('#sheet[data-kind="place"]');
  await p.page.click('#sheet >> text="Walk here"');
  await waitFor(p, door => { const s = window.__livera.world.self; return s && s.pos && Math.hypot(s.pos[0] - door[0], s.pos[1] - door[1]) < 1 && !s.target; }, door, 30000);
}
async function closeSheet(p) {
  const b = await p.page.$('#sheet:not([hidden]) .sheet-head [aria-label="Close"]');
  if (b) await b.click();
}
const shot = (p, name) => p.page.screenshot({ path: path.join(SHOTS, name) });
async function newer(p) { return W(p, () => window.__livera.streaming() || window.__livera.world.rulesFromServer); }

// ------------------------------------------------------------------ the run
(async () => {
  const browser = await chromium.launch();
  const A = await newPlayer(browser, PHONE, "A (phone, Aaliyah)");
  const B = await newPlayer(browser, DESKTOP, "B (desktop, Dominique)");
  let price = 0;

  await test("phone: register, log in and pick a founding character", async () => {
    await A.page.goto(URL);
    await A.page.waitForSelector("#login-user");
    await shot(A, "phone_01_login.png");
    await register(A, `e2e_a_${RUN}`);
    await shot(A, "phone_02_pick.png");
    const cards = await A.page.$$eval(".castcard", n => n.length);
    assert(cards >= 10, `expected the founding cast, got ${cards} cards`);
    await pick(A, "aaliyah");
    const me = await W(A, () => ({ id: window.__livera.world.selfId, inside: window.__livera.world.self.inside }));
    assert(me.id === "aaliyah", "playing the wrong character: " + me.id);
    assert(me.inside, "a founding character starts at home");
    await A.page.waitForSelector('#sheet[data-kind="scene"]');
    await sleep(600);
    await shot(A, "phone_03_home_scene.png");
  });

  await test("the map draws (buildings, stops, a lit canvas)", async () => {
    const info = await W(A, () => {
      const w = window.__livera.world, cv = document.getElementById("town"), ctx = cv.getContext("2d");
      const data = ctx.getImageData(0, 0, cv.width, cv.height).data, colors = new Set();
      for (let i = 0; i < data.length; i += 4 * 997) colors.add((data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | (data[i + 2] >> 3));
      return { buildings: w.buildings.length, stops: w.allStops().length, colors: colors.size, places: w.places.length };
    });
    assert(info.places > 50, `map has ${info.places} places`);
    assert(info.buildings > 30, `only ${info.buildings} buildings`);
    assert(info.stops >= 7, `only ${info.stops} bus stops`);
    assert(info.colors > 40, `canvas looks blank (${info.colors} colours)`);
  });

  await test("desktop: a second player logs in and picks a character", async () => {
    await register(B, `e2e_b_${RUN}`);
    await pick(B, "dominique");
    await exitBuilding(B);
    const pos = await serverPos(B);
    assert(d2(pos, [430, 470]) < 1, "B should stand at the Lexington door, is at " + pos);
  });

  await test("tap the ground to walk: the server moves you", async () => {
    await exitBuilding(A);
    await shot(A, "phone_04_outside.png");
    const p0 = await serverPos(A);
    await tapWorld(A, await groundAround(A, p0, 22, 30), null, "ground");
    await waitFor(A, () => !!window.__livera.world.self.target, null, 5000);
    let moved = 0;
    for (let i = 0; i < 40 && moved < 5; i++) { await sleep(250); moved = d2(await serverPos(A), p0); }
    assert(moved >= 5, `server position moved only ${moved.toFixed(1)} m`);
    await waitFor(A, () => !window.__livera.world.self.target, null, 15000);
  });

  await test("enter a building and buy a coffee: money goes down by the price", async () => {
    await tapWorld(A, [[470, 422, 9], [470, 428, 4], [476, 420, 5], [465, 426, 6], [478, 416, 9]], { kind: "place", id: "heritage_coffee" }, "Heritage Coffee");
    await A.page.waitForSelector('#sheet[data-kind="place"]');
    await shot(A, "phone_05_place_sheet.png");
    await A.page.click('#sheet >> text="Go inside"');
    await waitFor(A, () => window.__livera.world.self.inside === "heritage_coffee", null, 40000);
    await A.page.waitForSelector('#sheet[data-kind="scene"] [data-buy]');
    await waitFor(A, () => !!window.__livera.world.money);
    const offer = await W(A, () => window.__livera.world.here.offers[0]);
    price = offer.price_cents;
    const before = await W(A, () => window.__livera.world.money.bank_cents);
    await shot(A, "phone_06_coffee_scene.png");
    await A.page.click(`#sheet [data-buy="${offer.id}"][data-method="card"]`);
    await feedHas(A, "Bought");
    await waitFor(A, want => window.__livera.world.money && window.__livera.world.money.bank_cents === want, before - price, 10000);
    await exitBuilding(A);
  });

  await test("walk back to a friend (building sheet → Walk here)", async () => {
    await walkToPlaceDoor(A, "lexington_0904");
    const pa = await serverPos(A), pb = await serverPos(B);
    assert(d2(pa, pb) < 3, `A and B should be together: ${pa} vs ${pb}`);
  });

  await test("chat bar: say and shout reach a player nearby; the speaker sees who heard", async () => {
    await A.page.fill("#chat-input", "Hello from the phone");
    await A.page.click("#chat-send");
    await feedHas(B, "Hello from the phone");
    await feedHas(A, "Heard by 1");
    const bubble = await W(B, () => window.__livera.world.bubbles.some(b => b.who === "aaliyah" && b.text === "Hello from the phone"));
    assert(bubble, "B has no bubble for A's line");
    await A.page.click('#chatbar [data-volume="shout"]');
    await A.page.fill("#chat-input", "Can you hear me now");
    await A.page.click("#chat-send");
    await feedHas(B, "Can you hear me now");
    const shouted = await W(B, () => [...document.querySelectorAll("#feed .line.shout")].some(n => n.textContent.includes("Can you hear me now")));
    assert(shouted, "the shout isn't marked as a shout");
    await A.page.click('#chatbar [data-volume="say"]');
  });

  await test("whisper offers only people within whisper range", async () => {
    await A.page.click('#chatbar [data-volume="whisper"]');
    await A.page.waitForSelector('#whisper-targets [data-person="dominique"]', { timeout: 8000 });
    await shot(A, "phone_07_whisper.png");
    await A.page.fill("#chat-input", "psst, over here");
    await A.page.click("#chat-send");
    await feedHas(B, "psst, over here");
    await feedHas(B, "whispering to you");
    // Walk away: Dominique is no longer offered.
    const p0 = await serverPos(A);
    await tapWorld(A, await groundAround(A, p0, 16, 20, 25), null, "ground well out of whisper range");
    await waitFor(A, () => !document.querySelector('#whisper-targets [data-person="dominique"]') && document.getElementById("whisper-targets").textContent.includes("Nobody within"), null, 20000);
    await A.page.click('#chatbar [data-volume="say"]');
  });

  await test("every server string is escaped (speech is player text)", async () => {
    await A.page.fill("#chat-input", XSS);
    await A.page.click("#chat-send");
    await feedHas(B, XSS);
    for (const p of [A, B]) {
      const imgs = await W(p, () => document.querySelectorAll('img[src="x"], img:not([src^="faces/"])').length);
      assert(imgs === 0, `${p.label}: an <img> was created from speech`);
      assert(!p.dialogs.length, `${p.label}: a dialog opened: ${p.dialogs.join(", ")}`);
    }
  });

  // ---------------------------------------------------------------- newer protocol only
  const needNewer = async () => ((await newer(A)) ? null : "the server speaks the older protocol (no people stream or rules)");
  await test("people stream: another player is on your map with a position, and moves", async () => {
    await waitFor(B, () => { const p = window.__livera.world.people.get("aaliyah"); return p && p.pos; }, null, 8000);
    const before = await W(B, () => window.__livera.world.personPos("aaliyah"));
    const p0 = await serverPos(A);
    await tapWorld(A, await groundAround(A, p0, 15, 22), null, "ground");
    await sleep(1500);
    const after = await W(B, () => window.__livera.world.personPos("aaliyah"));
    assert(d2(before, after) > 2, "B didn't see A move");
    await walkToPlaceDoor(A, "lexington_0904");
  }, { skipIf: needNewer });

  await test("interactions come from the map; out of range walks you over first", async () => {
    const n = await W(A, () => (window.__livera.world.interactions || []).length);
    assert(n >= 1, "no interactions in map");
    // Step away first, so Chat (3 m) has to walk over.
    await walkAway(A, 12, 16, 20);
    assert(d2(await serverPos(A), await serverPos(B)) > 5, "A should be out of chat range now");
    await settle(A);
    const face = await W(A, () => window.__livera.tapPoint("person", "dominique"));
    assert(face, "Dominique isn't drawn on A's map");
    await tap(A, face[0], face[1]);
    await A.page.waitForSelector('#sheet[data-kind="person"] [data-interaction]');
    await sleep(400);
    const focused = await W(A, () => document.activeElement && document.activeElement.tagName);
    assert(focused !== "INPUT" && focused !== "SELECT", "the tap that opened the sheet also focused a field in it (ghost click)");
    await shot(A, "phone_08_person.png");
    await A.page.click('#sheet [data-interaction="chat"]');
    await feedHas(A, "Walking over", 5000);
    await waitFor(A, () => [...document.querySelectorAll("#feed .line")].some(n => /Chat with|Chat:/.test(n.textContent)), null, 20000);
    assert(d2(await serverPos(A), await serverPos(B)) <= 3.5, "A didn't end up next to B");
    await closeSheet(A);
  }, { skipIf: needNewer });

  await test("asks: the other player gets an Accept / Decline sheet and the asker hears back", async () => {
    await closeSheet(A);
    await rejoin(A, B);
    await settle(A);
    const face = await W(A, () => window.__livera.tapPoint("person", "dominique"));
    assert(face, "Dominique isn't drawn on A's map");
    await tap(A, face[0], face[1]);
    await A.page.waitForSelector('#sheet[data-kind="person"]');
    await A.page.click('#sheet >> text="Ask on a date"');
    await B.page.waitForSelector('#sheet[data-kind="request"]', { timeout: 10000 });
    await shot(B, "desktop_02_request.png");
    await B.page.click('#sheet >> text="Decline"');
    await feedHas(A, "declined", 10000);
    await closeSheet(A);
  }, { skipIf: needNewer });

  await test("onlookers see that someone whispers, never what", async () => {
    const C = await newPlayer(browser, DESKTOP, "C (desktop, Naomi)");
    await register(C, `e2e_c_${RUN}`);
    await pick(C, "naomi");
    await exitBuilding(C);
    await closeSheet(A);
    await rejoin(A, B);
    await A.page.click('#chatbar [data-volume="whisper"]');
    await A.page.click('#whisper-targets [data-person="dominique"]');
    await A.page.fill("#chat-input", "secret words");
    await A.page.click("#chat-send");
    await feedHas(C, "whispers to");
    const leaked = await W(C, () => document.body.textContent.includes("secret words"));
    assert(!leaked, "the onlooker saw the whispered text");
    await A.page.click('#chatbar [data-volume="say"]');
  }, { skipIf: needNewer });

  let bot = null;
  await test("a character played by a script is labelled \"played by a script\"", async () => {
    bot = tcpBot(Number(process.env.LIVERA_TCP_PORT));
    await bot.ready;
    const l = await bot.req("login", { username: process.env.LIVERA_BOT_USER, password: process.env.LIVERA_BOT_PASSWORD });
    assert(l.ok, "bot login failed: " + JSON.stringify(l.error));
    const p = await bot.req("play", { character: "graham" });
    assert(p.ok, "bot play failed: " + JSON.stringify(p.error));
    const e = await bot.req("exit");
    assert(e.ok, "bot exit failed: " + JSON.stringify(e.error));
    await waitFor(B, () => { const g = window.__livera.world.people.get("graham"); return g && g.scripted === true && g.pos; }, null, 10000);
    await settle(B);
    const face = await W(B, () => window.__livera.tapPoint("person", "graham"));
    assert(face, "Graham isn't drawn on B's map");
    await tap(B, face[0], face[1]);
    await B.page.waitForSelector('#sheet[data-kind="person"] >> text="played by a script"');
    await shot(B, "desktop_03_scripted.png");
    await closeSheet(B);
  }, { skipIf: async () => ((await newer(A)) && process.env.LIVERA_BOT_USER ? null : "needs the newer server and a bot_ account (--add-account)") });

  await test("a reload resumes the session with the token (no password)", async () => {
    await A.page.reload();
    await waitFor(A, () => window.__livera && window.__livera.phase() === "playing", null, 15000);
    assert(!(await A.page.$("#login-user")), "the login screen came back");
  }, { skipIf: needNewer });

  await test("a dropped connection reconnects (resume with the token; the old protocol asks to log in again)", async () => {
    const isNew = await newer(A);
    await W(A, () => window.__livera.drop());
    if (isNew) {
      await waitFor(A, () => !document.getElementById("conn").hidden || window.__livera.phase() !== "playing", null, 5000).catch(() => {});
      await waitFor(A, () => window.__livera.phase() === "playing" && document.getElementById("conn").hidden && window.__livera.world.selfId === "aaliyah", null, 20000);
      assert(!(await A.page.$("#login-user")), "the login screen came back");
    } else {
      await A.page.waitForSelector("#login-user", { timeout: 20000 });
      const msg = await A.page.textContent("#screen .err");
      assert(/connection dropped/i.test(msg), "no explanation on the login screen: " + msg);
      await A.page.fill("#login-user", `e2e_a_${RUN}`);
      await A.page.fill("#login-pass", "correct horse 42");
      await A.page.click("#login-btn");
      await waitFor(A, () => window.__livera.phase() === "playing" && window.__livera.world.selfId === "aaliyah", null, 15000);
    }
  });

  // ---------------------------------------------------------------- bus, phone, layout
  await test("the bus sheet lists the line's stops; riding pays the fare", async () => {
    await exitBuilding(A);
    const me = await serverPos(A);
    const stops = await W(A, () => window.__livera.world.allStops());
    stops.sort((a, b) => Math.hypot(a.at[0] - me[0], a.at[1] - me[1]) - Math.hypot(b.at[0] - me[0], b.at[1] - me[1]));
    let tapped = null;
    for (const s of stops.slice(0, 3)) {
      const pt = await findPoint(A, [[s.at[0], s.at[1], 6], [s.at[0], s.at[1], 8], [s.at[0], s.at[1], 4]], { kind: "stop", id: s.id });
      if (pt) { await tap(A, pt.cx, pt.cy); tapped = s; break; }
    }
    assert(tapped, "no bus stop visible to tap");
    await A.page.waitForSelector('#sheet[data-kind="stop"]');
    const n = await A.page.$$eval('#sheet input[name="dest"]', x => x.length);
    assert(n === stops.length - 1, `expected ${stops.length - 1} destinations, got ${n}`);
    await shot(A, "phone_09_bus.png");
    await waitFor(A, () => !!window.__livera.world.money);
    const before = await W(A, () => window.__livera.world.money.bank_cents);
    const fare = await W(A, id => window.__livera.world.lineOfStop(id).fare_cents, tapped.id);
    await A.page.click('#sheet >> text="Ride"');
    await feedHas(A, "Riding to", 60000);
    await waitFor(A, want => window.__livera.world.money && window.__livera.world.money.bank_cents === want, before - fare, 10000);
  });

  await test("the phone opens every app card, the bank and messages", async () => {
    await A.page.click("#phone-btn");
    await A.page.waitForSelector("#phone .app");
    const apps = await A.page.$$eval("#phone .app", x => x.length);
    assert(apps === 26, `expected 26 apps, got ${apps}`);
    await shot(A, "phone_10_phone_home.png");
    await A.page.click('#phone [data-app="bank"]');
    await A.page.waitForSelector('#phone >> text="Balances"');
    await shot(A, "phone_11_bank.png");
    await A.page.click('#phone [aria-label="Back to apps"]');
    await A.page.click('#phone [data-app="messages"]');
    await A.page.waitForSelector('#phone >> text="New message"');
    await A.page.fill('#phone input[aria-label="To"]', "dominique");
    await A.page.fill('#phone input[aria-label="Message"]', `Text me back ${XSS}`);
    await A.page.click('#phone button[type="submit"]');
    await A.page.waitForSelector('#phone [data-thread="dominique"]');
    await feedHas(B, "Message from");
    await feedHas(B, XSS);
    await shot(A, "phone_12_messages.png");
    for (const p of [A, B]) assert((await W(p, () => document.querySelectorAll('img[src="x"]').length)) === 0, `${p.label}: message text became HTML`);
    // Another app as cards.
    await A.page.click('#phone [aria-label="Back to apps"]');
    await A.page.click('#phone [data-app="weather"]');
    await A.page.waitForSelector("#phone .kv");
    await A.page.click('#phone [aria-label="Close phone"]');
  });

  await test("phone layout: 44 px tap targets, 16 px inputs, no sideways scroll, nothing overlapping", async () => {
    const r = await W(A, () => {
      const vis = n => { const b = n.getBoundingClientRect(); const s = getComputedStyle(n); return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
      const small = [...document.querySelectorAll("#hud button, #chatbar button, #mapctl button, #sheet button, #chatbar input")].filter(vis)
        .filter(n => { const b = n.getBoundingClientRect(); return b.height < 43.5 || b.width < 43.5; }).map(n => `${n.tagName}:${(n.textContent || n.getAttribute("aria-label") || "").trim().slice(0, 20)} ${Math.round(n.getBoundingClientRect().width)}x${Math.round(n.getBoundingClientRect().height)}`);
      const fonts = [...document.querySelectorAll("input, select, textarea")].filter(vis).filter(n => parseFloat(getComputedStyle(n).fontSize) < 16).length;
      const box = id => { const n = document.getElementById(id); return n && !n.hidden ? n.getBoundingClientRect() : null; };
      const hit = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const topbar = document.querySelector("#hud .topbar").getBoundingClientRect(), chat = box("chatbar"), ctl = box("mapctl");
      return { small, fonts, scroll: document.documentElement.scrollWidth - innerWidth, overlap: [hit(topbar, chat), hit(topbar, ctl), hit(ctl, chat)].filter(Boolean).length };
    });
    assert(!r.small.length, "tap targets under 44 px: " + r.small.join("; "));
    assert(r.fonts === 0, `${r.fonts} inputs under 16 px`);
    assert(r.scroll <= 0, `page scrolls sideways by ${r.scroll}px`);
    assert(r.overlap === 0, "top bar, map controls and chat bar overlap");
    await shot(A, "phone_13_map.png");
  });

  await test("desktop layout at 1280x800", async () => {
    await shot(B, "desktop_01_map.png");
    const r = await W(B, () => {
      const box = sel => { const n = document.querySelector(sel); return n && !n.hidden ? n.getBoundingClientRect() : null; };
      const hit = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const t = box("#hud .topbar"), c = box("#chatbar"), m = box("#mapctl");
      return { overlap: [hit(t, c), hit(t, m), hit(m, c)].filter(Boolean).length, scroll: document.documentElement.scrollWidth - innerWidth };
    });
    assert(r.overlap === 0 && r.scroll <= 0, JSON.stringify(r));
  });

  await test("character creator: a form from creator_options makes a playable character", async () => {
    const D = await newPlayer(browser, PHONE, "D (phone, creator)");
    await register(D, `e2e_d_${RUN}`);
    if (bot) {
      const badge = await D.page.$('.castcard[data-character="graham"] .badge.script');
      assert(badge, "the picker doesn't say Graham is played by a script right now");
    }
    await D.page.click("#create-btn");
    await D.page.waitForSelector("form.creator");
    await shot(D, "phone_14_creator.png");
    const inputs = await D.page.$$("form.creator fieldset:first-of-type input[type=text]");
    await inputs[0].fill("Robin"); await inputs[1].fill("Vale");
    // Multi-pick fields: tick the minimum in each.
    await D.page.evaluate(() => {
      for (const fs of document.querySelectorAll("form.creator fieldset")) {
        const boxes = [...fs.querySelectorAll(".chips input[type=checkbox]")];
        if (!boxes.length) continue;
        const m = (fs.querySelector(".budget").textContent.match(/choose (\d+)/) || [0, "0"])[1];
        for (let i = 0; i < Number(m); i++) boxes[i].click();
      }
    });
    await D.page.click('form.creator button[type="submit"]');
    await waitFor(D, () => window.__livera && window.__livera.phase() === "playing", null, 15000);
    const name = await W(D, () => window.__livera.world.selfName);
    assert(name === "Robin Vale", "created character is " + name);
    await shot(D, "phone_15_created_home.png");
  });

  await test("logging in on another device moves the session there, without a reconnect fight", async () => {
    const E = await newPlayer(browser, PHONE, "E (phone, A's account again)");
    await E.page.goto(URL);
    await E.page.waitForSelector("#login-user");
    await E.page.fill("#login-user", `e2e_a_${RUN}`);
    await E.page.fill("#login-pass", "correct horse 42");
    await E.page.click("#login-btn");
    await waitFor(E, () => window.__livera.phase() === "playing" && window.__livera.world.selfId === "aaliyah", null, 15000);
    await waitFor(A, () => window.__livera.phase() === "kicked", null, 10000);
    await A.page.waitForSelector('#screen >> text="Play here instead"');
    await shot(A, "phone_16_kicked.png");
    await sleep(4000);
    assert((await W(E, () => window.__livera.phase())) === "playing", "the first device took the session back");
  });

  await test("no console errors and no dialogs in any browser", async () => {
    const bad = players.flatMap(p => [...p.errors.map(e => `${p.label}: ${e}`), ...p.dialogs.map(d => `${p.label}: dialog ${d}`)]);
    assert(!bad.length, bad.join("\n"));
  });

  if (bot) bot.close();
  await browser.close();
  console.log(`\n${results.filter(r => r[0] === "PASS").length} passed, ${failed} failed, ${results.filter(r => r[0] === "SKIP").length} skipped`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
