import { page } from '../layout.mjs';
import { site, signatureDishes, newDishes, paths } from '../content/site.mjs';
import { holiday } from '../content/holiday.mjs';
import { instagramTiles } from '../content/photos.mjs';
import { dish } from '../content/dishes.mjs';
import { icon } from '../icons.mjs';
import { esc, curly, img, eyebrow, parseDate, money } from '../lib.mjs';
import { quoteForm, reviewsLine } from './contact.mjs';

function hero() {
  return `<section class="hero" aria-labelledby="hero-title">
  <div class="hero-media">${img('hero', { eager: true })}</div>
  <div class="container hero-content">
    <p class="hero-kicker">Aaron J's Catering</p>
    <h1 id="hero-title" class="hero-title">Sunday best, <em>every day.</em></h1>
    <p class="hero-lede">Heritage Southern cooking from Chef Aaron Jenkins, finished with fine-dining polish: oxtail braised in red wine, chicken lacquered in hot honey, smoked gouda mac under a brown butter crumb. Weddings, corporate dining, holidays and private events across DC, Maryland and Northern Virginia.</p>
    <div class="hero-actions">
      <a class="btn btn-lg" href="#quote">Plan your event</a>
      <a class="btn btn-lg btn-ghost" href="menus.html">See the menu</a>
    </div>
  </div>
</section>

<nav class="paths dark" aria-label="What we cater">
  <ul class="container paths-list" role="list">${paths
    .map((p) => `<li><a class="path" href="${p.href}"><span class="path-title">${esc(p.title)} ${icon('arrow', 'icon icon-sm')}</span><span class="path-text">${esc(curly(p.text))}</span></a></li>`)
    .join('')}</ul>
</nav>`;
}

function quote() {
  return `<section class="section home-quote" id="quote" aria-labelledby="quote-title">
  <div class="container home-quote-grid">
    <div class="home-quote-intro">
      ${eyebrow('Request a quote')}
      <h2 id="quote-title" class="h2">Begin with <em>a date</em></h2>
      <p class="lede">The day, the headcount and the occasion. It takes about a minute, and we reply within one business day with a proposed menu and a price.</p>
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
  const t = holiday.event;
  const d = parseDate(t.orderBy);
  const from = Math.min(...holiday.packages.map((p) => p.price));
  return `<section class="section section-tight holiday-promo" data-holiday-only hidden aria-labelledby="holiday-promo-title">
  <div class="container holiday-promo-inner">
    <div>
      ${eyebrow(`${t.name} ${holiday.year}`)}
      <h2 id="holiday-promo-title" class="h2">Turkey, ham and every side</h2>
      <p class="muted">Delivered by ${t.deliverBy} or picked up by ${t.pickupBy} on ${t.handoffName}. Orders close ${d.weekday}, ${d.month} ${d.day}, or sooner if we sell out.</p>
    </div>
    <div class="holiday-promo-cta">
      <p class="from"><span class="from-label">Packages from</span> <span class="price">${money(from)}</span></p>
      <a class="btn" href="order.html">Order ${t.name}</a>
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
        <h2 id="menu-title" class="h2">The classics, <em>impeccably dressed</em></h2>
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
    ['Heritage', 'Recipes with roots: smoked turkey in the greens, brown butter in the yams, chicken brined in buttermilk before it meets the fryer.'],
    ['Craft', 'Plated with intention, from passed small plates to individual dessert jars, so every dish looks the way it tastes.'],
    ['Hospitality', 'Where every day is Sunday: generous, unhurried and on time, set out the way your occasion calls for.'],
  ];
  return `<section class="section section-dark" aria-labelledby="approach-title">
  <div class="container">
    <div class="section-head">
      ${eyebrow('The Aaron J’s standard')}
      <h2 id="approach-title" class="h2">Heritage, <em>with polish</em></h2>
    </div>
    <ol class="approach" role="list">${points
      .map(([t, text], i) => `<li><span class="step-num">${String(i + 1).padStart(2, '0')}</span><h3 class="approach-title">${t}</h3><p>${esc(curly(text))}</p></li>`)
      .join('')}</ol>
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
    content: [hero(), quote(), holidayBlock(), menuSection(), approach(), instagram()].join('\n'),
  });
}
