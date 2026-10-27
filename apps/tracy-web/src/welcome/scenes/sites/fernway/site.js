/*
 * A homepage rebuilt as DOM in the JA Kinetic home layout: sticky header with logo, menu, sign in, primary
 * button and theme switch; grid-and-glow hero with a terminal-style panel; trusted-by strip; dark ticker band;
 * "(01)" bento; pricing; closing call to action; footer. Laid out for the 980 px browser panel of the Tracy app.
 *
 * Two contents fill the same layout:
 *   fernway  Fernway Studio, the site Customize makes (this file, from business.js),
 *   kinetic  JA Kinetic's own demo, the template homepage the Add site design system step previews (kinetic-demo.js).
 * Looks, chosen by a class on the frame (see site.css):
 *   fw-look-default  JA Kinetic's own tokens (Space Grotesk, IBM Plex Sans, JetBrains Mono, olive / lime),
 *   fw-look-system   the Figma design system from the dev library, worn through the same roles,
 *   fw-look-<id>     the systems the design system preview steps through before Figma (airbnb, eddie, motherduck, toggl, voiceflow, elevenlabs).
 * Light or dark follows <html data-theme>, as the Tracy app sets it.
 */
(function () {
  'use strict';
  var biz = window.TracyBusinesses && window.TracyBusinesses.fernway;
  if (!biz) return;
  var dir = (document.currentScript && /\/addsite\//.test(location.pathname) ? '../' : '') + 'sites/fernway/';
  var a = biz.answers;
  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  var ICON = {
    arrow: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>',
    caret: '<svg class="fw-caret" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5h6L5 7z"/></svg>',
    moon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 9.6A5.5 5.5 0 0 1 6.4 3 5.5 5.5 0 1 0 13 9.6Z"/></svg>',
    sun: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3"/></svg>',
    check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>',
    code: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 6-4 4 4 4M13 6l4 4-4 4"/></svg>',
    calendar: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12" rx="2"/><path d="M3 8.5h14M7 3v3M13 3v3"/></svg>',
    shield: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 16 5v4.5c0 3.8-2.6 6.6-6 8-3.4-1.4-6-4.2-6-8V5l6-2.5Z"/><path d="m7.5 10 1.8 1.8 3.4-3.6"/></svg>',
    pen: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13.5 3.5 16.5 6.5 7 16H4v-3l9.5-9.5Z"/></svg>'
  };
  var CARD_ICONS = [ICON.code, ICON.calendar, ICON.shield, ICON.pen];

  /* Fernway Studio: fictional client sites the studio looks after (.example addresses). */
  var FERNWAY = {
    name: a.name,
    logo: function (cls) {
      return '<span class="fw-logo ' + (cls || '') + '"><img class="fw-d-light" data-business-logo src="' + dir + 'brand/fernway-logo.svg" alt="' + esc(a.name) + '" decoding="sync" loading="eager">' +
        '<img class="fw-d-dark" src="' + dir + 'brand/fernway-logo-on-dark.svg" alt="' + esc(a.name) + '" decoding="sync" loading="eager"></span>';
    },
    nav: [['Home', true, true], ['Services', true], ['Work'], ['Care plans'], ['Studio', true]],
    signIn: 'Client login', headButton: 'Book a call',
    eyebrow: '// Web studio for growing businesses', title: 'Websites that grow with your business.',
    sub: 'We design, build and look after Joomla and WordPress sites, so your team can stay with your customers.',
    primary: 'Book a call', ghost: '<b>&gt;</b> See our work', trust: 'Looking after 140+ business sites',
    panelTitle: 'fernway monitor --clients',
    rows: [['harbordental.example', 'LIVE', '182ms', 'Menu updated', '2h ago'], ['northfieldbakery.example', 'LIVE', '141ms', 'New blog post', '5h ago'],
      ['copperleaflaw.example', 'LIVE', '203ms', 'Plugin updates', '9h ago'], ['meridianyoga.example', 'LIVE', '167ms', 'Booking page', '1d ago'],
      ['tidelineoutdoor.example', 'LIVE', '156ms', 'Backup checked', '1d ago']],
    panelFoot: '99.98% uptime · 30 days',
    clientsLabel: 'Trusted by businesses we build for',
    clients: ['Harbor Dental', 'Northfield Bakery', 'Copperleaf Law', 'Meridian Yoga', 'Tideline Outdoor', 'Alder &amp; Finch'],
    ticker: ['Joomla and WordPress', 'Monthly care plans', 'Daily backups', 'Security updates', '99.98% uptime', 'Replies in one business day'],
    servicesEyebrow: '(01) / What we do', servicesTitle: 'One studio for your whole website',
    servicesLead: 'No more chasing a freelancer, a host and a plugin vendor. Fernway builds the site, keeps it fast and safe, and makes your changes for you.',
    cards: [
      ['Builds', 'Joomla and WordPress builds', 'A site on the platform that fits your team, set up so anyone can edit a page without breaking the layout.', ['Joomla', 'WordPress', 'Your content', 'Your domain']],
      ['Care plans', 'Monthly care plans', 'Updates, backups and checks every month, with a short report you can read in two minutes.'],
      ['Speed and security', '&lt;1.2s', 'Median page load across the sites we look after, with security patches applied the day they ship.', null, true],
      ['Content updates', 'Send the change, we make it', 'New menu, new team photo, new opening hours. Most requests are live the same business day.', null, false,
        [['Done', 'Update spring menu prices'], ['Done', 'Add Dr. Lewis to the team page'], ['Today', 'Publish the June newsletter', true]]]
    ],
    pricingTitle: 'Care plans', pricingMeta: '3 plans · cancel any month',
    plans: [
      ['Starter', '$149', 'For a small site that needs to stay safe and current.', ['Updates and daily backups', 'Uptime watch, every minute', 'Two content edits a month', 'Email support'], 'Choose Starter', false],
      ['Growth', '$349', 'For a business that changes its site every week.', ['Everything in Starter', 'Speed checks every month', 'Eight content edits a month', 'A new page every quarter'], 'Choose Growth', true],
      ['Studio', '$790', 'For teams that want the studio on call.', ['Everything in Growth', 'Unlimited content edits', 'Priority phone line', 'Quarterly strategy review'], 'Talk to us', false]
    ],
    ctaEyebrow: '// Next step', ctaTitle: 'Tell us about your site.', ctaText: 'A 20 minute call, a clear plan and a fixed price within two days.',
    ctaPrimary: 'Book a call', ctaGhost: esc(biz.phone),
    about: a.about,
    columns: [['Services', ['Website builds', 'Care plans', 'Speed and security', 'Content updates']], ['Studio', ['Our work', 'About us', 'Client login']],
      ['Contact', [esc(biz.phone), esc(biz.email), '210 Market Street, Suite 400<br>Denver, CO 80202', esc(biz.hours)]]],
    base: ['© 2026 ' + esc(a.name), 'Privacy · Terms'],
    /* The Services page (round 42: the page scene 5 opens from the site's menu). Fictional, like the rest. */
    servicesPage: {
      eyebrow: '// Services', title: 'Everything your website needs, from one studio.',
      sub: 'Pick one service or let us run the whole site. Every plan comes with a named person who knows your business.',
      cards: [
        ['Website builds', 'From $4,900', 'A new Joomla or WordPress site, designed around your customers and ready to edit on day one.', ['Design and build in six weeks', 'Your content moved over', 'Training for your team']],
        ['Care plans', 'From $149 a month', 'Updates, backups and uptime checks every month, with a short report you can read in two minutes.', ['Daily backups', 'Security updates', 'A monthly report']],
        ['Speed and security', 'Audit in 5 days', 'We find what slows your site down or puts it at risk, then fix it in order of impact.', ['Page speed audit', 'Firewall and SSL', 'Fixes, not just a list']],
        ['Content updates', 'Same business day', 'Send the change by email or chat. New menu, new team photo, new opening hours: we make it live.', ['Text and photos', 'New pages', 'Seasonal offers']]
      ],
      stepsEyebrow: '(02) / How we work', stepsTitle: 'From first call to a site you can run',
      steps: [['01', 'Call', 'A 20 minute call about your goals and your current site.'], ['02', 'Plan', 'A clear plan and a fixed price within two days.'],
        ['03', 'Build', 'Weekly previews you can click through and comment on.'], ['04', 'Care', 'We look after the site once it is live, month after month.']]
    }
  };
  var bars = [5, 7, 6, 9, 8, 10, 7, 9, 11, 8, 10, 12, 9, 11, 16, 10, 12, 13];

  function header(c, current) {
    return '<header class="fw-header">' + c.logo() + '<nav>' + c.nav.map(function (item) {
      var on = current ? item[0] === current : item[2];
      return '<span data-fw-nav="' + item[0] + '"' + (on ? ' class="is-current"' : '') + '>' + item[0] + (item[1] ? ICON.caret : '') + '</span>';
    }).join('') + '</nav><span class="fw-header-end"><span class="fw-signin">' + c.signIn + '</span><span class="fw-btn fw-btn-primary fw-btn-sm">' + c.headButton + ICON.arrow + '</span>' +
      '<span class="fw-theme-btn" aria-hidden="true"><span class="fw-d-light">' + ICON.moon + '</span><span class="fw-d-dark">' + ICON.sun + '</span></span></span></header>';
  }
  function hero(c) {
    return '<section class="fw-hero"><div class="fw-hero-grid"><div class="fw-hero-copy">' +
      '<p class="fw-eyebrow">' + c.eyebrow + '</p><h1>' + c.title + '</h1><p class="fw-sub">' + c.sub + '</p>' +
      '<div class="fw-actions"><span class="fw-btn fw-btn-primary">' + c.primary + ICON.arrow + '</span><span class="fw-btn fw-btn-ghost">' + c.ghost + '</span></div>' +
      '<p class="fw-trust">' + c.trust + '</p></div><div class="fw-hero-visual">' + panel(c) + '</div></div></section>';
  }
  /* Kinetic's terminal panel: ink ground, mono rows, live dot, bar chart. */
  function panel(c) {
    return '<div class="fw-panel" data-site-monitor><div class="fw-panel-bar"><i></i><i></i><i></i><span>' + c.panelTitle + '</span><b class="fw-live">Live</b></div>' +
      '<div class="fw-panel-rows">' + c.rows.map(function (row) {
        return '<div class="fw-row"><span class="fw-row-site">' + row[0] + '</span><span class="fw-row-ok">' + row[1] + '</span><span class="fw-row-ms">' + row[2] + '</span><span class="fw-row-note">' + row[3] + ' <em>· ' + row[4] + '</em></span></div>';
      }).join('') + '</div><div class="fw-panel-foot"><span class="fw-bars">' + bars.map(function (h, i) { return '<i style="height:' + (h * 2) + 'px"' + (i === 14 ? ' class="is-peak"' : '') + '></i>'; }).join('') + '</span><span>' + c.panelFoot + '</span></div></div>';
  }
  function clientsStrip(c) {
    return '<section class="fw-clients"><p>' + c.clientsLabel + '</p><div>' + c.clients.map(function (name) { return '<span>' + name + '</span>'; }).join('') + '</div></section>';
  }
  function tickerBand(c) {
    return '<section class="fw-ticker"><b class="fw-live">Live</b>' + c.ticker.map(function (item, i) { return '<span' + (i % 2 ? ' class="is-bright"' : '') + '>' + item + '</span>'; }).join('<i>•</i>') + '</section>';
  }
  function services(c) {
    return '<section class="fw-section fw-services"><div class="fw-section-head"><div><p class="fw-eyebrow">' + c.servicesEyebrow + '</p><h2>' + c.servicesTitle + '</h2></div>' +
      '<p class="fw-section-lead">' + c.servicesLead + '</p></div><div class="fw-bento">' + c.cards.map(function (k, i) {
        var wide = i === 0 || i === 3;
        return '<article class="fw-card' + (wide ? ' fw-card-wide' : '') + '"><span class="fw-card-icon">' + CARD_ICONS[i] + '</span><p class="fw-card-label">' + k[0] + '</p><h3' + (k[4] ? ' class="fw-stat"' : '') + '>' + k[1] + '</h3><p>' + k[2] + '</p>' +
          (k[3] ? '<div class="fw-stack">' + k[3].map(function (s) { return '<span>' + s + '</span>'; }).join('') + '</div>' : '') +
          (k[5] ? '<div class="fw-requests">' + k[5].map(function (r) { return '<span' + (r[2] ? ' class="is-open"' : '') + '><b>' + r[0] + '</b> ' + r[1] + '</span>'; }).join('') + '</div>' : '') + '</article>';
      }).join('') + '</div></section>';
  }
  function pricing(c) {
    return '<section class="fw-section fw-pricing"><div class="fw-section-head fw-head-row"><h2><span class="fw-num">(02)</span> ' + c.pricingTitle + '</h2><p class="fw-meta">' + c.pricingMeta + '</p></div>' +
      '<div class="fw-plans">' + c.plans.map(function (p) {
        return '<article class="fw-plan' + (p[5] ? ' is-popular' : '') + '">' + (p[5] ? '<span class="fw-popular">Most popular</span>' : '') +
          '<h3>' + p[0] + '</h3><p class="fw-price"><b>' + p[1] + '</b><span>/ month</span></p><p class="fw-plan-lead">' + p[2] + '</p>' +
          '<ul>' + p[3].map(function (line) { return '<li>' + ICON.check + line + '</li>'; }).join('') + '</ul>' +
          '<span class="fw-btn ' + (p[5] ? 'fw-btn-primary' : 'fw-btn-ghost') + ' fw-btn-block">' + p[4] + '</span></article>';
      }).join('') + '</div></section>';
  }
  function cta(c) {
    return '<section class="fw-cta"><div><p class="fw-eyebrow">' + c.ctaEyebrow + '</p><h2>' + c.ctaTitle + '</h2><p>' + c.ctaText + '</p></div>' +
      '<div class="fw-actions"><span class="fw-btn fw-btn-primary">' + c.ctaPrimary + ICON.arrow + '</span><span class="fw-btn fw-btn-ghost">' + c.ctaGhost + '</span></div></section>';
  }
  function footer(c) {
    return '<footer class="fw-footer"><div class="fw-footer-brand">' + c.logo('fw-logo-sm') + '<p>' + esc(c.about) + '</p></div>' +
      c.columns.map(function (col, i) { return '<div' + (i === 2 ? ' class="fw-footer-contact"' : '') + '><h4>' + col[0] + '</h4>' + col[1].map(function (s) { return '<span>' + s + '</span>'; }).join('') + '</div>'; }).join('') +
      '<p class="fw-footer-base"><span>' + c.base[0] + '</span><span>' + c.base[1] + '</span></p></footer>';
  }

  /* The Services page: a page hero, four service cards with what each includes, the four steps of working together,
     the closing call to action and the footer, in the same roles and looks as the homepage. */
  function servicesPage(c) {
    var p = c.servicesPage;
    return header(c, 'Services') + '<main><section class="fw-hero fw-page-hero"><div class="fw-page-hero-in"><p class="fw-eyebrow">' + p.eyebrow + '</p><h1>' + p.title + '</h1><p class="fw-sub">' + p.sub + '</p>' +
      '<div class="fw-actions"><span class="fw-btn fw-btn-primary">' + c.primary + ICON.arrow + '</span><span class="fw-btn fw-btn-ghost">' + c.ghost + '</span></div></div></section>' +
      '<section class="fw-section fw-svc"><div class="fw-svc-grid">' + p.cards.map(function (k, i) {
        return '<article class="fw-card fw-svc-card"><span class="fw-card-icon">' + CARD_ICONS[i] + '</span><p class="fw-card-label">' + k[0] + '</p><h3>' + k[1] + '</h3><p>' + k[2] + '</p>' +
          '<ul>' + k[3].map(function (line) { return '<li>' + ICON.check + line + '</li>'; }).join('') + '</ul></article>';
      }).join('') + '</div></section>' +
      '<section class="fw-section fw-steps"><div class="fw-section-head"><div><p class="fw-eyebrow">' + p.stepsEyebrow + '</p><h2>' + p.stepsTitle + '</h2></div></div><ol class="fw-step-row">' + p.steps.map(function (st) {
        return '<li><span class="fw-num">' + st[0] + '</span><h3>' + st[1] + '</h3><p>' + st[2] + '</p></li>';
      }).join('') + '</ol></section>' + cta(c) + '</main>' + footer(c);
  }

  /* The looks a frame can wear: the template default, the applied system, and the systems browsed on the way to it. */
  var LOOKS = ['default', 'system', 'airbnb', 'eddie', 'motherduck', 'toggl', 'voiceflow', 'elevenlabs'];
  function applyLook(container, value) {
    var look = LOOKS.indexOf(value) >= 0 ? value : 'default';
    container.classList.add('fw-frame');
    LOOKS.forEach(function (name) { container.classList.toggle('fw-look-' + name, name === look); });
    container.dataset.look = look;
    var page = container.querySelector('.fernway-site');
    if (page) page.dataset.look = look;
    return look;
  }

  /* Builds a page into `container`. options.look: one of LOOKS; options.content: 'fernway' (default) or 'kinetic';
     options.page: 'home' (default) or 'services' (Fernway only). */
  function build(container, options) {
    var look = applyLook(container, options && options.look);
    var content = options && options.content === 'kinetic' && window.TracySiteContents && window.TracySiteContents.kinetic ? window.TracySiteContents.kinetic : FERNWAY;
    var page = document.createElement('div');
    page.className = 'fernway-site';
    page.dataset.business = content === FERNWAY ? biz.id : 'ja-kinetic-demo';
    page.dataset.look = look;
    page.dataset.page = options && options.page === 'services' && content.servicesPage ? 'services' : 'home';
    page.innerHTML = page.dataset.page === 'services' ? servicesPage(content) : header(content) + '<main>' + hero(content) + clientsStrip(content) + tickerBand(content) + services(content) + pricing(content) + cta(content) + '</main>' + footer(content);
    container.appendChild(page);
    return page;
  }

  window.TracySites = window.TracySites || {};
  window.TracySites.fernway = {
    id: biz.id,
    chipName: biz.slug,
    host: biz.host,
    tabTitle: biz.host,
    favicon: dir + 'brand/fernway-favicon.svg',
    /* The frame paints its own ground per look and theme (site.css, .fw-frame). */
    pageBackground: 'transparent',
    business: biz,
    look: 'system',
    looks: { default: 'JA Kinetic template default', system: biz.designSystem.name + ' design system' },
    buildHomepage: build,
    applyLook: applyLook,
    escape: esc,
    /* A short scroll from the hero down to the client strip, the ticker and the services heading, then back to the top, so
       the last frame of scene 5 matches the first frame of scene 6 (the same page at the top), then the hold. */
    scroll: { start: 800, duration: 1800, distance: 400, back: { start: 3500, duration: 1000 } }
  };
})();
