import { page } from '../layout.mjs';
import { site } from '../content/site.mjs';
import { esc, img, eyebrow } from '../lib.mjs';

export default function about() {
  const steps = [
    ['Request a quote', 'Tell us the date, the number of guests and where. We reply within one business day.'],
    ['Plan the menu', 'Pick from our menus or tell us what you want. We help with quantities.'],
    ['Enjoy the food', 'We deliver, set up or serve, depending on your event.'],
  ];

  const content = `<section class="page-hero" aria-labelledby="page-title">
  <div class="page-hero-media">${img('page-about', { eager: true })}</div>
  <div class="container page-hero-content">
    ${eyebrow('About')}
    <h1 id="page-title" class="h1">Aaron J's Catering</h1>
    <p class="lede">${esc(site.motto)}.</p>
  </div>
</section>

<section class="section" aria-labelledby="chef-title">
  <div class="container feature">
    <div class="feature-photo">${img('chef-aaron')}</div>
    <div class="feature-body">
      ${eyebrow('The chef')}
      <h2 id="chef-title" class="h2">Chef Aaron Jenkins</h2>
      <p>Soul food and comfort food for weddings, corporate events, birthdays, church and family events, holidays and meal prep.</p>
      <p>Fried chicken and waffles, glazed ham, mac and cheese, collard greens, candied yams, Cajun seafood and more, for DC, Maryland and Northern Virginia.</p>
      <a class="btn" href="menus.html">See the menus</a>
    </div>
  </div>
</section>

<section class="section section-dark" aria-labelledby="process-title">
  <div class="container">
    <div class="section-head">
      ${eyebrow('How it works')}
      <h2 id="process-title" class="h2">Three steps</h2>
    </div>
    <ol class="steps steps-grid steps-3" role="list">
      ${steps
        .map(
          ([t, p], i) => `<li class="step"><span class="step-num">${String(i + 1).padStart(2, '0')}</span><div><h3 class="step-title">${esc(t)}</h3><p>${esc(p)}</p></div></li>`,
        )
        .join('')}
    </ol>
  </div>
</section>

<section class="section cta cta-compact" aria-labelledby="cta-title">
  <div class="container cta-inner">
    <h2 id="cta-title" class="h2">Let's talk about your event</h2>
    <a class="btn btn-lg" href="index.html#quote">Request a Quote</a>
    <p class="cta-alt">Or call <a href="${site.phone.href}">${site.phone.display}</a></p>
  </div>
</section>`;

  return page({
    slug: 'about',
    title: 'About | Aaron J’s Catering | Soul Food Catering in DC, MD and Northern Virginia',
    description:
      'Aaron J’s Catering is Chef Aaron Jenkins: soul food for weddings, corporate events, birthdays, church and family events, holidays and meal prep in the DMV.',
    preload: ['page-about'],
    content,
  });
}
