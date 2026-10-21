// The phone: the home screen leads with what you use every day (Social, Messages, Map, Bank, Work,
// Calendar, People, D-074); every other app the server has is one tap deeper, under More apps, grouped
// under Everyday, Life, Ambition and Town. Most apps have a screen of their own (Social in social.js,
// Messages as a thread per person, the Map with your people, Work, Calendar, Jobs, Homes...); the rest
// show the server's answer through generic(), which stacks fields, hides ids and internal keys, and
// words times, stats and yes/no for people. Every button is an op the server already has (verbs.js);
// its reply or its refusal is shown where you pressed. Nothing here invents an option or an outcome.

import { el, replace, money, avatar, firstName, titleCase, withoutCliHint } from "./dom.js";
import { typeName } from "./layout.js";
import { dist } from "./state.js";
import { icon } from "./icons.js";
import {
  APP_NAMES, readable, sentence, shortWhen, isLongWhen, minuteWhen, clockText, dateOf, duration, hoursText,
  placeNamed, isAt, verbs, applyFor, joinAt, insideThen, atDoorThen, affordability, exposeForTests, showOutcome, getThere, setClock,
} from "./verbs.js";
import { storyScreen } from "./moments.js";  // the Story app (D-068)
import { socialScreen } from "./social.js";  // the Social app (D-074)

