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
    name: 'Chef’s breakfast',
    price: 26,
    min: 20,
    text: 'Cooked in your office: made-to-order omelettes, mini waffles with the toppings bar, bacon and turkey sausage.',
    menu: 'breakfast',
    popular: true,
  },
  {
    id: 'breakfast-buffet',
    group: 'Breakfast',
    name: 'Breakfast buffet',
    price: 18,
    min: 12,
    text: 'Delivered hot: mini waffles with the toppings bar, handmade mini quiche, bacon and turkey sausage.',
    menu: 'breakfast',
  },
  {
    id: 'boxed-lunch',
    group: 'Lunch',
    name: 'Boxed lunch',
    price: 19,
    min: 10,
    text: 'One entrée, two sides and a cornbread muffin, boxed and labeled for each person.',
    menu: 'lunch',
  },
  {
    id: 'lunch-buffet',
    group: 'Lunch',
    name: 'Lunch buffet',
    price: 26,
    min: 15,
    text: 'Two entrées, two sides, a salad and cornbread muffins, set up hot.',
    menu: 'lunch',
    popular: true,
  },
  {
    id: 'salad-lunch',
    group: 'Lunch',
    name: 'Salad lunch',
    price: 16,
    min: 10,
    text: 'A chicken Caesar or Cobb for each person, with a cornbread muffin.',
    menu: 'lunch',
  },
  {
    id: 'meeting-bites',
    group: 'Meetings',
    name: 'Meeting bites',
    price: 14,
    min: 15,
    text: 'Pick three bites, set out on platters for a meeting, client visit or celebration.',
    menu: 'meetings',
  },
];

// Extras, per person.
export const officeAddOns = [
  { name: 'Premium entrée', price: 5, text: 'Lemon herb salmon, red wine braised short ribs or Cajun shrimp and grits.' },
  { name: 'Salmon on a salad', price: 4, text: 'Instead of chicken.' },
  { name: 'Homemade dessert', price: 5, text: 'Pound cake, vanilla cake or sweet potato pie.' },
  { name: 'Meeting bites with lunch', price: 8, text: 'Add two bites to any lunch.' },
];

// How ordering works, in short. Draft terms for Chef Aaron to confirm.
export const officeTerms = [
  ['Per-person pricing', 'One price per person, so the total is easy to budget. Delivery and tax are added on the quote.'],
  ['Order ahead', 'Two business days’ notice for most orders, a week for the chef’s breakfast.'],
  ['Delivered and set up', 'We arrive ahead of time, set up, and bring plates, napkins and serving utensils.'],
  ['Allergens listed', 'Every dish below lists its allergens. Tell us about allergies when you order.'],
  ['Standing orders', 'A weekly team lunch or a monthly breakfast, on the same day each time.'],
];

export const officeMenus = [
  {
    id: 'breakfast',
    eyebrow: 'Breakfast',
    title: 'Breakfast menu',
    intro: 'The chef’s breakfast is cooked in your office as your team arrives. The breakfast buffet comes hot and ready.',
    courses: [
      {
        title: 'Omelette station',
        note: 'Chef’s breakfast. Made to order, the way each person likes it.',
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
        note: 'Fresh mini waffles and a bar of toppings to build your own.',
        dishes: ['mini-waffles', 'waffle-toppings'],
      },
      { title: 'Breakfast meats', dishes: ['bacon', 'turkey-sausage'] },
      {
        title: 'Add to the spread',
        dishes: [
          'mini-quiche',
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
    title: 'Lunch menu',
    intro: 'Bold, Southern and Caribbean flavors that still travel well and eat neatly at a desk or a conference table.',
    courses: [
      { title: 'Entrées', dishes: ['jerk-chicken', 'hot-honey-chicken', { dish: 'baked-chicken', name: 'Herb grilled chicken' }] },
      {
        title: 'Premium entrées',
        note: 'Add $5 per person.',
        dishes: [
          { dish: 'lemon-salmon', name: 'Lemon herb salmon' },
          { dish: 'short-ribs', name: 'Red wine braised short ribs', description: 'Bone-in short ribs braised in red wine with thyme until they fall apart.' },
          { dish: 'shrimp-and-grits', name: 'Cajun shrimp and grits' },
        ],
      },
      {
        title: 'Sides',
        dishes: [
          { dish: 'mac', name: 'Smoked mac and cheese', description: 'Sharp cheddar, Colby Jack and cream cheese, finished in the smoker.' },
          { dish: 'garlic-mashed', name: 'Garlic mashed potatoes', description: 'Whipped with butter, cream and roasted garlic, under red wine gravy.' },
          'brown-butter-yams',
          'green-beans',
          'collards',
        ],
      },
      {
        title: 'Salads',
        dishes: [
          { dish: 'caesar-salad', name: 'Chicken Caesar', note: 'Topped with herb grilled chicken, or salmon for $4 more.' },
          'cobb-salad',
          'garden-salad',
        ],
      },
      { title: 'With every lunch', dishes: ['cornbread-muffins'] },
      { title: 'Dessert', note: 'Add $5 per person.', dishes: ['pound-cake', 'vanilla-cake', 'sweet-potato-pie'] },
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
          'mini-quiche',
        ],
      },
    ],
  },
];
