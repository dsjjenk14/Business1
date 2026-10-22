// Five people on the live C++ server through the gateway, each in their own browser (Playwright, Chromium), the
// way five friends would play on the VPS: five accounts, five characters, everyone sees the other four, a say
// reaches only those in range, a buy changes only the buyer's money, and a taken character is refused. The same
// checks as the "Play together" test (together_e2e.js), against the real server instead of a host's tab.
//
// Run it through run_e2e.sh, which starts a fresh server and the gateway:
//   livera/web/tests/run_e2e.sh five_players.js
//
// Aaliyah, Dominique, Graham and Naomi live in the Lexington; Leila lives on Founders Row, 103 m from its door:
// within sight (120 m), beyond shout range (60 m). Nobody needs to walk to be seen, and only Leila is out of earshot.

const { chromium } = require("playwright");
const net = require("net");
const fs = require("fs");
const path = require("path");

const URL = process.env.LIVERA_URL || "http://127.0.0.1:18080/";
const TCP_PORT = Number(process.env.LIVERA_TCP_PORT);
const SHOTS = process.env.LIVERA_SHOTS || path.join(__dirname, "shots");
const PASSWORD = "correct horse 42";
const RUN = String(Date.now() % 1000000);
const XSS = "<img src=x onerror=alert(1)>";
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let failed = 0;
async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(["PASS", name]); console.log(`PASS ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failed++; results.push(["FAIL", name, e.message]); console.log(`FAIL ${name}: ${e.stack || e.message}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// A person on the raw protocol (what the terminal client does), for the refusal a browser can't even ask for.
function tcpPlayer() {
  const sock = net.connect({ host: "127.0.0.1", port: TCP_PORT });
  let buf = "", id = 0;
  const waiting = new Map();
  sock.on("data", d => {
    buf += d.toString();
    for (let i; (i = buf.indexOf("\n")) >= 0;) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      try { const m = JSON.parse(line); if (m.re != null && waiting.has(m.re)) { waiting.get(m.re)(m); waiting.delete(m.re); } } catch { /* an event */ }
    }
  });
  const req = (op, args = {}) => new Promise(res => { const n = ++id; waiting.set(n, res); sock.write(JSON.stringify({ id: n, op, ...args }) + "\n"); });
  return { req, close: () => sock.end(), ready: new Promise(r => sock.once("connect", r)) };
}