// The phone's own stylesheet, next to this module (so no page needs a <link> for it).
(function addStylesheet() {
  if (typeof document === "undefined" || document.querySelector("link[data-phone-css]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./css/phone.css", import.meta.url).href;
  link.dataset.phoneCss = "";
  document.head.appendChild(link);
})();

// The apps World::openPhoneApp answers (src/core/World.cpp). The server has no app list op, so
// this is the one list the client keeps; an unknown app is refused with `unknown_app`.
// [id, group, icon] — the label is APP_NAMES[id].
export const APPS = [
  ["social", "everyday", "social"],  // social media (social.js, D-074)
  ["bank", "everyday", "bank"], ["messages", "everyday", "messages"], ["calendar", "everyday", "calendar"], ["work", "everyday", "workdesk"],
  ["map", "everyday", "map"], ["transit", "everyday", "transit"],
  ["story", "life", "log"],  // your life story (moments.js, D-068)
  ["contacts", "life", "contacts"], ["romance", "life", "romance"], ["family", "life", "family"], ["pets", "life", "pets"], ["health", "life", "health_app"],
  ["homes", "life", "homes"], ["property", "life", "property"], ["items", "life", "items"], ["wallet", "life", "wallet"], ["store", "life", "store"],
  ["career", "ambition", "career"], ["jobs", "ambition", "jobs"], ["school", "ambition", "school"], ["studio", "ambition", "studio"],
  ["fame", "ambition", "fame"], ["sports", "ambition", "sports"],
  ["city", "town", "city"], ["weather", "town", "weather"], ["record", "town", "record"], ["notifications", "town", "notifications"],
];
const GROUPS = [["everyday", "Everyday"], ["life", "Life"], ["ambition", "Ambition"], ["town", "Town"]];
// The home screen: what you use every day, in this order. The rest are under More apps.
export const DAILY = ["social", "messages", "map", "bank", "work", "calendar", "contacts"];
// A browser town (single-player, Play together) has no store billing at all: no coin store there.
const browserTown = () => ["solo", "together"].includes(document.body.dataset.boot);

// Your criminal record (the Record app): a page with a stamp, not the music record in icons.js.
const SVGNS = "http://www.w3.org/2000/svg";
function recordIcon() {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("class", "icon icon-record-page"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  for (const d of ["M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20V4a.5.5 0 0 1 .5-.5Z", "M14 3.5V8h4", "M9 12h6M9 15h4", "M14.5 18.5l1.2 1.2 2.3-2.4"]) {
    const p = document.createElementNS(SVGNS, "path"); p.setAttribute("d", d); svg.appendChild(p);
  }
  return svg;
}
const appIcon = (id, name) => (id === "record" ? recordIcon() : icon(name));

// ------------------------------------------------------------------ small pieces
const pct = (v, max = 100) => Math.max(0, Math.min(100, (Number(v) || 0) / (max || 1) * 100));
// A 0–100 stat as a labelled bar with its number. `bad` for feelings that hurt (conflict, resentment).
function meter(label, value, { max = 100, bad = false, text } = {}) {
  return el("div", { class: `meter-row${bad ? " bad" : ""}` },
    el("span", { class: "meter-label" }, label),
    el("span", { class: "meter", role: "img", "aria-label": `${label}: ${text || `${Math.round(value)} of ${max}`}` }, el("span", { style: { width: `${pct(value, max)}%` } })),
    el("span", { class: "meter-num" }, text || String(Math.round(value))));
}
const card = (...children) => el("div", { class: "card" }, children);
const eyebrow = text => el("div", { class: "eyebrow" }, text);
const hint = text => el("p", { class: "hint" }, text);
function pairs(list) {
  const rows = list.filter(x => x && x[1] !== null && x[1] !== undefined && x[1] !== "");
  return rows.length ? el("dl", { class: "kv" }, rows.flatMap(([k, v]) => [el("dt", null, k), el("dd", null, v)])) : null;
}
function button(label, onclick, { primary = false, danger = false, small = true, disabled = false, data = null, cls = "" } = {}) {
  return el("button", { type: "button", class: `btn${primary ? " primary" : ""}${danger ? " danger" : ""}${small ? " small" : ""}${cls ? " " + cls : ""}`, disabled, dataset: data, onclick }, label);
}
// A line under a button for what the server said.
function resultLine() {
  const p = el("p", { class: "result", role: "status" });
  p.show = r => {
    if (!r) { p.textContent = ""; p.className = "result"; return; }
    p.textContent = r.ok ? (r.summary || "Done.") : sentence(r.error.message);
    p.className = `result ${r.ok ? "ok" : "bad"}`;
    p.setAttribute("role", r.ok ? "status" : "alert");
  };
  return p;
}
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");

export class Phone {
  constructor({ world, game, ui }) {
    this.world = world; this.game = game; this.ui = ui;
    this.root = document.getElementById("phone");
    this.app = null;
    this.unread = 0;
    this.socialNew = 0;      // social toasts since the Social app was last opened (D-074)
    this.thread = null;      // the conversation open in Messages (a character id), or the list
    this.social = null;      // the Social app's tab, draft and the profile on screen (social.js)
    this.more = false;       // on the More apps screen
    this.timer = null;
    this.people = [];        // who you can message: your contacts (the Contacts app), refreshed when Messages opens
    this.goals = null;       // does this server have the goals app? (asked once)
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-label", "Phone");
    setClock(() => world.minute());
    exposeForTests(game);
  }
  get open() { return !this.root.hidden; }

  show(app, opts) {
    this.root.hidden = false;
    if (app) { this.more = false; this.openApp(app, opts); } else this.home();
  }
  close() { clearTimeout(this.timer); this.root.hidden = true; replace(this.root); this.app = null; }

  frame(title, onBack, ...content) {
    const back = el("button", { type: "button", class: "iconbtn", "aria-label": onBack ? "Back to apps" : "Close phone", onclick: () => (onBack ? onBack() : this.close()) }, onBack ? "‹" : "✕");
    const close = onBack ? el("button", { type: "button", class: "iconbtn", "aria-label": "Close phone", onclick: () => this.close() }, "✕") : null;
    const h2 = el("h2", { tabindex: "-1" }, title);
    replace(this.root, el("div", { class: "phone-head" }, back, h2, close),
      el("div", { class: "phone-body" }, el("div", { class: "phone-inner" }, content)));
    // Move focus into the phone (not into a text field: no keyboard pops up on a phone).
    if (!this.root.contains(document.activeElement) || document.activeElement === document.body) h2.focus({ preventScroll: true });
  }

  tile(id, name, main = false) {
    const n = id === "messages" ? this.unread : id === "social" ? this.socialNew : 0;
    return el("button", { type: "button", class: `app${main ? " main" : ""}`, dataset: { app: id }, onclick: () => this.openApp(id) },
      el("span", { class: "tile", "aria-hidden": "true" }, appIcon(id, name), n ? el("span", { class: "badge-count" }, String(n > 99 ? "99+" : n)) : null),
      APP_NAMES[id]);
  }
  home() {
    this.app = null; this.more = false; clearTimeout(this.timer);
    const battery = el("p", { class: "hint" }, "A flat battery opens nothing; your phone charges at home and at work.");
    const icons = new Map(APPS.map(([id, , name]) => [id, name]));
    this.frame("Phone", null,
      el("section", { class: "app-group daily", "aria-label": "Every day" }, eyebrow("Every day"),
        el("div", { class: "apps" }, DAILY.map(id => this.tile(id, icons.get(id), true)))),
      el("button", { type: "button", class: "btn block more-apps", dataset: { more: "apps" }, onclick: () => this.moreApps() }, icon("more"), "More apps"),
      battery);
    this.homeExtras(battery);
  }
  // Everything else the server has, one tap deeper, in its groups.
  moreApps() {
    this.app = null; this.more = true; clearTimeout(this.timer);
    const hideStore = browserTown();
    const extra = this.goals ? [["goals", "ambition", "goals"]] : [];
    this.frame("More apps", () => this.home(),
      GROUPS.map(([g, label]) => el("section", { class: "app-group", "aria-label": label }, eyebrow(label),
        el("div", { class: "apps" }, [...APPS, ...extra].filter(([id, group]) => group === g && !DAILY.includes(id) && !(hideStore && id === "store")).map(([id, , name]) => this.tile(id, name))))),
      hideStore ? hint("No coin store here: this town runs in your browser and nothing in it is sold for real money.") : null);
    if (this.goals === null) this.homeExtras(null);
  }
  homeExtras(battery) {
    // The battery, from the Wallet app (it says how much charge is left).
    if (battery) this.game.phone("wallet").then(r => {
      const ph = r.ok && r.data.phone;
      if (ph && this.app === null && this.open) battery.textContent = `Battery ${Math.round(ph.battery)}%${ph.hours_left != null ? `, about ${Math.round(ph.hours_left)} h left` : ""}${ph.charging ? ` · charges ${ph.charging === "home" ? "at home" : `at ${ph.charging}`}` : ""}. A flat battery opens nothing.`;
    });
    // Does this server have the Goals app? Asked once; More apps shows it when it does.
    if (this.goals === null) this.game.phone("goals").then(r => {
      this.goals = r.ok || (r.error && r.error.code !== "unknown_app" ? null : false);
      if (this.goals && this.app === null && this.open && this.more) this.moreApps();
    });
  }
  // A profile in the Social app (from a post, a person's card...).
  socialProfile(account) {
    if (this.app === "social" && this.open && this.social) { this.social.profile = account; this.reload(); } else this.show("social", { profile: account });
  }
  // Something new in the Social app while it's open (a post by someone you follow, a like): show it, keeping what you typed.
  socialChanged() { if (this.open && this.app === "social" && !this.social?.profile) this.reload(); }

  async openApp(id, opts = {}) {
    this.app = id; this.opts = opts; clearTimeout(this.timer);
    // Messages open on your conversations, or straight on one; Social on its tabs, or on someone's profile.
    if (id === "messages") this.thread = opts.to || null;
    if (id === "social") {
      if (!this.social) this.social = { tab: "feed", draft: "", tags: new Set(), withPlace: true, about: null, asGossip: false, profile: null };
      this.social.profile = opts.profile || null;
      if (opts.tab) this.social.tab = opts.tab;
    }
    const body = el("div", { class: "stack" }, el("p", { class: "hint" }, "Opening…"));
    this.frame(APP_NAMES[id] || titleCase(id), () => (this.more ? this.moreApps() : this.home()), body);
    await this.fill(id, body);
  }
  async fill(id, body, keepScroll = false) {
    const r = await this.game.phone(id);
    if (this.app !== id) return;
    if (!r.ok) { replace(body, el("p", { class: "err", role: "alert" }, sentence(r.error.message))); return; }
    const render = SCREENS[id];
    let out;
    try { out = render ? await render.call(this, r.data) : generic(r.data); } catch (e) { console.warn("phone app render failed", id, e); out = generic(r.data); }
    if (this.app !== id) return;
    const scroller = this.root.querySelector(".phone-body"), top = scroller ? scroller.scrollTop : 0;
    replace(body, out);
    if (keepScroll && scroller) scroller.scrollTop = top;
  }
  // The open app again, from the server, where you were on the page.
  reload() {
    const body = this.root.querySelector(".phone-inner > .stack");
    if (this.app && body) return this.fill(this.app, body, true);
    return Promise.resolve();
  }
  // Somewhere to go first: close the phone so the map shows, walk, act, and say how it went.
  async away(run) {
    this.close();
    const r = await run();
    showOutcome(this.ui, r);
    return r;
  }
  showPlaceNamed(name) {
    const p = placeNamed(this.world, name);
    if (!p) return null;
    return () => { this.close(); this.game.showPlace(p.id); };
  }
  // Message someone from anywhere (Contacts, a person's card): Messages with them picked.
  compose(id) { this.show("messages", { to: id }); }

  // New messages (or a "seen") while Messages is open: update in place instead of rebuilding the screen, so a
  // half-typed message, the focused field and the phone's keyboard all stay.
  async refreshMessages() {
    if (this.app !== "messages") return;
    const r = await this.game.phone("messages");
    const body = this.root.querySelector(".phone-inner > .stack");
    if (this.app !== "messages" || !r.ok || !body) return;
    const fresh = el("div", null, this.messages(r.data));
    for (const sel of [".thread", ".convos", ".thread-note"]) {
      const mine = body.querySelector(sel), theirs = fresh.querySelector(sel);
      if (mine && theirs) mine.replaceWith(theirs);
      else if (!mine && theirs && sel === ".convos") { const empty = body.querySelector(".no-convos"); if (empty) empty.replaceWith(theirs); }
    }
  }

  // ---------------------------------------------------------------- Bank
  bank(d) {
    if (typeof d.bank_cents === "number") this.world.money = { bank_cents: d.bank_cents, cash_cents: d.cash_cents };
    return [
      el("div", { class: "card" }, eyebrow("Balances"),
        el("dl", { class: "kv" }, el("dt", null, "Bank"), el("dd", { class: "money" }, money(d.bank_cents)), el("dt", null, "Cash"), el("dd", { class: "money" }, money(d.cash_cents)),
          d.rent_arrears_cents ? [el("dt", null, "Rent owed"), el("dd", { class: "money" }, money(d.rent_arrears_cents))] : null)),
      el("div", { class: "card" }, eyebrow("Recent"),
        (d.recent || []).length ? el("div", null, d.recent.map(t => el("div", { class: "tx" },
          el("div", null, el("div", null, t.memo || titleCase(t.kind)), el("div", { class: "hint" }, `${shortWhen(t.when)} · ${t.account}`)),
          el("div", { class: `amt money ${t.amount_cents < 0 ? "neg" : "pos"}` }, (t.amount_cents > 0 ? "+" : "") + money(t.amount_cents)))))
          : hint("No transactions yet.")),
    ];
  }

  // ---------------------------------------------------------------- Messages
  async loadPeople() {
    const r = await this.game.phone("contacts");
    if (r.ok && Array.isArray(r.data.contacts)) this.people = r.data.contacts.filter(c => c && c.id);
  }
  // Who you can write to: your contacts, people in sight, anyone you already have a thread with.
  recipients(threadIds = []) {
    const w = this.world, seen = new Map();
    const add = (id, name, rank) => { if (id && id !== w.selfId && !seen.has(id)) seen.set(id, { id, name: name || w.nameOf(id), rank }); };
    for (const id of threadIds) add(id, (this.people.find(p => p.id === id) || {}).name || w.nameOf(id), 0);
    for (const c of [...this.people].sort((a, b) => ((b.your_feelings || {}).friendship || 0) - ((a.your_feelings || {}).friendship || 0))) add(c.id, c.name, 1);
    for (const p of w.people.values()) add(p.id, p.name, 2);
    return [...seen.values()];
  }
  // Messages (D-074): your conversations, newest first, then a thread per person. Under your last message,
  // whether they've seen it (the server's read flag). Someone a script plays says so; they read and answer by
  // the game's rules (data/society/manners.json), never pretending to be a person.
  messages(d) {
    const w = this.world, threads = d.threads && typeof d.threads === "object" ? d.threads : {}, info = d.people && typeof d.people === "object" ? d.people : {};
    this.unread = 0; this.game.setPhoneBadge();
    const nameOf = id => (info[id] && info[id].name) || (this.people.find(p => p.id === id) || {}).name || w.nameOf(id);
    if (this.thread) return this.threadView(this.thread, threads[this.thread] || [], info[this.thread] || {}, nameOf);
    const ids = Object.keys(threads).sort((a, b) => ((threads[b].at(-1) || {}).at || 0) - ((threads[a].at(-1) || {}).at || 0));
    const people = this.recipients(ids);
    const to = el("input", { type: "text", class: "input", placeholder: "Search your contacts, or type a name", "aria-label": "To", autocapitalize: "none", autocomplete: "off", spellcheck: "false" });
    const text = el("input", { type: "text", class: "input", maxlength: "500", placeholder: "Message", "aria-label": "Message" });
    const err = el("p", { class: "err", role: "alert" });
    let picked = null;
    const picker = el("div", { class: "picker", role: "group", "aria-label": "Send to" });
    const drawPicker = () => {
      const q = to.value.trim().toLowerCase();
      const match = p => !q || (picked && p.id === picked) || p.name.toLowerCase().includes(q) || p.id.includes(q);
      const list = people.filter(match).slice(0, 10);
      replace(picker, list.length ? list.map(p => el("button", { type: "button", class: "target", "aria-pressed": String(p.id === picked), dataset: { person: p.id },
        onclick: () => { picked = p.id; to.value = p.name; err.textContent = ""; drawPicker(); text.focus(); } }, avatar(p.id, p.name), firstName(p.name)))
        : el("span", { class: "hint" }, people.length ? "Nobody by that name in your contacts: the server will look the name up." : "No contacts yet: people you meet show up here."));
    };
    to.addEventListener("input", () => { const p = people.find(x => x.id === picked); if (!p || p.name !== to.value) picked = null; drawPicker(); });
    drawPicker();
    // The one you picked, else someone whose name or id is exactly what was typed, else the typed text as an id.
    const recipient = () => {
      if (picked) return picked;
      const q = to.value.trim().toLowerCase();
      if (!q) return "";
      const exact = people.find(p => p.id === q || p.name.toLowerCase() === q) || people.filter(p => firstName(p.name).toLowerCase() === q).length === 1 && people.find(p => firstName(p.name).toLowerCase() === q);
      return exact ? exact.id : q.replace(/\s+/g, "-");
    };
    const send = async e => {
      e.preventDefault();
      const toId = recipient(), body = text.value.trim();
      if (!toId) { err.textContent = "Pick who to send it to."; return; }
      if (!body) { err.textContent = "Write something first."; return; }
      const r = await this.game.message(toId, body);
      if (!r.ok) { err.textContent = sentence(r.error.message); return; }
      text.value = ""; this.openApp("messages", { to: toId });
    };
    const compose = el("form", { class: "card compose-new", onsubmit: send }, eyebrow("New message"), picker, to, text, err, el("button", { type: "submit", class: "btn primary" }, "Send"));
    const convo = id => {
      const msgs = threads[id] || [], last = msgs.at(-1) || {}, unread = msgs.some(m => m.unread), them = info[id] || {};
      return el("li", null, el("button", { type: "button", class: `convo${unread ? " unread" : ""}`, dataset: { convo: id }, onclick: () => this.openApp("messages", { to: id }) },
        avatar(id, nameOf(id), "mid"),
        el("span", { class: "grow" }, el("strong", null, nameOf(id)),
          el("span", { class: "preview" }, `${last.from === w.selfId ? "You: " : ""}${String(last.body ?? "")}`),
          el("span", { class: "hint" }, [shortWhen(last.when || ""), them.scripted ? "played by a script" : ""].filter(Boolean).join(" · "))),
        unread ? el("span", { class: "dot", "aria-label": "new" }) : null));
    };
    return [
      ids.length ? el("ul", { class: "convos", "aria-label": "Conversations" }, ids.map(convo)) : el("p", { class: "hint no-convos" }, "No messages yet."),
      compose,
    ];
  }
  threadView(id, msgs, them, nameOf) {
    const w = this.world, me = w.selfId;
    const reply = el("input", { type: "text", class: "input", maxlength: "500", placeholder: `Message ${firstName(nameOf(id))}`, "aria-label": "Reply" });
    const rerr = el("p", { class: "err", role: "alert" });
    const shown = msgs.slice(-50), lastMine = [...shown].reverse().find(m => m.from === me);
    const bubbles = [];
    for (const m of shown) {
      bubbles.push(el("div", { class: `msg${m.from === me ? " me" : ""}` }, m.body, el("span", { class: "when" }, shortWhen(m.when || ""))));
      if (m === lastMine && shown.at(-1) === m) bubbles.push(el("span", { class: `seen${m.seen ? " yes" : ""}`, dataset: { seen: String(!!m.seen) } }, m.seen ? "Seen" : "Delivered"));
    }
    const send = async e => {
      e.preventDefault();
      const body = reply.value.trim();
      if (!body) { rerr.textContent = "Write something first."; return; }
      const r = await this.game.message(id, body);
      if (!r.ok) { rerr.textContent = sentence(r.error.message); return; }
      reply.value = ""; rerr.textContent = ""; this.refreshMessages();
    };
    const back = el("button", { type: "button", class: "btn small", onclick: () => { this.thread = null; this.reload(); } }, icon("back"), "All messages");
    return [
      back,
      el("div", { class: "card", dataset: { thread: id } },
        el("div", { class: "thread-head" }, avatar(id, nameOf(id), "mid"), el("h3", null, nameOf(id)),
          them.scripted ? el("span", { class: "badge script" }, "Played by a script") : them.online === false ? el("span", { class: "badge closed" }, "Away") : null),
        them.scripted ? el("p", { class: "hint thread-note" }, `${firstName(nameOf(id))} is played by a script: they read messages when they're free and answer by the game's rules, not as a person would.`)
          : them.online === false ? el("p", { class: "hint thread-note" }, `${firstName(nameOf(id))} isn't in town right now: they'll see it when they're back.`) : null,
        el("div", { class: "thread" }, bubbles.length ? bubbles : el("p", { class: "hint" }, "No messages yet. Say hello.")),
        el("form", { class: "thread-form", onsubmit: send }, el("div", { class: "grow" }, reply), el("button", { type: "submit", class: "btn primary" }, "Send")),
        rerr),
    ];
  }

  // ---------------------------------------------------------------- Map and Transit
  // The Map (D-074): a plan of the town with the places open now in gold, you, and your people where your
  // character could know they are: in sight (the server's own rule), or where they last posted from (public). Then
  // your people and the places open now as lists, each with a button to walk there; every place under All places.
  map(d) {
    const w = this.world, me = w.selfPos();
    // The server says what's open to anyone right now; the places themselves are the map the client already has.
    const openIds = new Set(Array.isArray(d.open_now) ? d.open_now : []);
    const isOpen = pl => openIds.has(pl.id);
    const people = Array.isArray(d.people) ? d.people : [];
    const go = (placeId, door) => this.away(async () => {
      const pl = w.placeById.get(placeId);
      if (pl && pl.enterable !== false) return getThere(this.game, placeId, { enter: true });
      const r = await this.game.walkTo(door || (pl && pl.door));
      return r && r.ok ? { ok: true, summary: `Walking to ${pl ? pl.name : "them"}.` } : r || { ok: false, error: { message: "You can't walk there right now." } };
    });
    const where = p => p.where === "in_sight" ? (p.inside ? `Here with you at ${(w.placeById.get(p.inside) || {}).name || "this place"}` : `In sight, ${me && p.position ? `${Math.round(dist(me, p.position))} m away` : "nearby"}`)
      : p.where === "posted" ? `Posted from ${p.place.name} ${shortWhen(p.when || "")}`.trim() : "Not where you can see them";
    // The plan: places at their doors, fitted to where the town's places are (with a margin).
    const doors = w.places.filter(p => p.door).map(p => p.door);
    const b = doors.length ? { min: [Math.min(...doors.map(p => p[0])), Math.min(...doors.map(p => p[1]))], max: [Math.max(...doors.map(p => p[0])), Math.max(...doors.map(p => p[1]))] }
      : (w.bounds || { min: [0, 0], max: [1000, 1000] });
    const pad = Math.max(30, (b.max[0] - b.min[0]) * 0.06), x0 = b.min[0] - pad, y0 = b.min[1] - pad, x1 = b.max[0] + pad, y1 = b.max[1] + pad;
    const W = 340, k = W / Math.max(1, x1 - x0), H = Math.max(160, Math.round((y1 - y0) * k));
    const P = pt => [Math.round((pt[0] - x0) * k * 10) / 10, Math.round((pt[1] - y0) * k * 10) / 10];
    const NS = "http://www.w3.org/2000/svg", svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const [a, v] of Object.entries(attrs)) n.setAttribute(a, String(v)); return n; };
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "minimap", role: "img", "aria-label": "Town plan: places open now in gold, you, and your people" });
    const selected = el("div", { class: "card map-selected", hidden: true });
    const pick = pl => {
      const open = isOpen(pl);
      replace(selected, el("h3", null, pl.name), hint(`${typeName(pl.shape || pl.type)} · ${open ? "open now" : "not open to you now"}${pl.hours ? ` · ${hoursText(pl.hours)}` : ""}${me ? ` · ${Math.round(dist(me, pl.door))} m` : ""}`),
        el("div", { class: "row" }, button("Walk there", () => go(pl.id, pl.door), { primary: true }), button("Show on the map", () => { this.close(); this.game.showPlace(pl.id); })));
      selected.hidden = false;
    };
    for (const pl of w.places) {
      if (!pl.door || ["apartment", "condo", "house", "townhouse", "construction_site"].includes(pl.type)) continue;
      const [cx, cy] = P(pl.door);
      const dot = svgEl("circle", { cx, cy, r: 5, class: `pl${isOpen(pl) ? " open" : ""}` });
      const t = svgEl("title", {}); t.textContent = pl.name; dot.appendChild(t);
      dot.addEventListener("click", () => pick(pl));
      svg.appendChild(dot);
    }
    for (const p of people) {
      const pos = p.where === "in_sight" && p.position && !p.inside ? p.position : p.where === "posted" ? (w.placeById.get(p.place.id) || {}).door
        : p.where === "in_sight" && p.inside ? (w.placeById.get(p.inside) || {}).door : null;
      if (!pos) continue;
      const [cx, cy] = P(pos);
      svg.appendChild(svgEl("circle", { cx, cy, r: 7, class: `pp${p.where === "posted" ? " posted" : ""}` }));
      const label = svgEl("text", { x: cx + 9, y: cy + 4 }); label.textContent = firstName(p.name); svg.appendChild(label);
    }
    if (me) { const [cx, cy] = P(me); svg.appendChild(svgEl("circle", { cx, cy, r: 6, class: "me" })); }
    const legend = el("div", { class: "map-legend" }, el("span", null, "Open now"), el("span", { class: "k-closed" }, "Closed"), el("span", { class: "k-you" }, "You"), el("span", { class: "k-people" }, "Your people"));

    const known = people.slice().sort((a, b) => (a.where === "unknown") - (b.where === "unknown") || a.name.localeCompare(b.name));
    const peopleCard = card(eyebrow("Your people"),
      known.length ? el("ul", { class: "list people-list" }, known.map(p => el("li", { dataset: { person: p.character } },
        el("div", { class: "row" }, avatar(p.character, p.name), el("strong", { class: "grow" }, p.name), p.scripted ? el("span", { class: "badge script" }, "Played by a script") : null),
        el("span", { class: "hint" }, where(p)),
        p.where === "unknown" ? null : el("div", { class: "row" },
          p.where === "posted" ? button(`Walk to ${p.place.name}`, () => go(p.place.id), { data: { walk: p.character } })
            : p.inside ? null : button("Walk over", () => this.away(async () => { const r = await this.game.walkTo(p.position); return r && r.ok ? { ok: true, summary: `Walking over to ${firstName(p.name)}.` } : r; }), { data: { walk: p.character } }),
          button("Message", () => this.openApp("messages", { to: p.character })))))) : hint("Nobody yet: people you meet show up here."),
      hint("Where you could know they are: in sight, or the last place they posted from (posts are public). Nothing else."));

    const openNow = w.places.filter(p => isOpen(p) && p.door && p.type !== "construction_site")
      .map(p => ({ ...p, d: me ? dist(me, p.door) : 0 })).sort((a, b) => a.d - b.d).slice(0, 10);
    const openCard = card(eyebrow("Open now, nearest first"), el("ul", { class: "list open-list" }, openNow.map(p => el("li", { dataset: { open: p.id } },
      el("div", { class: "offer-head" }, el("span", null, p.name), el("span", { class: "hint" }, me ? `${Math.round(p.d)} m` : "")),
      el("span", { class: "hint" }, `${typeName(p.type)}${p.hours ? ` · ${hoursText(p.hours)}` : " · always open"}`),
      el("div", { class: "row" }, button("Walk there", () => go(p.id, p.door), { primary: true, data: { go: p.id } }), button("Show", () => { this.close(); this.game.showPlace(p.id); }))))));

    // Every place, by district (as before), one tap deeper.
    const groups = new Map();
    for (const bl of w.buildings) { const key = bl.district || "Elsewhere"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(bl); }
    for (const p of w.places.filter(p => p.type === "park")) { const key = p.district || "Elsewhere"; if (!groups.has(key)) groups.set(key, []); groups.get(key).push({ ...p, enterable: false }); }
    const all = el("details", { class: "card all-places" }, el("summary", { class: "eyebrow" }, `All places (${w.places.length})`));
    for (const [district, list] of [...groups].sort((a, z) => a[0].localeCompare(z[0]))) {
      list.sort((a, z) => dist(me, a.door) - dist(me, z.door));
      all.append(eyebrow(district), el("ul", { class: "list" }, list.map(bl => el("li", null,
        el("div", { class: "offer-head" }, el("span", null, bl.name), el("span", { class: "hint" }, me ? `${Math.round(dist(me, bl.door))} m` : "")),
        el("div", { class: "hint" }, `${typeName(bl.shape || bl.type)}${bl.status && bl.status !== "open" ? " · " + bl.status.replace(/_/g, " ") : ""}`),
        el("div", { class: "row" },
          el("button", { type: "button", class: "btn small", onclick: () => { this.close(); this.game.showPlace(bl.id); } }, "Show"),
          el("button", { type: "button", class: "btn small", onclick: () => { this.close(); this.game.walkTo(bl.door); } }, "Walk there"))))));
    }
    return [card(svg, legend, hint("Tap a dot for the place.")), selected, peopleCard, openCard, all];
  }

  // Each stop as a destination: ride there from the stop nearest you (that's where you board).
  transit(d) {
    const w = this.world, me = w.selfPos();
    if (!w.transit && Array.isArray(d.lines)) w.setTransit(d.lines);
    return (w.transit || []).map(l => {
      const nearest = me ? [...l.stops].sort((a, b) => dist(me, a.at) - dist(me, b.at))[0] : null;
      return el("div", { class: "card" },
        el("h3", null, l.name),
        hint(`Fare ${money(l.fare_cents)}${l.first_hour != null ? ` · runs ${l.first_hour}:00–${l.last_hour}:00` : ""}.${nearest ? ` Ride here boards at your nearest stop, ${nearest.name} (${Math.round(dist(me, nearest.at))} m), and pays by card; Stop details lets you choose.` : ""}`),
        el("ul", { class: "list" }, l.stops.map(s => el("li", { dataset: { stop: s.id } },
          el("div", { class: "offer-head" }, el("span", null, s.name), el("span", { class: "hint" }, me ? `${Math.round(dist(me, s.at))} m` : "")),
          nearest && nearest.id === s.id ? hint("Your nearest stop.") : null,
          el("div", { class: "row" },
            nearest && nearest.id !== s.id ? button(`Ride here`, () => { this.close(); this.game.rideFrom(nearest, s.id, true, "card"); }, { primary: true }) : null,
            button("Walk to stop", () => { this.close(); this.game.walkTo(s.at); }),
            button("Stop details", () => { this.close(); this.game.showStop(s.id); }))))),
        hint("Single-rider shuttle for now: shared buses on a timetable come later."));
    });
  }

  // ---------------------------------------------------------------- Career
  career(d) {
    if (!d.career) return [card(eyebrow("Career"), el("h3", null, "No job yet"), hint("The Jobs app lists every opening; you apply in person at the workplace."),
      button("Open Jobs", () => this.openApp("jobs"), { primary: true }))];
    this.world.career = d;
    const ladder = d.ladder || [];
    return [el("div", { class: "card" },
      eyebrow(d.career), el("h3", null, d.title),
      pairs([["Pay", el("span", { class: "money" }, `${money(d.hourly_cents)}/hr`)], ["Works at", (d.workplaces || []).join(", ")], ["On shift", d.on_shift ? "yes" : "no"],
        ["Earned so far", el("span", { class: "money" }, money(d.lifetime_earnings_cents))]]),
      meter("Performance", d.performance, { text: `${Math.round(d.performance)} (need ${d.min_performance})` }),
      d.hours_to_promote ? meter("Promotion", d.hours_at_level, { max: d.hours_to_promote, text: `${d.hours_at_level} of ${d.hours_to_promote} h` }) : null,
      el("div", { class: "row" }, button("Work", () => this.openApp("work"), { primary: true }), button("Jobs", () => this.openApp("jobs"))),
      eyebrow("The ladder"), el("ol", { class: "ladder" }, ladder.map((t, i) => el("li", { class: i === d.level ? "now" : i < d.level ? "done" : "" }, t, i === d.level ? " · you" : ""))))];
  }

  // ---------------------------------------------------------------- Work Desk (R1.1)
  async work(d) {
    const w = this.world;
    if (!d.career) return [card(eyebrow("Work"), el("h3", null, "No job yet"), hint(readable(d.note || "")), button("Find a job", () => this.openApp("jobs"), { primary: true }))];
    let career = w.career && w.career.career ? w.career : null;
    if (!career) { const r = await this.game.phone("career"); if (r.ok) { career = r.data; w.career = r.data; } }
    const workplaces = ((career && career.workplaces) || []).map(n => placeNamed(w, n)).filter(Boolean);
    const atWork = workplaces.find(p => w.self && w.self.inside === p.id);
    const state = { d: { ...d } };
    const header = el("div");
    const status = el("div", { class: "card work-status" });
    const drawHeader = () => replace(header, this.workHeader(state.d));
    const drawStatus = () => {
      const s = state.d, open = Number(s.open) || 0, upcoming = Number(s.upcoming) || 0;
      const lines = [];
      if (s.on_shift) {
        lines.push(el("div", { class: "row" }, el("span", { class: "badge open" }, "On shift"), atWork ? el("span", { class: "hint" }, `at ${atWork.name}`) : null));
        lines.push(el("p", { class: "status-big" }, open ? `${open === 1 ? "A decision is" : `${open} decisions are`} waiting for you.` : "No decisions waiting right now."));
        // Time worked and pay so far: from the server's shift start when it sends one, else from when
        // this page started the shift. An estimate either way (a shift's pay has a cap the client
        // doesn't know); End shift pays the real figure.
        const started = typeof s.shift_started_at === "number" ? s.shift_started_at : typeof this.game.shiftStart === "number" ? this.game.shiftStart : null;
        const nowMin = w.minute(), hourly = career && career.hourly_cents;
        if (started !== null && nowMin !== null && nowMin >= started) {
          const mins = Math.floor(nowMin - started);
          lines.push(el("p", { class: "shift-line" }, mins < 1 ? "Your shift just started."
            : `On shift for ${duration(mins)}${hourly ? ` · about ${money(Math.round(hourly * mins / 60))} so far (estimate, paid at End shift)` : ""}.`));
        }
        if (s.next_at != null) lines.push(hint(`${upcoming === 1 ? "One more comes" : `${upcoming} more come`} up this shift; the next at ${clockText(s.next_at)}.`));
        else if (upcoming) lines.push(hint(`${upcoming} more today.`));
        lines.push(hint("A shift pays for the hours worked when you end it (End shift, or leaving the building). Decisions are optional: good calls get you promoted sooner."));
      } else {
        lines.push(el("div", { class: "row" }, el("span", { class: "badge closed" }, "Off shift")));
        const note = readable(s.note || "");
        if (note) lines.push(el("p", null, note));
      }
      const shift = atWork ? button(s.on_shift ? "End shift" : "Start shift", async () => { await this.game.work(s.on_shift ? "end" : "start"); this.reload(); }, { primary: !s.on_shift, small: false, cls: "block" })
        : !s.on_shift && workplaces.length ? button(`Go to work: ${workplaces[0].name}`, () => this.away(async () => {
          const r = await getThere(this.game, workplaces[0].id, { enter: true });
          if (r.ok) r.summary = `You're at ${workplaces[0].name}. Start your shift here, or from the Work app.`;
          return r;
        }), { primary: true, small: false, cls: "block" })
        : null;
      replace(status, lines, shift, !atWork && !s.on_shift && workplaces.length ? hint("You start a shift inside your workplace.") : null);
    };
    drawHeader(); drawStatus();
    const decisions = (d.decisions || []).map((x, i) => this.decisionCard(x, i, d.next_title, reply => {
      // The answer's reply carries where you stand now: performance, hours, what's still open.
      state.d = { ...state.d, ...pick(reply, ["performance", "hours_at_level", "hours_to_promote", "hours_left", "decision_bonus_hours", "next_title", "min_performance", "open", "upcoming", "next_at", "next_in_minutes", "title"]) };
      state.d.answered_today = (Number(state.d.answered_today) || 0) + 1;
      state.d.decisions_answered = (Number(state.d.decisions_answered) || 0) + 1;
      if (reply.best_call) state.d.best_calls = (Number(state.d.best_calls) || 0) + 1;
      drawHeader(); drawStatus();
    }));
    // A decision comes up while you look: open the app again then (servers that pace them say when).
    if (d.on_shift && typeof d.next_in_minutes === "number" && d.next_in_minutes >= 0) {
      const ms = (d.next_in_minutes + 0.5) / (w.rules.minutes_per_real_second || 1) * 1000 + 500;
      this.timer = setTimeout(() => { if (this.app === "work" && this.open) this.reload(); }, Math.min(ms, 30 * 60000));
    }
    const totals = Number(d.decisions_answered) ? hint(`All-time: ${d.decisions_answered} decisions made, ${d.best_calls || 0} of them the best call.`) : null;
    return [header, status, decisions.length ? eyebrow(d.on_shift ? "Today's decisions" : "Today's results") : null, ...decisions, totals];
  }
  workHeader(s) {
    const next = s.next_title, toPromote = Number(s.hours_to_promote) || 0, at = Number(s.hours_at_level) || 0;
    return card(eyebrow(s.career || "Work"), el("h3", null, s.title || ""),
      meter("Performance", s.performance, { text: `${Math.round(s.performance)}${s.min_performance != null && next ? ` · need ${s.min_performance}` : ""}` }),
      next && toPromote ? meter(`To ${next}`, at, { max: toPromote, text: `${at} of ${toPromote} h` }) : null,
      next && toPromote ? hint(`${s.hours_left != null ? `${s.hours_left} h to go` : ""}${Number(s.decision_bonus_hours) ? ` · ${s.decision_bonus_hours} h of it from good calls` : ""}. Promotions happen when a shift ends.`)
        : next === null ? hint("The top of this ladder.") : null);
  }
  decisionCard(x, i, nextTitle, onAnswer) {
    const err = el("p", { class: "err", role: "alert" });
    const node = el("article", { class: `card decision${x.answered ? " answered" : ""}`, dataset: { task: x.task } },
      eyebrow(`Decision ${i + 1}`), el("p", { class: "prompt" }, readable(x.prompt)));
    if (x.answered) { node.append(this.verdict(x, nextTitle)); return node; }
    const opts = el("div", { class: "options", role: "group", "aria-label": "Your call" });
    for (const o of x.options || []) {
      opts.append(el("button", { type: "button", class: "option", dataset: { option: String(o.option) }, onclick: async e => {
        const chosen = e.currentTarget;
        for (const b of opts.querySelectorAll("button")) b.disabled = true;
        chosen.classList.add("chosen");
        err.textContent = "";
        const r = await verbs.workAnswer(this.game, x.task, o.option);
        if (!r.ok) {
          err.textContent = sentence(r.error.message);
          chosen.classList.remove("chosen");
          if (r.error.code !== "already_answered") for (const b of opts.querySelectorAll("button")) b.disabled = false;
          return;
        }
        node.classList.add("answered");
        opts.replaceWith(this.verdict(r.data, r.data.next_title !== undefined ? r.data.next_title : nextTitle, true));
        onAnswer(r.data);
      } }, el("strong", null, o.label), o.detail ? el("span", { class: "option-detail" }, o.detail) : null));
    }
    node.append(opts, err);
    return node;
  }
  // The server's verdict on a call: best or the better one, why, and what it did.
  verdict(v, nextTitle, fresh = false) {
    const best = !!v.best_call, perf = Number(v.performance_change) || 0, bonus = Number(v.bonus_hours) || 0;
    return el("div", { class: `verdict ${best ? "best" : "other"}${fresh ? " fresh" : ""}`, role: fresh ? "status" : null },
      el("div", { class: "verdict-head" }, best ? [icon("check"), " Best call"] : ["The better call: ", el("strong", null, v.best ? v.best.label : "another option")]),
      v.you_chose ? el("p", { class: "chose" }, "You chose ", el("strong", null, v.you_chose.label), ".") : null,
      v.you_chose && v.you_chose.why ? el("p", { class: "why" }, v.you_chose.why) : null,
      !best && v.best && v.best.why ? el("p", { class: "why" }, v.best.why) : null,
      el("p", { class: "effect" }, `Performance ${signed(Math.round(perf * 10) / 10)}`, bonus ? ` · +${bonus} h toward ${nextTitle || "promotion"}` : nextTitle ? ` · no extra hours toward ${nextTitle}` : ""));
  }

  // ---------------------------------------------------------------- Calendar
  async calendar(d) {
    const w = this.world, now = d.now && typeof d.now.minute === "number" ? d.now.minute : Math.floor(w.minute() || 0);
    const today = dateOf(now), dayStart = today.dayIndex * 1440;
    const sports = await this.game.phone("sports");
    const events = [];
    for (const u of d.upcoming || []) if (typeof u.at === "number") events.push({ at: u.at, title: readable(u.title), source: "From your lease" });
    if (sports.ok) for (const t of sports.data.your_teams || []) {
      if (typeof t.next_kickoff === "number") events.push({ at: t.next_kickoff, title: `${t.sport}: ${t.name}${t.opponent ? ` v ${t.opponent}` : ""}`, place: t.venue, source: "From the league" });
    }
    const entry = (minuteOfDay, text, source, { past = false, place = null } = {}) => {
      const p = place ? placeNamed(w, place) : placeInText(w, text);
      return el("li", { class: `agenda-item${past ? " past" : ""}` },
        el("span", { class: "agenda-time" }, `${String(Math.floor(minuteOfDay / 60) % 24).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`),
        el("span", { class: "agenda-what" }, el("span", null, text), el("span", { class: "hint" }, `${source}${past ? " · earlier" : ""}`)),
        p ? button("Go", () => { this.close(); this.game.showPlace(p.id); }, { data: { place: p.id } }) : null);
    };
    const dayList = (k, withPast) => {
      const dayIndex = today.dayIndex + k, items = [];
      for (const [m, text] of routineFor(d.routine, dayIndex % 7)) items.push({ m, node: () => entry(m, text, "From your routine", { past: withPast && dayStart + m < now }) });
      for (const e of events) if (Math.floor(e.at / 1440) === dayIndex) items.push({ m: e.at % 1440, node: () => entry(e.at % 1440, e.title, e.source, { past: withPast && e.at < now, place: e.place }) });
      items.sort((a, b) => a.m - b.m);
      return items.map(x => x.node());
    };
    const out = [];
    const todays = dayList(0, true);
    out.push(card(eyebrow(`Today · ${minuteWhen(now).split(" · ")[0]}`), todays.length ? el("ul", { class: "agenda" }, todays) : hint("Nothing on your calendar today.")));
    const week = [];
    for (let k = 1; k < 7; k++) {
      const items = dayList(k, false);
      if (items.length) week.push(el("div", { class: "agenda-day" }, el("h4", null, minuteWhen((today.dayIndex + k) * 1440, now).split(" · ")[0]), el("ul", { class: "agenda" }, items)));
    }
    out.push(card(eyebrow("This week"), week.length ? week : hint("Nothing else this week.")));
    const later = events.filter(e => Math.floor(e.at / 1440) >= today.dayIndex + 7).sort((a, b) => a.at - b.at);
    if (later.length) out.push(card(eyebrow("Later"), el("ul", { class: "list" }, later.map(e => el("li", null, el("span", null, e.title), el("span", { class: "hint" }, `${minuteWhen(e.at, now)} · ${e.source.toLowerCase()}`))))));
    out.push(hint("Your routine comes from your story. Jobs keep no set hours yet: the routine says when you usually go."));
    return out;
  }

  // ---------------------------------------------------------------- Contacts (your side only)
  contacts(d) {
    const w = this.world, list = (d.contacts || []).filter(c => c && c.id);
    if (!list.length) return [hint("No contacts yet. People you meet show up here.")];
    const f = c => c.your_feelings || {};
    list.sort((a, b) => (b.online - a.online) || ((f(b).friendship || 0) - (f(a).friendship || 0)));
    const GOOD = [["friendship", "Friendship"], ["trust", "Trust"], ["familiarity", "Familiarity"], ["respect", "Respect"], ["loyalty", "Loyalty"],
      ["romantic_attraction", "Romance"], ["physical_attraction", "Attraction"]];
    const BAD = [["conflict", "Conflict"], ["resentment", "Resentment"], ["jealousy", "Jealousy"]];
    return [hint("How you feel about each of them: only your side. Their feelings are theirs."),
      ...list.map(c => {
        const feel = f(c), inSight = w.people.has(c.id);
        const bars = [...GOOD.filter(([k], i) => i < 3 || (feel[k] || 0) > 0), ...BAD.filter(([k]) => (feel[k] || 0) > 0)]
          .filter(([k]) => typeof feel[k] === "number").map(([k, label]) => meter(label, feel[k], { bad: BAD.some(b => b[0] === k) }));
        return el("div", { class: "card contact", dataset: { contact: c.id } },
          el("div", { class: "row" }, avatar(c.id, c.name, "mid"), el("div", { class: "grow stack-tight" }, el("h3", null, c.name),
            el("span", { class: "hint" }, [c.online ? "In town now" : "Not around", c.interactions ? `${c.interactions} ${c.interactions === 1 ? "time" : "times"} together` : "", typeof feel.compatibility === "number" ? `compatibility ${Math.round(feel.compatibility)}` : ""].filter(Boolean).join(" · ")))),
          bars,
          el("div", { class: "row" },
            button("Message", () => this.openApp("messages", { to: c.id }), { primary: true }),
            button("Profile", () => this.socialProfile(c.id)),  // their posts (D-074)
            inSight ? button("Show on map", () => { this.close(); const pos = w.personPos(c.id); if (pos && this.game.renderer) this.game.renderer.centerOn(pos[0], pos[1]); this.ui.sheetPerson(c.id); }) : null));
      })];
  }

  // ---------------------------------------------------------------- Jobs (with Apply)
  async jobs(d) {
    const w = this.world, list = (d.jobs || []).filter(j => j && j.id);
    let career = w.career;
    if (!career) { const r = await this.game.phone("career"); if (r.ok) career = w.career = r.data; }
    const mine = list.find(j => j.id === d.current);
    let showAll = !list.some(j => j.eligible && j.id !== d.current);
    const box = el("div", { class: "stack" });
    const seg = el("div", { class: "seg", role: "group", "aria-label": "Which jobs" });
    const draw = () => {
      for (const b of seg.children) b.setAttribute("aria-pressed", String((b.dataset.all === "1") === showAll));
      const shown = list.filter(j => j.id !== d.current && (showAll || j.eligible))
        .sort((a, b) => (b.eligible - a.eligible) || (b.starting_hourly_cents - a.starting_hourly_cents));
      replace(box, shown.length ? shown.map(j => this.jobCard(j, !!d.current)) : hint("No openings you qualify for right now. School can change that."));
    };
    seg.append(el("button", { type: "button", dataset: { all: "0" }, onclick: () => { showAll = false; draw(); } }, "Open to you"),
      el("button", { type: "button", dataset: { all: "1" }, onclick: () => { showAll = true; draw(); } }, "All jobs"));
    draw();
    return [
      mine || (career && career.career) ? card(eyebrow("Your job"), el("h3", null, career && career.title ? career.title : mine.starting_title),
        hint(`${career && career.career ? career.career : mine.career}${career && career.workplaces ? ` · ${career.workplaces.join(", ")}` : ""}. Changing jobs starts you at the first rung of the new one.`))
        : card(eyebrow("Your job"), el("h3", null, "None yet"), hint("Apply in person: at the workplace's door, or inside.")),
      seg, box];
  }
  jobCard(j, hasJob) {
    const w = this.world, res = resultLine();
    const places = (j.workplaces || []).map(n => placeNamed(w, n)).filter(Boolean);
    const here = places.find(p => isAt(w, p));
    const me = w.selfPos(), nearest = [...places].sort((a, b) => dist(me, a.door) - dist(me, b.door))[0];
    const needs = [j.requires_degree ? `Needs a ${j.requires_degree}` : "", j.requires_clean_record ? "Needs a clean record" : ""].filter(Boolean);
    return el("div", { class: "card job", dataset: { job: j.id } },
      el("div", { class: "offer-head" }, eyebrow(j.career), el("span", { class: "price" }, `${money(j.starting_hourly_cents)}/hr`)),
      el("h3", null, j.starting_title),
      hint((j.workplaces || []).join(", ")),
      el("div", { class: "row" }, el("span", { class: `badge ${j.eligible ? "open" : "closed"}` }, j.eligible ? "You qualify" : "Not yet"), ...needs.map(n => el("span", { class: "hint" }, n))),
      el("div", { class: "row" },
        button("Apply", async () => {
          if (here) { res.show(null); const r = await verbs.apply(this.game, j.id); res.show(r); if (r.ok) setTimeout(() => this.reload(), 1200); }
          else this.away(() => applyFor(this.game, j));
        }, { primary: !!j.eligible, data: { apply: j.id } }),
        nearest ? button("Show", () => { this.close(); this.game.showPlace(nearest.id); }) : null),
      hint(here ? `You're at ${here.name}: Apply sends it now.` : `Apply walks you to ${nearest ? nearest.name : "the workplace"} first.`),
      res);
  }

  // ---------------------------------------------------------------- Homes
  async homes(d) {
    const w = this.world;
    if (!w.money) { const b = await this.game.phone("bank"); if (b.ok) w.money = { bank_cents: b.data.bank_cents, cash_cents: b.data.cash_cents }; }
    const bank = w.money ? w.money.bank_cents : null, t = d.terms || {};
    const out = [];
    const homeCard = (h, title) => {
      const show = this.showPlaceNamed(h.name);
      return el("div", { class: "card" }, eyebrow(title), el("h3", null, h.name),
        hint([addressOnly(h), `${titleCase(h.type)}, ${h.bedrooms} bedroom${h.bedrooms === 1 ? "" : "s"}`, h.tenure].filter(Boolean).join(" · ")),
        h.rent ? pairs([["Rent", el("span", { class: "money" }, `${money(h.rent.monthly_cents)} a month`)],
          h.rent.split_between > 1 ? ["Your share", el("span", { class: "money" }, money(h.rent.your_share_cents))] : null,
          ["Next due", shortWhen(h.rent.next_due)], h.rent.your_arrears_cents ? ["You owe", el("span", { class: "money" }, money(h.rent.your_arrears_cents))] : null]) : null,
        h.mortgage ? pairs([["Mortgage", el("span", { class: "money" }, `${money(h.mortgage.your_share_cents)} a month`)], ["Still owed", el("span", { class: "money" }, money(h.mortgage.owed_cents))],
          ["Next payment", shortWhen(h.mortgage.next_payment)], h.mortgage.missed_payments ? ["Missed", `${h.mortgage.missed_payments} of ${h.mortgage.forecloses_after} before the bank takes it back`] : null]) : h.owned_outright ? hint("Owned outright.") : null,
        (h.residents || []).length > 1 ? hint(`Living here: ${h.residents.map(r => r.name).join(", ")}`) : null,
        show ? el("div", { class: "row" }, button("Show on map", show)) : null);
    };
    out.push(d.home ? homeCard(d.home, "Your home") : card(eyebrow("Your home"), el("h3", null, "Nowhere yet"), hint(readable(d.note || "You have nowhere to live."))));
    for (const h of d.also_own || []) out.push(homeCard(h, "You also own"));
    if ((d.also_own || []).length || (d.home && /owner/.test(d.home.tenure || ""))) out.push(hint("Selling a home and moving between homes you own aren't in the web client yet."));
    const listings = d.listings || [];
    out.push(eyebrow(`For sale · ${listings.length}`));
    if (bank !== null) out.push(hint(`You have ${money(bank)} in the bank. ${t.lender || "The bank"} lends with ${Math.round((t.min_down_payment || 0) * 100)}% down over ${Math.round((t.term_months || 0) / 12)} years at ${Math.round((t.annual_rate || 0) * 1000) / 10}%.`));
    for (const l of listings.slice().sort((a, b) => a.price_cents - b.price_cents)) {
      const res = resultLine(), v = affordability(l, t, bank), place = placeNamed(w, l.name);
      const shortDown = bank !== null && bank < l.min_down_payment_cents;
      out.push(el("div", { class: "card listing", dataset: { listing: l.property } },
        el("div", { class: "offer-head" }, eyebrow(titleCase(l.type)), el("span", { class: "price" }, money(l.price_cents))),
        el("h3", null, l.name),
        hint([addressOnly(l), `${l.bedrooms} bedroom${l.bedrooms === 1 ? "" : "s"}`, (l.amenities || []).map(a => String(a).replace(/_/g, " ")).join(", ")].filter(Boolean).join(" · ")),
        pairs([["Down payment", el("span", { class: "money" }, `from ${money(l.min_down_payment_cents)}`)], ["Monthly", el("span", { class: "money" }, `about ${money(l.est_monthly_cents)}`)], ["Seller", l.seller]]),
        v ? el("p", { class: `afford ${v.ok ? "ok" : "short"}` }, v.text) : null,
        el("div", { class: "row" },
          button(shortDown ? "Not enough saved" : "Buy", async () => {
            if (!place) { res.show({ ok: false, error: { message: "That home isn't on the map." } }); return; }
            if (isAt(w, place)) { const r = await verbs.buyHome(this.game, l.property); res.show(r); if (r.ok) setTimeout(() => this.reload(), 1500); }
            else this.away(() => atDoorThen(this.game, place, () => verbs.buyHome(this.game, l.property)));
          }, { primary: !shortDown, disabled: shortDown, data: { buy: l.property } }),
          place ? button("Show", () => { this.close(); this.game.showPlace(place.id); }) : null),
        hint(place && isAt(w, place) ? "You're at the door: buying takes the minimum down payment from your bank." : "You buy in person: Buy walks you to the door first, then the bank checks everything."),
        res));
    }
    if (!listings.length) out.push(hint("Nothing for sale right now."));
    return out;
  }

  // ---------------------------------------------------------------- Sports
  sports(d) {
    const w = this.world, mine = new Set((d.your_teams || []).map(t => t.id)), league = d.league || {};
    const out = [];
    const you = d.you || {};
    if ((d.your_teams || []).length) out.push(card(eyebrow("Your teams"), el("ul", { class: "list" }, d.your_teams.map(t => el("li", null,
      el("strong", null, `${t.name} · ${t.sport}`), hint(`Next: ${shortWhen(t.when)}${t.opponent ? ` v ${t.opponent}` : ""}${t.venue ? ` at ${t.venue}` : ""}`))))));
    out.push(hint(`League fee ${money(league.fee_cents || 0)}. Sign up in person at ${league.sign_up_at || "the clubhouse"} (inside, while it's open) or at the team's field or court. Played ${you.matches_played || 0}, won ${you.matches_won || 0}.`));
    for (const s of d.sports || []) {
      const myTeam = (s.teams || []).find(t => mine.has(t.id));
      const fixtures = (s.next && s.next.fixtures) || [];
      out.push(el("div", { class: "card sport", dataset: { sport: s.id } },
        eyebrow(s.name), el("h3", null, `${s.match_day}s at ${String(s.match_hour).padStart(2, "0")}:00`),
        hint(`${s.venue_name} · ${duration(s.duration_minutes)} · next ${shortWhen(s.next && s.next.when)}`),
        fixtures.length ? el("ul", { class: "list" }, fixtures.map(f => el("li", null, `${f.home_name} v ${f.away_name}`))) : null,
        (s.table || []).length ? el("table", { class: "table" }, el("thead", null, el("tr", null, ["Team", "P", "W", "L", "Pts"].map(h => el("th", { scope: "col" }, h)))),
          el("tbody", null, s.table.map(r => el("tr", { class: mine.has(r.team) ? "mine" : "" }, el("td", null, r.name), el("td", null, String(r.played)), el("td", null, String(r.won)), el("td", null, String(r.lost)), el("td", null, String(r.points)))))) : null,
        (s.teams || []).map(team => {
          const res = resultLine(), on = mine.has(team.id);
          const members = team.members || [];
          return el("div", { class: "team", dataset: { team: team.id } },
            el("div", { class: "offer-head" }, el("strong", null, team.name), el("span", { class: "hint" }, members.length ? `${members.length} player${members.length === 1 ? "" : "s"}` : "no players yet")),
            members.length ? hint(members.join(", ")) : null,
            on ? button(`Leave the ${team.name}`, async () => { const r = await verbs.leaveTeam(this.game, team.id); res.show(r); if (r.ok) setTimeout(() => this.reload(), 1000); }, { danger: true, data: { leave: team.id } })
              : myTeam ? hint(`You play ${s.name} for the ${myTeam.name}: leave them to join another team.`)
              : button(`Join the ${team.name}`, () => this.away(() => joinAt(this.game, d, s, team)), { primary: true, data: { join: team.id } }),
            res);
        })));
    }
    if ((d.results || []).length) out.push(card(eyebrow("Results"), el("ul", { class: "list" }, d.results.slice(0, 6).map(m => el("li", null, generic(m, 2))))));
    return out;
  }

  // ---------------------------------------------------------------- Items: wear, take off, use, laundry
  async items(d) {
    const w = this.world, list = (d.items || []).filter(i => i && i.id);
    const prop = await this.game.phone("property");
    const homes = new Set(prop.ok ? (prop.data.properties || []).filter(h => h.lives_here && h.location).map(h => h.location) : []);
    const inside = w.self ? w.self.inside : "", herePlace = w.placeById.get(inside);
    const laundromat = w.places.find(p => p.type === "laundromat");
    const atLaundry = homes.has(inside) || (herePlace && herePlace.type === "laundromat");
    const dirty = list.filter(i => i.slot === "outfit" && i.condition && i.condition !== "clean");
    const out = [];
    out.push(card(eyebrow("What you're wearing"), pairs([["Outfit", (list.find(i => i.id === d.outfit) || {}).label || "nothing chosen"], ["Accessory", (list.find(i => i.id === d.accessory) || {}).label || "none"]]),
      meter("Style", d.style || 0)));
    const lres = resultLine();
    out.push(card(eyebrow("Laundry"), hint(dirty.length ? `${dirty.length} outfit${dirty.length === 1 ? " needs" : "s need"} a wash: ${dirty.map(i => `${i.label} (${i.condition})`).join(", ")}.` : "Your clothes look clean."),
      atLaundry ? button("Do laundry", async () => { const r = await verbs.laundry(this.game); lres.show(r); if (r.ok) setTimeout(() => this.reload(), 1200); }, { primary: dirty.length > 0, data: { laundry: "1" } })
        : el("div", { class: "row" }, hint(`Do laundry inside your home${laundromat ? ` or at ${laundromat.name}` : ""}.`),
          laundromat ? button(`Go to ${laundromat.name}`, () => this.away(() => insideThen(this.game, laundromat, () => verbs.laundry(this.game)))) : null),
      lres));
    if (!list.length) { out.push(hint("You don't own anything yet. Shops sell clothes, electronics and more.")); return out; }
    out.push(eyebrow(`Your things · ${list.length}`));
    for (const it of list) {
      const res = resultLine(), acts = [];
      if (it.slot && !it.worn) acts.push(button("Wear", async () => { const r = await verbs.wear(this.game, it.id, it.label); res.show(r); if (r.ok) setTimeout(() => this.reload(), 900); }, { primary: true, data: { wear: it.id } }));
      if (it.worn) acts.push(button("Take off", async () => { const r = await verbs.takeOff(this.game, it.slot, it.label); res.show(r); if (r.ok) setTimeout(() => this.reload(), 900); }, { data: { takeoff: it.id } }));
      if (it.category === "phone") acts.push(button("Use this phone", async () => { const r = await verbs.switchPhone(this.game, it.id, it.label); res.show(r); if (r.ok) setTimeout(() => this.reload(), 900); }));
      else if (it.usable || it.category === "phone_case") acts.push(button(it.category === "phone_case" ? "Put it on your phone" : "Use", async () => { const r = await verbs.use(this.game, it.id, it.label); res.show(r); if (r.ok) setTimeout(() => this.reload(), 1200); }, { data: { use: it.id } }));
      out.push(el("div", { class: "card item", dataset: { item: it.id } },
        el("div", { class: "offer-head" }, el("strong", null, `${it.label}${it.count > 1 ? ` ×${it.count}` : ""}`), it.worn ? el("span", { class: "badge open" }, "wearing") : null),
        hint([titleCase(it.category), it.slot ? `worn as ${it.slot}` : "", it.condition ? it.condition : ""].filter(Boolean).join(" · ")),
        acts.length ? el("div", { class: "row" }, acts) : null, res));
    }
    return out;
  }

  // ---------------------------------------------------------------- Pets
  pets(d) {
    const w = this.world, out = [], mine = d.pets || [];
    if (mine.length) {
      for (const p of mine) {
        const res = resultLine();
        const care = (d.care || []).filter(a => !Array.isArray(a.species) || !a.species.length || a.species.includes(p.species));
        out.push(el("div", { class: "card pet", dataset: { pet: p.id } }, eyebrow(`${p.kind}${p.breed ? ` · ${p.breed}` : ""}`), el("h3", null, p.name),
          hint([p.age, p.home ? `lives at ${p.home}` : "", p.sick ? (p.illness ? `sick: ${p.illness}` : "seems unwell") : "", p.vaccinated ? `vaccinated until ${shortWhen(p.vaccinated_until)}` : "not vaccinated"].filter(Boolean).join(" · ")),
          Object.entries(p.needs || {}).map(([k, v]) => meter(titleCase(k), v)), typeof p.bond === "number" ? meter("Your bond", p.bond) : null,
          care.length ? el("div", { class: "grid2" }, care.map(a => button(`${a.label}${a.where === "home" ? "" : " (outdoors)"}`, async () => { const r = await verbs.petCare(this.game, p.id, a.id); res.show(r); if (r.ok) setTimeout(() => this.reload(), 1200); }))) : null,
          hint("Care at home happens inside your home; walks start from your street."), res));
      }
    } else out.push(hint("No pets yet. The shelter has animals looking for a home."));
    const s = d.shelter;
    if (s) {
      const place = w.placeById.get(s.id);
      out.push(el("div", { class: "card shelter" }, eyebrow("Adopt"), el("h3", null, s.name),
        el("div", { class: "row" }, el("span", { class: `badge ${s.open ? "open" : "closed"}` }, s.open ? "open now" : "closed now"), s.hours ? el("span", { class: "hint" }, `open ${hoursText(s.hours)}`) : null),
        el("ul", { class: "list" }, (s.animals || []).map(a => el("li", { dataset: { animal: a.id } },
          el("div", { class: "offer-head" }, el("strong", null, a.name), el("span", { class: "price" }, money(a.fee_cents))),
          hint([a.kind, a.breed, a.age, a.brought_back ? "brought back to the shelter" : ""].filter(Boolean).join(" · ")),
          place ? button(s.open ? `Adopt ${a.name}` : `Adopt ${a.name} (closed now)`, () => this.away(() => insideThen(this.game, place, () => verbs.adopt(this.game, a.id))), { data: { adopt: a.id }, disabled: !s.open }) : null))),
        hint(`You adopt in person, inside the shelter while it's open${s.hours ? ` (${hoursText(s.hours)})` : ""}; Adopt walks you there first. You need a home to bring a pet to.`)));
    }
    const v = d.vet;
    if (v) {
      const place = w.placeById.get(v.id);
      out.push(el("div", { class: "card" }, eyebrow("The vet"), el("h3", null, v.name),
        el("div", { class: "row" }, el("span", { class: `badge ${v.open ? "open" : "closed"}` }, v.open ? "open now" : "closed now"), v.hours ? el("span", { class: "hint" }, `open ${hoursText(v.hours)}`) : null),
        el("ul", { class: "list" }, (v.services || []).map(sv => el("li", null, el("div", { class: "offer-head" }, el("span", null, sv.label), el("span", { class: "price" }, money(sv.price_cents))),
          mine.length && place ? el("div", { class: "row" }, mine.map(p => button(`${p.name}`, () => this.away(() => insideThen(this.game, place, () => verbs.vet(this.game, p.id, sv.id))), { disabled: !v.open }))) : null))),
        mine.length ? hint("Tap a pet's name to take them in for that.") : hint("For your pets, once you have one.")));
    }
    return out;
  }

  // ---------------------------------------------------------------- Studio
  studio(d) {
    const yours = d.yours || [], chart = (d.chart || []).filter(s => s && s.id);
    const song = (s, own) => {
      const res = resultLine();
      return el("li", { dataset: { song: s.id } },
        el("div", { class: "offer-head" }, el("strong", null, s.title), el("span", { class: "hint" }, s.released ? `${s.plays} plays` : "not released")),
        hint([s.by, s.bpm ? `${s.bpm} bpm` : "", s.duration_seconds ? `${Math.round(s.duration_seconds)} s` : ""].filter(Boolean).join(" · ")),
        el("div", { class: "row" },
          button("Perform here", async () => { const r = await verbs.perform(this.game, s.id); res.show(r); }, { primary: true }),
          own && !s.released ? button("Release", async () => { const r = await verbs.release(this.game, s.id); res.show(r); if (r.ok) setTimeout(() => this.reload(), 1000); }) : null),
        res);
    };
    return [
      card(eyebrow("You"), meter("Music skill", d.music_skill || 0)),
      card(eyebrow("Your songs"), yours.length ? el("ul", { class: "list" }, yours.map(s => song(s, true))) : hint("No songs yet."),
        el("p", { class: "notice" }, "Writing and recording songs isn't in the web client yet. Perform needs a stage: an open mic, the church, the park or a club (the server checks where you stand).")),
      card(eyebrow("The town chart"), chart.length ? el("ol", { class: "list" }, chart.map(s => song(s, false))) : hint("Nothing released yet.")),
    ];
  }

  // ---------------------------------------------------------------- Wallet and Store
  wallet(d) {
    const ph = d.phone || {}, lp = d.livpay || {}, solo = browserTown();
    const out = [card(eyebrow("Your phone"), el("h3", null, ph.label || "Phone"), meter("Battery", ph.battery || 0, { text: `${Math.round(ph.battery || 0)}%` }),
      hint([ph.hours_left != null ? `about ${Math.round(ph.hours_left)} h left` : "", ph.charging ? `charges ${ph.charging === "home" ? "at home" : `at ${ph.charging}`}` : "", ph.case ? `in a ${String(ph.case).replace(/_/g, " ")}` : ""].filter(Boolean).join(" · ")))];
    for (const sp of d.spare_phones || []) {
      const res = resultLine(), id = sp.item || sp.model || sp.id;
      out.push(card(eyebrow("Spare phone"), el("strong", null, sp.label || titleCase(id)), id ? button("Use this phone", async () => { const r = await verbs.switchPhone(this.game, id, sp.label); res.show(r); if (r.ok) setTimeout(() => this.reload(), 900); }) : null, res));
    }
    out.push(card(eyebrow("Money"), pairs([["Bank", el("span", { class: "money" }, money(d.bank_cents))], ["Cash", el("span", { class: "money" }, money(d.cash_cents))]])));
    out.push(card(eyebrow("LivPay"), hint(readable(lp.protection || "")), pairs([["Sent today", el("span", { class: "money" }, `${money(lp.sent_today_cents || 0)} of ${money(lp.daily_limit_cents || 0)}`)],
      ["Per transfer", el("span", { class: "money" }, `up to ${money(lp.per_transfer_limit_cents || 0)}`)]]),
      hint("Send with LivPay from a person's card."), (lp.recent || []).length ? generic(lp.recent, 1) : null));
    out.push(card(eyebrow("Coins"), el("p", null, `${d.coins || 0} coins`),
      solo ? hint("No coin store here: this town runs in your browser and nothing in it is sold for real money.")
        : [d.payments && d.payments.message ? el("p", { class: "notice" }, readable(d.payments.message)) : null,
          (d.coin_packs || []).length ? el("ul", { class: "list" }, d.coin_packs.map(p => el("li", null, el("div", { class: "offer-head" }, el("span", null, `${p.label} · ${p.coins} coins`), el("span", { class: "price" }, p.price))))) : null]));
    return out;
  }
  store(d) {
    if (browserTown()) return [hint("No coin store here: this town runs in your browser and nothing in it is sold for real money.")];
    const items = d.items || [];
    return [
      card(eyebrow("Coins"), el("p", null, `${d.coins || 0} coins`), d.rules ? hint(readable(d.rules)) : null, d.payments && d.payments.message ? el("p", { class: "notice" }, readable(d.payments.message)) : null),
      ...items.map(it => {
        const res = resultLine();
        return el("div", { class: "card" }, el("div", { class: "offer-head" }, el("strong", null, it.label), el("span", { class: "price" }, `${it.coin_price} coins`)),
          hint([titleCase(it.category), it.slot ? `worn as ${it.slot}` : "", it.style ? `style ${it.style}` : "", it.owned ? `you have ${it.owned}` : ""].filter(Boolean).join(" · ")),
          it.affordable ? button(`Buy for ${it.coin_price} coins`, async () => { const r = await verbs.buyWithCoins(this.game, it.item); res.show(r); if (r.ok) setTimeout(() => this.reload(), 1000); }, { primary: true }) : hint("Not enough coins."), res);
      })];
  }

  // ---------------------------------------------------------------- Alerts, Romance, Family
  notifications(d) {
    const list = Array.isArray(d.notifications) ? d.notifications.filter(n => n && typeof n === "object") : [];
    if (!list.length) return [hint("No alerts yet.")];
    return [el("ul", { class: "list alerts" }, list.map(n => el("li", { class: n.unread ? "unread" : "" },
      el("div", { class: "offer-head" }, eyebrow(titleCase(n.kind || "news")), el("span", { class: "hint" }, shortWhen(n.when || ""))),
      el("p", null, sentence(withoutCliHint(n.text))), n.unread ? el("span", { class: "badge open" }, "new") : null)))];
  }

  // Asks still waiting for your answer can be answered here too (an ask's sheet can be closed or
  // replaced by another sheet).
  romance(d) {
    const asks = Array.isArray(d.waiting_for_your_answer) ? d.waiting_for_your_answer.filter(q => q && q.id) : [];
    const answer = async (q, accept, err) => {
      const r = await this.game.respond(q.id, accept);
      if (!r.ok && r.error.code !== "unknown_request") { err.textContent = sentence(r.error.message); return; }
      const sheet = this.ui.sheet;
      if (sheet && sheet.kind === "request" && sheet.id === q.id) this.ui.closeSheet();
      if (this.app === "romance") this.openApp("romance");
    };
    const rels = d.relationships || [], kids = d.children || [];
    return [
      el("div", { class: "card" }, eyebrow("Waiting for your answer"),
        asks.length ? el("ul", { class: "list" }, asks.map(q => {
          const err = el("p", { class: "err", role: "alert" });
          return el("li", { dataset: { ask: q.id } },
            el("div", { class: "offer-head" }, el("span", null, q.name || this.world.nameOf(q.from)), el("span", { class: "hint" }, titleCase(q.kind))),
            el("div", { class: "row" },
              el("button", { type: "button", class: "btn primary grow", onclick: () => answer(q, true, err) }, "Accept"),
              el("button", { type: "button", class: "btn grow", onclick: () => answer(q, false, err) }, "Decline")),
            err);
        })) : hint("No asks waiting.")),
      card(eyebrow("Your relationships"), rels.length ? el("ul", { class: "list" }, rels.map(r => el("li", null,
        el("div", { class: "row" }, avatar(r.id, r.name), el("div", { class: "grow" }, el("strong", null, r.name), hint(`${titleCase(r.status)} since ${shortWhen(r.since)}`)))))) : hint("Nobody yet: dating, engagements and marriages show up here."),
        rels.length ? hint("Ending a relationship isn't in the web client yet.") : null),
      d.pregnancy ? card(eyebrow("Pregnancy"), pairs([["Due", shortWhen(d.pregnancy.due)], ["Weeks", String(d.pregnancy.weeks)], ["Prenatal visits", String(d.pregnancy.prenatal_visits)]])) : null,
      kids.length ? card(eyebrow("Your children"), el("ul", { class: "list" }, kids.map(k => el("li", null, `${k.name}, ${k.age} (${String(k.life_stage || "").replace(/_/g, " ")})`)))) : null,
      browserTown() ? hint("Founders on autopilot say no to every ask in this build.") : null,
    ];
  }
  family(d) {
    const rest = { ...d };
    delete rest.care_routines;
    return [el("p", { class: "notice" }, "Caring for children, naming a baby, daycare, school and nannies aren't in the web client yet. What the game knows about your family:"),
      generic(rest), (d.care_routines || []).length ? card(eyebrow("Care routines the game has"), hint(d.care_routines.map(r => r.label).join(", "))) : null];
  }

  // ---------------------------------------------------------------- Town: weather, city, fame, school, goals
  weather(d) {
    const day = x => (x ? `${titleCase(x.label || x.kind || "")}${typeof x.temp_c === "number" ? `, ${Math.round(x.temp_c)}°C` : ""}` : "no forecast yet");
    return [card(eyebrow("Weather"), pairs([["Today", day(d.today)], ["Tomorrow", day(d.tomorrow)],
      typeof d.umbrella === "boolean" ? ["Umbrella", d.umbrella ? "you have one" : "you don't have one"] : null,
      d.changes_at ? ["New forecast", `at ${d.changes_at}`] : null])),
      !d.today ? hint("The forecast comes with the next hour.") : null];
  }
  city(d) {
    return [card(eyebrow(`Stage ${d.stage}`), el("h3", null, d.stage_name || "The town"), generic(d.stats || {})),
      card(eyebrow("Being built"), (d.construction || []).map(p => meter(p.name, p.progress_pct, { text: p.status === "complete" ? "done" : p.status === "planned" ? "planned" : `${p.progress_pct}%` })))];
  }
  fame(d) {
    const next = d.next_tier;
    return [card(eyebrow("Fame"), el("h3", null, d.tier || ""), next ? meter(`To ${next.label}`, d.fame, { max: next.at, text: `${Math.round(d.fame)} of ${next.at}` }) : meter("Fame", d.fame),
      hint("Fame comes from performing to a crowd, releasing songs, league matches, a wedding, and crimes that make the news."))];
  }
  school(d) {
    const e = d.enrolled, programs = d.programs || [];
    return [
      card(eyebrow("Your degrees"), (d.degrees || []).length ? el("p", null, d.degrees.join(", ")) : hint("None yet.")),
      e ? card(eyebrow("Studying"), el("h3", null, e.program), meter("Hours", e.hours, { max: e.hours_required, text: `${e.hours} of ${e.hours_required}` }),
        meter("Average grade", e.average_grade, { text: `${e.average_grade} (need ${e.min_grade})` }), hint(e.studying ? "Studying now." : "Start and end study sessions at the campus.")) : null,
      card(eyebrow("Programs"), el("ul", { class: "list" }, programs.map(p => el("li", null,
        el("div", { class: "offer-head" }, el("strong", null, p.name), el("span", { class: "price" }, `${money(p.tuition_per_hour_cents)}/hr`)),
        hint([`${p.hours_required} hours`, (p.campuses || []).join(", "), p.online ? "can be studied online (not in the web client yet)" : "", p.eligible ? "open to you" : "not open to you yet"].filter(Boolean).join(" · "))))),
        hint("Enroll at the campus: its card lists the programs you can join. Dropping out isn't in the web client yet.")),
    ];
  }
  goalsApp(d) {
    const step = s => el("li", { class: s.done ? "done" : "" }, s.done ? icon("check") : null, el("span", null, s.label), s.progress ? el("span", { class: "hint" }, ` · ${s.progress}`) : null);
    return [
      card(eyebrow(`Today · ${d.done_today || 0} of ${(d.today || []).length} done`), el("ul", { class: "list goals" }, (d.today || []).map(step))),
      card(eyebrow("What you're working toward"), el("ul", { class: "list" }, (d.aspirations || []).map(a => el("li", null, el("strong", null, a.label),
        a.tracked === false ? hint(`Not tracked: ${readable(a.reason || "")}`) : [a.next ? hint(`Next: ${a.next}${a.detail ? ` · ${a.detail}` : ""}`) : hint("Done."), el("ul", { class: "steps" }, (a.steps || []).map(step))])))),
      d.note ? hint(readable(d.note)) : null,
    ];
  }
}

