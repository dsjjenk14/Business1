// Smoke test for the single-player module in Node: founds a town, plays Dominique with everyone else on
// autopilot, walks to Heritage Coffee, buys a latte, saves, loads, and checks the money and the position
// survived. Run after scripts/build_wasm.sh:  node web/tests/solo_smoke.mjs [path/to/livera_solo.js]
// Exits non-zero on the first failed check. The module is built with -sENVIRONMENT=web,node for this.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulePath = process.argv[2] || path.join(here, "..", "client", "solo", "livera_solo.js");
const { default: createLivera } = await import(pathToFileURL(modulePath).href);
const m = await createLivera();

// The module's own wrappers (src/wasm/solo_post.js) take JS strings (or null) and return JSON text; they
// go through the wasm heap. Don't use ccall/cwrap with "string" arguments here: those go on the wasm
// stack and a save overflows it.
const raw = (name, ...args) => m[name](...args);
const call = (name, ...args) => JSON.parse(raw(name, ...args));
const request = (op, args = {}, id = 1) => call("solo_request", JSON.stringify({ id, op, ...args }));

let failures = 0;
function check(cond, what, detail) {
  if (cond) { console.log(`  ok   ${what}`); return; }
  failures += 1;
  console.log(`  FAIL ${what}${detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 400)}`}`);
}
function shown(name, reply) {
  // One example reply per export, for the report; long ones are cut.
  const text = JSON.stringify(reply);
  console.log(`${name} -> ${text.length > 300 ? text.slice(0, 300) + "…" : text}`);
}

// Ticks the town until `done()` or the limit; returns every event the person received.
function tickUntil(done, maxTicks, seconds = 1.0) {
  const events = [];
  for (let i = 0; i < maxTicks; i++) {
    for (const e of call("solo_tick", seconds)) events.push(e);
    if (done(events)) break;
  }
  return events;
}

console.log("--- new town");
const fresh = call("solo_new");
shown("solo_new()", fresh);
check(fresh.ok === true && fresh.data.protocol === "livera/1", "solo_new founds a town", fresh);

const rules = call("solo_rules");
shown("solo_rules()", rules);
check(typeof rules.walk_speed_mps === "number" && rules.walk_speed_mps > 0, "solo_rules has the public rules", rules);

const chars = call("solo_characters");
shown("solo_characters()", chars);
const dominique = chars.ok && chars.data.characters.find(c => c.id === "dominique");
check(!!dominique && dominique.available === true && dominique.scripted_now === false, "Dominique is listed and available", chars);
check(chars.ok && chars.data.can_create === true, "a character can be created in a new town", chars);

console.log("--- play");
const beforePlay = request("look");
shown('solo_request({"op":"look"}) before play', beforePlay);
check(beforePlay.ok === false && beforePlay.error.code === "not_playing" && beforePlay.re === 1, "in-world ops are refused before play with not_playing", beforePlay);

const play = call("solo_play", "dominique");
shown('solo_play("dominique")', play);
check(play.ok === true && play.data.you.id === "dominique" && play.data.you.inside === "lexington_1204", "play answers with look", play);
const again = call("solo_play", "dax");
check(again.ok === false && again.error.code === "already_playing", "a second play is refused", again);

const auto = call("solo_autopilot_start", null);
shown("solo_autopilot_start(null)", auto);
check(auto.ok === true && auto.data.running.length > 0 && !auto.data.running.includes("dominique"), "everyone else is on autopilot", auto);
const charsNow = call("solo_characters");
const dax = charsNow.ok && charsNow.data.characters.find(c => c.id === "dax");
check(!!dax && dax.scripted_now === true && dax.played_by === "autopilot", "autopilot characters are labelled", dax);

console.log("--- walk to Heritage Coffee and buy a latte");
const leave = request("exit");
check(leave.ok === true, "exit the apartment", leave);
const bank0 = request("phone", { app: "bank" });
shown('solo_request({"op":"phone","app":"bank"})', bank0);
const balance = reply => reply.ok && (reply.data.balance_cents ?? reply.data.bank_cents ?? reply.data.bank?.balance_cents);
const money0 = balance(bank0);
check(typeof money0 === "number", "the bank app shows a balance", bank0);
const move = request("move", { location: "heritage_coffee" }, 7);
shown('solo_request({"op":"move","location":"heritage_coffee"})', move);
check(move.ok === true && move.re === 7 && move.data.eta_seconds > 0, "move is accepted with an ETA", move);

const walk = tickUntil(evs => evs.some(e => e.event === "arrived"), 3000, 1.0);
shown("solo_tick(1.0)", walk.slice(0, 3));
check(walk.some(e => e.event === "arrived"), "an arrived event comes back from solo_tick", walk.slice(-3));
const peopleSeen = walk.filter(e => e.event === "people").length;
console.log(`  (people events while walking: ${peopleSeen})`);
const three = tickUntil(() => false, 30, 0.1);  // 3 s of real time in 10 Hz ticks, as the page does
check(Array.isArray(three), "ticking 3 s at 10 Hz works", three);

const enter = request("enter", { location: "heritage_coffee" });
check(enter.ok === true && enter.data.you.inside === "heritage_coffee", "enter Heritage Coffee", enter);
const buy = request("buy", { offer: "latte", method: "card" });
shown('solo_request({"op":"buy","offer":"latte"})', buy);
check(buy.ok === true, "buy a latte", buy);
const money1 = balance(request("phone", { app: "bank" }));
check(typeof money1 === "number" && money1 < money0, "the latte was paid for", { money0, money1 });
const unknown = request("fly");
check(unknown.ok === false && unknown.error.code === "unknown_op", "unknown ops are refused", unknown);
const bad = call("solo_request", "not json");
const big = call("solo_request", JSON.stringify({ id: 2, op: "say", text: "x".repeat(200000) }));
check(big.re === 2 && typeof big.ok === "boolean", "a 200 KB request goes through the heap, not the stack", big.error);
check(bad.ok === false && bad.error.code === "bad_request" && bad.re === null, "a line that isn't JSON is bad_request with re null", bad);

console.log("--- save and load");
const save = call("solo_save");
shown("solo_save()", { format: save.format, now: save.now, characters: save.characters?.length, bytes: JSON.stringify(save).length });
check(save.format === 1 && Array.isArray(save.characters), "the save is a format 1 world document", Object.keys(save));
const saveText = JSON.stringify(save);
const load = call("solo_load", saveText);
shown("solo_load(stateJson)", load);
check(load.ok === true && typeof load.data.world_time === "string", "the save loads", load);
// Before anyone reconnects (connecting updates the character), saving again gives the same document, up to
// JSON.stringify's number formatting (80.0 -> 80; the 64-bit rng loses its low digits in a JS number).
const resumed = JSON.parse(raw("solo_save"));
check(JSON.stringify(resumed) === JSON.stringify(save), "saving the loaded town gives the same document", { before: saveText.length, after: JSON.stringify(resumed).length });
check(typeof save.rng === "string" && resumed.rng === save.rng, "the world's 64-bit random stream survives a JavaScript round trip", { before: save.rng, after: resumed.rng });
const afterLoad = call("solo_characters");
check(afterLoad.ok && afterLoad.data.characters.every(c => c.scripted_now === false), "a loaded town starts with nobody on autopilot", afterLoad);
const replay = call("solo_play", JSON.stringify({ character: "dominique" }));
check(replay.ok === true && replay.data.you.inside === "heritage_coffee", "Dominique is still in Heritage Coffee after the load", replay);
const money2 = balance(request("phone", { app: "bank" }));
check(money2 === money1, "the balance survived the save", { money1, money2 });
const corrupt = call("solo_load", '{"format": 99}');
shown('solo_load(\'{"format": 99}\')', corrupt);
check(corrupt.ok === false && corrupt.error.code === "save_version", "another format is refused and the town stays", corrupt);
check(request("look").ok === true, "the town is still there after a refused load");

console.log("--- leave and autopilot stop");
const stop = call("solo_autopilot_stop");
shown("solo_autopilot_stop()", stop);
check(stop.ok === true && stop.data.running.length === 0, "the autopilot stops", stop);
const status = call("solo_autopilot_status");
shown("solo_autopilot_status()", status);
const left = call("solo_leave");
shown("solo_leave()", left);
check(left.ok === true && left.data.logged_out === true, "leave", left);
check(request("look").error?.code === "not_playing", "after leaving, in-world ops are refused again");

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
