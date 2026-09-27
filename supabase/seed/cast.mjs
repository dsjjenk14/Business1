// Demo cast for I'm In, taken from the prototype (reference/imin-final-v2.html).
// Used only by run-seed.mjs. Never imported by the app.

export const DEMO_PASSWORD = 'ImIn-demo-2026';

// Approximate coordinates [lng, lat] for neighborhoods and venues.
export const PLACES = {
  fairfax: [-77.3064, 38.8462],
  fairfaxCorner: [-77.2750, 38.8580],
  vienna: [-77.2653, 38.9012],
  mosaic: [-77.2296, 38.8726],
  merrifield: [-77.2330, 38.8740],
  reston: [-77.3570, 38.9586],
  arlington: [-77.1067, 38.8816],
  logan: [-77.0318, 38.9097],
  shaw: [-77.0219, 38.9126],
  ustreet: [-77.0289, 38.9170],
  columbiaHeights: [-77.0325, 38.9283],
  petworth: [-77.0240, 38.9420],
  navyYard: [-77.0030, 38.8765],
  capitolHill: [-76.9955, 38.8899],
  hStreet: [-76.9885, 38.9003],
  tysons: [-77.2311, 38.9187],
  silverSpring: [-77.0261, 38.9907],
  bethesda: [-77.0947, 38.9807],
  dc: [-77.0369, 38.9072],
  rockCreek: [-77.0500, 38.9580],
};

/**
 * key: stable id used inside the seed
 * vouches: target vouch count shown in the prototype
 * topWord: the word most of their vouchers use
 */