// The app screens: an app missing here is shown through generic().
const SCREENS = {
  bank(d) { return this.bank(d); },
  async messages(d) { await this.loadPeople(); return this.messages(d); },
  map(d) { return this.map(d); }, transit(d) { return this.transit(d); }, career(d) { return this.career(d); },
  work(d) { return this.work(d); }, calendar(d) { return this.calendar(d); }, contacts(d) { return this.contacts(d); },
  jobs(d) { return this.jobs(d); }, homes(d) { return this.homes(d); }, sports(d) { return this.sports(d); }, items(d) { return this.items(d); },
  pets(d) { return this.pets(d); }, studio(d) { return this.studio(d); }, wallet(d) { return this.wallet(d); }, store(d) { return this.store(d); },
  notifications(d) { return this.notifications(d); }, romance(d) { return this.romance(d); }, family(d) { return this.family(d); },
  weather(d) { return this.weather(d); }, city(d) { return this.city(d); }, fame(d) { return this.fame(d); }, school(d) { return this.school(d); },
  goals(d) { return this.goalsApp(d); },
  story(d) { return storyScreen.call(this, d); },  // moments.js (D-068)
  social(d) { return socialScreen.call(this, d); },  // social.js (D-074)
  record(d) {
    const list = Array.isArray(d.record) ? d.record : [];
    return [card(eyebrow("Criminal record"), el("h3", null, d.clean || !list.length ? "Clean" : `${list.length} on record`),
      d.wanted ? el("p", { class: "notice" }, "The police are looking for you.") : null,
      d.jailed_until ? el("p", { class: "notice" }, `In a cell until ${shortWhen(d.jailed_until)}.`) : null,
      list.length ? generic(list, 1) : hint("Nothing on your record. What you're caught for ends up here, with the fine or the time served."))];
  },
};

