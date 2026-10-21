// Beat Brawl (D-077): the fight screen when someone fights back and a person is in it. The server
// runs the fight beat by beat in real time and judges every beat; this screen only shows it and
// sends your answers. Each beat one of you throws: the other fighter's tell (HOOK, JAB, SHOVE, or
// OPEN after you slipped or parried them) shows over their head with a ring that closes as the beat
// runs out; you answer DUCK, BLOCK or JAB before it closes (late in the ring is perfect timing, and
// lands harder). Between two people the throws alternate, and on your throw the screen says what
// you're throwing. Walk away is always there. The first round shows the answer that beats the tell.
//
//   new BrawlScreen(game, view)   view: the fight_respond / fight reply, or the `brawl` event
//   .beat(d) .hit(d)              the `brawl_beat` and `brawl_hit` events
//   .finish(result, then)         the fight_result: a last banner, then `then()` shows the result card
//   .close()
//
// Server text reaches the page only through el() (text nodes).

import { el, firstName } from "./dom.js";
import { drawFigure } from "./figures.js";

(function addStylesheet() {
  if (typeof document === "undefined" || document.querySelector("link[data-brawl-css]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./css/brawl.css", import.meta.url).href;
  link.dataset.brawlCss = "";
  document.head.appendChild(link);
})();

const ANSWERS = [
  { id: "duck", label: "Duck", keys: ["a", "arrowleft"], key: "A" },
  { id: "block", label: "Block", keys: ["s", "arrowdown"], key: "S" },
  { id: "jab", label: "Jab", keys: ["d", "arrowright"], key: "D" },
];
// What beats each tell (round one shows it under the ring).
const BEATS = { hook: "Duck", jab: "Block, late", shove: "Jab", open: "Jab: counter!" };
const TELL = { hook: "HOOK", jab: "JAB", shove: "SHOVE", open: "OPEN" };
// Each outcome as the one answering sees it.
const CALL = {
  slip: "Slipped it!", counter: "Counter!", chip: "Blocked: a chip", trade: "Traded blows", hit: "Hit!",
  blocked: "Blocked", parry: "Parried!", clash: "Clash", grabbed: "Grabbed", pushed: "Pushed back",
  stuffed: "Stuffed it!", wasted: "Missed the opening", missed: "Missed the opening",
};
const END = { knockout: "Knockout", on_points: "Time", walked_off: "Walked away", walked_away: "Walked away", broke_off: "Broken up", no_contact: "Over" };

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A soft synthesised thump for a blow that lands (only after a tap, as browsers require).
let audio = null;
function thump(strength = 1) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio = audio || new AC();
    const t = audio.currentTime, len = 0.16;
    const buf = audio.createBuffer(1, Math.ceil(audio.sampleRate * len), audio.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3);
    const src = audio.createBufferSource(), lp = audio.createBiquadFilter(), g = audio.createGain();
    src.buffer = buf; lp.type = "lowpass"; lp.frequency.value = 420; g.gain.setValueAtTime(0.5 * strength, t);
    src.connect(lp); lp.connect(g); g.connect(audio.destination); src.start(t);
  } catch { /* no sound is fine */ }
}