export const CAST = [
  { key: 'dom', full: 'Dominique J.', display: 'Dominique J.', age: 31, city: 'fairfax-va', hood: 'Fairfax', loc: 'fairfax',
    pronouns: 'She/Her', headline: 'Howard Alum · Fairfax, VA', vouches: 3, topWord: null, idVerified: true,
    bio: 'Legal recruiting · DC Metro · Pickleball · OrangeTheory · great table and better conversation.' },
  { key: 'maya', full: 'Maya Thompson', display: 'Maya T.', age: 28, city: 'washington-dc', hood: 'Tysons', loc: 'tysons',
    pronouns: 'She/Her', headline: 'Connector · DC', vouches: 42, topWord: 'Connector',
    bio: 'Food, music, and people worth knowing. I host a brunch club. Will tell you exactly which tables to request at any restaurant in DC.' },
  { key: 'jordan', full: 'Jordan Taylor', display: 'Jordan T.', age: 34, city: 'washington-dc', hood: 'Logan Circle', loc: 'logan',
    pronouns: 'He/Him', headline: 'Leader · DC', vouches: 61, topWord: 'Leader',
    bio: 'I run a supper club. Every dinner is 6 people, one table, no phones after appetizers. If you get a seat, someone vouched hard for you.' },
  { key: 'naomi', full: 'Naomi Reyes', display: 'Naomi R.', age: 29, city: 'silver-spring-md', hood: 'Silver Spring', loc: 'silverSpring',
    pronouns: 'She/Her', headline: 'Welcoming · DC', vouches: 35, topWord: 'Welcoming',
    bio: 'Community first. I run the DC Morning Runners group. If you show up, you will feel at home.' },
  { key: 'deshawn', full: 'DeShawn Lewis', display: 'DeShawn L.', age: 27, city: 'washington-dc', hood: 'U Street', loc: 'ustreet',
    pronouns: 'He/Him', headline: 'Scene scout · DC', vouches: 29, topWord: 'Authentic',
    bio: 'U Street local. Good at finding the right room on a Saturday night.' },
  { key: 'simone', full: 'Simone Carter', display: 'Simone Carter', age: 31, city: 'washington-dc', hood: 'DC', loc: 'dc',
    pronouns: 'She/Her', headline: 'Foodie · DC', vouches: 38, topWord: 'Foodie',
    bio: 'If I recommend a restaurant, book it that week. Bresca regular and Jordan dinner alumna.' },
  { key: 'priya', full: 'Priya Nair', display: 'Priya Nair', age: 32, city: 'tysons-va', hood: 'Tysons', loc: 'tysons',
    pronouns: 'She/Her', headline: 'OTF Tysons owner', vouches: 47, topWord: 'Adventurous',
    bio: 'OTF Tysons owner. Built half my network through early morning classes. Show up consistently and I will vouch for you.' },
  { key: 'aaliyah', full: 'Aaliyah Brooks', display: 'Aaliyah Brooks', age: 34, city: 'washington-dc', hood: 'Petworth', loc: 'petworth',
    pronouns: 'She/Her', headline: 'Howard alum · Welcoming', vouches: 51, topWord: 'Welcoming',
    bio: 'Community builder, Bresca regular, Howard alum. Jordan dinners are my favorite thing in DC.' },
  { key: 'reina', full: 'Reina Vasquez', display: 'Reina Vasquez', age: 26, city: 'washington-dc', hood: 'Columbia Heights', loc: 'columbiaHeights',
    pronouns: 'She/Her', headline: 'Songbyrd host', vouches: 44, topWord: 'Creative',
    bio: 'Music, art, community events. Songbyrd host. Ari vouched me in.' },
  { key: 'darius', full: 'Darius Cole', display: 'Darius Cole', age: 36, city: 'washington-dc', hood: 'Navy Yard', loc: 'navyYard',
    pronouns: 'He/Him', headline: "Jordan's dinner crew", vouches: 44, topWord: 'Fun',
    bio: 'Sports and music. I find good rooms and good people. Jordan dinner regular.' },
  { key: 'marcus', full: 'Marcus Bell', display: 'Marcus Bell', age: 29, city: 'washington-dc', hood: 'Shaw', loc: 'shaw',
    pronouns: 'He/Him', headline: 'UX designer · Shaw', vouches: 22, topWord: 'Thoughtful',
    bio: 'UX designer. Maya introduced us. Just getting started on here but already loving the vibe.' },
  { key: 'ari', full: 'Ari Mendez', display: 'Ari M.', age: 27, city: 'washington-dc', hood: 'Columbia Heights', loc: 'columbiaHeights',
    pronouns: 'She/Her', headline: 'Creative community', vouches: 8, topWord: 'Creative', idVerified: true,
    bio: 'Music, art, creative community. Reina vouched me in personally.' },
  { key: 'omar', full: 'Omar Saleh', display: 'Omar S.', age: 37, city: 'washington-dc', hood: 'H Street NE', loc: 'hStreet',
    pronouns: 'He/Him', headline: 'Gallery Night host', vouches: 55, topWord: 'Community',
    bio: 'Gallery Night host. Good people, good art, no pretension.' },
  { key: 'jade', full: 'Jade Morrison', display: 'Jade Morrison', age: 29, city: 'tysons-va', hood: 'Tysons', loc: 'tysons',
    pronouns: 'She/Her', headline: 'OTF crew', vouches: 29, topWord: 'Reliable',
    bio: 'OTF Tysons crew. Priya got me in. The Saturday class is the best hour of my week.' },
  { key: 'cameron', full: 'Cameron Reed', display: 'Cameron Reed', age: 31, city: 'bethesda-md', hood: 'Bethesda', loc: 'bethesda',
    pronouns: 'He/Him', headline: 'Connector · DC', vouches: 33, topWord: 'Connector',
    bio: 'DC Pickleball Crew founder. Courts are booked. 4.0+ and want to meet real people, come Sunday.' },
  { key: 'tyler', full: 'Tyler Morgan', display: 'Tyler M.', age: 28, city: 'washington-dc', hood: 'Capitol Hill', loc: 'capitolHill',
    pronouns: 'She/Her', headline: 'New to DC', vouches: 19, topWord: 'Adventurous',
    bio: 'New to DC from NYC. Building my network through this app.' },
  // Extra 2nd-degree people so Dominique's network matches the prototype's "12".
  { key: 'kendra', full: 'Kendra Ellis', display: 'Kendra E.', age: 30, city: 'arlington-va', hood: 'Clarendon', loc: 'dc',
    pronouns: 'She/Her', headline: 'Brunch club regular', vouches: 17, topWord: 'Fun',
    bio: "Maya's brunch club. Always down for a new spot." },
  { key: 'theo', full: 'Theo Park', display: 'Theo P.', age: 33, city: 'washington-dc', hood: 'Shaw', loc: 'shaw',
    pronouns: 'He/Him', headline: 'Supper club alum', vouches: 24, topWord: 'Thoughtful',
    bio: 'Cook, eater, Jordan dinner alum. Ask me about ramen.' },
  { key: 'lena', full: 'Lena Okafor', display: 'Lena O.', age: 27, city: 'silver-spring-md', hood: 'Silver Spring', loc: 'silverSpring',
    pronouns: 'She/Her', headline: 'Morning runner', vouches: 14, topWord: 'Reliable',
    bio: 'Runs with Naomi most Saturdays. Coffee after is non-negotiable.' },
  // "They're In" community members in other cities.
  { key: 'aaliyahW', full: 'Aaliyah Williams', display: 'Aaliyah W.', age: 29, city: 'new-york-ny', hood: 'Brooklyn', loc: null,
    pronouns: 'She/Her', headline: 'New in NYC', vouches: 31, topWord: 'Welcoming', bio: 'Solo going-out nights, always.' },
  { key: 'marcusD', full: 'Marcus Davis', display: 'Marcus D.', age: 32, city: 'chicago-il', hood: 'Wicker Park', loc: null,
    pronouns: 'He/Him', headline: 'Chicago', vouches: 44, topWord: 'Authentic', bio: 'Made 8 real friends in 2 months. Not followers.' },
  { key: 'jasmine', full: 'Jasmine Turner', display: 'Jasmine T.', age: 30, city: 'atlanta-ga', hood: 'Old Fourth Ward', loc: null,
    pronouns: 'She/Her', headline: 'Atlanta dinner host', vouches: 28, topWord: 'Generous', bio: 'Dinners for 8. Vouches required.' },
];