// "Lakeview Condos, Unit 1A, Willow Lane" under the title "Lakeview Condos, Unit 1A": just "Willow Lane".
const addressOnly = h => (h.address && h.name && h.address.startsWith(h.name + ", ") ? h.address.slice(h.name.length + 2) : h.address || "");
function pick(o, keys) { const out = {}; for (const k of keys) if (o && k in o) out[k] = o[k]; return out; }

// A routine's lines for a weekday, by the autopilot's rule (src/core/Autopilot.cpp scheduleEntries):
// the weekdays (Mon–Fri) or weekend lines, then the day's own lines, which win at the same time.
export function routineFor(schedule, weekday) {
  const out = new Map();
  if (!schedule || typeof schedule !== "object") return [];
  const general = weekday < 5 ? "weekdays" : "weekends";
  const day = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][weekday];
  for (const name of [general, general.slice(0, -1), day]) {
    for (const e of Array.isArray(schedule[name]) ? schedule[name] : []) {
      const m = e && typeof e.time === "string" && e.time.match(/^(\d{1,2}):(\d{2})$/);
      if (m) out.set(Number(m[1]) * 60 + Number(m[2]), String(e.activity || ""));
    }
  }
  return [...out].sort((a, b) => a[0] - b[0]);
}

// A place a line of text names ("Gym or a run in Founders Park", "networking at Heritage Coffee"):
// a place's full name, or the first two words of it when no other place starts the same way.
function placeInText(world, text) {
  const t = String(text || "").toLowerCase();
  let best = null;
  const prefixes = new Map();
  for (const p of world.places) {
    const words = p.name.split(/\s+/);
    if (words.length >= 2) { const k = words.slice(0, 2).join(" ").toLowerCase(); prefixes.set(k, (prefixes.get(k) || 0) + 1); }
  }
  for (const p of world.places) {
    if (["construction_site", "apartment", "condo", "house", "townhouse"].includes(p.type)) continue;
    const name = p.name.toLowerCase(), words = p.name.split(/\s+/), two = words.slice(0, 2).join(" ").toLowerCase();
    const hit = t.includes(name) ? name.length : (words.length > 2 && prefixes.get(two) === 1 && t.includes(two) ? two.length : 0);
    if (hit && (!best || hit > best.hit)) best = { p, hit };
  }
  return best ? best.p : null;
}

