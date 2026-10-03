// Holiday ordering: dates, packages and prices.
// Update this file once a year (dates are YYYY-MM-DD). Weekday names are worked
// out from the dates at build time, so they can't be wrong.

export const holiday = {
  year: 2026,

  // The holiday banner, nav highlight and home page block are on between these
  // dates (inclusive, Eastern time). Preview any time with ?holiday=on.
  season: { opens: '2026-11-01', closes: '2027-01-01' },

  holidays: [
    {
      id: 'thanksgiving',
      name: 'Thanksgiving',
      date: '2026-11-26',
      orderBy: '2026-11-19',
      pickup: [{ date: '2026-11-25', hours: 'noon to 7 PM' }],
      delivery: [{ date: '2026-11-25', hours: '2 to 7 PM' }],
    },
    {
      id: 'christmas',
      name: 'Christmas',
      date: '2026-12-25',
      orderBy: '2026-12-18',
      pickup: [
        { date: '2026-12-23', hours: 'noon to 7 PM' },
        { date: '2026-12-24', hours: '9 AM to 1 PM' },
      ],
      delivery: [{ date: '2026-12-23', hours: '2 to 7 PM' }],
    },
    {
      id: 'new-years',
      name: "New Year's",
      date: '2027-01-01',
      orderBy: '2026-12-28',
      pickup: [{ date: '2026-12-31', hours: '10 AM to 3 PM' }],
      delivery: [{ date: '2026-12-31', hours: '10 AM to 3 PM' }],
    },
  ],

  packages: [
    {
      id: 'full-table',
      name: 'The Full Table',
      serves: '10 to 12',
      price: 425,
      for: 'Thanksgiving and Christmas',
      note: 'The whole meal. You set the table.',
      includes: [
        'One main: herb-roasted turkey (14 to 16 lb), smoked turkey (14 to 16 lb) or honey-glazed ham (8 to 10 lb)',
        'Cornbread dressing, half pan',
        'Turkey gravy, 2 quarts',
        'Four sides, half pans',
        'Two dozen yeast rolls',
        'Two desserts',
      ],
    },
    {
      id: 'small-table',
      name: 'The Small Table',
      serves: '4 to 6',
      price: 235,
      for: 'Thanksgiving and Christmas',
      note: 'Same food, smaller pans.',
      includes: [
        'One main: honey-glazed half ham (4 to 5 lb) or six smothered turkey wings',
        'Cornbread dressing, small pan',
        'Turkey gravy, 1 quart',
        'Three sides, small pans',
        'One dozen yeast rolls',
        'One dessert',
      ],
    },
    {
      id: 'the-sides',
      name: 'The Sides',
      serves: '10 to 12',
      price: 260,
      for: 'Thanksgiving and Christmas',
      note: 'You cook the bird. We do the rest.',
      includes: [
        'Cornbread dressing, half pan',
        'Turkey gravy, 2 quarts',
        'Five sides, half pans',
        'Two dozen yeast rolls',
      ],
    },
    {
      id: 'good-luck',
      name: 'The Good Luck Pan',
      serves: '10 to 12',
      price: 210,
      for: "New Year's Day",
      note: 'Black-eyed peas for luck, greens for money, cornbread for gold.',
      includes: [
        "Hoppin' John, half pan",
        'Collard greens with smoked turkey, half pan',
        'Skillet cornbread, 12 wedges',
        'One main: 20 pieces of honey butter fried chicken or 12 smothered pork chops',
      ],
    },
  ],

  // What you can pick inside a package.
  choices: {
    sides: ['mac', 'collards', 'yams', 'green-beans', 'potato-salad', 'cabbage', 'cranberry'],
    desserts: [
      { dish: 'sweet-potato-pie', size: 'whole pie' },
      { dish: 'pecan-pie', size: 'whole pie' },
      { dish: 'peach-cobbler', size: 'half pan' },
      { dish: 'banana-pudding', size: 'half pan' },
      { dish: 'pound-cake', size: 'whole cake' },
    ],
  },

  panSizes: [
    { name: 'Small pan', serves: '4 to 6' },
    { name: 'Half pan', serves: '10 to 12' },
    { name: 'Full pan', serves: '20 to 25' },
  ],

  // A la carte. Prices in dollars.
  alaCarte: [
    {
      title: 'Mains',
      rows: [
        { dish: 'roast-turkey', size: '14 to 16 lb', price: 140 },
        { dish: 'smoked-turkey', size: '14 to 16 lb', price: 150 },
        { dish: 'ham', size: '8 to 10 lb', price: 125 },
        { dish: 'turkey-wings', size: 'six wings', price: 60 },
      ],
    },
    {
      title: 'Sides',
      columns: ['Half pan', 'Full pan'],
      rows: [
        { dish: 'mac', prices: [80, 150] },
        { dish: 'dressing', prices: [65, 120] },
        { dish: 'collards', prices: [70, 130] },
        { dish: 'yams', prices: [65, 120] },
        { dish: 'green-beans', prices: [60, 110] },
        { dish: 'potato-salad', prices: [55, 100] },
        { dish: 'cabbage', prices: [55, 100] },
        { dish: 'hoppin-john', prices: [55, 100] },
      ],
    },
    {
      title: 'By the quart and dozen',
      rows: [
        { dish: 'gravy', size: 'quart', price: 16 },
        { dish: 'cranberry', size: 'quart', price: 16 },
        { dish: 'rolls', size: 'dozen', price: 15 },
        { dish: 'cornbread', size: '12 wedges', price: 24 },
      ],
    },
    {
      title: 'Desserts',
      rows: [
        { dish: 'sweet-potato-pie', size: 'whole pie', price: 32 },
        { dish: 'pecan-pie', size: 'whole pie', price: 38 },
        { dish: 'peach-cobbler', size: 'half pan', price: 70 },
        { dish: 'banana-pudding', size: 'half pan', price: 65 },
        { dish: 'pound-cake', size: 'whole cake', price: 45 },
      ],
    },
  ],

  delivery: {
    fee: 40,
    radius: 'within 20 miles of Fairfax',
  },
};
