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
// Every menu except Holidays uses only the foods on Aaron J's own flyers and
// menus. Holidays is the printed Thanksgiving 2026 menu.

export const menus = [
  {
    id: 'catering',
    title: 'All events',
    heading: 'Catering menu',
    intro:
      'Customized menus for every occasion: corporate events, company picnics, private parties, church and family events, brunches and special-occasion dinners. Mix and match anything below.',
    courses: [
      {
        title: 'Appetizers',
        dishes: ['oxtail-biscuits', 'shrimp-kebabs', 'smoked-wings', 'fried-pickles', 'crab-mushrooms', 'crab-shrimp-eggrolls', 'bacon-scallops'],
      },
      { title: 'Entrées', dishes: ['baked-chicken', 'turkey-wings', 'fried-chicken', 'short-ribs'] },
      {
        title: 'Seafood',
        dishes: ['surf-and-turf', 'lemon-salmon', 'fried-fish', 'cajun-seafood'],
        note: 'Ask about our other shrimp dishes.',
      },
      { title: 'Brunch', dishes: ['shrimp-and-grits', 'chicken-and-waffles', 'omelettes', 'mini-quiche'] },
      {
        title: 'Sides',
        dishes: [
          { dish: 'green-beans', note: 'Made with smoked turkey. Pork available.' },
          { dish: 'collards', note: 'Made with smoked turkey. Pork available.' },
          'yams',
          { dish: 'mac', name: 'Macaroni and cheese', description: 'Baked or smoked, with sharp cheddar, Colby Jack and cream cheese.' },
          'garlic-mashed',
          'cabbage',
          'cornbread',
        ],
      },
      { title: 'Salads', dishes: ['garden-salad', 'caesar-salad', 'cobb-salad'], note: 'Ask about our variety of summer salads.' },
      { title: 'Desserts', note: 'Ask us about our homemade desserts.' },
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
          { dish: 'surf-and-turf', name: 'Surf and turf', description: 'Seared sirloin and garlic butter shrimp, plated together.' },
          { dish: 'lemon-salmon', name: 'Lemon herb salmon', description: 'Roasted salmon with lemon, garlic, dill and a touch of butter.' },
          { dish: 'fried-chicken', name: 'Buttermilk fried chicken', description: 'Southern fried chicken, marinated in buttermilk and fried golden.' },
          { dish: 'baked-chicken', name: 'Herb grilled chicken', description: 'Bone-in chicken with garlic, lemon and rosemary, grilled or roasted.' },
        ],
      },
      {
        title: 'Accompaniments',
        dishes: [
          { dish: 'garlic-mashed', name: 'Garlic mashed potatoes, red wine gravy', description: 'Whipped with butter, cream and roasted garlic.' },
          { dish: 'mac', name: 'Baked or smoked mac and cheese', description: 'Sharp cheddar, Colby Jack and cream cheese.' },
          { dish: 'collards', name: 'Braised collard greens', description: 'Slow-cooked with smoked turkey. Pork available.' },
          { dish: 'yams', name: 'Candied yams', description: 'Glazed with butter, brown sugar, cinnamon and orange.' },
          { dish: 'green-beans', name: 'Green beans with smoked turkey', description: 'Fresh green beans with smoked turkey, garlic and butter. Pork available.' },
          { dish: 'cornbread', name: 'Buttermilk cornbread', description: 'Golden cornbread made with buttermilk.' },
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
          { dish: 'fried-pickles', name: 'Fried pickles', description: 'Cornmeal-crusted pickle chips with ranch.' },
        ],
      },
      { title: 'Desserts', note: 'Ask us about our homemade desserts.' },
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
      { title: 'Proteins', dishes: ['baked-chicken', 'lemon-salmon', 'short-ribs', 'turkey-wings', 'shrimp-kebabs'] },
      {
        title: 'Sides',
        dishes: [
          { dish: 'green-beans', note: 'Made with smoked turkey. Pork available.' },
          { dish: 'collards', note: 'Made with smoked turkey. Pork available.' },
          'yams',
          'garlic-mashed',
          'cabbage',
          { dish: 'mac', name: 'Macaroni and cheese', description: 'Baked or smoked, with sharp cheddar, Colby Jack and cream cheese.' },
        ],
      },
      { title: 'Salads', dishes: ['garden-salad', 'caesar-salad', 'cobb-salad'] },
    ],
  },
  {
    id: 'holidays',
    title: 'Holidays',
    heading: 'Thanksgiving menu',
    intro:
      "Our Thanksgiving 2026 menu. Packages, prices and delivery are on the Holiday Ordering page. Christmas and New Year's menus are coming.",
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