// ------------------------------------------------------------------ any app: the server's answer, readable

// Keys that are ids or internal bookkeeping: never shown.
const HIDE = new Set(["id", "door", "property", "task", "option", "minute", "daylight", "product_id", "midi_program", "drums", "tx", "location",
  "species", "team", "pet", "owner", "phase", "price_usd_cents"]);
// Keys whose number is a game minute (a moment): shown as a time.
const MINUTE_KEYS = new Set(["at", "kickoff", "next_kickoff", "next_at", "ready_at", "due_at", "since_at"]);
// Yes/no in words, where the key says what it means.
const BOOL_WORDS = {
  online: ["in town now", "not around"], unread: ["new", "read"], eligible: ["you qualify", "not yet"], open: ["open now", "closed now"],
  lives_here: ["you live here", "no"], released: ["released", "not released"], worn: ["wearing it", "no"], on_shift: ["on shift", "off shift"],
  answered: ["answered", "not yet"], clean: ["clean", "not clean"], done: ["done", "not yet"], tracked: ["the game follows it", "not tracked"],
  sick: ["sick", "healthy"], studying: ["studying now", "no"], supervised: ["looked after", "on their own"], low: ["low", "fine"],
  yours: ["yours", "not yours"], brought_back: ["brought back", "new to the shelter"], affordable: ["you can afford it", "not enough coins"],
  available: ["available", "not available"], best_call: ["best call", "not the best call"],
};
const PROSE = ["prompt", "text", "note", "message", "description", "rules", "reason", "detail"];
const TITLE_KEYS = ["name", "label", "title"];
const isScale = (o, keys = Object.keys(o)) => keys.length >= 2 && keys.every(k => typeof o[k] === "number" && o[k] >= 0 && o[k] <= 100);
const word = s => (/^[a-z]+(?:_[a-z]+)+$/.test(s) ? s.replace(/_/g, " ") : s);

