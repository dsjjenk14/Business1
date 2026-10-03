# Aaron J's Catering website

Soul food catering for DC, Maryland and Northern Virginia. Six pages: Home, Menus, Holiday Ordering, About, Gallery, and Contact with the quote form.

It's a plain static site with no framework, no server and no monthly platform to pay for. The finished website is the `site/` folder. Everything in it can be put on any web host as-is.

## See it

**Fastest:** go to [app.netlify.com/drop](https://app.netlify.com/drop) and drag the `site/` folder onto the page. You get a working link in seconds that you can open on your phone. Free.

**Properly hosted (recommended for launch):** connect this GitHub repo to Netlify:

1. Netlify, then **Add new site**, then **Import an existing project**, then pick this repo.
2. **Base directory:** `aarons-catering`. The rest is read from `netlify.toml` (build command `node build.mjs`, publish directory `site`).
3. **Domain management:** add `aaronjscatering.com`.

Every change pushed to GitHub then goes live automatically.

## Before launch

Placeholders are deliberately obvious so nothing slips through:

- [ ] **Main photo.** The photo at the top of the home page is a stand-in (one of your buffet photos) until the stock photo arrives. Save the stock photo over `site/images/hero.jpg`, then update its description in `src/content/photos.mjs`. Free stock photos from Unsplash or Pexels can be used on a business site without credit.
- [ ] **Logo file.** The logo is cut out of the flyer and looks right on the site. The original file (a PNG with a transparent background, or an SVG) would be sharper. Save it over `site/images/logo.png`, then run `node tools/brand-images.mjs` to remake the icons and the link preview.
- [ ] **Chef photo.** Every photo on the site is now a real Aaron J's photo. The one exception is the photo of Chef Aaron, which is cut from a flyer and small. Send the original, or a new one of Chef Aaron cooking, and it goes in the home page and About page. `PHOTOS.md` lists every photo and where it shows.
- [ ] **Fried turkey oil.** The Thanksgiving menu lists "frying oil" and no allergens. Turkeys are often fried in peanut oil. If that's the case here, add peanuts to the fried turkey's allergen line in `src/content/dishes.mjs`.
- [ ] **Crab-stuffed shrimp.** The printed menu says it contains egg, but no ingredient on the list has egg. The site keeps the egg warning (the safe direction). Add the egg ingredient, or drop the warning if there's none.
- [ ] **Whole hams.** The printed menu says whole hams are available as add-ons, but the add-on list has no whole ham or price. The site leaves that line out until there is one.
- [ ] **Chef Aaron reads the menus line by line.** Every Thanksgiving dish on the site matches the printed Thanksgiving 2026 menu, ingredient for ingredient (marked `source: 'thanksgiving-2026'` in the code). The dishes on the flyer menu are all there too: baked or grilled chicken, smothered turkey wings, Southern fried chicken, braised short ribs, surf and turf, lemon herbed salmon, fried fish, shrimp, shrimp and grits, chicken and waffles, omelettes, mini quiche, mashed potatoes and mixed vegetables. I wrote the rest, and every ingredient list and allergen line, as a starting draft. The ingredient lists must match the actual recipes, and the allergen lines must match the ingredients. People with allergies will rely on them. Edit `src/content/dishes.mjs`, then run the checks (below), which fail if an ingredient and its allergen line disagree.
- [ ] **Christmas and New Year's.** The Holiday page has the real Thanksgiving menu, prices and policies. For Christmas and New Year's it says the menus are coming and asks people to get in touch. Send those menus when they're ready.
- [ ] **Reply time.** The site says quote requests get a reply within one business day. Change it in `src/pages/contact.mjs` and `src/pages/home.mjs` if that's not right.
- [ ] **Turn on the quote form.** See below. One test submission and one click.
- [ ] **Instagram feed.** See below. About five minutes.
- [ ] **Google Business Profile.** The site doesn't name a city (by request), so local search depends on this. Set one up as a service-area business (Northern Virginia, DC, Maryland), link it to the site, and ask happy clients for Google reviews. Then add the site to [Google Search Console](https://search.google.com/search-console) and submit `https://aaronjscatering.com/sitemap.xml`.

## The quote form

The form emails each request to chef@aaronjscatering.com using [FormSubmit](https://formsubmit.co). It's free, with no account and no code.

1. Once the site is online, fill in the form yourself and send it.
2. FormSubmit emails chef@aaronjscatering.com an **Activate Form** link. Click it. Until you do, the form shows a "didn't go through" message with a button to email the request instead, so no request is lost.
3. Send one more test. It should arrive as a neat table, with a subject like *Quote request: Wedding, 140 guests, Sat, Jun 12, 2027 (Maya Thompson)*. Hit reply to answer the client directly.

Optional: FormSubmit's activation email also gives you a random-string address. Put it in `src/content/site.mjs` (`form.ajax` and `form.action`) in place of the email address, so the address isn't visible in the page source.

After sending, the visitor sees a confirmation that sets expectations: Chef Aaron reads every request and replies within one business day, and for events in the next seven days they should call.

## Instagram feed

The home page shows six placeholder tiles linking to @aaronjscatering until a live feed is connected:

1. Sign up at [behold.so](https://behold.so) (the free plan is enough) and connect the Instagram account.
2. Create a feed, open **Embed code**, and copy the `feed-id` value.
3. Paste it into `src/content/site.mjs` under `instagram.beholdFeedId` and run `node build.mjs`.

The feed only loads when someone scrolls near it, so it doesn't slow the page down.

## Holiday season

Holiday ordering turns itself on automatically between the dates in `src/content/holiday.mjs` (currently October 1, 2026 to January 1, 2027, so it's on now). In season:

- A banner across the top of every page says when Thanksgiving orders close. After the deadline it switches to asking about Christmas and New Year's.
- A holiday block appears on the home page under the hero.
- "Holiday" in the menu gets an "Order now" tag.

Preview it any time:

| Add to any page address | What it does |
|---|---|
| `?holiday=on` | Holiday mode on |
| `?holiday=off` | Holiday mode off |
| `?today=2026-11-20` | Pretend it's that date |
| `?holiday=auto` | Back to normal |

Each season, update the menu, prices, dates and the `year` in `src/content/holiday.mjs`. Weekday names are worked out from the dates, so they can't be wrong.

## Changing things

Copy and content live in `src/`. Change it there, then rebuild:

```bash
node build.mjs          # rebuilds every page into site/
node tools/check.mjs    # allergens match ingredients, no broken links, no missing alt text, no exclamation points
```

You need [Node.js](https://nodejs.org) 18 or newer, and nothing else. There's nothing to install.

| To change | Edit |
|---|---|
| Phone, email, Instagram, service area, event types, favorite dishes | `src/content/site.mjs` |
| Dishes: names, descriptions, ingredients, allergens | `src/content/dishes.mjs` |
| Which dishes appear on which event menu | `src/content/menus.mjs` |
| Holiday packages, prices, dates, delivery | `src/content/holiday.mjs` |
| Photo descriptions and the shot list | `src/content/photos.mjs` |
| Page copy | `src/pages/*.mjs` |
| Header and footer, SEO tags, structured data | `src/layout.mjs` |
| Look and feel | `site/css/site.css` |
| Menu, tabs, lightbox, form behavior | `site/js/site.js` |

Don't edit the `.html` files in `site/` directly. They're rebuilt from `src/` and your edit would be overwritten.

## How it's built

- **Mobile first.** The phone layout is the design. Sticky header with the logo, a call button and Request a Quote. Phone numbers and emails are tap-to-call and tap-to-email everywhere.
- **Brand.** Dark background (#0B0B0C), off-white text (#F7F5F2), orange (#F26A21) for buttons and links, red (#E1301F) for small accents, and gold (#FBB513) only for prices and numbers. Anton for headlines and prices, Plus Jakarta Sans for everything else. Both are hosted with the site, so no Google Fonts request (SIL Open Font License).
- **Fast.** No framework. About 5 KB of JavaScript and 9 KB of CSS once compressed, plus 45 KB of fonts. Photos are resized for their spot and stripped of camera data, photos below the first screen load as you scroll, the hero photo is preloaded, and phones get their own portrait hero (`hero-mobile.jpg`).
- **Local SEO.** Every page has its own title and description aimed at searches like "soul food catering DC" and "Thanksgiving catering Northern Virginia". There's structured data for the business (FoodEstablishment with service area), the menus (Menu) and the holiday packages (offers with prices), plus link-preview tags, `sitemap.xml` and `robots.txt`.
- **Accessible.** Semantic HTML, a skip link, labeled form fields with inline errors, keyboard-friendly menu tabs and lightbox, and reduced-motion support.
- **Works without JavaScript.** The form still sends (to `thanks.html`), menus show as one long page, and gallery photos open full size.
- Icons are adapted from [Lucide](https://lucide.dev) (ISC license).

`tools/placeholders.mjs` draws placeholder photos for new photo slots, and `tools/brand-images.mjs` makes the link preview and icons from the logo and the chef photo. Both need Playwright, and neither is needed for normal edits.