// Demo-only cities for the "They're In" community tab (inactive = not a launch market).
export const DEMO_CITIES = [
  { slug: 'new-york-ny', name: 'New York, NY', region: 'New York', metro: 'NYC Metro', lng: -73.9857, lat: 40.7484 },
  { slug: 'chicago-il', name: 'Chicago, IL', region: 'Illinois', metro: 'Chicago', lng: -87.6298, lat: 41.8781 },
  { slug: 'atlanta-ga', name: 'Atlanta, GA', region: 'Georgia', metro: 'Atlanta', lng: -84.3880, lat: 33.7490 },
];

// 1st-degree connections. [a, b, source, connector?]
export const CONNECTIONS = [
  ['dom', 'maya', 'event'], ['dom', 'jordan', 'event'], ['dom', 'naomi', 'group'],
  ['dom', 'deshawn', 'intro', 'jordan'],           // decision B4: DeShawn is an accepted Jordan intro
  ['maya', 'jordan', 'event'], ['maya', 'simone', 'event'], ['maya', 'priya', 'group'], ['maya', 'marcus', 'intro'],
  ['maya', 'jade', 'group'], ['maya', 'kendra', 'event'],
  ['jordan', 'aaliyah', 'event'], ['jordan', 'darius', 'event'], ['jordan', 'deshawn', 'event'], ['jordan', 'cameron', 'group'],
  ['jordan', 'reina', 'event'], ['jordan', 'simone', 'event'], ['jordan', 'theo', 'event'], ['jordan', 'naomi', 'group'],
  ['naomi', 'aaliyah', 'group'], ['naomi', 'tyler', 'group'], ['naomi', 'lena', 'group'],
  ['deshawn', 'reina', 'event'], ['reina', 'ari', 'event'], ['reina', 'omar', 'event'], ['priya', 'jade', 'group'],
  ['aaliyahW', 'marcusD', 'manual'],
];

