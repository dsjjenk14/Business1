import { page } from '../layout.mjs';
import { site } from '../content/site.mjs';
import { menus } from '../content/menus.mjs';
import { dish } from '../content/dishes.mjs';
import { icon } from '../icons.mjs';
import { esc, curly, img, eyebrow } from '../lib.mjs';

const ALLERGEN_LABELS = {
  dairy: 'Dairy',
  eggs: 'Eggs',
  wheat: 'Wheat',
  shellfish: 'Shellfish',
  fish: 'Fish',
  'tree nuts': 'Tree nuts',
  peanuts: 'Peanuts',
  soy: 'Soy',
  sesame: 'Sesame',
  mustard: 'Mustard',
};

// The allergen line, plus the spicy flag and any note (vegetarian swaps and so on).
export function allergenLine(d) {
  const text = d.allergens.length
    ? d.allergens.map((a) => ALLERGEN_LABELS[a] ?? a).join(', ')
    : 'None in the recipe. Our kitchen note on allergies still applies.';
  const spicy = d.spicy ? ' <span class="spicy">Spicy</span>' : '';
  const note = d.note ? `<p class="dish-note">${esc(d.note)}</p>` : '';
  return `<p class="allergens"><span class="label">Allergens</span> ${esc(text)}${spicy}</p>${note}`;
}

function ingredientsLine(d) {
  const list = d.ingredients.join(', ');
  return `<p class="ingredients"><span class="label">Ingredients</span> ${esc(list.charAt(0).toUpperCase() + list.slice(1))}.</p>`;
}

export function menuDish(id, headingLevel = 4) {
  const d = dish(id);
  const h = `h${headingLevel}`;
  return `<li class="menu-dish">
    <${h} class="menu-dish-name">${esc(curly(d.name))}</${h}>
    <p class="menu-dish-desc">${esc(curly(d.description))}</p>
    ${ingredientsLine(d)}
    ${allergenLine(d)}
  </li>`;
}

function panel(m) {
  const courses = m.courses
    .map(
      (c) => `<div class="course">
      <h3 class="course-title">${esc(c.title)}</h3>
      <ul class="dish-list" role="list">${c.dishes.map((id) => menuDish(id)).join('')}</ul>
    </div>`,
    )
    .join('');
  const link = m.link
    ? `<a class="btn btn-ghost" href="${m.link.href}">${esc(m.link.label)} ${icon('arrow', 'icon icon-sm')}</a>`
    : '';
  return `<section class="menu-panel" id="${m.id}" aria-labelledby="title-${m.id}" data-menu-panel>
  <header class="menu-head">
    <h2 class="h2" id="title-${m.id}">${esc(m.title)}</h2>
    <p class="lede">${esc(curly(m.intro))}</p>
    ${link}
  </header>
  ${courses}
</section>`;
}

function jsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    name: 'Aaron J’s Catering menus',
    url: `${site.url}/menus.html`,
    inLanguage: 'en-US',
    hasMenuSection: menus.map((m) => ({
      '@type': 'MenuSection',
      name: m.title,
      description: m.intro,
      hasMenuSection: m.courses.map((c) => ({
        '@type': 'MenuSection',
        name: c.title,
        hasMenuItem: c.dishes.map((id) => {
          const d = dish(id);
          return { '@type': 'MenuItem', name: d.name, description: d.description };
        }),
      })),
    })),
  };
}

export default function menusPage() {
  const tabs = menus
    .map((m) => `<a href="#${m.id}" id="tab-${m.id}" data-menu-tab="${m.id}">${esc(m.title)}</a>`)
    .join('');

  const content = `<section class="page-hero" aria-labelledby="page-title">
  <div class="page-hero-media">${img('page-menus', { eager: true })}</div>
  <div class="container page-hero-content">
    ${eyebrow('Catering menus')}
    <h1 id="page-title" class="h1">Soul food catering menus</h1>
    <p class="lede">Starting points, not rules. Mix across menus, swap a side, add a protein. Tell us what you have in mind and we'll price it for your guest count.</p>
  </div>
</section>

<section class="section section-tight">
  <div class="container menu-intro">
    <div class="notice" id="allergies" role="note" aria-labelledby="allergy-title">
      ${icon('alert', 'icon notice-icon')}
      <div>
        <h2 class="notice-title" id="allergy-title">Allergies</h2>
        <p>Our kitchen handles <strong>shellfish, dairy, eggs, wheat and nuts</strong>. Everything is prepared in the same space, so we cannot guarantee that any dish is free of allergens, even when the recipe doesn't include them.</p>
        <p>Every dish below lists the allergens in its recipe. If someone at your event has a serious allergy, call us at <a href="${site.phone.href}">${site.phone.display}</a> before you order so we can talk it through.</p>
      </div>
    </div>
    <p class="muted menu-pricing">Pricing depends on guest count, service style and location. <a href="contact.html">Request a quote</a> and we'll send a full breakdown.</p>
  </div>
</section>

<div class="menu-tabs-wrap" data-menu-tabs>
  <nav class="container menu-tabs" aria-label="Menus by event">${tabs}</nav>
</div>

<div class="container menus">
${menus.map(panel).join('\n')}
</div>

<section class="section cta cta-compact" aria-labelledby="cta-title">
  <div class="container cta-inner">
    <h2 id="cta-title" class="h2">Don't see it on the menu?</h2>
    <p class="lede">Ask. If your family has a dish that has to be there, we'll cook it your way.</p>
    <a class="btn btn-lg" href="contact.html">Request a Quote</a>
  </div>
</section>`;

  return page({
    slug: 'menus',
    title: 'Catering Menus | Soul Food Catering in Fairfax, VA | Aaron J’s Catering',
    description:
      'Soul food catering menus for weddings, corporate events, birthdays, family gatherings and holidays, with full ingredients and allergens for every dish. Fairfax, VA.',
    preload: ['page-menus'],
    jsonld: [jsonLd()],
    content,
  });
}
