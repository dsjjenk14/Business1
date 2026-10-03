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

  city: 'Fairfax',
  region: 'VA',
  serviceArea: ['Fairfax, VA', 'Washington, DC', 'Northern Virginia', 'Maryland'],

  // Quote form. FormSubmit emails each request to the address in the URL.
  // The first request sends an activation email to that inbox. Click it once.
  form: {
    ajax: 'https://formsubmit.co/ajax/chef@aaronjscatering.com',
    action: 'https://formsubmit.co/chef@aaronjscatering.com',
  },

  allergenNote:
    'Our kitchen handles shellfish, dairy, eggs, wheat and nuts. We cannot guarantee that any dish is free of allergens.',
};

export const nav = [
  { href: 'menus.html', label: 'Menus' },
  { href: 'holiday.html', label: 'Holiday', holiday: true },
  { href: 'about.html', label: 'About' },
  { href: 'gallery.html', label: 'Gallery' },
  { href: 'contact.html', label: 'Contact' },
];

export const events = [
  {
    id: 'weddings',
    icon: 'rings',
    title: 'Weddings',
    text: 'Buffet, family-style or plated. We cook you a tasting first, so nothing on the day is a surprise.',
    href: 'menus.html#weddings',
  },
  {
    id: 'corporate',
    icon: 'briefcase',
    title: 'Corporate events',
    text: 'Boxed lunches, office buffets, company picnics and client dinners. On time, labeled, with plates and serving utensils.',
    href: 'menus.html#corporate',
  },
  {
    id: 'birthdays',
    icon: 'cake',
    title: 'Birthdays',
    text: 'Birthdays and private parties. Wing trays, fried fish, Cajun shrimp and pans of mac and cheese, set up before the first guest walks in.',
    href: 'menus.html#birthdays',
  },
  {
    id: 'family',
    icon: 'pot',
    title: 'Family gatherings',
    text: 'Reunions, repasts, church events, Sunday dinners. Full pans, family-style, enough for seconds.',
    href: 'menus.html#family',
  },
  {
    id: 'holidays',
    icon: 'pie',
    title: 'Holidays',
    text: "Thanksgiving, Christmas, New Year's and holiday parties. The whole meal, or just the sides you don't feel like making.",
    href: 'holiday.html',
  },
];

export const signatureDishes = [
  {
    dish: 'fried-chicken',
    photo: 'dish-fried-chicken',
    text: 'Brined overnight in buttermilk and hot sauce, dredged twice, fried in small batches. Brushed with honey butter as it comes out of the oil.',
  },
  {
    dish: 'short-ribs',
    photo: 'dish-short-ribs',
    text: 'Seared dark, then braised four hours with onion, carrot, garlic and thyme until a fork goes straight through.',
  },
  {
    dish: 'mac',
    photo: 'dish-mac',
    text: 'Five cheeses set in an egg custard and baked in the pan we serve it in. Ask for a corner piece.',
  },
  {
    dish: 'peach-cobbler',
    photo: 'dish-peach-cobbler',
    text: 'Peaches cooked down with brown sugar, cinnamon and nutmeg under a buttery biscuit top. Served warm.',
  },
];

// SAMPLE QUOTES. These show the length and tone that work. Replace every one
// with a real quote from a real client, with their permission, before launch.
// While `sample: true` is set, the page shows a "Sample quote" tag under it.
export const testimonials = [
  {
    quote:
      'We had 140 guests and the line for short ribs never stopped. People were still talking about the mac and cheese at brunch the next morning.',
    name: 'Client name',
    detail: 'Wedding, city',
    sample: true,
  },
  {
    quote:
      'Lunch for 60 showed up at 11:40 for a noon meeting. Every pan was labeled with what was in it. Nobody went back to their desk hungry.',
    name: 'Client name',
    detail: 'Corporate lunch, city',
    sample: true,
  },
  {
    quote:
      "My grandmother's 90th. Forty of us, three generations, and nobody had to cook. She said the sweet potato pie was almost as good as hers.",
    name: 'Client name',
    detail: 'Family gathering, city',
    sample: true,
  },
];
