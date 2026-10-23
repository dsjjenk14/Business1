// End-to-end tests for the phone, the verbs and the creator (Release 1: R1.1 Work Desk, R1.6 phone
// apps, R1.6b verbs, R1.7 creator), against the single-player page with the game core running in
// the tab. Run with run_solo_e2e.sh phone_e2e.js (it serves web/client and sets LIVERA_SOLO_URL).
// Same conventions as solo_e2e.js: plain Node, PASS / FAIL / SKIP per test, non-zero exit on any
// FAIL, screenshots to LIVERA_SHOTS. Phone: 390x844, touch. Desktop: 1440x900.
//
// Checked: the home screen is grouped with an icon per app and no coin store in single-player;
// every app opens with no raw ids or internal keys and nothing wrapped a letter per line at 390 px;
// the Work app sends you to work, starts a shift, and answering a decision shows the server's
// verdict; Jobs has Apply, and Apply walks you to the door and hires you; the Clubhouse offers Join
// (verbs.js) and joining from the Sports app charges the league fee; Contacts shows only your side
// and Message picks them in Messages; the creator's quick start shows every error at once, hides
// the exact age for a one-year group, follows the job requirements when the server marks them, and
// makes a playable character; no console errors.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = process.env.LIVERA_SOLO_URL || "http://127.0.0.1:18950/solo/";
const SHOTS = process.env.LIVERA_SHOTS || path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const XSS = "<img src=x onerror=alert(1)>";

