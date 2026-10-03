import { page } from '../layout.mjs';
import { site } from '../content/site.mjs';
import { esc, img, eyebrow } from '../lib.mjs';

// Text in [[double brackets]] is a fill-in only Chef Aaron can write.
// It renders highlighted so it can't be missed. Replace the brackets and the
// text inside with the real thing.
function fill(html) {
  return html.replace(/\[\[(.+?)\]\]/g, '<mark class="fill" title="Fill this in">$1</mark>');
}

export default function about() {
  const steps = [
    ['You reach out', 'Send the date, the headcount and where. We call or email you back within one business day.'],
    [
      'We build the menu',
      "Most events land on two mains, three sides, bread and a dessert. We suggest quantities so nobody runs out and you're not throwing food away.",
    ],
    ['You taste it', 'Weddings and events over 100 guests get a tasting in Fairfax before anything is final.'],
    ['We cook and serve', 'We arrive early, set the line, label every pan and stay until the last plate. Leftovers go home with you, packed.'],
  ];

  const content = `<section class="page-hero" aria-labelledby="page-title">
  <div class="page-hero-media">${img('page-about', { eager: true })}</div>
  <div class="container page-hero-content">
    ${eyebrow('About')}
    <h1 id="page-title" class="h1">Chef Aaron Jenkins</h1>
    <p class="lede">${esc(site.motto)}. Soul food, cooked the long way, in Fairfax, Virginia.</p>
  </div>
</section>

<section class="section" aria-labelledby="story-title">
  <div class="container prose-split">
    <div class="prose-aside">
      ${eyebrow('The story')}
      <h2 id="story-title" class="h2">Where the food comes from</h2>
      <figure class="aside-photo">${img('chef-aaron')}<figcaption>Chef Aaron Jenkins</figcaption></figure>
    </div>
    <div class="prose">
      ${fill(`<p class="prose-lead">I learned to cook standing next to [[who taught you: a grandmother, an aunt, a parent]] in [[the kitchen or town where you grew up]]. Nobody measured anything. You watched, you tasted, and you got told when it needed more salt.</p>
      <p>[[One or two sentences on how you got from that kitchen to this one. Restaurant jobs, culinary school, cooking for church or the family reunion, the first event someone paid you to cook.]]</p>
      <p>I started Aaron J's Catering in [[year]] because people kept asking for the food. Now we cook out of Fairfax for weddings, offices, birthdays, reunions and holiday tables across DC, Maryland and Northern Virginia.</p>`)}
      <p>The menu hasn't drifted far from where it started. Fried chicken. Greens. Mac and cheese that holds its shape when you cut it. Short ribs when it's a special day. Shrimp and grits when it's brunch. Rice and peas and fried plantains next to the mac and cheese. Peach cobbler and sweet potato pie, because a meal like that needs an ending.</p>
    </div>
  </div>
</section>

<section class="section section-dark" aria-labelledby="kitchen-title">
  <div class="container feature">
    <div class="feature-photo">${img('about-kitchen')}</div>
    <div class="feature-body">
      ${eyebrow('The kitchen')}
      <h2 id="kitchen-title" class="h2">How we cook</h2>
      <p>Everything is cooked from scratch in our kitchen in Fairfax, the day before or the morning of your event.</p>
      <p>The chicken goes into the brine the night before. The greens get washed three times and cook for three hours. The mac and cheese is baked in the same pan it's served from, so the corners stay crisp. We make the rolls, the pie crusts and the vanilla wafers in the banana pudding.</p>
      <p>We cook greens, beans and cabbage with smoked turkey instead of pork, so more of your guests can eat them.</p>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="philosophy-title">
  <div class="container feature feature-flip">
    <div class="feature-photo feature-photo-tall">${img('about-yams')}</div>
    <div class="feature-body">
      ${eyebrow('What I believe')}
      <h2 id="philosophy-title" class="h2">No shortcuts on the slow stuff</h2>
      <ul class="beliefs" role="list">
        <li><h3 class="h3">Soul food is slow food.</h3><p>There's no fast way to make short ribs. You braise them four hours or you serve something else.</p></li>
        <li><h3 class="h3">The hour before matters.</h3><p>Good catering is as much about setup as the food. We show up early, set the line, label every pan and stay until the last plate.</p></li>
        <li><h3 class="h3">Fewer events, done right.</h3><p>I'd rather cook for 80 people well than 300 badly. When a date is full, I'll tell you.</p></li>
      </ul>
    </div>
  </div>
</section>

<section class="section section-dark" aria-labelledby="process-title">
  <div class="container">
    <div class="section-head">
      ${eyebrow('Working with us')}
      <h2 id="process-title" class="h2">How an event comes together</h2>
    </div>
    <ol class="steps steps-grid" role="list">
      ${steps
        .map(
          ([t, p], i) => `<li class="step"><span class="step-num">${String(i + 1).padStart(2, '0')}</span><div><h3 class="step-title">${esc(t)}</h3><p>${esc(p)}</p></div></li>`,
        )
        .join('')}
    </ol>
  </div>
</section>

<section class="section cta" aria-labelledby="cta-title">
  <div class="container cta-inner">
    <h2 id="cta-title" class="h1">Let's talk about your event</h2>
    <p class="lede">Tell us the date and the headcount. We'll take it from there.</p>
    <a class="btn btn-lg" href="contact.html">Request a Quote</a>
    <p class="cta-alt">Or call <a href="${site.phone.href}">${site.phone.display}</a></p>
  </div>
</section>`;

  return page({
    slug: 'about',
    title: 'About Chef Aaron Jenkins | Soul Food Catering in Fairfax, VA | Aaron J’s Catering',
    description:
      'Chef Aaron Jenkins cooks soul food from scratch in Fairfax, Virginia for weddings, offices and family gatherings across DC, Maryland and Northern Virginia.',
    preload: ['page-about'],
    content,
  });
}
