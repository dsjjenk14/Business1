import { page, businessId } from '../layout.mjs';
import { site } from '../content/site.mjs';
import { holiday } from '../content/holiday.mjs';
import { dish } from '../content/dishes.mjs';
import { icon } from '../icons.mjs';
import { esc, curly, img, eyebrow, parseDate, money } from '../lib.mjs';

// "10 to 12" -> numbers wrapped so they render in gold
function nums(text) {
  return esc(text).replace(/\d+/g, (n) => `<span class="num">${n}</span>`);
}

function shortDate(iso) {
  const d = parseDate(iso);
  return `${d.weekday}, ${d.mon} ${d.day}`;
}

function windows(list) {
  return list.map((w) => `${shortDate(w.date)}, ${esc(w.hours)}`).join('<br>');
}

function dateCards() {
  return holiday.holidays
    .map((h) => {
      const day = parseDate(h.date);
      const by = parseDate(h.orderBy);
      return `<li class="date-card">
      <h3 class="date-name">${esc(curly(h.name))}</h3>
      <p class="date-day">${day.weekday}, ${day.month} ${day.day}</p>
      <p class="date-deadline"><span class="label">Order by</span> <span class="big-date">${by.mon} ${by.day}</span> <span class="date-weekday">${by.weekday}</span></p>
      <dl class="date-windows">
        <div><dt>${icon('bag', 'icon icon-sm')} Pickup</dt><dd>${windows(h.pickup)}</dd></div>
        <div><dt>${icon('truck', 'icon icon-sm')} Delivery</dt><dd>${windows(h.delivery)}</dd></div>
      </dl>
    </li>`;
    })
    .join('');
}

function packages() {
  return holiday.packages
    .map(
      (p) => `<li class="package">
      <div class="package-top">
        <p class="package-for">${esc(curly(p.for))}</p>
        <h3 class="package-name">${esc(curly(p.name))}</h3>
        <p class="package-note">${esc(curly(p.note))}</p>
      </div>
      <p class="package-price"><span class="price">${money(p.price)}</span> <span class="serves">Serves ${nums(p.serves)}</span></p>
      <ul class="package-list" role="list">${p.includes.map((i) => `<li>${esc(curly(i))}</li>`).join('')}</ul>
      <a class="btn btn-block" href="contact.html?event=holiday&amp;package=${p.id}">Order this package<span class="visually-hidden">: ${esc(curly(p.name))}</span></a>
    </li>`,
    )
    .join('');
}

function choices() {
  const sides = holiday.choices.sides.map((id) => `<li>${esc(curly(dish(id).name))}</li>`).join('');
  const desserts = holiday.choices.desserts
    .map((c) => `<li>${esc(curly(dish(c.dish).name))} <span class="muted">(${esc(c.size)})</span></li>`)
    .join('');
  const sizes = holiday.panSizes.map((s) => `<li><span>${esc(s.name)}</span> <span>serves ${nums(s.serves)}</span></li>`).join('');
  return `<div class="choice-grid">
    <div class="choice">
      <h3 class="h3">Sides to choose from</h3>
      <ul class="check-list" role="list">${sides}</ul>
    </div>
    <div class="choice">
      <h3 class="h3">Desserts to choose from</h3>
      <ul class="check-list" role="list">${desserts}</ul>
    </div>
    <div class="choice">
      <h3 class="h3">Pan sizes</h3>
      <ul class="size-list" role="list">${sizes}</ul>
      <p class="muted small">Full ingredients and allergens for every dish are on the <a href="menus.html#holidays">holiday menu</a>.</p>
    </div>
  </div>`;
}

function alaCarte() {
  return holiday.alaCarte
    .map((group) => {
      const cols = group.columns;
      const head = cols
        ? `<thead><tr><th scope="col"><span class="visually-hidden">Dish</span></th>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>`
        : '';
      const rows = group.rows
        .map((r) => {
          const name = esc(curly(dish(r.dish).name));
          if (cols) {
            return `<tr><th scope="row">${name}</th>${r.prices.map((p) => `<td class="price">${money(p)}</td>`).join('')}</tr>`;
          }
          return `<tr><th scope="row">${name} <span class="size">${nums(r.size)}</span></th><td class="price">${money(r.price)}</td></tr>`;
        })
        .join('');
      return `<div class="price-group">
      <h3 class="h3">${esc(group.title)}</h3>
      <table class="price-table${cols ? ' has-cols' : ''}">${head}<tbody>${rows}</tbody></table>
    </div>`;
    })
    .join('');
}

function steps() {
  const list = [
    ['Pick a package', 'Or build your own from the list above. Note your sides and desserts.'],
    [
      'Send us your order',
      `Use the order form or call <a href="${site.phone.href}">${site.phone.display}</a>. Tell us pickup or delivery, and which day.`,
    ],
    ['We confirm it', 'We reply within one business day with your total and an invoice. Your order is held once the invoice is paid.'],
    ['Pick up or get delivery', 'Everything comes fully cooked and chilled, with reheating instructions on every lid.'],
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
    name: `Holiday catering ${holiday.year}`,
    url: `${site.url}/holiday.html`,
    itemListElement: holiday.packages.map((p) => ({
      '@type': 'Offer',
      name: p.name,
      description: `${p.note} Serves ${p.serves}. ${p.includes.join('. ')}.`,
      price: String(p.price),
      priceCurrency: 'USD',
      availability: 'https://schema.org/LimitedAvailability',
      areaServed: 'Northern Virginia, Washington DC and Maryland',
      offeredBy: { '@id': businessId },
    })),
  };
}

