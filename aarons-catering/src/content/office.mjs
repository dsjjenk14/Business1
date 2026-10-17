// The Office catering page (office.html): breakfast cooked in the office, lunch
// delivered, and bites for meetings. Entries work like menus.mjs: a dish id from
// dishes.mjs, or { dish, name, description, note } to present it differently here.
// Ingredients and allergens always come from dishes.mjs.

export const officeMenus = [
  {
    id: 'breakfast',
    eyebrow: 'Made in your office',
    title: 'Office breakfast',
    intro:
      'We set up in your office and cook breakfast fresh as your team arrives: omelettes made to order, mini waffles with a build-your-own toppings bar, bacon and turkey sausage.',
    courses: [
      {
        title: 'Omelette station',
        note: 'Made to order, one at a time, the way each person likes it.',
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
          {
            dish: 'chicken-and-waffles',
            name: 'Chicken and waffle bites',
            description: 'Bite-size fried chicken on a mini waffle with a drizzle of syrup and a sliver of strawberry.',
          },
          'mini-quiche',
          'shrimp-grits',
        ],
      },
    ],
  },
  {
    id: 'lunch',
    eyebrow: 'Delivered',
    title: 'Office lunch',
    intro:
      'Set up as a buffet, or boxed one per person so everyone can grab lunch and get back to work. Pick one or two entrées, two sides and a salad, with cornbread.',
    courses: [
      { title: 'Entrées', dishes: ['baked-chicken', 'fried-chicken', 'lemon-salmon', 'turkey-wings', 'fried-fish'] },
      {
        title: 'Sides',
        dishes: [
          { dish: 'mac', name: 'Macaroni and cheese', description: 'Baked, with sharp cheddar, Colby Jack and cream cheese.' },
          'green-beans',
          'yams',
          { dish: 'garlic-mashed', name: 'Garlic mashed potatoes', description: 'Whipped with butter, cream and roasted garlic, under red wine gravy.' },
          'collards',
          'cabbage',
        ],
      },
      {
        title: 'Salads',
        note: 'A salad lunch works too: a Caesar or Cobb for each person.',
        dishes: [{ dish: 'caesar-salad', note: 'Add grilled chicken or lemon herbed salmon.' }, 'cobb-salad', 'garden-salad'],
      },
      { title: 'Bread', dishes: ['cornbread'] },
    ],
  },
  {
    id: 'meetings',
    eyebrow: 'Meetings and celebrations',
    title: 'Meeting bites',
    intro: 'For a client meeting, an all-hands or a team celebration. Set out on platters, ready to eat.',
    courses: [
      { title: 'Bites', dishes: ['smoked-wings', 'crab-shrimp-eggrolls', 'shrimp-kebabs', 'oxtail-biscuits', 'fried-pickles'] },
      { title: 'Desserts', note: 'Ask us about our homemade desserts.' },
    ],
  },
];

// The ways to book, shown as cards near the top of the page.
export const officeFormats = [
  { title: 'Breakfast in the office', text: 'We cook on site: an omelette station, a mini waffle bar, bacon and turkey sausage.', href: '#breakfast' },
  { title: 'Lunch for the team', text: 'A buffet or boxed lunches, delivered and set up.', href: '#lunch' },
  { title: 'Meeting bites', text: 'Wings, egg rolls, shrimp kebabs and more on platters.', href: '#meetings' },
  { title: 'Standing orders', text: 'A weekly team lunch or a monthly breakfast, on the same day each time.', href: '#office-quote' },
];
