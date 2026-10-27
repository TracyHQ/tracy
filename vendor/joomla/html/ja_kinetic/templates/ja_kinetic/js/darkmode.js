/* Kinetic dark-mode toggle wirer (vega standard). Pre-paint resolver runs in <head>
 * (index.php). This only wires the .kinetic-theme-toggle buttons + persists the cookie. */
(function () {
  'use strict';
  var COOKIE = 'ja_kinetic-theme';
  var cfg = window.jaKineticTheme || { def: 'auto', enabled: true };

  function setCookie(v) {
    var d = new Date(); d.setTime(d.getTime() + 365 * 864e5);
    document.cookie = COOKIE + '=' + v + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
  }
  function isDark() { return document.documentElement.classList.contains('t4-dark'); }
  function apply(theme) {
    var el = document.documentElement;
    if (theme === 'dark') { el.classList.add('t4-dark'); }
    else { el.classList.remove('t4-dark'); }
    el.setAttribute('data-theme', theme);
    el.setAttribute('data-bs-theme', theme);
    document.querySelectorAll('.kinetic-theme-toggle').forEach(function (b) {
      b.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    });
  }
  function toggle() {
    var next = isDark() ? 'light' : 'dark';
    if (cfg.enabled) setCookie(next);
    apply(next);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.kinetic-theme-toggle');
    if (t) { e.preventDefault(); toggle(); }
  });
  // OS-follow when in auto mode and no explicit cookie
  if (cfg.def === 'auto' && window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (ev) {
        if (!/(^|;)\s*ja_kinetic-theme=/.test(document.cookie)) apply(ev.matches ? 'dark' : 'light');
      });
    } catch (e) {}
  }
  document.addEventListener('DOMContentLoaded', function () { apply(isDark() ? 'dark' : 'light'); });

  /* ---- mobile off-canvas drawer (self-contained, no vendor) ---- */
  function drawer() { return document.getElementById('kinetic-drawer'); }
  function overlay() { return document.querySelector('.kinetic-oc-overlay'); }
  function openOC() {
    var d = drawer(), o = overlay(); if (!d) return;
    d.classList.add('is-open'); d.setAttribute('aria-hidden', 'false');
    if (o) { o.hidden = false; }
    document.body.classList.add('kinetic-oc-lock');
    document.querySelectorAll('.t4-offcanvas-toggle').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
  }
  function closeOC() {
    var d = drawer(), o = overlay(); if (!d) return;
    d.classList.remove('is-open'); d.setAttribute('aria-hidden', 'true');
    if (o) { o.hidden = true; }
    document.body.classList.remove('kinetic-oc-lock');
    document.querySelectorAll('.t4-offcanvas-toggle').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    resetDrill();
  }

  /* ---- drilldown sub-level (slide-in, not accordion) ----
   * The drawer menu is a raw mod_menu. BS5 dropdown (data-bs-toggle) would
   * inline-expand it (accordion). We strip that and drive a slide-in drill:
   * tapping a grouped row hides the top-level list and slides in its children
   * as a full panel with a "< Back + group name" header; Back returns. */
  function eachDrawerDrill(fn) {
    var d = drawer(); if (!d) return;
    var nav = d.querySelector('nav.navbar') || d.querySelector('.navbar');
    if (nav) fn(d, nav);
  }
  function resetDrill() {
    eachDrawerDrill(function (d, nav) {
      nav.classList.remove('is-drilling');
      nav.querySelectorAll('.dropdown-menu.is-drilled').forEach(function (m) { m.classList.remove('is-drilled'); });
    });
  }
  /* Map href(pathname) -> mega COLUMN title (PLATFORM / CONTENT / DISCOVER …) from
   * the desktop megamenu, which IS rendered in-page. The drawer is a flat mod_menu
   * without those column headings; we reproject them onto the drill panels so the
   * mobile drilldown shows the same group sub-labels as the design. */
  function normHref(h) {
    if (!h) return '';
    try { return new URL(h, location.origin).pathname.replace(/\/$/, ''); } catch (e) { return h; }
  }
  // Find the desktop mega panel for a top-level group (matched by its NAME text —
  // parent items carry href="#", so href matching is unreliable) and return its
  // columns IN ORDER as [{title, hrefs:[...]}]. The drawer lists the same items but
  // in flat menu order, so we use this to regroup + label them.
  function megaColumnsFor(groupName) {
    var want = (groupName || '').trim().toLowerCase(), panel = null;
    document.querySelectorAll('.t4-megamenu li').forEach(function (li) {
      if (panel) return;
      var a = li.querySelector(':scope > a');
      if (a && (a.textContent || '').trim().toLowerCase() === want) {
        var p = li.querySelector('.mega-dropdown-menu, .dropdown-menu');
        if (p && p.querySelector('.mega-col-title')) panel = p;
      }
    });
    if (!panel) return [];
    var cols = [];
    panel.querySelectorAll('.mega-col-nav, .mega-inner').forEach(function (col) {
      var t = col.querySelector('.mega-col-title');
      if (!t) return;
      var title = (t.textContent || '').trim();
      var hrefs = [].slice.call(col.querySelectorAll('a[href]')).map(function (a) { return normHref(a.getAttribute('href')); });
      if (title && hrefs.length) cols.push({ title: title, hrefs: hrefs });
    });
    return cols;
  }

  function initDrill() {
    eachDrawerDrill(function (d, nav) {
      if (nav.dataset.kineticDrill) return;      // wire once
      nav.dataset.kineticDrill = '1';
      // stop BS5 from hijacking the toggles into an inline accordion
      nav.querySelectorAll('[data-bs-toggle]').forEach(function (a) { a.removeAttribute('data-bs-toggle'); });

      var groups = nav.querySelectorAll('li.parent > ul.dropdown-menu, li.deeper > ul.dropdown-menu');
      groups.forEach(function (menu) {
        var li = menu.parentElement;
        var toggle = li.querySelector(':scope > a');
        if (!toggle) return;
        var name = (toggle.textContent || '').trim();

        // inject the "< Back + group name" header once
        if (!menu.querySelector('.kinetic-drill-back')) {
          var back = document.createElement('button');
          back.type = 'button';
          back.className = 'kinetic-drill-back';
          back.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"></polyline></svg><span>' + name.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>';
          menu.insertBefore(back, menu.firstChild);
          back.addEventListener('click', function (e) {
            e.preventDefault();
            menu.classList.remove('is-drilled');
            if (!nav.querySelector('.dropdown-menu.is-drilled')) nav.classList.remove('is-drilling');
          });
        }

        // regroup the flat drawer children into the desktop mega COLUMNS and prepend a
        // sub-label (PLATFORM / CONTENT / DISCOVER) per column — only when the group
        // actually spans 2+ columns. Reorder so each column's rows are contiguous.
        if (!menu.dataset.kineticSublabels) {
          menu.dataset.kineticSublabels = '1';
          var cols = megaColumnsFor(name);
          if (cols.length > 1) {
            var rowByHref = {};
            [].slice.call(menu.querySelectorAll(':scope > li')).forEach(function (row) {
              var a = row.querySelector(':scope > a[href]');
              if (a) rowByHref[normHref(a.getAttribute('href'))] = row;
            });
            var used = {};
            cols.forEach(function (col) {
              var colRows = col.hrefs.filter(function (h) { return rowByHref[h] && !used[h]; });
              if (!colRows.length) return;
              var lab = document.createElement('div');
              lab.className = 'kinetic-drill-sublabel';
              lab.textContent = col.title;
              menu.appendChild(lab);
              colRows.forEach(function (h) { menu.appendChild(rowByHref[h]); used[h] = 1; });
            });
            // any rows not in a mega column keep their order at the end (no label)
            [].slice.call(menu.querySelectorAll(':scope > li')).forEach(function (row) {
              var a = row.querySelector(':scope > a[href]');
              var h = a ? normHref(a.getAttribute('href')) : null;
              if (!h || !used[h]) menu.appendChild(row);
            });
          }
        }

        toggle.addEventListener('click', function (e) {
          e.preventDefault();
          nav.classList.add('is-drilling');
          menu.classList.add('is-drilled');
          if (d.scrollTo) d.scrollTo(0, 0); else d.scrollTop = 0;
        });
      });
    });
  }
  document.addEventListener('DOMContentLoaded', initDrill);
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.t4-offcanvas-toggle')) { e.preventDefault(); openOC(); return; }
    if (e.target.closest && e.target.closest('.js-offcanvas-close')) { e.preventDefault(); closeOC(); return; }
    if (e.target.classList && e.target.classList.contains('kinetic-oc-overlay')) { closeOC(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOC(); });
})();
