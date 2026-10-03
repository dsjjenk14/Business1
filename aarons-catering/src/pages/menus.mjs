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
    : 'None in the recipe. See the allergy note.';
  const spicy = d.spicy ? ' <span class="spicy">Spicy</span>' : '';
  const note = d.note ? `<p class="dish-note">${esc(d.note)}</p>` : '';
  return `<p class="allergens"><span class="label">Allergens</span> ${esc(text)}${spicy}</p>${note}`;
}

// Full ingredient list, folded away so the menu reads cleanly. One tap opens it.
export function ingredientsLine(d) {
  const list = d.ingredients.join(', ');
  return `<details class="ingredients"><summary>Ingredients</summary><p>${esc(list.charAt(0).toUpperCase() + list.slice(1))}.</p></details>`;
}

// A menu entry is a dish id, or { dish, name, description } to present the
// dish differently on one menu. Ingredients and allergens stay the dish's own.
function entry(e) {
  const d = dish(typeof e === 'string' ? e : e.dish);
  return { ...d, name: e.name ?? d.name, description: e.description ?? d.description, note: e.note ?? d.note };
}

export function menuDish(e, headingLevel = 4) {
  const d = entry(e);
  const h = `h${headingLevel}`;
  return `<li class="menu-dish">
    <${h} class="menu-dish-name">${esc(curly(d.name))}</${h}>
    <p class="menu-dish-desc">${esc(curly(d.description))}</p>
    ${allergenLine(d)}
    ${ingredientsLine(d)}
  </li>`;
}

function panel(m) {
  const courses = m.courses
    .map(
      (c) => `<div class="course">
      <h3 class="course-title">${esc(c.title)}</h3>
      ${c.note ? `<p class="course-note">${esc(curly(c.note))}</p>` : ''}
      ${c.dishes ? `<ul class="dish-list" role="list">${c.dishes.map((e) => menuDish(e)).join('')}</ul>` : ''}
    </div>`,
    )
    .join('');
  const link = m.link
    ? `<a class="btn btn-ghost" href="${m.link.href}">${esc(m.link.label)} ${icon('arrow', 'icon icon-sm')}</a>`
    : '';
  const styles = m.styles
    ? `<ul class="menu-styles" role="list">${m.styles.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
    : '';
  const note = m.note ? `<p class="menu-note">${esc(curly(m.note))}</p>` : '';
  return `<section class="menu-panel${m.id === 'weddings' ? ' is-wedding' : ''}" id="${m.id}" aria-labelledby="title-${m.id}" data-menu-panel>
  <header class="menu-head">
    <h2 class="h2" id="title-${m.id}">${esc(m.heading ?? m.title)}</h2>
    <p class="lede">${esc(curly(m.intro))}</p>
    ${styles}
    ${note}
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
      name: m.heading ?? m.title,
      description: m.intro,
      hasMenuSection: m.courses.filter((c) => c.dishes).map((c) => ({
        '@type': 'MenuSection',
        name: c.title,
        hasMenuItem: c.dishes.map((e) => {
          const d = entry(e);
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

  const content = `<section class="page-hero page-hero-short" aria-labelledby="page-title">
  <div class="page-hero-media">${img('page-menus', { eager: true })}</div>
  <div class="container page-hero-content">
    ${eyebrow('Catering menus')}
    <h1 id="page-title" class="h1">Our menus</h1>
    <p class="lede">Pick a menu below. Pricing depends on guest count, service style and location.</p>
  </div>
</section>

<div class="menu-tabs-wrap" data-menu-tabs>
  <div class="container"><nav class="menu-tabs" aria-label="Menus by event">${tabs}</nav></div>
</div>

<div class="container menus">
<div class="allergy-note" id="allergies" role="note">
  ${icon('alert', 'icon')}
  <p><strong>Allergies.</strong> This is a working kitchen that handles shellfish, dairy, eggs, wheat and nuts. We take real care, but we cannot guarantee any dish is free of an allergen. Every dish lists its allergens; if anyone at your event has a food allergy, tell us before you order or call <a href="${site.phone.href}">${site.phone.display}</a>.</p>
</div>
${menus.map(panel).join('\n')}
</div>

<section class="section cta cta-compact" aria-labelledby="cta-title">
  <div class="container cta-inner">
    <h2 id="cta-title" class="h2">Don't see it on the menu? Ask.</h2>
    <a class="btn btn-lg" href="index.html#quote">Request a Quote</a>
  </div>
</section>`;

  return page({
    slug: 'menus',
    title: 'Catering Menus | Soul Food Catering in DC, MD and Northern Virginia | Aaron J’s Catering',
    description:
      'Soul food catering menus for all events, plus wedding, meal prep and Thanksgiving menus, with ingredients and allergens for every dish.',
    preload: ['page-menus'],
    jsonld: [jsonLd()],
    content,
  });
}
