// Business details used across every page. Change them here, then run `node build.mjs`.

export const site = {
  name: "Aaron J's Catering",
  chef: 'Chef Aaron Jenkins',
  tagline: 'From our kitchen to your celebration',
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
  { href: 'holiday.html', label: 'Holiday', holiday: true },
  { href: 'about.html', label: 'About' },
  { href: 'gallery.html', label: 'Gallery' },
  { href: 'contact.html', label: 'Contact' },
];

export const events = [
  { id: 'weddings', icon: 'rings', title: 'Weddings', text: 'Buffet, family-style or plated.', href: 'menus.html#weddings' },
  { id: 'corporate', icon: 'briefcase', title: 'Corporate events', text: 'Office lunches, meetings and company picnics.', href: 'menus.html#catering' },
  { id: 'birthdays', icon: 'cake', title: 'Birthdays and parties', text: 'Party trays and buffets.', href: 'menus.html#catering' },
  { id: 'family', icon: 'pot', title: 'Church and family events', text: 'Reunions, repasts and Sunday dinners.', href: 'menus.html#catering' },
  { id: 'holidays', icon: 'pie', title: 'Holidays', text: 'Thanksgiving, Christmas and holiday parties.', href: 'holiday.html' },
  { id: 'mealprep', icon: 'box', title: 'Meal prep', text: 'Personalized meals for the week.', href: 'menus.html#meal-prep' },
];

export const signatureDishes = [
  { dish: 'chicken-and-waffles', photo: 'dish-chicken-and-waffles', text: 'Fried chicken and waffles with syrup and fresh strawberries.' },
  { dish: 'ham', photo: 'dish-ham', text: 'Glazed with brown sugar, honey and pineapple juice, finished with pineapple rings and cherries.' },
  { dish: 'mac', photo: 'dish-mac', text: 'Baked or smoked, with sharp cheddar, Colby Jack and cream cheese.' },
  { dish: 'cajun-seafood', photo: 'dish-cajun-seafood', text: 'Crab, shrimp and sausage in a Cajun garlic butter sauce.' },
];
