import { page } from '../layout.mjs';
import { site, signatureDishes, newDishes, occasions } from '../content/site.mjs';
import { holiday } from '../content/holiday.mjs';
import { officePackages, officeTerms } from '../content/office.mjs';
import { instagramTiles } from '../content/photos.mjs';
import { dish } from '../content/dishes.mjs';
import { icon } from '../icons.mjs';
import { esc, curly, img, eyebrow, holidayDates, parseDate, money } from '../lib.mjs';
import { quoteForm, reviewsLine } from './contact.mjs';

function hero() {
  return `<section class="hero" aria-labelledby="hero-title">
  <div class="hero-media">${img('hero', { eager: true })}</div>
  <div class="container hero-content">
    <p class="hero-kicker">Aaron J's Catering</p>
    <h1 id="hero-title" class="hero-title">Sunday best, <em>every day.</em></h1>
    <p class="hero-lede">Southern cooking from Chef Aaron Jenkins, finished with fine-dining polish: oxtail braised in red wine, chicken lacquered in hot honey, smoked gouda mac under a brown butter crumb. For weddings, offices, holidays and private events across DC, Maryland and Northern Virginia.</p>
    <div class="hero-actions">
      <a class="btn btn-lg" href="#quote">Get a quote</a>
      <a class="btn btn-lg btn-ghost" href="menus.html">See the menus</a>
    </div>
    <ul class="hero-proof" role="list">
      <li>${icon('check', 'icon icon-sm')} A menu and a price within one business day</li>
      <li>${icon('check', 'icon icon-sm')} Allergens listed on every dish</li>
    </ul>
  </div>
</section>
${occasionCards()}`;
}

// What we cater, each with a photo and a starting price.
function occasionCards() {
  const priceOf = (o) =>
    o.price === 'office'
      ? `From ${money(Math.min(...officePackages.map((p) => p.price)))} per person`
      : o.price === 'holiday'
        ? `Packages from ${money(Math.min(...holiday.packages.map((p) => p.price)))}`
        : o.price;
  return `<section class="occasions dark" aria-labelledby="occasions-title">
  <div class="container">
    <h2 id="occasions-title" class="visually-hidden">What we cater</h2>
    <ul class="occasion-grid" role="list">${occasions
      .map(
        (o) => `<li><a class="occasion" href="${o.href}">
        <span class="occasion-photo">${img(o.photo)}</span>
        <span class="occasion-body">
          <span class="occasion-title">${esc(o.title)} ${icon('arrow', 'icon icon-sm')}</span>
          ${priceOf(o) ? `<span class="occasion-price">${esc(priceOf(o))}</span>` : ''}
          <span class="occasion-text">${esc(curly(o.text))}</span>
        </span>
      </a></li>`,
      )
      .join('')}</ul>
    <p class="occasion-more">Also cooking weekly meal prep, built around your goals. <a class="text-link" href="menus.html#meal-prep">See meal prep ${icon('arrow', 'icon icon-sm')}</a></p>
  </div>
</section>`;
}

function quote() {
  return `<section class="section home-quote" id="quote" aria-labelledby="quote-title">
  <div class="container home-quote-grid">
    <div class="home-quote-intro">
      ${eyebrow('Request a quote')}
      <h2 id="quote-title" class="h2">Tell us about your event</h2>
      <p class="lede">Two short steps, about a minute.</p>
      <ol class="how-steps" role="list">
        <li><span class="step-num">1</span><div><h3 class="how-title">Tell us the day</h3><p>The occasion, the date and roughly how many guests.</p></div></li>
        <li><span class="step-num">2</span><div><h3 class="how-title">Get a menu and a price</h3><p>Within one business day, a proposed menu and a written quote, per person.</p></div></li>
        <li><span class="step-num">3</span><div><h3 class="how-title">We cook, deliver and set up</h3><p>Dropped off and set out, or served by our staff, the way your event calls for.</p></div></li>
      </ol>
      ${reviewsLine()}
      <div class="quick-contact">
        <a class="btn btn-ghost" href="${site.phone.href}">${icon('phone')} Call us</a>
        <a class="btn btn-ghost" href="mailto:${site.email}">${icon('mail')} Email us</a>
      </div>
    </div>
    ${quoteForm({ compact: true })}
  </div>
</section>`;
}

