// End-to-end test for social media and the useful phone (D-074), on "Play together" (fake_platform.js): the host
// (Dominique, on a 390x844 phone) and three friends (Dax at 1440x900, Julian and Leila) in one town, with the founders
// nobody plays on the autopilot. Run with run_together_e2e.sh social_e2e.js. Same conventions as together_e2e.js:
// PASS / FAIL per test, non-zero exit on any FAIL, screenshots to LIVERA_SHOTS.
//
// Checked: the home screen leads with the everyday apps; a post from where you are, tagging someone you know, shows
// with the place's own picture; a friend likes, comments and follows through the app and the author gets toasts and
// an Activity list; a script's own post (written by the game from what really happened, labelled) arrives, and you
// like it and follow its author; a scene witnessed at Heritage Coffee becomes an @livera.unfiltered post with "Heard
// by", the truth shown to those who were there and not to Leila, who wasn't (and whose feed doesn't have it until she
// follows the account); Messages are a thread per person, with Seen, and someone a script plays reads and answers;
// the Map lists your people where you could know they are and the places open now, and Walk there walks; nothing is
// squeezed or scrolls sideways at 390 px; no console errors.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = process.env.LIVERA_TOGETHER_URL || "http://127.0.0.1:18960/together/";
const SHOTS = process.env.LIVERA_SHOTS || path.join(__dirname, "shots");
const DROP = Number(process.env.LIVERA_TOGETHER_DROP || 0.05);
const SPACE = `s${Date.now() % 1e8}`;
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

