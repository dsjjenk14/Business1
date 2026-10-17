// Business details used across every page. Change them here, then run `node build.mjs`.

export const site = {
  name: "Aaron J's Catering",
  chef: 'Chef Aaron Jenkins',
  tagline: 'Soul food, made modern',
  motto: 'Where every day is Sunday', // from the logo
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
  priceGuide: '',

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

// "New on the menu" on the home page: the modern dishes, by id from dishes.mjs.
export const newDishes = ['hot-honey-chicken', 'jerk-chicken', 'braised-oxtail', 'blackened-salmon', 'gouda-mac', 'brown-butter-yams', 'fried-green-tomatoes', 'banana-pudding'];

// The ways in, on the home page under the hero.
export const paths = [
  { title: 'Weddings', text: 'Cocktail hour to late-night bites, plated, family-style or stations.', href: 'menus.html#weddings' },
  { title: 'Events', text: 'Birthdays, showers, reunions, church and family events.', href: 'menus.html#catering' },
  { title: 'Office', text: 'Breakfast cooked in your office and lunches priced per person.', href: 'office.html' },
  { title: 'Meal prep', text: 'A week of meals, built around you.', href: 'menus.html#meal-prep' },
];

export const signatureDishes = [
  { dish: 'chicken-and-waffles', photo: 'dish-chicken-and-waffles', text: 'Fried chicken and waffles with syrup and fresh strawberries.' },
  { dish: 'ham', photo: 'dish-ham', text: 'Glazed with brown sugar, honey and pineapple juice, finished with pineapple rings and cherries.' },
  { dish: 'mac', photo: 'dish-mac', text: 'Baked or smoked, with sharp cheddar, Colby Jack and cream cheese.' },
  { dish: 'cajun-seafood', photo: 'dish-cajun-seafood', text: 'Crab, shrimp and sausage in a Cajun garlic butter sauce.' },
];
