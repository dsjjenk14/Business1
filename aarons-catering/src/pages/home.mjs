import { page } from '../layout.mjs';
import { site, events, signatureDishes } from '../content/site.mjs';
import { holiday } from '../content/holiday.mjs';
import { instagramTiles } from '../content/photos.mjs';
import { dish } from '../content/dishes.mjs';
import { icon } from '../icons.mjs';
import { esc, curly, img, eyebrow, parseDate, money } from '../lib.mjs';
import { quoteForm } from './contact.mjs';

function hero() {
  return `<section class="hero" aria-labelledby="hero-title">
  <div class="hero-media">${img('hero', { eager: true })}</div>
  <div class="container hero-content">
    <p class="hero-kicker">Aaron J's Catering</p>
    <h1 id="hero-title" class="hero-title">${esc(site.tagline)}</h1>
    <p class="hero-lede">Weddings, corporate events, birthdays, church and family events, holidays and meal prep across DC, Maryland and Northern Virginia.</p>
    <a class="btn btn-lg" href="#quote">Request a Quote</a>
  </div>
</section>`;
}

function quote() {
  return `<section class="section home-quote" id="quote" aria-labelledby="quote-title">
  <div class="container home-quote-grid">
    <div class="home-quote-intro">
      ${eyebrow('Request a quote')}
      <h2 id="quote-title" class="h2">Tell us about your event</h2>
      <p class="lede">It takes about a minute. We reply within one business day.</p>
      <div class="quick-contact">
        <a class="btn btn-ghost" href="${site.phone.href}">${icon('phone')} Call us</a>
        <a class="btn btn-ghost" href="mailto:${site.email}">${icon('mail')} Email us</a>
      </div>
    </div>
    ${quoteForm()}
  </div>
</section>`;
}

function holidayBlock() {
  const t = holiday.thanksgiving;
  const d = parseDate(t.orderBy);
  const from = Math.min(...holiday.packages.map((p) => p.price));
  return `<section class="section section-tight holiday-promo" data-holiday-only hidden aria-labelledby="holiday-promo-title">
  <div class="container holiday-promo-inner">
    <div>
      ${eyebrow(`Thanksgiving ${holiday.year}`)}
      <h2 id="holiday-promo-title" class="h2">Turkey, ham and every side</h2>
      <p class="muted">Orders close ${d.weekday}, ${d.month} ${d.day}, or sooner if we sell out.</p>
    </div>
    <div class="holiday-promo-cta">
      <p class="from"><span class="from-label">Packages from</span> <span class="price">${money(from)}</span></p>
      <a class="btn" href="holiday.html">See the Thanksgiving menu</a>
    </div>
  </div>
</section>`;
}

function eventTypes() {
  const pills = events.map((e) => `<li><a href="${e.href}">${esc(e.title)}</a></li>`).join('');
  return `<section class="section section-dark" aria-labelledby="events-title">
  <div class="container">
    <div class="section-head">
      ${eyebrow('What we cater')}
      <h2 id="events-title" class="h2">Every occasion</h2>
      <p class="lede">From intimate dinners to grand celebrations, we cater all events.</p>
    </div>
    <ul class="service-pills" role="list">${pills}</ul>
  </div>
</section>`;
}

function dishes() {
  const cards = signatureDishes
    .map((s) => {
      const d = dish(s.dish);
      return `<li class="dish-card">
        <div class="dish-photo">${img(s.photo)}</div>
        <h3 class="dish-name">${esc(curly(d.name))}</h3>
        <p class="dish-text">${esc(s.text)}</p>
      </li>`;
    })
    .join('');
  return `<section class="section" aria-labelledby="dishes-title">
  <div class="container">
    <div class="section-head section-head-row">
      <div>
        ${eyebrow('On the menu')}
        <h2 id="dishes-title" class="h2">Favorites</h2>
      </div>
      <a class="text-link" href="menus.html">All menus ${icon('arrow', 'icon icon-sm')}</a>
    </div>
  </div>
  <ul class="dish-row" role="list">${cards}</ul>
</section>`;
}

function instagram() {
  const ig = site.instagram;
  const feed = ig.beholdFeedId
    ? `<behold-widget feed-id="${esc(ig.beholdFeedId)}" data-behold></behold-widget>`
    : `<ul class="ig-grid" role="list">${instagramTiles
        .map((t) => `<li><a href="${ig.url}" rel="noopener" aria-label="See this post on Instagram">${img(t)}</a></li>`)
        .join('')}</ul>`;
  return `<section class="section section-dark" aria-labelledby="ig-title">
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
    title: 'Aaron J’s Catering | Soul Food Catering in DC, Maryland and Northern Virginia',
    description:
      'Soul food catering from Chef Aaron Jenkins for weddings, corporate events, birthdays, church and family events and the holidays in DC, Maryland and Northern Virginia.',
    bodyClass: 'has-hero',
    preload: ['hero'],
    content: [hero(), quote(), holidayBlock(), eventTypes(), dishes(), instagram()].join('\n'),
  });
}
