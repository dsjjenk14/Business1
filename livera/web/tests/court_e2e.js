// End-to-end tests for the court (D-083), in real Chromium, single-player. Run with
//   web/tests/run_solo_e2e.sh court_e2e.js
// Same conventions as moments_e2e.js: PASS / FAIL / SKIP per test, non-zero exit on any FAIL.
//
// Phone: shoplifting at Thread & Co.: the risk card shows the court's numbers; caught, Dominique is booked (the cell's
// card says charged, with the date) and the summons card has the charges, the date and the honest odds; the date is in
// the Calendar, the Today sheet and the Next card; released, she goes to the courthouse; at the time the courtroom card
// opens with the charges, the odds (the same number the court app gives), Guilty / Not guilty and the lawyer; hiring
// Hale & Partners is paid through the bank and lowers the odds; Guilty brings the verdict card and a conviction in the
// Record app. Desktop: a missed hearing is a warrant: the Wanted chip and its card. No console errors.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SOLO = process.env.LIVERA_SOLO_URL || "http://127.0.0.1:18950/solo/";
const SHOTS = process.env.LIVERA_SHOTS || path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

const results = [];
let failed = 0;
const all = [];
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push(["PASS", name]); console.log(`PASS ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
  catch (e) {
    failed++; results.push(["FAIL", name, e.message]); console.log(`FAIL ${name}: ${(e.stack || e.message).split("\n").slice(0, 6).join("\n")}`);
    for (const [i, p] of all.entries()) await p.page.screenshot({ path: path.join(SHOTS, `court_fail_${results.length}_${i}.png`) }).catch(() => {});
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const W = (p, fn, arg) => p.page.evaluate(fn, arg);
const waitFor = (p, fn, arg, timeout = 20000) => p.page.waitForFunction(fn, arg, { timeout, polling: 200 });
const shot = async (p, name) => { await sleep(450); await p.page.screenshot({ path: path.join(SHOTS, name) }); };
function watch(page, label) {
  const p = { page, label, errors: [] };
  page.on("console", m => { if (m.type() === "error") p.errors.push(`console: ${m.text()}`); });
  page.on("pageerror", e => p.errors.push(`pageerror: ${e.message}`));
  page.on("dialog", d => d.dismiss().catch(() => {}));
  all.push(p);
  return p;
}
const minute = async p => (await W(p, async () => (await window.__livera.look()).data.time.minute));
// Fast-forward the town by game minutes (the page's hook takes real seconds), with needs topped up (D-080).
const advance = (p, minutes) => W(p, m => {
  const rate = (window.__livera.world.rules && window.__livera.world.rules.minutes_per_real_second) || 1;
  window.__liveraSolo.advance(Math.max(0, m) / rate); window.__liveraSolo.care();
}, minutes);
async function closeSheet(p) { const b = await p.page.$('#sheet:not([hidden]) .sheet-head [aria-label="Close"]'); if (b) await b.click(); }
async function later(p) { const b = await p.page.$(".mo-card.mo-life:not(.mo-done) .mo-foot .btn.link"); if (b) await b.click(); const d = await p.page.$(".mo-card.mo-life.mo-done .btn.primary"); if (d) await d.click(); }
async function closeCards(p, kinds) {
  for (const k of kinds) {
    const b = await p.page.$(`.mo-card[data-moment="${k}"] .btn.link`) || await p.page.$(`.mo-card[data-moment="${k}"] .btn.primary`);
    if (b) await b.click().catch(() => {});
  }
}
async function money(p) {
  const r = await W(p, () => window.__liveraMoments.bank());
  assert(r.ok, "bank app: " + JSON.stringify(r.error));
  return r.data.bank_cents + r.data.cash_cents;
}
async function openPhone(p, app) {
  if (!(await p.page.$("#phone:not([hidden])"))) { await closeSheet(p); await p.page.click("#phone-btn"); }
  await p.page.waitForSelector("#phone .app, #phone .phone-head");
  for (let i = 0; i < 3 && (await p.page.$('#phone [aria-label="Back to apps"]')); i++) await p.page.click('#phone [aria-label="Back to apps"]');
  await p.page.waitForSelector("#phone .app");
  if (!(await p.page.$(`#phone [data-app="${app}"]`))) { await p.page.click("#phone [data-more]"); await p.page.waitForSelector(`#phone [data-app="${app}"]`); }
  await p.page.click(`#phone [data-app="${app}"]`);
  await waitFor(p, () => !/Opening…/.test(document.querySelector("#phone .phone-inner").textContent), null, 10000);
}
async function closePhone(p) { const c = await p.page.$('#phone:not([hidden]) [aria-label="Close phone"]'); if (c) await c.click(); }
async function goPlace(p, query, id) {
  await closeSheet(p);
  if (await W(p, () => window.__livera.world.self.inside)) {
    await p.page.click("#ctx-btn");  // Exit
    await waitFor(p, () => window.__livera.world.self.inside === "", null, 15000);
  }
  await p.page.click("#places-btn");
  await p.page.fill("#places-search", query);
  await p.page.click(`#places-list li[data-place="${id}"] .place-go`);
  await waitFor(p, place => window.__livera.world.self.inside === place, id, 40000);
}
async function newGame(p) {
  await p.page.goto(SOLO);
  await p.page.waitForSelector("#solo-new", { timeout: 30000 });
  await p.page.click("#solo-new");
  await p.page.waitForSelector('.castcard[data-character="dominique"]', { timeout: 30000 });
  await p.page.click('.castcard[data-character="dominique"]');
  await waitFor(p, () => window.__livera && window.__livera.phase() === "playing" && window.__livera.world.buildings.length > 0);
}
// Shoplift at Thread & Co. until caught; `check` looks at the first risk card.
async function caughtShoplifting(p, check) {
  const t = (await minute(p)) % 1440;
  if (t < 9 * 60 + 15) await advance(p, 9 * 60 + 20 - t);  // Thread & Co. opens at 09:00
  await later(p);
  await goPlace(p, "thread", "thread_co");
  for (let tries = 0; tries < 30; tries++) {
    await later(p);
    await p.page.waitForSelector('#sheet [data-verb="steal:thread_co"]', { timeout: 15000 });
    await p.page.click('#sheet [data-verb="steal:thread_co"]');
    await p.page.waitForSelector('.mo-card[data-moment="confirm"] .mo-odds', { timeout: 10000 });
    if (tries === 0 && check) await check();
    await p.page.click('.mo-card[data-moment="confirm"] [data-crime="go"]');
    await waitFor(p, () => [...document.querySelectorAll("#feed .line")].some(n => /You walked out with|Caught shoplifting/.test(n.textContent)) || window.__livera.world.self.inside === "police_station", null, 15000);
    if (await W(p, () => window.__livera.world.self.inside === "police_station")) return;
    await W(p, () => { for (const n of document.querySelectorAll("#feed .line")) n.remove(); });
  }
  throw new Error("never caught in 30 tries");
}

