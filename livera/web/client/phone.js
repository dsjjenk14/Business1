// The phone: every app the server has, as a home screen of cards. Bank, messages, map,
// transit and career have their own screens; the other apps show the server's answer as
// readable cards (every field it sends, labelled), so nothing is hidden or invented.

import { el, replace, money, avatar, firstName, titleCase } from "./dom.js";
import { typeName } from "./layout.js";
import { dist } from "./state.js";

// The apps World::openPhoneApp answers (src/core/World.cpp). The server has no app list op,
// so this is the one list the client keeps; an unknown app is refused with `unknown_app`.
export const APPS = [
  ["bank", "Bank", "$"], ["messages", "Messages", "✉"], ["map", "Map", "⌖"], ["transit", "Transit", "⇄"], ["career", "Career", "★"],
  ["contacts", "Contacts", "☺"], ["calendar", "Calendar", "▦"], ["notifications", "Alerts", "!"], ["wallet", "Wallet", "◈"],
  ["work", "Work", "⚒"], ["jobs", "Jobs", "✎"], ["homes", "Homes", "⌂"], ["property", "Property", "⌂"], ["health", "Health", "✚"],
  ["items", "Items", "◫"], ["store", "Store", "◇"], ["school", "School", "✐"], ["studio", "Studio", "♪"], ["record", "Record", "≡"],
  ["romance", "Romance", "♥"], ["family", "Family", "✿"], ["fame", "Fame", "✦"], ["sports", "Sports", "◎"], ["pets", "Pets", "☘"],
  ["weather", "Weather", "☁"], ["city", "City", "▲"],
];
const MAIN = new Set(["bank", "messages", "map", "transit", "career"]);
const VS = "︎";  // text presentation: these glyphs must not turn into emoji

export class Phone {
  constructor({ world, game, ui }) {
    this.world = world; this.game = game; this.ui = ui;
    this.root = document.getElementById("phone");
    this.app = null;
    this.unread = 0;
  }
  get open() { return !this.root.hidden; }

  show(app) {
    this.root.hidden = false;
    if (app) this.openApp(app); else this.home();
  }
  close() { this.root.hidden = true; replace(this.root); this.app = null; }

  frame(title, onBack, ...content) {
    const back = el("button", { type: "button", class: "iconbtn", "aria-label": onBack ? "Back to apps" : "Close phone", onclick: () => (onBack ? onBack() : this.close()) }, onBack ? "‹" : "✕");
    const close = onBack ? el("button", { type: "button", class: "iconbtn", "aria-label": "Close phone", onclick: () => this.close() }, "✕") : null;
    replace(this.root, el("div", { class: "phone-head" }, back, el("h2", null, title), close),
      el("div", { class: "phone-body" }, el("div", { class: "phone-inner" }, content)));
  }

  home() {
    this.app = null;
    this.frame("Phone", null,
      el("div", { class: "apps" }, APPS.map(([id, label, glyph]) => el("button", { type: "button", class: `app${MAIN.has(id) ? " main" : ""}`, dataset: { app: id }, onclick: () => this.openApp(id) },
        el("span", { class: "tile", "aria-hidden": "true" }, glyph + VS), label))),
      el("p", { class: "hint" }, "Every app asks the server; a flat battery opens nothing (charge at home or at work)."));
  }

  async openApp(id) {
    this.app = id;
    const label = (APPS.find(a => a[0] === id) || [id, titleCase(id)])[1];
    const body = el("div", { class: "stack" }, el("p", { class: "hint" }, "Opening…"));
    this.frame(label, () => this.home(), body);
    const r = await this.game.phone(id);
    if (this.app !== id) return;
    if (!r.ok) { replace(body, el("p", { class: "err", role: "alert" }, r.error.message)); return; }
    const d = r.data;
    const render = { bank: () => this.bank(d), messages: () => this.messages(d), map: () => this.map(d), transit: () => this.transit(d), career: () => this.career(d) }[id];
    replace(body, render ? render() : generic(d));
  }

