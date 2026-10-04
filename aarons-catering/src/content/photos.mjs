// Every photo on the site. To swap one, save the new photo over the file in
// site/images/ with the same name, and update its `alt` (the description read
// aloud by screen readers and shown if the image fails to load).
// `node build.mjs` also writes PHOTOS.md, a list built from this file.
//
// w and h are the file's size in pixels. The layout crops to fit, so a slightly
// different shape still works. Keep the subject near the center, or set
// `focus` (CSS object-position, e.g. '50% 70%') to aim the crop.
//
// `source` says where an image came from. tools/placeholders.mjs only draws
// placeholders for slots without one, so it never draws over a real photo:
//   'photo'  Aaron J's own photos, cropped and resized for the site.
//   'flyer'  cut from the Aaron J's flyers. Real, but low resolution: replace
//            with the original photo when you have it.
//   'made'   built from the logo and photos by tools/brand-images.mjs.
//   'generated'  made with an AI image generator.

export const photos = {
  hero: {
    file: 'hero.jpg',
    w: 1024,
    h: 1536,
    alt: 'A Thanksgiving spread: glazed ham with pineapple and cherries, roast turkey, mac and cheese, collard greens, candied yams, stuffing, mashed potatoes, green beans, cranberry sauce, rolls, cornbread and sweet potato pie',
    shot: 'Main photo at the top of the home page. Made with an AI image generator.',
    where: 'Home page, top',
    focus: '50% 8%', // keeps the top of the ham in view when computers crop the photo
    source: 'generated',
  },
  share: {
    file: 'share.jpg',
    w: 1200,
    h: 630,
    alt: "Aaron J's Catering",
    shot: 'The preview that shows when someone shares a link in a text, DM or Facebook post. Made from the logo and the chef photo by tools/brand-images.mjs; run it again after changing either.',
    where: 'Link previews (not visible on the site)',
    source: 'made',
  },
  'dish-chicken-and-waffles': {
    file: 'dish-chicken-and-waffles.jpg',
    w: 1200,
    h: 1500,
    alt: 'Fried chicken and waffles on a plate with syrup and sliced strawberries',
    shot: 'Chicken and waffles, plated.',
    where: 'Home page, signature dishes',
    source: 'photo',
  },
  'dish-ham': {
    file: 'dish-ham.jpg',
    w: 1200,
    h: 1500,
    alt: 'Spiral-cut glazed ham with pineapple rings, cherries and a marigold',
    shot: 'Glazed ham.',
    where: 'Home page, favorites',
    source: 'photo',
  },
  'dish-mac': {
    file: 'dish-mac.jpg',
    w: 1200,
    h: 1500,
    alt: 'Baked macaroni and cheese with a browned top',
    shot: 'Mac and cheese, from above.',
    where: 'Home page, signature dishes',
    source: 'photo',
  },
  'dish-cajun-seafood': {
    file: 'dish-cajun-seafood.jpg',
    w: 1200,
    h: 1500,
    alt: 'Crab, shrimp and sausage in a Cajun butter sauce',
    shot: 'Cajun crab and shrimp, plated.',
    where: 'Home page, signature dishes',
    source: 'photo',
  },
  'chef-aaron': {
    file: 'chef-aaron.jpg',
    w: 960,
    h: 710,
    alt: 'Chef Aaron Jenkins in chef whites, arms open, behind a buffet of chafing dishes with sunflower centerpieces',
    shot: 'From the flyer. Send the original photo for a sharper version (at least 1600 px wide).',
    where: 'About page',
    source: 'flyer',
  },
  'page-menus': {
    file: 'page-menus.jpg',
    w: 1932,
    h: 1449,
    alt: 'A brunch buffet of chicken and waffles with strawberries, mini quiches and hash browns',
    shot: 'Brunch buffet in chafing pans.',
    where: 'Menus page, top banner',
    focus: '50% 72%', // where to aim when the banner crops the photo
    source: 'photo',
  },
  'page-holiday': {
    file: 'page-holiday.jpg',
    w: 2400,
    h: 1120,
    alt: 'A holiday buffet line on a red tablecloth: lemon salmon, chicken and sides in chafing dishes',
    shot: 'Holiday buffet line.',
    where: 'Holiday page, top banner',
    focus: '25% 50%', // cropped to the buffet line; on phones aim at the salmon
    source: 'photo',
  },
};

export const gallery = [
  ['gallery-01.jpg', 1200, 900, 'A catered buffet on a red tablecloth: lemon salmon, chicken, mac and cheese, yams, plantains and roasted vegetables'],
  ['gallery-02.jpg', 900, 1200, 'Glazed ham with pineapple rings and cherries, garnished with parsley, rosemary and a marigold'],
  ['gallery-04.jpg', 1200, 900, 'Baked macaroni and cheese with an edible flower'],
  ['gallery-05.jpg', 908, 1200, 'Chicken and waffles on a plate with strawberries'],
  ['gallery-06.jpg', 900, 1200, 'A brunch buffet set up in a home: chicken and waffles, mini quiches, hash browns and more'],
  ['gallery-07.jpg', 900, 1200, 'Crab, shrimp and sausage in a Cajun butter sauce'],
  ['gallery-08.jpg', 900, 1200, 'A party spread of wings, bacon-wrapped jalapeño poppers, a baked cheese dip and tortilla chips'],
  ['gallery-09.jpg', 900, 1200, 'Rice and peas next to roasted vegetables with Brussels sprouts, squash and peppers'],
  ['gallery-10.jpg', 900, 1200, 'Fried plantains and sweet potatoes with red pepper'],
  ['gallery-11.jpg', 680, 1200, 'Candied yams in a pan'],
  ['gallery-12.jpg', 692, 1200, 'A pan of fried chicken and waffles topped with strawberries'],
]
  .map(([file, w, h, alt]) => ({ file, w, h, alt, shot: 'Aaron J’s photo.', source: 'photo' }))
  .concat([
    {
      file: 'gallery-13.jpg',
      w: 960,
      h: 710,
      alt: 'Chef Aaron Jenkins behind a buffet line of chafing dishes with sunflower centerpieces',
      shot: 'From the flyer. Send the original photo for a sharper version.',
      source: 'flyer',
    },
  ]);

// Stand-ins for the live Instagram feed. They disappear once the feed is
// connected (see README).
// Different photos from the Favorites above them on the home page.
export const instagramTiles = [
  'A catered buffet on a red tablecloth',
  'A brunch buffet of chicken and waffles and mini quiches',
  'Wings and bacon-wrapped jalapeño poppers',
  'Roasted vegetables next to rice and peas',
  'Fried plantains and sweet potatoes',
  'Candied yams',
].map((alt, i) => ({
  file: `instagram-${i + 1}.jpg`,
  w: 600,
  h: 600,
  alt,
  shot: 'Stand-in for the live Instagram feed.',
  source: 'photo',
}));
