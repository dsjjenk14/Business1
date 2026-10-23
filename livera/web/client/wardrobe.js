// The wardrobe (D-079): your own three looks (everyday, work, going out) as big buttons, each with what it is on you,
// its condition and whether it's what people see you in, then the outfits you bought. A tap sends `wear` through the
// game's request path; the card shows the server's answer, or its refusal in plain words (ui.refusal): not on the
// move, not in a cell or a fight. Everything on the card is the Items app's answer (`phone {app: "items"}`): `looks`,
// `drawn` (the look your art shows) and `look` (the one you're seen in).
//
// What's drawn is said plainly for your own character: a character with a sprite sheet or a model sheet is drawn in
// the look that art shows until a sheet for the other look is made (figures.js draws one as soon as it's cut), a
// townsperson's stand-in changes colours, and a character made in the creator gets a colour per look.
//
// Opened from the You card, from "Change clothes" in the tray inside your own home, and from the Items app.

import { el, replace, titleCase } from "./dom.js";
import { icon } from "./icons.js";
import { sentence } from "./messages.js";
import { artStatus, hasLookArt, loadFigureManifest } from "./figures.js";

(function addStylesheet() {
  if (typeof document === "undefined" || document.querySelector("link[data-wardrobe-css]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./css/wardrobe.css", import.meta.url).href;
  link.dataset.wardrobeCss = "";
  document.head.appendChild(link);
})();

export const LOOK_NAMES = { everyday: "Everyday", work: "Work", evening: "Going out" };
// The look in a sentence: "your going-out look", "your going-out clothes".
const inWords = look => (look === "evening" ? "going-out" : look);
const CONDITION = { clean: "Clean", dirty: "Needs a wash", ruined: "Ruined until it's washed" };
const hint = text => el("p", { class: "hint" }, text);

export class Wardrobe {
  constructor(game) {
    this.game = game;
    this.body = null;
    this.busy = false;
  }

  // The card. `opts.height` as ui.openSheet.
  async open(opts = {}) {
    const ui = this.game.ui;
    const body = el("div", { class: "wardrobe", "aria-busy": "true" }, hint("Opening your wardrobe…"));
    this.body = body;
    ui.openSheet("wardrobe", "wardrobe", ui.head("Wardrobe", "Change clothes"), [body], null, { height: opts.height || "full" });
    await this.refresh();
  }

  async refresh(said = null) {
    const body = this.body;
    if (!body) return;
    const [r] = await Promise.all([this.game.phone("items"), loadFigureManifest()]);
    if (!body.isConnected) return;
    body.removeAttribute("aria-busy");
    if (!r || !r.ok) {
      replace(body, hint("Your wardrobe didn't open. Try again in a moment."));
      if (r) this.game.ui.refusal(r);
      return;
    }
    this.render(body, r.data || {}, said);
  }

  render(body, d, said) {
    const looks = (Array.isArray(d.looks) ? d.looks : []).filter(l => l && LOOK_NAMES[l.look] && typeof l.item === "string");
    if (!looks.length) { replace(body, hint("This town's server doesn't have personal looks yet.")); return; }
    const self = this.game.world.selfId, drawn = LOOK_NAMES[d.drawn] ? d.drawn : null, status = artStatus(self);
    const res = el("p", { class: "wd-result", role: "status", "aria-live": "polite" }, said || "");
    const buttons = looks.map(l => {
      const name = LOOK_NAMES[l.look], unseen = status === "art" && l.look !== drawn && !hasLookArt(self, l.look);
      const btn = el("button", { type: "button", class: `wd-look${l.wearing ? " wearing" : ""}`, dataset: { look: l.look, item: l.item },
        "aria-pressed": String(!!l.wearing), onclick: () => this.wear(btn, l.item, name) },
        el("span", { class: "wd-head" }, icon("items"), el("span", { class: "wd-name" }, name),
          l.wearing ? el("span", { class: "badge open wd-wearing" }, "Wearing") : null),
        el("span", { class: "wd-garments" }, sentence(String(l.garments || l.label || ""))),
        el("span", { class: "wd-foot" },
          el("span", { class: `wd-cond ${CONDITION[l.condition] ? l.condition : ""}` }, CONDITION[l.condition] || titleCase(l.condition || "")),
          unseen ? el("span", { class: "wd-undrawn" }, "not drawn yet") : null));
      return btn;
    });
    const out = [el("div", { class: "eyebrow" }, "Your looks"), el("div", { class: "wd-looks", role: "group", "aria-label": "Your looks" }, buttons), res];
    const note = this.artNote(self, d, drawn, status);
    if (note) out.push(el("p", { class: "hint wd-art", dataset: { art: status } }, note));
    // Clothes you bought: worn the same way, named as the shop named them.
    const bought = (Array.isArray(d.items) ? d.items : []).filter(i => i && i.slot === "outfit" && typeof i.id === "string");
    if (bought.length) {
      out.push(el("div", { class: "eyebrow" }, "Clothes you bought"));
      out.push(el("ul", { class: "list wd-bought" }, bought.map(i => {
        const btn = el("button", { type: "button", class: `btn block${i.worn ? " primary" : ""}`, dataset: { wear: i.id }, "aria-pressed": String(!!i.worn),
          onclick: () => this.wear(btn, i.id, i.label) }, `${i.label}${i.worn ? " · wearing" : ""}`);
        return el("li", null, btn, i.condition && i.condition !== "clean" ? hint(CONDITION[i.condition] || titleCase(i.condition)) : null);
      })));
    }
    out.push(hint("Everything you wear gets worn out: wash it at home or at the laundromat. A dirty or ruined outfit costs you style."));
    replace(body, ...out);
  }

  // What the picture of you shows, in words. Never pretends a look is drawn when it isn't.
  artNote(self, d, drawn, status) {
    const worn = d.look, drawnWords = drawn ? `your ${inWords(drawn)} look` : "the look your art shows";
    if (status === "art") {
      if (worn === "other") return `Bought clothes aren't drawn: you're drawn in ${drawnWords}.`;
      if (LOOK_NAMES[worn] && worn !== drawn && !hasLookArt(self, worn))
        return `Your ${inWords(worn)} look isn't drawn yet: you're drawn in ${drawnWords} until its sprite sheet is made.`;
      return `Your art shows ${drawnWords}; a look marked "not drawn yet" shows as it until its sprite sheet is made.`;
    }
    if (status === "standin") return `You're drawn as a stand-in in your own colours until your art is made; each of your looks has its colours${worn === "other" ? " (bought clothes show as " + drawnWords + ")" : ""}.`;
    if (status === "plain") return "You're drawn as a simple figure; each look has its own colour so people can tell them apart.";
    return null;
  }

  async wear(btn, item, name) {
    if (this.busy) return;
    this.busy = true;
    btn.disabled = true;
    let r;
    try { r = await this.game.req("wear", { item }); } finally { this.busy = false; if (btn.isConnected) btn.disabled = false; }
    if (!r.ok) { this.game.ui.refusal(r, name); return; }
    // The server's answer is what you're seen in now; the people stream tells everyone else.
    const w = this.game.world, look = r.data && r.data.look;
    if (w.self && typeof look === "string") { w.self.look = look; w.self.lookLabel = r.data.look_label || null; w.changed("self"); }
    const said = LOOK_NAMES[look] ? `You changed into your ${inWords(look)} clothes.` : `You're wearing ${r.data.look_label || name} now.`;
    this.game.ui.toast(said);
    await this.refresh(said);
  }

  // The tray's chip inside your own home (ui.js miniScene); null anywhere else.
  trayChip(here) {
    const home = this.game.agenda && this.game.agenda.homeId();
    if (!here || !home || here.id !== home) return null;
    return { k: "wardrobe", data: { tray: "wardrobe" }, icon: "items", label: "Change clothes", sub: "your three looks",
      aria: "Change clothes: open your wardrobe", run: () => this.open() };
  }
}
