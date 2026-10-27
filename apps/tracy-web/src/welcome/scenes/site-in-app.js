/*
 * "Site X open in the Tracy app": the native workspace replay (same app view as the scene 2 and 3 endings),
 * pointed at one business site from the registry `window.TracySites` (see sites/<id>/site.js).
 *
 * Open it with engine.html?tab=2&site=<id>. The parent replay then drives it through
 * window.siteInAppReplay.render(time, theme); time 0 is the moment the app appears.
 *
 * A site config provides: id, chipName, host, favicon (url), buildHomepage(container) returning the
 * homepage root element, and optional scroll: {start, duration, distance, back}; back = {start, duration} eases
 * the page home to where it started, so the last frame can match a next scene that opens at the top. Another scene can reuse a
 * site by loading the same engine URL and calling window.TracySiteInApp.open(id, overrides).
 * Optional per open (overrides or URL): look (a key of site.looks, passed to buildHomepage as options.look)
 * and offset (pixels the page is already scrolled when the app appears; the scroll runs from there).
 */
(function () {
  'use strict';
  var query = new URLSearchParams(location.search), wanted = query.get('site');
  window.TracySites = window.TracySites || {};

  function ease(value) { var p = Math.max(0, Math.min(1, value)); return p * p * (3 - 2 * p); }

  /* Replace the visible text nodes of an element without touching its icons. */
  function setText(el, value) {
    if (!el) return;
    var done = false;
    Array.from(el.childNodes).forEach(function (node) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        node.textContent = done ? '' : value;
        done = true;
      }
    });
    if (!done) el.textContent = value;
  }

  function faviconImage(src, size) {
    var img = document.createElement('img');
    img.src = src; img.alt = ''; img.width = size; img.height = size;
    img.className = 'site-in-app-favicon'; img.decoding = 'sync'; img.loading = 'eager';
    return img;
  }

  function open(id, overrides) {
    var base = window.TracySites[id];
    if (!base) throw new Error('Unknown site: ' + id);
    var fromUrl = {};
    if (query.get('look')) fromUrl.look = query.get('look');
    if (query.get('offset')) fromUrl.offset = +query.get('offset') || 0;
    var site = Object.assign({}, base, fromUrl, overrides || {});
    var api = window.welcomeEngine;
    api.pause(true);
    api.seek(0);
    var root = document.querySelector('[data-hero-showcase]');
    root.classList.add('is-created-site', 'is-site-in-app', 'is-seeking');
    root.dataset.siteInApp = site.id;
    var workspace = root.querySelector('.hs3');

    /* Site chip, workspace subtitle, browser tab and address bar all carry the business address. */
    var chip = workspace.querySelector('.hs3-sitebtn');
    setText(chip, site.chipName);
    var chipName = chip.querySelector('.welcome-site-name');
    if (chipName) chipName.textContent = site.chipName;
    /* The chip's platform mark follows the site's platform (tch tracy-ui icons/platforms/light/joomla.svg). */
    var biz = window.TracyBusinesses && window.TracyBusinesses[site.id], mark = chip.querySelector('.hs3-wp');
    if (biz && biz.platform === 'Joomla' && mark) mark.innerHTML = '<path fill="#5091CD" d="M16.719 14.759L14.22 17.26l-2.37 2.37-.462.466c-1.368 1.365-3.297 1.83-5.047 1.397-.327 1.424-1.604 2.49-3.13 2.49C1.438 23.983 0 22.547 0 20.772c0-1.518 1.055-2.789 2.469-3.123-.446-1.76.016-3.705 1.396-5.08l.179-.18 2.37 2.37-.184.181c-.769.779-.769 2.024 0 2.789.771.78 2.022.78 2.787 0l.465-.465 2.367-2.371 2.502-2.506 2.368 2.372zm.924 6.652c-1.822.563-3.885.12-5.328-1.318l-.18-.185 2.365-2.369.18.184c.771.768 2.018.768 2.787 0 .765-.765.769-2.01-.004-2.781l-.466-.465-2.365-2.37-2.502-2.503 2.37-2.369 2.499 2.505 2.367 2.37.464.464c1.365 1.36 1.846 3.278 1.411 5.021 1.56.224 2.759 1.56 2.759 3.18 0 1.784-1.439 3.21-3.209 3.21-1.545 0-2.851-1.096-3.135-2.565l-.013-.009zM6.975 9.461l2.508-2.505 2.37-2.369.462-.461C13.74 2.7 15.772 2.251 17.58 2.79c.212-1.561 1.555-2.775 3.179-2.775 1.772 0 3.211 1.437 3.211 3.209 0 1.631-1.216 2.978-2.79 3.186.519 1.799.068 3.816-1.35 5.234l-.182.184-2.369-2.369.184-.184c.769-.77.769-2.016 0-2.783-.766-.766-2.011-.768-2.781.003l-.462.461-2.37 2.369-2.505 2.502-2.37-2.366zm-2.653 2.647l-.461-.462C2.43 10.215 1.986 8.17 2.529 6.358 1.1 6.029.03 4.754.03 3.224.03 1.454 1.47.015 3.24.015c1.596 0 2.92 1.166 3.17 2.691 1.73-.405 3.626.065 4.979 1.415l.184.185-2.37 2.37-.183-.181c-.77-.765-2.016-.765-2.785 0-.771.781-.77 2.025-.005 2.79l.465.466 2.37 2.369 2.505 2.505-2.367 2.37-2.51-2.505-2.371-2.37v-.012z"></path>';
    var subtitle = workspace.querySelector('.hs3-start-s');
    if (subtitle && subtitle.firstChild) subtitle.firstChild.textContent = site.host;
    var ws = workspace.querySelector('.hs3-ws span');
    if (ws) ws.textContent = site.host;
    workspace.querySelector('[data-welcome-tab-label]').textContent = site.tabTitle || site.host;
    workspace.querySelector('[data-welcome-tab-icon]').replaceChildren(faviconImage(site.favicon, 16));
    var url = workspace.querySelector('.hs3-url');
    url.querySelector(':scope > span').textContent = site.host;
    url.classList.add('has-site-favicon');
    url.insertBefore(faviconImage(site.favicon, 14), url.firstChild);

    /* The browser panel shows the business homepage, built as DOM by the site config. */
    var preview = workspace.querySelector('.hs3-frame');
    preview.replaceChildren();
    preview.classList.add('created-homepage', 'site-in-app-page');
    var page = site.buildHomepage(preview, { look: site.look });

    /* Same pointer glyph as the scene 3 ending: it settles near Edit and does not click. */
    var pointer = root.querySelector('.hs3-screen .hs-cursor') || workspace.closest('.hs-screen').querySelector('.hs-cursor');
    pointer.classList.add('is-on', 'no-move');
    pointer.style.opacity = '1';

    var style = document.createElement('style');
    style.textContent = '.is-site-in-app .welcome-conversation-header .hs3-sitebtn{max-width:100%}' +
      '.is-site-in-app .site-in-app-page{overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;background:' + (site.pageBackground || '#fff') + '}' +
      '.is-site-in-app .site-in-app-page::-webkit-scrollbar{display:none}' +
      '.is-site-in-app .hs3-url.has-site-favicon{gap:8px}.is-site-in-app .hs3-url .site-in-app-favicon{flex:none;width:14px;height:14px;border-radius:3px}' +
      '.is-site-in-app [data-welcome-tab-icon] .site-in-app-favicon{display:block;width:16px;height:16px;border-radius:3px}' +
      '.is-site-in-app .hs3-screen .hs-cursor{opacity:1!important;transition:none!important}';
    document.head.appendChild(style);

    var scroll = Object.assign({ start: 700, duration: 2000, distance: 260 }, site.scroll || {});
    var currentTime = 0;
    function render(time, theme) {
      currentTime = Math.max(0, +time || 0);
      api.setTheme(theme);
      api.snapCamera();
      var down = ease((currentTime - scroll.start) / scroll.duration), home = scroll.back ? ease((currentTime - scroll.back.start) / scroll.back.duration) : 0;
      preview.scrollTop = (site.offset || 0) + down * (1 - home) * scroll.distance;
      var target = workspace.querySelector('.hs3-edit');
      var win = root.querySelector('.hs-win');
      var a = win.getBoundingClientRect(), b = target.getBoundingClientRect();
      var scale = a.width / 1280;
      var endX = (b.left + b.width * .66 - a.left) / scale;
      var endY = (b.top + b.height * .74 - a.top) / scale;
      var progress = ease((currentTime - 250) / 1000);
      pointer.style.transform = 'translate(' + (endX + (1 - progress) * 130) + 'px,' + (endY + (1 - progress) * 185) + 'px)';
      return status();
    }
    function status() {
      var images = Array.from(preview.querySelectorAll('img'));
      return {
        time: currentTime, site: site.id, siteName: site.chipName, address: site.host, look: site.look || null,
        loaded: images.every(function (img) { return img.complete && img.naturalWidth > 0; }),
        images: images.length, scrollTop: preview.scrollTop,
        finalHold: currentTime >= scroll.start + scroll.duration, page: !!page
      };
    }
    Array.from(preview.querySelectorAll('img')).forEach(function (img) {
      img.addEventListener('load', function () { render(currentTime, document.documentElement.dataset.theme); });
    });
    window.siteInAppReplay = { site: site, render: render, status: status };
    render(0, document.documentElement.dataset.theme);
    return window.siteInAppReplay;
  }

  window.TracySiteInApp = { open: open };
  if (wanted) open(wanted);
})();
