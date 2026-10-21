// End-to-end tests for moments (D-068, D-069, D-070): life events and the street, in real Chromium. Run with
//   web/tests/run_solo_e2e.sh moments_e2e.js
// (it serves web/client; the Play-together part uses the same server's /together/ page on fake_platform.js).
// Same conventions as solo_e2e.js: PASS / FAIL / SKIP per test, non-zero exit on any FAIL.
//
// Single-player, phone: a life event's card slides up; a choice applies its outcome (money only as the ledger
// moved it); the Story app lists it. Shoplifting at Thread & Co.: the odds and the ladder first; until caught;
// arrested: the cell's card and the Held chip; released. Play together, desktop host and phone friend: a fight
// from the person card (the ladder first), the friend's card with Fight back / Run / Take it, both result cards,
// and the Wanted chip when it's reported. No console errors.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SOLO = process.env.LIVERA_SOLO_URL || "http://127.0.0.1:18950/solo/";
const TOGETHER = SOLO.replace(/\/solo\/?$/, "/together/");
const SHOTS = process.env.LIVERA_SHOTS || path.join(__dirname, "shots");
const SPACE = `m${Date.now() % 1e8}`;
fs.mkdirSync(SHOTS, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

const results = [];
let failed = 0;
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push(["PASS", name]); console.log(`PASS ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
  catch (e) {
    failed++; results.push(["FAIL", name, e.message]); console.log(`FAIL ${name}: ${(e.stack || e.message).split("\n").slice(0, 6).join("\n")}`);
    for (const [i, p] of all.entries()) await p.page.screenshot({ path: path.join(SHOTS, `fail_${results.length}_${i}.png`) }).catch(() => {});
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const W = (p, fn, arg) => p.page.evaluate(fn, arg);
const waitFor = (p, fn, arg, timeout = 20000) => p.page.waitForFunction(fn, arg, { timeout, polling: 200 });
// After the cards' slide-up has finished.
const shot = async (p, name) => { await sleep(450); await p.page.screenshot({ path: path.join(SHOTS, name) }); };
const all = [];
function watch(page, label) {
  const p = { page, label, errors: [] };
  page.on("console", m => { if (m.type() === "error") p.errors.push(`console: ${m.text()}`); });
  page.on("pageerror", e => p.errors.push(`pageerror: ${e.message}`));
  page.on("dialog", d => d.dismiss().catch(() => {}));
  all.push(p);
  return p;
}
async function money(p) {
  const r = await W(p, () => window.__liveraMoments.bank());
  assert(r.ok, "bank app: " + JSON.stringify(r.error));
  return r.data.bank_cents + r.data.cash_cents;
}
async function closeSheet(p) { const b = await p.page.$('#sheet:not([hidden]) .sheet-head [aria-label="Close"]'); if (b) await b.click(); }
// A life event that came up meanwhile waits in its pill (the player's "Later"), so the cards under it can be used.
async function later(p) { const b = await p.page.$(".mo-card.mo-life:not(.mo-done) .mo-foot .btn.link"); if (b) await b.click(); const d = await p.page.$(".mo-card.mo-done .btn.primary"); if (d) await d.click(); }

(async () => {
  const browser = await chromium.launch();
  let A;

  // ---------------------------------------------------------------- single-player, on a phone
  await test("phone: a life event slides up as a card with its choices", async () => {
    A = watch(await (await browser.newContext(PHONE)).newPage(), "solo phone");
    await A.page.goto(SOLO);
    await A.page.waitForSelector("#solo-new", { timeout: 30000 });
    await A.page.click("#solo-new");
    await A.page.waitForSelector('.castcard[data-character="dominique"]', { timeout: 30000 });
    await A.page.click('.castcard[data-character="dominique"]');
    await waitFor(A, () => window.__livera && window.__livera.phase() === "playing" && window.__livera.world.buildings.length > 0);
    // Fast-forward the town until something comes up (the day's first slot opens after 08:00).
    for (let i = 0; i < 40 && !(await A.page.$(".mo-card.mo-life, #moment-pill:not([hidden])")); i++) {
      await W(A, () => window.__liveraSolo.advance(15));
      await sleep(150);
    }
    if (await A.page.$("#moment-pill:not([hidden]) .mo-pill")) await A.page.click("#moment-pill .mo-pill");
    await A.page.waitForSelector(".mo-card.mo-life .mo-choice", { timeout: 10000 });
    const card = await W(A, () => {
      const c = document.querySelector(".mo-card.mo-life");
      return { title: c.querySelector(".mo-title").textContent, prompt: c.querySelector(".mo-prompt").textContent, choices: c.querySelectorAll(".mo-choice").length,
        fits: c.getBoundingClientRect().right <= innerWidth && c.getBoundingClientRect().left >= 0, bar: document.getElementById("bar").getBoundingClientRect().top >= c.getBoundingClientRect().bottom - 1 };
    });
    assert(card.title && card.prompt.length > 20 && card.choices >= 2, "the card lacks a title, a prompt or choices: " + JSON.stringify(card));
    assert(card.fits && card.bar, "the card overflows the screen or covers the bottom bar: " + JSON.stringify(card));
    await shot(A, "life_01_event_card_phone.png");
  });

  await test("phone: a choice applies its outcome; money moves only as the ledger moved it", async () => {
    const offer = await W(A, () => window.__liveraMoments.offer());
    const story = await W(A, () => window.__liveraMoments.story());
    const pending = story.data.pending.find(e => e.event === offer.event);
    assert(pending, "the Story app doesn't hold the waiting event");
    // Prefer a choice that costs something when there is one (we can afford it), to see the ledger move.
    const before = await money(A);
    const priced = pending.choices.find(c => typeof c.cost_cents === "number" && c.cost_cents < before);
    const choice = priced || pending.choices[0];
    await A.page.click(`.mo-card.mo-life .mo-choice[data-option="${choice.option}"]`);
    await A.page.waitForSelector('.mo-card.mo-done[data-answered="1"] .mo-outcome', { timeout: 10000 });
    const outcome = await A.page.textContent(".mo-card.mo-done .mo-outcome");
    assert(outcome.length > 10, "no outcome text");
    const after = await money(A);
    const fx = (await A.page.$(".mo-card.mo-done .mo-fx")) ? await A.page.textContent(".mo-card.mo-done .mo-fx") : "";
    const moved = after - before;
    if (moved !== 0) assert(/\$/.test(fx), `money moved by ${moved} but the card doesn't say so: "${fx}"`);
    if (priced) assert(moved <= 0 && -moved <= priced.cost_cents || moved > 0, `a choice costing ${priced.cost_cents} moved ${moved}`);
    console.log(`  answered "${offer.title}" with "${choice.label}": ${outcome} [${fx}] (money ${before} -> ${after})`);
    await shot(A, "life_02_outcome_phone.png");
  });

  await test("phone: the Story app lists the answered event in your timeline", async () => {
    await A.page.click('.mo-card.mo-done .btn:has-text("Your story")');
    await A.page.waitForSelector("#phone:not([hidden]) .mo-timeline li.moment", { timeout: 10000 });
    const r = await W(A, () => window.__liveraMoments.story());
    const first = r.data.story.find(s => s.life_event);
    const text = await A.page.textContent("#phone .mo-timeline");
    assert(first && text.includes(first.text), "the timeline doesn't show the moment: " + (first && first.text));
    await shot(A, "life_03_story_phone.png");
    await A.page.click('#phone [aria-label="Close phone"]');
  });

  await test("phone: shoplifting shows the odds and the ladder first; caught means a cell, the Held chip, then freedom", async () => {
    // Thread & Co. opens at 09:00.
    const t = await W(A, async () => (await window.__livera.look()).data.time.minute % 1440);
    if (t < 9 * 60 + 15) await W(A, s => window.__liveraSolo.advance(s), 9 * 60 + 20 - t);
    await later(A);
    await closeSheet(A);
    if (await W(A, () => window.__livera.world.self.inside)) {
      await A.page.click("#ctx-btn");  // Exit
      await waitFor(A, () => window.__livera.world.self.inside === "", null, 15000);
    }
    await A.page.click("#places-btn");
    await A.page.fill("#places-search", "thread");
    await A.page.click('#places-list li[data-place="thread_co"] .place-go');
    await waitFor(A, () => window.__livera.world.self.inside === "thread_co", null, 40000);
    let caught = false;
    for (let tries = 0; tries < 30 && !caught; tries++) {
      await later(A);
      await A.page.waitForSelector('#sheet [data-verb="steal:thread_co"]', { timeout: 15000 });
      await A.page.click('#sheet [data-verb="steal:thread_co"]');
      await A.page.waitForSelector('.mo-card[data-moment="confirm"] .mo-odds', { timeout: 10000 });
      if (tries === 0) {
        const t = await A.page.textContent('.mo-card[data-moment="confirm"]');
        assert(/\d+% chance of being caught/.test(t), "no odds on the risk card: " + t);
        assert(/fine/.test(t) && /Held \d+ h at/.test(t) && /on your record/.test(t), "the ladder lacks a fine, a cell or the record: " + t);
        await shot(A, "street_01_shoplift_risk_phone.png");
      }
      await A.page.click('.mo-card[data-moment="confirm"] [data-crime="go"]');
      await waitFor(A, () => [...document.querySelectorAll("#feed .line")].some(n => /You walked out with|Caught shoplifting/.test(n.textContent)) || window.__livera.world.self.inside === "police_station", null, 15000);
      caught = await W(A, () => window.__livera.world.self.inside === "police_station");
      if (!caught) await W(A, () => { for (const n of document.querySelectorAll("#feed .line")) n.remove(); });
    }
    assert(caught, "never caught in 30 tries");
    await A.page.waitForSelector('.mo-card[data-moment="jail"]', { timeout: 15000 });
    await A.page.waitForSelector('#street-chips [data-street="held"]', { timeout: 10000 });
    const jail = await A.page.textContent('.mo-card[data-moment="jail"]');
    assert(/Held at/.test(jail) && /What you can do/.test(jail), "the cell's card: " + jail);
    await shot(A, "street_03_jail_phone.png");
    // Serve the time (fast-forward), and be told you're free.
    const until = await W(A, () => window.__liveraMoments.jail().until);
    const now = await W(A, () => window.__livera.world.minute());
    await W(A, s => window.__liveraSolo.advance(s), Math.ceil(until - now) + 65);
    await A.page.waitForSelector('.mo-card[data-moment="free"]', { timeout: 20000 });
    await shot(A, "street_04_free_phone.png");
    await A.page.click('.mo-card[data-moment="free"] .btn.primary');
    await waitFor(A, () => window.__livera.world.self.inside === "", null, 15000);
    assert(!(await A.page.$('#street-chips [data-street="held"]')), "the Held chip stayed after release");
  });

  // ---------------------------------------------------------------- single-player, on a desktop
  await test("desktop: a life event's card beside the map, its outcome, and the Story app", async () => {
    const D = watch(await (await browser.newContext(DESKTOP)).newPage(), "solo desktop");
    await D.page.goto(SOLO);
    await D.page.waitForSelector("#solo-new", { timeout: 30000 });
    await D.page.click("#solo-new");
    await D.page.waitForSelector('.castcard[data-character="dominique"]', { timeout: 30000 });
    await D.page.click('.castcard[data-character="dominique"]');
    await waitFor(D, () => window.__livera && window.__livera.phase() === "playing" && window.__livera.world.buildings.length > 0);
    for (let i = 0; i < 60 && !(await D.page.$(".mo-card.mo-life, #moment-pill:not([hidden])")); i++) {
      await W(D, () => window.__liveraSolo.advance(15));
      await sleep(150);
    }
    if (await D.page.$("#moment-pill:not([hidden]) .mo-pill")) { await shot(D, "life_05_pill_desktop.png"); await D.page.click("#moment-pill .mo-pill"); }
    await D.page.waitForSelector(".mo-card.mo-life .mo-choice", { timeout: 10000 });
    const box = await W(D, () => { const r = document.querySelector(".mo-card.mo-life").getBoundingClientRect(), col = document.getElementById("dock").getBoundingClientRect(); return { left: r.left, right: r.right, col: col.right, w: innerWidth }; });
    assert(box.left > box.col && box.right <= box.w, "the card covers the left column or overflows: " + JSON.stringify(box));
    await shot(D, "life_04_event_card_desktop.png");
    await D.page.click(".mo-card.mo-life .mo-choice >> nth=-1");
    await D.page.waitForSelector('.mo-card.mo-done[data-answered="1"]', { timeout: 10000 });
    await shot(D, "life_06_outcome_desktop.png");
    await D.page.click('.mo-card.mo-done .btn:has-text("Your story")');
    await D.page.waitForSelector("#phone:not([hidden]) .mo-timeline li.moment", { timeout: 10000 });
    await shot(D, "life_07_story_desktop.png");
  });

  // ---------------------------------------------------------------- Play together: a fight between two people
  let H, F;
  const req = (p, op, args = {}) => W(p, ([op, args]) => window.__liveraTogether.request(op, args), [op, args]);
  await test("together: from the person card, a crime's odds come first, and Back sends nothing", async () => {
    const ctx = await browser.newContext(DESKTOP);
    const open = async (as, level, name, viewport) => {
      const page = await ctx.newPage();
      if (viewport) await page.setViewportSize(viewport);
      const p = watch(page, name);
      await page.goto(`${TOGETHER}?space=${SPACE}&as=${as}&level=${level}&name=${encodeURIComponent(name)}&drop=0`);
      return p;
    };
    const playing = (p, id) => waitFor(p, id => window.__livera && window.__livera.phase() === "playing" && window.__livera.world.selfId === id && window.__livera.world.buildings.length > 0, id, 40000);
    H = await open("u_owner", "owner", "Dee");
    F = await open("u_gray", "interact", "Gray", { width: 390, height: 844 });
    await H.page.waitForSelector("#together-host", { timeout: 30000 });
    await H.page.click("#together-host");
    await H.page.waitForSelector('.castcard[data-character="dominique"]', { timeout: 30000 });
    await H.page.click('.castcard[data-character="dominique"]');
    await playing(H, "dominique");
    await F.page.waitForSelector("#together-join", { timeout: 30000 });
    await F.page.click("#together-join");
    await F.page.waitForSelector('.castcard[data-character="graham"]', { timeout: 20000 });
    await F.page.click('.castcard[data-character="graham"]');
    await playing(F, "graham");
    // Both to Greenleaf Market (walking, through the same ops the client sends).
    for (const p of [H, F]) {
      await req(p, "exit");
      const m = await req(p, "move", { location: "greenleaf_market" });
      assert(m.ok, "move: " + JSON.stringify(m.error));
    }
    for (let i = 0; i < 60; i++) {
      await W(H, () => window.__liveraTogether.host.advance(1));
      const a = await req(H, "enter", { location: "greenleaf_market" }), b = await req(F, "enter", { location: "greenleaf_market" });
      if (a.ok && b.ok) break;
      await sleep(200);
    }
    await waitFor(F, () => window.__livera.world.self.inside === "greenleaf_market" && window.__livera.world.people.has("dominique"), null, 20000);
    await later(F);
    await F.page.waitForSelector('#sheet .person[data-person="dominique"]', { timeout: 20000 });
    await F.page.click('#sheet .person[data-person="dominique"]');
    await F.page.waitForSelector('#sheet [data-verb="pickpocket:dominique"]', { timeout: 15000 });
    const cash = (await req(H, "phone", { app: "bank" })).data.cash_cents;
    await F.page.click('#sheet [data-verb="pickpocket:dominique"]');
    await F.page.waitForSelector('.mo-card[data-moment="confirm"] .mo-odds', { timeout: 10000 });
    const t = await F.page.textContent('.mo-card[data-moment="confirm"]');
    assert(/\d+% chance of being caught/.test(t) && /they notice, report you/.test(t), "the pickpocket card: " + t);
    await shot(F, "street_06_pickpocket_risk_phone.png");
    await F.page.click('.mo-card[data-moment="confirm"] .btn:has-text("Back")');
    await sleep(500);
    assert((await req(H, "phone", { app: "bank" })).data.cash_cents === cash, "Back still picked her pocket");
  });

  await test("together: a fight: the ladder first, the person attacked chooses, both see how it went; reported means Wanted", async () => {
    let state = { wanted: null, jail: null };
    for (let day = 0; day < 4 && !state.wanted && !state.jail; day++) {
      // The next day (the host fast-forwards at most 600 s a call): once a pair a day.
      if (day) { for (let k = 0; k < 3; k++) { await W(H, () => window.__liveraTogether.host.advance(600)); await sleep(300); } await sleep(2500); }
      await later(F); await later(H);
      if (!(await F.page.$('#sheet [data-verb="fight:dominique"]'))) {
        await closeSheet(F);
        if (!(await F.page.$('#sheet .person[data-person="dominique"]'))) await F.page.click("#sheet .mini-pill .btn.grow").catch(() => {});
        await F.page.waitForSelector('#sheet .person[data-person="dominique"]', { timeout: 15000 });
        await F.page.click('#sheet .person[data-person="dominique"]');
        await F.page.waitForSelector('#sheet [data-verb="fight:dominique"]', { timeout: 15000 });
      }
      await later(F);
      await F.page.click('#sheet [data-verb="fight:dominique"]');
      await F.page.waitForSelector('.mo-card[data-moment="confirm"] .mo-odds', { timeout: 10000 });
      if (!day) {
        const t = await F.page.textContent('.mo-card[data-moment="confirm"]');
        assert(/Assault on your record/.test(t) && /report you/.test(t) && /never a crime/.test(t), "the fight's ladder: " + t);
        await shot(F, "fight_01_risk_phone.png");
      }
      await F.page.click('.mo-card[data-moment="confirm"] [data-crime="go"]');
      await H.page.waitForSelector('.mo-card[data-moment="fight"] [data-fight="fight_back"]', { timeout: 15000 });
      await later(H);
      if (!day) await shot(H, "fight_02_defender_desktop.png");
      await H.page.click('.mo-card[data-moment="fight"] [data-fight="fight_back"]');
      // Beat Brawl (D-077): both get the fight screen; the World throws for each in turn and judges every beat.
      await H.page.waitForSelector(".bb", { timeout: 15000 });
      await F.page.waitForSelector(".bb", { timeout: 15000 });
      // The first beat the attacker answers: the tell is over Dominique's head, the buttons live until the ring closes.
      await F.page.waitForSelector(".bb .bb-btn:not([disabled])", { timeout: 15000 });
      const tell = await F.page.textContent(".bb .bb-tell");
      assert(/HOOK|JAB|SHOVE|OPEN/.test(tell), "no tell over the one throwing: " + tell);
      if (!day) { await shot(F, "fight_03_brawl_tell_phone.png"); await shot(H, "fight_04_brawl_desktop.png"); }
      await F.page.click('.bb .bb-btn[data-answer="duck"]');
      // The rest go unanswered: every throw of whoever started it lands (assault); it ends in a knockout or on points.
      await H.page.waitForSelector('.mo-card[data-moment="fight-result"]', { timeout: 60000 });
      await F.page.waitForSelector('.mo-card[data-moment="fight-result"]', { timeout: 15000 });
      assert(!(await F.page.$(".bb")) && !(await H.page.$(".bb")), "the fight screen stayed up after the result");
      const mine = await F.page.textContent('.mo-card[data-moment="fight-result"]'), theirs = await H.page.textContent('.mo-card[data-moment="fight-result"]');
      assert(/You won|You lost/.test(mine) && /You won|You lost/.test(theirs), `result cards: "${mine}" / "${theirs}"`);
      assert(/self-defence/.test(theirs), "the person attacked isn't told self-defence is no crime: " + theirs);
      if (!day) { await shot(F, "fight_05_result_phone.png"); await shot(H, "fight_06_result_desktop.png"); }
      console.log(`  day ${day}: attacker: ${mine}\n         defender: ${theirs}`);
      await F.page.click('.mo-card[data-moment="fight-result"] .btn.primary');
      await H.page.click('.mo-card[data-moment="fight-result"] .btn.primary');
      await sleep(800);
      state = await W(F, () => ({ wanted: window.__liveraMoments.wanted(), jail: window.__liveraMoments.jail() }));
    }
    assert(state.wanted || state.jail, "four fights and never reported or caught");
    if (state.jail) {
      await F.page.waitForSelector('#street-chips [data-street="held"]', { timeout: 10000 });
      await shot(F, "street_02_held_phone.png");
    } else {
      await F.page.waitForSelector('#street-chips [data-street="wanted"]', { timeout: 10000 });
      const chip = await F.page.textContent('#street-chips [data-street="wanted"]');
      assert(/Wanted · assault/i.test(chip), "the chip reads: " + chip);
      await shot(F, "street_02_wanted_phone.png");
      await F.page.click('#street-chips [data-street="wanted"]');
      await F.page.waitForSelector('.mo-card[data-moment="wanted"]', { timeout: 10000 });
      await shot(F, "street_02b_wanted_card_phone.png");
      await F.page.click('.mo-card[data-moment="wanted"] .btn.primary');
    }
    await closeSheet(F);
    await F.page.click("#you-btn");
    await F.page.waitForSelector('#sheet [data-pref="walk_away"]', { timeout: 10000 });
    const you = await F.page.textContent("#sheet");
    assert(/The street/i.test(you) && /walk away from fights/.test(you), "the You card lacks the street lines: " + you);
    if (state.wanted) assert(/Wanted for assault/.test(you), "the You card doesn't say wanted: " + you);
    await F.page.$eval('#sheet [data-pref="walk_away"]', n => n.scrollIntoView({ block: "center" }));
    await shot(F, "street_05_you_phone.png");
    // Walking away is a choice the server keeps.
    await F.page.click('#sheet [data-pref="walk_away"] input');
    await waitFor(F, () => [...document.querySelectorAll("#feed .line")].some(n => /always walk away/.test(n.textContent)), null, 10000);
    const rec = await req(F, "phone", { app: "record" });
    assert(rec.data.walk_away_from_fights === true, "the server didn't keep it: " + JSON.stringify(rec.data));
  });

  await test("no console errors", async () => {
    const errs = all.flatMap(p => p.errors.map(e => `${p.label}: ${e}`)).filter(e => !/favicon/.test(e));
    assert(!errs.length, errs.join("\n"));
  });

  await browser.close();
  const pass = results.filter(r => r[0] === "PASS").length;
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
