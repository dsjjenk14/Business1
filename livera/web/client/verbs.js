// Every verb where it happens. The server has join a team, apply, adopt, look after a pet, the vet,
// buy a home, laundry and perform; this module says which of them belong to a place, from the
// server's own phone apps (sports, jobs, pets, homes, property, items, studio), and runs them the
// way the game always acts: walk to the door (and in, where the rule is "inside"), then send the
// op. The server checks every rule again and its reply is returned as it came.
//
//   const actions = await placeActions(game, place)    // place: an id, a map place, a building or look.here
//   // -> [{ key, label, detail?, primary?, danger?, run: () => Promise<reply> }]
//
// `run()` shows nothing itself and never throws for a refusal: it resolves to the server's reply,
// `{ ok: true, data, summary }` (summary: one plain sentence saying what happened) or
// `{ ok: false, error: { code, message } }`. Walking first can also end as `didnt_arrive` or
// `cancelled` (you walked somewhere else). `runAction(game, action)` is the same with a toast for
// either outcome, for callers that want this module's wording.
//
// Engineer B owns this file (Release 1, R1.6b). The phone apps use the same helpers. The street verbs
// (D-069, D-070: shoplifting, pickpocketing, a fight, what's sold at the Underpass after dark) are at the
// end: each shows the server's odds and the consequence ladder (moments.js confirmCrime) before it sends
// anything, and Back sends nothing.
//
//   const actions = await personActions(game, person)   // the person card's Street section

import { money, firstName, titleCase } from "./dom.js";
import { dist, arrived } from "./state.js";
import { confirmCrime } from "./moments.js";

// ------------------------------------------------------------------ words

export const APP_NAMES = {
  bank: "Bank", messages: "Messages", map: "Map", transit: "Transit", career: "Career", contacts: "Contacts", calendar: "Calendar",
  notifications: "Alerts", wallet: "Wallet", work: "Work", jobs: "Jobs", homes: "Homes", property: "Property", health: "Health",
  items: "Items", store: "Store", school: "School", studio: "Studio", record: "Record", romance: "Romance", family: "Family",
  fame: "Fame", sports: "Sports", pets: "Pets", weather: "Weather", city: "City", goals: "Goals", story: "Story",
};
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const pad = n => String(n).padStart(2, "0");

// The server's clock (src/core/Clock.cpp, D-007): 7-day weeks, 28-day months, 12-month years.
export function dateOf(minute) {
  const m = Math.max(0, Math.floor(Number(minute) || 0)), dayIndex = Math.floor(m / 1440), inDay = m % 1440;
  const dayOfYear = dayIndex % 336;
  return { dayIndex, weekday: dayIndex % 7, year: Math.floor(dayIndex / 336) + 1, month: Math.floor(dayOfYear / 28) + 1, day: (dayOfYear % 28) + 1,
    hour: Math.floor(inDay / 60), minute: inDay % 60 };
}
export const clockText = minute => { const d = dateOf(minute); return `${pad(d.hour)}:${pad(d.minute)}`; };

// The game clock as the client predicts it (the phone sets it): dates in another month say so.
let clockNow = () => null;
export function setClock(fn) { clockNow = typeof fn === "function" ? fn : () => null; }

// "Mon, Day 3 · 18:00"; the month (and year) only when it isn't the current one.
function whenText(d, now) {
  const cur = now ? dateOf(now) : null;
  let day = `Day ${d.day}`;
  if (cur && (cur.month !== d.month || cur.year !== d.year)) day += ` of Month ${d.month}${cur.year !== d.year ? `, Year ${d.year}` : ""}`;
  return `${WEEKDAYS[d.weekday].slice(0, 3)}, ${day} · ${pad(d.hour)}:${pad(d.minute)}`;
}
export const minuteWhen = (minute, now = clockNow()) => whenText(dateOf(minute), now);

// The server's formatDateTime ("Monday, Year 1 Month 2 Day 1, 00:00"), shorter.
const LONG_WHEN = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), Year (\d+) Month (\d+) Day (\d+), (\d\d):(\d\d)$/;
export const isLongWhen = text => typeof text === "string" && LONG_WHEN.test(text);
export function shortWhen(text, now = clockNow()) {
  const m = typeof text === "string" && text.match(LONG_WHEN);
  if (!m) return String(text ?? "");
  return whenText({ weekday: WEEKDAYS.indexOf(m[1]), year: +m[2], month: +m[3], day: +m[4], hour: +m[5], minute: +m[6] }, now);
}
// 150 -> "2 h 30 min"
export function duration(minutes) {
  const n = Math.max(0, Math.round(Number(minutes) || 0)), h = Math.floor(n / 60), m = n % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}