function holidayBlock() {
  const from = Math.min(...holiday.packages.map((p) => p.price));
  return `<section class="section section-tight holiday-promo" data-holiday-only hidden aria-labelledby="holiday-promo-title">
  <div class="container holiday-promo-inner">
    <div>
      ${eyebrow(`${holiday.events.map((e) => e.name).join(' and ')} ${holiday.year}`)}
      <h2 id="holiday-promo-title" class="h2">Turkey, ham and every side</h2>
      ${holiday.events
        .map((e) => {
          const d = holidayDates(e);
          return `<p class="muted" data-open-until="${e.orderBy}"><strong>${e.name}:</strong> ${e.handoffName}, ${d.handoffDates}. Order by ${d.orderByText}.</p>`;
        })
        .join('')}
    </div>
    <div class="holiday-promo-cta">
      <p class="from"><span class="from-label">Packages from</span> <span class="price">${money(from)}</span></p>
      <a class="btn" href="order.html">Order now</a>
      <a class="text-link" href="holiday.html">See the menu ${icon('arrow', 'icon icon-sm')}</a>
    </div>
  </div>
</section>`;
}

function menuSection() {
  const photos = signatureDishes
    .map((s) => {
      const d = dish(s.dish);
      return `<li class="dish-card">
        <div class="dish-photo">${img(s.photo)}</div>
        <h3 class="dish-name">${esc(curly(d.name))}</h3>
        <p class="dish-text">${esc(s.text)}</p>
      </li>`;
    })
    .join('');
  const list = newDishes
    .map((id) => {
      const d = dish(id);
      return `<li><h3 class="new-dish-name">${esc(curly(d.name))}${d.spicy ? ' <span class="spicy">Spicy</span>' : ''}</h3><p>${esc(curly(d.description))}</p></li>`;
    })
    .join('');
  return `<section class="section" aria-labelledby="menu-title">
  <div class="container">
    <div class="section-head section-head-row">
      <div>
        ${eyebrow('The menu')}
        <h2 id="menu-title" class="h2">${esc(site.motto.split(', ')[0])}, <em>${esc(site.motto.split(', ')[1])}</em></h2>
      </div>
      <a class="text-link" href="menus.html">Every menu ${icon('arrow', 'icon icon-sm')}</a>
    </div>
    <ul class="dish-row" role="list">${photos}</ul>
    <div class="new-dishes">
      <div class="new-dishes-head">
        <h3 class="course-title">Signatures</h3>
        <p class="muted">Braised, lacquered and finished at the pass. Every dish lists its ingredients and allergens on the <a href="menus.html">Menus page</a>.</p>
      </div>
      <ul class="new-dish-list" role="list">${list}</ul>
    </div>
  </div>
</section>`;
}

function approach() {
  const points = [
    ['A clear price', 'Per-person pricing, and a written menu and quote within one business day. Office packages and holiday dinners show their prices up front.'],
    ['Every guest looked after', 'Ingredients and allergens on every dish, with vegetarian and vegan dishes marked on the event, wedding and office menus.'],
    ['Presentation that photographs', 'Mac and cheese in individual cast-iron cocottes, greens in petite crocks, shrimp and grits in tasting spoons, desserts in jars and tartlets.'],
    ['On time and set up', 'We arrive ahead of time and set everything out. Office orders come with plates, napkins and serving utensils.'],
  ];
  return `<section class="section section-dark" aria-labelledby="approach-title">
  <div class="container">
    <div class="section-head">
      ${eyebrow('Why Aaron J’s')}
      <h2 id="approach-title" class="h2">What you can count on</h2>
    </div>
    <ol class="approach approach-4" role="list">${points
      .map(([t, text], i) => `<li><span class="step-num">${String(i + 1).padStart(2, '0')}</span><h3 class="approach-title">${t}</h3><p>${esc(curly(text))}</p></li>`)
      .join('')}</ol>
  </div>
</section>`;
}

