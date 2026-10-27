/*
 * The base of scenes 7 (Site changes) and 8 (Publish): Fernway Studio as scenes 5 and 6 left it (look
 * "system", the Figma design system, the hero headline Tracy shortened after Maya's comment), open in
 * the Tracy app. A scene adds its own tab and page, then hands this base its timeline:
 *
 *   var scene = WelcomeSiteTab.open();
 *   var tab = scene.addTab('changes', scene.ICON.listChecks, 'Site changes · fernway.tracy.ai');
 *   scene.run({ total, clicks: [{ t, el(), fx, fy, hover }], render(t), status(t) });
 *
 * The replay owns its clock and is seekable: render(t) draws the exact frame of time t. The pointer is
 * the shared one (pointer.js drive()), planned from the click list: it rests REST_ON ms on each
 * target before it presses (round 46: 0.6 to 0.8 s), glides GLIDE ms, rings on every click.
 */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  function lucide(body) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>'; }
  /* Lucide icons, as the components import them (lucide-react). */
  var ICON = {
    listChecks: lucide('<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>'),
    globe: lucide('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'),
    chevDown: lucide('<path d="m6 9 6 6 6-6"/>'),
    chevRight: lucide('<path d="m9 18 6-6-6-6"/>'),
    more: lucide('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
    rotate: lucide('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>'),
    download: lucide('<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>'),
    archive: lucide('<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>'),
    info: lucide('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
    chat: lucide('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
    comment: lucide('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 8H7"/><path d="M17 12H7"/>'),
    chatPlus: lucide('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v6"/><path d="M9 10h6"/>'),
    palette: lucide('<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'),
    rocket: lucide('<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>'),
    external: lucide('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
    database: lucide('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>'),
    lock: lucide('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    copy: lucide('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>'),
    pencil: lucide('<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'),
    bulb: lucide('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>'),
    spin: lucide('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>'),
    circleCheck: lucide('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
    close: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" stroke="currentColor"/></svg>'
  };
  /* Scene 1's tempo (pointer.js TEMPO) with round 46's rest: REST_ON ms on a target before each click,
     READ ms on every new state, OPEN ms from a press to the overlay it opens, WORK ms for a short wait. */
  var TP = window.WelcomePointer ? window.WelcomePointer.TEMPO : {};
  var PACE = { REST_ON: 700, GLIDE: TP.GLIDE || 320, READ: TP.READ || 1500, OPEN: 400, WORK: 800, TYPE: TP.TYPE || 55 };
  PACE.GAP = PACE.READ + PACE.GLIDE + PACE.REST_ON;

  function open() {
    var native = window.welcomeEngine;
    var replay = window.TracySiteInApp.open('fernway', { look: 'system', scroll: { start: 0, duration: 1, distance: 0 } });
    var site = replay.site, biz = site.business || window.TracyBusinesses.fernway;
    /* Scene 6 asked Tracy to make the hero headline shorter; this is the site after that edit. */
    var headline = document.querySelector('.hs3-frame .fw-hero h1');
    if (headline) headline.textContent = 'Sites that grow with you.';
    var root = document.querySelector('[data-hero-showcase]');
    root.classList.add('is-site-tab-scene');
    var app = root.querySelector('.hs3'), win = root.querySelector('.hs-win');
    var pane = app.querySelector('.hs3-pane');
    var strip = pane.querySelector('[data-welcome-tab-strip]'), run = strip.querySelector('[data-welcome-tab-run]');
    var browserTab = strip.querySelector('[data-welcome-tab="browser"]');
    var pointer = app.closest('.hs-screen').querySelector('.hs-cursor');
    pointer.classList.add('stp-pointer');
    var tabs = [['browser', browserTab]];
    var theme = params.get('theme') || 'light', motion = params.get('motion') || 'full';

    function addTab(key, icon, title) {
      var slot = document.createElement('div'); slot.setAttribute('data-welcome-tab-slot', ''); slot.hidden = true;
      var tab = document.createElement('div');
      tab.setAttribute('role', 'tab'); tab.dataset.welcomeTab = key; tab.dataset.siteTab = key; tab.hidden = true;
      tab.innerHTML = '<div data-welcome-tab-title><span data-welcome-tab-icon aria-hidden="true">' + icon + '</span><span data-welcome-tab-label>' + title + '</span></div><button type="button" data-welcome-tab-close aria-label="Close tab">' + ICON.close + '</button>';
      run.appendChild(slot); run.appendChild(tab);
      tabs.push([key, tab]);
      return { tab: tab, slot: slot, show: function (on) { tab.hidden = slot.hidden = !on; } };
    }
    function selectTab(key) {
      tabs.forEach(function (pair) { pair[1].setAttribute('aria-selected', String(pair[0] === key)); pair[1].tabIndex = pair[0] === key ? 0 : -1; });
    }
    /* A page in the browser panel's place, under the tab strip. */
    function addPage(className) {
      var page = document.createElement('section');
      page.className = 'stp ' + className; page.hidden = true;
      pane.appendChild(page);
      return page;
    }
    function point(el, fx, fy) {
      var a = win.getBoundingClientRect(), b = el.getBoundingClientRect(), s = a.width / 1280;
      return [(b.left + b.width * (fx === undefined ? .5 : fx) - a.left) / s, (b.top + b.height * (fy === undefined ? .55 : fy) - a.top) / s];
    }
    /* The Site changes card on the start screen and Publish in the browser toolbar (dsh-better-sidebar SiteToolbarButtons). */
    var changesCard = Array.from(app.querySelectorAll('.hs3-card')).find(function (el) { return el.textContent.trim() === 'Site changes'; });
    var publishButton = Array.from(app.querySelectorAll('.hs3-bar .hs3-tbt')).find(function (el) { return el.textContent.trim() === 'Publish'; });

    /* run: total ms, clicks [{t, el: () => element, fx, fy, hover: true for a rest without a press}],
       render(t) draws the scene's own state, status(t) adds the scene's own fields. */
    function runScene(spec) {
      var total = spec.total, current = 0, paused = true, last = 0, announced = 0;
      var W = window.WelcomePointer, plan = null, planKey = '';
      function hoverOf(t) {
        /* The control under the resting pointer shows its hover look from the moment it is reached. */
        var on = null;
        spec.clicks.forEach(function (c) { var from = c.hover ? c.t : c.t - (c.lead || PACE.REST_ON); if (t >= from && t < c.t + (c.hover ? 1e9 : 60)) on = c; });
        return on;
      }
      function draw(t) {
        current = Math.max(0, Math.min(total, +t || 0));
        replay.render(0, theme);
        spec.render(current, hoverOf(current));
      }
      function pointerPlan() {
        var key = theme + ':' + win.getBoundingClientRect().width;
        if (plan && planKey === key) return plan;
        var keep = current, start = spec.start || { x: 1130, y: 610 };
        var path = [{ t: 0, x: start.x, y: start.y }];
        spec.clicks.forEach(function (c) {
          draw(c.t - 1);
          var xy = point(c.el(), c.fx, c.fy);
          /* A rest without a press (hover) is reached at its t; a click ARRIVES lead ms before its t. */
          path.push(c.hover ? { t: c.t, x: xy[0], y: xy[1] } : { t: c.t, x: xy[0], y: xy[1], click: true, lead: c.lead || PACE.REST_ON });
        });
        plan = W.plan(path);
        planKey = key; draw(keep);
        return plan;
      }
      function render(time) {
        var p = pointerPlan();
        draw(time);
        W.drive(pointer, current, p, Math.min(1.8, Math.max(1, .75 / (win.getBoundingClientRect().width / 1280))));
        return status();
      }
      function status() {
        var active = strip.querySelector('[aria-selected="true"]');
        return Object.assign({
          tab: 2, time: current, total: total, duration: total, still: total, paused: paused, theme: theme, motion: motion,
          camera: native.status().camera, site: site.id, siteName: biz.answers.name, address: site.host,
          activeTab: active && active.dataset.welcomeTab, clicks: spec.clicks.filter(function (c) { return !c.hover; }).map(function (c) { return c.t; }),
          plan: (plan || []).map(function (p) { return { t: p.t, arrive: p.arrive, start: p.start, click: p.click, x: Math.round(p.x), y: Math.round(p.y) }; }),
          ended: current >= total, loaded: replay.status().loaded
        }, spec.status ? spec.status(current) : {});
      }
      function announce() { parent.postMessage(Object.assign({ type: 'welcome-engine-state' }, status()), '*'); }
      function seek(t) { paused = true; render(t); announce(); return status(); }
      function setTheme(value) { theme = value === 'dark' ? 'dark' : 'light'; native.setTheme(theme); plan = null; render(current); announce(); }
      function restart() { render(motion === 'reduced' ? total : 0); paused = motion === 'reduced'; last = performance.now(); announce(); }
      window.welcomeEngine = {
        status: status, seek: seek, renderFrame: seek,
        pause: function (value) { paused = value === undefined ? true : !!value; last = performance.now(); announce(); },
        restart: restart, setTab: restart, setTheme: setTheme,
        snapCamera: function () { native.snapCamera(); render(current); return status().camera; },
        setMotion: function (value) { motion = value === 'reduced' ? 'reduced' : 'full'; restart(); }
      };
      function tick(now) {
        if (!paused) { render(current + Math.max(0, now - (last || now))); if (current >= total) paused = true; }
        last = now;
        if (now - announced > 250) { announced = now; announce(); }
        requestAnimationFrame(tick);
      }
      addEventListener('resize', function () { native.snapCamera(); plan = null; render(current); });
      setTheme(theme); restart(); requestAnimationFrame(tick);
      return { render: render, status: status };
    }
    return {
      ICON: ICON, PACE: PACE, site: site, biz: biz, host: site.host, root: root, app: app, win: win, pane: pane,
      browserTab: browserTab, changesCard: changesCard, publishButton: publishButton,
      addTab: addTab, addPage: addPage, selectTab: selectTab, point: point, run: runScene,
      header: function (action) {
        return '<div class="stp-head"><span class="stp-picker">' + biz.answers.name + ICON.chevDown + '</span>' + (action || '') + '</div>';
      }
    };
  }
  window.WelcomeSiteTab = { open: open, ICON: ICON, PACE: PACE };
})();
