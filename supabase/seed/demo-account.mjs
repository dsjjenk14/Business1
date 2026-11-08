#!/usr/bin/env node
/**
 * I'm In: a demo account for showing the app (DEVELOPMENT ONLY).
 *
 *   npm run db:fresh   # reset + the regular seed
 *   npm run db:demo    # this script
 *
 * Adds "Sam Carter" (demo@imin.test / ImIn-demo-2026): exactly 10 vouches, and 20 Insiders who are
 * all different: names, ages, jobs, neighborhoods, interests, moods, prompts, badges, vouch levels,
 * and an illustrated portrait each (drawn here, not real people's photos). Each Insider also has a pin.
 *
 * Same safety rules as the seed: local Supabase only, never a database marked production.
 */
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

import { DEMO_PASSWORD, PLACES } from './cast.mjs';

function localCredentials() {
  const out = execSync('npx supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const s = JSON.parse(out.slice(out.indexOf('{')));
  return { url: s.API_URL, key: s.SERVICE_ROLE_KEY };
}
const creds = localCredentials();
const host = new URL(creds.url).hostname;
if (host !== 'localhost' && host !== '127.0.0.1') {
  console.error(`Refusing to add demo data to ${host}. Local Supabase only.`);
  process.exit(1);
}
const db = createClient(creds.url, creds.key, { auth: { persistSession: false, autoRefreshToken: false } });
async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}
const env = await must(db.from('app_config').select('value').eq('key', 'environment').maybeSingle(), 'environment');
if (env?.value === 'production') {
  console.error('This database is marked production. Aborted.');
  process.exit(1);
}
const { data: existing } = await db.from('profiles').select('id').eq('display_name', 'Sam C.').maybeSingle();
if (existing) {
  console.error('The demo account already exists. Run `npm run db:fresh` first.');
  process.exit(1);
}

const daysAgo = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
const point = ([lng, lat]) => `SRID=4326;POINT(${lng} ${lat})`;
const birthdate = (age) => `${new Date().getFullYear() - age}-0${1 + (age % 9)}-1${age % 9}`;
const cities = Object.fromEntries((await must(db.from('cities').select('id, slug'), 'cities')).map((c) => [c.slug, c.id]));
const words = Object.fromEntries((await must(db.from('vouch_words').select('id, word'), 'words')).map((w) => [w.word, w.id]));

// ── The 20 Insiders ──────────────────────────────────────────────────────
// look: [skin, hair color, hair style, shirt, background A, background B, extras]
const PEOPLE = [
  { key: 'demo01', full: 'Imani Brooks', display: 'Imani B.', age: 29, city: 'washington-dc', hood: 'Shaw', loc: 'shaw', pronouns: 'She/Her',
    headline: 'Pediatric nurse', bio: 'Night shifts, early brunches. Always looking for a new live music spot.', mood: 'Running on cold brew',
    interests: ['brunch', 'live_music', 'rnb', 'yoga'], prompts: [['ideal_friday', 'Dinner with my girls, then a jazz bar'], ['go_to_order', 'Shrimp and grits, extra hot sauce']],
    vouches: 12, word: 'Welcoming', color: 'red', badges: ['photo', 'id'], look: ['#8D5524', '#1B1B1B', 'curls', '#D62828', '#3a1414', '#7a2a2a', 'earrings'],
    pin: ['question', 'Anyone know a quiet spot in Shaw for a Sunday book club?'] },
  { key: 'demo02', full: 'Marcus Lee', display: 'Marcus L.', age: 34, city: 'arlington-va', hood: 'Clarendon', loc: 'arlington', pronouns: 'He/Him',
    headline: 'Software engineer', bio: 'Pickleball on weekends, board games on weeknights. Will build you a spreadsheet for the group trip.', mood: 'Down for pickleball',
    interests: ['pickleball', 'board_games', 'tech', 'coffee'], prompts: [['friend_who', 'Makes the group trip spreadsheet']],
    vouches: 31, word: 'Reliable', color: 'blue', badges: ['photo', 'founding'], look: ['#E0AC69', '#2C1B10', 'short', '#2D6CDF', '#14213a', '#2a4a7a', 'glasses'],
    pin: ['going_out', 'Pickleball at Quincy Park at 10 tomorrow. Need two more.'] },
  { key: 'demo03', full: 'Sofia Ramirez', display: 'Sofia R.', age: 27, city: 'washington-dc', hood: 'Columbia Heights', loc: 'columbiaHeights', pronouns: 'She/Her',
    headline: 'Event planner', bio: 'I plan parties for a living and for fun. Salsa Thursdays, rooftops Fridays.', mood: 'Planning something fun',
    interests: ['dancing', 'rooftops', 'cocktails', 'festivals'], prompts: [['learning', 'Bachata, and it shows'], ['never_miss', 'A rooftop happy hour']],
    vouches: 78, word: 'Connector', color: 'gold', badges: ['photo', 'id', 'host'], look: ['#C68642', '#3B1F0E', 'long', '#D4AF37', '#3a2f14', '#6a5520', ''],
    pin: ['event', 'Rooftop salsa night Friday. Beginners welcome, I will teach you the basic step.'] },
  { key: 'demo04', full: 'Kwame Mensah', display: 'Kwame M.', age: 38, city: 'silver-spring-md', hood: 'Silver Spring', loc: 'silverSpring', pronouns: 'He/Him',
    headline: 'High school history teacher', bio: 'Coach, dad, amateur chef. Ask me about jollof.', mood: 'Grading papers, send help',
    interests: ['cooking', 'basketball', 'books', 'volunteering'], prompts: [['ask_me_about', 'Which jollof is best (it is Ghana)']],
    vouches: 104, word: 'Leader', color: 'green', badges: ['photo', 'id', 'background'], look: ['#5C3A21', '#111111', 'buzz', '#2E9E5B', '#14301f', '#1f5a39', 'beard'],
    pin: ['thought', 'Hosting a cookout for the team parents Saturday. Bringing two kinds of jollof to settle it.'] },
  { key: 'demo05', full: 'Hannah Kim', display: 'Hannah K.', age: 26, city: 'washington-dc', hood: 'Navy Yard', loc: 'navyYard', pronouns: 'She/They',
    headline: 'Graphic designer', bio: 'Film photography, thrift stores, and every museum pop-up in the city.', mood: 'Shooting film this weekend',
    interests: ['photography', 'art', 'fashion', 'film'], prompts: [['two_truths', 'I have met Questlove, I can juggle, I hate brunch']],
    vouches: 6, word: 'Creative', color: 'blue', badges: ['photo'], look: ['#F1C27D', '#0F0F0F', 'bob', '#6A4C93', '#241a33', '#4a3570', ''],
    pin: ['photos', 'Golden hour at the Wharf. Who wants to do a photo walk next week?'] },
  { key: 'demo06', full: 'Darnell Washington', display: 'Darnell W.', age: 41, city: 'washington-dc', hood: 'Capitol Hill', loc: 'capitolHill', pronouns: 'He/Him',
    headline: 'Attorney · Howard Law', bio: 'Go-go, golf, and good conversation. Proud Bison.', mood: 'Courtroom by day, go-go by night',
    interests: ['go_go', 'golf', 'hbcu', 'politics'], prompts: [['hype_song', 'Anything by Chuck Brown'], ['green_flag', 'Shows up on time']],
    vouches: 312, word: 'Leader', color: 'red', badges: ['photo', 'id', 'background', 'founding'], look: ['#4A2C17', '#2a2a2a', 'bald', '#1A1A2E', '#2a1414', '#5a1f1f', 'beard'],
    pin: ['thought', 'Go-go at the Black Cat Friday. Bring somebody who has never been.'] },
  { key: 'demo07', full: 'Priya Natarajan', display: 'Priya N.', age: 31, city: 'tysons-va', hood: 'Tysons', loc: 'tysons', pronouns: 'She/Her',
    headline: 'Product manager', bio: 'Half-marathons and chai. Building a running club for people who hate running.', mood: 'Training for a half',
    interests: ['running', 'fitness', 'startups', 'wellness'], prompts: [['perfect_sunday', 'Long run, longer brunch']],
    vouches: 18, word: 'Adventurous', color: 'green', badges: ['photo', 'id'], look: ['#C68642', '#140c06', 'bun', '#F77F00', '#3a2510', '#6a4515', 'earrings'],
    pin: ['going_out', 'Easy 5K along the W&OD trail Sunday 8 AM. Pace: chatting speed.'] },
  { key: 'demo08', full: 'Tyler Brennan', display: 'Tyler B.', age: 24, city: 'washington-dc', hood: 'U Street', loc: 'ustreet', pronouns: 'He/Him',
    headline: 'Bartender at a speakeasy', bio: 'I will make you a drink you did not know you needed. Comedy open mics on Tuesdays.', mood: 'Behind the bar till 2',
    interests: ['cocktails', 'comedy', 'karaoke', 'house'], prompts: [['go_to_order', 'Mezcal negroni']],
    vouches: 3, word: 'Fun', color: 'gold', badges: ['photo'], look: ['#FFDBAC', '#B5651D', 'messy', '#264653', '#142a30', '#1f4a55', ''],
    pin: ['question', 'Best karaoke night in DC? Asking for my whole friend group.'] },
  { key: 'demo09', full: 'Aaliyah Grant', display: 'Aaliyah G.', age: 33, city: 'alexandria-va', hood: 'Old Town', loc: 'arlington', pronouns: 'She/Her',
    headline: 'Real estate agent', bio: 'Old Town born and raised. Wine, dogs, and Sunday farmers markets.', mood: 'Open house all weekend',
    interests: ['wine', 'dogs', 'brunch', 'networking'], prompts: [['ideal_friday', 'Wine bar, then my couch']],
    vouches: 45, word: 'Generous', color: 'red', badges: ['photo', 'founding'], look: ['#6F4E37', '#2b1408', 'locs', '#9B2226', '#2a1010', '#5a1a1a', 'earrings'],
    pin: ['photos', 'My dog Biscuit at the Old Town farmers market. Dog people, say hi.'] },
  { key: 'demo10', full: 'Diego Alvarez', display: 'Diego A.', age: 36, city: 'washington-dc', hood: 'Petworth', loc: 'petworth', pronouns: 'He/Him',
    headline: 'Chef and restaurant owner', bio: 'Running a small Mexican spot in Petworth. Supper clubs once a month.', mood: 'Prepping 40 tamales',
    interests: ['cooking', 'foodie', 'travel', 'soccer'].filter((k) => k !== 'soccer').concat(['watch_sports']), prompts: [['never_miss', 'The farmers market on Saturday']],
    vouches: 1040, word: 'Foodie', color: 'gold', badges: ['photo', 'id', 'host', 'notable'], look: ['#A0522D', '#151515', 'short', '#E9C46A', '#3a3014', '#6a5a20', 'beard'],
    pin: ['event', 'Supper club this month: mole night. 12 seats.'] },
  { key: 'demo11', full: 'Grace Okafor', display: 'Grace O.', age: 45, city: 'bethesda-md', hood: 'Bethesda', loc: 'bethesda', pronouns: 'She/Her',
    headline: 'Doctor · Johns Hopkins', bio: 'Empty nester exploring the city again. Tennis, theater, and trying every new restaurant.', mood: 'Back on the tennis court',
    interests: ['tennis', 'theater', 'foodie', 'faith'], prompts: [['learning', 'Pickleball, finally']],
    vouches: 27, word: 'Thoughtful', color: 'blue', badges: ['photo', 'id', 'background'], look: ['#3D2314', '#1a1a1a', 'wrap', '#118AB2', '#102a33', '#1a4a5a', 'glasses'],
    pin: ['question', 'Theater people: what is worth seeing at the Kennedy Center this month?'] },
  { key: 'demo12', full: 'Jamal Carter', display: 'Jamal C.', age: 28, city: 'washington-dc', hood: 'H Street', loc: 'hStreet', pronouns: 'He/Him',
    headline: 'Personal trainer', bio: 'Pushing people to their limits, then buying them a smoothie.', mood: 'Leg day, every day',
    interests: ['fitness', 'basketball', 'hip_hop', 'wellness'], prompts: [['friend_who', 'Will drag you to the gym at 6 AM']],
    vouches: 9, word: 'Fun', color: 'red', badges: ['photo'], look: ['#5C3A21', '#0d0d0d', 'fade', '#E63946', '#2a1012', '#5a1a20', ''],
    pin: ['going_out', 'Pickup basketball at Rose Park 6 PM. All levels.'] },
  { key: 'demo13', full: 'Emily Chen', display: 'Emily C.', age: 30, city: 'arlington-va', hood: 'Ballston', loc: 'arlington', pronouns: 'She/Her',
    headline: 'Policy analyst', bio: 'Trivia captain. Book club founder. Will absolutely beat you at Catan.', mood: 'Trivia captain tonight',
    interests: ['books', 'board_games', 'politics', 'coffee'], prompts: [['two_truths', 'I won a trivia championship, I hate cats, I speak three languages']],
    vouches: 15, word: 'Thoughtful', color: 'green', badges: ['photo', 'id'], look: ['#FFE0BD', '#0a0a0a', 'long', '#43AA8B', '#10302a', '#1a5a4a', 'glasses'],
    pin: ['event', 'Trivia team needs a sports expert for Wednesday. We are terrible at sports.'] },
  { key: 'demo14', full: 'Andre Dubois', display: 'Andre D.', age: 39, city: 'washington-dc', hood: 'Logan Circle', loc: 'logan', pronouns: 'He/Him',
    headline: 'Jazz pianist', bio: 'Playing Thursday nights in Logan Circle. Come say hi between sets.', mood: 'Thursday set at 9',
    interests: ['jazz', 'live_music', 'wine', 'art'], prompts: [['hype_song', 'Herbie Hancock, Chameleon']],
    vouches: 66, word: 'Creative', color: 'gold', badges: ['photo', 'host'], look: ['#8D5524', '#cfcfcf', 'short', '#14213D', '#101420', '#202a40', 'beard'],
    pin: ['event', 'Jazz trio Thursday at 9. No cover, good wine.'] },
  { key: 'demo15', full: 'Olivia Martin', display: 'Olivia M.', age: 22, city: 'washington-dc', hood: 'Georgetown', loc: 'dc', pronouns: 'She/Her',
    headline: 'Georgetown senior', bio: 'New to going out beyond campus. Show me your favorite spots.', mood: 'Finals almost over',
    interests: ['brunch', 'dancing', 'fashion', 'travel'], prompts: [['ask_me_about', 'My semester in Seoul']],
    vouches: 0, word: null, color: 'red', badges: ['photo'], look: ['#FFDBAC', '#E6BE8A', 'long', '#FF6B6B', '#3a1a1a', '#6a2a2a', 'earrings'],
    pin: ['question', 'Where should a new grad go out in DC that is not a college bar?'] },
  { key: 'demo16', full: 'Samuel Osei', display: 'Samuel O.', age: 35, city: 'silver-spring-md', hood: 'Takoma Park', loc: 'silverSpring', pronouns: 'He/Him',
    headline: 'Nonprofit director', bio: 'Organizing volunteer days and potlucks. Cyclist. Gardener.', mood: 'Garden is finally growing',
    interests: ['volunteering', 'cycling', 'cooking', 'faith'], prompts: [['green_flag', 'Brings a dish to the potluck']],
    vouches: 38, word: 'Community', color: 'green', badges: ['photo', 'id', 'background'], look: ['#3D2314', '#1a1a1a', 'buzz', '#588157', '#1a2a1a', '#2a4a2a', 'glasses'],
    pin: ['event', 'Volunteer day at the community garden Saturday morning, then a potluck.'] },
  { key: 'demo17', full: 'Mia Rossi', display: 'Mia R.', age: 32, city: 'washington-dc', hood: 'Adams Morgan', loc: 'columbiaHeights', pronouns: 'She/Her',
    headline: 'Yoga instructor', bio: 'Sunrise yoga, sunset spritz. Balance is everything.', mood: 'Sunrise flow at 7',
    interests: ['yoga', 'wellness', 'hiking', 'wine'], prompts: [['perfect_sunday', 'Sunrise yoga, then a long hike']],
    vouches: 22, word: 'Welcoming', color: 'blue', badges: ['photo'], look: ['#F1C27D', '#4a2511', 'bun', '#8ECAE6', '#14262e', '#204a5a', 'earrings'],
    pin: ['going_out', 'Free yoga in Meridian Hill Park Sunday at 9. Bring a mat.'] },
  { key: 'demo18', full: 'Xavier Johnson', display: 'Xavier J.', age: 27, city: 'washington-dc', hood: 'Navy Yard', loc: 'navyYard', pronouns: 'He/Him',
    headline: 'Sports reporter', bio: 'Covering the Nats and the Commanders. Will talk sports at any bar.', mood: 'Game day',
    interests: ['watch_sports', 'basketball', 'golf', 'happy_hour'], prompts: [['never_miss', 'A home opener']],
    vouches: 11, word: 'Fun', color: 'red', badges: ['photo', 'id'], look: ['#6F4E37', '#0a0a0a', 'fade', '#AB2346', '#2a1018', '#5a1a2a', ''],
    pin: ['going_out', 'Watching the game at a Navy Yard bar tonight. Come through.'] },
  { key: 'demo19', full: 'Leila Haddad', display: 'Leila H.', age: 37, city: 'alexandria-va', hood: 'Del Ray', loc: 'arlington', pronouns: 'She/Her',
    headline: 'Architect', bio: 'Sketching buildings, finding hidden gardens, and the best baklava in Virginia.', mood: 'Sketching at a cafe',
    interests: ['art', 'coffee', 'hiking', 'books'], prompts: [['ask_me_about', 'The building I would save from demolition']],
    vouches: 54, word: 'Authentic', color: 'gold', badges: ['photo', 'id', 'founding'], look: ['#C68642', '#2a1206', 'wavy', '#BC6C25', '#2a1a10', '#5a3a1a', 'glasses'],
    pin: ['photos', 'Found a hidden garden in Del Ray. Sketch club meets there Sunday.'] },
  { key: 'demo20', full: 'Noah Patel', display: 'Noah P.', age: 25, city: 'tysons-va', hood: 'Vienna', loc: 'vienna', pronouns: 'He/Him',
    headline: 'Startup founder', bio: 'Building a climate startup. Founder dinners, hikes, and too much coffee.', mood: 'Fundraising, pray for me',
    interests: ['startups', 'tech', 'hiking', 'networking'], prompts: [['learning', 'How to say no to meetings']],
    vouches: 7, word: 'Adventurous', color: 'blue', badges: ['photo'], look: ['#E0AC69', '#1a0f05', 'messy', '#023047', '#0a1a22', '#123a4a', ''],
    pin: ['event', 'Founder dinner in Tysons next Thursday. Six seats, no pitching allowed.'] },
];

const ME = {
  key: 'demo', full: 'Sam Carter', display: 'Sam C.', age: 30, city: 'washington-dc', hood: 'Shaw', loc: 'shaw', pronouns: 'They/Them',
  headline: 'UX researcher', bio: 'New-ish to DC. Here for live music, long dinners and finding my people.', mood: 'Free this weekend',
  interests: ['live_music', 'foodie', 'brunch', 'board_games', 'art'], prompts: [['ideal_friday', 'Dinner with a few friends, then a show']],
  color: 'red', look: ['#A0522D', '#151515', 'curls', '#D62828', '#2a1010', '#5a1f1f', ''],
};

// ── Illustrated portraits ────────────────────────────────────────────────
function portrait([skin, hair, style, shirt, bgA, bgB, extra]) {
  const hairShapes = {
    short: `<path d="M128 170 q72-92 144 0 q-10-36-72-44 q-62 8-72 44z" fill="${hair}"/>`,
    buzz: `<path d="M132 168 q68-70 136 0 q-6-22-68-30 q-62 8-68 30z" fill="${hair}" opacity=".85"/>`,
    fade: `<path d="M130 170 q70-84 140 0 q-8-30-70-38 q-62 8-70 38z" fill="${hair}"/><rect x="128" y="168" width="10" height="34" fill="${hair}" opacity=".5"/><rect x="262" y="168" width="10" height="34" fill="${hair}" opacity=".5"/>`,
    bald: '',
    long: `<path d="M118 180 q82-120 164 0 v140 q-20 10-30 0 v-120 q-52-30-104 0 v120 q-10 10-30 0z" fill="${hair}"/>`,
    bob: `<path d="M116 186 q84-118 168 0 v54 q-14 8-26 0 v-50 q-58-34-116 0 v50 q-12 8-26 0z" fill="${hair}"/>`,
    bun: `<circle cx="200" cy="96" r="30" fill="${hair}"/><path d="M128 172 q72-88 144 0 q-10-34-72-42 q-62 8-72 42z" fill="${hair}"/>`,
    curls: [...Array(11)].map((_, i) => `<circle cx="${130 + i * 14}" cy="${150 - Math.sin((i / 10) * Math.PI) * 40}" r="24" fill="${hair}"/>`).join(''),
    messy: `<path d="M126 172 l14-40 l16 22 l14-34 l16 26 l18-32 l14 30 l18-26 l12 30 l12-20 l10 44 q-70-40-144 0z" fill="${hair}"/>`,
    locs: `<path d="M126 176 q74-100 148 0z" fill="${hair}"/>` + [...Array(8)].map((_, i) => `<rect x="${126 + i * 19}" y="170" width="11" height="${110 + (i % 3) * 16}" rx="5" fill="${hair}"/>`).join(''),
    wrap: `<path d="M118 176 q82-130 164 0 q-20-14-82-18 q-62 4-82 18z" fill="#E9C46A"/><path d="M150 120 q50-40 100 0" stroke="#D62828" stroke-width="10" fill="none"/>`,
    wavy: `<path d="M120 180 q80-118 160 0 q6 70-10 110 q-14-50-20-90 q-50-30-100 0 q-6 40-20 90 q-16-40-10-110z" fill="${hair}"/>`,
  };
  const extras = {
    glasses: '<g stroke="#111" stroke-width="5" fill="none"><circle cx="176" cy="202" r="17"/><circle cx="224" cy="202" r="17"/><path d="M193 202h14"/></g>',
    beard: `<path d="M152 220 q48 70 96 0 q-4 40-48 46 q-44-6-48-46z" fill="${hair}" opacity=".9"/>`,
    earrings: '<circle cx="138" cy="232" r="6" fill="#D4AF37"/><circle cx="262" cy="232" r="6" fill="#D4AF37"/>',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bgA}"/><stop offset="1" stop-color="${bgB}"/></linearGradient></defs>
  <rect width="400" height="400" fill="url(#g)"/>
  ${style === 'long' || style === 'wavy' || style === 'locs' ? hairShapes[style] : ''}
  <path d="M70 400 q12-110 130-110 q118 0 130 110z" fill="${shirt}"/>
  <rect x="178" y="250" width="44" height="50" rx="16" fill="${skin}"/>
  <ellipse cx="138" cy="214" rx="12" ry="18" fill="${skin}"/><ellipse cx="262" cy="214" rx="12" ry="18" fill="${skin}"/>
  <ellipse cx="200" cy="206" rx="64" ry="78" fill="${skin}"/>
  ${style === 'long' || style === 'wavy' || style === 'locs' ? `<path d="M126 176 q74-100 148 0 q-14-30-74-38 q-60 8-74 38z" fill="${hair}"/>` : hairShapes[style] ?? ''}
  <circle cx="176" cy="204" r="6" fill="#1a1a1a"/><circle cx="224" cy="204" r="6" fill="#1a1a1a"/>
  <path d="M182 244 q18 14 36 0" stroke="#5a2a1a" stroke-width="5" fill="none" stroke-linecap="round"/>
  ${extra ? extras[extra] : ''}
</svg>`;
}

async function renderPortraits(people) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    try {
      // Some setups install Playwright globally, where only require() finds it.
      const { createRequire } = await import('node:module');
      ({ chromium } = createRequire(import.meta.url)('playwright'));
    } catch {
      chromium = null;
    }
  }
  if (!chromium) {
    console.log('Playwright isn’t installed, so the demo people get initials instead of portraits.');
    return {};
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  const out = {};
  for (const p of people) {
    await page.setContent(`<html><body style="margin:0">${portrait(p.look)}</body></html>`);
    out[p.key] = await page.screenshot({ type: 'png' });
  }
  await browser.close();
  return out;
}

// ── Create everyone ──────────────────────────────────────────────────────
const ids = {};
let phoneN = 7000;
for (const p of [ME, ...PEOPLE]) {
  const data = await must(db.auth.admin.createUser({
    email: `${p.key}@imin.test`,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: p.full, birthdate: birthdate(p.age), city_slug: p.city, phone: `+1202557${phoneN++}`, accepted_terms: true },
  }), `create ${p.key}`);
  ids[p.key] = data.user.id;
}

console.log('Drawing portraits…');
const images = await renderPortraits([ME, ...PEOPLE]);
for (const p of [ME, ...PEOPLE]) {
  let avatar = null;
  if (images[p.key]) {
    const path = `${ids[p.key]}/portrait.png`;
    await must(db.storage.from('avatars').upload(path, images[p.key], { contentType: 'image/png', upsert: true }), `upload ${p.key}`);
    // Relative to the app's own address, so it works through any preview link.
    avatar = `/storage/v1/object/public/avatars/${path}`;
  }
  const b = p.badges ?? ['photo'];
  await must(db.from('profiles').update({
    display_name: p.display,
    headline: p.headline,
    bio: p.bio,
    pronouns: p.pronouns,
    mood: p.mood,
    neighborhood: p.hood,
    city_id: cities[p.city],
    approx_location: point(PLACES[p.loc]),
    interests: p.interests,
    prompts: p.prompts.map(([key, answer]) => ({ key, answer })),
    profile_color: p.color,
    avatar_url: avatar,
    avatar_emoji: null,
    photo_verified_at: b.includes('photo') ? daysAgo(30) : null,
    id_verified_at: b.includes('id') ? daysAgo(25) : null,
    background_checked_at: b.includes('background') ? daysAgo(40) : null,
    verified_host: b.includes('host'),
    is_founding_member: b.includes('founding'),
    notable_at: b.includes('notable') ? daysAgo(10) : null,
    created_at: daysAgo(120),
  }).eq('id', ids[p.key]), `profile ${p.key}`);
}

// ── Sam's Insiders: all 20 ───────────────────────────────────────────────
const pair = (a, b) => (a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a });
await must(db.from('connections').insert(PEOPLE.map((p, i) => ({
  ...pair(ids.demo, ids[p.key]),
  source: i % 3 === 0 ? 'intro' : i % 3 === 1 ? 'event' : 'qr',
  created_at: daysAgo(20 + i * 3),
}))), 'connections');
// Enough back-and-forths to message the first eight.
for (const p of PEOPLE.slice(0, 8)) {
  await must(db.from('interactions').upsert({ ...pair(ids.demo, ids[p.key]), turns: 12, exchanges: 6, last_sender: ids[p.key] }), 'interactions');
}

// ── Exactly 10 vouches for Sam, from 10 Insiders they met in person ───────
const SAM_WORDS = ['Welcoming', 'Authentic', 'Thoughtful', 'Fun', 'Reliable', 'Creative', 'Connector', 'Foodie', 'Generous', 'Community'];
const vouchers = PEOPLE.slice(0, 10);
for (const [i, p] of vouchers.entries()) {
  const start = daysAgo(5 + i * 4);
  const [enc] = await must(db.from('encounters').insert({
    ...pair(ids.demo, ids[p.key]), context: 'venue', place_label: p.hood, distance_m: 8 + i,
    overlap_start: start, overlap_end: new Date(new Date(start).getTime() + 90 * 60_000).toISOString(), created_at: start,
  }).select('id'), 'encounter');
  await must(db.from('vouches').insert({
    voucher_id: ids[p.key], vouchee_id: ids.demo, type: 'gps', word_id: words[SAM_WORDS[i]], encounter_id: enc.id, created_at: start,
  }), 'vouch');
}

// ── Each Insider's vouch level, and a pin each ───────────────────────────
// Vouch counts are set directly so every level shows (bronze through diamond); their word is the top word.
for (const p of PEOPLE) {
  await must(db.from('profiles').update({ vouch_count: p.vouches, top_vouch_word: p.word }).eq('id', ids[p.key]), `vouch level ${p.key}`);
}
await must(db.from('pins').insert(PEOPLE.map((p, i) => ({
  author_id: ids[p.key], category: p.pin[0], body: p.pin[1], approx_location: point(PLACES[p.loc]),
  city_id: cities[p.city], created_at: daysAgo(i % 5 + 0.1),
}))), 'pins');

const { data: me } = await db.from('profiles').select('vouch_count').eq('id', ids.demo).single();
console.log(`\nDemo account ready: demo@imin.test / ${DEMO_PASSWORD}`);
console.log(`   Sam C.: ${me.vouch_count} vouches, 20 Insiders.`);
