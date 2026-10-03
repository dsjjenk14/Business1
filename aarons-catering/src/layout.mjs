// The frame around every page: <head>, header, holiday banner and footer.
import { site, nav } from './content/site.mjs';
import { holiday } from './content/holiday.mjs';
import { photos } from './content/photos.mjs';
import { sprite, icon } from './icons.mjs';
import { esc, curly, parseDate } from './lib.mjs';

const assets = { css: 'css/site.css', js: 'js/site.js' };
export function setAssetVersions(v) {
  assets.css = `css/site.css?v=${v.css}`;
  assets.js = `js/site.js?v=${v.js}`;
}

const NAME = curly(site.name);
const LOGO = { file: 'logo.png', w: 556, h: 620 };

export function logo(cls = 'logo', eager = false) {
  return `<img class="${cls}" src="images/${LOGO.file}" alt="${esc(NAME)}" width="${LOGO.w}" height="${LOGO.h}"${eager ? '' : ' loading="lazy"'} decoding="async">`;
}

export const businessId = `${site.url}/#business`;

export function businessJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FoodEstablishment',
    '@id': businessId,
    name: site.name,
    alternateName: 'Aaron J’s Catering',
    description:
      'Soul food catering for weddings, corporate events, birthdays, church and family events, holidays and meal prep in Washington DC, Maryland and Northern Virginia.',
    url: `${site.url}/`,
    telephone: site.phone.intl,
    email: site.email,
    image: `${site.url}/images/${photos.hero.file}`,
    logo: `${site.url}/images/${LOGO.file}`,
    servesCuisine: ['Soul food', 'Southern'],
    priceRange: '$$',
    acceptsReservations: false,
    hasMenu: `${site.url}/menus.html`,
    areaServed: [
      { '@type': 'City', name: 'Washington', containedInPlace: { '@type': 'AdministrativeArea', name: 'District of Columbia' } },
      { '@type': 'AdministrativeArea', name: 'Northern Virginia' },
      { '@type': 'State', name: 'Maryland' },
    ],
    founder: { '@type': 'Person', name: 'Aaron Jenkins', jobTitle: 'Chef' },
    sameAs: [site.instagram.url],
  };
}

function holidayBar() {
  const t = holiday.thanksgiving;
  const d = parseDate(t.orderBy);
  // The last message shows once every deadline has passed.
  const messages = [
    `<p data-until="${t.orderBy}">Thanksgiving orders close ${d.weekday}, ${d.mon}&nbsp;${d.day}.</p>`,
    `<p data-until="${holiday.season.closes}">Planning ${esc(curly(holiday.next.join(' or ')))}? Ask us.</p>`,
  ];
  return `<div class="holiday-bar" data-holiday-bar data-opens="${holiday.season.opens}" data-closes="${holiday.season.closes}" hidden>
  <div class="container holiday-bar-inner">
    <div class="holiday-bar-text">${messages.join('')}</div>
    <a href="holiday.html">See the menu ${icon('arrow', 'icon icon-sm')}</a>
  </div>
</div>`;
}

function header(slug) {
  const links = nav
    .map((n) => {
      const current = n.href === `${slug}.html` ? ' aria-current="page"' : '';
      const flag = n.holiday ? ' data-holiday-link' : '';
      return `<li><a href="${n.href}"${current}${flag}>${esc(n.label)}</a></li>`;
    })
    .join('');
  return `<header class="site-header" data-header>
  <div class="header-inner">
    <a class="brand" href="index.html">${logo('logo', true)}</a>
    <nav class="site-nav" id="site-nav" aria-label="Main">
      <ul class="nav-links">${links}</ul>
      <div class="nav-extra">
        <a class="btn btn-block" href="contact.html">Request a Quote</a>
        <ul class="contact-list">
          <li><a href="${site.phone.href}">${icon('phone')}<span>${site.phone.display}</span></a></li>
          <li><a href="mailto:${site.email}">${icon('mail')}<span>${site.email}</span></a></li>
          <li><a href="${site.instagram.url}" rel="noopener">${icon('instagram')}<span>${site.instagram.handle}</span></a></li>
        </ul>
      </div>
    </nav>
    <div class="header-actions">
      <a class="header-call" href="${site.phone.href}" aria-label="Call ${site.phone.display}">${icon('phone')}<span>${site.phone.display}</span></a>
      <a class="btn btn-sm header-quote" href="contact.html">Request a Quote</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">
        <span class="visually-hidden">Menu</span>${icon('menu', 'icon icon-open')}${icon('close', 'icon icon-close')}
      </button>
    </div>
  </div>
</header>`;
}

