/**
 * Tracy — dark mode switcher.
 *
 * First paint is resolved server-side in index.php, so this file only handles what happens AFTER
 * paint: the toggle button, persistence, and following the OS while the visitor has not chosen.
 *
 * The hook is set three ways at once, the same three index.php emits, so a component that keys off
 * any of them stays in step: data-theme, the html.t4-dark class, and data-bs-theme.
 *
 * `?theme=dark|light` on the address wins for THIS load, over the cookie, the site default and the
 * OS, and is never saved. It is how Tracy's Design inspiration preview, which frames the site from
 * another origin, shows the theme it was asked for: it cannot reach this cookie, and an iframe's
 * color-scheme does not change what the framed page reads as the OS preference (measured).
 * index.php applies it before paint; this file keeps it, so no OS change takes it back. Only a
 * click on the toggle writes the cookie.
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

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-bs-theme', theme);
    root.classList.toggle('t4-dark', theme === 'dark');
  }

  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  // The theme the address asks for, or ''.
  function asked() {
    try {
      var m = /[?&]theme=(dark|light)(?:&|#|$)/.exec(window.location.search || '');
      return m ? m[1] : '';
    } catch (e) { return ''; }
  }

  var askedTheme = asked();
  if (askedTheme) { apply(askedTheme); }

  // Follow the OS only while the visitor has made no explicit choice and the address asks for none.
  if (!askedTheme && cfg.def === 'auto' && !readCookie(COOKIE) && window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var follow = function (e) { if (!readCookie(COOKIE)) { apply(e.matches ? 'dark' : 'light'); } };
    if (mq.addEventListener) { mq.addEventListener('change', follow); }
    else if (mq.addListener) { mq.addListener(follow); }
  }

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
