// The character creator: a form built entirely from the server's `creator_options`, sending
// the character sheet `create_character` expects (docs/DATA_MODEL.md; CharacterCreator.cpp
// validates every field). The client never adds an option of its own; anything typed where
// the server allows a custom answer is checked by the server.

import { el, money, titleCase } from "./dom.js";

const opts = c => (Array.isArray(c) ? c : (c && Array.isArray(c.options) ? c.options : []));
let uid = 0;

export function buildCreator(o, { onSubmit, onCancel }) {
  const form = el("form", { class: "creator stack", novalidate: true });
  const err = el("p", { class: "err", role: "alert" });
  const readers = [];  // (sheet) => string|null : fill the sheet, or return an error

  const text = (label, key, max = 24) => {
    const input = el("input", { type: "text", maxlength: String(max), autocomplete: "off", required: true });
    readers.push(s => { const v = input.value.trim(); if (!v) return `${label} is required`; s[key] = v; return null; });
    return el("label", { class: "field" }, label, input);
  };
  // One pick: a select, plus a text box when the server allows a custom answer.
  const pickOne = (label, key, choice, into = null) => {
    const id = `c${uid++}`, list = opts(choice);
    const sel = el("select", { id }, list.map(v => el("option", { value: v }, titleCase(v))), choice && choice.allow_custom ? el("option", { value: "__custom" }, "Something else…") : null);
    const custom = el("input", { type: "text", maxlength: "24", placeholder: "Type your own", hidden: true });
    sel.onchange = () => { custom.hidden = sel.value !== "__custom"; };
    readers.push(s => {
      const v = sel.value === "__custom" ? custom.value.trim() : sel.value;
      if (!v) return `${label}: choose one`;
      (into ? (s[into] ||= {}) : s)[key] = v; return null;
    });
    return el("label", { class: "field", for: id }, label, sel, custom);
  };
  // Several picks: chips, between min and max.
  const pickMany = (label, key, choice, into = null) => {
    const list = opts(choice), min = choice.min ?? 0, max = choice.max ?? list.length, name = `m${uid++}`;
    const boxes = list.map(v => el("input", { type: "checkbox", name, value: v }));
    const count = el("span", { class: "budget" });
    const sync = () => {
      const n = boxes.filter(b => b.checked).length;
      count.textContent = `${n} picked · choose ${min === max ? min : `${min}–${max}`}`;
      count.classList.toggle("over", n > max);
      for (const b of boxes) b.disabled = !b.checked && n >= max;
    };
    boxes.forEach(b => b.addEventListener("change", sync));
    sync();
    readers.push(s => {
      const picks = boxes.filter(b => b.checked).map(b => b.value);
      if (picks.length < min || picks.length > max) return `${label}: choose ${min === max ? min : `${min} to ${max}`}`;
      (into ? (s[into] ||= {}) : s)[key] = picks; return null;
    });
    return el("fieldset", null, el("legend", null, label), count, el("div", { class: "chips" }, list.map((v, i) => el("label", null, boxes[i], titleCase(v)))));
  };
  // Personality / values: 0–100 each, starting at 50, within a point budget.
  const budget = (label, key, stats, total) => {
    const sliders = stats.map(st => el("input", { type: "range", min: "0", max: "100", step: "5", value: "50", "aria-label": titleCase(st) }));
    const vals = sliders.map(sl => el("span", { class: "money" }, "50"));
    const left = el("span", { class: "budget" });
    const sync = () => {
      const used = sliders.reduce((a, s) => a + Number(s.value), 0);
      sliders.forEach((s, i) => { vals[i].textContent = s.value; });
      left.textContent = `${used} of ${total} points used`;
      left.classList.toggle("over", used > total);
    };
    sliders.forEach(s => s.addEventListener("input", sync));
    sync();
    readers.push(s => {
      const used = sliders.reduce((a, x) => a + Number(x.value), 0);
      if (used > total) return `${label}: ${used} points used, the budget is ${total}`;
      s[key] = Object.fromEntries(stats.map((st, i) => [st, Number(sliders[i].value)])); return null;
    });
    return el("fieldset", null, el("legend", null, label), left, stats.map((st, i) => el("div", { class: "slider" }, el("span", null, titleCase(st)), sliders[i], vals[i])));
  };
  const radios = (label, key, items, render) => {
    const name = `r${uid++}`;
    const inputs = items.map((it, i) => el("input", { type: "radio", name, value: it.id, checked: i === 0 }));
    readers.push(s => { const c = inputs.find(x => x.checked); if (!c) return `${label}: choose one`; s[key] = c.value; return null; });
    return el("fieldset", null, el("legend", null, label), el("div", { class: "stack" }, items.map((it, i) => el("label", { class: "choice" }, inputs[i], render(it)))));
  };

  // --- who you are
  const ageGroups = Array.isArray(o.age_groups) ? o.age_groups : [];
  const ageSel = el("select", null, ageGroups.map(g => el("option", { value: g.id }, g.label)));
  const exactAge = el("input", { type: "number", inputmode: "numeric", placeholder: "Leave empty for a surprise", min: "0", max: "120" });
  const ageHint = el("span", { class: "hint" });
  const syncAge = () => { const g = ageGroups.find(x => x.id === ageSel.value); ageHint.textContent = g && Array.isArray(g.ages) ? `Exact age ${g.ages[0]}–${g.ages[1]} (optional)` : ""; };
  ageSel.onchange = syncAge; syncAge();
  readers.push(s => {
    s.age_group = ageSel.value;
    if (exactAge.value !== "") { const n = Number(exactAge.value); if (!Number.isInteger(n)) return "Age must be a whole number"; s.age = n; }
    return null;
  });
  form.append(el("fieldset", null, el("legend", null, "You"), text("First name", "first_name"), text("Last name", "last_name"),
    el("label", { class: "field" }, "Age", ageSel), el("label", { class: "field" }, ageHint, exactAge),
    o.sex ? pickOne("Sex (for pregnancy rules)", "sex", o.sex) : null,
    o.pronouns ? pickOne("Pronouns", "pronouns", o.pronouns) : null,
    o.gender ? pickOne("Gender", "gender", o.gender) : null));

  // --- how you look
  const look = [];
  for (const [field, choice] of Object.entries(o.appearance || {})) {
    look.push((choice.max ?? 1) === 1 ? pickOne(titleCase(field), field, choice, "appearance") : pickMany(titleCase(field), field, choice, "appearance"));
  }
  if (Array.isArray(o.height_cm)) {
    const [lo, hi] = o.height_cm;
    const h = el("input", { type: "range", min: String(lo), max: String(hi), step: "1", value: String(Math.round((lo + hi) / 2)), "aria-label": "Height in cm" });
    const hv = el("span", { class: "money" }, h.value + " cm");
    h.oninput = () => { hv.textContent = h.value + " cm"; };
    readers.push(s => { (s.appearance ||= {}).height_cm = Number(h.value); return null; });
    look.push(el("div", { class: "slider" }, el("span", null, "Height"), h, hv));
  }
  form.append(el("fieldset", null, el("legend", null, "How you look"), look,
    el("p", { class: "hint" }, "Saved with your character. The 2.5D preview shows initials for created characters until bodies are drawn.")));

  // --- who you are inside
  if (Array.isArray(o.personality)) form.append(budget("Personality", "personality", o.personality, o.personality_budget ?? o.personality.length * 50));
  if (Array.isArray(o.values)) form.append(budget("What matters to you", "values", o.values, o.values_budget ?? o.values.length * 50));
  if (o.traits) form.append(pickMany("Traits", "traits", o.traits));
  if (o.interests) form.append(pickMany("Interests", "interests", o.interests));
  if (o.goals) form.append(pickMany("Goals", "goals", o.goals));
  form.append(el("fieldset", null, el("legend", null, "Your story"),
    o.education ? pickOne("Education", "education", o.education) : null,
    o.relationship_status ? pickOne("Relationship status", "relationship_status", o.relationship_status) : null));
  if (Array.isArray(o.origins) && o.origins.length) form.append(radios("Why you moved to Livéra", "origin", o.origins, it => el("span", { class: "stack" },
    el("strong", null, it.label), el("span", { class: "hint" }, `${it.description || ""} Starts with ${money(it.bank_cents)} in the bank, ${money(it.cash_cents)} cash, ${it.housing || ""} housing.`))));
  if (Array.isArray(o.careers) && o.careers.length) form.append(radios("Starting career", "career", o.careers, it => el("span", { class: "stack" },
    el("strong", null, it.name), el("span", { class: "hint" }, `Starts as ${it.starting_title}, ${money(it.hourly_cents)}/hr · ${(it.workplaces || []).join(", ")}`))));
  const bg = el("textarea", { maxlength: String(o.max_background_length || 400), placeholder: "A line or two about your past (optional)" });
  readers.push(s => { s.background = bg.value.trim(); return null; });
  form.append(el("label", { class: "field" }, "Background", bg));

  const submit = el("button", { type: "submit", class: "btn primary block" }, "Move to Livéra");
  form.append(err, submit, el("button", { type: "button", class: "btn block", onclick: onCancel }, "Back"));
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const sheet = {};
    for (const read of readers) { const problem = read(sheet); if (problem) { err.textContent = problem; return; } }
    err.textContent = ""; submit.disabled = true;
    const problem = await onSubmit(sheet);
    submit.disabled = false;
    if (problem) err.textContent = problem;
  });
  return form;
}
