// Holiday ordering: the Aaron J's Thanksgiving 2026 menu, as printed.
// Update this file each season (dates are YYYY-MM-DD). Weekday names are worked
// out from the dates at build time, so they can't be wrong.

export const holiday = {
  year: 2026,

  // The holiday banner, nav highlight and home page block are on between these
  // dates (inclusive, Eastern time). Preview any time with ?holiday=on.
  season: { opens: '2026-10-01', closes: '2027-01-01' },

  // The holiday with a menu this season.
  thanksgiving: {
    name: 'Thanksgiving',
    date: '2026-11-26',
    orderBy: '2026-11-20', // orders close, or sooner if we sell out
    cancelBy: '2026-11-20', // full refund until then
    handoff: '2026-11-25', // every pickup and delivery happens this day
    // Sold out early? Set this to true and the order page stops taking orders.
    soldOut: false,
  },

  // Pay by card on the order page, through Stripe Checkout. Needs the Stripe
  // secret key in Netlify (see README). Until it's there, or if this is false,
  // orders are emailed and the confirmation says we'll be in touch to take payment.
  cardPayments: true,

  // No menu yet. Shown as "coming" with a way to get in touch.
  next: ['Christmas', "New Year's"],

  packages: [
    {
      id: 'full-spread',
      name: 'The Full Spread',
      price: 240,
      feeds: '5 to 6',
      popular: true,
      text: 'Pick 2 meats, 3 sides and any one dessert, with gravy, bread and cranberry sauce.',
      pick: { meats: 2, sides: 3, desserts: 1 },
    },
    {
      id: 'meats',
      name: 'Meats',
      price: 120,
      feeds: '5 to 6',
      text: 'Pick 2.',
      pick: { meats: 2 },
    },
    {
      id: 'sides',
      name: 'Sides',
      price: 135,
      feeds: '5 to 6',
      text: 'Pick 3.',
      pick: { sides: 3 },
    },
    {
      id: 'half-spread',
      name: 'The Half Spread',
      price: 118,
      feeds: '3 to 4',
      text: 'Pick 1 meat and 2 sides, with bread and cranberry sauce.',
      pick: { meats: 1, sides: 2 },
    },
    {
      id: 'dinner-for-two',
      name: 'Dinner for Two',
      price: 80,
      feeds: '2',
      text: 'Pick 2 meats and 2 sides, portioned for two.',
      pick: { meats: 2, sides: 2 },
    },
  ],
  includedNote: 'Every package includes rolls or cornbread and cranberry sauce.',

  meats: {
    note: 'Turkeys and hams come as half portions. Short ribs are served by the pan. Whole turkeys are available as add-ons below.',
    items: [
      { dish: 'ham', name: 'Half glazed ham' },
      { dish: 'smoked-turkey', name: 'Half smoked turkey' },
      { dish: 'jerk-turkey', name: 'Half jerk turkey' },
      { dish: 'fried-turkey', name: 'Half fried turkey' },
      { dish: 'short-ribs', extra: 30, limit: 'Limit 1 per package' },
    ],
  },
  sides: [
    { dish: 'mac' },
    { dish: 'collards' },
    { dish: 'cabbage' },
    { dish: 'yams' },
    { dish: 'mashed-potatoes-gravy' },
    { dish: 'stuffing' },
    { dish: 'au-gratin' },
    { dish: 'green-beans' },
    { dish: 'seafood-salad', extra: 25 },
  ],
  included: ['cornbread', 'rolls', 'cranberry'],

  // `options` turns an add-on into a choice on the order page: a list of names,
  // or 'sides' / 'meats' for any side or meat (their extra charges apply too).
  addOns: [
    { id: 'shrimp', dish: 'crab-stuffed-shrimp', price: 60 },
    {
      id: 'whole-turkey',
      name: 'Whole smoked, fried or jerk turkey',
      price: 105,
      text: 'A full bird instead of a half. See the meats above for ingredients.',
      options: ['Whole smoked turkey', 'Whole fried turkey', 'Whole jerk turkey'],
    },
    { id: 'pie', dish: 'sweet-potato-pie', price: 32 },
    { id: 'pound-cake', dish: 'pound-cake', price: 32 },
    { id: 'vanilla-cake', dish: 'vanilla-cake', price: 32 },
    { id: 'extra-side', name: 'Extra side', price: 35, text: 'Any side from the list above.', options: 'sides' },
    { id: 'extra-meat', name: 'Extra meat', price: 40, text: 'Any meat from the list above.', options: 'meats' },
    { id: 'plates', name: 'Plates, silverware and napkins', price: 10, text: 'Service for 6, or service for 2 with Dinner for Two.' },
  ],
  desserts: ['sweet-potato-pie', 'pound-cake', 'vanilla-cake'],

  delivery: [
    { area: 'Northern Virginia', price: 30 },
    { area: 'Washington, DC', price: 30 },
    { area: 'Maryland', price: 35 },
    { area: 'Dinner for Two, all areas', price: 40, package: 'dinner-for-two' },
  ],

  // Must be asked for by the order deadline.
  requestByDeadline: ['Jerk turkey', 'short ribs', 'crab-stuffed shrimp', 'seafood salad'],
};