export const VENUES = [
  { key: 'bresca', name: 'Bresca', emoji: 'dinner', address: '1906 14th St NW', hood: 'Logan Circle', city: 'washington-dc', lng: -77.0319, lat: 38.9150, category: 'restaurant', price: 4,
    description: "One of DC's most beloved tasting menu restaurants. The community loves it for first dates and celebrations." },
  { key: 'songbyrd', name: 'Songbyrd', emoji: 'music', address: '540 Penn St NE', hood: 'Columbia Heights', city: 'washington-dc', lng: -77.0325, lat: 38.9290, category: 'music', price: 2,
    description: 'Indie Night every Friday. Live music, record store, easy crowd.' },
  { key: 'tailupgoat', name: 'Tail Up Goat', emoji: 'drinks', address: '1827 Adams Mill Rd NW', hood: 'U Street', city: 'washington-dc', lng: -77.0420, lat: 38.9215, category: 'bar', price: 3,
    description: 'Cocktail bar and restaurant. The bar is better than the food and the food is incredible.' },
  { key: 'foundingfarmers', name: 'Founding Farmers', emoji: 'outdoors', address: '1800 Tysons Blvd', hood: 'Tysons', city: 'tysons-va', lng: -77.2226, lat: 38.9219, category: 'restaurant', price: 2,
    description: 'Brunch and dinner. Popular with the OTF Saturday crew.' },
  { key: 'otf', name: 'Orangetheory Fitness Tysons', emoji: 'fitness', address: 'Tysons Corner', hood: 'Tysons', city: 'tysons-va', lng: -77.2230, lat: 38.9175, category: 'fitness', price: 2, description: '' },
  { key: 'rockcreek', name: 'Rock Creek Park', emoji: 'route', address: 'Beach Dr NW', hood: 'Rock Creek', city: 'washington-dc', lng: -77.0500, lat: 38.9580, category: 'park', price: null, description: '' },
  { key: 'watkins', name: 'Watkins Regional Park', emoji: 'paddle', address: '301 Watkins Park Dr', hood: 'Upper Marlboro', city: 'college-park-md', lng: -76.7852, lat: 38.8840, category: 'park', price: null, description: '' },
  { key: 'sfoglina', name: 'Sfoglina', emoji: 'dinner', address: 'Tysons', hood: 'Tysons', city: 'tysons-va', lng: -77.2290, lat: 38.9200, category: 'restaurant', price: 3, description: '' },
  { key: 'silverbranch', name: 'Silver Branch Brewing', emoji: 'drinks', address: '8401 Colesville Rd', hood: 'Silver Spring', city: 'silver-spring-md', lng: -77.0270, lat: 38.9960, category: 'bar', price: 2, description: '' },
  { key: 'minibar', name: 'Minibar', emoji: 'drinks', address: '855 E St NW', hood: 'Penn Quarter', city: 'washington-dc', lng: -77.0240, lat: 38.8963, category: 'restaurant', price: 4, description: '' },
  { key: 'fridge', name: 'The Fridge DC', emoji: 'art', address: '516 1/2 8th St SE', hood: 'Eastern Market', city: 'washington-dc', lng: -76.9950, lat: 38.8820, category: 'gallery', price: 1, description: '' },
];

