import { page, businessId } from '../layout.mjs';
import { site } from '../content/site.mjs';
import { holiday } from '../content/holiday.mjs';
import { dish } from '../content/dishes.mjs';
import { icon } from '../icons.mjs';
import { esc, curly, img, eyebrow, parseDate, money } from '../lib.mjs';
import { allergenLine, ingredientsLine } from './menus.mjs';

// "5 to 6" -> numbers wrapped so they render in gold
function nums(text) {
  return esc(text).replace(/\d+/g, (n) => `<span class="num">${n}</span>`);
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

function sentence(list) {
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

const T = holiday.thanksgiving;
const day = parseDate(T.date);
const by = parseDate(T.orderBy);
const handoff = parseDate(T.handoff);
const cancel = parseDate(T.cancelBy);

function packages() {
  return holiday.packages
    .map(
      (p) => `<li class="package${p.popular ? ' is-popular' : ''}">
      ${p.popular ? '<p class="package-for">Most popular</p>' : ''}
      <div class="package-head">
        <h3 class="package-name">${esc(curly(p.name))}</h3>
        <p class="price">${money(p.price)}</p>
      </div>
      <p class="package-note">${esc(p.text)}</p>
      <p class="serves">Feeds ${nums(p.feeds)}</p>
      <a class="btn btn-block${p.popular ? '' : ' btn-ghost'}" href="order.html?package=${p.id}">Order this<span class="visually-hidden">: ${esc(curly(p.name))}</span></a>
    </li>`,
    )
    .join('');
}

// One menu item: name (from the printed menu where it differs), ingredients, allergens.
function item({ dish: id, name, extra, limit }) {
  const d = dish(id);
  const tag = extra ? `<span class="item-extra"><span class="price">+${money(extra)}</span>${limit ? ` &middot; ${esc(limit)}` : ''}</span>` : '';
  return `<li class="menu-dish">
    <h4 class="menu-dish-name">${esc(curly(name ?? d.name))}${tag}</h4>
    ${allergenLine(d)}
    ${ingredientsLine(d)}
  </li>`;
}

function addOns() {
  return holiday.addOns
    .map((a) => {
      const d = a.dish ? dish(a.dish) : null;
      const name = a.name ?? d.name;
      const detail = d
        ? `${allergenLine(d)}${ingredientsLine(d)}`
        : `<p class="menu-dish-desc">${esc(a.text)}</p>`;
      return `<li class="menu-dish addon">
      <h4 class="menu-dish-name"><span>${esc(curly(name))}</span><span class="price">${money(a.price)}</span></h4>
      ${detail}
    </li>`;
    })
    .join('');
}

function delivery() {
  return holiday.delivery
    .map((d) => `<tr><th scope="row">${esc(d.area)}</th><td class="price">${money(d.price)}</td></tr>`)
    .join('');
}

function steps() {
  const list = [
    ['Pick your package', `Choose your meats, sides and dessert from the menu. ${sentence(holiday.requestByDeadline)} must be requested by ${by.weekday}, ${by.month} ${by.day}.`],
    ['Order online', `<a href="order.html">Order on this site</a> or call <a href="${site.phone.href}">${site.phone.display}</a>. Orders close ${by.weekday}, ${by.month} ${by.day}, or sooner if we sell out.`],
    ['Pay to confirm', `Payment in full is due when you order. Your order isn't confirmed until it's paid. Cancel by ${cancel.month} ${cancel.day} for a full refund. After that the food is already bought and prepped, so orders are final.`],
    ['Pickup or delivery', `Everything goes out ${handoff.weekday}, ${handoff.month} ${handoff.day}, the day before Thanksgiving. You get a 30-minute window when you order.`],
  ];
  return list
    .map(
      ([title, text], i) => `<li class="step">
      <span class="step-num">${String(i + 1).padStart(2, '0')}</span>
      <div><h3 class="step-title">${esc(title)}</h3><p>${curly(text)}</p></div>
    </li>`,
    )
    .join('');
}

function jsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'OfferCatalog',
    name: `Thanksgiving ${holiday.year} catering`,
    url: `${site.url}/holiday.html`,
    itemListElement: holiday.packages.map((p) => ({
      '@type': 'Offer',
      name: p.name,
      description: `${p.text} Feeds ${p.feeds}. ${holiday.includedNote}`,
      price: String(p.price),
      priceCurrency: 'USD',
      availability: 'https://schema.org/LimitedAvailability',
      availabilityEnds: T.orderBy,
      areaServed: 'Northern Virginia, Washington DC and Maryland',
      offeredBy: { '@id': businessId },
    })),
  };
}

