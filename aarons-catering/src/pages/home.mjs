import { page, logo } from '../layout.mjs';
import { site, events, signatureDishes, testimonials } from '../content/site.mjs';
import { holiday } from '../content/holiday.mjs';
import { instagramTiles } from '../content/photos.mjs';
import { dish } from '../content/dishes.mjs';
import { icon } from '../icons.mjs';
import { esc, curly, img, eyebrow, parseDate, money } from '../lib.mjs';

function hero() {
  return `<section class="hero" aria-labelledby="hero-title">
  <div class="hero-media">${img('hero', { eager: true })}</div>
  <div class="container hero-content">
    ${logo('logo logo-hero', true)}
    <p class="hero-kicker">Soul food catering &middot; Fairfax, Virginia</p>
    <h1 id="hero-title" class="hero-title">${esc(site.tagline)}</h1>
    <p class="hero-lede">Chicken and waffles, braised short ribs, Cajun crab and shrimp and baked mac and cheese, cooked in Fairfax and brought to weddings, offices and family tables across DC, Maryland and Northern Virginia.</p>
    <a class="btn btn-lg" href="contact.html">Request a Quote</a>
  </div>
</section>`;
}

function holidayBlock() {
  const thanksgiving = holiday.holidays[0];
  const d = parseDate(thanksgiving.orderBy);
  const from = Math.min(...holiday.packages.map((p) => p.price));
  return `<section class="section section-tight holiday-promo" data-holiday-only hidden aria-labelledby="holiday-promo-title">
  <div class="container holiday-promo-inner">
    <div>
      ${eyebrow('Holiday ordering is open')}
      <h2 id="holiday-promo-title" class="h2">Turkey, ham, dressing and every side</h2>
      <p class="muted">Order the whole meal or just the parts you'd rather not make. Thanksgiving orders close ${d.weekday}, ${d.month} ${d.day}, or sooner if the kitchen fills up.</p>
    </div>
    <div class="holiday-promo-cta">
      <p class="from"><span class="from-label">Packages from</span> <span class="price">${money(from)}</span></p>
      <a class="btn" href="holiday.html">See holiday packages</a>
    </div>
  </div>
</section>`;
}

function eventTypes() {
  const cards = events
    .map(
      (e) => `<li>
      <a class="event-card" href="${e.href}">
        ${icon(e.icon, 'icon event-icon')}
        <span class="event-body">
          <span class="event-title">${esc(e.title)}</span>
          <span class="event-text">${esc(curly(e.text))}</span>
        </span>
        ${icon('arrow', 'icon event-arrow')}
      </a>
    </li>`,
    )
    .join('');
  return `<section class="section" aria-labelledby="events-title">
  <div class="container">
    <div class="section-head">
      ${eyebrow('What we cater')}
      <h2 id="events-title" class="h2">Ten guests or three hundred</h2>
      <p class="lede">Tell us what the day is and we'll build the menu around it.</p>
    </div>
    <ul class="event-grid" role="list">${cards}</ul>
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
  return `<section class="section section-dark" aria-labelledby="dishes-title">
  <div class="container">
    <div class="section-head section-head-row">
      <div>
        ${eyebrow('From the kitchen')}
        <h2 id="dishes-title" class="h2">What people ask for</h2>
      </div>
      <a class="text-link" href="menus.html">All menus ${icon('arrow', 'icon icon-sm')}</a>
    </div>
  </div>
  <div class="dish-scroller" tabindex="0" aria-label="Signature dishes, scroll sideways for more">
    <ul class="dish-row" role="list">${cards}</ul>
  </div>
</section>`;
}

function chef() {
  return `<section class="section" aria-labelledby="chef-title">
  <div class="container chef">
    <div class="chef-photo">${img('chef-aaron')}</div>
    <div class="chef-body">
      ${eyebrow('The chef')}
      <h2 id="chef-title" class="h2">Chef Aaron Jenkins</h2>
      <blockquote class="chef-quote">
        <p>Soul food takes time. Greens need three hours. Short ribs need four. Chicken needs a night in the brine. I don't cut those corners, and I taste every pan before it leaves the kitchen.</p>
      </blockquote>
      <p class="muted">Everything we serve is cooked from scratch in our kitchen in Fairfax, the day before or the morning of your event.</p>
      <a class="text-link" href="about.html">Read the story ${icon('arrow', 'icon icon-sm')}</a>
    </div>
  </div>
</section>`;
}

function quotes() {
  const items = testimonials
    .map(
      (t) => `<li>
      <figure class="quote">
        <blockquote><p>${esc(curly(t.quote))}</p></blockquote>
        <figcaption><span class="quote-name">${esc(t.name)}</span><span class="quote-detail">${esc(t.detail)}</span></figcaption>
        ${t.sample ? '<p class="sample-tag">Sample quote. Replace with a real client before launch.</p>' : ''}
      </figure>
    </li>`,
    )
    .join('');
  return `<section class="section section-dark" aria-labelledby="quotes-title">
  <div class="container">
    <div class="section-head">
      ${eyebrow('Kind words')}
      <h2 id="quotes-title" class="h2">From the people we cooked for</h2>
    </div>
    <ul class="quote-grid" role="list">${items}</ul>
  </div>
</section>`;
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
        <p class="lede">What came out of the kitchen this week.</p>
      </div>
      <a class="btn btn-ghost" href="${ig.url}" rel="noopener">${icon('instagram')} Follow</a>
    </div>
    <div class="ig-feed">${feed}</div>
  </div>
</section>`;
}

function closing() {
  return `<section class="section cta" aria-labelledby="cta-title">
  <div class="container cta-inner">
    <h2 id="cta-title" class="h1">Tell us about your event</h2>
    <p class="lede">Send the date, the headcount and roughly where. We'll come back with a menu and a price within one business day.</p>
    <a class="btn btn-lg" href="contact.html">Request a Quote</a>
    <p class="cta-alt">Or call <a href="${site.phone.href}">${site.phone.display}</a></p>
  </div>
</section>`;
}

export default function home() {
  return page({
    slug: 'index',
    title: 'Aaron J’s Catering | Soul Food Catering in Fairfax, VA, DC and Maryland',
    description:
      'Soul food catering in Fairfax, VA from Chef Aaron Jenkins. Weddings, corporate events, birthdays and holidays across DC, Maryland and Northern Virginia.',
    bodyClass: 'has-hero',
    preload: ['hero'],
    content: [hero(), holidayBlock(), eventTypes(), dishes(), chef(), quotes(), instagram(), closing()].join('\n'),
  });
}