export const hoursText = h => (Array.isArray(h) && h.length >= 2 ? `${pad(h[0] % 24)}:00–${pad(h[1] % 24)}:00` : "");

// Server text meant for the terminal client, made readable: no op names, no request ids,
// "phone jobs" becomes "the Jobs app", a capital first letter.
export function readable(text) {
  let s = String(text ?? "").trim();
  s = s.replace(/\s*\(answer with request id [^)]*\)\s*$/, "");
  s = s.replace(/\s*Answer with work_answer \{[^}]*\}\.?/g, "");
  s = s.replace(/\bphone (\w+)/g, (all, app) => (APP_NAMES[app] ? `the ${APP_NAMES[app]} app` : all));
  s = s.replace(/^\s+/, "");
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
export const sentence = text => { const s = readable(text); return s && !/[.!?…]$/.test(s) ? s + "." : s; };
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const fail = (code, message) => ({ ok: false, error: { code, message } });

// One sentence for what a verb did, from the server's reply.
export function summarize(op, r, extra = {}) {
  if (!r || !r.ok) return null;
  const d = r.data || {};
  switch (op) {
    case "apply": return `You're hired: ${d.title} at ${d.workplace}, ${money(d.hourly_cents)}/hr.`;
    case "join_team": return `You're on the ${d.name}.${d.fee_cents ? ` League fee ${money(d.fee_cents)}.` : ""}${d.next_kickoff_text ? ` Next match ${shortWhen(d.next_kickoff_text)}${d.venue ? ` at ${d.venue}` : ""}.` : ""}`;
    case "leave_team": return `You left the ${d.name}.`;
    case "adopt": return `${d.name} is yours${d.kind ? `: ${String(d.kind).toLowerCase()}${d.breed ? `, ${d.breed}` : ""}` : ""}.${d.fee_cents ? ` Paid ${money(d.fee_cents)}.` : ""}${d.home ? ` ${firstName(d.name)} lives at ${d.home} now.` : ""}`;
    case "pet": return `${d.action || "Done"} with ${d.name}.${typeof d.bond === "number" ? ` Bond ${d.bond}.` : ""}`;
    case "vet": return `${d.service} for ${d.name}: ${money(d.price_cents)}.`;
    case "buy_home": return `You bought ${d.name} for ${money(d.price_cents)} (${money(d.down_payment_cents)} down).`;
    case "wear": return `You're wearing ${extra.label || "it"} now.${typeof d.style === "number" ? ` Style ${d.style}.` : ""}`;
    case "take_off": return `Took off ${extra.label || "it"}.`;
    case "use": {
      const needs = d.needs && typeof d.needs === "object" ? Object.entries(d.needs).map(([k, v]) => `${titleCase(k)} ${Math.round(v)}`).join(", ") : "";
      return `Used ${d.label || extra.label || "it"}${needs ? ` · ${needs}` : ""}.${typeof d.left === "number" && d.left > 0 ? ` ${d.left} left.` : ""}`;
    }
    case "perform": return `You performed “${d.song}”: ${d.audience ? `${plural(d.audience, "person", "people")} heard it` : "nobody was listening"} (quality ${d.quality}).`;
    case "song_release": return `“${d.title}” is out: anyone can play it now.`;
    case "laundry": return `Washed ${plural(d.washed, "thing")} ${d.where === "home" ? "at home" : `at ${d.where}${d.price_cents ? ` (${money(d.price_cents)})` : ""}`}.`;
    case "buy_with_coins": return `Bought ${d.label} for ${d.coin_price} coins.`;
    case "switch_phone": return `You're using the ${d.label || extra.label || "other phone"} now.`;
    case "work_answer": return d.best_call ? "Best call." : `The better call was ${d.best ? d.best.label : "another one"}.`;
    default: return "Done.";
  }
}

// ------------------------------------------------------------------ where things are

