# Aaron J's Catering website

Soul food catering for DC, Maryland and Northern Virginia. Home, Menus, Office catering, Holiday Ordering (with a Thanksgiving and Christmas order page), About, Gallery, and Contact with the quote form.

It's a plain static site with no framework and no monthly platform to pay for, plus one small server function for card payments (Netlify runs it for free). The finished website is the `site/` folder. Everything in it can be put on any web host as-is.

## See it

**Fastest:** go to [app.netlify.com/drop](https://app.netlify.com/drop) and drag the `site/` folder onto the page. You get a working link in seconds that you can open on your phone. Free.

**Properly hosted (recommended for launch):** connect this GitHub repo to Netlify:

1. Netlify, then **Add new site**, then **Import an existing project**, then pick this repo.
2. **Base directory:** `aarons-catering`. The rest is read from `netlify.toml` (build command `node build.mjs`, publish directory `site`).
3. **Domain management:** add `aaronjscatering.com`.

Every change pushed to GitHub then goes live automatically.

## Before launch

Placeholders are deliberately obvious so nothing slips through:

- [ ] **Main photo after the holidays.** The photo at the top of the home page is a holiday spread. After New Year's, swap in a year-round photo: save it over `site/images/hero.jpg` and update its description and size in `src/content/photos.mjs`.
- [ ] **Logo file.** The logo is cut out of the flyer and looks right on the site. The original file (a PNG with a transparent background, or an SVG) would be sharper. Save it over `site/images/logo.png`, then run `node tools/brand-images.mjs` to remake the gold logo, the icons and the link preview.
- [ ] **Chef photo.** Every photo on the site is now a real Aaron J's photo. The one exception is the photo of Chef Aaron, which is cut from a flyer and small. Send the original, or a new one of Chef Aaron cooking, and it goes in the home page and About page. `PHOTOS.md` lists every photo and where it shows.
- [ ] **A short photo session.** The biggest single upgrade. 8 to 10 plated dishes (the four favorites first) shot on a dark table by a window, plus a portrait of Chef Aaron. Phone photos are fine if the light is good. They replace the favorites, the gallery and the page headers, so the real food looks as good as the main photo.
- [ ] **Chef Aaron's story.** The About page has two sentences. Add a short paragraph in his words: where he learned to cook, why soul food, how long he's been catering. Edit `src/pages/about.mjs`.
- [ ] **Price guide.** Add a range to `priceGuide` in `src/content/site.mjs` (for example "Most events run $25 to $45 per guest.") and it shows at the top of the Menus page. Empty means it doesn't show.
- [ ] **Fried turkey oil.** The Thanksgiving menu lists "frying oil" and no allergens. Turkeys are often fried in peanut oil. If that's the case here, add peanuts to the fried turkey's allergen line in `src/content/dishes.mjs`.
- [ ] **Crab-stuffed shrimp.** The printed menu says it contains egg, but no ingredient on the list has egg. The site keeps the egg warning (the safe direction). Add the egg ingredient, or drop the warning if there's none.
- [ ] **Whole hams.** The printed menu says whole hams are available as add-ons, but the add-on list has no whole ham or price. The site leaves that line out until there is one.
- [ ] **Office catering prices and terms.** The Office page has per-person packages: chef's breakfast cooked in the office $26 (20 people minimum), breakfast buffet $18 (12), boxed lunch $19 (10), lunch buffet $26 (15), salad lunch $16 (10), meeting bites $14 (15), plus extras ($4 to $8 per person). **These prices, minimums and the terms under "Made for offices" (two business days' notice, a week for the chef's breakfast; plates, napkins and utensils included; standing orders) are my drafts.** Change them in `src/content/office.mjs`. Also check the drafts for the new dishes: jerk chicken, hot honey fried chicken, sweet potato biscuits with cinnamon honey butter, mini waffles, the toppings bar, bacon and turkey sausage. Requests arrive as *Office catering: Lunch buffet ($26 per person), 40 people, ...* with an estimate.
- [ ] **The modern menu (2026).** New dishes, all drafts for Chef Aaron to confirm or cut: fried chicken and hot honey caviar (crisp chicken bites with crème fraîche and spherified hot honey pearls that look like caviar; no fish), brown butter cornbread madeleines (the bread everywhere), sweet potato pavé, sweet potato pie tartlets with toasted meringue, peach cobbler tartlets, red wine braised oxtail, blackened salmon with lemon beurre blanc, hot honey fried chicken, jerk chicken, smoked gouda mac and cheese (served in individual cast-iron cocottes; collards in petite crocks with their pot likker, so check he has the serving pieces) and banana pudding jars. Shrimp and grits tasting spoons are back as a small plate. Office lunches are nine signature executive boxes: four hot (The Hot Honey, The Islander, The Classic with a choice of green beans, garden salad or sweet potato pavé, The Executive at +$8), a vegetarian plate (The Garden: a choice of wild mushroom étouffée or wild mushroom and black truffle grits, garden salad, madeleine), a sandwich box (choice of three sandwiches, a side salad and a fruit cup), a bowl box (jerk chicken or roasted vegetable bowl, fruit cup, madeleine) and two composed salads (The Coastal, and The Composed Salad with a choice of Cobb or Caesar), in `src/content/office.mjs`. No collards or oxtail on the lunch menu; they're for holidays and events. Office lunch also has jambalaya rice, Cajun chicken pasta, sandwiches (hot honey chicken, shrimp po'boy, Southern chicken salad croissant, no grapes or pecans) and bowls (jerk chicken, roasted vegetable and black-eyed pea), all drafts. The Christmas packages are unchanged. New meat-free mains, also drafts: wild mushroom étouffée (vegan: oil roux, vegetable stock, over jasmine rice) and wild mushroom and black truffle grits (vegetarian), on the Events mains, wedding entrées and accompaniments, and office lunch. Meat-free dishes carry a Vegetarian or Vegan tag; the roasted vegetable bowl is vegan. Truffle costs move with the market, so confirm the grits price before quoting.
- [ ] **Chef Aaron reads the menus line by line.** Every menu except Holidays uses only the foods on Aaron J's own flyers and menus (cabbage and cornbread come from the holiday flyer). The Thanksgiving dishes match the printed Thanksgiving 2026 menu, except Dinner for Two, which is now 2 meats and 2 sides (by request). The ingredient lists for the other dishes are my drafts, and people with allergies will rely on them, so check each one: the appetizers (oxtail-stuffed biscuits, shrimp kebabs, smoked wings, fried pickles, crab-stuffed mushrooms, crab and shrimp egg rolls, bacon-wrapped scallops), the salads, the garlic mashed potatoes with red wine gravy, and the entrées, seafood and brunch dishes. Edit `src/content/dishes.mjs`, then run the checks (below), which fail if an ingredient and its allergen line disagree.
- [ ] **Thanksgiving, Christmas and New Year's.** The Holiday page sells both holidays with the same packages, menu and prices as the printed Thanksgiving menu. Thanksgiving goes out Tuesday evening, November 24: delivery between 4 and 7 pm, pickup from 5 to 8 pm (draft times, confirm them), and orders close Friday, November 20. Christmas goes out Christmas Eve, Thursday, December 24: delivery by 11 am or pickup by 1 pm, and orders close Friday, December 18 (my guess). Change any of it in `events` in `src/content/holiday.mjs`. For New Year's it says the menus are coming and asks people to get in touch. Send those menus when they're ready.
- [ ] **Reply time.** The site says quote requests get a reply within one business day. Change it in `src/pages/contact.mjs` and `src/pages/home.mjs` if that's not right.
- [ ] **Turn on the quote form.** See below. One test submission and one click. The holiday order page sends through the same service, so this turns on both.
- [ ] **Turn on card payments (Stripe).** See "Card payments" below. About 15 minutes. Until it's on, holiday orders still arrive by email, marked "Not paid yet", and the customer is told you'll be in touch to take payment.
- [ ] **Extra side or extra meat with an upcharge.** On the order page, an extra seafood salad add-on costs $35 + $25 and extra short ribs cost $40 + $30, the same upcharges as in the packages. Change it in `src/content/holiday.mjs` if that's not how it should work.
- [ ] **Instagram feed.** See below. About five minutes.
- [ ] **Google Business Profile.** The site doesn't name a city (by request), so local search depends on this. Set one up as a service-area business (Northern Virginia, DC, Maryland), link it to the site, and ask happy clients for Google reviews. Once there are a few, fill in `reviews` in `src/content/site.mjs` (rating, count and the link to the reviews) and a star rating shows next to both quote forms. Then add the site to [Google Search Console](https://search.google.com/search-console) and submit `https://aaronjscatering.com/sitemap.xml`.