  bank(d) {
    if (typeof d.bank_cents === "number") this.world.money = { bank_cents: d.bank_cents, cash_cents: d.cash_cents };
    return [
      el("div", { class: "card" }, el("div", { class: "eyebrow" }, "Balances"),
        el("dl", { class: "kv" }, el("dt", null, "Bank"), el("dd", { class: "money" }, money(d.bank_cents)), el("dt", null, "Cash"), el("dd", { class: "money" }, money(d.cash_cents)),
          d.rent_arrears_cents ? [el("dt", null, "Rent owed"), el("dd", { class: "money" }, money(d.rent_arrears_cents))] : null)),
      el("div", { class: "card" }, el("div", { class: "eyebrow" }, "Recent"),
        (d.recent || []).length ? el("div", null, d.recent.map(t => el("div", { class: "tx" },
          el("div", null, el("div", null, t.memo || titleCase(t.kind)), el("div", { class: "hint" }, `${t.when || ""} · ${t.account}`)),
          el("div", { class: `amt money ${t.amount_cents < 0 ? "neg" : "pos"}` }, (t.amount_cents > 0 ? "+" : "") + money(t.amount_cents)))))
          : el("p", { class: "hint" }, "No transactions yet.")),
    ];
  }

  messages(d) {
    const w = this.world, me = w.selfId, threads = d.threads && typeof d.threads === "object" ? d.threads : {};
    this.unread = 0; this.game.setPhoneBadge(0);
    const ids = Object.keys(threads);
    const out = [];
    const to = el("input", { type: "text", class: "input", placeholder: "Character id (for example maya)", "aria-label": "To", autocapitalize: "none", autocomplete: "off" });
    const text = el("input", { type: "text", class: "input", maxlength: "500", placeholder: "Message", "aria-label": "Message" });
    const err = el("p", { class: "err", role: "alert" });
    const send = async (toId, input, errNode, after) => {
      const body = input.value.trim();
      if (!toId || !body) return;
      const r = await this.game.message(toId, body);
      if (!r.ok) { errNode.textContent = r.error.message; return; }
      input.value = ""; errNode.textContent = ""; after();
    };
    out.push(el("form", { class: "card", onsubmit: e => { e.preventDefault(); send(to.value.trim().toLowerCase(), text, err, () => this.openApp("messages")); } },
      el("div", { class: "eyebrow" }, "New message"), to, text, err, el("button", { type: "submit", class: "btn primary" }, "Send")));
    if (!ids.length) out.push(el("p", { class: "hint" }, "No messages yet."));
    for (const other of ids) {
      const msgs = threads[other] || [];
      const reply = el("input", { type: "text", class: "input", maxlength: "500", placeholder: `Reply to ${firstName(w.nameOf(other))}`, "aria-label": "Reply" });
      const rerr = el("p", { class: "err", role: "alert" });
      out.push(el("div", { class: "card", dataset: { thread: other } },
        el("div", { class: "row" }, avatar(other, w.nameOf(other)), el("h3", { class: "grow" }, w.nameOf(other))),
        el("div", { class: "thread" }, msgs.slice(-30).map(m => el("div", { class: `msg${m.from === me ? " me" : ""}` }, m.body, el("span", { class: "when" }, m.when || "")))),
        el("form", { class: "row", onsubmit: e => { e.preventDefault(); send(other, reply, rerr, () => this.openApp("messages")); } },
          el("div", { class: "grow" }, reply), el("button", { type: "submit", class: "btn" }, "Send")), rerr));
    }
    return out;
  }