function footer() {
  const year = new Date().getFullYear();
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div class="footer-brand">
      <a href="index.html">${logo('logo logo-footer')}</a>
      <p>${esc(site.motto)}. Soul food catering for Washington DC, Maryland and Northern Virginia.</p>
    </div>
    <div class="footer-contact">
      <h2 class="footer-heading">Talk to us</h2>
      <ul class="contact-list">
        <li><a href="${site.phone.href}">${icon('phone')}<span>${site.phone.display}</span></a></li>
        <li><a href="mailto:${site.email}">${icon('mail')}<span>${site.email}</span></a></li>
        <li><a href="${site.instagram.url}" rel="noopener">${icon('instagram')}<span>${site.instagram.handle}</span></a></li>
      </ul>
    </div>
    <div>
      <h2 class="footer-heading">Pages</h2>
      <ul class="footer-links">
        <li><a href="index.html">Home</a></li>
        ${nav.map((n) => `<li><a href="${n.href}">${esc(n.label === 'Holiday' ? 'Holiday ordering' : n.label)}</a></li>`).join('')}
      </ul>
    </div>
    <div>
      <h2 class="footer-heading">Service area</h2>
      <ul class="footer-links">${site.serviceArea.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    </div>
  </div>
  <div class="container footer-base">
    <p>&copy; ${year} ${esc(NAME)}.</p>
    <p>${esc(site.allergenNote)} <a href="menus.html#allergies">Allergy details</a></p>
  </div>
</footer>`;
}

/**
 * @param {object} o
 * @param {string} o.slug        file name without .html ('index', 'menus', ...)
 * @param {string} o.title       full <title>
 * @param {string} o.description meta description, 150 to 160 characters
 * @param {string} o.content     the page's <main> contents
 * @param {string} [o.bodyClass]
 * @param {Array<string|{slot: string, media: string}>} [o.preload] photo slots to preload (the first image on screen)
 * @param {object[]} [o.jsonld]  extra structured data
 * @param {boolean} [o.noindex]
 * @param {string} [o.base]    <base href>, for the 404 page which can be served from any path
 */
export function page({ slug, title, description, content, bodyClass = '', preload = [], jsonld = [], noindex = false, base = '' }) {
  const path = slug === 'index' ? '/' : `/${slug}.html`;
  const url = `${site.url}${path}`;
  const share = photos.share;
  const data = [businessJsonLd(), ...jsonld].map((d) => `<script type="application/ld+json">${JSON.stringify(d)}</script>`).join('\n');
  const preloads = preload
    .map((p) => (typeof p === 'string' ? { slot: p } : p))
    .map(({ slot, media }) => `<link rel="preload" as="image" href="images/${photos[slot].file}"${media ? ` media="${media}"` : ''} fetchpriority="high">`)
    .join('\n');

  return `<!doctype html>
<html lang="en-US">
<head>
<meta charset="utf-8">
${base ? `<base href="${base}">\n` : ''}<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
<meta name="theme-color" content="#0B0B0C">
<meta name="color-scheme" content="dark">
<meta name="format-detection" content="telephone=no">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(NAME)}">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${site.url}/images/${share.file}">
<meta property="og:image:width" content="${share.w}">
<meta property="og:image:height" content="${share.h}">
<meta property="og:image:alt" content="${esc(share.alt)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="images/favicon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="images/icon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="images/apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<link rel="preload" href="fonts/playfair-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/jakarta-latin.woff2" as="font" type="font/woff2" crossorigin>
${preloads}
<link rel="stylesheet" href="${assets.css}">
<script>document.documentElement.classList.add('js')</script>
<script src="${assets.js}" defer></script>
${data}
</head>
<body class="page-${slug}${bodyClass ? ` ${bodyClass}` : ''}">
${sprite()}
<a class="skip-link" href="#main">Skip to content</a>
${holidayBar()}
${header(slug)}
<main id="main">
${content}
</main>
${footer()}
</body>
</html>
`;
}
