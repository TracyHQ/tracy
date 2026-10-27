/**
 * Tracy — dark mode switcher.
 *
 * First paint is resolved server-side in index.php, so this file only handles what happens AFTER
 * paint: the toggle button, persistence, and following the OS while the visitor has not chosen.
 *
 * The hook is set three ways at once, the same three index.php emits, so a component that keys off
 * any of them stays in step: data-theme, the html.t4-dark class, and data-bs-theme.
 */
(function () {
  'use strict';

  var cfg = window.tracyTheme || { def: 'auto', enabled: true };
  var root = document.documentElement;
  var COOKIE = 'tracy-theme';

  function readCookie(name) {
    var parts = ('; ' + document.cookie).split('; ' + name + '=');
    return parts.length === 2 ? parts.pop().split(';').shift() : '';
  }

  function writeCookie(name, value) {
    // One year, root path. Secure only when the page itself is https, so it still works on a
    // local http build.
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + value + '; Max-Age=31536000; Path=/; SameSite=Lax' + secure;
  }

  function syncFrame(frame, theme) {
    try {
      var frameRoot = frame.contentDocument && frame.contentDocument.documentElement;
      if (!frameRoot) return;
      frameRoot.setAttribute('data-theme', theme);
      frameRoot.setAttribute('data-bs-theme', theme);
      frameRoot.classList.toggle('t4-dark', theme === 'dark');
    } catch (_) { /* External embeds own their theme. */ }
  }

  document.querySelectorAll('iframe.com-wrapper__iframe').forEach(function (frame) {
    frame.addEventListener('load', function () { syncFrame(frame, current()); });
  });

  function apply(theme) {
    document.querySelectorAll('iframe.com-wrapper__iframe').forEach(function (frame) { syncFrame(frame, theme); });
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-bs-theme', theme);
    root.classList.toggle('t4-dark', theme === 'dark');
    document.querySelectorAll('[data-tracy-theme-toggle]').forEach(function (btn) { btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false'); });
  }

  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  // Follow the OS only while the visitor has made no explicit choice.
  if (cfg.def === 'auto' && !readCookie(COOKIE) && window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var follow = function (e) { if (!readCookie(COOKIE)) apply(e.matches ? 'dark' : 'light'); };
    if (mq.addEventListener) { mq.addEventListener('change', follow); }
    else if (mq.addListener) { mq.addListener(follow); }
  }

  apply(current());
  document.querySelectorAll('.t4-offcanvas-toggle').forEach(function (btn) { btn.setAttribute('aria-label', 'Open menu'); });
  if (!cfg.enabled) { return; }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-tracy-theme-toggle]');
    if (!btn) { return; }
    e.preventDefault();

    var next = current() === 'dark' ? 'light' : 'dark';
    apply(next);
    writeCookie(COOKIE, next);
    btn.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
  });
})();