  map(d) {
    const w = this.world, me = w.selfPos();
    const groups = new Map();
    for (const b of w.buildings) { const k = b.district || "Elsewhere"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
    for (const p of w.places.filter(p => p.type === "park")) { const k = p.district || "Elsewhere"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push({ ...p, enterable: false }); }
    const out = [el("p", { class: "hint" }, `${(d.places || []).length} places in town, from the server's map. Distances are from where you stand.`)];
    for (const [district, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
      list.sort((a, b) => dist(me, a.door) - dist(me, b.door));
      out.push(el("div", { class: "card" }, el("div", { class: "eyebrow" }, district), el("ul", { class: "list" }, list.map(b => el("li", null,
        el("div", { class: "offer-head" }, el("span", null, b.name), el("span", { class: "hint" }, me ? `${Math.round(dist(me, b.door))} m` : "")),
        el("div", { class: "hint" }, `${typeName(b.shape || b.type)}${b.status && b.status !== "open" ? " · " + b.status.replace(/_/g, " ") : ""}`),
        el("div", { class: "row" },
          el("button", { type: "button", class: "btn small", onclick: () => { this.close(); this.game.showPlace(b.id); } }, "Show"),
          el("button", { type: "button", class: "btn small", onclick: () => { this.close(); this.game.walkTo(b.door); } }, "Walk there")))))));
    }
    return out;
  }

  transit(d) {
    const w = this.world, me = w.selfPos();
    if (!w.transit && Array.isArray(d.lines)) w.setTransit(d.lines);
    return (w.transit || []).map(l => el("div", { class: "card" },
      el("h3", null, l.name),
      el("p", { class: "hint" }, `Fare ${money(l.fare_cents)}${l.first_hour != null ? ` · runs ${l.first_hour}:00–${l.last_hour}:00` : ""}`),
      el("ul", { class: "list" }, l.stops.map(s => el("li", null,
        el("div", { class: "offer-head" }, el("span", null, s.name), el("span", { class: "hint" }, me ? `${Math.round(dist(me, s.at))} m` : "")),
        el("div", { class: "row" },
          el("button", { type: "button", class: "btn small", onclick: () => { this.close(); this.game.showStop(s.id); } }, "Ride from here"),
          el("button", { type: "button", class: "btn small", onclick: () => { this.close(); this.game.walkTo(s.at); } }, "Walk to stop"))))),
      el("p", { class: "hint" }, "Single-rider shuttle for now: shared buses on a timetable come later.")));
  }

  career(d) {
    if (!d.career) return [el("p", { class: "hint" }, "No career yet. The jobs app lists openings.")];
    this.world.career = d;
    const pct = d.hours_to_promote ? Math.min(100, (d.hours_at_level / d.hours_to_promote) * 100) : 0;
    return [el("div", { class: "card" },
      el("div", { class: "eyebrow" }, d.career), el("h3", null, d.title),
      el("dl", { class: "kv" },
        el("dt", null, "Pay"), el("dd", { class: "money" }, `${money(d.hourly_cents)}/hr`),
        el("dt", null, "Performance"), el("dd", null, `${d.performance} (need ${d.min_performance} to be promoted)`),
        el("dt", null, "Toward promotion"), el("dd", null, `${d.hours_at_level} of ${d.hours_to_promote} hours`),
        el("dt", null, "Earned so far"), el("dd", { class: "money" }, money(d.lifetime_earnings_cents)),
        el("dt", null, "Works at"), el("dd", null, (d.workplaces || []).join(", ")),
        el("dt", null, "On shift"), el("dd", null, d.on_shift ? "yes" : "no")),
      el("div", { class: "bars" }, el("span", null, "Promotion"), el("div", { class: "bar" }, el("span", { style: { width: `${pct}%` } })), el("span", null, `${Math.round(pct)}%`)),
      el("p", { class: "hint" }, "Start and end shifts inside your workplace (its scene card has the buttons)."),
      el("div", { class: "eyebrow" }, "The ladder"), el("ol", null, (d.ladder || []).map((t, i) => el("li", { style: i === d.level ? { color: "var(--gold)", fontWeight: "600" } : null }, t))))];
  }
}

// Any app: the server's answer as labelled fields, nested cards for lists. Keys ending in
// _cents read as money. All text goes in as text nodes.
export function generic(d, depth = 0) {
  if (d === null || d === undefined) return el("span", { class: "hint" }, "—");
  if (typeof d !== "object") return el("span", null, typeof d === "boolean" ? (d ? "yes" : "no") : String(d));
  if (Array.isArray(d)) {
    if (!d.length) return el("span", { class: "hint" }, "none");
    if (d.every(x => typeof x !== "object" || x === null)) return el("span", null, d.map(x => String(x)).join(", "));
    return el("div", { class: "stack" }, d.slice(0, 50).map(x => el("div", { class: "card json" }, generic(x, depth + 1))));
  }
  const entries = Object.entries(d);
  if (!entries.length) return el("span", { class: "hint" }, "nothing here");
  if (depth > 4) return el("span", { class: "hint" }, "…");
  return el("dl", { class: "kv json" }, entries.flatMap(([k, v]) => [
    el("dt", null, titleCase(k.replace(/_cents$/, ""))),
    el("dd", null, /_cents$/.test(k) && typeof v === "number" ? el("span", { class: "money" }, money(v)) : generic(v, depth + 1)),
  ]));
}
