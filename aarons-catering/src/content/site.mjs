// Business details used across every page. Change them here, then run `node build.mjs`.

export const site = {
  name: "Aaron J's Catering",
  chef: 'Chef Aaron Jenkins',
  // The only two lines the site uses as mottos. Nothing else.
  tagline: 'Sunday best, every day',
  motto: 'The classics, impeccably dressed',
  url: 'https://aaronjscatering.com', // used for canonical links, the sitemap and link previews

  phone: { display: '571-271-1810', href: 'tel:+15712711810', intl: '+1-571-271-1810' },
  email: 'chef@aaronjscatering.com',
  instagram: {
    handle: '@aaronjscatering',
    url: 'https://www.instagram.com/aaronjscatering/',
    // Live feed: paste the feed id from behold.so here (see README). Empty = placeholder tiles.
    beholdFeedId: '',
  },

  serviceArea: ['Washington, DC', 'Northern Virginia', 'Maryland'],

  // A price range for the Menus page, so people know roughly what to expect.
  // Example: 'Most events run $25 to $45 per guest.' Empty = not shown.
  priceGuide: 'Most events run $38 to $55 per guest, and weddings start at $75.', // DRAFT, from the plan book

  // Google reviews, shown next to the quote forms once there are some.
  // Example: { rating: 4.9, count: 37, url: 'https://g.page/r/...' }. null = not shown.
  reviews: null,

  // Quote form. FormSubmit emails each request to the address in the URL.
  // The first request sends an activation email to that inbox. Click it once.
  form: {
    ajax: 'https://formsubmit.co/ajax/chef@aaronjscatering.com',
    action: 'https://formsubmit.co/chef@aaronjscatering.com',
  },

  allergenNote:
    'We handle shellfish, dairy, eggs, wheat and nuts and cannot guarantee that any dish is free of allergens.',
};

export const nav = [
  { href: 'menus.html', label: 'Menus' },
  { href: 'office.html', label: 'Office' },
  { href: 'holiday.html', label: 'Holiday', holiday: true },
  { href: 'about.html', label: 'About' },
  { href: 'gallery.html', label: 'Gallery' },
  { href: 'contact.html', label: 'Contact' },
];

// "Signatures" on the home page: the elevated dishes, by id from dishes.mjs.
export const newDishes = ['chicken-caviar', 'oxtail-biscuits', 'cornbread-madeleines', 'braised-oxtail', 'hot-honey-chicken', 'sweet-potato-pave', 'blackened-salmon', 'gouda-mac', 'sweet-potato-tartlets', 'banana-pudding'];

// The ways in, on the home page under the hero: a photo, who it's for and a
// starting price. Corporate and Holidays read their prices from office.mjs and
// holiday.mjs. The Weddings and Private events prices are DRAFTS from the plan
// book for Chef Aaron to confirm; set `price: ''` to hide one.
export const occasions = [
  { title: 'Weddings', photo: 'chef-aaron', price: 'From $75 per guest', text: 'Cocktail hour to late-night bites: plated, family style or stations.', href: 'menus.html#weddings' },
  { title: 'Private events', photo: 'dish-chicken-and-waffles', price: 'From $38 per guest', text: 'Milestone birthdays, showers, reunions, church events and dinners at home.', href: 'menus.html#catering' },
  { title: 'Corporate', photo: 'page-menus', price: 'office', text: 'Chef-attended breakfasts, executive lunch boxes and meeting bites.', href: 'office.html' },
  { title: 'Holidays', photo: 'holiday-ham', price: 'holiday', text: 'Thanksgiving and Christmas dinner, ordered and paid for online.', href: 'holiday.html' },
];

export const signatureDishes = [
  { dish: 'chicken-and-waffles', photo: 'dish-chicken-and-waffles', text: 'Fried chicken and waffles with syrup and fresh strawberries.' },
  { dish: 'ham', photo: 'dish-ham', text: 'Glazed with brown sugar, honey and pineapple juice, finished with pineapple rings and cherries.' },
  { dish: 'mac', photo: 'dish-mac', text: 'Baked or smoked, with sharp cheddar, Colby Jack and cream cheese.' },
  { dish: 'cajun-seafood', photo: 'dish-cajun-seafood', text: 'Crab, shrimp and sausage in a Cajun garlic butter sauce.' },
];
