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
        bar.hidden = false;
      }
      $$('[data-holiday-only]').forEach(function (el) { el.hidden = false; });
      $$('[data-holiday-link]').forEach(function (el) { el.classList.add('is-season'); });
    }

    var status = $('[data-holiday-status]');
    if (status) {
      var shown = state === 'during' && !ordersOpen && override !== 'on' ? 'after' : state;
      status.setAttribute('data-state', shown);
      $('.status-text', status).textContent = status.getAttribute('data-' + shown);
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
        var top = tabsWrap.getBoundingClientRect().top + window.scrollY - header.offsetHeight + 1;
        if (window.scrollY > top) window.scrollTo({ top: top });
      }
      if (opts.focus) tabs.filter(function (t) { return t.getAttribute('data-menu-tab') === id; })[0].focus();
      return true;
    };

    var fromHash = function () {
      var id = location.hash.slice(1);
      if (id === 'allergies') return;
      if (!select(id)) select(tabs[0].getAttribute('data-menu-tab'));
    };
    fromHash();
    if (location.hash && location.hash !== '#allergies') {
      // Land on the tabs, not on the (now hidden) panel's old position.
      requestAnimationFrame(function () {
        var top = tabsWrap.getBoundingClientRect().top + window.scrollY - header.offsetHeight;
        window.scrollTo({ top: top });
      });
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

    // Arriving from the holiday page: pick "Holiday order" and note the package.
    var eventKey = params.get('event');
    if (eventKey) {
      var option = $('option[data-key="' + eventKey.replace(/[^a-z-]/g, '') + '"]', form);
      if (option) option.selected = true;
    }
    var pkg = params.get('package');
    var packages = {};
    try { packages = JSON.parse(form.getAttribute('data-packages') || '{}'); } catch (e) { /* ignore */ }
    if (pkg && packages[pkg]) {
      // Pre-fill the message with the package and a line for each choice.
      var message = $('#f-message', form);
      var lines = ['I’d like to order ' + packages[pkg].name + '.', ''];
      (packages[pkg].picks || []).forEach(function (p) { lines.push(p + ': '); });
      lines.push('Pickup or delivery (and where): ');
      if (message && !message.value) message.value = lines.join('\n');
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