// Groups. members: cast keys; fill = total member count (topped up with community members).
export const GROUPS = [
  { key: 'otf', name: 'OTF Tysons Crew', emoji: 'fitness', category: 'fitness', join: 'request', owner: 'priya', city: 'tysons-va', schedule: 'Sat 9AM',
    description: 'Orangetheory Fitness Tysons Corner. We sweat together.', members: ['maya', 'jade', 'dom'], total: 18 },
  { key: 'pkl', name: 'DC Pickleball Crew', emoji: 'paddle', category: 'fitness', join: 'request', owner: 'cameron', city: 'washington-dc', schedule: 'Sun 8AM',
    description: 'Serious-ish DC pickleball. 4.0+ level. Courts every Sunday.', members: ['jordan', 'dom'], total: 12 },
  { key: 'run', name: 'DC Morning Runners', emoji: 'route', category: 'outdoors', join: 'request', owner: 'naomi', city: 'washington-dc', schedule: 'Sat 7AM',
    description: 'Saturday mornings at Rock Creek. All paces welcome.', members: ['jordan', 'dom', 'lena', 'tyler'], total: 24 },
  { key: 'supper', name: 'DC Supper Club', emoji: 'dinner', category: 'food', join: 'request', owner: 'jordan', city: 'washington-dc', schedule: 'Monthly',
    description: 'Monthly dinners at top DC restaurants.', members: ['aaliyah', 'darius', 'simone', 'theo'], total: 31 },
  { key: 'howard', name: 'Howard Alumni Social', emoji: 'cap', category: 'alumni', join: 'request', owner: 'aaliyah', city: 'washington-dc', schedule: 'Monthly',
    description: 'Howard alumni in the DMV. Monthly events.', members: [], total: 15 },
  { key: 'gallery', name: 'Gallery Night Crew', emoji: 'art', category: 'music_arts', join: 'request', owner: 'omar', city: 'washington-dc', schedule: 'Monthly',
    description: 'Art + community. Good people, good art, no pretension.', members: ['reina', 'ari'], total: 22 },
  { key: 'wine', name: 'DC Wine Club', emoji: 'wine', category: 'social', join: 'open', owner: 'kendra', city: 'washington-dc', schedule: 'Monthly',
    description: 'Monthly tastings. No snobs.', members: [], total: 19 },
  { key: 'wellness', name: 'DC Wellness Collective', emoji: 'fitness', category: 'fitness', join: 'open', owner: 'lena', city: 'washington-dc', schedule: 'Weekly',
    description: 'Fitness + mindfulness.', members: [], total: 44 },
  { key: 'books', name: 'DMV Book Club', emoji: 'book', category: 'social', join: 'request', owner: 'theo', city: 'washington-dc', schedule: 'Monthly',
    description: 'One book a month, one great conversation.', members: [], total: 28 },
];

// Names for the wider community (fills vouch counts, group sizes, likes).
export const COMMUNITY_FIRST = ['Alex', 'Brianna', 'Chris', 'Dana', 'Elijah', 'Fatima', 'Gabe', 'Hana', 'Isaiah', 'Jasmin', 'Kai', 'Leah', 'Malik', 'Nia', 'Oscar', 'Paige', 'Quinn', 'Rashad', 'Sofia', 'Terrence', 'Uma', 'Victor', 'Whitney', 'Xavier', 'Yara', 'Zoe', 'Andre', 'Bianca', 'Caleb', 'Destiny', 'Evan', 'Gia'];
export const COMMUNITY_LAST = ['Adams', 'Baker', 'Coleman', 'Diaz', 'Evans', 'Foster', 'Grant', 'Hughes', 'Irving', 'Jackson', 'Kim', 'Lopez', 'Mitchell', 'Nguyen', 'Owens', 'Price'];
export const COMMUNITY_SIZE = 64;

export const GENERIC_REPLIES = [
  'Adding this to my list.', 'Yes! Been meaning to go.', 'Count me in next time.', 'This is so real.',
  'Saving this.', 'Seconding this one.', 'Went last month, can confirm.', 'Who else is going?',
];
