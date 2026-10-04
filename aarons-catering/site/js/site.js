/* Aaron J's Catering. Small, no dependencies. Every page works without it;
   this adds the mobile menu, holiday season switch, menu tabs, gallery
   lightbox and the quote form's in-page submit. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function store(key, value) {
    try {
      if (value === undefined) return sessionStorage.getItem(key);
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    } catch (e) { return null; }
  }

  /* ---------- Header: solid on scroll, mobile menu ---------- */

  var header = $('[data-header]');
  var hero = $('.hero');
  function onScroll() {
    if (!header) return;
    var limit = hero ? hero.offsetHeight * 0.45 : 4;
    header.classList.toggle('is-scrolled', window.scrollY > limit);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  var toggle = $('.nav-toggle');
  var nav = $('#site-nav');
  function setMenu(open) {
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('nav-open', open);
    header.classList.toggle('is-menu', open);
    if (open) {
      var first = $('a', nav);
      if (first) first.focus();
    }
  }
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
        setMenu(false);
        toggle.focus();
      }
    });
    window.matchMedia('(min-width: 1080px)').addEventListener('change', function (mq) {
      if (mq.matches) setMenu(false);
    });
  }

  /* ---------- Holiday season ----------
     On between data-opens and data-closes (Eastern time).
     Preview: ?holiday=on, ?holiday=off, ?today=2026-11-20. Clear with ?holiday=auto. */

  function todayEastern() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  var params = new URLSearchParams(location.search);
  if (params.has('holiday')) store('aj-holiday', params.get('holiday') === 'auto' ? null : params.get('holiday'));
  if (params.has('today')) store('aj-today', /^\d{4}-\d{2}-\d{2}$/.test(params.get('today')) ? params.get('today') : null);

  var bar = $('[data-holiday-bar]');
  var thanksgivingOpen = false; // taking Thanksgiving orders right now (the order page uses this)
  if (bar) {
    var today = store('aj-today') || todayEastern();
    var override = store('aj-holiday');
    var opens = bar.getAttribute('data-opens');
    var closes = bar.getAttribute('data-closes');
    var state = today < opens ? 'before' : today > closes ? 'after' : 'during';
    if (override === 'on') state = 'during';
    if (override === 'off') state = today < opens ? 'before' : 'after';

    if (state === 'during') {
      var all = $$('[data-until]', bar);
      var msg = all.filter(function (p) { return p.getAttribute('data-until') >= today; })[0];
      // The last message is the "closed for the year" one: deadlines have all passed.
      var ordersOpen = msg && msg !== all[all.length - 1];
      if (msg) {
        msg.classList.add('is-active');
        // After Thanksgiving closes, the link asks about the next holidays instead of "Order".
        var barLink = $('[data-holiday-bar-link]', bar);
        if (barLink && msg.getAttribute('data-link')) {
          barLink.href = msg.getAttribute('data-link');
          $('span', barLink).textContent = msg.getAttribute('data-label');
        }
        bar.hidden = false;
      }
      $$('[data-holiday-only]').forEach(function (el) { el.hidden = false; });
      $$('[data-holiday-link]').forEach(function (el) { el.classList.add('is-season'); });
    }

    thanksgivingOpen = override === 'on' || (state === 'during' && !!ordersOpen);

    var status = $('[data-holiday-status]');
    if (status) {
      var shown = state === 'during' && !ordersOpen && override !== 'on' ? 'after' : state;
      status.setAttribute('data-state', shown);
      $('.status-text', status).textContent = status.getAttribute('data-' + shown);
      // While orders are open the dates row says it; the hero only speaks up before or after.
      status.hidden = shown === 'during';
    }
  }

  /* ---------- Menus: tabs by event type ---------- */

  var tabsWrap = $('[data-menu-tabs]');
  if (tabsWrap) {
    var tablist = $('nav', tabsWrap);
    var tabs = $$('[data-menu-tab]', tabsWrap);
    var panels = $$('[data-menu-panel]');
    tablist.setAttribute('role', 'tablist');

    tabs.forEach(function (tab) {
      var id = tab.getAttribute('data-menu-tab');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', id);
      var panel = document.getElementById(id);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.setAttribute('tabindex', '-1');
    });

    var select = function (id, opts) {
      opts = opts || {};
      var found = false;
      tabs.forEach(function (tab) {
        var on = tab.getAttribute('data-menu-tab') === id;
        if (on) found = true;
        tab.setAttribute('aria-selected', String(on));
        tab.setAttribute('tabindex', on ? '0' : '-1');
        // Bring the tab into view inside the strip only; scrollIntoView would also scroll the page.
        if (on) tablist.scrollLeft = Math.max(0, tab.offsetLeft - tablist.offsetLeft - 24);
      });
      if (!found) return false;
      panels.forEach(function (p) { p.hidden = p.id !== id; });
      if (opts.updateHash) history.replaceState(null, '', '#' + id);
      if (opts.scroll) {
        // The tabs are sticky, so measure from the panel: put its top just under the tabs.
        var panel = $('#' + id);
        var top = panel.getBoundingClientRect().top + window.scrollY - header.offsetHeight - tabsWrap.offsetHeight - 24;
        if (window.scrollY > top) window.scrollTo({ top: top });
      }
      if (opts.focus) tabs.filter(function (t) { return t.getAttribute('data-menu-tab') === id; })[0].focus();
      return true;
    };

    // Returns what the address pointed at: a menu, one course inside a menu, or neither.
    var fromHash = function () {
      var id = location.hash.slice(1);
      if (id === 'allergies') return 'allergies';
      if (select(id)) return 'menu';
      var target = id && document.getElementById(id);
      var owner = target && target.closest('[data-menu-panel]');
      if (owner) {
        select(owner.id);
        return 'course';
      }
      select(tabs[0].getAttribute('data-menu-tab'));
      return 'none';
    };
    var landed = fromHash();
    if (landed === 'menu') {
      // Land on the tabs, not on the (now hidden) panel's old position.
      requestAnimationFrame(function () {
        var top = tabsWrap.getBoundingClientRect().top + window.scrollY - header.offsetHeight;
        window.scrollTo({ top: top });
      });
    } else if (landed === 'course') {
      // The course was hidden when the browser tried to scroll to it.
      requestAnimationFrame(function () { document.getElementById(location.hash.slice(1)).scrollIntoView(); });
    }
    window.addEventListener('hashchange', fromHash);

    tablist.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-menu-tab]');
      if (!tab) return;
      e.preventDefault();
      select(tab.getAttribute('data-menu-tab'), { updateHash: true, scroll: true });
    });
    tablist.addEventListener('keydown', function (e) {
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === 'Home') next = tabs[0];
      if (e.key === 'End') next = tabs[tabs.length - 1];
      if (!next) return;
      e.preventDefault();
      select(next.getAttribute('data-menu-tab'), { updateHash: true, focus: true });
    });
  }

  /* ---------- Gallery lightbox ---------- */

  var dialog = $('[data-lightbox-dialog]');
  var links = $$('[data-lightbox]');
  if (dialog && links.length && typeof dialog.showModal === 'function') {
    var big = $('[data-lightbox-img]', dialog);
    var caption = $('[data-lightbox-caption]', dialog);
    var count = $('[data-lightbox-count]', dialog);
    var current = 0;
    var opener = null;

    var show = function (i) {
      current = (i + links.length) % links.length;
      var a = links[current];
      big.src = a.getAttribute('href');
      big.alt = a.getAttribute('data-caption');
      big.width = Number(a.getAttribute('data-w'));
      big.height = Number(a.getAttribute('data-h'));
      caption.textContent = a.getAttribute('data-caption');
      count.textContent = (current + 1) + ' / ' + links.length;
      [current - 1, current + 1].forEach(function (n) {
        var pre = new Image();
        pre.src = links[(n + links.length) % links.length].getAttribute('href');
      });
    };
    var close = function () { dialog.close(); };

    links.forEach(function (a, i) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        opener = a;
        show(i);
        dialog.showModal();
        document.body.style.overflow = 'hidden';
      });
    });
    dialog.addEventListener('close', function () {
      document.body.style.overflow = '';
      if (opener) opener.focus();
    });
    $('[data-lightbox-close]', dialog).addEventListener('click', close);
    $('[data-lightbox-prev]', dialog).addEventListener('click', function () { show(current - 1); });
    $('[data-lightbox-next]', dialog).addEventListener('click', function () { show(current + 1); });
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog || e.target.classList.contains('lightbox-figure')) close();
    });
    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') show(current + 1);
      if (e.key === 'ArrowLeft') show(current - 1);
    });
    var startX = null;
    big.addEventListener('pointerdown', function (e) { startX = e.clientX; });
    big.addEventListener('pointerup', function (e) {
      if (startX === null) return;
      var dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) show(current + (dx < 0 ? 1 : -1));
    });
  }

  /* ---------- Quote form ---------- */

  var form = $('[data-quote-form]');
  if (form) {
    form.setAttribute('novalidate', '');
    var dateInput = $('#f-date', form);
    if (dateInput) dateInput.min = todayEastern();

    // Arriving with ?event=holiday (or another type): pick that event type.
    var eventKey = params.get('event');
    if (eventKey) {
      var option = $('option[data-key="' + eventKey.replace(/[^a-z-]/g, '') + '"]', form);
      if (option) option.selected = true;
    }

    var messages = {
      'f-name': { valueMissing: 'Add your name so we know who we’re writing back to.' },
      'f-email': { valueMissing: 'Add an email so we can send the quote.', typeMismatch: 'That email doesn’t look right. Check for a typo.' },
      'f-phone': { valueMissing: 'Add a phone number. We call about most events.', patternMismatch: 'That number looks short. Include the area code.' },
      'f-type': { valueMissing: 'Pick the closest match.' },
      'f-date': { valueMissing: 'Pick a date, even a rough one.', rangeUnderflow: 'That date has already passed.', badInput: 'Pick a date from the calendar.' },
      'f-guests': { valueMissing: 'Roughly how many people?', rangeUnderflow: 'At least one guest.', rangeOverflow: 'For more than 5,000, call us.', badInput: 'Just the number, please.', stepMismatch: 'A whole number works best.' },
    };

    var errorFor = function (field) {
      var v = field.validity;
      if (v.valid) return '';
      var m = messages[field.id] || {};
      for (var key in v) {
        if (v[key] === true && m[key]) return m[key];
      }
      return 'Check this one.';
    };
    var showError = function (field) {
      var box = document.getElementById(field.id + '-error');
      if (!box) return true;
      var text = errorFor(field);
      box.textContent = text;
      box.hidden = !text;
      if (text) {
        field.setAttribute('aria-invalid', 'true');
        var ids = (field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
        if (ids.indexOf(box.id) < 0) ids.push(box.id);
        field.setAttribute('aria-describedby', ids.join(' '));
      } else {
        field.removeAttribute('aria-invalid');
      }
      return !text;
    };

    var fields = $$('input:not([type=hidden]):not([name=_honey]), select, textarea', form);
    fields.forEach(function (f) {
      f.addEventListener('blur', function () { if (f.value || f.getAttribute('aria-invalid')) showError(f); });
      f.addEventListener('input', function () { if (f.getAttribute('aria-invalid')) showError(f); });
    });

    var done = $('[data-form-done]');
    var failed = $('[data-form-failed]');
    var submit = $('[data-submit]', form);
    var mailto = $('[data-mailto-fallback]');

    var summary = function () {
      return fields
        .filter(function (f) { return f.value; })
        .map(function (f) {
          var label = $('label[for="' + f.id + '"]', form);
          var name = label ? label.firstChild.textContent.trim() : f.name;
          return name + ': ' + f.value;
        })
        .join('\n');
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var firstBad = null;
      fields.forEach(function (f) {
        if (!showError(f) && !firstBad) firstBad = f;
      });
      if (firstBad) {
        firstBad.focus();
        return;
      }

      var data = new FormData(form);
      var name = String(data.get('Name') || '').trim();
      var when = String(data.get('Event date') || '');
      var pretty = when;
      try {
        pretty = new Date(when + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      } catch (err) { /* keep ISO */ }
      data.set('_subject', 'Quote request: ' + data.get('Event type') + ', ' + data.get('Guests') + ' guests, ' + pretty + ' (' + name + ')');

      submit.disabled = true;
      submit.textContent = 'Sending…';
      failed.hidden = true;

      fetch(form.getAttribute('data-endpoint'), {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: data,
      })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (r) {
          var success = r.ok && (r.body.success === true || r.body.success === 'true');
          if (!success) throw new Error((r.body && r.body.message) || 'Not sent');
          $('[data-first-name]', done).textContent = name ? ', ' + name.split(/\s+/)[0] : '';
          form.hidden = true;
          done.hidden = false;
          done.focus();
          done.scrollIntoView({ block: 'start' });
        })
        .catch(function () {
          mailto.href = 'mailto:' + mailto.getAttribute('href').replace(/^mailto:/, '').split('?')[0] +
            '?subject=' + encodeURIComponent(data.get('_subject')) +
            '&body=' + encodeURIComponent(summary());
          failed.hidden = false;
          submit.disabled = false;
          submit.textContent = 'Send request';
        });
    });
  }

  /* ---------- Thanksgiving order ----------
     Package, picks, add-ons and pickup or delivery, with a running total.
     The order is sent to the chef's inbox the same way as the quote form. */

  var order = $('[data-order-form]');
  if (order && !thanksgivingOpen) {
    order.hidden = true;
    $('[data-orders-closed]').hidden = false;
  } else if (order) {
    order.setAttribute('novalidate', '');
    var dollars = function (n) { return '$' + n.toLocaleString('en-US'); };
    var picked = function (scope, name) { return $$('input[name="' + name + '"]:checked', scope); };
    var packages = $$('input[name="Package"]', order);
    var groups = $$('[data-pick]', order);
    var deliveryBox = $('[data-delivery-fields]', order);
    var dinnerNote = $('[data-dinner-delivery]', order);
    var orderBar = $('[data-order-bar]', order);
    var lines = [];
    var total = 0;

    var current = function () { return packages.filter(function (p) { return p.checked; })[0]; };
    var fulfilment = function () { var r = picked(order, 'Pickup or delivery')[0]; return r ? r.value : ''; };

    // How many of each a package allows, and keep the chips in step with it.
    var limitOf = function (g) {
      var pkg = current();
      return pkg ? Number(pkg.getAttribute('data-' + g.getAttribute('data-pick')) || 0) : 0;
    };
    var syncGroup = function (g) {
      var n = limitOf(g);
      var boxes = $$('input', g);
      g.hidden = !n;
      boxes.filter(function (b) { return b.checked; }).slice(n).forEach(function (b) { b.checked = false; });
      var count = boxes.filter(function (b) { return b.checked; }).length;
      boxes.forEach(function (b) { b.disabled = !n || (!b.checked && count >= n); });
      $('[data-pick-label]', g).textContent = count ? count + ' of ' + n + ' chosen' : 'Pick ' + n;
      if (count === n) clearError(g);
    };

    var errorBox = function (scope) { return $('[data-error]', scope); };
    var clearError = function (scope) { var b = errorBox(scope); if (b) b.hidden = true; };
    var setError = function (scope, text) {
      var b = errorBox(scope);
      b.textContent = text;
      b.hidden = false;
    };

    var render = function () {
      var pkg = current();
      lines = [];
      total = 0;
      var add = function (label, amount, detail) {
        lines.push({ label: label, amount: amount, detail: detail || '' });
        total += amount;
      };
      if (pkg) {
        var choices = groups
          .filter(function (g) { return !g.hidden; })
          .map(function (g) { return picked(g, g.getAttribute('data-field')).map(function (b) { return b.value; }).join(', '); })
          .concat(picked(order, 'Bread').map(function (b) { return b.value; }))
          .filter(Boolean);
        add(pkg.value, Number(pkg.getAttribute('data-price')), choices.join(' · '));
        groups.forEach(function (g) {
          if (g.hidden) return;
          picked(g, g.getAttribute('data-field')).forEach(function (b) {
            var extra = Number(b.getAttribute('data-extra') || 0);
            if (extra) add(b.value, extra);
          });
        });
      }
      $$('input[data-addon]', order).forEach(function (a) {
        var price = Number(a.getAttribute('data-price'));
        if (a.type === 'checkbox') {
          if (a.checked) add(a.value, price);
        } else {
          var qty = Math.max(0, Math.min(20, parseInt(a.value, 10) || 0));
          if (qty) add((qty > 1 ? qty + ' × ' : '') + a.name, qty * price);
        }
      });
      var how = fulfilment();
      deliveryBox.hidden = how !== 'Delivery';
      var dinner = pkg && pkg.getAttribute('data-id') === 'dinner-for-two';
      dinnerNote.hidden = !dinner;
      if (how === 'Pickup') add('Pickup in Fairfax, Virginia', 0);
      if (how === 'Delivery') {
        var area = picked(order, 'Delivery area')[0];
        if (dinner) add('Delivery' + (area ? ', ' + area.value : ''), Number(dinnerNote.getAttribute('data-price')));
        else if (area) add('Delivery, ' + area.value, Number(area.getAttribute('data-price')));
      }

      var list = $('[data-summary-lines]', order);
      list.innerHTML = '';
      if (!lines.length) list.innerHTML = '<li class="summary-empty">Choose a package to start.</li>';
      lines.forEach(function (l) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="sl-label"></span><span class="sl-amount"></span>';
        $('.sl-label', li).textContent = l.label;
        if (l.detail) {
          var small = document.createElement('small');
          small.textContent = l.detail;
          $('.sl-label', li).appendChild(small);
        }
        $('.sl-amount', li).textContent = l.amount ? dollars(l.amount) : 'Free';
        list.appendChild(li);
      });
      $$('[data-total]', order).forEach(function (t) { t.textContent = dollars(total); });
      orderBar.hidden = !pkg;
    };

    var asText = function () {
      return lines.map(function (l) { return l.label + (l.detail ? ' (' + l.detail + ')' : '') + ': ' + (l.amount ? dollars(l.amount) : 'free'); }).join('\n');
    };

    // Coming from "Order this" on the holiday page: start with that package.
    var wanted = params.get('package');
    packages.forEach(function (p) { if (p.getAttribute('data-id') === wanted) p.checked = true; });
    groups.forEach(syncGroup);
    render();

    order.addEventListener('change', function (e) {
      var g = e.target.closest('[data-pick]');
      if (e.target.name === 'Package') groups.forEach(syncGroup);
      else if (g) syncGroup(g);
      var step = e.target.closest('[data-required]');
      if (step && !g) clearError(step);
      render();
    });
    order.addEventListener('input', function (e) { if (e.target.type === 'number') render(); });
    order.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-step]');
      if (!btn) return;
      var input = $('input', btn.parentNode);
      input.value = Math.max(0, Math.min(20, (parseInt(input.value, 10) || 0) + Number(btn.getAttribute('data-step'))));
      render();
    });

    // Text fields: same messages and behavior as the quote form.
    var textMessages = {
      'o-name': { valueMissing: 'Add your name so we know whose order this is.' },
      'o-email': { valueMissing: 'Add an email so we can confirm your order.', typeMismatch: 'That email doesn’t look right. Check for a typo.' },
      'o-phone': { valueMissing: 'Add a phone number in case we need to reach you.', patternMismatch: 'That number looks short. Include the area code.' },
      'o-street': { valueMissing: 'Where should we deliver?' },
      'o-city': { valueMissing: 'Add the city.' },
      'o-zip': { valueMissing: 'Add the ZIP code.', patternMismatch: 'Five digits, please.' },
    };
    var checkText = function (f) {
      var box = document.getElementById(f.id + '-error');
      var m = textMessages[f.id] || {};
      var text = '';
      for (var key in f.validity) {
        if (f.validity[key] === true && key !== 'valid') { text = m[key] || 'Check this one.'; break; }
      }
      box.textContent = text;
      box.hidden = !text;
      if (text) f.setAttribute('aria-invalid', 'true');
      else f.removeAttribute('aria-invalid');
      return !text;
    };
    var textFields = $$('#o-name, #o-email, #o-phone, #o-street, #o-city, #o-zip', order);
    textFields.forEach(function (f) {
      f.addEventListener('blur', function () { if (f.value || f.getAttribute('aria-invalid')) checkText(f); });
      f.addEventListener('input', function () { if (f.getAttribute('aria-invalid')) checkText(f); });
    });

    var orderDone = $('[data-order-done]');
    var orderFailed = $('[data-form-failed]');
    var orderSubmit = $('[data-submit]', order);
    var orderMailto = $('[data-mailto-fallback]');

    order.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = [];
      var pkg = current();
      var pkgStep = $('[data-required="Package"]', order);
      if (!pkg) { setError(pkgStep, 'Choose a package.'); bad.push(pkgStep); }
      groups.forEach(function (g) {
        if (g.hidden) return;
        var left = limitOf(g) - picked(g, g.getAttribute('data-field')).length;
        if (left > 0) { setError(g, 'Choose ' + left + ' more.'); bad.push(g); }
      });
      var breadStep = $('[data-required="Bread"]', order);
      if (!picked(order, 'Bread').length) { setError(breadStep, 'Rolls or cornbread?'); bad.push(breadStep); }
      var howStep = $('[data-required="Pickup or delivery"]', order);
      var delivering = fulfilment() === 'Delivery';
      if (!fulfilment()) { setError(howStep, 'Pickup or delivery?'); bad.push(howStep); }
      $$('#o-street, #o-city, #o-zip', order).forEach(function (f) { f.required = delivering; });
      if (delivering) {
        var areaStep = $('[data-required="Delivery area"]', order);
        if (!picked(order, 'Delivery area').length) { setError(areaStep, 'Which area are we delivering to?'); bad.push(areaStep); }
      }
      textFields.forEach(function (f) { if (!checkText(f)) bad.push(f); });
      if (bad.length) {
        var first = bad[0];
        var focusable = first.matches('input, textarea') ? first : $('input:not([disabled])', first);
        first.scrollIntoView({ block: 'center' });
        if (focusable) focusable.focus({ preventScroll: true });
        return;
      }

      var val = function (id) { return $('#' + id, order).value.trim(); };
      var name = val('o-name');
      var data = new FormData();
      data.append('_subject', 'Thanksgiving order: ' + pkg.value + ', ' + dollars(total) + ', ' + (delivering ? 'delivery' : 'pickup') + ' (' + name + ')');
      data.append('_template', 'table');
      data.append('_captcha', 'false');
      data.append('_honey', $('[name="_honey"]', order).value);
      data.append('Name', name);
      data.append('email', val('o-email'));
      data.append('Phone', val('o-phone'));
      data.append('Package', pkg.value + ' (' + dollars(Number(pkg.getAttribute('data-price'))) + ')');
      groups.forEach(function (g) {
        if (!g.hidden) data.append(g.getAttribute('data-field'), picked(g, g.getAttribute('data-field')).map(function (b) { return b.value; }).join(', '));
      });
      data.append('Bread', picked(order, 'Bread')[0].value);
      data.append('Pickup or delivery', fulfilment() + ', ' + order.getAttribute('data-day'));
      if (delivering) data.append('Delivery address', val('o-street') + ', ' + val('o-city') + ' ' + val('o-zip') + ' (' + picked(order, 'Delivery area')[0].value + ')');
      if (val('o-time')) data.append('Preferred time', val('o-time'));
      if (val('o-notes')) data.append('Allergies and notes', val('o-notes'));
      data.append('Order', asText());
      data.append('Total', dollars(total));

      orderSubmit.disabled = true;
      orderSubmit.textContent = 'Placing your order…';
      orderFailed.hidden = true;

      fetch(order.getAttribute('data-endpoint'), { method: 'POST', headers: { Accept: 'application/json' }, body: data })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; }); })
        .then(function (r) {
          if (!(r.ok && (r.body.success === true || r.body.success === 'true'))) throw new Error('Not sent');
          $('[data-first-name]', orderDone).textContent = ', ' + name.split(/\s+/)[0];
          $$('[data-done-total]', orderDone).forEach(function (t) { t.textContent = dollars(total); });
          var pay = $('[data-pay-link]', orderDone);
          if (pay) pay.href = pay.getAttribute('data-template').replace('{total}', String(total));
          var copy = $('[data-done-lines]', orderDone);
          copy.innerHTML = $('[data-summary-lines]', order).innerHTML;
          order.hidden = true;
          orderDone.hidden = false;
          orderDone.focus();
          orderDone.scrollIntoView({ block: 'start' });
        })
        .catch(function () {
          orderMailto.href = 'mailto:' + orderMailto.getAttribute('href').replace(/^mailto:/, '').split('?')[0] +
            '?subject=' + encodeURIComponent(data.get('_subject')) +
            '&body=' + encodeURIComponent(asText() + '\nTotal: ' + dollars(total) + '\n\n' + name + '\n' + val('o-email') + '\n' + val('o-phone') +
              (delivering ? '\n' + data.get('Delivery address') : '') + (val('o-notes') ? '\n\n' + val('o-notes') : ''));
          orderFailed.hidden = false;
          orderSubmit.disabled = false;
          orderSubmit.textContent = 'Place order';
        });
    });
  }

  /* ---------- Gentle fade-in as sections scroll into view ---------- */

  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('IntersectionObserver' in window && !calm) {
    var revealers = $$('.section-head, .dish-card, .service-pills, .ig-feed, .package, .step, .feature, .fact-row, .gallery-item, .home-quote-intro');
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        seen.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    revealers.forEach(function (el) {
      el.classList.add('reveal');
      seen.observe(el);
    });
  }

  /* ---------- Instagram feed (Behold), loaded when it's close to the screen ---------- */

  var behold = $('[data-behold]');
  if (behold) {
    var load = function () {
      var s = document.createElement('script');
      s.type = 'module';
      s.src = 'https://w.behold.so/widget.js';
      document.head.appendChild(s);
    };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) {
          io.disconnect();
          load();
        }
      }, { rootMargin: '600px' });
      io.observe(behold);
    } else {
      load();
    }
  }
})();
