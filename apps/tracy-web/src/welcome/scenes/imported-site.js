/* The end of scene 2 (round 43, owner): the imported site opens in its new tab and scene 1's edit runs on it, beat for beat
   and on scene 1's tempo, from scene 1's own module (js/hero-showcase-tab3.js through window.HeroShowcase.tab3Variant):
   Edit on, the headline picked, "Make this headline shorter" typed in the comment box, Ask Tracy to edit, Tracy's run in the
   chat, the new page with the shorter headline, the "Changed on the site" card and the change highlight on the changed
   headline, then a hold of about 1.5 s. There is no Undo here (stopAfterChange); scene 1 keeps its Undo.

   The imported site is the live tracy.ai home page (round 53, captured 25/10/2026 from https://tracy.ai/ at 1440 css px,
   DPR 2, full page, light and dark through the site's own tracy-theme setting, its hero demo parked on its opening frame and
   its progress line hidden), resized to 1960 px wide (2x the 979.5 px frame); img/imported-tracy/tracy-live-*.webp. The
   edited page is the same capture with the new headline set in the page itself (one line, so the page under it moves up as
   it would). Measures below are the page's own element boxes (page px) times the frame's scale. */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('imported') !== '1') return;
  var api = window.welcomeEngine, scene = window.HeroShowcase && window.HeroShowcase.editScene;
  if (!api || !scene) return;
  var siteName = 'tracy';
  var sourceHost = 'tracy.ai';
  /* Imports use BrowserPanel's copyUrl; this host follows the dev fleetLabel rule. */
  var copyHost = 'tracy-ai-8d6dffe7.tracy.site';
  var IMG = 'img/imported-tracy/';
  var K = 979.5 / 1440;                                     // the app's browser frame (979.5 px) over the 1440 px capture
  var KB = 699.5 / 1440;                                    // scene 1's block units (engine-adapter.js scales them by 980 / 699.5)
  function at(r, k) { return r.map(function (v) { return Math.round(v * (k || K) * 10) / 10; }); }
  function blocks(r) { return at(r, KB); }
  var OLD = 'A faster way to run your website on the CMS you already trust.', NEW = 'A faster way to run your website.';

  window.HeroShowcase.tab3Variant = {
    site: sourceHost, siteShort: siteName,
    oldH1: '"' + OLD + '"',
    reply: ['Done, the headline now reads "' + NEW + '" on the home page.', 'If you’d prefer the old wording back, just ask.'],
    what: 'Content · “Hero”',
    box: { eyebrow: blocks([614, 108, 212, 36]), head: blocks([266, 156, 908, 138]), para: blocks([300, 306, 840, 69]), start: blocks([558, 395, 168, 52]) },
    pinAt: at([270, 160]),
    highlight: '.imp-head',
    stopAfterChange: true,
    page: function () {
      var shot = function (name, cls) { return '<img class="imp-shot ' + cls + '" src="' + IMG + name + '" alt="" decoding="sync" loading="eager">'; };
      var head = at([266, 154, 908, 76]);                      // the changed (one line) headline, where the change highlight lights up
      return '<div class="imp-page" data-imported-homepage>' + shot('tracy-live-light.webp', 'is-light') + shot('tracy-live-dark.webp', 'is-dark') +
        '<div class="imp-after hs3-after">' + shot('tracy-live-after-light.webp', 'is-light') + shot('tracy-live-after-dark.webp', 'is-dark') + '</div>' +
        '<div class="imp-head" style="left:' + head[0] + 'px;top:' + head[1] + 'px;width:' + head[2] + 'px;height:' + head[3] + 'px"></div></div>';
    },
    decorate: function (root) {
      /* The address bar shows the copy's own address; the tab and the chat keep the source address. */
      var url = root.querySelector('.hs3-url > span'); if (url) url.textContent = copyHost;
      root.querySelectorAll('.hs3-tab img').forEach(function (img) { img.src = IMG + 'tracy-favicon.png'; });
    }
  };

  var root = document.querySelector('[data-hero-showcase]');
  root.classList.add('is-imported-site');
  var style = document.createElement('style');
  style.textContent = '.is-imported-site .welcome-conversation-header .hs3-sitebtn{max-width:100%}' +
    '.is-imported-site .imp-page{position:relative;width:100%}' +
    '.is-imported-site .imp-shot{display:block;width:100%;height:auto;max-width:none}' +
    '.is-imported-site .imp-after{position:absolute;left:0;top:0;width:100%;opacity:0}' +
    '.is-imported-site .hs3-frame.is-new .imp-after{opacity:1}' +
    '.is-imported-site .imp-shot.is-dark{display:none}' +
    ':root[data-theme="dark"] .is-imported-site .imp-shot.is-dark{display:block}:root[data-theme="dark"] .is-imported-site .imp-shot.is-light{display:none}' +
    '.is-imported-site .imp-head{position:absolute;pointer-events:none}' +
    /* The comment box opens under the headline and its marker sits on the headline's corner (engine-adapter.css places
       them for JA Kinetic). */
    '.is-imported-site .hs-win .hs3-cbox{left:' + at([268])[0] + 'px!important;top:' + at([300])[0] + 'px!important}' +
    '.is-imported-site [data-welcome-tab-icon] img{display:block;width:16px;height:16px;border-radius:3px}';
  document.head.appendChild(style);

  /* The Add site tab, inactive, left of the site's tab; the site's tab carries its favicon. Run after every rebuild. */
  function decorateStrip() {
    var workspace = root.querySelector('.hs3');
    if (!workspace) return;
    var siteTab = workspace.querySelector('[data-welcome-tab]:not([data-welcome-tab="add-site"])');
    if (!siteTab) return;
    if (!workspace.querySelector('[data-welcome-tab="add-site"]')) {
      siteTab.removeAttribute('data-welcome-tab-quiet');
      siteTab.insertAdjacentHTML('beforebegin', '<div role="tab" aria-selected="false" tabindex="-1" data-welcome-tab="add-site"><div data-welcome-tab-title>' +
        '<span data-welcome-tab-icon><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c-5 4-5 12 0 16M12 4c5 4 5 12 0 16"/></svg></span>' +
        '<span data-welcome-tab-label>Add site</span></div></div><div data-welcome-tab-slot></div>');
    }
    var icon = siteTab.querySelector('[data-welcome-tab-icon] img');
    if (icon && icon.getAttribute('src') !== IMG + 'tracy-favicon.png') icon.src = IMG + 'tracy-favicon.png';
  }

  /* Played from the parent replay: a jump (a seek) replays the scene deterministically; small steps play it forward
     frame by frame, the way scene 1 plays live. */
  var current = -1, theme = null;
  function render(time, value) {
    var t = Math.max(0, Math.min(scene.total, +time || 0));
    if (value !== theme) { theme = value; api.setTheme(value); }
    if (current < 0 || t < current || t - current > 250) api.seek(t);
    else { for (var s = current + 50; s < t; s += 50) scene.frame(s); scene.frame(t); api.snapCamera(); }
    current = t;
    decorateStrip();
    return status();
  }
  function status() {
    var frame = root.querySelector('.hs3-frame'), imgs = Array.from(root.querySelectorAll('.imp-shot'));
    var shown = imgs.filter(function (img) { return img.offsetParent && getComputedStyle(img).display !== 'none'; });
    return {
      time: current, total: scene.total, siteName: siteName, sourceHost: sourceHost, address: copyHost,
      loaded: imgs.every(function (img) { return img.complete && img.naturalWidth > 0; }),
      sharp: shown.map(function (img) { return { src: img.getAttribute('src'), natural: img.naturalWidth, shown: Math.round(img.getBoundingClientRect().width * 100) / 100 }; }),
      edited: !!(frame && frame.classList.contains('is-new')),
      typedInChat: (root.querySelector('.hs3-comp .hs3-ph') || {}).textContent || '',
      tabs: Array.from(root.querySelectorAll('.hs3 [data-welcome-tab]')).map(function (tab) { return { key: tab.dataset.welcomeTab, label: tab.textContent.trim(), active: tab.getAttribute('aria-selected') === 'true' }; }),
      finalHold: current >= scene.total - 1500
    };
  }
  window.importedSiteReplay = { render: render, status: status, total: scene.total };
  api.pause(true);
  Array.from(document.images).forEach(function (img) { img.addEventListener('load', function () { if (current >= 0) api.seek(current), decorateStrip(); }); });
  render(0, document.documentElement.dataset.theme);
})();
