/* The one pointer of every scene: scene 1's round dot (pointer.css) and scene 1's tempo.
   Two ways to move it, same look and same numbers:
   - create(): live, for the scripted engine scenes (1, 6 and the imported workspace): a CSS glide
     to each target and a WAAPI click ring.
   - drive(): deterministic, for the seekable replays (Add site scenes 2 to 5, publish scene 7):
     position and click ring computed from the scene time, so a seek draws the exact frame.
   Tempo, measured on scene 1 (js/hero-showcase-tab3.js): the pointer starts its glide MOVE ms
   before a click, glides linearly and lands ARRIVE ms before the click, rests at least REST ms
   after a click before it moves again (CLICK_GAP click to click), types at TYPE ms a character,
   and an automatic step stays at least STEP ms. A long glide never goes faster than MAX_SPEED. */
(function () {
  'use strict';
  var T = { MOVE: 400, GLIDE: 320, ARRIVE: 80, REST: 1500, CLICK_GAP: 1900, TYPE: 55, STEP: 900, READ: 1500, RING: 450, PRESS: 90, MAX_SPEED: 1700 };
  var HTML = '<span class="hs-cursor"><span class="hs-aura"></span><span class="hs-halo"></span><span class="hs-dot"></span></span>';
  function glideMs(dist) { return Math.max(T.GLIDE, Math.round(dist / T.MAX_SPEED * 1000)); }
  /* cubic-bezier(.2,.8,.2,1), the click ring's curve. */
  function ringEase(u) {
    var x1 = .2, y1 = .8, x2 = .2, y2 = 1, lo = 0, hi = 1, s = u;
    for (var i = 0; i < 24; i++) { s = (lo + hi) / 2; var x = 3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s; if (x < u) lo = s; else hi = s; }
    return 3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s;
  }
  /* The click highlight, the same in every scene: the dot presses in (0.85 over PRESS ms) and springs back, and a two-tone
     ripple (terracotta ring with a thin white edge, pointer.css .hs-ripple) grows from about 15px to 44px over RING ms while it
     fades. With reduced motion the ripple shows still, full size, for RING ms, and the dot does not move. */
  var counter = { clicks: 0, ripples: 0 };
  function reducedMotion() {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).get('motion') === 'reduced'; } catch (e) { return false; }
  }
  function ringFrames(inv) {
    if (reducedMotion()) return [{ transform: 'translate(-50%,-50%) scale(' + inv + ')', opacity: .85 }, { transform: 'translate(-50%,-50%) scale(' + inv + ')', opacity: .85 }];
    return [{ transform: 'translate(-50%,-50%) scale(' + (.35 * inv) + ')', opacity: 1 }, { offset: .4, transform: 'translate(-50%,-50%) scale(' + (.86 * inv) + ')', opacity: .7 }, { transform: 'translate(-50%,-50%) scale(' + inv + ')', opacity: 0 }];
  }
  /* Dot scale u ms after a click: down to 0.85 in PRESS ms, then a short damped spring back to 1. */
  function pressScale(u) {
    if (u < 0) return 1;
    if (u < T.PRESS) return 1 - .15 * (u / T.PRESS);
    var v = u - T.PRESS; return 1 - .15 * Math.exp(-v / 60) * Math.cos(v / 38);
  }
  function makeRipple(cur, id) {
    var ring = document.createElement('span');
    ring.className = 'hs-ring hs-ripple';
    ring.dataset.ripple = id;
    cur.insertBefore(ring, cur.firstChild);
    counter.ripples++;
    return ring;
  }
  function pressDot(cur, scale, inv) {
    cur.querySelectorAll('.hs-dot, .hs-halo').forEach(function (el) { el.style.transform = scale === 1 ? '' : 'translate(-50%,-50%) scale(' + (scale * inv) + ')'; });
  }
  /* Live pointer: cur is the .hs-cursor element, box the 1280 x 696 window it moves in. */
  function create(cur, box, o) {
    var firstMove = true, scaleOf = o.scale, invOf = o.inv || function () { return 1; };
    var p = {
      el: cur,
      tick: function () {},
      to: function (x, y, jump, mapped) {
        if (window.welcomeMapPointer && !mapped) { var point = window.welcomeMapPointer(box, x, y); x = point[0]; y = point[1]; }
        var from = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(cur.style.transform || ''), dist = from ? Math.hypot(x - +from[1], y - +from[2]) : 0;
        var ms = glideMs(dist);
        if (!jump && firstMove) { cur.style.transition = 'none'; cur.style.transform = 'translate(' + (x + 24) + 'px,' + (y + 20) + 'px)'; void cur.offsetWidth; firstMove = false; }
        if (jump) firstMove = true; else cur.classList.add('is-on');
        cur.style.transition = 'opacity 120ms linear, transform ' + ms + 'ms linear';
        cur.classList.toggle('no-move', !!jump);
        cur.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        if (jump) { void cur.offsetWidth; cur.classList.remove('no-move'); }
      },
      /* Onto the middle of el (an element inside box), nudged by dx, dy. */
      on: function (el, dx, dy) {
        var a = box.getBoundingClientRect(), r = el.getBoundingClientRect(), scale = scaleOf();
        p.to((r.left - a.left + r.width / 2) / scale - 6 + (dx || 0), (r.top - a.top + r.height / 2) / scale - 6 + (dy || 0), false, true);
      },
      click: function () {
        cur.classList.add('is-on');
        counter.clicks++;
        var inv = invOf(), ring = makeRipple(cur, 'live-' + counter.clicks);
        var anim = ring.animate(ringFrames(inv), { duration: T.RING, easing: 'linear' });
        anim.onfinish = function () { ring.remove(); };
        if (!reducedMotion()) cur.querySelectorAll('.hs-dot, .hs-halo').forEach(function (el) {
          var k = function (s) { return { transform: 'translate(-50%,-50%) scale(' + (s * inv) + ')' }; };
          el.animate([k(1), k(.85), k(1.03), k(1)], { duration: 300, easing: 'ease-out' });
        });
      }
    };
    return p;
  }
  /* Deterministic pointer. path: [{t, x, y, click, lead?}] in time order (lead = ms the pointer rests on the target before a click, default ARRIVE), x/y = the pointer's centre in window
     pixels. A click point is reached ARRIVE ms before its t and rings at t; a plain point is reached at t.
     Each glide is linear and lasts glideMs(distance). Before the first point the pointer is hidden. */
  function plan(path) {
    var out = [];
    path.forEach(function (p, i) {
      var prev = out[i - 1], arrive = p.click ? p.t - (p.lead || T.ARRIVE) : p.t, dist = prev ? Math.hypot(p.x - prev.x, p.y - prev.y) : 0;
      out.push({ t: p.t, x: p.x, y: p.y, click: !!p.click, arrive: arrive, start: prev ? Math.max(prev.t + (prev.click ? 0 : 0), arrive - glideMs(dist)) : arrive, dist: dist });
    });
    counter.plan = out;
    return out;
  }
  function at(planned, t) {
    if (!planned.length || t < planned[0].start) return null;
    var i = 0; while (i + 1 < planned.length && t >= planned[i + 1].start) i++;
    var p = planned[i], prev = planned[i - 1];
    if (!prev || t >= p.arrive) return { x: p.x, y: p.y, index: i };
    var k = Math.max(0, Math.min(1, (t - p.start) / Math.max(1, p.arrive - p.start)));
    return { x: prev.x + (p.x - prev.x) * k, y: prev.y + (p.y - prev.y) * k, index: i };
  }
  function drive(cur, t, planned, inv) {
    var pos = at(planned, t);
    cur.classList.add('is-driven');
    if (!pos) { cur.classList.remove('is-on'); cur.style.opacity = '0'; return null; }
    cur.classList.add('is-on'); cur.style.opacity = '1';
    cur.style.transform = 'translate(' + (pos.x - 6) + 'px,' + (pos.y - 6) + 'px)';
    var ring = cur.querySelector('.hs-ring'), live = null, reduced = reducedMotion();
    planned.forEach(function (p) { if (p.click && t >= p.t && t < p.t + T.RING) live = p; });
    if (live) {
      if (ring && ring.dataset.ripple !== 'plan-' + live.t) { ring.remove(); ring = null; }
      if (!ring) ring = makeRipple(cur, 'plan-' + live.t);
      /* The ring grows on the ease curve and fades linearly over RING ms, so it is still clear halfway through. */
      var u = (t - live.t) / T.RING, e = ringEase(u), s = (reduced ? 1 : .35 + .65 * e) * (inv || 1);
      ring.style.transform = 'translate(-50%,-50%) scale(' + s + ')'; ring.style.opacity = String(reduced ? .85 : 1 - u);
      pressDot(cur, reduced ? 1 : pressScale(t - live.t), inv || 1);
    } else { if (ring) ring.remove(); pressDot(cur, 1, inv || 1); }
    return { x: pos.x, y: pos.y, clicking: !!live };
  }
  /* Change highlight, reusable by any scene: lights up the box of an element that just changed (same family as the click
     ripple: terracotta edge, thin white outer edge, light tint). u = ms since the change; drawn from u alone, so a seek draws the
     exact frame. Fades in over 150 ms, holds 700 ms, fades out over 500 ms; with reduced motion a still outline for 850 ms. */
  var HL = { IN: 150, HOLD: 700, OUT: 500 };
  function highlight(el, u) {
    if (!el) return 0;
    var mark = el.querySelector(':scope > .hs-change-hl'), end = HL.IN + HL.HOLD + HL.OUT, reduced = reducedMotion(), o = 0;
    if (u >= 0 && u < (reduced ? HL.IN + HL.HOLD : end)) o = reduced ? 1 : u < HL.IN ? u / HL.IN : u < HL.IN + HL.HOLD ? 1 : 1 - (u - HL.IN - HL.HOLD) / HL.OUT;
    if (!o) { if (mark) mark.remove(); return 0; }
    if (!mark) { mark = document.createElement('span'); mark.className = 'hs-change-hl'; mark.setAttribute('aria-hidden', 'true'); el.appendChild(mark); }
    mark.style.opacity = String(o);
    return o;
  }
  window.WelcomePointer = { TEMPO: T, HTML: HTML, glideMs: glideMs, create: create, plan: plan, at: at, drive: drive, ringFrames: ringFrames, pressScale: pressScale, counter: counter, highlight: highlight, HIGHLIGHT: HL };
})();
