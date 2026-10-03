// Catering menus, one per event type. Each course lists dish ids from dishes.mjs.
// The `id` is the link anchor: menus.html#weddings, menus.html#corporate, ...

export const menus = [
  {
    id: 'weddings',
    title: 'Weddings',
    intro:
      'Buffet, family-style or plated. Most couples choose two mains, three sides, bread and one or two desserts. We cook a tasting for the two of you about six weeks out, so nothing on the day is a surprise.',
    courses: [
      { title: 'Passed bites', dishes: ['shrimp-grits', 'mini-quiche', 'fried-green-tomatoes', 'deviled-eggs'] },
      { title: 'Mains', dishes: ['fried-chicken', 'short-ribs', 'lemon-salmon', 'surf-and-turf', 'baked-chicken'] },
      { title: 'Sides', dishes: ['mac', 'collards', 'yams', 'rice-and-peas', 'plantains', 'mashed-potatoes', 'green-beans', 'mixed-vegetables'] },
      { title: 'Bread', dishes: ['cornbread'] },
      { title: 'Dessert', dishes: ['peach-cobbler', 'banana-pudding'] },
    ],
  },
  {
    id: 'corporate',
    title: 'Corporate events',
    intro:
      'Boxed lunches for meetings, buffets for the whole floor, company picnics and client dinners. Everything arrives labeled with what is in it, with plates, napkins and serving utensils. Boxed lunches come with a side and a slice of pound cake.',
    courses: [
      { title: 'Boxed lunches', dishes: ['chicken-sandwich', 'smothered-chicken', 'lemon-salmon', 'black-eyed-pea-bowl'] },
      { title: 'Buffet mains', dishes: ['baked-chicken', 'fried-chicken', 'smothered-chicken', 'lemon-salmon'] },
      { title: 'Sides', dishes: ['mac', 'rice-and-peas', 'mashed-potatoes', 'mixed-vegetables', 'green-beans', 'house-salad'] },
      { title: 'Dessert and drinks', dishes: ['pound-cake', 'sweet-tea', 'lemonade'] },
    ],
  },
  {
    id: 'birthdays',
    title: 'Birthdays and private parties',
    intro:
      'Party trays for the backyard, the clubhouse or the living room. A half pan feeds about 10 to 12 people and a full pan about 20 to 25. We drop off hot and set up, or we stay and serve.',
    courses: [
      { title: 'Trays', dishes: ['lemon-pepper-wings', 'honey-hot-wings', 'jalapeno-poppers', 'fried-fish', 'cajun-seafood', 'pulled-pork-sliders'] },
      { title: 'Sides', dishes: ['mac', 'potato-salad', 'baked-beans'] },
      { title: 'Sweets', dishes: ['red-velvet-cupcakes', 'banana-pudding'] },
    ],
  },
  {
    id: 'family',
    title: 'Family gatherings',
    intro:
      'Reunions, repasts, church events, graduations and Sunday dinners. Served family-style in full pans, with enough for seconds and a plate to take home.',
    courses: [
      { title: 'Mains', dishes: ['fried-chicken', 'turkey-wings', 'short-ribs', 'smothered-pork-chops', 'fried-fish', 'cajun-seafood'] },
      { title: 'Sides', dishes: ['mac', 'collards', 'yams', 'rice-and-peas', 'plantains', 'mashed-potatoes', 'potato-salad', 'cabbage'] },
      { title: 'Bread', dishes: ['cornbread'] },
      { title: 'Dessert', dishes: ['peach-cobbler', 'sweet-potato-pie', 'pound-cake'] },
    ],
  },
  {
    id: 'brunch',
    title: 'Brunch',
    intro:
      'Birthday brunches, bridal showers, church brunch after service, the morning after a wedding. The omelette station comes with a cook who makes each one to order.',
    courses: [
      { title: 'Mains', dishes: ['shrimp-and-grits', 'chicken-and-waffles', 'omelettes', 'mini-quiche'] },
      { title: 'Sides', dishes: ['hash-browns', 'bacon'] },
      { title: 'Something sweet', dishes: ['pound-cake', 'peach-cobbler'] },
      { title: 'Drinks', dishes: ['lemonade', 'sweet-tea'] },
    ],
  },
  {
    id: 'holidays',
    title: 'Holidays',
    intro:
      "Our Thanksgiving 2026 menu, with what goes into every dish. Packages, prices, deadlines and delivery are on the Holiday Ordering page. Christmas and New Year's menus are coming.",
    link: { href: 'holiday.html', label: 'Thanksgiving packages and prices' },
    courses: [
      { title: 'Meats', dishes: ['ham', 'smoked-turkey', 'jerk-turkey', 'fried-turkey', 'short-ribs'] },
      {
        title: 'Sides',
        dishes: ['mac', 'collards', 'cabbage', 'yams', 'mashed-potatoes-gravy', 'stuffing', 'au-gratin', 'green-beans', 'seafood-salad'],
      },
      { title: 'Included', dishes: ['cornbread', 'rolls', 'cranberry'] },
      { title: 'Add-ons and desserts', dishes: ['crab-stuffed-shrimp', 'sweet-potato-pie', 'pound-cake', 'vanilla-cake'] },
    ],
  },
];
