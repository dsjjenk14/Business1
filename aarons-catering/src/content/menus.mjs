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
      'Southern cooking, finished with fine-dining polish. Every dish can be plated, sent out family-style on platters or set as a chef’s station, for milestone birthdays, showers, reunions, church and family events and dinners at home.',
    courses: [
      {
        title: 'Small plates',
        note: 'Passed on trays or displayed as guests arrive.',
        dishes: [
          'chicken-caviar',
          { dish: 'shrimp-grits', name: 'Shrimp and grits spoons', description: 'A seared shrimp on white cheddar stone-ground grits, served in a tasting spoon.' },
          {
            dish: 'chicken-and-waffles',
            name: 'Chicken and waffle bites',
            description: 'Crisp fried chicken on a mini waffle, a thread of maple and a sliver of strawberry.',
          },
          {
            dish: 'oxtail-biscuits',
            name: 'Braised oxtail on buttermilk biscuits',
            description: 'Slow-braised oxtail, glazed in its own jus and tucked into warm petite buttermilk biscuits.',
          },
          {
            dish: 'bacon-scallops',
            name: 'Bacon-wrapped sea scallops',
            description: 'Sea scallops wrapped in crisp bacon, glazed and finished with fresh herbs.',
          },
          { dish: 'crab-mushrooms', name: 'Lump crab-stuffed mushrooms', description: 'Mushroom caps crowned with lump crab and Parmesan, baked until golden and bubbling.' },
          { dish: 'shrimp-kebabs', name: 'Grilled shrimp skewers', description: 'Seasoned shrimp, sweet pepper and red onion, charred on the grill and finished with a squeeze of lemon.' },
          { dish: 'crab-shrimp-eggrolls', name: 'Crab and shrimp egg rolls', description: 'Crab and shrimp in a shatter-crisp wrapper, cut on the bias and served with sweet chili.' },
          { dish: 'smoked-wings', name: 'Smoked wings, three ways', description: 'Slow-smoked, then crisped and tossed to order in lemon pepper, buffalo or garlic Parmesan.' },
        ],
      },
      {
        title: 'Mains',
        note: 'Plated, or carved and served from the buffet.',
        dishes: [
          'braised-oxtail',
          'cauliflower-steak',
          'truffle-grits',
          {
            dish: 'short-ribs',
            name: 'Red wine braised short rib',
            description: 'Bone-in short rib braised in red wine with thyme until it falls apart, finished in its own glossy jus.',
          },
          'hot-honey-chicken',
          'jerk-chicken',
          'blackened-salmon',
          {
            dish: 'surf-and-turf',
            name: 'Surf and turf',
            description: 'Seared sirloin, sliced and fanned beside garlic butter shrimp with a whisper of Cajun spice.',
          },
          { dish: 'fried-chicken', name: 'Buttermilk fried chicken', description: 'Bone-in chicken marinated in buttermilk and hot sauce, fried to a deep golden crackle.' },
          { dish: 'baked-chicken', name: 'Herb roasted chicken', description: 'Bone-in chicken roasted with garlic, lemon, rosemary and paprika until the skin is burnished and crisp.' },
        ],
      },
      {
        title: 'From the coast',
        dishes: [
          {
            dish: 'shrimp-and-grits',
            name: 'Cajun shrimp and grits',
            description: 'Stone-ground white cheddar grits under shrimp in a Cajun pan gravy with peppers and onion.',
          },
          { dish: 'cajun-seafood', name: 'Cajun crab and shrimp boil', description: 'Crab clusters, shrimp and andouille, bathed in Cajun garlic butter and brought to the table to share.' },
        ],
      },
      {
        title: 'Brunch',
        note: 'Ask for the omelette and mini waffle stations, cooked to order.',
        dishes: [
          'chicken-and-waffles',
          { dish: 'omelettes', name: 'Made-to-order omelettes' },
          { dish: 'mini-quiche', name: 'Petite quiche', description: 'Spinach and cheddar, or ham and Swiss, in an all-butter crust.' },
          'mini-waffles',
          'waffle-toppings',
          'fruit-cups',
        ],
      },
      {
        title: 'Reserve',
        note: 'Our most indulgent dishes, by request.',
        dishes: ['lobster-mac', 'truffle-potatoes'],
      },
      {
        title: 'Sides',
        dishes: [
          { dish: 'gouda-mac', description: 'Smoked gouda and white cheddar under a brown butter crumb, baked and served in individual cast-iron cocottes.' },
          { dish: 'mac', name: 'Classic baked mac and cheese', description: 'Sharp cheddar, Colby Jack and cream cheese, baked until the edges caramelize.' },
          'sweet-potato-pave',
          'cornbread-dressing',
          'jambalaya',
          { dish: 'collards', name: 'Slow-braised collard greens', description: 'Braised low with smoked turkey, served in petite crocks in their own pot likker.', note: 'Pork available.' },
          { dish: 'green-beans', name: 'Green beans with smoked turkey', note: 'Pork available.' },
          { dish: 'garlic-mashed', name: 'Roasted garlic whipped potatoes, red wine gravy' },
          { dish: 'cabbage', name: 'Buttered cabbage' },
          'cornbread-madeleines',
        ],
      },
      {
        title: 'Salads',
        dishes: [
          { dish: 'caesar-salad', name: 'Caesar', description: 'Hearts of romaine, shaved Parmesan and garlic croutons.' },
          { dish: 'cobb-salad', name: 'Cobb', description: 'Chopped romaine, grilled chicken, bacon, egg, avocado, tomato and blue cheese.' },
          { dish: 'garden-salad', name: 'Garden', description: 'Mixed greens, cucumber, grape tomato and carrot, with your choice of dressing.' },
        ],
      },
      {
        title: 'Desserts',
        note: 'Individual jars and petite portions, or a full dessert table.',
        dishes: ['sweet-potato-tartlets', 'peach-cobbler', 'banana-pudding', { dish: 'pound-cake', name: 'Heavy cream pound cake', description: 'Scented with vanilla and lemon zest, sliced thick from a crisp golden crust.' }],
      },
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
          { dish: 'oxtail-biscuits', name: 'Petite oxtail biscuits', description: 'Slow-braised oxtail, glazed in its own jus and tucked into warm petite buttermilk biscuits.' },
          { dish: 'bacon-scallops', name: 'Bacon-wrapped scallops', description: 'Sea scallops wrapped in crisp bacon, glazed and finished with fresh herbs.' },
          { dish: 'crab-mushrooms', name: 'Crab-stuffed mushrooms', description: 'Mushroom caps crowned with lump crab and Parmesan, baked until golden and bubbling.' },
          { dish: 'shrimp-kebabs', name: 'Grilled shrimp skewers', description: 'Seasoned shrimp, sweet pepper and red onion, charred on the grill and finished with a squeeze of lemon.' },
          { dish: 'mini-quiche', name: 'Handmade petite quiche', description: 'Spinach and cheddar, or ham and Swiss, in a buttery crust.' },
          'chicken-caviar',
        ],
      },
      {
        title: 'Salad course',
        dishes: [
          { dish: 'caesar-salad', name: 'Classic Caesar', description: 'Hearts of romaine, shaved Parmesan and garlic croutons.' },
          { dish: 'garden-salad', name: 'Garden salad', description: 'Mixed greens, cucumber, grape tomato and carrot with your choice of dressing.' },
          { dish: 'cobb-salad', name: 'Cobb salad', description: 'Chicken, bacon, egg, avocado, tomato and blue cheese over chopped romaine.' },
        ],
      },
      {
        title: 'Entrées',
        dishes: [
          { dish: 'short-ribs', name: 'Red wine braised short ribs', description: 'Bone-in short rib braised in red wine with thyme until spoon-tender, plated in its own glossy jus.' },
          { dish: 'braised-oxtail', name: 'Red wine braised oxtail' },
          'cauliflower-steak',
          { dish: 'surf-and-turf', name: 'Surf and turf', description: 'Seared sirloin, sliced and fanned beside garlic butter shrimp on the same plate.' },
          { dish: 'blackened-salmon', name: 'Blackened salmon, lemon butter' },
          { dish: 'hot-honey-chicken', name: 'Hot honey fried chicken' },
          { dish: 'fried-chicken', name: 'Buttermilk fried chicken', description: 'Bone-in chicken marinated in buttermilk and hot sauce, fried to a deep golden crackle.' },
          { dish: 'baked-chicken', name: 'Herb grilled chicken', description: 'Bone-in chicken with garlic, lemon and rosemary, grilled over the flame until the skin is burnished and crisp.' },
        ],
      },
      {
        title: 'Accompaniments',
        dishes: [
          { dish: 'lobster-mac', note: 'Reserve. By request.' },
          'truffle-potatoes',
          'truffle-grits',
          { dish: 'garlic-mashed', name: 'Roasted garlic whipped potatoes, red wine gravy', description: 'Whipped with butter, cream and roasted garlic.' },
          { dish: 'gouda-mac', description: 'Smoked gouda and white cheddar under a brown butter crumb, baked and served in individual cast-iron cocottes.' },
          { dish: 'collards', name: 'Slow-braised collard greens', description: 'Braised low with smoked turkey, served in petite crocks in their own pot likker. Pork available.' },
          'sweet-potato-pave',
          { dish: 'green-beans', name: 'Green beans with smoked turkey', description: 'Fresh green beans with smoked turkey, garlic and butter. Pork available.' },
          'cornbread-madeleines',
        ],
      },
      {
        title: 'Stations',
        note: 'Let guests build their own: a smoked gouda mac and cheese martini bar, a garlic mashed potato bar with red wine gravy, a shrimp and grits bar, or a cooked-to-order omelette station for brunch weddings.',
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
      { title: 'Desserts', note: 'A dessert table, or a petite dessert at each place.', dishes: ['sweet-potato-tartlets', 'peach-cobbler', 'banana-pudding'] },
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
          'sweet-potato-pave',
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
        dishes: ['mac', 'collards', 'cabbage', 'yams', 'mashed-potatoes-gravy', 'stuffing', 'cornbread-dressing', 'jambalaya', 'au-gratin', 'green-beans', 'seafood-salad'],
      },
      { title: 'Included', dishes: ['cornbread', 'rolls', 'cranberry'] },
      { title: 'Add-ons and desserts', dishes: ['crab-stuffed-shrimp', 'sweet-potato-pie', 'pound-cake', 'vanilla-cake'] },
    ],
  },
];
