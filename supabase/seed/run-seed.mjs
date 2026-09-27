#!/usr/bin/env node
/**
 * I'm In: demo seed (DEVELOPMENT ONLY)
 *
 * Fills a fresh database with the prototype's cast so the app feels alive in demos.
 *
 *   npm run db:reset   # wipe + re-run migrations
 *   npm run db:seed    # this script
 *
 * Safety: refuses to run unless the target is a local Supabase (localhost / 127.0.0.1),
 * or SEED_ALLOW_REMOTE=yes is set AND the database's app_config.environment is not 'production'.
 */
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

import {
  CAST, COMMUNITY_EMOJI, COMMUNITY_FIRST, COMMUNITY_LAST, COMMUNITY_SIZE, CONNECTIONS,
  DEMO_CITIES, DEMO_PASSWORD, GENERIC_REPLIES, GROUPS, PLACES, VENUES,
} from './cast.mjs';

// ── Connection + safety guard ────────────────────────────────────────────────
function localCredentials() {
  const out = execSync('npx supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const s = JSON.parse(out.slice(out.indexOf('{')));
  return { url: s.API_URL, key: s.SERVICE_ROLE_KEY };
}

const creds = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY }
  : localCredentials();

const host = new URL(creds.url).hostname;
const isLocal = host === 'localhost' || host === '127.0.0.1';
if (!isLocal && process.env.SEED_ALLOW_REMOTE !== 'yes') {
  console.error(`✋ Refusing to seed ${host}. The seed only runs against a local Supabase.`);
  process.exit(1);
}

const db = createClient(creds.url, creds.key, { auth: { persistSession: false, autoRefreshToken: false } });

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

const envRow = await must(db.from('app_config').select('value').eq('key', 'environment').maybeSingle(), 'read environment');
if (envRow?.value === 'production') {
  console.error('✋ This database is marked production. Seed aborted.');
  process.exit(1);
}
const { count: profileCount } = await db.from('profiles').select('id', { count: 'exact', head: true });
if (profileCount > 0) {
  console.error('✋ Database already has members. Run `npm run db:reset` first, then seed.');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────
let rngState = 20260927;
const rand = () => ((rngState = (rngState * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const point = ([lng, lat]) => `SRID=4326;POINT(${lng} ${lat})`;
const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d) => minutesAgo(d * 24 * 60);

/** A time in DC (America/New_York), `dayOffset` days from today. */
function dcTime(dayOffset, hh, mm = 0) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).map((p) => [p.type, p.value]));
  const guess = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day + dayOffset, hh, mm));
  const offsetName = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' })
    .formatToParts(guess).find((p) => p.type === 'timeZoneName').value; // "GMT-4"
  const offsetHours = Number(offsetName.replace('GMT', '')) || 0;
  return new Date(guess.getTime() - offsetHours * 3_600_000).toISOString();
}
const dcDow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
const SAT = (6 - dcDow + 7) % 7 || 7;  // next Saturday
const SUN = SAT + 1;

function birthdate(age) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

// ── 1. Demo cities ────────────────────────────────────────────────────────
await must(db.from('cities').insert(DEMO_CITIES.map((c, i) => ({
  slug: c.slug, name: c.name, region: c.region, metro: c.metro, active: false, sort: 100 + i,
  center: point([c.lng, c.lat]),
}))), 'demo cities');
const cities = Object.fromEntries((await must(db.from('cities').select('id, slug'), 'cities')).map((c) => [c.slug, c.id]));

// ── 2. Members ────────────────────────────────────────────────────────────
const ids = {}; // key → uuid

async function createMember(key, fullName, age, citySlug, phone) {
  const data = await must(db.auth.admin.createUser({
    email: `${key.toLowerCase()}@imin.test`,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, birthdate: birthdate(age), city_slug: citySlug, phone },
  }), `create ${key}`);
  ids[key] = data.user.id;
}

console.log('Creating the cast…');
let phoneN = 1000;
for (const c of CAST) await createMember(c.key, c.full, c.age, c.city, `+1202555${phoneN++}`);