const people = [];
let ctx;
async function open(as, level, name, character, viewport) {
  const page = await ctx.newPage();
  if (viewport) await page.setViewportSize(viewport);
  const p = { page, as, level, name, character, errors: [], dialogs: [] };
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
const shot = (p, name) => p.page.screenshot({ path: path.join(SHOTS, name) });
const playing = p => waitFor(p, id => window.__livera && window.__livera.phase() === "playing" && window.__livera.world.selfId === id && window.__livera.world.buildings.length > 0 && window.__liveraTogether.status() === "open", p.character, 40000);
async function join(p) {
  await p.page.waitForSelector("#together-join", { timeout: 30000 });
  await p.page.click("#together-join");
  await p.page.waitForSelector(`.castcard[data-character="${p.character}"]`, { timeout: 20000 });
  await p.page.click(`.castcard[data-character="${p.character}"]`);
  await playing(p);
}
let H;  // the host
const advance = s => W(H, s => window.__liveraTogether.host.advance(s), s);
async function advanceUntil(cond, { step = 2, max = 200, what = "the condition" } = {}) {
  for (let t = 0; t <= max; t += step) {
    if (await cond()) return t;
    await advance(step);
    await sleep(200);
  }
  if (await cond()) return max;
  throw new Error(`${what} didn't happen within ${max} s of fast-forwarded time`);
}
// Into a place through the World's own ops (out of wherever they are, walk to the door, in).
async function goInside(p, place) {
  let l = await req(p, "look");
  if (l.ok && l.data.you.inside === place) return;
  if (l.ok && l.data.you.inside) { const r = await req(p, "exit"); assert(r.ok, `${p.name} exit: ${JSON.stringify(r.error)}`); }
  const m = await req(p, "move", { location: place });
  assert(m.ok, `${p.name} move to ${place}: ${JSON.stringify(m.error)}`);
  await advanceUntil(async () => { l = await req(p, "look"); return l.ok && !l.data.you.moving; }, { step: 1, max: 120, what: `${p.name} reaching ${place}` });
  const e = await req(p, "enter", { location: place });
  assert(e.ok, `${p.name} enter ${place}: ${JSON.stringify(e.error)}`);
}

// The phone: open it on an app (the everyday ones on the home screen, the rest under More apps).
async function openApp(p, app) {
  if (!(await p.page.$("#phone:not([hidden])"))) {
    const close = await p.page.$('#sheet:not([hidden]) .sheet-head [aria-label="Close"]');
    if (close) await close.click().catch(() => {});
    await p.page.click("#phone-btn");
  }
  await p.page.waitForSelector("#phone .app, #phone .phone-head");
  for (let i = 0; i < 3 && (await p.page.$('#phone [aria-label="Back to apps"]')); i++) await p.page.click('#phone [aria-label="Back to apps"]');
  if (!(await p.page.$(`#phone [data-app="${app}"]`))) await p.page.click("#phone [data-more]");
  await p.page.click(`#phone [data-app="${app}"]`);
  await waitFor(p, () => !/Opening…/.test(document.querySelector("#phone .phone-inner").textContent), null, 15000);
}
async function socialTab(p, tab) {
  await openApp(p, "social");
  await p.page.click(`#phone .social-tabs [data-tab="${tab}"]`);
  await waitFor(p, t => { const b = document.querySelector(`#phone .social-tabs [data-tab="${t}"]`); return b && b.getAttribute("aria-selected") === "true" && !/Opening…/.test(document.querySelector("#phone .phone-inner").textContent); }, tab, 15000);
}
async function closePhone(p) { const c = await p.page.$('#phone:not([hidden]) [aria-label="Close phone"]'); if (c) await c.click(); }

// What a 390 px screen must not have (as phone_e2e.js checks every app).
async function screenProblems(p) {
  return W(p, () => {
    const root = document.getElementById("phone"), text = root.innerText, bad = [];
    const rawId = text.match(/\b(?:tx|ntf|mem|ask|req|msg|pet|post|cmt|rum)-\d+\b/);
    if (rawId) bad.push(`raw id "${rawId[0]}"`);
    for (const re of [/\bnull\b/, /\bundefined\b/, /\[object Object\]/]) { const m = text.match(re); if (m) bad.push(`"${m[0]}" on screen: …${text.slice(Math.max(0, m.index - 60), m.index + 20)}…`); }
    const body = root.querySelector(".phone-body");
    if (body && body.scrollWidth > body.clientWidth + 1) bad.push(`the app scrolls sideways by ${body.scrollWidth - body.clientWidth}px`);
    if (document.documentElement.scrollWidth > innerWidth) bad.push("the page scrolls sideways");
    const small = [...root.querySelectorAll("button, select, summary")].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 43.5 || r.width < 43.5) && !b.classList.contains("tag-link"); })
      .map(b => `${(b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 18)} ${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`);
    if (small.length) bad.push("small targets: " + small.slice(0, 4).join("; "));
    const fonts = [...root.querySelectorAll("input, select, textarea")].filter(n => n.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(n).fontSize) < 16).length;
    if (fonts) bad.push(`${fonts} inputs under 16 px`);
    return bad;
  });
}
const toastHas = (p, re, timeout = 15000) => waitFor(p, src => [...document.querySelectorAll("#feed .line")].some(n => new RegExp(src).test(n.textContent)), re.source, timeout);

