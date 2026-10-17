// Office catering: breakfast cooked in the office, lunch delivered, bites for
// meetings, and a request form for companies. Menus come from content/office.mjs.
import { page } from '../layout.mjs';
import { site } from '../content/site.mjs';
import { officeMenus, officePackages, officeAddOns, officeTerms, officeBoxes } from '../content/office.mjs';
import { dish } from '../content/dishes.mjs';
import { icon } from '../icons.mjs';
import { esc, curly, eyebrow, money } from '../lib.mjs';
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
  </header>
  ${courses}
</section>`;
}

function packageCards() {
  const groups = [...new Set(officePackages.map((p) => p.group))];
  return groups
    .map(
      (g) => `<div class="office-group">
      <h3 class="course-title">${esc(g)}</h3>
      <ul class="package-grid office-packages" role="list">${officePackages
        .filter((p) => p.group === g)
        .map(
          (p) => `<li class="package${p.popular ? ' is-popular' : ''}">
          ${p.popular ? '<p class="package-for">Most booked</p>' : ''}
          <div class="package-head">
            <h4 class="package-name">${esc(curly(p.name))}</h4>
            <p class="price">${money(p.price)}<span class="per">per person</span></p>
          </div>
          <p class="package-note">${esc(curly(p.text))}</p>
          <p class="serves">Minimum ${p.min} people</p>
          <div class="package-links">
            <a class="btn btn-block${p.popular ? '' : ' btn-ghost'}" href="office.html?event=${p.id}#office-quote">Request this<span class="visually-hidden">: ${esc(curly(p.name))}</span></a>
            <a class="text-link" href="#${p.menu}">See the menu ${icon('arrow', 'icon icon-sm')}</a>
          </div>
        </li>`,
        )
        .join('')}</ul>
    </div>`,
    )
    .join('');
}

const ALLERGEN_NAMES = { dairy: 'Dairy', eggs: 'Eggs', wheat: 'Wheat', shellfish: 'Shellfish', fish: 'Fish', 'tree nuts': 'Tree nuts', peanuts: 'Peanuts', soy: 'Soy', sesame: 'Sesame', mustard: 'Mustard' };
const NAMES_HERE = { 'baked-chicken': 'Herb roasted chicken', 'garlic-mashed': 'Roasted garlic mashed potatoes', 'short-ribs': 'Red wine braised short rib', 'caesar-salad': 'Caesar salad', 'garden-salad': 'Garden salad', 'cornbread-muffins': 'Jalapeño cheddar cornbread muffin' };

// The signature boxes: what's in each, and every allergen in any part of it.
function boxCards() {
  return officeBoxes
    .map((b) => {
      const parts = b.dishes.map((id) => dish(id));
      const allergens = [...new Set(parts.flatMap((d) => d.allergens))];
      return `<li class="box-card">
        <div class="box-head">
          <h4 class="box-name">${esc(b.name)}</h4>
          <span class="box-tag">${[b.salad ? 'Salad' : '', b.premium ? `+${money(b.premium)}` : ''].filter(Boolean).join(' · ')}</span>
        </div>
        <ul class="box-parts" role="list">${parts.map((d) => `<li>${esc(curly(NAMES_HERE[d.id] ?? d.name))}</li>`).join('')}</ul>
        <p class="allergens"><span class="label">Allergens:</span> ${allergens.length ? allergens.map((a) => ALLERGEN_NAMES[a] ?? a).join(', ') : 'None in the recipes. See the allergy note.'}</p>
      </li>`;
    })
    .join('');
}

export default function office() {
  const addOns = officeAddOns
    .map((a) => `<li><span class="office-addon-name">${esc(a.name)}</span><span class="price">+${money(a.price)}<span class="per">per person</span></span><span class="office-addon-text">${esc(curly(a.text))}</span></li>`)
    .join('');
  const terms = officeTerms
    .map(([t, text]) => `<li><h3 class="office-term-title">${esc(t)}</h3><p>${esc(curly(text))}</p></li>`)
    .join('');

  const content = `<section class="page-head" aria-labelledby="page-title">
  <div class="container">
    ${eyebrow('Corporate dining')}
    <h1 id="page-title" class="h1">The working lunch, <em>reconsidered</em></h1>
    <p class="lede">Chef-attended breakfasts, executive lunch boxes and meeting bites for offices across DC, Maryland and Northern Virginia. Priced per person, delivered and set up on time.</p>
    <div class="hero-actions">
      <a class="btn" href="#office-quote">Request office catering</a>
      <a class="btn btn-ghost" href="${site.phone.href}">${icon('phone')} Call ${site.phone.display}</a>
    </div>
  </div>
</section>

<section class="section section-tight" aria-labelledby="packages-title" id="packages">
  <div class="container">
    <div class="section-head">
      ${eyebrow('Packages')}
      <h2 id="packages-title" class="h2">Priced per person</h2>
      <p class="lede">Before delivery and tax. Pick a package, choose from the menus below, and we’ll send a quote within one business day.</p>
    </div>
    ${packageCards()}
    <div class="office-group" id="boxes">
      <h3 class="course-title">Executive lunch boxes</h3>
      <p class="muted office-group-intro">One per guest, packed and labeled by name: four hot plates and three composed salads. Mix boxes in a single order.</p>
      <ul class="box-grid" role="list">${boxCards()}</ul>
    </div>
    <div class="office-group">
      <h3 class="course-title">Extras</h3>
      <ul class="office-addons" role="list">${addOns}</ul>
    </div>
  </div>
</section>

<section class="section section-dark section-tight" aria-labelledby="terms-title">
  <div class="container">
    <div class="section-head">
      ${eyebrow('How it works')}
      <h2 id="terms-title" class="h2">Made for offices</h2>
    </div>
    <ul class="office-terms" role="list">${terms}</ul>
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
      <p class="lede">Pick a package and your headcount to see an estimate. We confirm the menu and send a quote within one business day.</p>
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
    description: `Office catering from Aaron J’s: breakfast cooked in your office, boxed and buffet lunches and meeting bites, from ${money(Math.min(...officePackages.map((p) => p.price)))} per person across the DMV.`,
    content,
  });
}
