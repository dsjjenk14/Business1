// The character creator: a form built entirely from the server's `creator_options`, sending the
// character sheet `create_character` expects (docs/DATA_MODEL.md; CharacterCreator.cpp validates
// every field). A quick start asks only who you are, why you moved and your job; everything else
// sits under "Customize more" with legal values already in place (your look and the age group at
// random, personality and values at 50, traits, interests and goals picked at random when you move
// in unless you choose them). "Surprise me" fills a random legal sheet from the options (all but
// your name). Every problem is shown at once beside its field. The client never adds an option of
// its own, and the server checks the whole sheet again.

import { el, money, titleCase } from "./dom.js";

const opts = c => (Array.isArray(c) ? c : (c && Array.isArray(c.options) ? c.options : []));
const rnd = n => Math.floor(Math.random() * n);
const any = list => list[rnd(list.length)];
const shuffle = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// The server's validName: letters (accented too), spaces, hyphens and apostrophes, up to 24.
const NAME_OK = /^[\p{L}][\p{L} '’-]*$/u;
let uid = 0;

export function buildCreator(o, { onSubmit, onCancel }) {
  const form = el("form", { class: "creator stack", novalidate: true });
  const fields = [];        // { read(sheet) -> problem|null, mark(problem), focus(), node, more, fill?(), surprise?() }
  const more = el("details", { class: "more" });
  const moreBody = el("div", { class: "more-body" });
  const summary = el("p", { class: "hint picked" });
  const errors = el("div", { class: "errors", role: "alert" });
  const changed = () => syncSummary();

  // A field's error line and its invalid state, shown together.
  const errLine = () => el("p", { class: "field-err" });
  const marker = (node, err, controls) => problem => {
    err.textContent = problem || "";
    for (const c of controls()) { if (problem) c.setAttribute("aria-invalid", "true"); else c.removeAttribute("aria-invalid"); }
    if (node.tagName === "FIELDSET") { if (problem) node.setAttribute("aria-invalid", "true"); else node.removeAttribute("aria-invalid"); }
  };
  const add = f => { fields.push(f); return f.node; };

  // --- text
  const text = (label, key, { max = 24, name = false, inMore = false } = {}) => {
    const id = `c${uid++}`, input = el("input", { type: "text", id, maxlength: String(max), autocomplete: "off", required: true, autocapitalize: "words", spellcheck: "false" });
    const err = errLine(), node = el("label", { class: "field", for: id }, label, input, err);
    input.addEventListener("input", () => { if (err.textContent) mark(null); });
    const mark = marker(node, err, () => [input]);
    return add({ node, more: inMore, mark, focus: () => input.focus(), input,
      read: s => {
        const v = input.value.trim();
        if (!v) return `Type a ${label.toLowerCase()}.`;
        if (name && !NAME_OK.test(v)) return "Use letters, spaces, hyphens and apostrophes.";
        s[key] = v; return null;
      } });
  };
  // --- one pick: a select, plus a text box when the server allows a custom answer
  const pickOne = (label, key, choice, { into = null, inMore = true, random = false, onchange = null } = {}) => {
    const id = `c${uid++}`, list = opts(choice);
    const sel = el("select", { id }, list.map(v => el("option", { value: v }, titleCase(v))), choice && choice.allow_custom ? el("option", { value: "__custom" }, "Something else…") : null);
    const custom = el("input", { type: "text", maxlength: "24", placeholder: "Type your own", hidden: true, "aria-label": `${label}: your own` });
    if (random && list.length) sel.value = any(list);
    const err = errLine(), node = el("label", { class: "field", for: id }, label, sel, custom, err);
    const mark = marker(node, err, () => [sel, custom]);
    sel.addEventListener("change", () => { custom.hidden = sel.value !== "__custom"; mark(null); changed(); if (onchange) onchange(); });
    custom.addEventListener("input", () => mark(null));
    add({ node, more: inMore, mark, focus: () => (sel.value === "__custom" ? custom : sel).focus(), sel,
      surprise: () => { if (list.length) { sel.value = any(list); custom.hidden = true; } },
      read: s => {
        const v = sel.value === "__custom" ? custom.value.trim() : sel.value;
        if (!v) return sel.value === "__custom" ? `Type your own ${label.toLowerCase()}, or pick one.` : `Choose ${label.toLowerCase()}.`;
        (into ? (s[into] ||= {}) : s)[key] = v; return null;
      } });
    return { node, sel, value: () => (sel.value === "__custom" ? custom.value.trim() : sel.value) };
  };
  // --- several picks: chips, between min and max. Untouched ones are picked at random on submit.
  const pickMany = (label, key, choice, { into = null } = {}) => {
    const list = opts(choice), min = choice.min ?? 0, max = choice.max ?? list.length, name = `m${uid++}`;
    const boxes = list.map(v => el("input", { type: "checkbox", name, value: v }));
    const count = el("span", { class: "budget" });
    const err = errLine();
    let touched = false;
    const sync = () => {
      const n = boxes.filter(b => b.checked).length;
      count.textContent = `${n} picked · choose ${min === max ? min : `${min}–${max}`}`;
      count.classList.toggle("over", n > max);
      for (const b of boxes) b.disabled = !b.checked && n >= max;
    };
    const node = el("fieldset", null, el("legend", null, label), count, el("div", { class: "chips" }, list.map((v, i) => el("label", null, boxes[i], titleCase(v)))), err);
    const mark = marker(node, err, () => []);
    boxes.forEach(b => b.addEventListener("change", () => { touched = true; sync(); mark(null); changed(); }));
    sync();
    const pickRandom = n => { const want = new Set(shuffle(list).slice(0, n)); boxes.forEach(b => { b.checked = want.has(b.value); }); sync(); };
    add({ node, more: true, mark, focus: () => (boxes.find(b => !b.disabled) || boxes[0]).focus(),
      picked: () => boxes.filter(b => b.checked).length, untouched: () => !touched, label, min,
      fill: () => { if (!touched && boxes.filter(b => b.checked).length < min) { pickRandom(min); touched = true; } },
      surprise: () => { pickRandom(Math.min(max, min + rnd(Math.min(2, max - min) + 1))); touched = true; },
      read: s => {
        const picks = boxes.filter(b => b.checked).map(b => b.value);
        if (picks.length < min || picks.length > max) return `Choose ${min === max ? min : `${min} to ${max}`} (you have ${picks.length}).`;
        (into ? (s[into] ||= {}) : s)[key] = picks; return null;
      } });
    return node;
  };
  // --- personality / values: 0–100 each, starting at 50, within a point budget
  const budget = (label, key, stats, total) => {
    const sliders = stats.map(st => el("input", { type: "range", min: "0", max: "100", step: "5", value: "50", "aria-label": titleCase(st) }));
    const vals = sliders.map(() => el("span", { class: "money" }, "50"));
    const left = el("span", { class: "budget" });
    const err = errLine();
    const used = () => sliders.reduce((a, x) => a + Number(x.value), 0);
    const sync = () => {
      sliders.forEach((s, i) => { vals[i].textContent = s.value; });
      left.textContent = `${used()} of ${total} points used`;
      left.classList.toggle("over", used() > total);
    };
    const node = el("fieldset", null, el("legend", null, label), left, stats.map((st, i) => el("div", { class: "slider" }, el("span", null, titleCase(st)), sliders[i], vals[i])), err);
    const mark = marker(node, err, () => sliders);
    sliders.forEach(s => s.addEventListener("input", () => { sync(); if (used() <= total) mark(null); }));
    sync();
    add({ node, more: true, mark, focus: () => sliders[0].focus(),
      // A random spread that fits the budget: random weights, scaled to the budget, in steps of 5.
      surprise: () => {
        const raw = stats.map(() => 10 + rnd(91)), scale = Math.min(1, total / raw.reduce((a, b) => a + b, 0));
        sliders.forEach((s, i) => { s.value = String(Math.min(100, Math.floor(raw[i] * scale / 5) * 5)); });
        sync();
      },
      read: s => {
        if (used() > total) return `${used()} points used: the budget is ${total}. Lower a slider or two.`;
        s[key] = Object.fromEntries(stats.map((st, i) => [st, Number(sliders[i].value)])); return null;
      } });
    return node;
  };

  // ---------------------------------------------------------------- quick start
  const ageGroups = Array.isArray(o.age_groups) ? o.age_groups : [];
  const origins = Array.isArray(o.origins) ? o.origins : [];
  const careers = Array.isArray(o.careers) ? o.careers : [];
  const educations = opts(o.education);
  // creator_options marks which education answers each job takes (newer servers); without it every job is listed.
  const marksEducation = careers.some(c => Array.isArray(c.educations));
  const opensTo = (c, edu) => !marksEducation || !Array.isArray(c.educations) || c.educations.includes(edu);

  const first = text("First name", "first_name", { name: true });
  const last = text("Last name", "last_name", { name: true });
  const pronouns = o.pronouns ? pickOne("Pronouns", "pronouns", o.pronouns, { inMore: false }) : null;
  const gender = o.gender ? pickOne("Gender", "gender", o.gender, { inMore: false }) : null;

  // Why you moved: a select, with what it means for your start under it.
  const originSel = el("select", { id: `c${uid++}` }, origins.map(it => el("option", { value: it.id }, it.label)));
  const originDetail = el("p", { class: "pick-detail" });
  const originErr = errLine();
  const syncOrigin = () => {
    const it = origins.find(x => x.id === originSel.value);
    originDetail.textContent = it ? `${it.description || ""} Starts with ${money(it.bank_cents)} in the bank and ${money(it.cash_cents)} cash${it.housing ? `, ${it.housing} housing` : ""}.` : "";
  };
  originSel.addEventListener("change", () => { syncOrigin(); markOrigin(null); });
  syncOrigin();
  const originNode = el("label", { class: "field", for: originSel.id }, "Why you moved to Livéra", originSel, originDetail, originErr);
  const markOrigin = marker(originNode, originErr, () => [originSel]);
  if (origins.length) add({ node: originNode, more: false, mark: markOrigin, focus: () => originSel.focus(),
    surprise: () => { originSel.value = any(origins).id; syncOrigin(); },
    read: s => { if (!originSel.value) return "Choose why you moved."; s.origin = originSel.value; return null; } });

  // Education and the job: the job list follows what your education opens (when the server says).
  const eduSel = el("select", { id: `c${uid++}` }, educations.map(v => el("option", { value: v }, titleCase(v))));
  const jobSel = el("select", { id: `c${uid++}` });
  const jobDetail = el("p", { class: "pick-detail" });
  const jobErr = errLine();
  const drawJobs = () => {
    const edu = eduSel.value, keep = jobSel.value;
    const open = careers.filter(c => opensTo(c, edu)), closed = careers.filter(c => !opensTo(c, edu));
    const option = (c, ok) => el("option", { value: c.id, disabled: !ok }, `${c.starting_title} · ${money(c.hourly_cents)}/hr${ok ? "" : ` (needs a ${c.requires_degree || "different education"})`}`);
    jobSel.replaceChildren(...[
      ...(marksEducation ? [el("optgroup", { label: `Open to you (${open.length})` }, open.map(c => option(c, true)))] : open.map(c => option(c, true))),
      closed.length ? el("optgroup", { label: "Needs more schooling" }, closed.map(c => option(c, false))) : null].filter(Boolean));
    jobSel.value = open.some(c => c.id === keep) ? keep : (open[0] ? open[0].id : "");
    syncJob();
  };
  const syncJob = () => {
    const c = careers.find(x => x.id === jobSel.value);
    jobDetail.textContent = c ? `${c.name}: you start as ${c.starting_title} at ${(c.workplaces || []).join(", ")}, ${money(c.hourly_cents)}/hr.${c.requires_degree ? ` Needs a ${c.requires_degree}.` : ""}` : "No job is open to that education.";
  };
  eduSel.addEventListener("change", () => { drawJobs(); markJob(null); changed(); });
  jobSel.addEventListener("change", () => { syncJob(); markJob(null); });
  drawJobs();
  const eduNode = educations.length ? el("label", { class: "field", for: eduSel.id }, "Education", eduSel) : null;
  const jobNode = el("label", { class: "field", for: jobSel.id }, "Your job", jobSel, jobDetail, jobErr);
  const markJob = marker(jobNode, jobErr, () => [jobSel, eduSel]);
  if (educations.length) fields.push({ node: eduNode, more: false, mark: () => {}, focus: () => eduSel.focus(),
    surprise: () => { eduSel.value = any(educations); drawJobs(); },
    read: s => { s.education = eduSel.value; return null; } });
  if (careers.length) add({ node: jobNode, more: false, mark: markJob, focus: () => jobSel.focus(),
    surprise: () => { const open = careers.filter(c => opensTo(c, eduSel.value)); if (open.length) { jobSel.value = any(open).id; syncJob(); } },
    read: s => {
      const c = careers.find(x => x.id === jobSel.value);
      if (!c) return "Choose a job. None is open to that education: pick another education.";
      if (!opensTo(c, eduSel.value)) return `${c.starting_title} needs a ${c.requires_degree || "different education"}.`;
      s.career = c.id; return null;
    } });

  const quick = el("fieldset", { class: "quick" }, el("legend", null, "Quick start"),
    el("div", { class: "pair" }, first, last), el("div", { class: "pair" }, pronouns ? pronouns.node : null, gender ? gender.node : null),
    origins.length ? originNode : null, eduNode, careers.length ? jobNode : null, summary);

  // ---------------------------------------------------------------- customize more
  // Age: a group, and within it an exact age (hidden when the group is a single year).
  const ageSel = el("select", { id: `c${uid++}` }, ageGroups.map(g => el("option", { value: g.id }, g.label)));
  if (ageGroups.length) ageSel.value = any(ageGroups).id;
  const exactAge = el("input", { type: "number", inputmode: "numeric", placeholder: "Leave empty for a surprise", min: "0", max: "120", id: `c${uid++}` });
  const ageHint = el("span", null);
  const ageErr = errLine();
  const exactNode = el("label", { class: "field", for: exactAge.id }, ageHint, exactAge);
  const groupOf = () => ageGroups.find(x => x.id === ageSel.value);
  const syncAge = () => {
    const g = groupOf(), span = g && Array.isArray(g.ages) ? g.ages : null;
    exactNode.hidden = !span || span[0] === span[1];
    if (exactNode.hidden) exactAge.value = "";
    ageHint.textContent = span ? `Exact age, ${span[0]}–${span[1]} (optional)` : "";
  };
  ageSel.addEventListener("change", () => { syncAge(); markAge(null); changed(); });
  exactAge.addEventListener("input", () => markAge(null));
  syncAge();
  const ageNode = el("div", { class: "stack" }, el("label", { class: "field", for: ageSel.id }, "Age", ageSel), exactNode, ageErr);
  const markAge = marker(ageNode, ageErr, () => [ageSel, exactAge]);
  if (ageGroups.length) fields.push({ node: ageNode, more: true, mark: markAge, focus: () => (exactNode.hidden ? ageSel : exactAge).focus(),
    surprise: () => { ageSel.value = any(ageGroups).id; exactAge.value = ""; syncAge(); },
    read: s => {
      const g = groupOf();
      s.age_group = ageSel.value;
      if (exactAge.value === "" || exactNode.hidden) return null;
      const n = Number(exactAge.value);
      if (!Number.isInteger(n)) return "Age must be a whole number.";
      if (g && Array.isArray(g.ages) && (n < g.ages[0] || n > g.ages[1])) return `${g.label} means ${g.ages[0]}–${g.ages[1]}.`;
      s.age = n; return null;
    } });
  const sex = o.sex ? pickOne("Sex (for pregnancy rules)", "sex", o.sex) : null;
  moreBody.append(el("fieldset", null, el("legend", null, "You"), ageGroups.length ? ageNode : null, sex ? sex.node : null));

  const look = [];
  for (const [field, choice] of Object.entries(o.appearance || {})) {
    look.push((choice.max ?? 1) === 1 ? pickOne(titleCase(field), field, choice, { into: "appearance", random: true }).node : pickMany(titleCase(field), field, choice, { into: "appearance" }));
  }
  if (Array.isArray(o.height_cm)) {
    const [lo, hi] = o.height_cm;
    const h = el("input", { type: "range", min: String(lo), max: String(hi), step: "1", value: String(lo + rnd(hi - lo + 1)), "aria-label": "Height in cm" });
    const hv = el("span", { class: "money" }, h.value + " cm");
    h.oninput = () => { hv.textContent = h.value + " cm"; };
    const node = el("div", { class: "slider" }, el("span", null, "Height"), h, hv);
    fields.push({ node, more: true, mark: () => {}, focus: () => h.focus(), surprise: () => { h.value = String(lo + rnd(hi - lo + 1)); h.oninput(); },
      read: s => { (s.appearance ||= {}).height_cm = Number(h.value); return null; } });
    look.push(node);
  }
  moreBody.append(el("fieldset", null, el("legend", null, "How you look"),
    el("p", { class: "hint" }, "Saved with your character; picked at random until you change it. The 2.5D preview shows your initials until bodies are drawn."), look));

  if (Array.isArray(o.personality)) moreBody.append(budget("Personality", "personality", o.personality, o.personality_budget ?? o.personality.length * 50));
  if (Array.isArray(o.values)) moreBody.append(budget("What matters to you", "values", o.values, o.values_budget ?? o.values.length * 50));
  if (o.traits) moreBody.append(pickMany("Traits", "traits", o.traits));
  if (o.interests) moreBody.append(pickMany("Interests", "interests", o.interests));
  if (o.goals) moreBody.append(pickMany("Goals", "goals", o.goals));
  const relationship = o.relationship_status ? pickOne("Relationship status", "relationship_status", o.relationship_status) : null;
  if (relationship) moreBody.append(el("fieldset", null, el("legend", null, "Your story"), relationship.node));
  more.append(el("summary", null, "Customize more", el("span", { class: "sr-only" }, ": age, look, personality, traits, interests, goals")), moreBody);

  // A line or two about your past (optional; outside "more" so it's there to type into).
  const bg = el("textarea", { maxlength: String(o.max_background_length || 400), placeholder: "A line or two about your past (optional)", id: `c${uid++}` });
  const bgErr = errLine();
  const bgNode = el("label", { class: "field", for: bg.id }, "Your story (optional)", bg, bgErr);
  const markBg = marker(bgNode, bgErr, () => [bg]);
  fields.push({ node: bgNode, more: false, mark: markBg, focus: () => bg.focus(),
    read: s => { const v = bg.value.trim(); if (v.length > (o.max_background_length || 400)) return "That's too long."; s.background = v; return null; } });

  // What the quick start leaves to chance, said in the open.
  function syncSummary() {
    const g = groupOf();
    const many = fields.filter(f => f.untouched && f.min > 0 && f.untouched() && f.picked() < f.min).map(f => f.label.toLowerCase());
    const bits = [g ? `age: ${g.label}` : "", sex ? `sex: ${sex.value()}` : "", relationship ? `relationship: ${relationship.value()}` : "", "your look at random"];
    summary.textContent = `Also set for you (change any of it under Customize more): ${bits.filter(Boolean).join(" · ")}${many.length ? `; ${many.join(", ")} picked at random when you move in` : ""}.`;
  }
  syncSummary();

  // Surprise me: every field at random, within the server's rules (names stay yours).
  const surprise = el("button", { type: "button", class: "btn", id: "creator-surprise", onclick: () => {
    for (const f of fields) if (f.surprise) f.surprise();
    for (const f of fields) f.mark(null);
    errors.replaceChildren();
    syncSummary();
  } }, "Surprise me");

  const submit = el("button", { type: "submit", class: "btn primary block" }, "Move to Livéra");
  form.append(
    el("div", { class: "surprise-row" }, surprise, el("span", { class: "hint" }, "Surprise me picks everything but your name, at random and within the rules.")),
    quick, more, bgNode, errors, submit,
    el("button", { type: "button", class: "btn block", onclick: onCancel }, "Back"));

  // Show every problem at once, beside its field, and go to the first.
  const showProblems = problems => {
    for (const f of fields) f.mark(null);
    if (!problems.length) { errors.replaceChildren(); return; }
    for (const [f, p] of problems) f.mark(p);
    errors.replaceChildren(el("strong", null, problems.length === 1 ? "One thing to fix:" : `${problems.length} things to fix:`),
      el("ul", null, problems.map(([f, p]) => el("li", null, p))));
    const [firstBad] = problems[0];
    if (firstBad.more) more.open = true;
    firstBad.node.scrollIntoView({ block: "center", behavior: "smooth" });
    setTimeout(() => firstBad.focus(), 300);
  };
  // A refusal from the server, beside the field it's about when the message says which.
  const serverProblem = message => {
    const m = String(message || "").toLowerCase();
    const by = [[/name/, first], [/age/, fields.find(f => f.node === ageNode)], [/career|job|start there|needs a/, fields.find(f => f.node === jobNode)],
      [/origin|why you moved/, fields.find(f => f.node === originNode)], [/background/, fields.find(f => f.node === bgNode)]];
    const hit = by.find(([re, f]) => f && re.test(m));
    const text = String(message || "The server refused this character.");
    const nice = text[0] ? text[0].toUpperCase() + text.slice(1) : text;
    showProblems(hit ? [[fields.find(f => f === hit[1] || f.node === hit[1]), nice]] : []);
    if (!hit) errors.replaceChildren(el("strong", null, "The server said: "), nice);
  };

  form.addEventListener("submit", async e => {
    e.preventDefault();
    for (const f of fields) if (f.fill) f.fill();   // the quick start's random picks, now visible under Customize more
    syncSummary();
    const sheet = {}, problems = [];
    for (const f of fields) { const p = f.read(sheet); if (p) problems.push([f, p]); }
    if (problems.length) { showProblems(problems); return; }
    showProblems([]);
    submit.disabled = true;
    const problem = await onSubmit(sheet);
    submit.disabled = false;
    if (problem) serverProblem(problem);
  });
  return form;
}