console.log('Creating the wider community…');
const community = [];
for (let i = 0; i < COMMUNITY_SIZE; i++) {
  const first = COMMUNITY_FIRST[i % COMMUNITY_FIRST.length];
  const last = COMMUNITY_LAST[Math.floor(i / 2) % COMMUNITY_LAST.length];
  const key = `member${String(i + 1).padStart(2, '0')}`;
  const cityPool = ['washington-dc', 'arlington-va', 'alexandria-va', 'bethesda-md', 'silver-spring-md', 'tysons-va'];
  await createMember(key, `${first} ${last}`, 24 + (i % 15), cityPool[i % cityPool.length], `+1202556${1000 + i}`);
  community.push(key);
}

// Profile details
for (const c of CAST) {
  await must(db.from('profiles').update({
    display_name: c.display,
    headline: c.headline,
    bio: c.bio,
    pronouns: c.pronouns,
    avatar_emoji: c.emoji,
    neighborhood: c.hood,
    city_id: cities[c.city],
    approx_location: c.loc ? point(PLACES[c.loc]) : point([DEMO_CITIES.find((d) => d.slug === c.city).lng, DEMO_CITIES.find((d) => d.slug === c.city).lat]),
    photo_verified_at: daysAgo(30),
    id_verified_at: c.idVerified ? daysAgo(20) : null,
    accent_color: c.accent ?? null,
    bg_pattern: c.pattern ?? null,
    mood_status: c.mood ?? null,
    created_at: daysAgo(200),
  }).eq('id', ids[c.key]), `profile ${c.key}`);
}
for (const [i, key] of community.entries()) {
  const cityPool = Object.values(PLACES);
  await must(db.from('profiles').update({
    avatar_emoji: COMMUNITY_EMOJI[i % COMMUNITY_EMOJI.length],
    approx_location: point(cityPool[i % cityPool.length]),
    photo_verified_at: daysAgo(40),
  }).eq('id', ids[key]), `profile ${key}`);
}
// Maya invited Dominique (her 3 vouches are GPS vouches, so no invite vouch here).
await must(db.from('profiles').update({ invited_by: ids.maya }).eq('id', ids.dom), 'invited_by');

// ── 3. Venues ─────────────────────────────────────────────────────────────
const venueRows = await must(db.from('venues').insert(VENUES.map((v) => ({
  name: v.name, emoji: v.emoji, address: v.address, neighborhood: v.hood, city_id: cities[v.city],
  location: point([v.lng, v.lat]), category: v.category, price_level: v.price, description: v.description,
}))).select('id, name'), 'venues');
const venue = Object.fromEntries(VENUES.map((v) => [v.key, venueRows.find((r) => r.name === v.name).id]));

// ── 4. Connections ────────────────────────────────────────────────────────
await must(db.from('connections').insert(CONNECTIONS.map(([a, b, source, connector]) => ({
  user_a: ids[a] < ids[b] ? ids[a] : ids[b],
  user_b: ids[a] < ids[b] ? ids[b] : ids[a],
  source,
  connector_id: connector ? ids[connector] : null,
  created_at: daysAgo(60 + Math.floor(rand() * 100)),
}))), 'connections');

const connectedTo = (key) => CONNECTIONS.filter((c) => c[0] === key || c[1] === key).map((c) => (c[0] === key ? c[1] : c[0]));

// ── 5. Encounters + vouches ───────────────────────────────────────────────
const words = Object.fromEntries((await must(db.from('vouch_words').select('id, word'), 'words')).map((w) => [w.word, w.id]));
const wordNames = Object.keys(words);
const placeKeys = ['bresca', 'songbyrd', 'tailupgoat', 'foundingfarmers', 'otf', 'rockcreek', 'watkins', 'fridge'];

// Explicit vouches from the prototype: [voucher, vouchee, word, venueKey, daysAgo]
const scripted = [
  ['maya', 'dom', 'Welcoming', 'bresca', 21],
  ['jordan', 'dom', 'Authentic', 'otf', 14],
  ['naomi', 'dom', 'Connector', 'rockcreek', 6],
  ['naomi', 'aaliyah', 'Reliable', 'rockcreek', 1],
  ['reina', 'ari', 'Authentic', 'songbyrd', 40],
  ['ari', 'reina', 'Creative', 'songbyrd', 40],
  ['priya', 'jade', 'Reliable', 'otf', 90],
  ['maya', 'marcus', 'Thoughtful', 'bresca', 50],
];