// A place in the server's map by id or by its exact name (the phone apps name places).
export function placeNamed(world, name) { return world.places.find(p => p.name === name) || null; }
function resolve(world, place) {
  const id = typeof place === "string" ? place : place && place.id;
  if (!id) return null;
  const building = world.buildingById.get(id) || world.buildingOfPlace.get(id) || null;
  const pl = world.placeById.get(id) || (building && building.place) || null;
  // A building of homes (Lakeview Condos, Maple Court…): the units are the places, and the
  // building's card offers what its units have (they share a door). One unit is just itself.
  const units = !pl && building && Array.isArray(building.units) ? building.units : null;
  const base = pl || building || (typeof place === "object" ? place : null);
  if (!base) return null;
  return { id: base.id, name: base.name, type: base.type, door: base.door || (building && building.door), enterable: base.enterable !== false,
    units, stage: base.stage === true || (typeof place === "object" && place && place.stage === true) };
}
const here = w => (w.self && w.self.inside) || "";
const nearDoor = (w, p, slack = 0.3) => !!(w.self && !w.self.inside && p && p.door && dist(w.selfPos(), p.door) <= w.rules.entry_radius_m - slack);
export const isAt = (w, p) => !!p && (here(w) === p.id || nearDoor(w, p));

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function app(game, id) { const r = await game.phone(id); return r.ok ? r.data : null; }
// The phone apps a card's verbs come from, kept a few seconds so opening card after card doesn't ask
// the server again each time; any verb that runs clears it (its result changes what's offered).
const CACHE_MS = 15000;
const cache = new Map();
function cached(game, id) {
  const hit = cache.get(id), now = performance.now();
  if (hit && hit.game === game && now - hit.at < CACHE_MS) return hit.data;
  const data = app(game, id).then(d => { if (!d) cache.delete(id); return d; });
  cache.set(id, { game, at: now, data });
  return data;
}
export const forgetVerbData = () => cache.clear();

// Walk to a place's door, and step in when `enter`, the way the rest of the client does it (the
// server moves you; the client only waits for it to say you're there). Resolves {ok: true} once
// you're there, or a reply-shaped refusal.
export async function getThere(game, placeId, { enter = false } = {}) {
  const w = game.world, pl = w.placeById.get(placeId);
  if (!pl || !w.self) return fail("unknown_location", "That place isn't on the map.");
  if (here(w) === placeId) return { ok: true };
  if (here(w)) {
    // Inside somewhere else: step out first, the way you'd leave to go anywhere, but never in the
    // middle of a shift or a study session (leaving ends them; that's for you to choose).
    const inside = w.here && w.here.name ? w.here.name : "a building";
    if (w.self.onShift) return fail("on_shift", `You're on shift at ${inside}. End your shift first.`);
    if (w.school && w.school.enrolled && w.school.enrolled.studying) return fail("studying", `You're studying at ${inside}. End the session first.`);
    if (typeof game.exit === "function") await game.exit();
    else { const r = await game.req("exit"); if (r.ok) { w.self.inside = ""; w.here = null; } }
    if (here(w)) return fail("inside_building", `You're inside ${inside}. Exit first.`);
  }
  const close = () => arrived(w.self, performance.now()) && nearDoor(w, pl, 0.3);
  if (!close()) {
    const r = await game.req("move", { location: placeId });
    if (!r.ok) return r;
    const target = r.data.target;
    w.selfMoving(target, w.rules.walk_speed_mps, "walk");
    if (game.renderer) game.renderer.follow = true;
    const eta = Number(r.data.eta_seconds) || 0;
    if (game.ui && eta > 2) game.ui.toast(`Walking to ${pl.name} (about ${Math.ceil(eta)} s).`);
    const until = performance.now() + (eta + 20) * 1000;
    while (!close()) {
      if (performance.now() > until) return fail("didnt_arrive", `Didn't get to ${pl.name}. Try again.`);
      // Tapped somewhere else on the way: that's a change of plan, not a failure to report loudly.
      const t = w.self && w.self.target;
      if ((t && dist(t, target) > 1.5) || here(w)) return fail("cancelled", `You went somewhere else instead of ${pl.name}.`);
      await sleep(200);
    }
  }
  if (!enter) return { ok: true };
  // At the door: step in. The prediction runs a little ahead of the server, so a "too far" gets a few retries.
  for (let tries = 0; ; tries++) {
    const before = here(w);
    const r = typeof game.enterNow === "function" ? await game.enterNow(placeId) : await game.req("enter", { location: placeId });
    if (r.ok) {
      if (typeof game.enterNow !== "function") { w.applyLook(r.data); if (game.insideChanged) game.insideChanged(before); }
      return { ok: true };
    }
    if (r.error.code !== "too_far" || tries >= 5) return r;
    await sleep(700);
  }
}

// Walk there (and in), then act. `act` sends the op; a "not here" refusal right after arriving
// is the prediction running ahead, so it gets a few more tries.
export async function walkThen(game, placeId, enter, act) {
  const there = await getThere(game, placeId, { enter });
  if (!there.ok) return there;
  for (let tries = 0; ; tries++) {
    const r = await act();
    if (r.ok || !["too_far", "wrong_place"].includes(r.error.code) || tries >= 4) return r;
    await sleep(700);
  }
}

