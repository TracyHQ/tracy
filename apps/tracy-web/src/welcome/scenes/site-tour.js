/*
 * The end of scene 5 (round 42): the new site, opened from the ready screen's "Open your site in a new tab" link, is shown
 * off. Opt in with engine.html?...&tour=1 next to site=<id>; without it nothing here runs, so scene 7, which also opens
 * the site, keeps its own ending.
 *
 * It wraps window.siteInAppReplay.render (site-in-app.js) and drives, from the time alone so any seek draws the same frame:
 *   the Add site tab stays, inactive, left of the site's tab (as in the scene 2 ending);
 *   the pointer clicks Fullscreen: the chat column slides away and the browser fills the window;
 *   it clicks the site's own theme button twice: the site shows its other theme, then its own again (the app's theme);
 *   the home page scrolls down smoothly, the pointer clicks Services in the sticky header, the Services page opens
 *   (the address bar shows /services), scrolls a little, and the frame holds.
 * Pace: the shared pointer tempo (pointer.js TEMPO), the same as scene 1.
 *
 * The site's theme is made independent of the app's by rewriting the dark rules of the site's own stylesheet
 * (":root[data-theme=dark] X" becomes "[data-site-theme=dark][data-site-theme] X", the same specificity) and setting
 * data-site-theme on the browser pane.
 */
