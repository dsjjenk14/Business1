import { page } from '../layout.mjs';
import { site } from '../content/site.mjs';
import { holiday } from '../content/holiday.mjs';
import { icon } from '../icons.mjs';
import { esc, eyebrow } from '../lib.mjs';

const EVENT_TYPES = [
  ['wedding', 'Wedding'],
  ['corporate', 'Corporate event'],
  ['birthday', 'Birthday'],
  ['family', 'Family gathering'],
  ['holiday', 'Holiday order'],
  ['other', 'Something else'],
];

const BUDGETS = ['Not sure yet', 'Under $1,000', '$1,000 to $2,500', '$2,500 to $5,000', '$5,000 to $10,000', 'Over $10,000'];

// Shown after a request is sent, here and on thanks.html.
export function confirmation(nameSlot = '', level = 2) {
  return `<h${level} class="h2">We have your request</h${level}>
    <p class="lede">Thanks${nameSlot}. Chef Aaron reads every request personally. You'll hear back within one business day, usually the same day, with a few questions or a first quote.</p>
    <p>Watch for an email from <strong>${site.email}</strong>. If it isn't in your inbox by tomorrow, check your spam folder.</p>
    <p>Event in the next seven days? Call <a href="${site.phone.href}">${site.phone.display}</a> so we can move fast.</p>`;
}

function field({ id, label, hint, required = true, input }) {
  const hintId = hint ? `${id}-hint` : '';
  return `<div class="field">
    <label for="${id}">${esc(label)}${required ? '' : ' <span class="optional">optional</span>'}</label>
    ${hint ? `<p class="hint" id="${hintId}">${esc(hint)}</p>` : ''}
    ${input(hintId ? ` aria-describedby="${hintId}"` : '')}
    <p class="field-error" id="${id}-error" hidden></p>
  </div>`;
}

export default function contact() {
  const fields = [
    field({ id: 'f-name', label: 'Your name', input: (d) => `<input id="f-name" name="Name" type="text" autocomplete="name" required${d}>` }),
    field({
      id: 'f-email',
      label: 'Email',
      input: (d) => `<input id="f-email" name="email" type="email" autocomplete="email" inputmode="email" required${d}>`,
    }),
    field({
      id: 'f-phone',
      label: 'Phone',
      input: (d) =>
        `<input id="f-phone" name="Phone" type="tel" autocomplete="tel" inputmode="tel" pattern="[0-9()+.\\-\\s]{10,}" required${d}>`,
    }),
    field({
      id: 'f-type',
      label: 'Type of event',
      input: (d) => `<select id="f-type" name="Event type" required${d}>
        <option value="">Choose one</option>
        ${EVENT_TYPES.map(([v, l]) => `<option value="${esc(l)}" data-key="${v}">${esc(l)}</option>`).join('')}
      </select>`,
    }),
    `<div class="field-row">
      ${field({ id: 'f-date', label: 'Event date', input: (d) => `<input id="f-date" name="Event date" type="date" required${d}>` })}
      ${field({
        id: 'f-guests',
        label: 'Number of guests',
        hint: 'A best guess is fine.',
        input: (d) => `<input id="f-guests" name="Guests" type="number" inputmode="numeric" min="1" max="5000" step="1" required${d}>`,
      })}
    </div>`,
    field({
      id: 'f-location',
      label: 'Event location',
      hint: 'City, or the venue if you have one.',
      required: false,
      input: (d) => `<input id="f-location" name="Location" type="text" autocomplete="off"${d}>`,
    }),
    field({
      id: 'f-budget',
      label: 'Budget range',
      required: false,
      input: (d) => `<select id="f-budget" name="Budget"${d}>
        <option value="">Choose one</option>
        ${BUDGETS.map((b) => `<option>${esc(b)}</option>`).join('')}
      </select>`,
    }),
    field({
      id: 'f-message',
      label: 'Anything else',
      hint: 'Menu ideas, service style, allergies, timing. Whatever you know so far.',
      required: false,
      input: (d) => `<textarea id="f-message" name="Message" rows="5"${d}></textarea>`,
    }),
  ].join('\n');

  const content = `<section class="page-head" aria-labelledby="page-title">
  <div class="container">
    ${eyebrow('Contact')}
    <h1 id="page-title" class="h1">Request a quote</h1>
    <p class="lede">Tell us about your event. The more we know, the closer the first quote will be.</p>
  </div>
</section>

<section class="section section-flush">
  <div class="container contact-grid">
    <div class="form-wrap">
      <form class="quote-form" action="${site.form.action}" method="POST" data-quote-form data-endpoint="${site.form.ajax}" data-packages="${esc(JSON.stringify(Object.fromEntries(holiday.packages.map((p) => [p.id, p.name]))))}">
        <input type="hidden" name="_subject" value="New quote request from the website">
        <input type="hidden" name="_template" value="table">
        <input type="hidden" name="_captcha" value="false">
        <input type="hidden" name="_next" value="${site.url}/thanks.html">
        <div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="_honey" tabindex="-1" autocomplete="off"></label></div>
        ${fields}
        <button class="btn btn-lg btn-block" type="submit" data-submit>Send request</button>
        <p class="form-fine">We only use your details to reply about your event.</p>
      </form>

      <div class="form-done" data-form-done hidden tabindex="-1">
        ${confirmation('<span data-first-name></span>')}
      </div>

      <div class="form-failed" data-form-failed hidden role="alert">
        <p><strong>That didn't go through.</strong> Your details are still in the form, so you can try again. Or send them straight to our inbox.</p>
        <a class="btn btn-ghost" href="mailto:${site.email}" data-mailto-fallback>${icon('mail')} Email it instead</a>
      </div>
    </div>

    <aside class="contact-aside" aria-label="Other ways to reach us">
      <div class="aside-block">
        <h2 class="h3">Rather talk?</h2>
        <ul class="contact-list contact-list-lg">
          <li><a href="${site.phone.href}">${icon('phone')}<span>${site.phone.display}</span></a></li>
          <li><a href="mailto:${site.email}">${icon('mail')}<span>${site.email}</span></a></li>
          <li><a href="${site.instagram.url}" rel="noopener">${icon('instagram')}<span>${site.instagram.handle}</span></a></li>
        </ul>
      </div>
      <div class="aside-block">
        <h2 class="h3">What happens next</h2>
        <p>We read every request and reply within one business day, usually the same day. If your event is less than a week away, call. It's faster.</p>
      </div>
      <div class="aside-block">
        <h2 class="h3">Where we cook</h2>
        <p>Based in Fairfax. We cater across Northern Virginia, Washington DC and Maryland.</p>
      </div>
    </aside>
  </div>
</section>`;

  return page({
    slug: 'contact',
    title: 'Request a Catering Quote | Aaron J’s Catering, Fairfax VA',
    description:
      'Request a soul food catering quote for a wedding, office lunch, birthday or family gathering in Fairfax, Northern Virginia, DC or Maryland.',
    content,
  });
}