// ------------------------------------------------------------------ the verbs, as ops with a summary

// Ops whose success the server also tells you itself (a notification in the feed): their summary
// is for the phone, which covers the feed, and isn't toasted twice.
const ANNOUNCED = new Set(["apply", "join_team"]);
async function send(game, method, op, args, extra) {
  const r = await game[method](...args);
  cache.clear();
  if (r && r.ok) { r.summary = summarize(op, r, extra); if (ANNOUNCED.has(op)) r.announced = true; }
  return r;
}
export const verbs = {
  apply: (game, career) => send(game, "apply", "apply", [career]),
  joinTeam: (game, team) => send(game, "joinTeam", "join_team", [team]),
  leaveTeam: (game, team) => send(game, "leaveTeam", "leave_team", [team]),
  adopt: (game, pet) => send(game, "adopt", "adopt", [pet, "", "card"]),
  petCare: (game, pet, action) => send(game, "petCare", "pet", [pet, action]),
  vet: (game, pet, service) => send(game, "vetVisit", "vet", [pet, service, "card"]),
  buyHome: (game, property) => send(game, "buyHome", "buy_home", [property, 0]),
  wear: (game, item, label) => send(game, "wear", "wear", [item], { label }),
  takeOff: (game, slot, label) => send(game, "takeOff", "take_off", [slot], { label }),
  use: (game, item, label) => send(game, "use", "use", [item], { label }),
  perform: (game, song) => send(game, "perform", "perform", [song]),
  release: (game, song) => send(game, "releaseSong", "song_release", [song]),
  laundry: game => send(game, "laundry", "laundry", []),
  buyWithCoins: (game, item) => send(game, "buyWithCoins", "buy_with_coins", [item]),
  switchPhone: (game, item, label) => send(game, "switchPhone", "switch_phone", [item], { label }),
  workAnswer: (game, task, option) => send(game, "workAnswer", "work_answer", [task, option]),
};

// Apply for a job in person: at the door of one of its workplaces (the nearest), or inside it.
export function applyFor(game, job) {
  const w = game.world, places = (job.workplaces || []).map(n => placeNamed(w, n)).filter(Boolean);
  const at = places.find(p => isAt(w, p));
  if (at) return verbs.apply(game, job.id);
  const me = w.selfPos();
  const nearest = places.sort((a, b) => dist(me, a.door) - dist(me, b.door))[0];
  if (!nearest) return Promise.resolve(fail("wrong_place", `${(job.workplaces || [])[0] || "That workplace"} isn't on the map.`));
  return walkThen(game, nearest.id, false, () => verbs.apply(game, job.id));
}

// Join a league team in person: inside the clubhouse (while it's open), or at the sport's venue.
export function joinAt(game, sports, sport, team) {
  const w = game.world, club = sports && sports.league ? placeNamed(w, sports.league.sign_up_at) : null;
  const venue = w.placeById.get(sport.venue) || placeNamed(w, sport.venue_name);
  if ((club && here(w) === club.id) || (venue && (here(w) === venue.id || nearDoor(w, venue, 0)))) return verbs.joinTeam(game, team.id);
  const me = w.selfPos();
  const options = [club && club.status === "open" ? { p: club, enter: true } : null, venue ? { p: venue, enter: false } : null].filter(Boolean);
  options.sort((a, b) => dist(me, a.p.door) - dist(me, b.p.door));
  if (!options.length) return Promise.resolve(fail("wrong_place", "There's nowhere to sign up right now."));
  return walkThen(game, options[0].p.id, options[0].enter, () => verbs.joinTeam(game, team.id));
}

// Somewhere you go inside to do it (the shelter, the vet, the laundromat).
export const insideThen = (game, place, act) => (here(game.world) === place.id ? act() : walkThen(game, place.id, true, act));
// Somewhere you do it at the door (a house for sale).
export const atDoorThen = (game, place, act) => (isAt(game.world, place) ? act() : walkThen(game, place.id, false, act));