const players = [];
async function newPlayer(browser, label, character) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await ctx.newPage();
  const p = { ctx, page, label, character, errors: [], dialogs: [] };
  page.on("console", m => { if (m.type() === "error") p.errors.push(`console: ${m.text()}`); });
  page.on("pageerror", e => p.errors.push(`pageerror: ${e.message}`));
  page.on("dialog", d => { p.dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  players.push(p);
  return p;
}
const W = (p, fn, arg) => p.page.evaluate(fn, arg);
const waitFor = (p, fn, arg, timeout = 20000) => p.page.waitForFunction(fn, arg, { timeout, polling: 200 });
async function register(p, username) {
  await p.page.goto(URL);
  await p.page.waitForSelector("#login-user", { timeout: 15000 });
  await p.page.fill("#login-user", username);
  await p.page.fill("#login-pass", PASSWORD);
  await p.page.click("#register-btn");
  await p.page.waitForSelector(".castcard", { timeout: 15000 });
}
async function pick(p) {
  await p.page.click(`.castcard[data-character="${p.character}"]`);
  await waitFor(p, id => window.__livera && window.__livera.phase() === "playing" && window.__livera.world.selfId === id && window.__livera.world.buildings.length > 0, p.character);
}
async function serverLook(p) { const r = await W(p, () => window.__livera.look()); assert(r.ok, `${p.label}'s look: ${JSON.stringify(r.error)}`); return r.data; }
async function exitBuilding(p) {
  const inside = await W(p, () => window.__livera.world.self.inside);
  if (!inside) return;
  // Inside, Exit is the bar's context button (the tray, D-078); the full card has its own.
  if (!(await p.page.$("#exit-btn"))) await p.page.click("#ctx-btn");
  else await p.page.click("#exit-btn");
  await waitFor(p, () => window.__livera.world.self.inside === "");
}
const feedHas = (p, text, timeout = 10000) => waitFor(p, t => [...document.querySelectorAll("#feed .line")].some(n => n.textContent.includes(t)), text, timeout);
// The balance as the bank app shows it (opening the app asks the server).
async function bank(p) {
  await p.page.click("#money");
  await p.page.waitForSelector('#phone >> text="Balances"', { timeout: 10000 });
  const cents = await W(p, () => window.__livera.world.money && window.__livera.world.money.bank_cents);
  await p.page.click('#phone [aria-label="Close phone"]');
  assert(typeof cents === "number", `${p.label} has no balance`);
  return cents;
}
async function settle(p) {
  let last = null;
  for (let i = 0; i < 30; i++) {
    const now = await W(p, () => window.__livera.project(500, 500));
    if (last && Math.abs(now[0] - last[0]) < 0.5 && Math.abs(now[1] - last[1]) < 0.5) return;
    last = now; await sleep(120);
  }
}
async function tapPlace(p, candidates, id) {
  await settle(p);
  for (const [x, y, z] of candidates) {
    const r = await W(p, ([x, y, z]) => {
      const [cx, cy] = window.__livera.project(x, y, z);
      if (cx < 4 || cy < 4 || cx > innerWidth - 4 || cy > innerHeight - 4) return null;
      if (document.elementFromPoint(cx, cy) !== document.getElementById("town")) return null;
      return { cx, cy, hit: window.__livera.hitAt(cx, cy) };
    }, [x, y, z || 0]);
    if (r && r.hit && r.hit.kind === "place" && r.hit.id === id) { await p.page.mouse.click(r.cx, r.cy); return; }
  }
  throw new Error(`no visible point to tap for ${id}`);
}
const shot = (p, name) => p.page.screenshot({ path: path.join(SHOTS, name) });

(async () => {
  assert(TCP_PORT, "LIVERA_TCP_PORT isn't set (run through run_e2e.sh)");
  const browser = await chromium.launch();
  const [ali, dom, gra, nao, lei] = await Promise.all([
    newPlayer(browser, "Aaliyah's player", "aaliyah"), newPlayer(browser, "Dominique's player", "dominique"),
    newPlayer(browser, "Graham's player", "graham"), newPlayer(browser, "Naomi's player", "naomi"), newPlayer(browser, "Leila's player", "leila")]);
  const five = [ali, dom, gra, nao, lei];

  await test("five people make accounts; four pick their characters", async () => {
    for (const [i, p] of five.entries()) await register(p, `five${RUN}_${i + 1}`);
    for (const p of [ali, dom, gra, nao]) await pick(p);
  });

  await test("a taken character is refused: the picker marks it, and the server refuses it", async () => {
    // The fifth player's picker was drawn before the others chose; a reload resumes the session with a fresh list.
    await lei.page.reload();
    await lei.page.waitForSelector('.castcard[data-character="graham"]', { timeout: 15000 });
    const card = await W(lei, () => { const b = document.querySelector('.castcard[data-character="graham"]'); return b && { disabled: b.disabled, text: b.textContent }; });
    assert(card && card.disabled && /another player's/.test(card.text), "Graham's card isn't marked taken for the fifth player: " + JSON.stringify(card));
    const t = tcpPlayer();
    try {
      await t.ready;
      assert((await t.req("register", { username: `five${RUN}_x`, password: PASSWORD })).ok, "register over TCP failed");
      assert((await t.req("login", { username: `five${RUN}_x`, password: PASSWORD })).ok, "login over TCP failed");
      const r = await t.req("play", { character: "graham" });
      assert(!r.ok && r.error.code === "character_taken", "playing Graham over TCP: " + JSON.stringify(r));
    } finally { t.close(); }
    await pick(lei);
  });

  await test("everyone sees the other four on the map", async () => {
    for (const p of five) await exitBuilding(p);
    for (const p of five) {
      const ids = five.filter(o => o !== p).map(o => o.character);
      await waitFor(p, ids => ids.every(id => { const x = window.__livera.world.people.get(id); return x && x.pos; }), ids, 20000)
        .catch(async () => { throw new Error(`${p.label} sees ${JSON.stringify(await W(p, () => [...window.__livera.world.people.keys()]))}`); });
      const seen = (await serverLook(p)).people.map(x => x.id);
      assert(ids.every(id => seen.includes(id)), `the server's look for ${p.label} lists ${JSON.stringify(seen)}`);
    }
    const gap = d2((await serverLook(lei)).you.position, (await serverLook(dom)).you.position);
    assert(gap > 60 && gap < 120, `Leila is ${gap.toFixed(1)} m from the Lexington door`);
    await W(dom, () => document.getElementById("z-fit").click());
    await sleep(600);
    await shot(dom, "five_01_five_on_the_map.png");
  });

  await test("a say reaches only those in range", async () => {
    await dom.page.fill("#chat-input", `Hello, all of you ${XSS}`);
    await dom.page.click("#chat-send");
    await feedHas(dom, "Heard by 3");
    for (const p of [ali, gra, nao]) await feedHas(p, "Hello, all of you");
    await sleep(2500);
    const heard = await W(lei, () => [...document.querySelectorAll("#feed .line")].some(n => n.textContent.includes("Hello, all of you")));
    assert(!heard, "Leila, 103 m away, heard a say");
    for (const p of five) assert((await W(p, () => document.querySelectorAll('img[src="x"]').length)) === 0, `speech became an <img> for ${p.label}`);
  });

  await test("a buy changes only the buyer's money", async () => {
    const before = {};
    for (const p of five) before[p.character] = await bank(p);
    await tapPlace(nao, [[470, 422, 9], [470, 428, 4], [476, 420, 5], [465, 426, 6], [478, 416, 9]], "heritage_coffee");
    await nao.page.waitForSelector('#sheet[data-kind="place"]');
    await nao.page.click('#sheet >> text="Go inside"');
    await waitFor(nao, () => window.__livera.world.self.inside === "heritage_coffee", null, 40000);
    await nao.page.click('#sheet [data-tray="buy"]', { timeout: 15000 });
    await nao.page.waitForSelector('#sheet[data-kind="buy"] [data-buy]');
    const offer = await W(nao, () => window.__livera.world.here.offers[0]);
    await nao.page.click(`#sheet [data-buy="${offer.id}"][data-method="card"]`);
    await feedHas(nao, "Bought");
    await shot(nao, "five_02_bought.png");
    assert(await bank(nao) === before.naomi - offer.price_cents, "Naomi's balance didn't drop by the price");
    for (const p of [ali, dom, gra, lei]) assert(await bank(p) === before[p.character], `${p.label}'s money moved`);
  });

  await test("no console errors and no dialogs in any browser", async () => {
    const bad = players.flatMap(p => [...p.errors.map(e => `${p.label}: ${e}`), ...p.dialogs.map(d => `${p.label}: dialog ${d}`)]);
    assert(!bad.length, bad.join("\n"));
  });

  await browser.close();
  console.log(`\n${results.filter(r => r[0] === "PASS").length} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
