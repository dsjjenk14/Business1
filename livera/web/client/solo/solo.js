// The single-player page: the same game controller as the live client (../main.js), booted with
// the local transport (the game core in WebAssembly) instead of the WebSocket, and its own
// screens where the live client has accounts: a town screen (new town, continue, import), the
// character picker, and a menu with save, export and start over. The world is saved to this
// browser every 30 s, when the tab is hidden, and on "Save now"; one slot.
//
// Honest labels: the sketch note, "Single-player: the town runs in your browser. Nobody else can
// join this save." and "The town pauses while this tab is closed." The founders the person
// doesn't play run on the core's autopilot and show as "played by a script" (the server's own
// wording); where this page chooses the words it says "on autopilot".

import { Game } from "../main.js";
import { LocalTransport } from "./transport_local.js";
import { SaveSlot, makeRecord, exportRecord, readRecordFile } from "./save.js";
import { el, avatar } from "../dom.js";
import { SKETCH_NOTICE } from "../layout.js";

export const SOLO_NOTICE = "Single-player: the town runs in your browser. Nobody else can join this save.";
export const PAUSE_NOTICE = "The town pauses while this tab is closed.";
const AUTOSAVE_MS = 30000;
// Set by artifact.html, the page published as a Claude artifact: that viewer blocks downloads, so
// the page offers no Export there (import from a file still works).
const IN_ARTIFACT = !!globalThis.LIVERA_IN_ARTIFACT;

