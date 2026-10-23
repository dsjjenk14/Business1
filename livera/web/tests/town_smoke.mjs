// Smoke test for the town_* exports of the browser module (src/wasm/solo.cpp around protocol::LocalTown), the
// functions the "Play together" host page calls for several people at once: five people join, see each other,
// hear a say, a taken character is refused, a buy moves only the buyer's money, leaving hands a founder back
// to the autopilot (or keeps them dormant), and the save round-trips. Run after scripts/build_wasm.sh:
//   node web/tests/town_smoke.mjs [path/to/livera_solo.js]
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulePath = process.argv[2] || path.join(here, "..", "client", "solo", "livera_solo.js");
const { default: createLivera } = await import(pathToFileURL(modulePath).href);
const m = await createLivera();

const call = (name, ...args) => JSON.parse(m[name](...args));
let rid = 0;
const req = (who, op, args = {}) => call("town_request", who, JSON.stringify({ id: ++rid, op, ...args }));

let failures = 0;
function check(cond, what, detail) {
  if (cond) { console.log(`  ok   ${what}`); return; }
  failures += 1;
  console.log(`  FAIL ${what}${detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 400)}`}`);
}
// 10 Hz ticks, as the host page runs them; collects everyone's events.
function run(seconds, done) {
  const heard = {};
  for (let t = 0; t < seconds; t += 0.1) {
    const out = call("town_tick", 0.1);
    for (const [who, list] of Object.entries(out)) (heard[who] ||= []).push(...list);
    if (done && done(heard)) break;
  }
  return heard;
}
const got = (heard, who, type, match = () => true) => (heard[who] || []).some(e => e.event === type && match(e.data));
const seen = who => new Set((req(who, "look").data?.people || []).map(p => p.id));
const bank = who => req(who, "phone", { app: "bank" }).data?.bank_cents;

console.log("--- a town for five");
check(call("town_join", "dominique").error?.code === "no_world", "town_join before a town exists is no_world");
check(call("solo_new").ok === true, "solo_new founds the town");
const pilot = call("solo_autopilot_start", null);
// Everyone in the pick list: the founders, the residents and the townspeople (D-073).
const cast = call("solo_characters").data.characters.map(c => c.id).sort();
check(cast.length === 28 && cast.includes("bernie-walsh") && cast.includes("evelyn-park"), "the town has its 28 people", cast);
check(pilot.ok && JSON.stringify([...pilot.data.running].sort()) === JSON.stringify(cast),
      "everyone in the town starts on autopilot", pilot);
const five = ["aaliyah", "dominique", "graham", "naomi", "maya"];
for (const id of five) {
  const j = call("town_join", id);
  check(j.ok === true && j.data.you.id === id, `${id} joins (answers with look)`, j.error);
}
const humans = call("town_humans");
check(humans.ok && humans.data.length === 5, "town_humans lists the five", humans);
const twice = call("town_join", JSON.stringify({ character: "graham" }));
check(twice.ok === false && twice.error.code === "character_in_use", "a second join of a taken character is character_in_use", twice);
const listForGraham = call("town_characters", "graham");
const avail = Object.fromEntries(listForGraham.data.characters.map(c => [c.id, c.available]));
check(avail.graham === true && avail.naomi === false && avail.dax === true, "town_characters: others' characters are taken, your own and the autopilot's free", avail);
const daxEntry = listForGraham.data.characters.find(c => c.id === "dax");
check(daxEntry.scripted_now === true && daxEntry.played_by === "autopilot", "the autopilot's founders are labelled", daxEntry);
const listForNobody = call("town_characters", null);
check(listForNobody.ok && listForNobody.data.characters.find(c => c.id === "graham").available === false, "town_characters(null): everyone being played is taken");

console.log("--- out on the street");
for (const id of five) check(req(id, "exit").ok === true, `${id} goes out`);
check(req("maya", "move", { location: "lexington_1204" }).ok === true, "Maya walks to the Lexington");
run(120, h => got(h, "maya", "arrived"));
run(0.5);
for (const id of five) {
  const s = seen(id), others = five.filter(o => o !== id);
  check(others.every(o => s.has(o)), `${id} sees the other four`, [...s]);
}
check(req("dominique", "say", { text: "Hello, everyone" }).ok === true, "Dominique says hello");
let heard = run(0.3);
check(["aaliyah", "graham", "naomi", "maya"].every(id => got(heard, id, "speech", d => d.from === "dominique" && d.text === "Hello, everyone")), "all four hear her", Object.keys(heard));
check(Object.keys(heard).every(id => five.includes(id)), "events come only for the people playing", Object.keys(heard));
check(req("dax", "look").error?.code === "not_playing", "a character nobody plays here can't act");

console.log("--- money is each one's own");
const before = Object.fromEntries(five.map(id => [id, bank(id)]));
check(req("naomi", "move", { location: "heritage_coffee" }).ok === true, "Naomi walks to Heritage Coffee");
run(120, h => got(h, "naomi", "arrived"));
check(req("naomi", "enter", { location: "heritage_coffee" }).ok === true, "Naomi goes in");
const buy = req("naomi", "buy", { offer: "latte", method: "card" });
check(buy.ok === true, "Naomi buys a latte", buy.error);
check(bank("naomi") < before.naomi, "Naomi's balance dropped", { before: before.naomi, after: bank("naomi") });
check(five.filter(id => id !== "naomi").every(id => bank(id) === before[id]), "nobody else's money moved");
const bad = call("town_request", "naomi", "not json");
check(bad.ok === false && bad.error.code === "bad_request" && bad.re === null, "a line that isn't JSON is bad_request with re null", bad);

console.log("--- leaving");
const left = call("town_leave", "graham");
check(left.ok === true, "Graham's person leaves", left);
check(call("town_characters", null).data.characters.find(c => c.id === "graham").available === true, "Graham is free again");
const st = call("solo_autopilot_status");
check(st.ok && !!st.data.graham, "Graham went back on autopilot", Object.keys(st.data || {}));
const kept = call("town_leave", JSON.stringify({ character: "aaliyah", autopilot: false }));
check(kept.ok === true && !call("solo_autopilot_status").data.aaliyah, "Aaliyah's person leaves and she stays off the autopilot (a claim keeps her)", kept);

console.log("--- save and load");
const save = call("solo_save");
check(save.format === 1, "the save is a format 1 world document", Object.keys(save));
console.log(`  (save: ${JSON.stringify(save).length} bytes)`);
const load = call("solo_load", JSON.stringify(save));
check(load.ok === true, "the save loads", load.error);
check(call("town_humans").data.length === 0, "a loaded town has nobody playing");
const back = call("town_join", "naomi");
check(back.ok === true && back.data.you.inside === "heritage_coffee", "Naomi is still in Heritage Coffee", back.data?.you);
check(bank("naomi") === before.naomi - buy.data.price_cents, "and her money is what it was", bank("naomi"));
const made = call("town_creator_options");
check(made.ok === true && typeof made.data === "object", "town_creator_options answers");

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