const planned = []; // { voucher, vouchee, word, venueKey, days }
const pairTaken = new Set();
for (const [voucher, vouchee, word, venueKey, days] of scripted) {
  planned.push({ voucher, vouchee, word, venueKey, days });
  pairTaken.add(`${voucher}>${vouchee}`);
}
for (const c of CAST) {
  if (c.key === 'dom') continue; // exactly 3, all scripted
  let have = planned.filter((p) => p.vouchee === c.key).length;
  const pool = [...connectedTo(c.key).filter((k) => k !== 'dom'), ...community];
  for (const voucher of pool) {
    if (have >= c.vouches) break;
    if (pairTaken.has(`${voucher}>${c.key}`)) continue;
    pairTaken.add(`${voucher}>${c.key}`);
    planned.push({
      voucher, vouchee: c.key,
      word: rand() < 0.55 ? c.topWord : pick(wordNames),
      venueKey: pick(placeKeys),
      days: 3 + Math.floor(rand() * 240),
    });
    have++;
  }
}

console.log(`Creating ${planned.length} GPS encounters and vouches…`);
const venueNames = Object.fromEntries(VENUES.map((v) => [v.key, v.name]));
for (let i = 0; i < planned.length; i += 200) {
  const batch = planned.slice(i, i + 200);
  const encounters = await must(db.from('encounters').insert(batch.map((p) => {
    const a = ids[p.voucher], b = ids[p.vouchee];
    const start = daysAgo(p.days);
    return {
      user_a: a < b ? a : b, user_b: a < b ? b : a,
      context: 'venue', venue_id: venue[p.venueKey], place_label: venueNames[p.venueKey],
      distance_m: 5 + Math.floor(rand() * 60),
      overlap_start: start, overlap_end: new Date(new Date(start).getTime() + 90 * 60_000).toISOString(),
      created_at: start,
    };
  })).select('id'), 'encounters');
  await must(db.from('vouches').insert(batch.map((p, j) => ({
    voucher_id: ids[p.voucher], vouchee_id: ids[p.vouchee], type: 'gps',
    word_id: words[p.word], encounter_id: encounters[j].id, created_at: daysAgo(p.days),
  }))), 'vouches');
}

// ── 6. Interactions (Dominique can message her 1st degree) ────────────────
for (const other of ['maya', 'jordan', 'naomi', 'deshawn']) {
  const a = ids.dom < ids[other] ? ids.dom : ids[other];
  const b = ids.dom < ids[other] ? ids[other] : ids.dom;
  const kinds = ['encounter', 'pin_like', 'pin_reply', 'shared_rsvp', 'intro', 'pin_like'];
  await must(db.from('interaction_events').insert(kinds.map((kind, i) => ({ user_a: a, user_b: b, kind, ref_id: 900 + i }))), 'interaction events');
  await must(db.from('interactions').upsert({ user_a: a, user_b: b, count: kinds.length }), 'interactions');
}

// ── 7. Groups ─────────────────────────────────────────────────────────────
const groupIds = {};
let communityCursor = 0;
for (const g of GROUPS) {
  const [row] = await must(db.from('groups').insert({
    name: g.name, emoji: g.emoji, category: g.category, description: g.description, join_type: g.join,
    owner_id: ids[g.owner], city_id: cities[g.city], schedule_label: g.schedule, created_at: daysAgo(180),
  }).select('id'), `group ${g.key}`);
  groupIds[g.key] = row.id;
  const members = [{ group_id: row.id, user_id: ids[g.owner], role: 'owner' },
    ...g.members.map((k) => ({ group_id: row.id, user_id: ids[k], role: 'member' }))];
  while (members.length < g.total) {
    const k = community[communityCursor++ % community.length];
    if (!members.some((m) => m.user_id === ids[k])) members.push({ group_id: row.id, user_id: ids[k], role: 'member' });
  }
  await must(db.from('group_members').insert(members), `members ${g.key}`);
}

