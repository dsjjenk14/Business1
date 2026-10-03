# Aaron J's Catering website

Soul food catering, Fairfax VA. Six pages: Home, Menus, Holiday Ordering, About, Gallery, and Contact with the quote form.

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

- [ ] **Logo.** Replace `site/images/logo.png` with the real logo (transparent PNG, the version that reads on black, about 600px wide). Replace the four icons too (see `PHOTOS.md`).
- [ ] **Photos.** Every photo is a labeled placeholder. `PHOTOS.md` is the shot list: file name, size, where it shows and what to shoot. Save the real photo over the placeholder with the same file name. No code changes needed.
- [ ] **Chef Aaron reads the menus line by line.** I wrote every dish, ingredient list and allergen line as a starting draft. The ingredient lists must match the actual recipes, and the allergen lines must match the ingredients. People with allergies will rely on them. Edit `src/content/dishes.mjs`, then run the checks (below), which fail if an ingredient and its allergen line disagree.
- [ ] **About page fill-ins.** The highlighted boxes on the About page are facts only Chef Aaron knows (who taught Chef Aaron to cook, where, the year the business started). They're in `src/pages/about.mjs` between `[[double brackets]]`.
- [ ] **Testimonials.** The three on the home page are samples showing length and tone, and each one says "Sample quote" on the page. Replace them with real quotes from real clients (with permission) in `src/content/site.mjs` and delete `sample: true`. Don't launch with the samples.
- [ ] **Holiday prices and dates.** All packages, prices, deadlines, pickup windows and the delivery fee are my proposals. Confirm or change them in `src/content/holiday.mjs`.
- [ ] **Promises in the copy.** Check that these match how the business actually runs, and change any that don't:
  - Reply to quote requests within one business day.
  - A tasting about six weeks before weddings, and a tasting for events over 100 guests.
  - Greens, beans and cabbage cooked with smoked turkey, not pork.
  - Everything from scratch, including rolls, pie crusts and the banana pudding wafers.
  - Holiday orders held once the invoice is paid.
  - Reheating times.
  - Leftovers packed for the client.
- [ ] **Turn on the quote form.** See below. One test submission and one click.
- [ ] **Instagram feed.** See below. About five minutes.
- [ ] **Google Business Profile.** For searches like "catering Fairfax VA", this matters more than anything on the website. Set one up as a service-area business (Fairfax, Northern Virginia, DC, Maryland), link it to the site, and ask happy clients for Google reviews. Then add the site to [Google Search Console](https://search.google.com/search-console) and submit `https://aaronjscatering.com/sitemap.xml`.

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

Holiday ordering turns itself on automatically between the dates in `src/content/holiday.mjs` (currently November 1, 2026 to January 1, 2027). In season:

- A banner across the top of every page names the next deadline, and moves on to the next holiday as each deadline passes.
- A holiday block appears on the home page under the hero.
- "Holiday" in the menu gets an "Order now" tag.

Preview it any time:

| Add to any page address | What it does |
|---|---|
| `?holiday=on` | Holiday mode on |
| `?holiday=off` | Holiday mode off |
| `?today=2026-11-20` | Pretend it's that date |
| `?holiday=auto` | Back to normal |

Once a year, update the dates, prices and the `year` in `src/content/holiday.mjs`. Weekday names are worked out from the dates, so they can't be wrong.

## Changing things

Copy and content live in `src/`. Change it there, then rebuild:

```bash
node build.mjs          # rebuilds every page into site/
node tools/check.mjs    # allergens match ingredients, no broken links, no missing alt text, no exclamation points
```

You need [Node.js](https://nodejs.org) 18 or newer, and nothing else. There's nothing to install.

| To change | Edit |
|---|---|
| Phone, email, Instagram, service area, event types, signature dishes, testimonials | `src/content/site.mjs` |
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
- **Fast.** No framework. About 5 KB of JavaScript and 9 KB of CSS once compressed, plus 45 KB of fonts. Photos below the first screen load as you scroll, the hero photo is preloaded, and phones get a smaller, portrait hero (`hero-mobile.jpg`).
- **Local SEO.** Every page has its own title and description aimed at searches like "catering Fairfax VA", "soul food catering DC" and "Thanksgiving catering Northern Virginia". There's structured data for the business (FoodEstablishment with service area), the menus (Menu) and the holiday packages (offers with prices), plus link-preview tags, `sitemap.xml` and `robots.txt`.
- **Accessible.** Semantic HTML, a skip link, labeled form fields with inline errors, keyboard-friendly menu tabs and lightbox, and reduced-motion support.
- **Works without JavaScript.** The form still sends (to `thanks.html`), menus show as one long page, and gallery photos open full size.
- Icons are adapted from [Lucide](https://lucide.dev) (ISC license).

`tools/placeholders.mjs` redraws the placeholder images if you add a new photo slot. It needs Playwright and isn't needed for normal edits.