const UNITS = { _cm: " cm", _kg: " kg", _km: " km", _pct: "%", _c: "°C" };
const unitOf = k => Object.keys(UNITS).find(u => k.endsWith(u));
const LABELS = { bmi: "BMI", bmi_category: "BMI category", temp_c: "Temperature", your_feelings: "How you feel", hours_at_level: "Hours at this level" };
function valueText(k, v) {
  if (typeof v === "boolean") return (BOOL_WORDS[k] || ["yes", "no"])[v ? 0 : 1];
  if (typeof v === "number") {
    if (/_cents$/.test(k)) return money(v);
    if (MINUTE_KEYS.has(k)) return minuteWhen(v);
    if (/_minutes$/.test(k)) return duration(v);
    const n = Math.round(v * 10) / 10, u = unitOf(k);
    return (Math.abs(n) >= 1000 ? n.toLocaleString("en-US") : String(n)) + (u ? UNITS[u] : "");
  }
  if (typeof v === "string") {
    if (isLongWhen(v)) return shortWhen(v);
    return readable(word(v));
  }
  return String(v);
}
function label(k) {
  if (LABELS[k]) return LABELS[k];
  const u = unitOf(k);
  return titleCase(k.replace(/_cents$/, "").replace(/_name$/, "").replace(/_minutes$/, "").slice(0, u && !/_cents$|_minutes$/.test(k) ? k.length - u.length : undefined));
}