// ── 8. Events + RSVPs ─────────────────────────────────────────────────────
const eventDefs = [
  { key: 'bresca', host: 'jordan', venue: 'bresca', title: 'Community Dinner @ Bresca', emoji: '🍽️', starts: dcTime(0, 19, 30), capacity: 6,
    rsvps: ['aaliyah', 'darius', 'simone', 'deshawn'] },
  { key: 'songbyrd', host: 'reina', venue: 'songbyrd', title: 'Indie Night @ Songbyrd', emoji: '🎶', starts: dcTime(0, 19), capacity: null,
    rsvps: ['ari', 'omar', 'tyler', 'member03', 'member07', 'member11'] },
  { key: 'otf', host: 'priya', venue: 'otf', group: 'otf', title: 'OTF Tysons Saturday Class', emoji: '🏋️', starts: dcTime(SAT, 9), capacity: 24, recurring: true,
    rsvps: ['maya', 'jade', 'dom', ...community.slice(0, 15)] },
  { key: 'run', host: 'naomi', venue: 'rockcreek', group: 'run', title: 'DC Morning Runners', emoji: '🏃', starts: dcTime(SAT, 7), capacity: null, recurring: true,
    rsvps: ['jordan', 'lena', 'tyler'] },
  { key: 'pkl', host: 'cameron', venue: 'watkins', group: 'pkl', title: 'DC Pickleball Crew', emoji: '🏓', starts: dcTime(SUN, 8), capacity: 12, recurring: true,
    rsvps: ['jordan', 'dom', 'member02', 'member05', 'member09'] },
  { key: 'gallery', host: 'omar', venue: 'fridge', group: 'gallery', title: 'Gallery Night', emoji: '🎨', starts: dcTime(SAT, 18), capacity: null,
    rsvps: ['reina', 'ari'] },
];
const eventIds = {};
for (const e of eventDefs) {
  const [row] = await must(db.from('events').insert({
    host_id: ids[e.host], group_id: e.group ? groupIds[e.group] : null, venue_id: venue[e.venue], title: e.title, emoji: e.emoji,
    starts_at: e.starts, ends_at: new Date(new Date(e.starts).getTime() + 3 * 3_600_000).toISOString(),
    capacity: e.capacity, is_recurring: !!e.recurring,
  }).select('id'), `event ${e.key}`);
  eventIds[e.key] = row.id;
  await must(db.from('event_rsvps').insert([e.host, ...e.rsvps].map((k) => ({ event_id: row.id, user_id: ids[k] }))), `rsvps ${e.key}`);
}

