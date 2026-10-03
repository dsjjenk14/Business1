import { page } from '../layout.mjs';
import { gallery } from '../content/photos.mjs';
import { icon } from '../icons.mjs';
import { esc, img, eyebrow } from '../lib.mjs';

export default function galleryPage() {
  const items = gallery
    .map(
      (g, i) => `<li class="gallery-item${g.h > g.w ? ' is-tall' : ''}">
      <a href="images/${g.file}" data-lightbox data-index="${i}" data-caption="${esc(g.alt)}" data-w="${g.w}" data-h="${g.h}">
        <span class="visually-hidden">Open larger: </span>${img(g)}
      </a>
    </li>`,
    )
    .join('');

  const content = `<section class="page-head" aria-labelledby="page-title">
  <div class="container">
    ${eyebrow('Gallery')}
    <h1 id="page-title" class="h1">Food and events</h1>
    <p class="lede">Plates from the kitchen and tables from events we've cooked for. Tap a photo to see it larger.</p>
  </div>
</section>

<section class="section section-flush" aria-label="Photos">
  <div class="container">
    <ul class="gallery" role="list">${items}</ul>
  </div>
</section>

<dialog class="lightbox" data-lightbox-dialog aria-label="Photo viewer">
  <figure class="lightbox-figure">
    <img class="lightbox-img" alt="" data-lightbox-img>
    <figcaption class="lightbox-caption"><span data-lightbox-caption></span><span class="lightbox-count" data-lightbox-count></span></figcaption>
  </figure>
  <button class="lightbox-btn lightbox-close" type="button" data-lightbox-close aria-label="Close">${icon('close')}</button>
  <button class="lightbox-btn lightbox-prev" type="button" data-lightbox-prev aria-label="Previous photo">${icon('chevron-left')}</button>
  <button class="lightbox-btn lightbox-next" type="button" data-lightbox-next aria-label="Next photo">${icon('chevron-right')}</button>
</dialog>

<section class="section cta cta-compact" aria-labelledby="cta-title">
  <div class="container cta-inner">
    <h2 id="cta-title" class="h2">Want this at your event?</h2>
    <a class="btn btn-lg" href="contact.html">Request a Quote</a>
  </div>
</section>`;

  return page({
    slug: 'gallery',
    title: 'Gallery | Soul Food Catering Photos | Aaron J’s Catering, Fairfax VA',
    description:
      'Photos from Aaron J’s Catering: soul food at weddings, office lunches, birthdays, family gatherings and holiday tables in DC, Maryland and Northern Virginia.',
    content,
  });
}