export default function holidayPage() {
  const opens = parseDate(holiday.season.opens);
  const y = holiday.year;

  const content = `<section class="page-hero" aria-labelledby="page-title">
  <div class="page-hero-media">${img('page-holiday', { eager: true })}</div>
  <div class="container page-hero-content">
    ${eyebrow(`Thanksgiving ${y}`)}
    <h1 id="page-title" class="h1">Thanksgiving catering</h1>
    <p class="lede">${day.weekday}, ${day.month} ${day.day}. Smoked, fried or jerk turkey, glazed ham, short ribs and ${WORDS[holiday.sides.length] ?? holiday.sides.length} sides. Pickup or delivery across the DMV on ${handoff.weekday}, ${handoff.month} ${handoff.day}.</p>
    <p class="status" data-holiday-status hidden
       data-before="Orders open ${opens.month} ${opens.day}."
       data-during="Orders close ${by.weekday}, ${by.month} ${by.day}, or sooner if we sell out."
       data-after="Thanksgiving orders are closed for ${y}.">
      <span class="status-dot" aria-hidden="true"></span><span class="status-text">Orders close ${by.weekday}, ${by.month} ${by.day}</span>
    </p>
    <a class="btn btn-lg hero-order" href="order.html">Order now</a>
  </div>
</section>

<section class="section section-tight" aria-label="Key dates">
  <div class="container">
    <ul class="fact-row" role="list">
      <li><span class="fact-label">Orders close</span><span class="big-date">${by.mon} ${by.day}</span><span class="fact-sub">${by.weekday}, or sooner if we sell out</span></li>
      <li><span class="fact-label">Pickup and delivery</span><span class="big-date">${handoff.mon} ${handoff.day}</span><span class="fact-sub">${handoff.weekday}, in a 30-minute window</span></li>
      <li><span class="fact-label">Thanksgiving</span><span class="big-date">${day.mon} ${day.day}</span><span class="fact-sub">We take a limited number of orders</span></li>
    </ul>
    <nav class="jump-links" aria-label="On this page">
      <a href="#packages">Packages</a><a href="#meats">Meats</a><a href="#sides">Sides</a><a href="#add-ons">Add-ons</a><a href="#order">How to order</a><a href="#allergies">Allergies</a>
    </nav>
  </div>
</section>

<section class="section section-dark" aria-labelledby="packages-title" id="packages">
  <div class="container">
    <div class="section-head">
      ${eyebrow('Five ways to order')}
      <h2 id="packages-title" class="h2">Packages</h2>
      <p class="lede">${esc(holiday.includedNote)} Serving sizes are listed with each package.</p>
    </div>
    <ul class="package-grid package-grid-5" role="list">${packages()}</ul>
  </div>
</section>

<section class="section" aria-labelledby="meats-title" id="meats">
  <div class="container holiday-menu">
    <div class="menu-head">
      ${eyebrow('Pick 2')}
      <h2 id="meats-title" class="h2">Meats</h2>
      <p class="lede">${esc(holiday.meats.note)}</p>
    </div>
    <ul class="dish-list" role="list">${holiday.meats.items.map(item).join('')}</ul>
  </div>
</section>

<section class="section section-dark" aria-labelledby="sides-title" id="sides">
  <div class="container holiday-menu">
    <div class="menu-head">
      ${eyebrow('Pick 3')}
      <h2 id="sides-title" class="h2">Sides</h2>
    </div>
    <ul class="dish-list" role="list">${holiday.sides.map(item).join('')}</ul>
  </div>
</section>

<section class="section" aria-labelledby="included-title">
  <div class="container holiday-menu">
    <div class="menu-head">
      ${eyebrow('Every package')}
      <h2 id="included-title" class="h2">Included</h2>
    </div>
    <ul class="dish-list" role="list">${holiday.included.map((id) => item({ dish: id })).join('')}</ul>
  </div>
</section>

<section class="section section-dark" aria-labelledby="addons-title" id="add-ons">
  <div class="container holiday-menu">
    <div class="menu-head">
      ${eyebrow('Desserts and extras')}
      <h2 id="addons-title" class="h2">Add-ons</h2>
      <p class="lede">The Full Spread comes with one dessert. Add more, or add to any package.</p>
    </div>
    <ul class="dish-list" role="list">${addOns()}</ul>
  </div>
</section>

<section class="section" aria-labelledby="order-title" id="order">
  <div class="container two-col">
    <div>
      ${eyebrow('How to order')}
      <h2 id="order-title" class="h2">Four steps</h2>
      <ol class="steps" role="list">${steps()}</ol>
    </div>
    <div class="logistics">
      <div class="logistic">
        ${icon('truck', 'icon logistic-icon')}
        <h3 class="h3">Delivery</h3>
        <table class="price-table"><tbody>${delivery()}</tbody></table>
      </div>
      <div class="logistic">
        ${icon('bag', 'icon logistic-icon')}
        <h3 class="h3">Pickup</h3>
        <p>In Fairfax, Virginia. The address is sent to you once your order is placed.</p>
      </div>
      <div class="logistic">
        ${icon('clock', 'icon logistic-icon')}
        <h3 class="h3">Reheating</h3>
        <p>Food comes cold with reheating instructions, so your oven does the last step and everything hits the table hot.</p>
      </div>
    </div>
  </div>
</section>

<section class="section section-tight" aria-labelledby="allergy-title" id="allergies">
  <div class="container">
    <div class="notice" role="note">
      ${icon('alert', 'icon notice-icon')}
      <div>
        <h2 class="notice-title" id="allergy-title">Food allergies</h2>
        <p><strong>Tell us before you order.</strong> If anyone at your table has a food allergy, let us know when you place the order so we can talk it through with you honestly before you pay.</p>
        <p>Seafood salad and crab-stuffed shrimp are prepared separately from the rest of the menu.</p>
        <p>This is a working kitchen that handles <strong>shellfish, dairy, eggs, wheat and nuts</strong>. We take real care, but we cannot guarantee any dish is free of an allergen and we do not make that promise. If an allergy is severe, please make your own call.</p>
      </div>
    </div>
  </div>
</section>

<section class="section section-dark section-tight" aria-labelledby="next-title">
  <div class="container next-holidays">
    <div>
      ${eyebrow('After Thanksgiving')}
      <h2 id="next-title" class="h2">${esc(curly(sentence(holiday.next)))}</h2>
      <p class="lede">Those menus are coming. If you're planning a holiday party or want to be first on the list, tell us now.</p>
    </div>
    <a class="btn btn-ghost" href="contact.html?event=holiday">Get in touch</a>
  </div>
</section>

<section class="section cta" aria-labelledby="cta-title">
  <div class="container cta-inner">
    <h2 id="cta-title" class="h1">Order Thanksgiving</h2>
    <p class="lede">We take a limited number of Thanksgiving orders. Pickup or delivery on ${handoff.weekday}, ${handoff.month} ${handoff.day}.</p>
    <a class="btn btn-lg" href="order.html">Order now</a>
    <p class="cta-alt">Or call <a href="${site.phone.href}">${site.phone.display}</a></p>
  </div>
</section>`;

  return page({
    slug: 'holiday',
    title: 'Thanksgiving Catering in Northern Virginia | Holiday Ordering | Aaron J’s Catering',
    description:
      'Thanksgiving catering in Northern Virginia, DC and Maryland. Smoked, fried or jerk turkey, glazed ham, short ribs and sides, from $80. Pickup or delivery.',
    preload: ['page-holiday'],
    jsonld: [jsonLd()],
    content,
  });
}