// ── 9. Going-out posts (Tonight + This Weekend) ───────────────────────────
const tonightEnd = dcTime(1, 2);
const goingOut = [
  { who: 'maya', when: 'tonight', starts: dcTime(0, 19), venue: 'foundingfarmers', vibes: ['solo', 'dinner'], note: 'Flying solo. Come find me.' },
  { who: 'jordan', when: 'tonight', starts: dcTime(0, 19, 30), venue: 'bresca', vibes: ['dinner', 'small_group'], hosting: true, event: 'bresca' },
  { who: 'deshawn', when: 'tonight', starts: dcTime(0, 21), venue: 'tailupgoat', vibes: ['drinks'] },
  { who: 'aaliyah', when: 'tonight', starts: dcTime(0, 20), venue: 'bresca', vibes: ['dinner'], note: 'Bresca dinner w/ Jordan', event: 'bresca' },
  { who: 'reina', when: 'tonight', starts: dcTime(0, 19), venue: 'songbyrd', vibes: ['music'], hosting: true, event: 'songbyrd' },
  { who: 'omar', when: 'tonight', starts: dcTime(0, 18), venue: 'fridge', vibes: ['small_group'], note: 'Gallery Night' },
  { who: 'maya', when: 'weekend', starts: dcTime(SAT, 11), venue: 'sfoglina', vibes: ['brunch', 'small_group'], note: 'Sfoglina brunch' },
  { who: 'jordan', when: 'weekend', starts: dcTime(SAT, 9), venue: 'otf', vibes: ['fitness'], note: 'Hosting OTF run', hosting: true },
  { who: 'priya', when: 'weekend', starts: dcTime(SAT, 9), venue: 'otf', vibes: ['fitness'], event: 'otf' },
  { who: 'simone', when: 'weekend', starts: dcTime(SUN, 11), venue: null, place: 'Brunch somewhere in DC', vibes: ['brunch'] },
  { who: 'naomi', when: 'weekend', starts: dcTime(SAT, 7), venue: 'rockcreek', vibes: ['fitness', 'outdoors'], note: 'Morning run', event: 'run' },
];
const goingOutIds = {};
for (const g of goingOut) {
  const v = g.venue ? VENUES.find((x) => x.key === g.venue) : null;
  const [row] = await must(db.from('going_out_posts').insert({
    user_id: ids[g.who], when_kind: g.when, starts_at: g.starts,
    expires_at: g.when === 'tonight' ? tonightEnd : dcTime(SUN, 23),
    venue_id: g.venue ? venue[g.venue] : null, place_text: g.place ?? null,
    approx_location: v ? point([v.lng, v.lat]) : point(PLACES.dc),
    vibes: g.vibes, note: g.note ?? null, is_hosting: !!g.hosting, event_id: g.event ? eventIds[g.event] : null,
    created_at: minutesAgo(30 + Math.floor(rand() * 120)),
  }).select('id'), `going out ${g.who}`);
  goingOutIds[`${g.who}-${g.when}`] = row.id;
}

