// Small pages: the no-JavaScript form confirmation and the 404.
import { page } from '../layout.mjs';
import { site } from '../content/site.mjs';
import { confirmation } from './contact.mjs';

export function thanks() {
  return page({
    slug: 'thanks',
    title: 'Request received | Aaron J’s Catering',
    description: 'Your catering request reached Aaron J’s Catering. We reply within one business day.',
    noindex: true,
    content: `<section class="page-head page-head-center">
  <div class="container narrow form-done">
    ${confirmation('', 1)}
    <p><a class="btn" href="index.html">Back to the home page</a></p>
  </div>
</section>`,
  });
}

export function notFound() {
  return page({
    slug: '404',
    title: 'Page not found | Aaron J’s Catering',
    description: 'That page is not on the menu.',
    noindex: true,
    base: '/',
    content: `<section class="page-head page-head-center">
  <div class="container narrow">
    <p class="big-num" aria-hidden="true">404</p>
    <h1 class="h1">That page isn't on the menu</h1>
    <p class="lede">It may have moved. Try the <a href="menus.html">menus</a>, <a href="holiday.html">holiday ordering</a>, or <a href="contact.html">ask us directly</a>.</p>
    <p><a class="btn" href="index.html">Home</a> <a class="btn btn-ghost" href="${site.phone.href}">Call ${site.phone.display}</a></p>
  </div>
</section>`,
  });
}
