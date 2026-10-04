// Thanksgiving ordering: pick a package, the meats, sides and dessert, add-ons,
// and pickup or delivery, with a running total. site.js does the counting and
// sends the order to the chef's inbox (FormSubmit, like the quote form).
import { page } from '../layout.mjs';
import { site } from '../content/site.mjs';
import { holiday } from '../content/holiday.mjs';
import { dish } from '../content/dishes.mjs';
import { icon } from '../icons.mjs';
import { esc, curly, eyebrow, parseDate, money } from '../lib.mjs';

const T = holiday.thanksgiving;
const by = parseDate(T.orderBy);
const handoff = parseDate(T.handoff);
const cancel = parseDate(T.cancelBy);
const handoffText = `${handoff.weekday}, ${handoff.month} ${handoff.day}`;

const meats = holiday.meats.items.map((m) => ({ name: m.name ?? dish(m.dish).name, extra: m.extra ?? 0 }));
const sides = holiday.sides.map((s) => ({ name: s.name ?? dish(s.dish).name, extra: s.extra ?? 0 }));
const desserts = holiday.desserts.map((id) => ({ name: dish(id).name, extra: 0 }));
const areas = holiday.delivery.filter((d) => !d.package);
const dinnerDelivery = holiday.delivery.find((d) => d.package);

// "Braised short ribs +$30"
const plus = (n) => (n ? ` <span class="chip-extra">+${money(n)}</span>` : '');

function chip({ type = 'checkbox', name, value, label = value, data = '', extra = 0 }) {
  return `<label class="chip"><input type="${type}" name="${esc(name)}" value="${esc(curly(value))}"${data}><span>${esc(curly(label))}${plus(extra)}</span></label>`;
}

function packageChoices() {
  return holiday.packages
    .map((p) => {
      const counts = Object.entries(p.pick)
        .map(([kind, n]) => ` data-${kind}="${n}"`)
        .join('');
      return `<label class="choice">
        <input type="radio" name="Package" value="${esc(curly(p.name))}" data-id="${p.id}" data-price="${p.price}"${counts}>
        <span class="choice-body">
          ${p.popular ? '<span class="choice-tag">Most popular</span>' : ''}
          <span class="choice-head"><span class="choice-name">${esc(curly(p.name))}</span><span class="price">${money(p.price)}</span></span>
          <span class="choice-text">${esc(p.text)}</span>
          <span class="choice-meta">Feeds ${esc(p.feeds)}</span>
        </span>
      </label>`;
    })
    .join('');
}

function pickGroup({ kind, title, field, items, hint }) {
  return `<fieldset class="order-step" data-pick="${kind}" data-field="${field}">
    <legend class="order-legend">${title} <span class="pick-count" data-pick-label></span></legend>
    ${hint ? `<p class="order-hint">${hint}</p>` : ''}
    <div class="chips">${items.map((i) => chip({ name: field, value: i.name, extra: i.extra, data: ` data-extra="${i.extra}"` })).join('')}</div>
    <p class="field-error" data-error hidden></p>
  </fieldset>`;
}

function addOns() {
  return holiday.addOns
    .map((a) => {
      const name = curly(a.name ?? dish(a.dish).name);
      if (a.options) {
        const list = a.options === 'sides' ? sides : a.options === 'meats' ? meats : a.options.map((o) => ({ name: o, extra: 0 }));
        const prefix = typeof a.options === 'string' ? `${name}: ` : '';
        return `<li class="order-addon order-addon-choice">
          <p class="order-addon-head"><span class="order-addon-name">${esc(name)}</span><span class="price">${money(a.price)} each</span></p>
          <div class="chips chips-sm">${list
            .map((o) => chip({ name, value: prefix + o.name, label: o.name, extra: o.extra, data: ` data-addon data-price="${a.price + o.extra}"` }))
            .join('')}</div>
        </li>`;
      }
      const id = `o-addon-${a.id}`;
      return `<li class="order-addon">
        <p class="order-addon-head"><label class="order-addon-name" for="${id}">${esc(name)}</label><span class="price">${money(a.price)}</span></p>
        ${a.text ? `<p class="order-addon-text">${esc(a.text)}</p>` : ''}
        <div class="stepper">
          <button type="button" data-step="-1" aria-label="One fewer: ${esc(name)}">&minus;</button>
          <input id="${id}" type="number" name="${esc(name)}" value="0" min="0" max="20" step="1" inputmode="numeric" data-addon data-price="${a.price}">
          <button type="button" data-step="1" aria-label="One more: ${esc(name)}">+</button>
        </div>
      </li>`;
    })
    .join('');
}

function field({ id, label, optional = false, input }) {
  return `<div class="field">
    <label for="${id}">${esc(label)}${optional ? ' <span class="optional">optional</span>' : ''}</label>
    ${input}
    <p class="field-error" id="${id}-error" hidden></p>
  </div>`;
}