// What the bank would think of a listing, from the numbers the Homes app sends: an estimate,
// worded as one. The server's checkBuyer decides.
export function affordability(listing, terms, bankCents) {
  if (typeof bankCents !== "number" || !listing) return null;
  const down = listing.min_down_payment_cents, monthly = listing.est_monthly_cents;
  if (bankCents < down) return { ok: false, text: `You have ${money(bankCents)} in the bank: ${money(down - bankCents)} short of the ${money(down)} down payment.` };
  const t = terms || {}, carried = (t.your_mortgage_payments_cents || 0) + monthly;
  const limit = Math.round((t.your_monthly_pay_cents || 0) * (t.max_payment_share_of_pay || 0));
  const reserve = carried * (t.reserve_months || 0);
  if (carried <= limit || bankCents - down >= reserve) return { ok: true, text: `You have ${money(bankCents)}: enough for the down payment, and the payments look manageable (an estimate: the bank decides).` };
  return { ok: false, text: `You have the down payment, but the bank will likely say the payments (${money(carried)} a month) are too much for your pay of ${money(t.your_monthly_pay_cents || 0)} a month.` };
}

// ------------------------------------------------------------------ verbs at a place

// The verbs that belong to `place`, newest data from the server's phone apps. Only verbs the
// server has; each one walks you there first if you aren't. A place with none gives [].
export async function placeActions(game, place) {
  const w = game.world, p = resolve(w, place);
  if (!p || !w.self) return [];
  const out = [];
  const [sports, jobs, pets, homes, property] = await Promise.all(["sports", "jobs", "pets", "homes", "property"].map(id => cached(game, id)));
  const homeIdsAll = new Set(((property && property.properties) || []).filter(h => h.lives_here && h.location).map(h => h.location));
  const [items, studio] = await Promise.all([
    p.type === "laundromat" || homeIdsAll.has(p.id) ? cached(game, "items") : null,
    p.stage ? cached(game, "studio") : null,
  ]);
  const inside = here(w) === p.id, there = isAt(w, p);
  const ids = new Set([p.id, ...(p.units || []).map(u => u.id)]);

  // League teams: sign up at the clubhouse (inside, while it's open) or at the sport's venue.
  if (sports && Array.isArray(sports.sports)) {
    const atClub = sports.league && sports.league.sign_up_at === p.name;
    const mine = new Set((sports.your_teams || []).map(t => t.id));
    for (const sport of sports.sports) {
      if (!atClub && sport.venue !== p.id) continue;
      const myTeam = (sport.teams || []).find(t => mine.has(t.id));
      for (const team of sport.teams || []) {
        if (mine.has(team.id)) {
          out.push({ key: `leave_team:${team.id}`, kind: "leave_team", danger: true, label: `Leave the ${team.name}`,
            detail: `${sport.name} · you play for them`, run: () => verbs.leaveTeam(game, team.id) });
          continue;
        }
        if (myTeam) continue;  // one team per sport: leave yours first (the server says so too)
        const roster = (team.members || []).length;
        out.push({ key: `join_team:${team.id}`, kind: "join_team", primary: true, label: `Join the ${team.name}`,
          detail: [`${sport.name}, ${sport.match_day}s at ${pad(sport.match_hour)}:00 at ${sport.venue_name}`,
            sports.league && sports.league.fee_cents ? `league fee ${money(sports.league.fee_cents)}` : "",
            roster ? `${plural(roster, "player")} so far` : "nobody on the roster yet",
            atClub && !inside ? "you'll walk in first" : !atClub && !there ? "you'll walk there first" : ""].filter(Boolean).join(" · "),
          run: () => (atClub ? insideThen(game, p, () => verbs.joinTeam(game, team.id)) : atDoorThen(game, p, () => verbs.joinTeam(game, team.id))) });
      }
    }
  }

  // Apply in person at the employer's door.
  if (jobs && Array.isArray(jobs.jobs)) {
    for (const job of jobs.jobs) {
      if (job.id === jobs.current || !(job.workplaces || []).includes(p.name)) continue;
      const need = [job.requires_degree ? `needs a ${job.requires_degree}` : "", job.requires_clean_record ? "needs a clean record" : ""].filter(Boolean).join(", ");
      out.push({ key: `apply:${job.id}`, kind: "apply", primary: !!job.eligible, label: `Apply: ${job.starting_title}`,
        detail: [`${job.career} · ${money(job.starting_hourly_cents)}/hr`, need ? `${need}${job.eligible ? " (you have it)" : ""}` : "",
          jobs.current ? "you'd leave your job and start this one at the first rung" : "", there ? "" : "you'll walk to the door first"].filter(Boolean).join(" · "),
        run: () => atDoorThen(game, p, () => verbs.apply(game, job.id)) });
    }
  }

  // The animal shelter: adopt, inside, while it's open.
  if (pets && pets.shelter && pets.shelter.id === p.id) {
    const open = pets.shelter.open !== false, hours = hoursText(pets.shelter.hours);
    for (const a of pets.shelter.animals || []) {
      out.push({ key: `adopt:${a.id}`, kind: "adopt", label: `Adopt ${a.name}`,
        detail: [[a.kind, a.breed, a.age].filter(Boolean).join(", "), a.fee_cents ? `${money(a.fee_cents)} adoption fee` : "",
          open ? "" : `closed now${hours ? ` (open ${hours})` : ""}`, inside ? "" : "you'll walk in first"].filter(Boolean).join(" · "),
        run: () => insideThen(game, p, () => verbs.adopt(game, a.id)) });
    }
  }
  // The vet: your pets' checkups, vaccines and treatment, inside.
  const myPets = pets && Array.isArray(pets.pets) ? pets.pets : [];
  if (pets && pets.vet && pets.vet.id === p.id && myPets.length) {
    for (const pet of myPets) for (const s of pets.vet.services || []) {
      out.push({ key: `vet:${pet.id}:${s.id}`, kind: "vet", label: `${s.label}: ${pet.name}`, detail: `${money(s.price_cents)}${inside ? "" : " · you'll walk in first"}`,
        run: () => insideThen(game, p, () => verbs.vet(game, pet.id, s.id)) });
    }
  }

  // Home: where you live (the Property app names its place), for laundry and your pets.
  const homeIds = homeIdsAll;
  const atHomePlace = [...ids].some(id => homeIds.has(id));
  if (atHomePlace && myPets.length && pets) {
    for (const pet of myPets) for (const a of pets.care || []) {
      if (Array.isArray(a.species) && a.species.length && !a.species.includes(pet.species)) continue;
      const indoors = a.where === "home";
      if (indoors ? !homeIds.has(here(w)) : !!here(w)) continue;  // home care inside your home; walks from your street
      out.push({ key: `pet:${pet.id}:${a.id}`, kind: "pet", label: `${a.label}: ${pet.name}`, detail: indoors ? "at home" : "from your street",
        run: () => verbs.petCare(game, pet.id, a.id) });
    }
  }

  // Laundry: inside your home, or inside the laundromat.
  if ((inside && homeIds.has(p.id)) || (p.type === "laundromat")) {
    const worn = ((items && items.items) || []).filter(i => i.slot === "outfit" && i.condition && i.condition !== "clean").length;
    out.push({ key: "laundry", kind: "laundry", label: "Do laundry",
      detail: [worn ? `${plural(worn, "outfit")} to wash` : "nothing looks dirty yet", p.type === "laundromat" ? "the laundromat charges per load" : "at home",
        inside ? "" : "you'll walk in first"].filter(Boolean).join(" · "),
      run: () => insideThen(game, p, () => verbs.laundry(game)) });
  }

  // Homes for sale: buy at the door. The price and what the bank might say are on the button.
  if (homes && Array.isArray(homes.listings)) {
    const names = new Set([p.name, ...(p.units || []).map(u => u.name)]);
    const bank = w.money ? w.money.bank_cents : null;
    for (const l of homes.listings) {
      if (!names.has(l.name)) continue;
      const verdict = affordability(l, homes.terms, bank);
      const unit = p.units && p.units.length > 1 ? `${l.name.split(", ").slice(-1)[0]} ` : "";
      out.push({ key: `buy_home:${l.property}`, kind: "buy_home", label: `Buy ${unit}for ${money(l.price_cents)}`,
        detail: [`${titleCase(l.type)}, ${plural(l.bedrooms, "bedroom")}`, `${money(l.min_down_payment_cents)} down, about ${money(l.est_monthly_cents)} a month`,
          verdict ? verdict.text : "", there ? "" : "you'll walk to the door first"].filter(Boolean).join(" · "),
        run: () => {
          const target = (p.units || []).find(u => u.name === l.name) || p;
          return atDoorThen(game, w.placeById.get(target.id) || p, () => verbs.buyHome(game, l.property));
        } });
    }
  }

  // A stage (only when the server says the place is one): perform a song you have, or one that's out.
  if (p.stage && studio) {
    const songs = [...(studio.yours || []), ...(studio.chart || []).filter(s => s.released && !(studio.yours || []).some(y => y.id === s.id))];
    for (const s of songs.slice(0, 6)) {
      out.push({ key: `perform:${s.id}`, kind: "perform", label: `Perform “${s.title}”`, detail: `${s.by}${s.released ? "" : " · not released yet"}`,
        run: () => atDoorThen(game, p, () => verbs.perform(game, s.id)) });
    }
  }
  out.push(...await streetActionsAt(game, p, inside));
  return out;
}