// ── 10. Pins ──────────────────────────────────────────────────────────────
const pinDefs = [
  { key: 'jordanRecap', author: 'jordan', category: 'recap', minutes: 120, venue: 'bresca', place: 'Bresca', likes: 24, replies: 8,
    body: 'Best dinner yet. Six strangers walked in. Friends walked out. Next one is Minibar — drop your name if you want a seat.',
    tags: ['maya', 'aaliyah', 'simone', 'darius', 'theo', 'deshawn'] },
  { key: 'jordanDrop', author: 'jordan', category: 'event', minutes: 480, venue: 'minibar', place: 'Minibar', likes: 5, replies: 5,
    body: 'Next community dinner. Minibar. 6 spots. Drop your name.' },
  { key: 'mayaQ', author: 'maya', category: 'question', minutes: 180, likes: 12, replies: 12, loc: 'tysons',
    body: 'Best restaurant in DC for a first date? Vibe matters more than price.' },
  { key: 'simoneThought', author: 'simone', category: 'thought', minutes: 300, likes: 32, replies: 14, loc: 'dc',
    body: 'Going out alone to meet people is an art form. This app makes it less terrifying. We need more spaces where showing up solo is the point.' },
  { key: 'mayaGoingOut', author: 'maya', category: 'going_out', minutes: 30, venue: 'foundingfarmers', place: 'Founding Farmers', likes: 11, replies: 0,
    goingOut: 'maya-tonight',
    body: "Founding Farmers tonight. Flying solo — come find me if you're around Tysons. Best fried chicken in the DMV and I will die on that hill." },
  { key: 'domQ', author: 'dom', category: 'question', minutes: 240, likes: 9, replies: 0, loc: 'fairfax',
    body: 'Best restaurant in DC for a first date? Budget flexible, vibe matters more.',
    scriptedReplies: [
      ['maya', 'Bresca, no question. Intimate vibe and food that makes you look sophisticated without trying.'],
      ['jordan', 'Tail Up Goat. Bar is better than the food and the food is incredible. Get the corner table.'],
    ] },
  { key: 'naomiRun', author: 'naomi', category: 'photos', minutes: 360, likes: 17, replies: 3, loc: 'rockCreek', place: 'Rock Creek',
    body: 'Run recap: 24 runners, P St → Beach Drive → back. New faces every week. Saturday 7AM, all paces.' },
  { key: 'aaliyahW', author: 'aaliyahW', category: 'thought', minutes: 360, likes: 41, replies: 22, city: 'new-york-ny',
    body: 'Anyone doing solo going-out nights? Looking for community in a new city. Trust-first apps are the future.' },
  { key: 'marcusD', author: 'marcusD', category: 'thought', minutes: 1440, likes: 183, replies: 67, city: 'chicago-il',
    body: 'Vouching system completely changed how I meet people. 2 months in — made 8 real friends, not followers.' },
  { key: 'jasmine', author: 'jasmine', category: 'event', minutes: 240, likes: 29, replies: 18, city: 'atlanta-ga',
    body: 'Hosting a dinner for 8 in Atlanta next Friday. Need 3 more seats filled. You must have 10+ vouches to come.' },
];
const pinIds = {};
for (const p of pinDefs) {
  const author = CAST.find((c) => c.key === p.author);
  const v = p.venue ? VENUES.find((x) => x.key === p.venue) : null;
  const demoCity = p.city ? DEMO_CITIES.find((d) => d.slug === p.city) : null;
  const loc = v ? [v.lng, v.lat] : p.loc ? PLACES[p.loc] : demoCity ? [demoCity.lng, demoCity.lat] : PLACES.dc;
  const [row] = await must(db.from('pins').insert({
    author_id: ids[p.author], category: p.category, body: p.body, audience: 'everyone',
    approx_location: point(loc), city_id: cities[p.city ?? author.city], place_label: p.place ?? null,
    venue_id: p.venue ? venue[p.venue] : null, going_out_post_id: p.goingOut ? goingOutIds[p.goingOut] : null,
    created_at: minutesAgo(p.minutes),
  }).select('id'), `pin ${p.key}`);
  pinIds[p.key] = row.id;

  // Likes and replies from the wider community (keeps counters honest).
  const likers = community.slice(0, Math.min(p.likes, community.length));
  if (likers.length) await must(db.from('pin_likes').insert(likers.map((k) => ({ pin_id: row.id, user_id: ids[k] }))), `likes ${p.key}`);
  const replies = [
    ...(p.scriptedReplies ?? []).map(([who, body], i) => ({ pin_id: row.id, author_id: ids[who], body, created_at: minutesAgo(p.minutes - 20 - i * 15) })),
    ...Array.from({ length: p.replies }, (_, i) => ({
      pin_id: row.id, author_id: ids[community[(i * 7 + 3) % community.length]], body: GENERIC_REPLIES[i % GENERIC_REPLIES.length],
      created_at: minutesAgo(Math.max(p.minutes - 10 - i * 5, 1)),
    })),
  ];
  if (replies.length) await must(db.from('pin_replies').insert(replies), `replies ${p.key}`);
  if (p.tags) await must(db.from('pin_tags').insert(p.tags.map((k) => ({ pin_id: row.id, user_id: ids[k] }))), `tags ${p.key}`);
}
await must(db.from('pin_bookmarks').insert([
  { pin_id: pinIds.jordanDrop, user_id: ids.dom, created_at: minutesAgo(120) },
  { pin_id: pinIds.mayaQ, user_id: ids.dom, created_at: minutesAgo(180) },
  { pin_id: pinIds.jordanRecap, user_id: ids.dom, created_at: minutesAgo(300) },
]), 'bookmarks');

// ── 11. Conversations ─────────────────────────────────────────────────────
async function directChat(other, lines) {
  const a = ids.dom < ids[other] ? ids.dom : ids[other];
  const b = ids.dom < ids[other] ? ids[other] : ids.dom;
  const [conv] = await must(db.from('conversations').insert({ kind: 'direct', direct_a: a, direct_b: b }).select('id'), `dm ${other}`);
  await must(db.from('conversation_members').insert([{ conversation_id: conv.id, user_id: ids.dom }, { conversation_id: conv.id, user_id: ids[other] }]), `dm members ${other}`);
  for (const [who, body, mins] of lines) {
    await must(db.from('messages').insert({ conversation_id: conv.id, sender_id: ids[who], body, created_at: minutesAgo(mins) }), `msg ${other}`);
  }
}
await directChat('maya', [['maya', 'Going out tonight — Founding Farmers, Tysons. Come through if you want an intro to some good people.', 2]]);
await directChat('jordan', [['jordan', 'Dinner confirmed. 2 spots left at Bresca tonight — bring someone good.', 60]]);
await directChat('naomi', [['naomi', 'Saturday 7AM Rock Creek run — you coming? All paces welcome. Good group.', 180]]);
await directChat('deshawn', [
  ['deshawn', 'Jordan said we should meet. Tail Up Goat tonight around 9 if you are around. Good bar, easy vibe.', 300],
]);

