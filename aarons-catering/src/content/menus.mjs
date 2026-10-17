// The menus on the Menus page. Each course lists dishes from dishes.mjs, either
// by id ('mac') or with a different name and description for that menu:
//   { dish: 'mac', name: 'Baked three-cheese macaroni', description: '...' }
// Ingredients and allergens always come from dishes.mjs, so renaming a dish for
// one menu can't make its allergen line wrong.
//
// The `id` is the link anchor: menus.html#catering, menus.html#weddings, ...
// `note` shows as a highlighted line under the intro; `styles` as small tags.
// A course can have a `note` too, and a course can be a note with no dishes.
//
// Events, Weddings and Meal prep are the modern (2026) menu: Aaron J's own
// dishes plus new ones built on them. Holidays is the Christmas 2026 menu
// (the packages from the printed Thanksgiving 2026 menu).

export const menus = [
  {
    id: 'catering',
    title: 'Events',
    heading: 'The menu',
    intro:
      'Soul food, made modern. The dishes you grew up on, cooked with smoke, spice and a little restraint, for birthdays, showers, reunions, church and family events and dinners at home. Mix and match anything below.',
    courses: [
      {
        title: 'Small plates',
        note: 'Passed, or set out while guests arrive.',
        dishes: [
          {
            dish: 'chicken-and-waffles',
            name: 'Chicken and waffle bites',
            description: 'Bite-size fried chicken on a mini waffle with a drizzle of syrup and a sliver of strawberry.',
          },
          'shrimp-grits',
          'fried-green-tomatoes',
          { dish: 'oxtail-biscuits', name: 'Oxtail biscuits', description: 'Buttermilk biscuits filled with slow-braised oxtail.' },
          'crab-shrimp-eggrolls',
          'bacon-scallops',
          'crab-mushrooms',
          { dish: 'shrimp-kebabs', name: 'Grilled shrimp skewers' },
          'smoked-wings',
        ],
      },
      {
        title: 'Mains',
        dishes: [
          'hot-honey-chicken',
          'jerk-chicken',
          'braised-oxtail',
          { dish: 'short-ribs', name: 'Red wine braised short ribs' },
          'blackened-salmon',
          { dish: 'fried-chicken', name: 'Buttermilk fried chicken' },
          { dish: 'baked-chicken', name: 'Herb roasted chicken' },
        ],
      },
      {
        title: 'From the sea',
        dishes: [{ dish: 'shrimp-and-grits', name: 'Cajun shrimp and grits' }, 'cajun-seafood', 'surf-and-turf'],
      },
      {
        title: 'Brunch',
        dishes: [
          'chicken-and-waffles',
          { dish: 'omelettes', name: 'Made-to-order omelettes' },
          'mini-quiche',
          'mini-waffles',
          'waffle-toppings',
        ],
      },
      {
        title: 'Sides',
        dishes: [
          'gouda-mac',
          { dish: 'mac', name: 'Classic baked mac and cheese', description: 'Sharp cheddar, Colby Jack and cream cheese, baked until the top browns.' },
          'brown-butter-yams',
          { dish: 'collards', note: 'Made with smoked turkey. Pork available.' },
          { dish: 'green-beans', note: 'Made with smoked turkey. Pork available.' },
          'garlic-mashed',
          'cabbage',
          'cornbread-muffins',
        ],
      },
      { title: 'Salads', dishes: ['caesar-salad', 'cobb-salad', 'garden-salad'] },
      { title: 'Desserts', dishes: ['banana-pudding', 'peach-cobbler', 'sweet-potato-pie', 'pound-cake'] },
    ],
  },
  {
    id: 'weddings',
    title: 'Weddings',
    heading: 'Wedding menu',
    intro:
      'Cocktail hour, a plated, family-style or buffet dinner, stations and late-night bites, built from the dishes our guests love and presented for your day.',
    note: 'Every wedding menu is customized. Treat this as a starting point and we’ll build your menu with you.',
    styles: ['Plated', 'Family-style', 'Buffet', 'Stations'],
    courses: [
      {
        title: 'Cocktail hour',
        note: 'Passed or displayed while guests mingle.',
        dishes: [
          { dish: 'shrimp-grits', name: 'Shrimp and grits spoons', description: 'Seared shrimp over white cheddar stone-ground grits, served in tasting spoons.' },
          { dish: 'chicken-and-waffles', name: 'Chicken and waffle bites', description: 'Bite-size fried chicken on a mini waffle with a drizzle of syrup and a sliver of strawberry.' },
          { dish: 'oxtail-biscuits', name: 'Petite oxtail biscuits', description: 'Mini buttermilk biscuits filled with slow-braised oxtail.' },
          { dish: 'bacon-scallops', name: 'Bacon-wrapped scallops', description: 'Sea scallops wrapped in crisp bacon, glazed and finished with fresh herbs.' },
          { dish: 'crab-mushrooms', name: 'Crab-stuffed mushrooms', description: 'Mushroom caps filled with lump crab and Parmesan, baked golden.' },
          { dish: 'shrimp-kebabs', name: 'Grilled shrimp skewers', description: 'Seasoned shrimp with peppers and red onion, finished with lemon.' },
          { dish: 'mini-quiche', name: 'Handmade petite quiche', description: 'Spinach and cheddar, or ham and Swiss, in a buttery crust.' },
        ],
      },
      {
        title: 'Salad course',
        dishes: [
          { dish: 'caesar-salad', name: 'Classic Caesar', description: 'Crisp romaine, shaved Parmesan and garlic croutons.' },
          { dish: 'garden-salad', name: 'Garden salad', description: 'Mixed greens, cucumber, grape tomato and carrot with your choice of dressing.' },
          { dish: 'cobb-salad', name: 'Cobb salad', description: 'Chicken, bacon, egg, avocado, tomato and blue cheese over chopped romaine.' },
        ],
      },
      {
        title: 'Entrées',
        dishes: [
          { dish: 'short-ribs', name: 'Red wine braised short ribs', description: 'Bone-in short ribs braised in red wine with thyme. Beautiful with the garlic mashed potatoes.' },
          { dish: 'braised-oxtail', name: 'Red wine braised oxtail' },
          { dish: 'surf-and-turf', name: 'Surf and turf', description: 'Seared sirloin and garlic butter shrimp, plated together.' },
          { dish: 'blackened-salmon', name: 'Blackened salmon, lemon butter' },
          { dish: 'hot-honey-chicken', name: 'Hot honey fried chicken' },
          { dish: 'fried-chicken', name: 'Buttermilk fried chicken', description: 'Southern fried chicken, marinated in buttermilk and fried golden.' },
          { dish: 'baked-chicken', name: 'Herb grilled chicken', description: 'Bone-in chicken with garlic, lemon and rosemary, grilled or roasted.' },
        ],
      },
      {
        title: 'Accompaniments',
        dishes: [
          { dish: 'garlic-mashed', name: 'Garlic mashed potatoes, red wine gravy', description: 'Whipped with butter, cream and roasted garlic.' },
          'gouda-mac',
          { dish: 'collards', name: 'Braised collard greens', description: 'Slow-cooked with smoked turkey. Pork available.' },
          'brown-butter-yams',
          { dish: 'green-beans', name: 'Green beans with smoked turkey', description: 'Fresh green beans with smoked turkey, garlic and butter. Pork available.' },
          'cornbread-muffins',
        ],
      },
      {
        title: 'Stations',
        note: 'Let guests build their own: a mac and cheese martini bar, a garlic mashed potato bar with red wine gravy, a shrimp and grits bar, or a cooked-to-order omelette station for brunch weddings.',
      },
      {
        title: 'Late-night bites',
        note: 'For the second wind on the dance floor.',
        dishes: [
          { dish: 'smoked-wings', name: 'Smoked wings', description: 'Lemon pepper, buffalo (hot or mild) or garlic Parmesan.' },
          { dish: 'crab-shrimp-eggrolls', name: 'Crab and shrimp egg rolls', description: 'Crisp and golden, with sweet chili sauce.' },
          { dish: 'hot-honey-chicken', name: 'Hot honey chicken bites', description: 'Crispy boneless chicken bites brushed with hot honey.' },
        ],
      },
      { title: 'Desserts', note: 'A dessert table, or individual jars at each place.', dishes: ['banana-pudding', 'peach-cobbler', 'sweet-potato-pie'] },
    ],
  },
  {
    id: 'meal-prep',
    title: 'Meal prep',
    heading: 'Meal prep menu',
    intro:
      'Personalized meals for the week. Choose your proteins, sides and salads, tell us about any dietary needs or goals, and we’ll put together a plan and a price.',
    note: 'Every meal prep plan is built around you. Swap anything, and ask about portion sizes.',
    courses: [
      {
        title: 'Proteins',
        dishes: ['jerk-chicken', { dish: 'baked-chicken', name: 'Herb roasted chicken' }, 'blackened-salmon', 'short-ribs', { dish: 'shrimp-kebabs', name: 'Grilled shrimp skewers' }],
      },
      {
        title: 'Sides',
        dishes: [
          { dish: 'green-beans', note: 'Made with smoked turkey. Pork available.' },
          { dish: 'collards', note: 'Made with smoked turkey. Pork available.' },
          'brown-butter-yams',
          'garlic-mashed',
          'cabbage',
          'gouda-mac',
        ],
      },
      { title: 'Salads', dishes: ['garden-salad', 'caesar-salad', 'cobb-salad'] },
    ],
  },
  {
    id: 'holidays',
    title: 'Holidays',
    heading: 'Christmas menu',
    intro:
      "Our Christmas 2026 menu. Packages, prices and delivery are on the Holiday Ordering page. The New Year's menu is coming.",
    link: { href: 'holiday.html', label: 'Christmas packages and prices' },
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