// ------------------------------------------------------------------ the run
(async () => {
  const browser = await chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 820, height: 640 } });
  let D, J, L;
  let mine = null;

  await test("a town for four: Dominique hosts on a phone, Dax, Julian and Leila join", async () => {
    H = await open("u_owner", "owner", "Dee", "dominique", { width: 390, height: 844 });
    D = await open("u_dax", "interact", "Dex", "dax", { width: 1440, height: 900 });
    J = await open("u_jul", "interact", "Jules", "julian");
    L = await open("u_lei", "interact", "Lee", "leila");
    await H.page.waitForSelector("#together-host", { timeout: 30000 });
    await H.page.click("#together-host");
    await H.page.waitForSelector('.castcard[data-character="dominique"]', { timeout: 30000 });
    await H.page.click('.castcard[data-character="dominique"]');
    await playing(H);
    for (const f of [D, J, L]) await join(f);
  });

  await test("the phone's home screen leads with the everyday apps, and Social opens on your feed", async () => {
    await H.page.click("#phone-btn");
    await H.page.waitForSelector("#phone .daily .app");
    const apps = await W(H, () => [...document.querySelectorAll("#phone .app")].map(n => n.dataset.app));
    assert(JSON.stringify(apps) === JSON.stringify(["social", "messages", "map", "bank", "work", "calendar", "contacts"]), "home: " + apps);
    await shot(H, "social_01_home_390.png");
    await openApp(H, "social");
    assert(await H.page.$("#phone form.composer"), "no composer on the feed");
  });

  await test("post from where you are, tagging someone you know: the place's own picture, the tag, no raw ids", async () => {
    await closePhone(H);
    await goInside(H, "heritage_coffee");
    await socialTab(H, "feed");
    await H.page.fill("#phone .compose-text", `First coffee in Livéra ${XSS}`);
    const chip = await W(H, () => { const c = document.querySelector('#phone [data-compose="place"]'); return c && { text: c.textContent, on: c.getAttribute("aria-pressed") }; });
    assert(chip && /Heritage Coffee/.test(chip.text) && chip.on === "true", "the composer doesn't offer where you are: " + JSON.stringify(chip));
    await H.page.click('#phone .tag-picker [data-tag="dax"]');
    await H.page.click('#phone [data-compose="send"]');
    await waitFor(H, () => [...document.querySelectorAll("#phone .post.mine .post-text")].some(n => n.textContent.startsWith("First coffee")), null, 15000);
    const post = await W(H, () => {
      const n = [...document.querySelectorAll("#phone .post.mine")].find(x => x.querySelector(".post-text").textContent.startsWith("First coffee"));
      const img = n.querySelector(".post-pic img");
      return { id: n.dataset.post, img: img && img.getAttribute("src"), caption: n.querySelector(".post-pic figcaption") && n.querySelector(".post-pic figcaption").textContent, tags: n.querySelector(".post-tags") && n.querySelector(".post-tags").textContent };
    });
    assert(post.img && /heritage_coffee\.webp$/.test(post.img), "the post has no picture of the place: " + JSON.stringify(post));
    assert(/Heritage Coffee/.test(post.caption || ""), "the picture isn't captioned with the place: " + JSON.stringify(post));
    assert(/with Dax/.test(post.tags || ""), "the tag isn't shown: " + JSON.stringify(post));
    assert((await W(H, () => document.querySelectorAll('img[src="x"]').length)) === 0, "post text became HTML");
    const bad = await screenProblems(H);
    assert(!bad.length, bad.join(" | "));
    mine = post.id;
    await sleep(600);
    await shot(H, "social_02_posted_390.png");
    await toastHas(D, /tagged you in a post/);
  });

  await test("Dax likes, comments and follows through his app; Dominique gets toasts and an Activity list", async () => {
    await closePhone(H);  // with the Social app open, it refreshes instead: a toast is for when you're elsewhere
    await socialTab(D, "town");
    await D.page.waitForSelector(`#phone .post[data-post="${mine}"]`);
    await D.page.click(`#phone .post[data-post="${mine}"] [data-like]`);
    await waitFor(D, id => document.querySelector(`#phone .post[data-post="${id}"] [data-like]`).getAttribute("aria-pressed") === "true", mine);
    await toastHas(H, /Dax liked your post/);
    await D.page.click(`#phone .post[data-post="${mine}"] [data-comment]`);
    await D.page.fill(`#phone .post[data-post="${mine}"] input[aria-label="Comment"]`, "Welcome to town!");
    await D.page.click(`#phone .post[data-post="${mine}"] .comment-form button[type="submit"]`);
    await waitFor(D, id => /Welcome to town!/.test(document.querySelector(`#phone .post[data-post="${id}"] .comments`)?.textContent || ""), mine);
    await toastHas(H, /Dax commented on your post/);
    await D.page.click(`#phone .post[data-post="${mine}"] .post-who`);
    await D.page.waitForSelector('#phone .account.big [data-follow="dominique"]');
    await D.page.click('#phone .account.big [data-follow="dominique"]');
    await waitFor(D, () => /Following/.test(document.querySelector('#phone .account.big [data-follow="dominique"]')?.textContent || ""));
    await shot(D, "social_03_profile_1440.png");
    await toastHas(H, /Dax followed you/);
    await sleep(500);
    await shot(H, "social_04_toasts_390.png");
    await socialTab(H, "activity");
    const acts = await W(H, () => [...document.querySelectorAll("#phone .activity li")].map(n => n.textContent));
    assert(acts.some(t => /liked your post/.test(t)) && acts.some(t => /commented/.test(t)) && acts.some(t => /followed you/.test(t)), "activity: " + acts.join(" / "));
    await shot(H, "social_05_activity_390.png");
  });

  await test("a scene at Heritage Coffee becomes an @livera.unfiltered post: heard by, the truth only for those who were there", async () => {
    await closePhone(H);
    await goInside(H, "heritage_coffee");
    await goInside(D, "heritage_coffee");
    await goInside(J, "heritage_coffee");
    await goInside(L, "lustre_jewelers").catch(async () => goInside(L, "greenleaf_market"));
    const argued = await req(D, "interact", { interaction: "argue", target: "julian" });
    assert(argued.ok, "the argument: " + JSON.stringify(argued.error));
    let gossip = null;
    await advanceUntil(async () => {
      const r = await W(H, () => window.__livera.social("following"));
      gossip = r.ok && r.data.posts.find(p => p.author.gossip && p.topic === "argument");
      return !!gossip;
    }, { step: 3, max: 120, what: "the gossip account's post" });
    console.log(`  (@livera.unfiltered: "${gossip.text}")`);
    // Dominique was there: her feed has it, with what was heard and whether it's true.
    await socialTab(H, "feed");
    const sel = `#phone .post[data-post="${gossip.post}"]`;
    await H.page.waitForSelector(sel);
    await H.page.$eval(sel, n => n.scrollIntoView({ block: "start" }));
    const there = await W(H, s => document.querySelector(s).textContent, sel);
    assert(/Heard by \d+/.test(there), "no Heard by: " + there);
    assert(/You were there: that's (what happened|not how it happened)/.test(there), "Dominique was there and isn't told whether it's true: " + there);
    assert(/Anonymous/.test(there), "the gossip account isn't labelled: " + there);
    await sleep(500);
    await shot(H, "social_07_gossip_there_390.png");
    // Dax is in it: his Activity says the account posted about him.
    await socialTab(D, "activity");
    assert(/posted about you/.test(await D.page.textContent("#phone .activity")), "Dax isn't told a post is about him");
    // Leila wasn't there and wasn't told: not in her feed; in the town tab, without the truth.
    await socialTab(L, "feed");
    assert(!(await L.page.$(sel)), "the scene is in Leila's feed though it never reached her");
    await socialTab(L, "town");
    await L.page.waitForSelector(sel);
    const away = await W(L, s => document.querySelector(s).textContent, sel);
    assert(/Only the people who were there know/.test(away) && !/You were there/.test(away), "Leila is told whether it's true: " + away);
    await L.page.click(`${sel} .post-who`);
    await L.page.waitForSelector('#phone .account.big [data-follow="livera.unfiltered"]');
    const profile = await W(L, () => document.getElementById("phone").innerText);
    assert(!/Sienna/.test(profile) && !/run this account/.test(profile), "the gossip account's profile gives its runner away: " + profile);
    await L.page.click('#phone .account.big [data-follow="livera.unfiltered"]');
    await waitFor(L, () => /Following/.test(document.querySelector('#phone .account.big [data-follow="livera.unfiltered"]')?.textContent || ""));
    await socialTab(L, "feed");
    await L.page.waitForSelector(sel);
    await shot(L, "social_08_gossip_away.png");
  });

  await test("Map: your people where you could know they are, the places open now, and Walk there walks", async () => {
    await openApp(H, "map");
    await H.page.waitForSelector("#phone svg.minimap");
    const m = await W(H, () => ({
      people: [...document.querySelectorAll("#phone .people-list li")].map(n => `${n.dataset.person}: ${n.querySelector(".hint")?.textContent}`),
      open: document.querySelectorAll("#phone .open-list [data-go]").length,
    }));
    assert(m.people.some(t => /^dax: Here with you at Heritage Coffee/.test(t)), "Dax isn't shown where she can see him: " + m.people.join(" / "));
    assert(!m.people.some(t => /^leila: Here with you/.test(t)), "Leila is shown where Dominique can't see her: " + m.people.join(" / "));
    assert(m.open > 0, "no place open now");
    const bad = await screenProblems(H);
    assert(!bad.length, bad.join(" | "));
    await shot(H, "social_11_map_390.png");
    const target = await W(H, () => [...document.querySelectorAll("#phone .open-list [data-go]")].map(b => b.dataset.go).find(id => id !== window.__livera.world.self.inside));
    assert(target, "nowhere else open to walk to");
    await H.page.click(`#phone .open-list [data-go="${target}"]`);
    assert(await H.page.$("#phone[hidden]"), "the phone stayed open to walk");
    await advanceUntil(() => W(H, t => window.__livera.world.self.inside === t, target), { step: 1, max: 120, what: `walking into ${target}` });
  });

  await test("Messages: a thread per person with Seen; someone a script plays reads and answers, labelled", async () => {
    await openApp(H, "messages");
    // To Dax, a person: Delivered, then Seen once he opens his Messages.
    await H.page.fill('#phone input[aria-label="To"]', "Dax");
    await H.page.click('#phone .picker [data-person="dax"]');
    await H.page.fill('#phone input[aria-label="Message"]', "Coffee tomorrow?");
    await H.page.click("#phone form.compose-new button[type=submit]");
    await H.page.waitForSelector('#phone [data-thread="dax"] .seen');
    assert((await W(H, () => document.querySelector("#phone .thread .seen").dataset.seen)) === "false", "Seen before he read it");
    await openApp(D, "messages");
    await waitFor(H, () => document.querySelector("#phone .thread .seen")?.dataset.seen === "true", null, 20000);
    await shot(H, "social_09_seen_390.png");
    // To Aaliyah, played by a script: labelled, read in a few game minutes, answered by the game's rules.
    await H.page.click('#phone button:has-text("All messages")');
    await H.page.fill('#phone input[aria-label="To"]', "Aaliyah");
    await H.page.click('#phone .picker [data-person="aaliyah"]');
    await H.page.fill('#phone input[aria-label="Message"]', "Are you free tonight?");
    await H.page.click("#phone form.compose-new button[type=submit]");
    await H.page.waitForSelector('#phone [data-thread="aaliyah"]');
    const label = await W(H, () => document.querySelector('#phone [data-thread="aaliyah"]').textContent);
    assert(/Played by a script/.test(label), "the thread doesn't say a script plays her: " + label);
    await advanceUntil(() => W(H, () => document.querySelectorAll('#phone [data-thread="aaliyah"] .thread .msg:not(.me)').length > 0), { step: 3, max: 900, what: "Aaliyah's answer" });
    const thread = await W(H, () => ({ seen: document.querySelector("#phone .thread .seen")?.dataset.seen, theirs: [...document.querySelectorAll("#phone .thread .msg:not(.me)")].map(n => n.textContent) }));
    console.log(`  (Aaliyah: "${thread.theirs[0]}")`);
    await sleep(400);
    await shot(H, "social_10_script_reply_390.png");
  });

  await test("a script's own post arrives (written by the game from what really happened), labelled; you like it and follow them", async () => {
    let auto = null;
    await advanceUntil(async () => {
      const r = await W(H, () => window.__livera.social("town"));
      auto = r.ok && r.data.posts.find(p => p.automatic && p.author && p.author.scripted);
      return !!auto;
    }, { step: 4, max: 1200, what: "an automatic post by someone a script plays" });  // up to a day and a half
    console.log(`  (${auto.author.name}: "${auto.text}")`);
    await socialTab(H, "town");
    const sel = `#phone .post[data-post="${auto.post}"]`;
    await H.page.waitForSelector(sel);
    const card = await W(H, s => { const n = document.querySelector(s); return { badge: n.querySelector(".badge.script")?.textContent, note: n.querySelector(".post-note")?.textContent }; }, sel);
    assert(/Played by a script/.test(card.badge || ""), "the script's post isn't labelled: " + JSON.stringify(card));
    assert(/Written by the game/.test(card.note || ""), "the script's post doesn't say the game wrote it: " + JSON.stringify(card));
    await H.page.$eval(sel, n => n.scrollIntoView({ block: "center" }));
    await H.page.click(`${sel} [data-like]`);
    await waitFor(H, s => document.querySelector(`${s} [data-like]`)?.getAttribute("aria-pressed") === "true", sel);
    await shot(H, "social_06_script_post_390.png");
    await H.page.click(`${sel} .post-who`);
    await H.page.waitForSelector(`#phone .account.big [data-follow="${auto.author.account}"]`);
    const already = await W(H, a => /Following/.test(document.querySelector(`#phone .account.big [data-follow="${a}"]`).textContent), auto.author.account);
    if (!already) {
      await H.page.click(`#phone .account.big [data-follow="${auto.author.account}"]`);
      await waitFor(H, a => /Following/.test(document.querySelector(`#phone .account.big [data-follow="${a}"]`)?.textContent || ""), auto.author.account);
    }
  });

  await test("the next morning, Social opens with Last night in Livéra: the night's top posts", async () => {
    const hour = () => W(H, () => Math.floor((window.__livera.world.minute() % 1440) / 60));
    await advanceUntil(async () => { const h = await hour(); return h >= 20 || h < 5; }, { step: 4, max: 600, what: "the evening" });
    await closePhone(H);
    const r = await req(H, "post", { text: "Nightcap with the best people in Livéra" });
    assert(r.ok, "the night post: " + JSON.stringify(r.error));
    const night = r.data.post.post;
    const liked = await req(D, "like", { post: night });
    assert(liked.ok, "Dax's like: " + JSON.stringify(liked.error));
    await advanceUntil(async () => { const h = await hour(); return h >= 8 && h < 11; }, { step: 4, max: 900, what: "the morning" });
    await socialTab(H, "feed");
    await H.page.waitForSelector("#phone .last-night");
    const section = await W(H, () => ({ head: document.querySelector("#phone .last-night .eyebrow").textContent, posts: [...document.querySelectorAll("#phone .last-night .post")].map(n => n.dataset.post),
      first: document.querySelector("#phone .phone-inner > .stack > :nth-child(2)")?.className }));
    assert(/Last night in Livéra/.test(section.head), "no Last night in Livéra: " + JSON.stringify(section));
    assert(section.posts.includes(night), "last night's post isn't in it: " + JSON.stringify(section));
    assert(/last-night/.test(section.first || ""), "the feed doesn't open with it: " + JSON.stringify(section));
    const bad = await screenProblems(H);
    assert(!bad.length, bad.join(" | "));
    await sleep(500);
    await shot(H, "social_12_last_night_390.png");
  });
  await test("no console errors and no dialogs in any page", async () => {
    const bad = people.flatMap(p => [...p.errors.map(e => `${p.name}: ${e}`), ...p.dialogs.map(d => `${p.name}: dialog ${d}`)]);
    assert(!bad.length, bad.join("\n"));
  });

  await browser.close();
  console.log(`\n${results.filter(r => r[0] === "PASS").length} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
