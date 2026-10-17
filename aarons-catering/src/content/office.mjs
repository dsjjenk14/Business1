// The Office catering page (office.html): per-person packages for businesses,
// the menus they choose from, and how ordering works.
//
// PRICES ARE DRAFTS for Chef Aaron to confirm: per person, before delivery and
// tax. Change them here and rebuild; the page and the request form's estimate
// both read from this file.
//
// Menu entries work like menus.mjs: a dish id from dishes.mjs, or
// { dish, name, description, note } to present it differently here.
// Ingredients and allergens always come from dishes.mjs.

export const officePackages = [
  {
    id: 'chef-breakfast',
    group: 'Breakfast',
    name: 'Chef-attended breakfast',
    price: 26,
    min: 20,
    text: 'Cooked to order in your office: an omelette station, mini waffles with a dressed toppings bar, bacon, turkey sausage and fresh fruit cups.',
    menu: 'breakfast',
    popular: true,
  },
  {
    id: 'breakfast-buffet',
    group: 'Breakfast',
    name: 'Breakfast spread',
    price: 18,
    min: 12,
    text: 'Delivered hot and set out: mini waffles with the toppings bar, petite quiche, bacon, turkey sausage and fresh fruit cups.',
    menu: 'breakfast',
  },
  {
    id: 'boxed-lunch',
    group: 'Lunch',
    name: 'Executive lunch box',
    price: 19,
    min: 10,
    text: 'A signature box for each guest: entrée, two sides and a brown butter cornbread madeleine, packed and labeled by name.',
    menu: 'lunch',
  },
  {
    id: 'lunch-buffet',
    group: 'Lunch',
    name: 'Executive lunch buffet',
    price: 26,
    min: 15,
    text: 'Two entrées, two sides, a composed salad and brown butter cornbread madeleines, set up hot in chafers.',
    menu: 'lunch',
    popular: true,
  },
  {
    id: 'salad-lunch',
    group: 'Lunch',
    name: 'Composed salad lunch',
    price: 16,
    min: 10,
    text: 'A Caesar with herb roasted chicken or a Cobb for each guest, with a brown butter cornbread madeleine.',
    menu: 'lunch',
  },
  {
    id: 'meeting-bites',
    group: 'Meetings',
    name: 'Meeting bites',
    price: 14,
    min: 15,
    text: 'Three small plates, displayed for a client meeting, board meeting or celebration.',
    menu: 'meetings',
  },
];

// The executive lunch boxes: one per guest, each a set entrée and sides
// (dish ids). A list inside the list is a choice ("green beans, garden salad
// or sweet potato pavé"). Premium boxes add to the box price. Allergens are
// worked out from the dishes, counting every choice.
export const officeBoxes = [
  { name: 'The Hot Honey', dishes: ['hot-honey-chicken', 'gouda-mac', 'caesar-salad', 'cornbread-madeleines'] },
  { name: 'The Islander', dishes: ['jerk-chicken', 'coconut-rice', 'mango-slaw', 'festival'] },
  { name: 'The Classic', dishes: ['baked-chicken', 'garlic-mashed', ['green-beans', 'garden-salad', 'sweet-potato-pave'], 'cornbread-madeleines'] },
  { name: 'The Executive', premium: 8, dishes: ['short-ribs', 'garlic-mashed', 'garden-salad', 'cornbread-madeleines'] },
  { name: 'The Garden', tag: 'Vegetarian', dishes: ['cauliflower-steak', 'truffle-grits', 'garden-salad', 'cornbread-madeleines'] },
  { name: 'The Sandwich', tag: 'Sandwich', dishes: [['hot-honey-sandwich', 'shrimp-poboy', 'chicken-salad-croissant'], ['garden-salad', 'caesar-salad'], 'fruit-cups'] },
  { name: 'The Bowl', tag: 'Bowl', dishes: [['jerk-bowl', 'veggie-bowl'], 'fruit-cups', 'cornbread-madeleines'] },
  { name: 'The Coastal', tag: 'Salad', premium: 5, dishes: ['caesar-salad', 'blackened-salmon', 'cornbread-madeleines'] },
  { name: 'The Composed Salad', tag: 'Salad', dishes: [['cobb-salad', 'caesar-salad'], 'cornbread-madeleines'], note: 'The Caesar comes with herb roasted chicken.' },
];

// Extras, per person.
export const officeAddOns = [
  { name: 'Premium entrée', price: 5, text: 'Blackened salmon or Cajun shrimp and grits.' },
  { name: 'Red wine braised short rib', price: 8, text: 'As the entrée on a buffet.' },
  { name: 'Blackened salmon on a salad', price: 4, text: 'Instead of chicken.' },
  { name: 'Dessert', price: 5, text: 'Sweet potato pie tartlets, peach cobbler tartlets or banana pudding jars.' },
  { name: 'Meeting bites with lunch', price: 8, text: 'Add two bites to any lunch.' },
];