// How a verb went, in the feed: the summary, or the refusal in the UI's plain words (ui.refusal)
// when it has them. A change of plan on the way (`cancelled`) says nothing.
export function showOutcome(ui, r) {
  if (r.ok) { if (!r.announced) ui.toast(r.summary || "Done."); }
  else if (r.error.code === "cancelled") return;
  else if (typeof ui.refusal === "function") ui.refusal(r);
  else ui.toast(sentence(r.error.message), true);
}

// Run an action and say how it went in the feed (callers that show results themselves call run()).
export async function runAction(game, action) {
  const r = await action.run();
  if (game.ui) showOutcome(game.ui, r);
  return r;
}

// For the end-to-end tests: the labels of the verbs at a place, or for a person (read-only: nothing runs).
export function exposeForTests(game) {
  if (typeof window === "undefined" || window.__liveraVerbs) return;
  const labels = list => list.map(a => ({ key: a.key, kind: a.kind, label: a.label, detail: a.detail || "" }));
  window.__liveraVerbs = Object.freeze({
    at: async id => labels(await placeActions(game, id)),
    person: async id => labels(await personActions(game, id)),
  });
}

// ------------------------------------------------------------------ the street (D-069, D-070)

const round1 = v => Math.round(v * 10) / 10;
const cancelled = () => fail("cancelled", "You thought better of it.");
// What a crime risks right now, from the server (its odds come from who can see you; the ladder from data).
async function riskOf(game, crime, target) {
  const r = await game.req("crime_risk", target ? { crime, target } : { crime });
  return r.ok ? r.data : null;
}
// Which kinds of shop let you pocket something: the server's own list, asked once per page.
let shopTypes = null;
async function shopliftTypes(game) {
  if (!shopTypes) shopTypes = riskOf(game, "shoplifting").then(r => (r && Array.isArray(r.place_types) ? r.place_types : null));
  const t = await shopTypes;
  if (!t) shopTypes = null;
  return t || [];
}
// "Caught shoplifting at Thread & Co.: fined $250.00, held until 14:20."
function arrestText(d, what) {
  const until = Number.isFinite(d.jail_minutes) && d.jail_minutes > 0 ? `, held ${duration(d.jail_minutes)}` : "";
  return `Caught ${what}${d.by ? ` by ${d.by}` : ""}: ${d.fine_cents ? `fined ${money(d.fine_cents)}` : "no fine paid"}${until}.${Array.isArray(d.seized) && d.seized.length ? ` Seized: ${d.seized.join(", ")}.` : ""}`;
}