export default function holidayPage() {
  const opens = parseDate(holiday.season.opens);
  const y = holiday.year;
  const { fee, radius } = holiday.delivery;

  const content = `<section class="page-hero" aria-labelledby="page-title">
  <div class="page-hero-media">${img('page-holiday', { eager: true })}</div>
  <div class="container page-hero-content">
    ${eyebrow(`Holiday ordering ${y}`)}
    <h1 id="page-title" class="h1">Thanksgiving and holiday catering</h1>
    <p class="lede">Turkey, ham, cornbread dressing, greens, mac and cheese and pies, cooked in Fairfax. Pick it up from our kitchen or have it delivered in Northern Virginia, DC and Maryland.</p>
    <p class="status" data-holiday-status
       data-before="Orders open ${opens.weekday}, ${opens.month} ${opens.day}."
       data-during="Ordering is open."
       data-after="Holiday ordering is closed for ${y}.">
      <span class="status-dot" aria-hidden="true"></span><span class="status-text">Thanksgiving, Christmas and New Year's ${y}</span>
    </p>
  </div>
</section>

<section class="section" aria-labelledby="dates-title">
  <div class="container">
    <div class="section-head">
      ${eyebrow('Dates')}
      <h2 id="dates-title" class="h2">Order deadlines and pickup</h2>
      <p class="lede">We cook a set number of orders for each holiday. When the kitchen is full, the list closes, even if the deadline hasn't passed. Earlier is better.</p>
    </div>
    <ul class="date-grid" role="list">${dateCards()}</ul>
  </div>
</section>

<section class="section section-dark" aria-labelledby="packages-title" id="packages">
  <div class="container">
    <div class="section-head">
      ${eyebrow('Packages')}
      <h2 id="packages-title" class="h2">Holiday packages</h2>
      <p class="lede">Each package comes with everything listed, cooked and packed in oven-safe pans.</p>
    </div>
    <ul class="package-grid" role="list">${packages()}</ul>
  </div>
</section>

<section class="section" aria-labelledby="choices-title">
  <div class="container">
    <div class="section-head">
      ${eyebrow('Make it yours')}
      <h2 id="choices-title" class="h2">Pick your sides and desserts</h2>
    </div>
    ${choices()}
  </div>
</section>

<section class="section section-dark" aria-labelledby="alacarte-title">
  <div class="container">
    <div class="section-head">
      ${eyebrow('\u00C0 la carte')}
      <h2 id="alacarte-title" class="h2">Or build your own</h2>
      <p class="lede">Add to a package or order item by item.</p>
    </div>
    <div class="price-grid">${alaCarte()}</div>
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
        ${icon('bag', 'icon logistic-icon')}
        <h3 class="h3">Pickup</h3>
        <p>From our kitchen in Fairfax, during the pickup window for your holiday. We send the address and your time with your confirmation. Pans travel best flat, so bring a box or clear the back seat.</p>
      </div>
      <div class="logistic">
        ${icon('truck', 'icon logistic-icon')}
        <h3 class="h3">Delivery</h3>
        <p><span class="price">${money(fee)}</span> ${esc(radius)}. Further into DC or Maryland, we quote it when you order. Someone needs to be there to take it in.</p>
      </div>
      <div class="logistic">
        ${icon('clock', 'icon logistic-icon')}
        <h3 class="h3">Reheating</h3>
        <p>Most of the meal reheats covered at 325°F in 30 to 45 minutes. A whole turkey takes about 90. Instructions are taped to every lid.</p>
      </div>
      <p class="muted small">${esc(site.allergenNote)} <a href="menus.html#allergies">Allergy details</a></p>
    </div>
  </div>
</section>

<section class="section cta" aria-labelledby="cta-title">
  <div class="container cta-inner">
    <h2 id="cta-title" class="h1">Get on the list</h2>
    <p class="lede">Send your order and we'll confirm it within one business day.</p>
    <a class="btn btn-lg" href="contact.html?event=holiday">Start a holiday order</a>
    <p class="cta-alt">Or call <a href="${site.phone.href}">${site.phone.display}</a></p>
  </div>
</section>`;

  return page({
    slug: 'holiday',
    title: 'Thanksgiving Catering in Northern Virginia | Holiday Ordering | Aaron J’s Catering',
    description:
      'Thanksgiving catering in Northern Virginia, cooked in Fairfax. Turkey, ham, dressing, sides and pies. Prices, order deadlines, pickup and delivery to DC and MD.',
    preload: ['page-holiday'],
    jsonld: [jsonLd()],
    content,
  });
}