function orderForm() {
  const pay = holiday.payLink
    ? `<p>Pay now to confirm your order.</p>
       <p><a class="btn btn-lg" data-pay-link data-template="${esc(holiday.payLink)}" href="${esc(holiday.payLink.replace('{total}', ''))}" rel="noopener">Pay <span data-done-total></span></a></p>`
    : `<p>We’ll be in touch within one business day to confirm your order and take payment. Your order is confirmed once it’s paid.</p>`;

  return `<form class="order-form quote-form" action="${site.form.action}" method="POST" data-order-form data-endpoint="${site.form.ajax}" data-day="${handoffText}">
    <input type="hidden" name="_subject" value="Thanksgiving order from the website">
    <input type="hidden" name="_template" value="table">
    <input type="hidden" name="_captcha" value="false">
    <input type="hidden" name="_next" value="${site.url}/thanks.html">
    <div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="_honey" tabindex="-1" autocomplete="off"></label></div>

    <div class="order-grid">
      <div class="order-main">
        <fieldset class="order-step" data-required="Package">
          <legend class="order-legend">Choose a package</legend>
          <p class="order-hint">${esc(holiday.includedNote)}</p>
          <div class="choice-grid">${packageChoices()}</div>
          <p class="field-error" data-error hidden></p>
        </fieldset>

        ${pickGroup({ kind: 'meats', title: 'Meats', field: 'Meats', items: meats, hint: `${esc(holiday.meats.note.split('. ').slice(0, 2).join('. '))}. <a href="holiday.html#meats">Ingredients and allergens</a>` })}
        ${pickGroup({ kind: 'sides', title: 'Sides', field: 'Sides', items: sides, hint: '<a href="holiday.html#sides">Ingredients and allergens</a>' })}
        ${pickGroup({ kind: 'desserts', title: 'Dessert', field: 'Dessert', items: desserts })}

        <fieldset class="order-step" data-required="Bread">
          <legend class="order-legend">Rolls or cornbread</legend>
          <div class="chips">${['Dinner rolls', 'Cornbread'].map((b) => chip({ type: 'radio', name: 'Bread', value: b })).join('')}</div>
          <p class="field-error" data-error hidden></p>
        </fieldset>

        <fieldset class="order-step">
          <legend class="order-legend">Add-ons <span class="optional">optional</span></legend>
          <ul class="order-addons" role="list">${addOns()}</ul>
        </fieldset>

        <fieldset class="order-step" data-required="Pickup or delivery">
          <legend class="order-legend">Pickup or delivery</legend>
          <p class="order-hint">Everything goes out ${handoffText}, the day before Thanksgiving. We’ll confirm a 30-minute window with you.</p>
          <div class="choice-grid choice-grid-2">
            <label class="choice">
              <input type="radio" name="Pickup or delivery" value="Pickup">
              <span class="choice-body">
                <span class="choice-head"><span class="choice-name">Pickup</span><span class="price">Free</span></span>
                <span class="choice-text">In Fairfax, Virginia. We send the address once your order is placed.</span>
              </span>
            </label>
            <label class="choice">
              <input type="radio" name="Pickup or delivery" value="Delivery">
              <span class="choice-body">
                <span class="choice-head"><span class="choice-name">Delivery</span><span class="price">From ${money(Math.min(...areas.map((a) => a.price)))}</span></span>
                <span class="choice-text">Northern Virginia, DC and Maryland.</span>
              </span>
            </label>
          </div>
          <p class="field-error" data-error hidden></p>

          <div class="delivery-fields" data-delivery-fields>
            <fieldset class="order-sub" data-required="Delivery area">
              <legend>Delivery area</legend>
              <div class="chips">${areas
                .map((a) => chip({ type: 'radio', name: 'Delivery area', value: a.area, label: `${a.area} ${money(a.price)}`, data: ` data-price="${a.price}"` }))
                .join('')}</div>
              <p class="order-hint" data-dinner-delivery data-price="${dinnerDelivery.price}">Dinner for Two delivers to every area for ${money(dinnerDelivery.price)}.</p>
              <p class="field-error" data-error hidden></p>
            </fieldset>
            ${field({ id: 'o-street', label: 'Street address', input: '<input id="o-street" name="Street address" type="text" autocomplete="street-address">' })}
            <div class="field-row field-row-tight">
              ${field({ id: 'o-city', label: 'City', input: '<input id="o-city" name="City" type="text" autocomplete="address-level2">' })}
              ${field({ id: 'o-zip', label: 'ZIP', input: '<input id="o-zip" name="ZIP" type="text" inputmode="numeric" autocomplete="postal-code" pattern="[0-9]{5}">' })}
            </div>
          </div>

          ${field({ id: 'o-time', label: 'Preferred time', optional: true, input: '<input id="o-time" name="Preferred time" type="text" placeholder="For example, after 2 pm">' })}
        </fieldset>

        <fieldset class="order-step">
          <legend class="order-legend">Your details</legend>
          ${field({ id: 'o-name', label: 'Your name', input: '<input id="o-name" name="Name" type="text" autocomplete="name" required>' })}
          <div class="field-row">
            ${field({ id: 'o-email', label: 'Email', input: '<input id="o-email" name="email" type="email" autocomplete="email" inputmode="email" required>' })}
            ${field({ id: 'o-phone', label: 'Phone', input: '<input id="o-phone" name="Phone" type="tel" autocomplete="tel" inputmode="tel" pattern="[0-9\\(\\)+.\\s\\-]{10,}" required>' })}
          </div>
          ${field({ id: 'o-notes', label: 'Allergies and notes', optional: true, input: '<textarea id="o-notes" name="Allergies and notes" rows="3" placeholder="Food allergies, gate codes, anything we should know"></textarea>' })}
        </fieldset>
      </div>

      <aside class="order-summary" id="order-summary" aria-labelledby="summary-title">
        <h2 class="h3" id="summary-title">Your order</h2>
        <ul class="summary-lines" role="list" data-summary-lines><li class="summary-empty">Choose a package to start.</li></ul>
        <p class="summary-total"><span>Total</span><span class="price" data-total>${money(0)}</span></p>
        <ul class="summary-notes" role="list">
          <li>Pickup or delivery ${handoffText}.</li>
          <li>Paid in full to confirm. Cancel by ${cancel.month} ${cancel.day} for a full refund.</li>
        </ul>
        <button class="btn btn-lg btn-block" type="submit" data-submit>Place order</button>
        <p class="form-fine">Questions? Call <a href="${site.phone.href}">${site.phone.display}</a>.</p>
      </aside>
    </div>

    <div class="order-bar" data-order-bar hidden>
      <p>Total <strong data-total>${money(0)}</strong></p>
      <a class="btn" href="#order-summary">Review order</a>
    </div>
  </form>

  <div class="form-done order-done" data-order-done hidden tabindex="-1">
    <h2 class="h2">We have your order</h2>
    <p class="lede">Thanks<span data-first-name></span>. Your total is <strong data-done-total></strong>.</p>
    ${pay}
    <ul class="summary-lines" role="list" data-done-lines></ul>
    <p>Pickup or delivery is ${handoffText}. We’ll confirm a 30-minute window with you. Questions? Call <a href="${site.phone.href}">${site.phone.display}</a>.</p>
  </div>

  <div class="form-failed" data-form-failed hidden role="alert">
    <p><strong>That didn't go through.</strong> Your order is still filled in, so you can try again. Or send it straight to our inbox.</p>
    <a class="btn btn-ghost" href="mailto:${site.email}" data-mailto-fallback>${icon('mail')} Email it instead</a>
  </div>`;
}

