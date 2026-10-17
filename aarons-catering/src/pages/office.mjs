// Office catering: breakfast cooked in the office, lunch delivered, bites for
// meetings, and a request form for companies. Menus come from content/office.mjs.
import { page } from '../layout.mjs';
import { site } from '../content/site.mjs';
import { officeMenus, officeFormats } from '../content/office.mjs';
import { icon } from '../icons.mjs';
import { esc, curly, eyebrow } from '../lib.mjs';
import { menuDish } from './menus.mjs';
import { quoteForm, reviewsLine } from './contact.mjs';

const slug = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function panel(m) {
  const courses = m.courses
    .map(
      (c) => `<div class="course" id="${m.id}-${slug(c.title)}">
      <h3 class="course-title">${esc(c.title)}</h3>
      ${c.note ? `<p class="course-note">${esc(curly(c.note))}</p>` : ''}
      ${c.dishes ? `<ul class="dish-list" role="list">${c.dishes.map((e) => menuDish(e)).join('')}</ul>` : ''}
    </div>`,
    )
    .join('');
  return `<section class="menu-panel office-panel" id="${m.id}" aria-labelledby="title-${m.id}">
  <header class="menu-head">
    ${eyebrow(m.eyebrow)}
    <h2 class="h2" id="title-${m.id}">${esc(m.title)}</h2>
    <p class="lede">${esc(curly(m.intro))}</p>
    <a class="btn btn-ghost" href="#office-quote">Request a quote</a>
  </header>
  ${courses}
</section>`;
}

export default function office() {
  const formats = officeFormats
    .map((f) => `<li><a class="office-format" href="${f.href}"><span class="office-format-title">${esc(f.title)}</span><span class="office-format-text">${esc(curly(f.text))}</span></a></li>`)
    .join('');

  const content = `<section class="page-head" aria-labelledby="page-title">
  <div class="container">
    ${eyebrow('Office catering')}
    <h1 id="page-title" class="h1">Breakfast and lunch for the office</h1>
    <p class="lede">Breakfast cooked fresh in your office, lunch delivered for the whole team, and bites for meetings, across DC, Maryland and Northern Virginia. Tell us your headcount and we’ll send a quote within one business day.</p>
    <div class="hero-actions">
      <a class="btn" href="#office-quote">Request office catering</a>
      <a class="btn btn-ghost" href="${site.phone.href}">${icon('phone')} Call ${site.phone.display}</a>
    </div>
    <ul class="office-formats" role="list">${formats}</ul>
  </div>
</section>

<div class="container menus">
<div class="allergy-note" id="allergies" role="note">
  ${icon('alert', 'icon')}
  <p><strong>Allergies.</strong> This is a working kitchen that handles shellfish, dairy, eggs, wheat and nuts. We take real care, but we cannot guarantee any dish is free of an allergen. Every dish lists its allergens; if anyone on your team has a food allergy, tell us when you order or call <a href="${site.phone.href}">${site.phone.display}</a>.</p>
</div>
${officeMenus.map(panel).join('\n')}
</div>

<section class="section section-dark home-quote" id="office-quote" aria-labelledby="quote-title">
  <div class="container home-quote-grid">
    <div class="home-quote-intro">
      ${eyebrow('Request a quote')}
      <h2 id="quote-title" class="h2">Tell us about your office</h2>
      <p class="lede">The date, your headcount and what you have in mind. We reply within one business day.</p>
      ${reviewsLine()}
      <div class="quick-contact">
        <a class="btn btn-ghost" href="${site.phone.href}">${icon('phone')} Call us</a>
        <a class="btn btn-ghost" href="mailto:${site.email}">${icon('mail')} Email us</a>
      </div>
    </div>
    ${quoteForm({ office: true })}
  </div>
</section>`;

  return page({
    slug: 'office',
    title: 'Office Catering in DC, MD and Northern Virginia | Aaron J’s Catering',
    description:
      'Office catering from Aaron J’s: breakfast cooked in your office with an omelette station and mini waffle bar, plus team lunches and meeting bites across the DMV.',
    content,
  });
}