## The quote form

The form emails each request to chef@aaronjscatering.com using [FormSubmit](https://formsubmit.co). It's free, with no account and no code.

1. Once the site is online, fill in the form yourself and send it.
2. FormSubmit emails chef@aaronjscatering.com an **Activate Form** link. Click it. Until you do, the form shows a "didn't go through" message with a button to email the request instead, so no request is lost.
3. Send one more test. It should arrive as a neat table, with a subject like *Quote request: Wedding, 140 guests, Sat, Jun 12, 2027 (Maya Thompson)*. Hit reply to answer the client directly.

Optional: FormSubmit's activation email also gives you a random-string address. Put it in `src/content/site.mjs` (`form.ajax` and `form.action`) in place of the email address, so the address isn't visible in the page source.

After sending, the visitor sees a confirmation that sets expectations: Chef Aaron reads every request and replies within one business day, and for events in the next seven days they should call.

## Instagram feed

The home page shows six placeholder tiles (different photos from the favorites above them) linking to @aaronjscatering until a live feed is connected:

1. Sign up at [behold.so](https://behold.so) (the free plan is enough) and connect the Instagram account.
2. Create a feed, open **Embed code**, and copy the `feed-id` value.
3. Paste it into `src/content/site.mjs` under `instagram.beholdFeedId` and run `node build.mjs`.

The feed only loads when someone scrolls near it, so it doesn't slow the page down.

## Holiday season

Holiday ordering turns itself on automatically between the dates in `src/content/holiday.mjs` (currently October 1, 2026 to January 1, 2027, so it's on now). In season:

- A banner across the top of every page says when Thanksgiving orders close, then Christmas. After the deadline it switches to asking about New Year's.
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

## Holiday orders (Thanksgiving and Christmas this season)

People order right on the site at `order.html` ("Order this" on each package, "Order now" on the Holiday page, and "Order" in the banner all go there). They pick Thanksgiving or Christmas (a holiday can't be picked once its orders close), then a package, their meats, sides and dessert, rolls or cornbread, any add-ons, and pickup or delivery, and see the total as they go.

- **Where orders go.** Each order is emailed to chef@aaronjscatering.com as a table, with a subject like *Thanksgiving order: The Full Spread, $295, delivery (Maya Thompson)*. It lists every pick, the add-ons, the delivery address, notes and allergies, and the total. Reply to it to reach the customer.
- **Payment.** Customers pay by card on Stripe's checkout page (see "Card payments" below). The order email arrives once they've paid, with the subject starting *Thanksgiving order, paid* (or *Christmas*), and the payment in Stripe carries the same details. If card payments aren't on, the email says "Not paid yet. Take payment from the customer."
- **Sold out.** Set `soldOut: true` on that holiday in `src/content/holiday.mjs` and rebuild. The order page then marks it sold out; once both are, it points people to New Year's.
- **After the deadline** (December 18), the order page closes by itself.
- Prices, packages, add-ons and delivery fees all come from `src/content/holiday.mjs`, so the order page and the Holiday page always match.

## Card payments

The order page sends customers to Stripe to pay by card (Apple Pay and Google Pay too, if you turn them on in Stripe). Stripe holds the money and pays it out to your bank. A small server function, `netlify/functions/checkout.mjs`, works out the price from `src/content/holiday.mjs` every time, so nobody can change a total in their browser.

1. Make a Stripe account at [stripe.com](https://stripe.com) and fill in the business and bank details.
2. In Stripe, open **Developers**, then **API keys**, and copy the **Secret key**. Start with the test key (it begins `sk_test_`) so you can try it with Stripe's test card, 4242 4242 4242 4242, any future date and any CVC.
3. In Netlify, open **Site configuration**, then **Environment variables**, and add `STRIPE_SECRET_KEY` with that key. Redeploy.
4. Place a test order. When it works, swap in the live key (it begins `sk_live_`) and redeploy.
5. In Stripe settings, turn on **email receipts for successful payments** (customers get a receipt) and **email notifications for successful payments** (you get one too).

Refunds (for cancellations by the deadline) are one click on the payment in Stripe. Card payments only work on the Netlify site connected to this repo; the drag-and-drop preview and other previews fall back to emailed orders. To turn card payments off, set `cardPayments: false` in `src/content/holiday.mjs`.

## Changing things

Copy and content live in `src/`. Change it there, then rebuild:

```bash
node build.mjs          # rebuilds every page into site/
node tools/check.mjs    # allergens match ingredients, no broken links, no missing alt text, no exclamation points
```

You need [Node.js](https://nodejs.org) 18 or newer, and nothing else. There's nothing to install.

| To change | Edit |
|---|---|
| Phone, email, Instagram, service area, price guide, Google reviews, event types, favorite dishes | `src/content/site.mjs` |
| Dishes: names, descriptions, ingredients, allergens | `src/content/dishes.mjs` |
| Which dishes appear on which event menu | `src/content/menus.mjs` |
| Office catering page: breakfast, lunch and meeting menus | `src/content/office.mjs` |
| Holiday packages, prices, dates, delivery, card payments on or off, sold out | `src/content/holiday.mjs` |
| Photo descriptions and the shot list | `src/content/photos.mjs` |
| Page copy | `src/pages/*.mjs` |
| Header and footer, SEO tags, structured data | `src/layout.mjs` |
| Look and feel | `site/css/site.css` |
| Menu, tabs, lightbox, forms, holiday order total | `site/js/site.js` |
| Holiday card checkout (server side) | `netlify/functions/checkout.mjs` |

Don't edit the `.html` files in `site/` directly. They're rebuilt from `src/` and your edit would be overwritten.

## How it's built

- **Mobile first.** The phone layout is the design. Sticky header with the logo, a call button and Request a Quote. Phone numbers and emails are tap-to-call and tap-to-email everywhere.
- **Brand (2026 redesign).** Two lines and only two: "Sunday best, every day" (the home page headline, the footer and the link preview) and "The classics, impeccably dressed" (the menu section on the home page and the About page). Both live in `src/content/site.mjs` (`tagline` and `motto`). Every other heading is plain. Southern cooking with fine-dining polish (never "heritage"), in an editorial rhythm: warm cream "paper" sections alternate with deep cast-iron bands. Dark parts use a brass accent (#D6A062) on charcoal (#13100F); light parts use ember (#A4521F) on cream (#F5EFE5). Every color is a token at the top of `site/css/site.css`; a section switches by sitting in `<main>` (light) or using `.section-dark` / `.dark`. Fraunces (a soft modern serif) for headings, dish names and prices, Plus Jakarta Sans for text, both hosted with the site (SIL Open Font License). Buttons are sentence-case pills. The site shows a one-color gold version of the logo; the full-color logo stays on the icons, the link preview and everything off the site.
- **Fast.** No framework. About 5 KB of JavaScript and 10 KB of CSS once compressed, plus about 65 KB of fonts. Photos are resized for their spot and stripped of camera data, photos below the first screen load as you scroll, and the hero photo is preloaded.
- **Local SEO.** Every page has its own title and description aimed at searches like "soul food catering DC" and "Thanksgiving catering Northern Virginia". There's structured data for the business (FoodEstablishment with service area), the menus (Menu) and the holiday packages (offers with prices), plus link-preview tags, `sitemap.xml` and `robots.txt`.
- **Accessible.** Semantic HTML, a skip link, labeled form fields with inline errors, keyboard-friendly menu tabs and lightbox, and reduced-motion support.
- **Works without JavaScript.** The form still sends (to `thanks.html`), menus show as one long page, and gallery photos open full size.
- Icons are adapted from [Lucide](https://lucide.dev) (ISC license).

`tools/placeholders.mjs` draws placeholder photos for new photo slots, and `tools/brand-images.mjs` makes the link preview and icons from the logo and the chef photo. Both need Playwright, and neither is needed for normal edits.