// How ordering works, in short. Draft terms for Chef Aaron to confirm.
export const officeTerms = [
  ['Per-person pricing', 'One price per person, so the total is easy to budget. Delivery and tax are added on the quote.'],
  ['Order ahead', 'Two business days’ notice for most orders, a week for the chef-attended breakfast.'],
  ['Delivered and set up', 'We arrive ahead of time, set up, and bring plates, napkins and serving utensils.'],
  ['Allergens listed', 'Every dish below lists its allergens. Tell us about allergies when you order.'],
  ['Standing orders', 'A weekly team lunch or a monthly breakfast, on the same day each time.'],
];

export const officeMenus = [
  {
    id: 'breakfast',
    eyebrow: 'Breakfast',
    title: 'Executive breakfast',
    intro: 'The chef-attended breakfast is cooked to order in your office as your team arrives. The breakfast spread arrives hot and set out.',
    courses: [
      {
        title: 'Omelette station',
        note: 'Chef-attended. Made to order, one at a time.',
        dishes: [
          {
            dish: 'omelettes',
            name: 'Made-to-order omelettes',
            description: 'Pick the fillings: cheddar, peppers, onion, spinach, tomato, mushrooms, turkey sausage or ham.',
          },
        ],
      },
      {
        title: 'Mini waffle bar',
        note: 'Mini waffles off the iron, with a dressed bar of toppings.',
        dishes: ['mini-waffles', 'waffle-toppings'],
      },
      { title: 'Breakfast meats', dishes: ['bacon', 'turkey-sausage'] },
      {
        title: 'Fresh fruit',
        note: 'With every breakfast.',
        dishes: ['fruit-cups'],
      },
      {
        title: 'Add to the spread',
        dishes: [
          { dish: 'mini-quiche', name: 'Petite quiche' },
          {
            dish: 'chicken-and-waffles',
            name: 'Chicken and waffle bites',
            description: 'Bite-size fried chicken on a mini waffle with a drizzle of syrup and a sliver of strawberry.',
          },
          'shrimp-grits',
        ],
      },
    ],
  },
  {
    id: 'lunch',
    eyebrow: 'Lunch',
    title: 'Executive lunch',
    intro:
      'Restaurant-quality lunches that travel well and eat neatly at a desk or a boardroom table. Choose a signature box above, or build a buffet from the menu below.',
    courses: [
      {
        title: 'Entrées',
        dishes: [
          'hot-honey-chicken',
          'jerk-chicken',
          { dish: 'baked-chicken', name: 'Herb roasted chicken', description: 'Bone-in chicken with garlic, lemon, rosemary and paprika.' },
          'cajun-pasta',
          { dish: 'jambalaya', name: 'Jambalaya rice' },
        ],
      },
      {
        title: 'Sandwiches',
        note: 'Wrapped and labeled, with a side.',
        dishes: ['hot-honey-sandwich', 'shrimp-poboy', 'chicken-salad-croissant'],
      },
      {
        title: 'Bowls',
        dishes: ['jerk-bowl', 'veggie-bowl'],
      },
      {
        title: 'Vegetarian',
        note: 'Every meat-free dish is marked Vegetarian.',
        dishes: ['cauliflower-steak', 'truffle-grits'],
      },
      {
        title: 'Premium entrées',
        note: 'Salmon or shrimp and grits add $5 per person; the short rib adds $8.',
        dishes: [
          { dish: 'blackened-salmon', note: 'Add $5 per person.' },
          { dish: 'short-ribs', name: 'Red wine braised short rib', description: 'Bone-in short rib braised in red wine with thyme until it falls apart, in its own glossy jus.', note: 'Add $8 per person.' },
          { dish: 'shrimp-and-grits', name: 'Cajun shrimp and grits', note: 'Add $5 per person.' },
        ],
      },
      {
        title: 'Sides',
        dishes: [
          'gouda-mac',
          { dish: 'garlic-mashed', name: 'Roasted garlic whipped potatoes', description: 'Whipped with butter, cream and roasted garlic, under red wine gravy.' },
          'sweet-potato-pave',
          { dish: 'green-beans', name: 'Green beans' },
        ],
      },
      {
        title: 'Composed salads',
        dishes: [
          { dish: 'caesar-salad', name: 'Caesar', note: 'Topped with herb roasted chicken, or blackened salmon for $4 more.' },
          { dish: 'cobb-salad', name: 'Cobb' },
          { dish: 'garden-salad', name: 'Garden' },
        ],
      },
      { title: 'With every lunch', dishes: ['cornbread-madeleines'] },
      { title: 'Dessert', note: 'Add $5 per person. Individual jars, tartlets and ramekins.', dishes: ['sweet-potato-tartlets', 'peach-cobbler', 'banana-pudding'] },
    ],
  },
  {
    id: 'meetings',
    eyebrow: 'Meetings',
    title: 'Meeting bites',
    intro: 'Pick three. Set out on platters for a client meeting, an all-hands or a team celebration.',
    courses: [
      {
        title: 'Bites',
        dishes: [
          'chicken-caviar',
          'smoked-wings',
          'crab-shrimp-eggrolls',
          'shrimp-kebabs',
          'bacon-scallops',
          'crab-mushrooms',
          {
            dish: 'chicken-and-waffles',
            name: 'Chicken and waffle bites',
            description: 'Bite-size fried chicken on a mini waffle with a drizzle of syrup and a sliver of strawberry.',
          },
          { dish: 'mini-quiche', name: 'Petite quiche' },
        ],
      },
    ],
  },
];