const ago = (when, now = Date.now()) => {
  const ms = Math.max(0, now - new Date(when).getTime());
  if (ms < 60000) return "just now";
  if (ms < 3600000) return `${Math.round(ms / 60000)} min ago`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)} h ago`;
  return new Date(when).toLocaleString();
};

class SoloGame extends Game {
  constructor() {
    const transport = new LocalTransport();
    super({ transport });
    this.local = transport;
    this.slot = new SaveSlot();
    this.record = null;          // the save on this device, as last read or written
    this.lastSave = null;        // {at, how} of the last successful save this session
    this.lastSaveError = null;
    this.saving = false;
    this.ui.sheetMenu = () => this.sheetMenu();   // the live menu has "Log out"; this one saves
  }

  async start() {
    await super.start();
    document.getElementById("solo-note").textContent = SOLO_NOTICE;
    setInterval(() => { if (this.phase === "playing") this.save("auto"); }, AUTOSAVE_MS);
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.save("hidden"); });
    window.addEventListener("pagehide", () => this.save("hidden"));
    // For the end-to-end tests: the save state and a fast-forward (whole real seconds of world time).
    window.__liveraSolo = Object.freeze({
      save: how => this.save(how || "debug"), lastSave: () => this.lastSave, lastSaveError: () => this.lastSaveError,
      backend: () => this.slot.backend, record: () => (this.record ? { saved_at: this.record.saved_at, character: this.record.character } : null),
      advance: s => this.local.advance(s), ticks: () => this.local.ticks, gameSeconds: () => this.local.gameSeconds,
      playing: () => this.local.playing, autopilot: () => ({ ...this.local.autopilot }), autopilotStatus: () => this.local.autopilotStatus(), status: () => this.local.status,
    });
  }

  // ------------------------------------------------------------------ the module, the welcome
  onStatus(s) {
    if (s.status === "loading") { this.screenConnecting("Loading the town into your browser…"); return; }
    if (s.status === "failed") { this.screenFailed(s.detail && s.detail.message); return; }
    if (s.status === "open" && s.detail && s.detail.resumed && this.phase === "playing" && s.detail.hiddenMs > 2000) {
      this.ui.toast("The town paused while this tab was in the background.");
    }
  }
  async onWelcome(d) {
    this.protocol = d.protocol || null;
    if (d.rules) this.world.setRules(d.rules);
    await this.screenStart();
  }
  screenLogin(message) { this.screenStart(message); }

  screenFailed(reason) {
    this.phase = "failed";
    this.ui.showScreen(el("div", { class: "screen-inner" }, el("div", { class: "wordmark" }, "Livéra"), el("h1", null, "No town to load"),
      el("p", null, "The single-player build of the game core (solo/livera_solo.js) didn't load, so there is nothing to play here."),
      el("p", { class: "err", role: "alert" }, reason || ""),
      el("p", { class: "hint" }, IN_ARTIFACT ? "This viewer may not allow WebAssembly. The same page runs from the repository in any browser: see livera/web/README.md, \"Single-player build\"."
        : "Build it with scripts/build_wasm.sh (it writes web/client/solo/livera_solo.js), then reload. The multiplayer client at ../ needs a server instead."),
      el("button", { type: "button", class: "btn primary block", onclick: () => location.reload() }, "Try again")));
  }

  // ------------------------------------------------------------------ the town screen
  async screenStart(message) {
    this.phase = "start";
    let storageProblem = null;
    this.record = await this.slot.load().catch(e => { storageProblem = e.message; return null; });
    const err = el("p", { class: "err", role: "alert" }, message || "");
    const rec = this.record;
    const body = el("div", { class: "stack" });
    const fileInput = el("input", { type: "file", accept: "application/json,.json", hidden: true, id: "solo-import-file", "aria-label": "Save file" });
    fileInput.addEventListener("change", () => this.importFile(fileInput.files && fileInput.files[0], err));
    const importBtn = el("button", { type: "button", class: "btn block", id: "solo-import", onclick: () => fileInput.click() }, "Import a save file");
    if (rec) {
      body.append(el("div", { class: "card" }, el("div", { class: "eyebrow" }, "Your town"),
        el("p", null, `Saved ${ago(rec.saved_at)}${rec.character_name ? `, playing ${rec.character_name}` : ""}.`),
        el("button", { type: "button", class: "btn primary block", id: "solo-continue", onclick: () => this.continueTown(err) }, "Continue"),
        IN_ARTIFACT ? null : el("button", { type: "button", class: "btn block", id: "solo-export", onclick: () => { try { this.ui.toast(`Saved to ${exportRecord(rec)}`); } catch (e) { err.textContent = `Couldn't export: ${e.message}`; } } }, "Export this save as a file")));
      body.append(this.startOverButton(err));
      body.append(el("p", { class: "hint" }, "One save per browser. Start over deletes it; importing a file replaces it."));
    } else {
      body.append(el("button", { type: "button", class: "btn primary block", id: "solo-new", onclick: () => this.newTown(err) }, "New town"));
    }
    body.append(importBtn, fileInput);
    const storage = storageProblem ? `Nothing can be saved in this browser: ${storageProblem}. You can still play${IN_ARTIFACT ? "" : ", and export the save as a file from the menu"}.`
      : IN_ARTIFACT ? `Saves stay in this browser on this device (${this.slot.backend === "localstorage" ? "localStorage" : "IndexedDB"}).`
      : `Saves stay in this browser (${this.slot.backend === "localstorage" ? "localStorage" : "IndexedDB"}); export a file to move one to another device.`;
    this.ui.showScreen(el("div", { class: "screen-inner" },
      el("div", { class: "wordmark" }, "Livéra"), el("h1", null, "Your own town"),
      el("p", { class: "hint" }, "A life sim that runs entirely in this tab: you play one resident, and the game's autopilot plays the other founders. " + SOLO_NOTICE + " " + PAUSE_NOTICE),
      err, body,
      el("p", { class: "hint" }, storage),
      el("p", { class: "hint" }, SKETCH_NOTICE + ". Doors, names, prices, opening hours, needs, money and every outcome come from the same game core as the multiplayer server, compiled to WebAssembly.")));
  }
  startOverButton(err) {
    const box = el("div", { class: "stack" });
    const ask = el("button", { type: "button", class: "btn danger block", id: "solo-start-over", onclick: () => {
      box.replaceChildren(el("p", { class: "hint" }, "Delete this save and start a new town? There is no undo."),
        el("div", { class: "row" },
          el("button", { type: "button", class: "btn danger grow", id: "solo-start-over-yes", onclick: () => this.startOver(err) }, "Yes, start over"),
          el("button", { type: "button", class: "btn grow", onclick: () => box.replaceChildren(ask) }, "Keep it")));
    } }, "Start over");
    box.append(ask);
    return box;
  }

  async newTown(err) {
    const r = this.local.newTown();
    if (!r.ok) { err.textContent = `Couldn't found a town: ${r.error.message}`; return; }
    this.lastSave = null;
    await this.screenPick();
  }
  async continueTown(err) {
    const rec = this.record;
    if (!rec) { await this.screenStart("There is no save here."); return; }
    const r = this.local.loadTown(rec.state);
    if (!r.ok) { err.textContent = `This save can't be loaded: ${r.error.message}. Export it and keep it; a newer build may read it.`; return; }
    if (rec.character) {
      const problem = await this.play(rec.character);
      if (problem) await this.screenPick(problem);
      return;
    }
    await this.screenPick();
  }
  async importFile(file, err) {
    try {
      const rec = await readRecordFile(file);
      const r = this.local.loadTown(rec.state);
      if (!r.ok) throw new Error(`the game refused it: ${r.error.message}`);
      await this.slot.save(rec).catch(e => { this.ui.toast(`Loaded, but it can't be saved here: ${e.message}`, true); });
      this.record = rec;
      this.ui.toast("Save file loaded.");
      if (rec.character) { const problem = await this.play(rec.character); if (problem) await this.screenPick(problem); }
      else await this.screenPick();
    } catch (e) { err.textContent = `Couldn't import: ${e.message}`; }
  }
  async startOver(err) {
    try { await this.slot.clear(); } catch (e) { if (err) err.textContent = `Couldn't delete the save: ${e.message}`; }
    this.record = null; this.lastSave = null;
    if (this.phase === "playing") { await this.transport.request("logout"); this.leaveGame(); }
    await this.newTown(err || el("p"));
  }

  // ------------------------------------------------------------------ the picker
  async screenPick(message) {
    this.phase = "pick";
    const r = await this.transport.request("characters");
    if (!r.ok) { await this.screenStart(r.error.message); return; }
    const err = el("p", { class: "err", role: "alert" }, message || "");
    const list = Array.isArray(r.data.characters) ? r.data.characters : [];
    const cards = list.map(c => {
      const taken = c.available === false;
      return el("button", { type: "button", class: "castcard", disabled: taken, dataset: { character: c.id }, onclick: async e => {
        e.currentTarget.disabled = true;
        const problem = await this.play(c.id);
        if (problem) { err.textContent = problem; e.currentTarget.disabled = false; }
      } }, avatar(c.id, c.name, "big"), el("span", { class: "who" },
        el("span", { class: "name" }, c.name),
        el("span", { class: "hint" }, [c.age, c.pronouns, c.career].filter(Boolean).join(" · ")),
        c.tagline ? el("span", { class: "tag" }, c.tagline) : null,
        el("span", { class: "row" },
          taken ? el("span", { class: "badge closed" }, "not available") : null,
          c.created ? el("span", { class: "badge open" }, "yours") : null,
          c.scripted_now || c.played_by === "autopilot" ? el("span", { class: "badge script" }, "on autopilot right now") : null)));
    });
    this.ui.showScreen(el("div", { class: "screen-inner wide" },
      el("div", { class: "wordmark" }, "Livéra"), el("h1", null, "Who are you?"),
      el("p", { class: "hint" }, "Pick a founding resident or make your own. Everyone you don't pick lives their day on autopilot; you can change who you play from the menu."),
      err, el("div", { class: "cast" }, cards),
      r.data.can_create ? el("button", { type: "button", class: "btn primary block", id: "create-btn", onclick: () => this.screenCreate() }, "Make your own character") : null,
      el("button", { type: "button", class: "btn ghost block", id: "solo-back", onclick: () => this.screenStart() }, "Back")));
  }

  async enterWorld(look) {
    await super.enterWorld(look);
    const a = this.local.autopilot;
    if (a.error) this.ui.toast(`The autopilot couldn't start: ${a.error}. The other founders stand still.`, true);
  }

  // "Log out" in the live client; here: save, leave the character, pick another.
  async logout() {
    await this.save("leave");
    await this.transport.request("logout");
    this.leaveGame();
    await this.screenPick();
  }
  async toTownScreen() {
    await this.save("leave");
    await this.transport.request("logout");
    this.leaveGame();
    await this.screenStart();
  }

  // ------------------------------------------------------------------ saving
  async save(how = "manual") {
    if (this.phase !== "playing" || this.saving) return false;
    this.saving = true;
    try {
      const state = this.local.saveTown();
      if (!state) throw new Error(this.local.lastError || "the game wrote no save");
      const record = makeRecord(state, this.character, this.world.selfName);
      await this.slot.save(record);
      this.record = record; this.lastSave = { at: Date.now(), how }; this.lastSaveError = null;
      if (how === "manual") this.ui.toast(`Saved to this browser (${this.slot.backend === "localstorage" ? "localStorage" : "IndexedDB"}).`);
      return true;
    } catch (e) {
      this.lastSaveError = e.message;
      if (how !== "auto" && how !== "hidden") this.ui.toast(`Couldn't save: ${e.message}`, true);
      return false;
    } finally { this.saving = false; }
  }
  exportNow() {
    const state = this.local.saveTown();
    if (!state) { this.ui.toast(`Couldn't export: ${this.local.lastError}`, true); return; }
    try { this.ui.toast(`Saved to ${exportRecord(makeRecord(state, this.character, this.world.selfName))}`); }
    catch (e) { this.ui.toast(`Couldn't export: ${e.message}`, true); }
  }

  // ------------------------------------------------------------------ the menu
  sheetMenu() {
    const ui = this.ui;
    const saved = this.lastSave ? `Last saved ${ago(this.lastSave.at)}` : this.lastSaveError ? `Not saved: ${this.lastSaveError}` : "Not saved yet";
    const startOver = el("div", { class: "stack" });
    const askStartOver = el("button", { type: "button", class: "btn danger block", id: "solo-start-over", onclick: () => {
      startOver.replaceChildren(el("p", { class: "hint" }, "Delete the save and start a new town? There is no undo."),
        el("div", { class: "row" },
          el("button", { type: "button", class: "btn danger grow", id: "solo-start-over-yes", onclick: () => { ui.closeSheet(true); this.startOver(); } }, "Yes, start over"),
          el("button", { type: "button", class: "btn grow", onclick: () => startOver.replaceChildren(askStartOver) }, "Keep playing")));
    } }, "Start over");
    startOver.append(askStartOver);
    ui.openSheet("menu", "menu", ui.head("Livéra · single-player", "Menu"), [
      el("p", { class: "hint" }, `Playing ${this.world.selfName || "nobody yet"}. ${saved} · autosaves every 30 s and when you leave the tab.`),
      el("button", { type: "button", class: "btn primary block", id: "solo-save", onclick: () => this.save("manual") }, "Save now"),
      IN_ARTIFACT ? null : el("button", { type: "button", class: "btn block", id: "solo-export", onclick: () => this.exportNow() }, "Export the save as a file"),
      el("button", { type: "button", class: "btn block", onclick: () => { this.renderer.followMe(); ui.closeSheet(); } }, "Follow me"),
      el("button", { type: "button", class: "btn block", onclick: () => { this.renderer.fitTown(); ui.closeSheet(); } }, "See the whole town"),
      el("button", { type: "button", class: "btn block", onclick: () => ui.sheetNeeds() }, "Needs and feelings"),
      el("button", { type: "button", class: "btn block", id: "solo-change", onclick: () => this.logout() }, "Change who you play"),
      el("button", { type: "button", class: "btn ghost block", id: "solo-leave", onclick: () => this.toTownScreen() }, "Save and go to the town screen"),
      startOver,
      el("div", { class: "eyebrow" }, "What this is"),
      el("p", { class: "hint" }, SOLO_NOTICE + " " + PAUSE_NOTICE),
      el("p", { class: "hint" }, SKETCH_NOTICE + ". Door positions, names, prices, opening status, bus stops and everyone's movements come from the game core running in this tab; it decides every outcome, exactly as the server does online."),
      el("p", { class: "hint" }, "Characters marked “played by a script” are founders on autopilot: a routine inside the game core walks them through their day (home, work, errands, bed) and says no to every ask. They never talk, so “Nobody heard you” is the honest answer when you speak and nobody's near."),
      el("p", { class: "hint" }, `Protocol ${this.protocol || "unknown"}, single-player build. Autopilot: ${this.local.autopilot.running ? "running" : this.local.autopilot.error || "off"}.`),
    ]);
  }
}

new SoloGame().start();