async function groupChat(groupKey, lines) {
  const [conv] = await must(db.from('conversations').insert({ kind: 'group', group_id: groupIds[groupKey] }).select('id'), `group chat ${groupKey}`);
  const members = await must(db.from('group_members').select('user_id').eq('group_id', groupIds[groupKey]), 'group members');
  await must(db.from('conversation_members').insert(members.map((m) => ({ conversation_id: conv.id, user_id: m.user_id }))), 'group chat members');
  for (const [who, body, mins] of lines) {
    await must(db.from('messages').insert({ conversation_id: conv.id, sender_id: ids[who], body, created_at: minutesAgo(mins) }), 'group msg');
  }
}
await groupChat('otf', [['priya', 'Saturday 9AM is confirmed! Who is bringing the bands?', 40], ['maya', 'Sfoglina brunch after? 🙋', 30]]);
await groupChat('pkl', [['cameron', 'Courts locked in Sunday 8AM. 6 confirmed.', 130], ['jordan', 'Silver Branch beers after?', 120]]);
await groupChat('run', [['naomi', 'Saturday route: P St → Beach Drive → back. ~4 miles.', 250], ['jordan', 'See everyone at 7!', 240]]);
for (const g of ['supper', 'howard', 'gallery', 'wine', 'wellness', 'books']) await groupChat(g, []);

// ── 12. Top 8 + notifications ─────────────────────────────────────────────
await must(db.from('top_friends').insert(['maya', 'jordan', 'naomi', 'deshawn'].map((k, i) => ({ user_id: ids.dom, friend_id: ids[k], position: i + 1 }))), 'top 8');
await must(db.from('notifications').insert([
  { user_id: ids.dom, kind: 'going_out', title: 'Maya T. is going out tonight', body: 'Founding Farmers · Tysons · 7PM', actor_id: ids.maya, created_at: minutesAgo(2) },
  { user_id: ids.dom, kind: 'pin_reply', title: 'Jordan replied to your pin', body: 'Tail Up Goat. Bar is better than the food...', actor_id: ids.jordan, link: `/pins/${pinIds.domQ}`, created_at: minutesAgo(60) },
  { user_id: ids.dom, kind: 'ai_pick', title: 'AI pick for tonight', body: 'Jordan dinner — Aaliyah will be there', is_ai: true, created_at: minutesAgo(20) },
  { user_id: ids.dom, kind: 'momentum', title: 'Social Momentum rising', body: '6 people from your circle converging tonight', is_ai: true, created_at: minutesAgo(10) },
  { user_id: ids.dom, kind: 'message', title: 'New message from DeShawn', body: 'Tail Up Goat tonight around 9...', actor_id: ids.deshawn, created_at: minutesAgo(300) },
], { defaultToNull: false }), 'notifications');

// ── Done ──────────────────────────────────────────────────────────────────
const dom = await must(db.from('profiles').select('display_name, vouch_count, is_founding_member, invite_code').eq('id', ids.dom).single(), 'check dom');
const jordan = await must(db.from('profiles').select('vouch_count, top_vouch_word').eq('id', ids.jordan).single(), 'check jordan');
console.log(`\n✅ Seeded ${CAST.length} cast + ${COMMUNITY_SIZE} community members, ${planned.length} vouches.`);
console.log(`   ${dom.display_name}: ${dom.vouch_count} vouches, founding=${dom.is_founding_member}, invite code ${dom.invite_code}`);
console.log(`   Jordan: ${jordan.vouch_count} vouches, top word ${jordan.top_vouch_word}`);
console.log(`\n   Demo login → dom@imin.test / ${DEMO_PASSWORD}`);