function closed(soldOut) {
  const title = soldOut ? `We’re sold out for Thanksgiving ${holiday.year}` : `Thanksgiving orders are closed for ${holiday.year}`;
  return `<div class="order-closed" data-orders-closed${soldOut ? '' : ' hidden'}>
    <h2 class="h2">${title}</h2>
    <p class="lede">Thank you for thinking of us. Planning ${esc(curly(holiday.next.join(' or ')))}? Tell us and we’ll get back to you.</p>
    <a class="btn" href="contact.html?event=holiday">Get in touch</a>
  </div>`;
}

export default function orderPage() {
  const soldOut = T.soldOut;
  const content = `<section class="page-head" aria-labelledby="page-title">
  <div class="container">
    ${eyebrow(`Thanksgiving ${holiday.year}`)}
    <h1 id="page-title" class="h1">Order Thanksgiving</h1>
    <p class="lede">Pickup or delivery on ${handoffText}, the day before Thanksgiving. Orders close ${by.weekday}, ${by.month} ${by.day}, or sooner if we sell out. <a href="holiday.html">See the full menu</a></p>
  </div>
</section>

<section class="section section-tight order-section" aria-label="Your order">
  <div class="container">
    ${soldOut ? closed(true) : `${orderForm()}${closed(false)}`}
  </div>
</section>`;

  return page({
    slug: 'order',
    title: `Order Thanksgiving ${holiday.year} | Aaron J’s Catering`,
    description: `Order Thanksgiving dinner from Aaron J’s Catering: turkey, ham, short ribs and sides from ${money(Math.min(...holiday.packages.map((p) => p.price)))}. Pickup or delivery ${handoff.month} ${handoff.day} across the DMV.`,
    content,
  });
}