// Any app: the server's answer as labelled fields, nested cards for lists. Ids and internal keys
// are hidden; times, money, durations and yes/no are worded; 0–100 stats are bars with their
// number; empty lists say "none yet". All text goes in as text nodes.
export function generic(d, depth = 0) {
  if (d === null || d === undefined || d === "") return el("span", { class: "hint" }, "none yet");
  if (typeof d !== "object") return el("span", null, valueText("", d));
  if (Array.isArray(d)) {
    if (!d.length) return el("span", { class: "hint" }, "none yet");
    if (d.every(x => typeof x !== "object" || x === null)) return el("span", null, d.map(x => valueText("", x)).join(", "));
    if (depth >= 2) return el("span", null, d.slice(0, 12).map(x => summaryText(x)).join("; "));
    return el("div", { class: "stack" }, d.slice(0, 50).map(x => el("div", { class: "card json" }, typeof x === "object" && x ? generic(x, depth + 1) : valueText("", x))));
  }
  const keys = Object.keys(d).filter(k => !HIDE.has(k) && !/(^|_)id$/.test(k)
    && !(MINUTE_KEYS.has(k) && ("when" in d || `${k}_text` in d))       // the server also sent it as text
    && !(`${k}_name` in d));                                            // an id with its name beside it
  if (!keys.length) return el("span", { class: "hint" }, "nothing here");
  if (isScale(d, keys)) return el("div", { class: "meters" }, keys.map(k => meter(label(k), d[k])));
  if (depth > 3) return el("span", null, summaryText(d));
  const title = TITLE_KEYS.find(k => typeof d[k] === "string" && keys.includes(k));
  const prose = keys.filter(k => PROSE.includes(k) && typeof d[k] === "string" && d[k]);
  const rest = keys.filter(k => k !== title && !prose.includes(k));
  return el("div", { class: "json-obj" },
    title && depth > 0 ? el("strong", { class: "json-title" }, valueText(title, d[title])) : null,
    prose.map(k => el("p", { class: k === "note" || k === "rules" ? "hint" : "json-prose" }, readable(d[k]))),
    rest.length || (title && depth === 0) ? el("dl", { class: `kv json${depth > 0 ? " nested" : ""}` }, [...(title && depth === 0 ? [title] : []), ...rest].flatMap(k => {
      const v = d[k];
      let dd;
      if (k === "hours" && Array.isArray(v) && v.length === 2 && v.every(n => typeof n === "number")) dd = hoursText(v);
      else if (k === "ages" && Array.isArray(v) && v.length === 2) dd = `${v[0]}–${v[1]}`;
      else if (v && typeof v === "object") dd = generic(v, depth + 1);
      else if (v === "" || v === null || v === undefined) dd = el("span", { class: "hint" }, "none yet");
      else dd = /_cents$/.test(k) && typeof v === "number" ? el("span", { class: "money" }, money(v)) : valueText(k, v);
      return [el("dt", null, label(k)), el("dd", null, dd)];
    })) : null);
}
// One line for an object too deep to show as fields.
function summaryText(x) {
  if (!x || typeof x !== "object") return valueText("", x);
  const title = TITLE_KEYS.map(k => x[k]).find(v => typeof v === "string");
  const bits = Object.entries(x).filter(([k, v]) => !HIDE.has(k) && !/(^|_)id$/.test(k) && !TITLE_KEYS.includes(k) && v !== null && typeof v !== "object" && v !== "")
    .slice(0, 4).map(([k, v]) => `${label(k).toLowerCase()} ${valueText(k, v)}`);
  return [title, ...bits].filter(Boolean).join(", ");
}
