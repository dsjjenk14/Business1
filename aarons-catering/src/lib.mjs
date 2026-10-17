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

// The dates for one holiday in holiday.mjs, with the phrases the pages share.
export function holidayDates(e) {
  const by = parseDate(e.orderBy);
  const handoff = parseDate(e.handoff);
  // Pickup and delivery over two days (same month): handoff is the first, lastDay the last.
  const end = e.lastDay ? parseDate(e.lastDay) : null;
  return {
    by,
    handoffOn: handoff,
    cancel: parseDate(e.cancelBy),
    day: parseDate(e.date),
    orderByText: `${by.weekday}, ${by.month} ${by.day}`, // "Friday, November 20"
    handoffDay: `${handoff.weekday}, ${handoff.month} ${handoff.day}${end ? ` to ${end.weekday}, ${end.month} ${end.day}` : ''}`, // "Thursday, December 24"
    handoffDates: `${handoff.month} ${handoff.day}${end ? ` and ${end.day}` : ''}`, // "November 24 and 25"
    handoffShort: `${handoff.mon} ${handoff.day}${end ? `–${end.day}` : ''}`, // "Nov 24–25"
    times: `delivery ${e.delivery}, pickup ${e.pickup}`, // "delivery by 11 am, pickup by 1 pm"
  };
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
    p.focus && `style="object-position: ${p.focus}"`,
  ].filter(Boolean);
  return `<img ${attrs.join(' ')}>`;
}

export function eyebrow(text) {
  return `<p class="eyebrow">${esc(text)}</p>`;
}