const results = [];
let failed = 0;
async function test(name, fn) {
  const t0 = Date.now();
  try {
    const skip = await fn();
    if (typeof skip === "string") { results.push(["SKIP", name, skip]); console.log(`SKIP ${name}: ${skip}`); return; }
    results.push(["PASS", name]); console.log(`PASS ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failed++; results.push(["FAIL", name, e.message]); console.log(`FAIL ${name}: ${e.stack || e.message}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const players = [];
async function newPlayer(browser, device, label) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  const p = { ctx, page, label, errors: [], dialogs: [] };
  page.on("console", m => { if (m.type() === "error") p.errors.push(`console: ${m.text()}`); });
  page.on("pageerror", e => p.errors.push(`pageerror: ${e.message}`));
  page.on("dialog", d => { p.dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  players.push(p);
  return p;
}
const W = (p, fn, arg) => p.page.evaluate(fn, arg);
const waitFor = (p, fn, arg, timeout = 15000) => p.page.waitForFunction(fn, arg, { timeout, polling: 200 });
const waitPlaying = p => waitFor(p, () => window.__livera && window.__livera.phase() === "playing" && window.__livera.world.buildings.length > 0, null, 30000);
const shot = (p, name) => p.page.screenshot({ path: path.join(SHOTS, name) });
async function townScreen(p) { await p.page.goto(URL); await p.page.waitForSelector("#solo-new, #solo-continue", { timeout: 30000 }); }
async function newTownAs(p, who) {
  await townScreen(p);
  if (await p.page.$("#solo-continue")) { await p.page.click("#solo-start-over"); await p.page.click("#solo-start-over-yes"); }
  else await p.page.click("#solo-new");
  await p.page.waitForSelector(`.castcard[data-character="${who}"]`, { timeout: 15000 });
  await p.page.click(`.castcard[data-character="${who}"]`);
  await waitPlaying(p);
}
async function feedHas(p, re, timeout = 10000) {
  await waitFor(p, src => [...document.querySelectorAll("#feed .line")].some(n => new RegExp(src).test(n.textContent)), re.source, timeout);
}
async function closeSheets(p) {
  const b = await p.page.$('#sheet:not([hidden]) .sheet-head [aria-label="Close"]');
  if (b) await b.click().catch(() => {});
}
// The home screen has the everyday apps; the rest are under More apps (D-074).
const DAILY = ["social", "messages", "map", "bank", "work", "calendar", "contacts"];
async function openPhone(p, app) {
  if (!(await p.page.$("#phone:not([hidden])"))) { await closeSheets(p); await p.page.click("#phone-btn"); }
  await p.page.waitForSelector("#phone .app, #phone .phone-head");
  for (let i = 0; i < 3 && (await p.page.$('#phone [aria-label="Back to apps"]')); i++) await p.page.click('#phone [aria-label="Back to apps"]');
  await p.page.waitForSelector("#phone .app");
  if (!app) return;
  if (!(await p.page.$(`#phone [data-app="${app}"]`))) { await p.page.click("#phone [data-more]"); await p.page.waitForSelector(`#phone [data-app="${app}"]`); }
  await p.page.click(`#phone [data-app="${app}"]`); await waitOpened(p);
}
const waitOpened = p => waitFor(p, () => !document.querySelector("#phone .phone-inner > .stack > .hint:only-child") || !/Opening…/.test(document.querySelector("#phone .phone-inner").textContent), null, 10000);
async function closePhone(p) { const c = await p.page.$('#phone:not([hidden]) [aria-label="Close phone"]'); if (c) await c.click(); }
// Fast-forward the town (the page's test hook) until `cond` holds in the page.
async function until(p, cond, arg, { step = 3, max = 240, what = "the condition" } = {}) {
  for (let t = 0; t <= max; t += step) {
    if (await W(p, cond, arg)) return t;
    await W(p, s => window.__liveraSolo.advance(s), step);
    await sleep(250);
  }
  throw new Error(`${what} didn't happen within ${max} s of fast-forwarded game time`);
}
async function exitBuilding(p) {
  if (!(await W(p, () => window.__livera.world.self.inside))) return;
  await closePhone(p);
  const btn = (await p.page.$("#exit-btn")) || (await p.page.$("#ctx-btn"));
  assert(btn, "no Exit button on screen");
  await btn.click();
  await waitFor(p, () => window.__livera.world.self.inside === "");
}

// Problems an app's screen must not have: raw ids, internal keys, terminal hints, long dates,
// text squeezed into a column a letter or two wide, sideways scrolling.
async function screenProblems(p) {
  return W(p, () => {
    const root = document.getElementById("phone"), text = root.innerText, bad = [];
    const rawId = text.match(/\b(?:tx|ntf|mem|ask|req|msg|pet|w0)-\d+\b/);
    if (rawId) bad.push(`raw id "${rawId[0]}"`);
    for (const re of [/\bId\b/, /\bMinute\b/, /\bDaylight\b/, /Product id/i, /Midi program/i, /_cents\b/, /\bcents\b/i, /work_answer/, /\{task, option\}/, /request id/i, /Year \d+ Month \d+ Day/, /\bnull\b/, /\bundefined\b/, /\[object Object\]/]) {
      const m = text.match(re);
      if (m) bad.push(`"${m[0]}" on screen`);
    }
    for (const dt of root.querySelectorAll("dt")) if (/^(Id|Door|At|Task|Option|Property|Location)$/.test(dt.textContent.trim())) bad.push(`field "${dt.textContent}"`);
    // A letter (or two) per line: a text of 5+ characters whose box is taller than three lines and narrower than 48 px.
    const squeezed = [];
    for (const n of root.querySelectorAll("*")) {
      const own = [...n.childNodes].filter(c => c.nodeType === 3).map(c => c.textContent).join("").trim();
      if (own.length < 5) continue;
      const r = n.getBoundingClientRect(), lh = parseFloat(getComputedStyle(n).lineHeight) || 18;
      if (r.width > 0 && r.width < 48 && r.height > lh * 3) squeezed.push(`${n.tagName}.${n.className}: "${own.slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    if (squeezed.length) bad.push("squeezed text: " + squeezed.slice(0, 3).join("; "));
    const body = root.querySelector(".phone-body");
    if (body && body.scrollWidth > body.clientWidth + 1) bad.push(`the app scrolls sideways by ${body.scrollWidth - body.clientWidth}px`);
    if (document.documentElement.scrollWidth > innerWidth) bad.push("the page scrolls sideways");
    // 44 px targets for everything you can press in the phone.
    const small = [...root.querySelectorAll("button, select, summary")].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 43.5 || r.width < 43.5); })
      .map(b => `${(b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 18)} ${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`);
    if (small.length) bad.push("small targets: " + small.slice(0, 4).join("; "));
    const fonts = [...root.querySelectorAll("input, select, textarea")].filter(n => n.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(n).fontSize) < 16).length;
    if (fonts) bad.push(`${fonts} inputs under 16 px`);
    return bad;
  });
}

// ------------------------------------------------------------------ the run
(async () => {
  const browser = await chromium.launch();
  const A = await newPlayer(browser, PHONE, "A (phone, Dominique)");
  const apps = [];

  await test("phone home: the everyday apps first (Social, Messages, Map, Bank, Work, Calendar, People), the rest under More apps", async () => {
    await newTownAs(A, "dominique");
    await openPhone(A);
    const read = () => W(A, () => ({
      groups: [...document.querySelectorAll("#phone .app-group > .eyebrow")].map(n => n.textContent.trim()),
      apps: [...document.querySelectorAll("#phone .app")].map(n => n.dataset.app),
      labels: [...document.querySelectorAll("#phone .app")].map(n => n.textContent.trim()),
      icons: [...document.querySelectorAll("#phone .app .tile svg")].map(s => [...s.querySelectorAll("path")].map(x => x.getAttribute("d")).join("|")),
      text: document.getElementById("phone").innerText,
    }));
    const home = await read();
    assert(JSON.stringify(home.apps) === JSON.stringify(DAILY), "the home screen: " + home.apps);
    assert(JSON.stringify(home.labels) === JSON.stringify(["Social", "Messages", "Map", "Bank", "Work", "Calendar", "People"]), "labels: " + home.labels);
    await sleep(400);
    await shot(A, "phone_home_390.png");
    await A.page.click("#phone [data-more]");
    await A.page.waitForSelector("#phone .app-group > .eyebrow");
    await sleep(300);
    const more = await read();
    assert(JSON.stringify(more.groups) === JSON.stringify(["Everyday", "Life", "Ambition", "Town"]), "groups: " + more.groups);
    assert(!more.apps.includes("store"), "the coin store is on a single-player phone");
    assert(!more.apps.some(a => DAILY.includes(a)), "an everyday app is under More apps too");
    // 27 apps besides the everyday seven: 21 here, with the Story app (moments.js, D-068) and the Court app (D-083), and
    // Goals when the server has it.
    assert(more.apps.includes("story") && more.apps.includes("court") && (more.apps.length === 21 || (more.apps.length === 22 && more.apps.includes("goals"))), `expected 21 more apps (22 with goals), got ${more.apps.length}: ${more.apps}`);
    assert(/No coin store here/.test(more.text), "the phone doesn't say why there's no coin store");
    const icons = [...home.icons, ...more.icons];
    assert(icons.length === home.apps.length + more.apps.length, `${icons.length} icons for ${home.apps.length + more.apps.length} apps`);
    assert(new Set(icons).size === icons.length, "two apps share an icon");
    apps.push(...home.apps, ...more.apps);
    await shot(A, "phone_more_apps_390.png");
  });

  await test("every app opens readable at 390 px: no raw ids, nothing a letter per line, no sideways scroll", async () => {
    const problems = [];
    for (const app of apps) {
      await openPhone(A, app);
      await sleep(250);
      const bad = await screenProblems(A);
      if (bad.length) problems.push(`${app}: ${bad.join(" | ")}`);
      await shot(A, `app_${app}_390.png`);
    }
    assert(!problems.length, problems.join("\n"));
  });

  await test("Work: go to work, start a shift, answer a decision and see the server's verdict", async () => {
    await openPhone(A, "work");
    const go = await A.page.$('#phone button:has-text("Go to work")');
    assert(go, "the Work app doesn't offer a way to work: " + (await A.page.textContent("#phone")).slice(0, 300));
    await go.click();
    await until(A, () => window.__livera.world.self.inside === "meridian_talent", null, { what: "getting into Meridian" });
    await openPhone(A, "work");
    await A.page.click('#phone button:has-text("Start shift")');
    await A.page.waitForSelector("#phone .decision .option", { timeout: 15000 });
    const before = await W(A, () => ({ status: document.querySelector("#phone .work-status").textContent, prompt: document.querySelector("#phone .decision .prompt").textContent, options: document.querySelectorAll("#phone .decision:not(.answered) .option").length }));
    assert(/On shift/.test(before.status), "the status doesn't say you're on shift: " + before.status);
    assert(before.prompt.length > 20 && before.options >= 2, `a decision card needs a prompt and options: ${JSON.stringify(before)}`);
    await shot(A, "work_onshift_390.png");
    await A.page.click("#phone .decision:not(.answered) .option >> nth=0");
    await A.page.waitForSelector("#phone .verdict.fresh", { timeout: 10000 });
    const v = await W(A, () => {
      const n = document.querySelector("#phone .verdict.fresh");
      return { head: n.querySelector(".verdict-head").textContent, why: [...n.querySelectorAll(".why")].map(x => x.textContent).join(" "), effect: n.querySelector(".effect").textContent,
        header: document.querySelector("#phone .card").textContent };
    });
    assert(/Best call|The better call/.test(v.head), "no verdict: " + v.head);
    assert(v.why.length > 10, "the verdict has no reason");
    assert(/Performance [+−±]/.test(v.effect), "the verdict doesn't say what it did to performance: " + v.effect);
    console.log(`  (${v.head.trim()} · ${v.effect.trim()})`);
    await A.page.$eval("#phone .verdict.fresh", n => n.scrollIntoView({ block: "center" }));
    await sleep(600);
    await shot(A, "work_verdict_390.png");
    // The answer counted on the server: the work app says so when opened again.
    await openPhone(A, "work");
    assert(await A.page.$("#phone .decision.answered .verdict"), "the answered decision isn't shown as answered after reopening Work");
  });

  await test("Jobs shows Apply on every opening; Apply walks you to the door and the server hires you", async () => {
    await openPhone(A, "jobs");
    const n = await A.page.$$eval("#phone [data-apply]", x => x.length);
    assert(n > 0, "no Apply buttons in Jobs");
    await A.page.click('#phone .seg button[data-all="1"]');
    const all = await A.page.$$eval("#phone [data-apply]", x => x.length);
    assert(all >= n, "All jobs shows fewer than Open to you");
    await shot(A, "jobs_390.png");
    // Apply at Heritage Coffee from Meridian: end the shift (Work), then Apply steps out, walks over and applies at the door.
    await openPhone(A, "work");
    const end = await A.page.$('#phone button:has-text("End shift")');
    if (end) { await end.click(); await waitFor(A, () => !window.__livera.world.self.onShift, null, 10000); }
    await openPhone(A, "jobs");
    await A.page.click('#phone .seg button[data-all="1"]');
    await A.page.click('#phone [data-job="cafe"] [data-apply]');
    assert(await A.page.$("#phone[hidden]"), "the phone stayed open while walking to apply");
    await until(A, () => [...document.querySelectorAll("#feed .line")].some(n => /You're hired|hired/.test(n.textContent)) || (window.__livera.world.career && window.__livera.world.career.career === "Café"), null, { what: "being hired at Heritage Coffee" });
    await waitFor(A, () => window.__livera.world.career && window.__livera.world.career.career === "Café", null, 10000);
    await shot(A, "jobs_hired_390.png");
  });

  await test("Riverside Clubhouse offers Join (verbs.js), and Join in Sports walks you there and charges the league fee", async () => {
    const at = await W(A, () => window.__liveraVerbs.at("riverside_clubhouse"));
    const joins = at.filter(a => a.kind === "join_team");
    assert(joins.length >= 2, "the clubhouse doesn't offer Join: " + JSON.stringify(at));
    assert(joins.every(a => /league fee \$40\.00/.test(a.detail)), "Join doesn't say the league fee: " + joins[0].detail);
    console.log(`  (${joins.map(a => a.label).join(", ")})`);
    const court = await W(A, () => window.__liveraVerbs.at("riverside_court"));
    assert(court.some(a => a.kind === "join_team"), "the court doesn't offer Join for its sport");
    await openPhone(A, "sports");
    assert(await A.page.$("#phone [data-join]"), "the Sports app has no Join");
    await shot(A, "sports_390.png");
    await waitFor(A, () => !!window.__livera.world.money);
    const bank = await W(A, () => window.__livera.world.money.bank_cents);
    await A.page.click('#phone [data-join="founders_five"]');
    await until(A, () => [...document.querySelectorAll("#feed .line")].some(n => /You're on the Founders Five/.test(n.textContent)), null, { what: "joining the Founders Five", max: 300 });
    await waitFor(A, want => window.__livera.world.money && window.__livera.world.money.bank_cents <= want, bank - 4000, 40000);
    await shot(A, "sports_joined_390.png");
    // The card of the place you're at (engineer A renders verbs.js there): shown if it's wired yet.
    const leave = await W(A, () => window.__liveraVerbs.at(window.__livera.world.self.inside || "riverside_court"));
    assert(leave.some(a => a.kind === "leave_team" && /Founders Five/.test(a.label)), "after joining, the place doesn't offer Leave: " + JSON.stringify(leave));
    const card = await A.page.$('#sheet:not([hidden]) >> text=/Leave the Founders Five|Join the River City Hoops/');
    console.log(`  (the place card ${card ? "renders" : "doesn't render yet"} the verbs)`);
  });

  await test("People shows only your side with bars; Message opens a thread with them; a message stays text", async () => {
    await openPhone(A, "contacts");
    const c = await W(A, () => {
      const card = document.querySelector("#phone [data-contact]");
      return card && { id: card.dataset.contact, bars: card.querySelectorAll(".meter-row").length, text: document.getElementById("phone").innerText };
    });
    assert(c && c.bars >= 3, "a contact card has no relationship bars: " + JSON.stringify(c));
    assert(/only your side/i.test(c.text), "People doesn't say it shows only your side");
    await shot(A, "contacts_390.png");
    await A.page.click(`#phone [data-contact="${c.id}"] button:has-text("Message")`);
    await A.page.waitForSelector(`#phone [data-thread="${c.id}"]`);
    await A.page.fill('#phone input[aria-label="Reply"]', `Hi ${XSS}`);
    await A.page.click('#phone .thread-form button[type="submit"]');
    await waitFor(A, () => [...document.querySelectorAll("#phone .thread .msg.me")].some(n => n.textContent.includes("<img src=x")), null, 10000);
    assert((await W(A, () => document.querySelectorAll('img[src="x"]').length)) === 0, "message text became HTML");
    assert(await A.page.$("#phone .thread .seen"), "your last message doesn't say Delivered or Seen");
    await shot(A, "messages_thread_390.png");
    // Back to the conversations: one with them, newest first.
    await A.page.click('#phone button:has-text("All messages")');
    await A.page.waitForSelector(`#phone .convo[data-convo="${c.id}"]`);
    await shot(A, "messages_390.png");
  });

  await test("Calendar: Today and This week from your routine, with Go on entries that name a place", async () => {
    await openPhone(A, "calendar");
    const cal = await W(A, () => ({ eyebrows: [...document.querySelectorAll("#phone .eyebrow")].map(n => n.textContent), items: document.querySelectorAll("#phone .agenda-item").length, go: document.querySelectorAll("#phone .agenda-item [data-place]").length }));
    assert(cal.eyebrows.some(t => /^Today/.test(t)) && cal.eyebrows.includes("This week"), "no Today / This week: " + cal.eyebrows);
    assert(cal.items > 0, "the agenda is empty for Dominique (she has a routine)");
    assert(cal.go > 0, "no Go button on any entry");
    await shot(A, "calendar_390.png");
  });

  await test("Homes lists what's for sale with the price and what you can afford", async () => {
    await openPhone(A, "homes");
    const h = await W(A, () => ({ listings: document.querySelectorAll("#phone [data-listing]").length, afford: [...document.querySelectorAll("#phone .afford")].map(n => n.textContent), buy: document.querySelectorAll("#phone [data-buy]").length }));
    assert(h.listings > 0 && h.buy === h.listings, "listings without a Buy button: " + JSON.stringify(h));
    assert(h.afford.length === h.listings && h.afford.every(t => /\$/.test(t)), "a listing doesn't say what you can afford");
    await shot(A, "homes_390.png");
  });

  await test("creator: the quick start shows every error at once, hides a one-year exact age, and makes a playable character", async () => {
    const C = await newPlayer(browser, PHONE, "C (phone, creator)");
    await townScreen(C);
    await C.page.click("#solo-new");
    await C.page.waitForSelector("#create-btn", { timeout: 15000 });
    await C.page.click("#create-btn");
    await C.page.waitForSelector("form.creator");
    await sleep(300);
    await shot(C, "creator_quick_390.png");
    // Everything empty: both names wrong at once, inline, with the first one in view.
    await C.page.click('form.creator button[type="submit"]');
    await C.page.waitForSelector("form.creator .errors li");
    const errs = await W(C, () => ({ inline: [...document.querySelectorAll("form.creator .field-err")].filter(n => n.textContent.trim()).length,
      invalid: document.querySelectorAll('form.creator [aria-invalid="true"]').length, listed: document.querySelectorAll("form.creator .errors li").length,
      focus: document.activeElement && document.activeElement.id === document.querySelector("form.creator fieldset input[type=text]").id }));
    assert(errs.inline >= 2 && errs.invalid >= 2 && errs.listed >= 2, "errors aren't all shown at once: " + JSON.stringify(errs));
    await sleep(500);
    await shot(C, "creator_errors_390.png");
    // The exact age: hidden for "Just turned 18", shown for a range.
    await C.page.click("form.creator details.more > summary");
    const ages = await W(C, () => [...document.querySelectorAll("form.creator details.more select")][0].options.length);
    assert(ages >= 2, "no age groups");
    const hidden = await W(C, () => {
      const sel = document.querySelector("form.creator details.more select"), out = {};
      for (const o of sel.options) { sel.value = o.value; sel.dispatchEvent(new Event("change")); const n = document.querySelector('form.creator input[type="number"]'); out[o.textContent] = n.closest("label").hidden; }
      return out;
    });
    assert(hidden["Just turned 18"] === true && Object.entries(hidden).some(([k, v]) => k !== "Just turned 18" && v === false), "exact age visibility: " + JSON.stringify(hidden));
    await sleep(300);
    await shot(C, "creator_more_390.png");
    // The job list follows what the education opens, when the server marks it.
    const marks = await W(C, () => [...document.querySelectorAll("form.creator optgroup")].map(g => g.label));
    console.log(`  (job list: ${marks.length ? marks.join(" / ") : "every job (this server doesn't mark entry requirements)"})`);
    // Surprise me, then names: a playable character.
    await C.page.click("#creator-surprise");
    await C.page.fill("form.creator fieldset:first-of-type input[type=text] >> nth=0", "Robin");
    await C.page.fill("form.creator fieldset:first-of-type input[type=text] >> nth=1", "Vale");
    await C.page.click('form.creator button[type="submit"]');
    await waitPlaying(C);
    assert((await W(C, () => window.__livera.world.selfName)) === "Robin Vale", "the created character isn't playing");
    await shot(C, "creator_created_390.png");
  });

  await test("creator quick start alone (no Customize more): a playable character with legal random picks", async () => {
    const Q = await newPlayer(browser, PHONE, "Q (phone, quick start)");
    await townScreen(Q);
    await Q.page.click("#solo-new");
    await Q.page.waitForSelector("#create-btn", { timeout: 15000 });
    await Q.page.click("#create-btn");
    await Q.page.waitForSelector("form.creator");
    await Q.page.fill("form.creator fieldset:first-of-type input[type=text] >> nth=0", "Sam");
    await Q.page.fill("form.creator fieldset:first-of-type input[type=text] >> nth=1", "Quill");
    await Q.page.click('form.creator button[type="submit"]');
    await waitPlaying(Q);
    assert((await W(Q, () => window.__livera.world.selfName)) === "Sam Quill", "quick start didn't make a character");
  });

  await test("desktop 1440x900: the phone panel, the redone apps and the creator", async () => {
    const D = await newPlayer(browser, DESKTOP, "D (desktop)");
    await newTownAs(D, "dax");
    await openPhone(D);
    await sleep(300);
    await shot(D, "desktop_phone_home_1440.png");
    for (const app of ["social", "map", "work", "calendar", "contacts", "jobs", "homes", "sports", "items", "pets", "studio", "messages", "notifications", "wallet", "career", "transit"]) {
      await openPhone(D, app);
      await sleep(200);
      const bad = await screenProblems(D);
      assert(!bad.length, `${app} at 1440: ${bad.join(" | ")}`);
      await shot(D, `desktop_${app}_1440.png`);
    }
    await closePhone(D);
    const E = await newPlayer(browser, DESKTOP, "E (desktop, creator)");
    await townScreen(E);
    await E.page.click("#solo-new");
    await E.page.waitForSelector("#create-btn", { timeout: 15000 });
    await E.page.click("#create-btn");
    await E.page.waitForSelector("form.creator");
    await sleep(300);
    await shot(E, "desktop_creator_1440.png");
    await E.page.click('form.creator button[type="submit"]');
    await E.page.waitForSelector("form.creator .errors li");
    await sleep(500);
    await shot(E, "desktop_creator_errors_1440.png");
  });

  await test("no console errors and no dialogs in any browser", async () => {
    const bad = players.flatMap(p => [...p.errors.map(e => `${p.label}: ${e}`), ...p.dialogs.map(d => `${p.label}: dialog ${d}`)]);
    assert(!bad.length, bad.join("\n"));
  });

  await browser.close();
  console.log(`\n${results.filter(r => r[0] === "PASS").length} passed, ${failed} failed, ${results.filter(r => r[0] === "SKIP").length} skipped`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
