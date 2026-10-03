// The menus on the Menus page. Each course lists dishes from dishes.mjs, either
// by id ('mac') or with a different name and description for that menu:
//   { dish: 'mac', name: 'Baked Three-Cheese Macaroni', description: '...' }
// Ingredients and allergens always come from dishes.mjs, so renaming a dish for
// one menu can't make its allergen line wrong.
//
// The `id` is the link anchor: menus.html#catering, menus.html#weddings, ...
// `note` shows as a highlighted line under the intro; `styles` as small tags.

export const menus = [
  {
    id: 'catering',
    title: 'All events',
    heading: 'Catering menu',
    intro:
      'We cater all events: corporate lunches, birthdays, church events, family gatherings, repasts, graduations, brunches and private parties. Mix and match anything below, or ask for something that isn’t listed.',
    courses: [
      {
        title: 'Mains',
        dishes: ['fried-chicken', 'baked-chicken', 'turkey-wings', 'short-ribs', 'lemon-salmon', 'fried-fish', 'cajun-seafood', 'surf-and-turf'],
      },
      { title: 'Party trays', dishes: ['lemon-pepper-wings', 'honey-hot-wings', 'jalapeno-poppers', 'pulled-pork-sliders'] },
      { title: 'Brunch', dishes: ['shrimp-and-grits', 'chicken-and-waffles', 'omelettes', 'mini-quiche', 'hash-browns', 'bacon'] },
      {
        title: 'Sides',
        dishes: ['mac', 'collards', 'yams', 'cabbage', 'green-beans', 'mashed-potatoes', 'rice-and-peas', 'plantains', 'mixed-vegetables', 'potato-salad'],
      },
      { title: 'Bread', dishes: ['cornbread', 'rolls'] },
      { title: 'Desserts', dishes: ['peach-cobbler', 'banana-pudding', 'pound-cake', 'sweet-potato-pie'] },
      { title: 'Drinks', dishes: ['sweet-tea', 'lemonade'] },
    ],
  },
  {
    id: 'weddings',
    title: 'Weddings',
    heading: 'Wedding menu',
    intro:
      'Plated dinner, family-style platters or an elegant buffet. Choose your hors d’oeuvres, entrées, accompaniments and desserts.',
    note: 'Every wedding menu is customized. Treat this as a starting point and we’ll build your menu with you.',
    styles: ['Plated', 'Family-style', 'Buffet'],
    courses: [
      {
        title: 'Hors d’oeuvres',
        dishes: [
          { dish: 'shrimp-grits', name: 'Shrimp and Grits Spoons', description: 'Seared shrimp over white cheddar stone-ground grits, served in tasting cups.' },
          { dish: 'mini-quiche', name: 'Petite Quiche', description: 'Spinach and cheddar, or ham and Swiss, in a buttery crust.' },
          { dish: 'deviled-eggs', name: 'Smoked Paprika Deviled Eggs', description: 'Whipped yolk filling finished with smoked paprika and chives.' },
          { dish: 'fried-green-tomatoes', name: 'Fried Green Tomatoes', description: 'Cornmeal-crusted green tomatoes with comeback sauce.' },
        ],
      },
      {
        title: 'Entrées',
        dishes: [
          { dish: 'short-ribs', name: 'Red Wine Braised Short Ribs', description: 'Bone-in short ribs braised in red wine with thyme and aromatics, served in their own sauce.' },
          { dish: 'lemon-salmon', name: 'Lemon Herb Salmon', description: 'Roasted salmon fillet with lemon, garlic, dill and a touch of butter.' },
          { dish: 'surf-and-turf', name: 'Surf and Turf', description: 'Sliced seared sirloin with garlic butter shrimp.' },
          { dish: 'fried-chicken', name: 'Honey Butter Fried Chicken', description: 'Buttermilk-marinated chicken, fried golden and brushed with honey butter.' },
          { dish: 'baked-chicken', name: 'Herb Roasted Chicken', description: 'Bone-in chicken roasted with garlic, lemon and rosemary.' },
        ],
      },
      {
        title: 'Accompaniments',
        dishes: [
          { dish: 'mac', name: 'Three-Cheese Baked Macaroni', description: 'Sharp cheddar, Colby Jack and cream cheese, baked golden.' },
          { dish: 'au-gratin', name: 'Potatoes au Gratin', description: 'Sliced Yukon Golds layered with cream, Gruyère and sharp cheddar.' },
          { dish: 'mashed-potatoes', name: 'Garlic Whipped Potatoes', description: 'Russet potatoes whipped with butter, cream and garlic.' },
          { dish: 'collards', name: 'Braised Collard Greens', description: 'Slow-cooked with smoked turkey and a splash of cider vinegar.' },
          { dish: 'yams', name: 'Brown Sugar Glazed Yams', description: 'Sweet potatoes glazed with butter, brown sugar, cinnamon and orange.' },
          { dish: 'green-beans', name: 'Green Beans with Smoked Turkey', description: 'Fresh green beans with smoked turkey, garlic and butter.' },
          { dish: 'mixed-vegetables', name: 'Roasted Seasonal Vegetables', description: 'Brussels sprouts, squash, peppers and carrots, roasted with olive oil and garlic.' },
        ],
      },
      {
        title: 'Bread',
        dishes: [
          { dish: 'rolls', name: 'Warm Dinner Rolls', description: 'Soft yeast rolls with butter.' },
          { dish: 'cornbread', name: 'Buttermilk Cornbread', description: 'Golden cornbread made with buttermilk.' },
        ],
      },
      {
        title: 'Desserts',
        dishes: [
          { dish: 'peach-cobbler', name: 'Warm Peach Cobbler', description: 'Spiced peaches under a buttery biscuit top.' },
          { dish: 'banana-pudding', name: 'Banana Pudding Parfaits', description: 'Vanilla custard layered with bananas and vanilla wafers, topped with whipped cream.' },
          { dish: 'pound-cake', name: 'Butter Pound Cake', description: 'Classic pound cake with vanilla and a hint of lemon.' },
          { dish: 'vanilla-cake', name: 'Vanilla Buttercream Cake', description: 'Buttermilk vanilla cake with vanilla buttercream.' },
        ],
      },
    ],
  },
  {
    id: 'meal-prep',
    title: 'Meal prep',
    heading: 'Meal prep menu',
    intro:
      'Personalized meals for the week. Choose your proteins and sides, tell us about any dietary needs or goals, and we’ll put together a plan and a price.',
    note: 'Every meal prep plan is built around you. Swap anything, and ask about portion sizes.',
    courses: [
      { title: 'Proteins', dishes: ['baked-chicken', 'lemon-salmon', 'smothered-chicken', 'turkey-wings', 'short-ribs', 'black-eyed-pea-bowl'] },
      { title: 'Sides', dishes: ['rice-and-peas', 'mixed-vegetables', 'green-beans', 'yams', 'mashed-potatoes', 'cabbage', 'collards', 'house-salad'] },
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