// Questions people ask before they book. Dates and minimums come from the
// holiday and office files, so they stay right when those change.
function faqItems() {
  const minOffice = Math.min(...officePackages.map((p) => p.min));
  const chef = officePackages.find((p) => p.id === 'chef-breakfast');
  const notice = officeTerms.find(([t]) => t === 'Order ahead');
  const closes = holiday.events
    .map((e) => {
      const d = parseDate(e.orderBy);
      return `${e.name} orders close ${d.month} ${d.day}`;
    })
    .join(' and ');
  return [
    ['How far ahead should we book?', `For weddings and large events, as soon as you have a date, since weekends go first. ${notice ? notice[1] : ''} ${closes}, or sooner if we sell out.`],
    ['Where do you cater?', 'Washington, DC, Maryland and Northern Virginia. Delivery is priced on your quote, and holiday delivery fees are listed on the Holiday page.'],
    ['Can you work around allergies and diets?', 'Every dish on our menus lists its ingredients and allergens, and vegetarian and vegan dishes are marked. Ours is a working kitchen that handles shellfish, dairy, eggs, wheat and nuts, so we can’t promise any dish is free of an allergen. Tell us about allergies when you order.'],
    ['Is there a minimum?', `Office packages start at ${minOffice} people${chef ? ` (${chef.min} for the chef-attended breakfast)` : ''}. Holiday packages start with Dinner for Two. For events, tell us your headcount and we’ll suggest the right service style.`],
    ['Do you bring staff and set up?', 'Office orders arrive ahead of time and are set out with plates, napkins and serving utensils. For events and weddings, your quote covers the service you choose, from drop-off to a plated dinner with servers.'],
    ['How do we pay?', 'Holiday orders are paid by card when you order online. For events and office catering, payment details come with your quote.'],
  ];
}

function faq() {
  return `<section class="section" aria-labelledby="faq-title" id="faq">
  <div class="container faq-grid">
    <div class="section-head">
      ${eyebrow('Before you book')}
      <h2 id="faq-title" class="h2">Questions, answered</h2>
      <p class="muted">Anything else? Call <a href="${site.phone.href}">${site.phone.display}</a>.</p>
    </div>
    <div class="faq">${faqItems()
      .map(([q, a]) => `<details class="faq-item"><summary>${esc(q)}</summary><p>${esc(curly(a.replace(/\s+/g, ' ').trim()))}</p></details>`)
      .join('')}</div>
  </div>
</section>`;
}

function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems().map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: curly(a.replace(/\s+/g, ' ').trim()) } })),
  };
}

function instagram() {
  const ig = site.instagram;
  const feed = ig.beholdFeedId
    ? `<behold-widget feed-id="${esc(ig.beholdFeedId)}" data-behold></behold-widget>`
    : `<ul class="ig-grid" role="list">${instagramTiles
        .map((t) => `<li><a href="${ig.url}" rel="noopener" aria-label="See this post on Instagram">${img(t)}</a></li>`)
        .join('')}</ul>`;
  return `<section class="section" aria-labelledby="ig-title">
  <div class="container">
    <div class="section-head section-head-row">
      <div>
        ${eyebrow('Instagram')}
        <h2 id="ig-title" class="h2"><a href="${ig.url}" rel="noopener">${esc(ig.handle)}</a></h2>
      </div>
      <a class="btn btn-ghost" href="${ig.url}" rel="noopener">${icon('instagram')} Follow</a>
    </div>
    <div class="ig-feed">${feed}</div>
  </div>
</section>`;
}

export default function home() {
  return page({
    slug: 'index',
    title: 'Aaron J’s Catering | Elevated Soul Food Catering in DC, Maryland and Northern Virginia',
    description:
      'Elevated Southern and soul food catering from Chef Aaron Jenkins: weddings, corporate breakfasts and lunches, holidays and private events across the DMV.',
    bodyClass: 'has-hero',
    preload: ['hero'],
    jsonld: [faqJsonLd()],
    content: [hero(), quote(), holidayBlock(), menuSection(), approach(), faq(), instagram()].join('\n'),
  });
}