export class BrawlScreen {
  constructor(game, view) {
    this.game = game;
    this.world = game.world;
    this.fight = view.fight;
    this.them = view.with;
    this.me = this.world.selfId;
    this.full = Number(view.composure) || 100;
    this.comp = { [this.me]: this.full, [this.them]: this.full };
    this.round = 1;
    this.rounds = Array.isArray(view.rounds) ? view.rounds.length : 3;
    this.turn = null;          // {you: "answer"|"throw", tell|move, at, window, perfect, answered}
    this.anim = { [this.me]: { flinch: 0, lunge: 0 }, [this.them]: { flinch: 0, lunge: 0 } };
    this.shake = 0;
    this.closed = false;
    this.calm = reduceMotion();
    const them = firstName(view.name || this.world.nameOf(this.them));
    this.themName = them;

    const bar = id => el("div", { class: "bb-bar", role: "meter", "aria-valuemin": "0", "aria-valuemax": String(this.full), "aria-valuenow": String(this.full), dataset: { who: id === this.me ? "you" : "them" } }, el("span", null));
    this.bars = { [this.me]: bar(this.me), [this.them]: bar(this.them) };
    this.roundText = el("div", { class: "bb-round" }, `Round 1 of ${this.rounds}`);
    this.canvas = el("canvas", { class: "bb-canvas", "aria-hidden": "true" });
    this.tellNode = el("div", { class: "bb-tell", "aria-hidden": "true" });
    this.ring = el("div", { class: "bb-ring", "aria-hidden": "true" });
    this.hint = el("div", { class: "bb-hint" });
    this.call = el("div", { class: "bb-call", "aria-hidden": "true" });
    this.live = el("div", { class: "sr-only", "aria-live": "assertive" });
    this.buttons = ANSWERS.map(a => el("button", {
      type: "button", class: "btn bb-btn", disabled: true, dataset: { answer: a.id },
      onclick: () => this.answer(a.id),
    }, el("span", { class: "bb-btn-label" }, a.label), el("span", { class: "bb-key", "aria-hidden": "true" }, a.key)));
    this.walk = el("button", { type: "button", class: "btn ghost bb-walk", dataset: { answer: "walk_away" }, onclick: () => this.answer("walk_away") }, "Walk away");
    const edge = Number(view.edge) || 1;
    this.node = el("section", { class: "bb", role: "dialog", "aria-modal": "true", "aria-label": `Fight with ${them}`, dataset: { fight: this.fight } },
      el("div", { class: "bb-top" },
        el("div", { class: "bb-side you" }, el("span", { class: "bb-name" }, "You"), this.bars[this.me]),
        this.roundText,
        el("div", { class: "bb-side them" }, el("span", { class: "bb-name" }, them), this.bars[this.them])),
      el("div", { class: "bb-meta" },
        el("span", null, `Your blows land ×${edge.toFixed(2)}`),
        view.knows_them ? el("span", { class: "bb-knows" }, `You know how ${them} fights: the tell comes early`) : null),
      el("div", { class: "bb-stage" }, this.canvas, this.tellNode, this.ring, this.hint, this.call),
      el("div", { class: "bb-pad" }, el("div", { class: "bb-answers" }, ...this.buttons), this.walk,
        el("p", { class: "bb-note" }, view.note || "Duck, block or jab before each beat ends. Walk away at any time.")),
      this.live);
    this.keys = e => {
      if (this.closed || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = String(e.key || "").toLowerCase();
      const a = ANSWERS.find(x => x.keys.includes(k));
      if (a) { e.preventDefault(); this.answer(a.id); }
    };
    document.addEventListener("keydown", this.keys);
    (document.getElementById("app") || document.body).appendChild(this.node);
    this.say(`${them} squares up. Fight!`, true);
    this.callout("Fight!", "go");
    this.loop = now => { if (this.closed) return; try { this.frame(now); } catch (e) { console.warn("brawl frame", e); } requestAnimationFrame(this.loop); };
    requestAnimationFrame(this.loop);
  }

  say(text, polite) { this.live.textContent = ""; this.live.setAttribute("aria-live", polite ? "polite" : "assertive"); this.live.textContent = text; }
  callout(text, tone) {
    this.call.textContent = text;
    this.call.dataset.tone = tone || "";
    this.call.classList.remove("on"); void this.call.offsetWidth; this.call.classList.add("on");
  }

  // A beat: their tell for you to answer, or your own throw.
  beat(d) {
    if (this.closed || d.fight !== this.fight) return;
    this.round = Number(d.round) || this.round;
    this.roundText.textContent = `Round ${this.round} of ${Number(d.rounds) || this.rounds} · ${d.beat}/${d.beats}`;
    const now = performance.now(), window = Math.max(0.1, Number(d.window_seconds) || 1) * 1000;
    if (d.you === "answer") {
      this.turn = { you: "answer", tell: d.tell, at: now, window, perfect: (Number(d.perfect_after_seconds) || 0) * 1000, answered: null };
      this.tellNode.textContent = TELL[d.tell] || String(d.tell || "").toUpperCase();
      this.tellNode.dataset.over = "them"; this.tellNode.dataset.tell = d.tell;
      this.hint.textContent = this.round === 1 ? `Beat it: ${BEATS[d.tell] || ""}` : "";
      for (const b of this.buttons) { b.disabled = false; b.classList.remove("picked"); }
      this.say(d.tell === "open" ? `${this.themName} is open. Jab!` : `${TELL[d.tell] || d.tell}!`);
    } else {
      this.turn = { you: "throw", move: d.move, at: now, window, perfect: 0, answered: null };
      this.tellNode.textContent = `Your ${TELL[d.move] ? TELL[d.move].toLowerCase() : d.move}`;
      this.tellNode.dataset.over = "you"; this.tellNode.dataset.tell = d.move;
      this.hint.textContent = d.move === "open" ? "You're open: brace" : `${this.themName} has to answer`;
      for (const b of this.buttons) b.disabled = true;
    }
    this.tellNode.classList.remove("on"); void this.tellNode.offsetWidth; this.tellNode.classList.add("on");
  }

  async answer(id) {
    if (this.closed) return;
    if (id !== "walk_away") {
      const t = this.turn;
      if (!t || t.you !== "answer" || t.answered || performance.now() - t.at > t.window) return;
      t.answered = id;
      for (const b of this.buttons) { b.disabled = true; b.classList.toggle("picked", b.dataset.answer === id); }
    } else {
      this.walk.disabled = true;
    }
    thump(0);  // wakes the sound on this tap; silent
    const r = await this.game.req("fight_beat", { fight: this.fight, answer: id });
    if (id === "walk_away") {
      if (r.ok && this.game.moments) this.game.moments.fightResult(r.data);
      else if (!r.ok) { this.walk.disabled = false; if (r.error.code === "unknown_fight") this.close(); }
    }
  }

  // What the beat came to: bars, a callout, and the blows felt.
  hit(d) {
    if (this.closed || d.fight !== this.fight) return;
    for (const [id, v] of Object.entries(d.composure || {})) this.comp[id] = Number(v);
    for (const id of [this.me, this.them]) {
      const pct = Math.max(0, Math.min(100, (this.comp[id] / this.full) * 100));
      const b = this.bars[id];
      if (b) { b.firstChild.style.width = `${pct}%`; b.setAttribute("aria-valuenow", String(Math.round(this.comp[id]))); b.classList.toggle("low", pct < 30); }
    }
    let mine = 0, theirs = 0;
    for (const h of Array.isArray(d.hits) ? d.hits : []) {
      if (h.to === this.me) mine += Number(h.damage) || 0; else if (h.to === this.them) theirs += Number(h.damage) || 0;
      const from = this.anim[h.from], to = this.anim[h.to];
      if (from) from.lunge = 1;
      if (to) to.flinch = 1;
    }
    const iAnswered = d.striker !== this.me;
    const text = iAnswered ? (CALL[d.outcome] || d.outcome) : theirs && !mine ? "Landed!" : mine && !theirs ? (d.outcome === "counter" ? "Countered!" : d.outcome === "stuffed" ? "Stuffed!" : "Ouch") : (CALL[d.outcome] || d.outcome);
    const tone = mine > theirs ? "bad" : theirs > mine ? "good" : "even";
    this.callout(`${text}${d.perfect ? " · perfect" : ""}`, tone);
    if (mine > 0) {
      this.shake = this.calm ? 0 : Math.min(1, 0.4 + mine / 25);
      if (!this.calm) { this.node.classList.remove("flash"); void this.node.offsetWidth; this.node.classList.add("flash"); }
      try { if (navigator.vibrate) navigator.vibrate(Math.min(80, 20 + mine * 2)); } catch { /* no vibration is fine */ }
    }
    if (mine || theirs) thump(Math.min(1, (mine + theirs) / 20));
    if (d.outcome === "slip" || d.outcome === "parry") this.say(`${CALL[d.outcome]} ${this.themName} is open: jab!`);
    else this.say(`${text}. You ${Math.round(this.comp[this.me])}, ${this.themName} ${Math.round(this.comp[this.them])}.`);
    this.turn = null;
    this.tellNode.classList.remove("on");
    for (const b of this.buttons) b.disabled = true;
  }

  // The fight is over: one last banner, then the result card.
  finish(result, then) {
    if (this.closed) { if (then) then(); return; }
    const won = result.won === true, lost = result.won === false;
    this.callout(`${END[result.outcome] || "Over"}${won ? ": you won" : lost ? ": you lost" : ""}`, won ? "good" : lost ? "bad" : "even");
    for (const b of this.buttons) b.disabled = true;
    this.walk.disabled = true;
    this.say(result.text || "The fight is over.");
    setTimeout(() => { this.close(); if (then) then(); }, this.calm ? 400 : 1300);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    document.removeEventListener("keydown", this.keys);
    this.node.remove();
  }

  // The two of them, squared up on a warm pool of light; the ring closing on the tell.
  frame(now) {
    const c = this.canvas, r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (r.width < 10 || r.height < 10) return;
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = c.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.scale(dpr, dpr);
    const w = r.width, h = r.height, t = now / 1000;
    const sx = this.shake > 0 ? (Math.random() * 2 - 1) * 8 * this.shake : 0, sy = this.shake > 0 ? (Math.random() * 2 - 1) * 5 * this.shake : 0;
    this.shake = Math.max(0, this.shake - 0.06);
    ctx.translate(sx, sy);
    const floorY = h * 0.86, figH = Math.min(h * 0.72, w * 0.62);
    const pool = ctx.createRadialGradient(w / 2, floorY, 10, w / 2, floorY, w * 0.6);
    pool.addColorStop(0, "rgba(232,207,156,.38)"); pool.addColorStop(1, "rgba(232,207,156,0)");
    ctx.fillStyle = pool; ctx.beginPath(); ctx.ellipse(w / 2, floorY, w * 0.6, h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    const gap = Math.min(w * 0.2, figH * 0.42);
    const draw = (id, x, mirror) => {
      const a = this.anim[id];
      a.lunge = Math.max(0, a.lunge - 0.07); a.flinch = Math.max(0, a.flinch - 0.04);
      const dir = mirror ? -1 : 1, lunge = this.calm ? 0 : Math.sin(a.lunge * Math.PI) * gap * 0.35 * dir;
      const person = this.world.people.get(id) || { id, name: this.world.nameOf(id) };
      const pose = a.flinch > 0.05 ? "flinch" : "fight";
      return drawFigure(ctx, person, x + lunge, floorY, { height: figH, facing: "front34", mirror, pose, phase: pose === "flinch" ? 1 - a.flinch : t * 1.6, tint: ["#e8a36a", 0.18] });
    };
    const meBox = draw(this.me, w / 2 - gap, false);
    const themBox = draw(this.them, w / 2 + gap, true);
    // The tell sits over whoever throws; the ring closes with the beat and turns gold for perfect timing.
    const turn = this.turn, box = turn && turn.you === "throw" ? meBox : themBox;
    if (box && box.head !== undefined) {
      const hx = (box.x0 + box.x1) / 2 + sx, hy = Math.max(26, box.head - 18) + sy;
      this.tellNode.style.transform = `translate(${hx}px, ${hy}px) translate(-50%, -100%)`;
      this.ring.style.transform = `translate(${hx}px, ${hy - 26}px) translate(-50%, -50%)`;
      this.hint.style.transform = `translate(${hx}px, ${hy + 8}px) translate(-50%, 0)`;
    }
    if (turn && turn.you === "answer" && !turn.answered) {
      const left = Math.max(0, 1 - (now - turn.at) / turn.window);
      this.ring.style.setProperty("--k", String(0.35 + 0.65 * left));
      this.ring.classList.toggle("perfect", now - turn.at >= turn.perfect && left > 0);
      this.ring.classList.toggle("on", left > 0);
      if (left <= 0) for (const b of this.buttons) b.disabled = true;
    } else {
      this.ring.classList.remove("on", "perfect");
    }
  }
}
