// Every photo on the site. Each one is a placeholder JPG in site/images/ until
// a real photo replaces it. To swap one, save the real photo over the file with
// the same name. `node build.mjs` also writes PHOTOS.md, a shot list built from
// this file.
//
// w and h are the size to export at. The layout crops to fit, so a slightly
// different shape still works. Keep the subject near the center.

export const photos = {
  hero: {
    file: 'hero.jpg',
    w: 2400,
    h: 1600,
    alt: 'Fried chicken, baked macaroni and cheese, collard greens and cornbread on a dark table',
    shot: 'A full spread from above on a dark table: fried chicken, mac and cheese, collards, cornbread. Warm side light, deep shadows. The bottom third sits under the headline, so keep the food high in the frame.',
    where: 'Home page, top, on tablets and computers',
    compact: true,
  },
  'hero-mobile': {
    file: 'hero-mobile.jpg',
    w: 1200,
    h: 1800,
    alt: 'Fried chicken, baked macaroni and cheese, collard greens and cornbread on a dark table',
    shot: 'The phone version of the hero. Same spread, shot or cropped tall. Keep the food in the top third; the headline covers the rest.',
    where: 'Home page, top, on phones',
    compact: true,
  },
  share: {
    file: 'share.jpg',
    w: 1200,
    h: 630,
    alt: "Aaron J's Catering",
    shot: 'The preview that shows when someone shares a link in a text, DM or Facebook post. The logo over a dark food photo works well. Keep it simple, it shows small.',
    where: 'Link previews (not visible on the site)',
  },
  'dish-fried-chicken': {
    file: 'dish-fried-chicken.jpg',
    w: 1200,
    h: 1500,
    alt: 'Honey butter fried chicken stacked on a platter',
    shot: 'Fried chicken close up, crust glistening with honey butter. Tall frame.',
    where: 'Home page, signature dishes',
  },
  'dish-oxtails': {
    file: 'dish-oxtails.jpg',
    w: 1200,
    h: 1500,
    alt: 'Braised oxtails with gravy over white rice',
    shot: 'Oxtails over rice with gravy and butter beans, in a bowl, from a low angle. Tall frame.',
    where: 'Home page, signature dishes',
  },
  'dish-mac': {
    file: 'dish-mac.jpg',
    w: 1200,
    h: 1500,
    alt: 'A pan of baked macaroni and cheese with a browned top',
    shot: 'A spoon lifting a scoop out of the pan so you can see the layers and the crisp corner. Tall frame.',
    where: 'Home page, signature dishes',
  },
  'dish-peach-cobbler': {
    file: 'dish-peach-cobbler.jpg',
    w: 1200,
    h: 1500,
    alt: 'Warm peach cobbler with a biscuit top',
    shot: 'Peach cobbler in the pan or a bowl, syrup visible, biscuit top golden. Tall frame.',
    where: 'Home page, signature dishes',
  },
  'chef-aaron': {
    file: 'chef-aaron.jpg',
    w: 1200,
    h: 1500,
    alt: 'Chef Aaron Jenkins in the kitchen',
    shot: 'Chef Aaron in chef whites or an apron, in the kitchen, looking at the camera or at the food. Natural, not posed in front of a backdrop. Tall frame.',
    where: 'Home page (chef section) and About page',
  },
  'page-menus': {
    file: 'page-menus.jpg',
    w: 2400,
    h: 1200,
    alt: 'A buffet line of soul food in chafing dishes',
    shot: 'A buffet set up at an event, pans full, shot down the line. Wide frame.',
    where: 'Menus page, top banner',
    compact: true,
  },
  'page-holiday': {
    file: 'page-holiday.jpg',
    w: 2400,
    h: 1200,
    alt: 'A holiday table with a roasted turkey, dressing and sides',
    shot: 'A holiday table: carved turkey or ham, dressing, sides, pies. Warm and close, candles if you have them. Wide frame.',
    where: 'Holiday page, top banner',
    compact: true,
  },
  'page-about': {
    file: 'page-about.jpg',
    w: 2400,
    h: 1200,
    alt: 'Chef Aaron Jenkins plating food at the pass',
    shot: 'Chef Aaron working: at the stove, plating, or tasting from a pot. Wide frame.',
    where: 'About page, top banner',
    compact: true,
  },
  'about-kitchen': {
    file: 'about-kitchen.jpg',
    w: 1600,
    h: 1200,
    alt: 'Collard greens simmering in a large pot on the stove',
    shot: 'The kitchen: big pots on the stove, greens cooking, steam. Landscape.',
    where: 'About page, The kitchen',
  },
  'about-hands': {
    file: 'about-hands.jpg',
    w: 1200,
    h: 1500,
    alt: 'Hands dredging chicken in seasoned flour',
    shot: 'Close up of hands at work: dredging chicken, cutting greens, crimping a pie crust. Tall frame.',
    where: 'About page, How we cook',
  },
};

export const gallery = [
  { file: 'gallery-01.jpg', w: 1600, h: 1200, alt: 'A wedding buffet line under string lights', shot: 'Wedding buffet line, guests moving through, string lights or venue in the background.' },
  { file: 'gallery-02.jpg', w: 1200, h: 1500, alt: 'A platter of fried chicken', shot: 'Fried chicken platter, close.' },
  { file: 'gallery-03.jpg', w: 1600, h: 1200, alt: 'Oxtails and rice in a bowl', shot: 'Oxtails over rice.' },
  { file: 'gallery-04.jpg', w: 1200, h: 1500, alt: 'Macaroni and cheese fresh from the oven', shot: 'Mac and cheese pan straight from the oven, from above.' },
  { file: 'gallery-05.jpg', w: 1600, h: 1200, alt: 'Boxed lunches lined up on a conference table', shot: 'Corporate lunch: labeled boxes or a buffet set in an office.' },
  { file: 'gallery-06.jpg', w: 1600, h: 1200, alt: 'Trays of wings at a birthday party', shot: 'Birthday party trays: wings, sliders, people reaching in.' },
  { file: 'gallery-07.jpg', w: 1600, h: 1200, alt: 'A long family table full of food', shot: 'Family reunion or repast: a long table, full pans, hands passing plates.' },
  { file: 'gallery-08.jpg', w: 1200, h: 1500, alt: 'Peach cobbler being spooned into a bowl', shot: 'Cobbler being served.' },
  { file: 'gallery-09.jpg', w: 1200, h: 1500, alt: 'Chef Aaron Jenkins plating at an event', shot: 'Chef Aaron at work during an event.' },
  { file: 'gallery-10.jpg', w: 1600, h: 1200, alt: 'A carved holiday turkey on a board', shot: 'Holiday turkey, carved, on a board with herbs.' },
  { file: 'gallery-11.jpg', w: 1200, h: 1500, alt: 'Collard greens in a pot', shot: 'Greens in the pot, close.' },
  { file: 'gallery-12.jpg', w: 1600, h: 1200, alt: 'Banana pudding cups on a dessert table', shot: 'Dessert table: banana pudding cups, pound cake, cobbler.' },
];

export const instagramTiles = [1, 2, 3, 4, 5, 6].map((n) => ({
  file: `instagram-${n}.jpg`,
  w: 1080,
  h: 1080,
  alt: 'Instagram post from @aaronjscatering',
  shot: 'Stand-in for the live Instagram feed. These disappear once the feed is connected (see README).',
}));
