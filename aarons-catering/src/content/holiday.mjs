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
  },

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
      picks: ['Meats (pick 2)', 'Sides (pick 3)', 'Dessert (pick 1)', 'Rolls or cornbread'],
    },
    {
      id: 'meats',
      name: 'Meats',
      price: 120,
      feeds: '5 to 6',
      text: 'Pick 2.',
      picks: ['Meats (pick 2)', 'Rolls or cornbread'],
    },
    {
      id: 'sides',
      name: 'Sides',
      price: 135,
      feeds: '5 to 6',
      text: 'Pick 3.',
      picks: ['Sides (pick 3)', 'Rolls or cornbread'],
    },
    {
      id: 'half-spread',
      name: 'The Half Spread',
      price: 118,
      feeds: '3 to 4',
      text: 'Pick 1 meat and 2 sides, with bread and cranberry sauce.',
      picks: ['Meat (pick 1)', 'Sides (pick 2)', 'Rolls or cornbread'],
    },
    {
      id: 'dinner-for-two',
      name: 'Dinner for Two',
      price: 80,
      feeds: '2',
      text: 'Pick 2 meats and 3 sides, portioned for two.',
      picks: ['Meats (pick 2)', 'Sides (pick 3)', 'Rolls or cornbread'],
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

  addOns: [
    { dish: 'crab-stuffed-shrimp', price: 60 },
    { name: 'Whole smoked, fried or jerk turkey', price: 105, text: 'A full bird instead of a half. See the meats above for ingredients.' },
    { dish: 'sweet-potato-pie', price: 32 },
    { dish: 'pound-cake', price: 32 },
    { dish: 'vanilla-cake', price: 32 },
    { name: 'Extra side', price: 35, text: 'Any side from the list above.' },
    { name: 'Extra meat', price: 40, text: 'Any meat from the list above.' },
    { name: 'Plates, silverware and napkins', price: 10, text: 'Service for 6, or service for 2 with Dinner for Two.' },
  ],
  desserts: ['sweet-potato-pie', 'pound-cake', 'vanilla-cake'],

  delivery: [
    { area: 'Northern Virginia', price: 30 },
    { area: 'Washington, DC', price: 30 },
    { area: 'Maryland', price: 35 },
    { area: 'Dinner for Two, all areas', price: 40 },
  ],

  // Must be asked for by the order deadline.
  requestByDeadline: ['Jerk turkey', 'short ribs', 'crab-stuffed shrimp', 'seafood salad'],
};
