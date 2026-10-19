// End-to-end tests for "Play together": five pages in one Chromium (Playwright), a host and four friends, on
// fake_platform.js (the stand-in for the artifact's room, database and user; every tab is one person, and the room
// loses LIVERA_TOGETHER_DROP of its messages). The host's tab runs the game core (WebAssembly); everyone plays
// through the same client. Run with run_together_e2e.sh (it serves web/client and sets LIVERA_TOGETHER_URL).
// Same conventions as e2e.js and solo_e2e.js: PASS / FAIL / SKIP per test, non-zero exit on any FAIL.
//
// What is checked: every page says where the town runs and that the host holds everyone's state; only admins are
// offered hosting; the host founds a town on an empty database; four friends join as four other characters; a
// taken character is refused; nobody can pose as the host or read the save; everyone sees the other four on the
// map; a say reaches only those in range; a buy changes only the buyer's money; the host's tab hiding pauses
// everyone and they're told; the host reloading stops the town honestly (nobody else may host) and the save brings
// everyone back where they were; the host closing hands over to another admin who has played; a second tab of
// the same person takes over and the first is told; no console errors.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = process.env.LIVERA_TOGETHER_URL || "http://127.0.0.1:18960/together/";
const SHOTS = process.env.LIVERA_SHOTS || path.join(__dirname, "shots");
const DROP = Number(process.env.LIVERA_TOGETHER_DROP || 0.05);
const SPACE = `t${Date.now() % 1e8}`;
fs.mkdirSync(SHOTS, { recursive: true });
const XSS = "<img src=x onerror=alert(1)>";
const NOTICE = [/runs in the host's browser/, /pauses while the host's tab is hidden or closed/, /holds everyone's state/];

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

// ------------------------------------------------------------------ people
const people = [];
let ctx;
async function open(as, level, name, character, viewport) {
  const page = await ctx.newPage();
  if (viewport) await page.setViewportSize(viewport);
  const p = { page, as, level, name, character, label: `${name} (${level})`, errors: [], dialogs: [] };
  page.on("console", m => { if (m.type() === "error") p.errors.push(`console: ${m.text()}`); });
  page.on("pageerror", e => p.errors.push(`pageerror: ${e.message}`));
  page.on("dialog", d => { p.dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await page.goto(`${URL}?space=${SPACE}&as=${as}&level=${level}&name=${encodeURIComponent(name)}&drop=${DROP}`);
  people.push(p);
  return p;
}
const W = (p, fn, arg) => p.page.evaluate(fn, arg);
const waitFor = (p, fn, arg, timeout = 20000) => p.page.waitForFunction(fn, arg, { timeout, polling: 200 });
const req = (p, op, args = {}) => W(p, ([op, args]) => window.__liveraTogether.request(op, args), [op, args]);
async function bank(p) { const r = await req(p, "phone", { app: "bank" }); assert(r.ok, `${p.name}'s bank: ${JSON.stringify(r.error)}`); return r.data.bank_cents; }
async function look(p) { const r = await req(p, "look"); assert(r.ok, `${p.name}'s look: ${JSON.stringify(r.error)}`); return r.data; }
const playing = p => waitFor(p, id => window.__livera && window.__livera.phase() === "playing" && window.__livera.world.selfId === id && window.__livera.world.buildings.length > 0 && window.__liveraTogether.status() === "open", p.character, 40000);
async function join(p) {
  await p.page.waitForSelector("#together-join", { timeout: 30000 });
  await p.page.click("#together-join");
  await p.page.waitForSelector(`.castcard[data-character="${p.character}"]`, { timeout: 20000 });
  await p.page.click(`.castcard[data-character="${p.character}"]`);
  await playing(p);
}
const hide = (p, hidden) => W(p, hidden => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}, hidden);
const feedHas = (p, text, timeout = 10000) => waitFor(p, t => [...document.querySelectorAll("#feed .line")].some(n => n.textContent.includes(t)), text, timeout);
const shot = (p, name) => p.page.screenshot({ path: path.join(SHOTS, name) });
// Fast-forwards the town from the host's page (real time would do the same, slower).
async function advanceUntil(host, cond, { step = 5, max = 120 } = {}) {
  for (let t = 0; t <= max; t += step) {
    if (await cond()) return true;
    await W(host, s => window.__liveraTogether.host.advance(s), step);
    await sleep(250);
  }
  return cond();
}
const seesAll = (p, ids) => W(p, ids => ids.every(id => { const x = window.__livera.world.people.get(id); return x && x.pos; }), ids);

// ------------------------------------------------------------------ the run
(async () => {
  const browser = await chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 820, height: 640 } });
  let H, E, V;
  const F = [];
  let price = 0, naomiAfterBuy = null;

  await test("every page says plainly where the town runs; only admins are offered hosting", async () => {
    H = await open("u_owner", "owner", "Dee", "dominique");
    F.push(await open("u_ali", "interact", "Ali", "aaliyah"));
    F.push(await open("u_gray", "interact", "Gray", "graham"));
    F.push(await open("u_nao", "interact", "Nao", "naomi"));
    F.push(await open("u_may", "interact", "May", "maya", { width: 390, height: 844 }));
    for (const p of [H, ...F]) {
      await p.page.waitForSelector("#together-notice", { timeout: 30000 });
      const text = await p.page.textContent("#screen");
      for (const re of NOTICE) assert(re.test(text), `${p.name}'s lobby lacks ${re}`);
      assert(/Nobody is hosting right now/.test(text), `${p.name}'s lobby doesn't say nobody hosts`);
    }
    assert(await H.page.$("#together-host"), "the owner isn't offered hosting");
    for (const f of F) {
      assert(!(await f.page.$("#together-host")), `${f.name} (Contributor) is offered hosting`);
      assert(/starts when the owner \(or an Editor\) opens this page/.test(await f.page.textContent("#screen")), `${f.name} isn't told who can start the town`);
    }
    // A Viewer can watch the lobby but not play, and is told so; there is no Join button for them.
    V = await open("u_view", "view", "Vee", null);
    await V.page.waitForSelector("#together-notice", { timeout: 30000 });
    assert(/view-only/.test(await V.page.textContent("#screen")) && !(await V.page.$("#together-host")), "a Viewer isn't told they can't play");
    await waitFor(H, () => document.querySelectorAll("#together-people-list li").length === 6, null, 15000);
    const names = await H.page.textContent("#together-people-list");
    for (const n of ["Dee (you)", "Ali", "Gray", "Nao", "May", "Vee"]) assert(names.includes(n), `who's here lacks ${n}: ${names}`);
    const wide = await W(F[3], () => document.documentElement.scrollWidth > innerWidth + 1);
    assert(!wide, "the lobby scrolls sideways at 390 px");
    await shot(H, "together_01_lobby_host.png"); await shot(F[3], "together_02_lobby_phone.png");
  });

  await test("the host founds a town on an empty database and plays Dominique", async () => {
    await H.page.click("#together-host");
    await H.page.waitForSelector('.castcard[data-character="dominique"]', { timeout: 30000 });
    await H.page.click('.castcard[data-character="dominique"]');
    await playing(H);
    const s = await W(H, () => ({ role: window.__liveraTogether.role(), from: window.__liveraTogether.host.from(), note: document.getElementById("together-note").textContent }));
    assert(s.role === "host" && s.from === "new", "not hosting a new town: " + JSON.stringify(s));
    assert(/You're hosting/.test(s.note), "the HUD doesn't say this tab hosts: " + s.note);
    const doc = await W(H, async () => { const db = await claude.use("db"); const d = await db.doc("town/host").get(); return d.data(); });
    assert(doc.state === "hosting" && doc.uid === "u_owner" && typeof doc.pub === "string", "town/host: " + JSON.stringify(doc));
    await waitFor(H, () => !!window.__liveraTogether.host.lastSave(), null, 15000);
    await shot(H, "together_03_host_playing.png");
    await waitFor(V, () => /Hosted by Dee/.test(document.getElementById("screen").textContent), null, 20000);
    assert(!(await V.page.$("#together-join")), "a Viewer is offered Join");
    await V.page.close();
    people.splice(people.indexOf(V), 1);
  });

  await test("three friends join as three other characters", async () => {
    for (const f of F.slice(0, 3)) await join(f);
    for (const f of F.slice(0, 3)) {
      const s = await W(f, () => ({ role: window.__liveraTogether.role(), note: document.getElementById("together-note").textContent, banner: window.__liveraTogether.banner() }));
      assert(s.role === "friend", `${f.name} is ${s.role}`);
      assert(/runs in the host's browser/.test(s.note), `${f.name}'s HUD lacks the note: ${s.note}`);
      assert(!s.banner, `${f.name} shows a banner: ${s.banner}`);
    }
    const humans = await W(H, () => window.__liveraTogether.host.humans());
    assert(humans.length === 4, "the host counts " + JSON.stringify(humans));
  });

  await test("a taken character is refused: the picker says so and the host refuses", async () => {
    const may = F[3];
    await may.page.waitForSelector("#together-join", { timeout: 30000 });
    await may.page.click("#together-join");
    await may.page.waitForSelector('.castcard[data-character="graham"]');
    const card = await W(may, () => { const b = document.querySelector('.castcard[data-character="graham"]'); return { disabled: b.disabled, text: b.textContent }; });
    assert(card.disabled && /another player's/.test(card.text), "Graham's card isn't marked taken: " + JSON.stringify(card));
    const takeGraham = await req(may, "play", { character: "graham" });
    assert(!takeGraham.ok && takeGraham.error.code === "character_taken", "playing Graham: " + JSON.stringify(takeGraham));
    const takeHosts = await req(may, "play", { character: "dominique" });
    assert(!takeHosts.ok && takeHosts.error.code === "character_taken", "playing the host's Dominique: " + JSON.stringify(takeHosts));
    const second = await req(F[0], "play", { character: "naomi" });
    assert(!second.ok && second.error.code === "already_playing", "Ali playing a second character: " + JSON.stringify(second));
    await shot(may, "together_04_picker_taken.png");
    await may.page.click('.castcard[data-character="maya"]');
    await playing(may);
    // Out of the town (a reload), May still has Maya: one person, one character, for good.
    await may.page.reload();
    await may.page.waitForSelector("#together-join", { timeout: 30000 });
    const other = await req(may, "play", { character: "dax" });
    assert(!other.ok && other.error.code === "already_has_character", "May switching to Dax: " + JSON.stringify(other));
    const make = await req(may, "create_character", { character: { first_name: "Robin" } });
    assert(!make.ok && make.error.code === "already_has_character", "May making a second character: " + JSON.stringify(make));
    await join(may);
    const humans = await W(H, () => window.__liveraTogether.host.humans());
    assert(humans.length === 5, "the host counts " + JSON.stringify(humans));
  });

  await test("nobody can pose as the host, read the save or the claims, or act through someone else's channel", async () => {
    const gray = F[1];
    const r = await W(gray, async () => {
      const room = await claude.use("room"), db = await claude.use("db");
      const out = {};
      out.down = await room.emit("down", { v: 1, k: "s", e: "x", paused: true }).then(() => "sent", e => e.code);
      out.save = (await db.doc("town/save").get()).exists;
      out.claims = (await db.doc("town/claims").get()).exists;
      out.host = (await db.doc("town/host").get()).exists;
      out.write = await db.doc("town/host").set({ state: "hosting", peer: "mine" }).then(() => "written", e => e.code);
      out.lease = await db.doc("town/host").acquire({ holder: "me", ttlMs: 60000 }).then(() => "acquired", e => e.code);
      out.claimWrite = await db.doc("town/claims").set({ claims: { u_gray: { character: "dominique" } } }).then(() => "written", e => e.code);
      // A made-up frame on `up`: the platform stamps it with Gray's own peer, so it lands in Gray's channel, where it
      // doesn't decrypt.
      const doc = (await db.doc("town/host").get()).data();
      out.forged = await room.emit("up", { v: 1, k: "c", e: doc.epoch, s: 9000, i: 0, n: 1, f: 1, iv: "AAAAAAAAAAAAAAAA", d: "Zm9yZ2Vk" }).then(() => "sent", e => e.code);
      return out;
    });
    assert(r.down === "not_permitted", "a Contributor could send on the host's topic: " + r.down);
    assert(r.save === false && r.claims === false, "a Contributor can read the save or the claims: " + JSON.stringify(r));
    assert(r.host === true, "a Contributor can't read town/host");
    assert(r.write === "invalid_argument" && r.lease === "invalid_argument" && r.claimWrite === "invalid_argument", "a Contributor could write the town's documents: " + JSON.stringify(r));
    await sleep(800);
    const s = await W(H, () => ({ link: window.__liveraTogether.link(), claims: window.__liveraTogether.host.claims() }));
    const grayPeer = await W(gray, () => window.__liveraTogether.peer());
    assert(s.link.host[grayPeer] && s.link.host[grayPeer].bad >= 0, "no channel for Gray on the host");
    const claims = Object.fromEntries(s.claims.map(c => [c.uid, c.character]));
    assert(claims.u_gray === "graham" && claims.u_owner === "dominique" && claims.u_nao === "naomi", "the claims: " + JSON.stringify(claims));
    const still = await req(gray, "look");
    assert(still.ok && still.data.you.id === "graham", "Gray's own session broke: " + JSON.stringify(still.error));
    // The server's limits hold here too: 20 requests a second (bursts of 40), and a line a second for speech.
    const flood = await W(gray, async () => (await Promise.all(Array.from({ length: 50 }, () => window.__liveraTogether.request("ping")))).map(r => (r.ok ? "ok" : r.error.code)));
    assert(flood.includes("rate_limited") && flood.filter(c => c === "ok").length >= 35, "50 requests at once: " + JSON.stringify(flood));
    await sleep(1500);
    const chat = await W(gray, async () => (await Promise.all(Array.from({ length: 8 }, (_, i) => window.__liveraTogether.request("say", { text: `line ${i}`, volume: "whisper", to: "nobody" })))).map(r => (r.ok ? "ok" : r.error.code)));
    assert(chat.includes("chat_rate_limited"), "8 lines at once: " + JSON.stringify(chat));
    await sleep(1500);
    assert((await req(gray, "look")).ok, "Gray is still limited after a pause");
  });

  await test("everyone sees the other four on the map", async () => {
    const all = [H, ...F];
    for (const p of all) { const r = await req(p, "exit"); assert(r.ok || r.error.code === "not_inside", `${p.name} exit: ${JSON.stringify(r.error)}`); }
    // Founders the autopilot had out and about when their person joined are wherever they were (people take over
    // where the character stands): everyone meets at the Lexington's door.
    for (const p of all) { const go = await req(p, "move", { location: "lexington_1204" }); assert(go.ok, `${p.name}'s walk: ${JSON.stringify(go.error)}`); }
    const there = await advanceUntil(H, async () => {
      for (const p of all) { const l = await look(p); if (l.you.moving || d2(l.you.position, [430, 470]) > 8) return false; }
      return true;
    });
    assert(there, "not everyone reached the Lexington");
    for (const p of all) {
      const ids = all.filter(o => o !== p).map(o => o.character);
      await waitFor(p, ids => ids.every(id => { const x = window.__livera.world.people.get(id); return x && x.pos; }), ids, 20000)
        .catch(async () => { throw new Error(`${p.name} sees ${JSON.stringify(await W(p, () => [...window.__livera.world.people.keys()]))}, wants ${ids}`); });
      const drawn = await W(p, ids => ids.filter(id => window.__livera.tapPoint("person", id)), ids);
      assert(drawn.length === 4, `${p.name}'s map draws ${JSON.stringify(drawn)} of ${ids}`);
    }
    await shot(H, "together_05_five_on_the_map.png"); await shot(F[3], "together_06_five_phone.png");
  });

  await test("a say reaches only those in range", async () => {
    const may = F[3];
    const step = await req(may, "move", { x: 430, y: 515 });
    assert(step.ok, "Maya's step away: " + JSON.stringify(step.error));
    const away = await advanceUntil(H, async () => { const l = await look(may); return !l.you.moving; }, { step: 2, max: 30 });
    assert(away, "Maya didn't stop");
    const gap = d2((await look(may)).you.position, (await look(H)).you.position);
    assert(gap > 25 && gap < 60, `Maya is ${gap.toFixed(1)} m from the host (wanted beyond say range, within shout range)`);
    await waitFor(may, () => window.__livera.world.people.has("dominique"), null, 10000);
    await H.page.fill("#chat-input", `Hello from the host ${XSS}`);
    await H.page.click("#chat-send");
    await feedHas(H, "Heard by");
    const heard = Number((await W(H, () => [...document.querySelectorAll("#feed .line")].map(n => n.textContent).find(t => /^Heard by \d+$/.test(t)) || "")).replace(/\D/g, ""));
    assert(heard >= 3, `the host was heard by ${heard}`);
    for (const f of F.slice(0, 3)) await feedHas(f, "Hello from the host");
    await sleep(2500);
    const mayHeard = await W(may, () => [...document.querySelectorAll("#feed .line")].some(n => n.textContent.includes("Hello from the host")));
    assert(!mayHeard, "Maya, beyond say range, heard it");
    for (const p of [H, ...F]) {
      const imgs = await W(p, () => document.querySelectorAll('img[src="x"]').length);
      assert(imgs === 0, `speech became an <img> on ${p.name}'s page`);
    }
    await shot(F[0], "together_07_heard.png");
  });

  await test("a buy changes only the buyer's money", async () => {
    const nao = F[2];
    const before = {};
    for (const p of [H, ...F]) before[p.character] = await bank(p);
    const go = await req(nao, "move", { location: "heritage_coffee" });
    assert(go.ok, "Naomi's walk: " + JSON.stringify(go.error));
    const there = await advanceUntil(H, async () => !(await look(nao)).you.moving, { step: 3, max: 60 });
    assert(there, "Naomi didn't reach Heritage Coffee");
    const inside = await req(nao, "enter", { location: "heritage_coffee" });
    assert(inside.ok, "Naomi going in: " + JSON.stringify(inside.error));
    await nao.page.waitForSelector('#sheet[data-kind="scene"] [data-buy]', { timeout: 15000 });
    const offer = await W(nao, () => window.__livera.world.here.offers[0]);
    price = offer.price_cents;
    await nao.page.click(`#sheet [data-buy="${offer.id}"][data-method="card"]`);
    await feedHas(nao, "Bought");
    naomiAfterBuy = before.naomi - price;
    await waitFor(nao, want => window.__livera.world.money && window.__livera.world.money.bank_cents === want, naomiAfterBuy, 10000);
    assert(await bank(nao) === naomiAfterBuy, "Naomi's bank didn't drop by the price");
    for (const p of [H, ...F]) if (p !== nao) assert(await bank(p) === before[p.character], `${p.name}'s money moved`);
    await shot(nao, "together_08_bought.png");
  });

  await test("the host's tab hiding pauses everyone, and they're told", async () => {
    const t0 = await W(H, () => window.__liveraTogether.host.ticks());
    await hide(H, true);
    for (const f of F) await waitFor(f, () => /Paused: the host's tab is in the background/.test(window.__liveraTogether.banner()), null, 15000);
    const say = await req(F[0], "say", { text: "anyone?", volume: "say" });
    assert(!say.ok && say.error.code === "town_paused", "a say while paused: " + JSON.stringify(say));
    assert((await req(F[0], "look")).ok, "look is refused while paused");
    await sleep(1200);
    const t1 = await W(H, () => window.__liveraTogether.host.ticks());
    assert(t1 - t0 <= 2, `the town ticked ${t1 - t0} times while the host's tab was hidden`);
    await waitFor(H, () => (window.__liveraTogether.host.lastSave() || {}).how === "hidden", null, 10000);
    await shot(F[0], "together_09_paused.png");
    await hide(H, false);
    for (const f of F) await waitFor(f, () => !window.__liveraTogether.banner(), null, 15000);
    const again = await req(F[0], "say", { text: "Back again", volume: "say" });
    assert(again.ok, "a say after the pause: " + JSON.stringify(again.error));
    await feedHas(F[1], "Back again");
  });

  let before = null;
  await test("the host reloading stops the town honestly (nobody else may host); the save brings everyone back", async () => {
    before = {};
    for (const p of [H, ...F]) { const l = await look(p); before[p.character] = { pos: l.you.position, inside: l.you.inside }; }
    assert(await W(H, () => window.__liveraTogether.host.save("test")), "the host's save failed");
    await H.page.reload();
    for (const f of F) {
      await waitFor(f, () => window.__livera.phase() === "lobby" && !!document.getElementById("together-message"), null, 40000);
      const text = await f.page.textContent("#screen");
      assert(/The host (left|stopped)/.test(text), `${f.name} isn't told the host left: ${text.slice(0, 300)}`);
      assert(/Nobody is hosting right now/.test(text) && !(await f.page.$("#together-host")), `${f.name}'s lobby is wrong after the host left`);
      assert((await W(f, () => window.__liveraTogether.role())) === "none", `${f.name} took over without being an admin`);
    }
    await shot(F[0], "together_10_host_left.png");
    // The host is back: host again (a reload keeps this tab's hold on the lease), and pick Dominique, theirs.
    await H.page.waitForSelector("#together-host", { timeout: 30000 });
    for (let i = 0; i < 8; i++) {
      await H.page.click("#together-host");
      const got = await H.page.waitForSelector('.castcard[data-character="dominique"], #screen .err:not(:empty)', { timeout: 30000 });
      if (await got.getAttribute("data-character")) break;
      console.log(`  (host again: ${(await got.textContent()).slice(0, 120)})`);
      await sleep(3000);
    }
    const mine = await W(H, () => { const b = document.querySelector('.castcard[data-character="dominique"]'); return b && /yours/.test(b.textContent); });
    assert(mine, "Dominique isn't marked as the host's own after the reload");
    await H.page.click('.castcard[data-character="dominique"]');
    await playing(H);
    assert((await W(H, () => window.__liveraTogether.host.from())) === "save", "the town didn't come from the save");
    for (const f of F) await playing(f);
    assert(await bank(F[2]) === naomiAfterBuy, "Naomi's money didn't survive");
    for (const p of [H, ...F]) {
      const l = await look(p);
      assert(l.you.inside === before[p.character].inside, `${p.name}'s place: ${l.you.inside} vs ${before[p.character].inside}`);
      assert(d2(l.you.position, before[p.character].pos) < 3, `${p.name}'s position: ${l.you.position} vs ${before[p.character].pos}`);
    }
  });

  await test("the host closing hands over to another admin who has played here", async () => {
    E = await open("u_ed", "admin", "Ed", "dax");
    E.character = "dax";
    await join(E);
    const banks = {};
    for (const p of F) banks[p.character] = await bank(p);
    await H.page.close({ runBeforeUnload: true });
    people.splice(people.indexOf(H), 1);
    await waitFor(E, () => window.__liveraTogether.role() === "host", null, 45000);
    assert((await W(E, () => window.__liveraTogether.host.from())) === "save", "the new host didn't load the save");
    await playing(E);
    for (const f of F) await playing(f);
    for (const f of F) assert(await bank(f) === banks[f.character], `${f.name}'s money changed in the handover`);
    assert(/You're hosting/.test(await E.page.textContent("#together-note")), "the new host's HUD doesn't say so");
    const text = await F[0].page.evaluate(() => window.__liveraTogether.hostDoc());
    assert(text.uid === "u_ed" && text.state === "hosting", "town/host after the handover: " + JSON.stringify(text));
    await waitFor(F[0], () => window.__livera.world.people.has("graham"), null, 20000);
    await shot(E, "together_11_handover.png");
  });

  await test("a second tab of the same person takes over; the first is told and can take it back", async () => {
    const ali = F[0];
    const ali2 = await open("u_ali", "interact", "Ali", "aaliyah");
    await ali2.page.waitForSelector("#together-join", { timeout: 30000 });
    await ali2.page.click("#together-join");
    await ali2.page.waitForSelector('.castcard[data-character="aaliyah"]');
    assert(/yours/.test(await ali2.page.textContent('.castcard[data-character="aaliyah"]')), "Aaliyah isn't marked as Ali's own");
    await ali2.page.click('.castcard[data-character="aaliyah"]');
    await playing(ali2);
    await ali.page.waitForSelector("#screen >> text=Play here instead", { timeout: 20000 });
    assert(/playing in another tab/.test(await ali.page.textContent("#screen")), "the first tab isn't told why");
    await ali2.page.close({ runBeforeUnload: true });
    people.splice(people.indexOf(ali2), 1);
    await ali.page.click("#screen >> text=Play here instead");
    await playing(ali);
  });

  await test("Stop hosting saves and ends the town for everyone; a save that doesn't check out is never loaded", async () => {
    await E.page.click("#menu-btn");
    await E.page.waitForSelector("#together-stop");
    assert(/Only you see this/.test(await E.page.textContent("#sheet")), "the host's menu lacks who plays whom");
    await E.page.click("#together-stop");
    await E.page.waitForSelector("#together-host", { timeout: 20000 });
    assert(/You stopped hosting/.test(await E.page.textContent("#screen")), "the host isn't told it stopped");
    for (const f of F) {
      await waitFor(f, () => window.__livera.phase() === "lobby" && /The host stopped the town/.test(document.getElementById("screen").textContent), null, 30000);
      assert(!(await f.page.$("#together-host")), `${f.name} is offered hosting`);
    }
    await sleep(4000);
    assert((await W(E, () => window.__liveraTogether.role())) === "none", "the host that stopped took the town back by itself");
    // A save whose parts don't match its checksum: refused, nothing changed, and a new town only after a confirm.
    await W(E, async () => { const db = await claude.use("db"); await db.doc("town/save").update({ sha256: "0".repeat(64) }); });
    await E.page.click("#together-host");
    await E.page.waitForSelector("#together-fresh", { timeout: 30000 });
    assert(/can't be loaded/.test(await E.page.textContent("#screen")), "the refusal doesn't say the save can't be loaded");
    await shot(E, "together_12_save_refused.png");
    await E.page.click("#together-fresh");
    await E.page.click("#together-fresh-yes");
    await E.page.waitForSelector('.castcard[data-character="graham"]', { timeout: 30000 });
    assert((await W(E, () => window.__liveraTogether.host.from())) === "new", "a new town wasn't founded");
    assert(!(await W(E, () => document.querySelector('.castcard[data-character="graham"]').disabled)), "the old claims were kept in the new town");
    await E.page.click('.castcard[data-character="dax"]');
    await playing(E);
    for (const f of F) await playing(f);
  });

  await test("the link held up (messages lost and sent again, nothing given up)", async () => {
    const t = { framesIn: 0, retransmits: 0, lost: 0, gaps: 0, bad: 0, sent: 0 };
    for (const p of [...F, E]) {
      const s = await W(p, () => window.__liveraTogether.link());
      for (const k of ["framesIn", "retransmits", "lost", "gaps", "bad"]) t[k] += s.totals[k];
      t.sent += s.sent;
    }
    console.log(`  (the room dropped ${DROP * 100}% of deliveries; these five pages sent ${t.sent} messages and read ${t.framesIn} frames, with ${t.retransmits} resends, ${t.lost} given up, ${t.gaps} gaps, ${t.bad} that didn't decrypt)`);
    assert(t.lost === 0 && t.gaps === 0, "the link gave up on something");
    // Gray's forged frame landed on the host, not on these pages.
    assert(t.bad === 0, "a frame didn't decrypt on a friend's page");
    if (DROP > 0) assert(t.retransmits > 0, "nothing was ever sent again, though the room drops messages");
  });

  await test("no console errors and no dialogs in any page", async () => {
    const bad = people.flatMap(p => [...p.errors.map(e => `${p.label}: ${e}`), ...p.dialogs.map(d => `${p.label}: dialog ${d}`)]);
    assert(!bad.length, bad.join("\n"));
  });

  await browser.close();
  console.log(`\n${results.filter(r => r[0] === "PASS").length} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
