// The Thanksgiving order: what can be picked and what it costs, from holiday.mjs.
// The order page uses it to draw the choices, and the checkout function uses it
// to price an order from scratch, so a total can't be changed in the browser.
import { holiday } from './content/holiday.mjs';
import { dish } from './content/dishes.mjs';

// Typographic apostrophes, the same as the page shows (lib.mjs has the same helper,
// but importing it here would pull the photo list into the checkout function).
const curly = (text) => String(text).replace(/'/g, '’');

const named = (list) => list.map((x) => ({ name: curly(x.name), extra: x.extra ?? 0 }));

export const packages = holiday.packages.map((p) => ({ ...p, name: curly(p.name) }));
export const meats = named(holiday.meats.items.map((m) => ({ name: m.name ?? dish(m.dish).name, extra: m.extra })));
export const sides = named(holiday.sides.map((s) => ({ name: s.name ?? dish(s.dish).name, extra: s.extra })));
export const desserts = named(holiday.desserts.map((id) => ({ name: dish(id).name })));
export const breads = ['Dinner rolls', 'Cornbread'];
export const areas = holiday.delivery.filter((d) => !d.package);
export const dinnerDelivery = holiday.delivery.find((d) => d.package);

// Add-ons with `choices` are picked from a list (each choice is one item);
// the rest are counted.
export const addOns = holiday.addOns.map((a) => {
  const name = curly(a.name ?? dish(a.dish).name);
  if (!a.options) return { id: a.id, name, price: a.price, text: a.text };
  const list = a.options === 'sides' ? sides : a.options === 'meats' ? meats : a.options.map((o) => ({ name: curly(o), extra: 0 }));
  const prefix = typeof a.options === 'string' ? `${name}: ` : '';
  return {
    id: a.id,
    name,
    price: a.price,
    text: a.text,
    choices: list.map((o) => ({ value: prefix + o.name, label: o.name, extra: o.extra, price: a.price + o.extra })),
  };
});

const PICKS = { meats, sides, desserts };
const NOUNS = { meats: ['meat', 'meats'], sides: ['side', 'sides'], desserts: ['dessert', 'desserts'] };

export class OrderError extends Error {}

// order: { package, meats: [names], sides: [names], desserts: [names], bread,
//          addOns: { [id]: count, or [values] for a choice }, fulfilment: 'Pickup' | 'Delivery', area }
// Returns { package, picks, lines: [{ name, detail, amount, qty }], total }, or throws OrderError.
export function priceOrder(order) {
  const pkg = packages.find((p) => p.id === order.package);
  if (!pkg) throw new OrderError('Choose a package.');

  const picks = {};
  for (const [kind, list] of Object.entries(PICKS)) {
    const n = pkg.pick[kind] ?? 0;
    const chosen = [...new Set(Array.isArray(order[kind]) ? order[kind] : [])];
    if (chosen.length !== n) throw new OrderError(`Choose ${n} ${NOUNS[kind][n === 1 ? 0 : 1]}.`);
    picks[kind] = chosen.map((name) => {
      const item = list.find((i) => i.name === name);
      if (!item) throw new OrderError(`${name} isn't on the menu.`);
      return item;
    });
  }
  if (!breads.includes(order.bread)) throw new OrderError('Rolls or cornbread?');

  const lines = [];
  const detail = [...picks.meats, ...picks.sides, ...picks.desserts].map((i) => i.name).concat(order.bread).join(', ');
  lines.push({ name: pkg.name, detail, amount: pkg.price, qty: 1 });
  for (const kind of Object.keys(PICKS)) {
    for (const item of picks[kind]) if (item.extra) lines.push({ name: item.name, amount: item.extra, qty: 1 });
  }

  const wanted = order.addOns ?? {};
  for (const a of addOns) {
    const v = wanted[a.id];
    if (v == null) continue;
    if (a.choices) {
      for (const value of new Set(Array.isArray(v) ? v : [])) {
        const c = a.choices.find((x) => x.value === value);
        if (!c) throw new OrderError(`${value} isn't on the menu.`);
        lines.push({ name: c.value, amount: c.price, qty: 1 });
      }
    } else {
      const qty = Number(v);
      if (!Number.isInteger(qty) || qty < 0 || qty > 20) throw new OrderError(`Check the number of ${a.name}.`);
      if (qty) lines.push({ name: a.name, amount: a.price, qty });
    }
  }

  if (order.fulfilment === 'Delivery') {
    const area = areas.find((a) => a.area === order.area);
    if (!area) throw new OrderError('Which area are we delivering to?');
    const fee = pkg.id === dinnerDelivery.package ? dinnerDelivery.price : area.price;
    lines.push({ name: `Delivery, ${area.area}`, amount: fee, qty: 1 });
  } else if (order.fulfilment !== 'Pickup') {
    throw new OrderError('Pickup or delivery?');
  }

  const total = lines.reduce((sum, l) => sum + l.amount * l.qty, 0);
  return { package: pkg, picks, lines, total };
}