(async () => {
  const browser = await chromium.launch();
  let A, caseId = null;

  await test("phone: the risk card shows the court's numbers; caught, you're booked, charged and summoned with the honest odds", async () => {
    A = watch(await (await browser.newContext(PHONE)).newPage(), "court phone");
    await newGame(A);
    await caughtShoplifting(A, async () => {
      const t = await A.page.textContent('.mo-card[data-moment="confirm"]');
      assert(/Held 2 h at Livéra Police Station, then charged, with a hearing at Livéra Municipal Court/.test(t), "no booking and hearing on the risk card: " + t);
      assert(/\d+% you're convicted if you plead not guilty/.test(t), "no court odds on the risk card: " + t);
      assert(/fine/.test(t) && /on your record if you're convicted/.test(t), "no sentence or record on the risk card: " + t);
      await shot(A, "court_01_risk_phone.png");
    });
    await A.page.waitForSelector('.mo-card[data-moment="summons"]', { timeout: 15000 });
    const summons = await A.page.textContent('.mo-card[data-moment="summons"]');
    assert(/You're charged with Shoplifting/.test(summons) && /Your hearing: /.test(summons), "the summons card: " + summons);
    const app = await W(A, () => window.__liveraMoments.courtApp());
    assert(app.ok && app.data.cases.length === 1, "the court app has no case: " + JSON.stringify(app));
    const k = app.data.cases[0];
    caseId = k.case;
    const shown = `${Math.max(1, Math.round(k.odds.convicted_if_not_guilty * 100))}%`;
    assert(summons.includes(`Plead not guilty and it's ${shown}`), `the summons shows other odds than the server's ${shown}: ${summons}`);
    assert(summons.includes(k.if_guilty_plea.text), "the guilty plea's sentence isn't the server's: " + summons);
    await shot(A, "court_02_summons_phone.png");
    await closeCards(A, ["summons"]);
    await A.page.waitForSelector('.mo-card[data-moment="jail"] [data-court="booked"]', { timeout: 15000 });
    const jail = await A.page.textContent('.mo-card[data-moment="jail"]');
    assert(/Charged · your hearing is/.test(jail), "the cell's card doesn't say charged: " + jail);
    await shot(A, "court_03_booked_phone.png");
  });

  await test("phone: the court date is in the Calendar, and the Today sheet lists it", async () => {
    await closeCards(A, ["jail"]);
    await openPhone(A, "calendar");
    await A.page.waitForSelector("#phone .agenda-item", { timeout: 10000 });
    const cal = await A.page.textContent("#phone .phone-inner");
    assert(/Court: your hearing \(Shoplifting\), Livéra Municipal Court/.test(cal) && /From the court/.test(cal), "the calendar lacks the hearing: " + cal);
    await shot(A, "court_04_calendar_phone.png");
    await closePhone(A);
    const r = await W(A, () => window.__liveraMoments.record());
    assert(r.ok && r.data.clean === true && r.data.court && r.data.court.case, "charged isn't convicted: the record should be clean with the case: " + JSON.stringify(r.data));
  });

  await test("phone: released, to the courthouse; the Next card and the courtroom card with the charges, the odds, the pleas and the lawyer", async () => {
    const until = await W(A, () => window.__liveraMoments.jail() && window.__liveraMoments.jail().until);
    if (until) await advance(A, until - (await minute(A)) + 62);
    await A.page.waitForSelector('.mo-card[data-moment="free"]', { timeout: 20000 });
    const free = await A.page.textContent('.mo-card[data-moment="free"]');
    assert(/free to go until your hearing/.test(free), "the release card doesn't mention the hearing: " + free);
    await A.page.click('.mo-card[data-moment="free"] .btn.primary');
    await waitFor(A, () => window.__livera.world.self.inside === "", null, 15000);
    await A.page.waitForSelector('#street-chips [data-street="court"]', { timeout: 10000 });
    const court = await W(A, () => window.__liveraMoments.court());
    assert(court && court.status === "summoned" && court.case === caseId, "look.you.court: " + JSON.stringify(court));
    const wait = court.hearing_at - (await minute(A)) - 40;
    if (wait > 0) await advance(A, wait);
    await goPlace(A, "court", "courthouse");
    await waitFor(A, () => { const n = window.__livera.next(); return n && n.kind === "court"; }, null, 15000);
    const next = await W(A, () => window.__livera.next());
    assert(next.title === "Livéra Municipal Court" && next.source === "From the court", "the Next card: " + JSON.stringify(next));
    await A.page.click('.next-text[aria-label="Open Today"]').catch(() => {});
    const today = await A.page.$('#sheet li[data-kind="court"]');
    if (today) await shot(A, "court_05_today_phone.png");
    assert(today, "the Today sheet doesn't list the court date");
    await closeSheet(A);
    await advance(A, court.hearing_at - (await minute(A)) + 1);
    await A.page.waitForSelector('.mo-card[data-moment="courtroom"]', { timeout: 20000 });
    const room = await A.page.textContent('.mo-card[data-moment="courtroom"]');
    assert(/The charge: Shoplifting/.test(room), "the courtroom card lacks the charge: " + room);
    for (const sel of ['[data-plea="guilty"]', '[data-plea="not_guilty"]', '[data-court="firm"]'])
      assert(await A.page.$(`.mo-card[data-moment="courtroom"] ${sel}`), "the courtroom card lacks " + sel);
    const app = await W(A, () => window.__liveraMoments.courtApp());
    const k = app.data.cases[0];
    assert(k.status === "hearing" && k.odds.final === true, "the hearing isn't open on the server: " + JSON.stringify(k));
    const odds = await A.page.$eval('.mo-card[data-moment="courtroom"] .mo-odds', n => Number(n.dataset.odds));
    assert(odds === k.odds.convicted_if_not_guilty, `the card's odds ${odds} aren't the server's ${k.odds.convicted_if_not_guilty}`);
    console.log(`  courtroom: ${room.slice(0, 160)}`);
    await shot(A, "court_06_courtroom_phone.png");
  });

  await test("phone: hiring the firm is paid through the bank and lowers the odds; Guilty brings the verdict and a conviction", async () => {
    const before = await money(A);
    const fee = (await W(A, () => window.__liveraMoments.courtApp())).data.cases[0].lawyers.firm.fee_cents;
    const odds0 = await A.page.$eval('.mo-card[data-moment="courtroom"] .mo-odds', n => Number(n.dataset.odds));
    await A.page.click('.mo-card[data-moment="courtroom"] [data-court="firm"]');
    await waitFor(A, o => { const n = document.querySelector('.mo-card[data-moment="courtroom"] .mo-odds'); return n && Number(n.dataset.odds) < o; }, odds0, 10000);
    assert(before - (await money(A)) === fee, "the firm's fee didn't move through the bank");
    assert(!(await A.page.$('.mo-card[data-moment="courtroom"] [data-court="firm"]')), "the hire button stayed");
    await shot(A, "court_07_lawyer_phone.png");
    await A.page.click('.mo-card[data-moment="courtroom"] [data-plea="guilty"]');
    await A.page.waitForSelector('.mo-card[data-moment="verdict"][data-verdict="convicted"]', { timeout: 15000 });
    const v = await A.page.textContent('.mo-card[data-moment="verdict"]');
    assert(/Convicted on your plea/.test(v) && /Sentence: /.test(v), "the verdict card: " + v);
    await shot(A, "court_08_verdict_phone.png");
    await A.page.click('.mo-card[data-moment="verdict"] .btn.primary');
    const r = await W(A, () => window.__liveraMoments.record());
    assert(r.ok && r.data.record.length === 1 && r.data.record[0].kind === "conviction" && r.data.employers_see === true, "the record: " + JSON.stringify(r.data));
    await openPhone(A, "record");
    const rec = await A.page.textContent("#phone .phone-inner");
    assert(/Conviction/.test(rec) && /Employers that need a clean record/.test(rec), "the Record app: " + rec);
    await shot(A, "court_09_record_phone.png");
    await closePhone(A);
  });

  await test("desktop: miss the hearing and there's a warrant: the Wanted chip and its card", async () => {
    const D = watch(await (await browser.newContext(DESKTOP)).newPage(), "court desktop");
    await newGame(D);
    await caughtShoplifting(D);
    await D.page.waitForSelector('.mo-card[data-moment="summons"]', { timeout: 15000 });
    await closeCards(D, ["summons"]);
    const court = await W(D, () => window.__liveraMoments.court());
    assert(court && court.status === "summoned", "no summons: " + JSON.stringify(court));
    // She goes home instead: once released, the hearing passes without her.
    await advance(D, court.late_until - (await minute(D)) + 2);
    await D.page.waitForSelector('#street-chips [data-street="wanted"], #street-chips [data-street="held"]', { timeout: 20000 });
    const app = await W(D, () => window.__liveraMoments.courtApp());
    const k = app.data.cases[0];
    assert(k.status === "warrant" || (k.status === "summoned" && k.hearing_at > court.hearing_at), "no warrant (or a remand) after the missed hearing: " + JSON.stringify(k));
    if (await D.page.$('#street-chips [data-street="wanted"]')) {
      const chip = await D.page.textContent('#street-chips [data-street="wanted"]');
      assert(/Wanted · shoplifting/i.test(chip), "the chip reads: " + chip);
      await D.page.click('#street-chips [data-street="wanted"]');
      await D.page.waitForSelector('.mo-card[data-moment="wanted"]', { timeout: 10000 });
      const card = await D.page.textContent('.mo-card[data-moment="wanted"]');
      assert(/held in a cell until a new hearing/.test(card), "the wanted card: " + card);
      await shot(D, "court_10_warrant_desktop.png");
    } else {
      console.log("  a patrol picked her up at once: remanded until a new hearing");
      await shot(D, "court_10_remanded_desktop.png");
    }
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
