// Small helpers shared by the page templates.
import { photos } from './content/photos.mjs';

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Typographic apostrophes for display text.
export function curly(text) {
  return String(text).replace(/'/g, '’');
}

export function money(n) {
  return `$${Number(n).toLocaleString('en-US')}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// '2026-11-19' -> { weekday: 'Thursday', month: 'November', mon: 'Nov', day: 19, year: 2026 }
export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCDate() !== d) throw new Error(`Bad date ${iso}`);
  return { weekday: DAYS[dt.getUTCDay()], month: MONTHS[m - 1], mon: MONTHS[m - 1].slice(0, 3), day: d, year: y };
}

export function longDate(iso) {
  const p = parseDate(iso);
  return `${p.weekday}, ${p.month} ${p.day}`;
}

// <img> for a photo slot from photos.mjs, or any {file, w, h, alt} object.
export function img(slot, { cls = '', eager = false, alt } = {}) {
  const p = typeof slot === 'string' ? photos[slot] : slot;
  if (!p) throw new Error(`Unknown photo "${slot}"`);
  const attrs = [
    `src="images/${p.file}"`,
    `alt="${esc(alt ?? p.alt)}"`,
    `width="${p.w}"`,
    `height="${p.h}"`,
    eager ? 'fetchpriority="high"' : 'loading="lazy"',
    'decoding="async"',
    cls && `class="${cls}"`,
  ].filter(Boolean);
  return `<img ${attrs.join(' ')}>`;
}

export function eyebrow(text) {
  return `<p class="eyebrow">${esc(text)}</p>`;
}