// Walk up to someone (within `range` m) and act, the way Talk does; the server says when you're close enough.
export async function nearThen(game, target, range, act) {
  const w = game.world, who = firstName(w.nameOf(target));
  for (let tries = 0; tries < 6; tries++) {
    if (!w.people.has(target)) return fail("target_unavailable", `${who} is out of sight.`);
    const d = w.distanceTo(target);
    if (d <= Math.max(0.5, range - 0.8)) {
      const r = await act();
      if (r.ok || r.error.code !== "too_far") return r;
    }
    if (w.self.inside) return fail("too_far", d === 0 ? `${who} is too far away.` : `You're inside and ${who} isn't. Go out first.`);
    const pos = w.personPos(target);
    if (!pos) return fail("target_unavailable", `${who} is out of sight.`);
    const r = await game.req("move", { x: round1(pos[0]), y: round1(pos[1]) });
    if (!r.ok) return r;
    w.selfMoving(r.data.target, w.rules.walk_speed_mps, "walk");
    const until = performance.now() + ((Number(r.data.eta_seconds) || 0) + 6) * 1000;
    while (performance.now() < until && w.people.has(target) && w.distanceTo(target) > Math.max(0.5, range - 0.8)) await sleep(150);
  }
  return fail("didnt_arrive", `Couldn't get close enough to ${who}.`);
}

// The person card's Street section: pickpocket, start a fight. Risk first, every time.
export async function personActions(game, person) {
  const w = game.world, p = typeof person === "string" ? w.people.get(person) : person;
  if (!p || !w.self || p.id === w.selfId) return [];
  const who = firstName(p.name || w.nameOf(p.id));
  return [
    { key: `pickpocket:${p.id}`, kind: "pickpocket", danger: true, label: `Pick ${who}'s pocket…`,
      detail: "A crime. First you'll see the odds of being caught and what it costs.", run: () => pickpocket(game, p.id) },
    { key: `fight:${p.id}`, kind: "fight", danger: true, label: `Start a fight with ${who}…`,
      detail: "Fists only. Assault if a blow lands; they can fight back, run or walk away. The ladder comes first.", run: () => fight(game, p.id) },
  ];
}