(function () {
  'use strict';
  var query = new URLSearchParams(location.search);
  if (query.get('tour') !== '1' || !window.siteInAppReplay) return;
  var base = window.siteInAppReplay, site = base.site, api = window.welcomeEngine;
  var root = document.querySelector('[data-hero-showcase]');
  var workspace = root.querySelector('.hs3'), pane = workspace.querySelector('.hs3-pane'), chat = workspace.querySelector('.hs3-chat');
  var preview = workspace.querySelector('.hs3-frame'), urlText = workspace.querySelector('.hs3-url > span');
  var pointer = root.querySelector('.hs3-screen .hs-cursor') || workspace.closest('.hs-screen').querySelector('.hs-cursor');
  var TP = window.WelcomePointer.TEMPO;

  /* Ms since the app appears (it fades in over the first 400). */
  var B = { full: 1500, theme1: 3400, theme2: 5300, scrollFrom: 5800, scrollTo: 7500, nav: 8600 };
  B.fullEnd = B.full + 250;
  B.swap = B.nav + 150; B.shown = B.swap + 200;
  B.pageScrollFrom = B.nav + 900; B.pageScrollTo = B.pageScrollFrom + 1000;
  B.hold = B.pageScrollTo + TP.READ;
  var HOME_SCROLL = 640, PAGE_SCROLL = 320;

  /* The site's dark rules answer to the pane's data-site-theme instead of the app's theme. */
  Array.from(document.styleSheets).forEach(function (sheet) {
    if (!/sites\/[^/]+\/site\.css/.test(sheet.href || '')) return;
    (function walk(rules) {
      Array.from(rules).forEach(function (rule) {
        if (rule.cssRules && !rule.selectorText) return walk(rule.cssRules);
        if (rule.selectorText && /data-theme=["']?dark/.test(rule.selectorText)) {
          rule.selectorText = rule.selectorText.replace(/:root\[data-theme=["']?dark["']?\]/g, '[data-site-theme="dark"][data-site-theme]');
        }
      });
    })(sheet.cssRules);
  });

  /* The Add site tab, inactive, left of the site's tab. */
  var siteTabEl = workspace.querySelector('[data-welcome-tab]');
  siteTabEl.removeAttribute('data-welcome-tab-quiet');
  siteTabEl.insertAdjacentHTML('beforebegin', '<div role="tab" aria-selected="false" tabindex="-1" data-welcome-tab="add-site"><div data-welcome-tab-title>' +
    '<span data-welcome-tab-icon><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c-5 4-5 12 0 16M12 4c5 4 5 12 0 16"/></svg></span>' +
    '<span data-welcome-tab-label>Add site</span></div></div><div data-welcome-tab-slot></div>');
  var fullBtn = workspace.querySelector('[data-welcome-tab-chrome] > button[aria-label="Fullscreen"]');

  var style = document.createElement('style');
  style.textContent = '.is-site-tour .hs3-frame>.fernway-site{transition:none}';
  document.head.appendChild(style);
  root.classList.add('is-site-tour');

  var PANE = { left: pane.offsetLeft, width: pane.offsetWidth }, FRAME = parseFloat(getComputedStyle(preview).width);
  var pageKind = 'home', currentTime = 0, plan = null, siteTheme = null;
  function ease(value) { var p = Math.max(0, Math.min(1, value)); return p * p * (3 - 2 * p); }
  function layout(p) {
    /* p = 0: the normal split; p = 1: the browser fills the window (1280 wide). */
    pane.style.left = (PANE.left * (1 - p)) + 'px';
    pane.style.width = (PANE.width + PANE.left * p) + 'px';
    preview.style.width = (FRAME + PANE.left * p) + 'px';
    chat.style.opacity = String(1 - p);
    chat.style.visibility = p >= 1 ? 'hidden' : '';
  }
  function showPage(kind) {
    if (kind === pageKind) return;
    preview.replaceChildren();
    site.buildHomepage(preview, { look: site.look, page: kind });
    pageKind = kind;
    preview.querySelectorAll('img').forEach(function (img) { img.addEventListener('load', redraw); });
  }
  function pointAt(el, box, scale) { var a = box.getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: (r.left + r.width / 2 - a.left) / scale, y: (r.top + r.height / 2 - a.top) / scale }; }
  function makePlan(scale) {
    /* The site's header is sticky and the same on both pages, so its targets do not depend on the page or its scroll. */
    var box = pointer.offsetParent || pointer.parentElement;
    layout(0);
    var fs = pointAt(fullBtn, box, scale);
    layout(1);
    var themeAt = pointAt(preview.querySelector('.fw-theme-btn'), box, scale);
    var nav = pointAt(preview.querySelector('[data-fw-nav="Services"]'), box, scale);
    var mid = pointAt(pane, box, scale);
    return window.WelcomePointer.plan([
      { t: 400, x: fs.x - 220, y: fs.y + 260 },
      { t: B.full, x: fs.x, y: fs.y, click: true },
      { t: B.theme1, x: themeAt.x, y: themeAt.y, click: true },
      { t: B.theme2, x: themeAt.x, y: themeAt.y, click: true },
      { t: B.scrollFrom - 100, x: mid.x + 120, y: mid.y + 60 },
      { t: B.nav, x: nav.x, y: nav.y, click: true },
      { t: B.nav + 900, x: nav.x + 40, y: nav.y + 160 }
    ]);
  }
  function render(time, theme) {
    base.render(time, theme);
    var t = currentTime = Math.max(0, +time || 0), app = theme === 'dark' ? 'dark' : 'light';
    /* The site's theme: its own (the app's), the other one between the two clicks on its theme button. */
    siteTheme = t >= B.theme1 && t < B.theme2 ? (app === 'dark' ? 'light' : 'dark') : app;
    pane.dataset.siteTheme = siteTheme;
    var win = root.querySelector('.hs-win'), scale = win.getBoundingClientRect().width / 1280;
    if (!plan || plan.scale !== scale) { plan = makePlan(scale); plan.scale = scale; }
    layout(ease((t - B.full) / (B.fullEnd - B.full)));
    showPage(t >= B.swap ? 'services' : 'home');
    var page = preview.querySelector('.fernway-site');
    page.style.opacity = t < B.nav ? '1' : t < B.swap ? String(1 - ease((t - B.nav) / (B.swap - B.nav))) : String(ease((t - B.swap) / (B.shown - B.swap)));
    preview.scrollTop = pageKind === 'home' ? HOME_SCROLL * ease((t - B.scrollFrom) / (B.scrollTo - B.scrollFrom)) : PAGE_SCROLL * ease((t - B.pageScrollFrom) / (B.pageScrollTo - B.pageScrollFrom));
    urlText.textContent = site.host + (pageKind === 'services' ? '/services' : '');
    window.WelcomePointer.drive(pointer, t, plan, Math.min(1.8, Math.max(1, .75 / scale)));
    return status();
  }
  /* An image or a font that lands later moves the header, so the pointer's targets are measured again. */
  function redraw() { plan = null; render(currentTime, document.documentElement.dataset.theme); }
  function status() {
    return Object.assign(base.status(), {
      tour: { full: pane.offsetLeft === 0 && chat.style.visibility === 'hidden', siteTheme: siteTheme, page: pageKind, url: urlText.textContent,
        scrollTop: preview.scrollTop, beats: Object.assign({}, B),
        tabs: Array.from(workspace.querySelectorAll('[data-welcome-tab]')).map(function (tab) { return { key: tab.dataset.welcomeTab, label: tab.textContent.trim(), active: tab.getAttribute('aria-selected') === 'true' }; }),
        finalHold: currentTime >= B.pageScrollTo }
    });
  }
  preview.querySelectorAll('img').forEach(function (img) { img.addEventListener('load', redraw); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
  window.siteTour = { render: render, status: status, beats: B };
  window.siteInAppReplay = { site: site, render: render, status: status };
  api.pause(true);
  redraw();
})();
