import { page, businessId } from '../layout.mjs';
import { site } from '../content/site.mjs';
import { holiday } from '../content/holiday.mjs';
import { dish } from '../content/dishes.mjs';
import { icon } from '../icons.mjs';
import { esc, curly, img, eyebrow, parseDate, holidayDates, money } from '../lib.mjs';
import { allergenLine, ingredientsLine } from './menus.mjs';

// "5 to 6" -> numbers wrapped so they render in gold
function nums(text) {
  return esc(text).replace(/\d+/g, (n) => `<span class="num">${n}</span>`);
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

function sentence(list) {
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

const events = holiday.events.map((e) => ({ ...e, ...holidayDates(e) }));
const names = sentence(events.map((e) => e.name));
const last = events[events.length - 1];
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);

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
    ['Pick your package', `Choose your holiday, then your meats, sides and dessert. ${sentence(holiday.requestByDeadline)} must be requested by the order deadline.`],
    ['Order online', `<a href="order.html">Order on this site</a> or call <a href="${site.phone.href}">${site.phone.display}</a>. ${sentence(events.map((e) => `${e.name} orders close ${e.orderByText}`))}, or sooner if we sell out.`],
    ['Pay to confirm', `Payment in full is due when you order. Your order isn't confirmed until it's paid. Cancel by the order deadline for a full refund. After that the food is already bought and prepped, so orders are final.`],
    ['Pickup or delivery', events.map((e) => `${e.name} goes out ${e.handoffDay}: ${e.times}.`).join(' ')],
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
    name: `${names} ${holiday.year} catering`,
    url: `${site.url}/holiday.html`,
    itemListElement: holiday.packages.map((p) => ({
      '@type': 'Offer',
      name: p.name,
      description: `${p.text} Feeds ${p.feeds}. ${holiday.includedNote}`,
      price: String(p.price),
      priceCurrency: 'USD',
      availability: 'https://schema.org/LimitedAvailability',
      availabilityEnds: last.orderBy,
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
    ${eyebrow(`Holidays ${y}`)}
    <h1 id="page-title" class="h1">${names} catering</h1>
    <p class="lede">Smoked, fried or jerk turkey, glazed ham, short ribs and ${WORDS[holiday.sides.length] ?? holiday.sides.length} sides, ready for your holiday table and delivered across the DMV or picked up. ${events.map((e) => `${e.name} goes out ${e.handoffName}, ${e.handoffOn.month} ${e.handoffOn.day}.`).join(' ')}${events.filter((e) => e.closedOnTheDay).map((e) => ` We’re closed on ${e.name} Day.`).join('')}</p>
    <p class="status" data-holiday-status hidden
       data-before="Orders open ${opens.month} ${opens.day}."
       data-during="${esc(sentence(events.map((e) => `${e.name} orders close ${e.orderByText}`)))}."
       data-after="Holiday orders are closed for ${y}.">
      <span class="status-dot" aria-hidden="true"></span><span class="status-text">Orders close ${events[0].orderByText}</span>
    </p>
    <a class="btn btn-lg hero-order" href="order.html">Order now</a>
  </div>
</section>

<section class="section section-tight" aria-label="Key dates">
  <div class="container">
    <ul class="fact-row fact-row-${events.length}" role="list">${events
      .map(
        (e) => `
      <li><span class="fact-label">${esc(e.name)} pickup and delivery</span><span class="big-date">${e.handoffOn.mon} ${e.handoffOn.day}</span><span class="fact-sub">${esc(curly(`${cap(e.handoffName)}. ${cap(e.times)}.`))} Order by ${e.by.mon} ${e.by.day}.</span></li>`,
      )
      .join('')}
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
      ${eyebrow(`After ${last.name}`)}
      <h2 id="next-title" class="h2">${esc(curly(sentence(holiday.next)))}</h2>
      <p class="lede">${holiday.next.length > 1 ? 'Those menus are' : 'That menu is'} coming. If you're planning a holiday party or want to be first on the list, tell us now.</p>
    </div>
    <a class="btn btn-ghost" href="contact.html?event=holiday">Get in touch</a>
  </div>
</section>

<section class="section cta" aria-labelledby="cta-title">
  <div class="container cta-inner">
    <h2 id="cta-title" class="h1">Order ${esc(events.map((e) => e.name).join(' or '))}</h2>
    <p class="lede">We take a limited number of orders for each holiday. ${events.map((e) => `${e.name}: ${e.times}, ${e.handoffDay}.`).join(' ')}</p>
    <a class="btn btn-lg" href="order.html">Order now</a>
    <p class="cta-alt">Or call <a href="${site.phone.href}">${site.phone.display}</a></p>
  </div>
</section>`;

  return page({
    slug: 'holiday',
    title: `${events.map((e) => e.name).join(' and ')} Catering in Northern Virginia | Aaron J’s Catering`,
    description: `${names} catering in Northern Virginia, DC and Maryland. Smoked, fried or jerk turkey, glazed ham, short ribs and sides, from $80. Pickup or delivery.`,
    preload: ['page-holiday'],
    jsonld: [jsonLd()],
    content,
  });
}