async function pickpocket(game, target) {
  const who = firstName(game.world.nameOf(target));
  const c = await confirmCrime(game, { title: `Pick ${who}'s pocket?`, risk: await riskOf(game, "pickpocketing", target), go: "Pick their pocket" });
  if (!c.go) return cancelled();
  const r = await nearThen(game, target, 2, () => game.req("pickpocket", { target }));
  cache.clear();
  if (!r.ok) return r;
  const d = r.data || {};
  game.refreshBank(); game.lastLook = 0;
  r.summary = d.caught ? arrestText(d, `picking ${who}'s pocket`) : d.stolen_cents > 0 ? `You lifted ${money(d.stolen_cents)} from ${who}'s pocket.` : sentence(d.note || `${who}'s pockets are empty.`);
  return r;
}

async function fight(game, target) {
  const who = firstName(game.world.nameOf(target));
  const c = await confirmCrime(game, { eyebrow: "A fight", title: `Start a fight with ${who}?`, risk: await riskOf(game, "assault", target), go: "Throw the first punch",
    note: "No weapons. One fight per pair a day; afterwards they're left alone for a while. People who choose to walk away from fights always do." });
  if (!c.go) return cancelled();
  const r = await nearThen(game, target, 3, () => game.req("fight", { target }));
  if (!r.ok) return r;
  if (r.data.status === "waiting") r.summary = `You squared up to ${who}. They have a moment to react.`;
  else { r.announced = true; if (game.moments) game.moments.fightResult(r.data); }
  return r;
}

async function shoplift(game, place) {
  const w = game.world;
  const risk = await riskOf(game, "shoplifting");
  const can = new Set((risk && risk.offers) || []);
  const offers = ((w.here && w.here.offers) || []).filter(o => can.has(o.id));
  if (!offers.length) return fail("cant_steal_here", `There's nothing at ${place.name} you could slip into a pocket.`);
  const c = await confirmCrime(game, { title: `Shoplift at ${place.name}?`, risk, go: "Slip it into your pocket",
    choices: offers.map(o => ({ id: o.id, label: o.label, detail: `${money(o.price_cents)} on the shelf` })) });
  if (!c.go) return cancelled();
  const r = await game.req("steal", { offer: c.choice });
  cache.clear();
  if (!r.ok) return r;
  const d = r.data || {}, label = (offers.find(o => o.id === c.choice) || {}).label || "it";
  game.lastLook = 0; game.refreshBank();
  r.summary = d.caught ? arrestText(d, `shoplifting at ${place.name}`) : `You walked out with ${d.stolen || label}. Nobody stopped you.`;
  return r;
}

async function buyIllegal(game, place, offer) {
  const c = await confirmCrime(game, { title: `Buy ${offer.label} for ${money(offer.price_cents)} cash?`, risk: await riskOf(game, "drug_purchase"), go: "Buy it", eyebrow: place.name });
  if (!c.go) return cancelled();
  const r = await game.req("buy", { offer: offer.id, method: "cash" });
  cache.clear();
  if (!r.ok) return r;
  const d = r.data || {};
  game.lastLook = 0; game.refreshBank();
  r.summary = d.caught ? arrestText(d, `buying ${offer.label}`) : `Bought ${offer.label} for ${money(d.price_cents || offer.price_cents)} cash. It's in your Items; carrying it is a charge if you're ever arrested.`;
  return r;
}

// At a place: shoplifting where the data allows it (walk in first), and what's sold illegally at an open-air
// place while you stand there and it's open (the Underpass after dark).
async function streetActionsAt(game, p, inside) {
  const w = game.world, out = [];
  if (p.enterable && !p.units && (await shopliftTypes(game)).includes(p.type)) {
    out.push({ key: `steal:${p.id}`, kind: "steal", danger: true, label: "Shoplift…",
      detail: inside ? "A crime. First you'll see the odds of being caught and what it costs." : "A crime. You'll walk in first, then see the odds.",
      run: () => insideThen(game, p, () => shoplift(game, p)) });
  }
  const here = w.here && w.here.id === p.id ? w.here : null;
  if (!p.enterable && here && Array.isArray(here.offers)) {
    const illegal = here.offers.filter(o => o.illegal);
    if (illegal.length && here.status === "open") {
      for (const o of illegal) out.push({ key: `buy_illegal:${o.id}`, kind: "buy_illegal", danger: true, label: `Buy ${o.label} · ${money(o.price_cents)} cash`,
        detail: "Illegal. First you'll see the odds of the police seeing it.", run: () => buyIllegal(game, p, o) });
    }
  }
  return out;
}
