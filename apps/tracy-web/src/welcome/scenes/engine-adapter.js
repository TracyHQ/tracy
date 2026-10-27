/* Welcome mounting, a deterministic review API, and full-app sizing. */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var engine = window.HeroShowcase.control;
  var root = document.querySelector('[data-hero-showcase]');
  var win = root.querySelector('.hs-win');
  var theme = params.get('theme') || 'light';
  var motion = params.get('motion') || 'full';
  var ready = params.get('ready') === '1';
  var appW = 1280;
  var camera = { x: 0, y: 0, scale: 1 };
  var lastMessage = 0;
  var rasterMarks = [];
  /* Deterministic replay must measure final layout, not pending entrance effects. */
  var nativeAnimate = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    var animation = nativeAnimate.call(this, frames, options);
    if (root.classList.contains('is-seeking') && animation.effect && Number.isFinite(animation.effect.getComputedTiming().endTime)) animation.finish();
    return animation;
  };
  root.querySelectorAll('img').forEach(function (img) {
    if (img.closest('.welcome-kinetic')) return;
    var name = img.src.split('/').pop();
    var isPage = /home-page.webp$/.test(name);
    var isMobile = /home-mobile-(dark-)?page.webp$/.test(name);
    var isHome = /preview-ja-kinetic-home(-dark)?.webp$/.test(name);
    if (!isPage && !isMobile && !isHome) return;
    var mark = document.createElement('span');
    mark.className = 'welcome-raster-comma'; mark.textContent = ',';
    img.parentElement.insertBefore(mark, img.nextSibling);
    rasterMarks.push({ img: img, mark: mark, x: isMobile ? 262 : 124, y: isMobile ? 625 : isPage ? 354 : 436, w: isMobile ? 26 : 21, h: isMobile ? 32 : 26, size: isMobile ? 28 : 20, dark: /dark/.test(name) });
  });
  function positionRasterMarks() {
    rasterMarks.forEach(function (item) {
      var img = item.img, mark = item.mark;
      if (!img.naturalWidth || !img.offsetWidth) return;
      var style = getComputedStyle(img);
      var factor = img.offsetWidth / img.naturalWidth;
      if (style.objectFit === 'cover') factor = Math.max(factor, img.offsetHeight / img.naturalHeight);
      Object.assign(mark.style, { left: (img.offsetLeft + item.x * factor) + 'px', top: (img.offsetTop + item.y * factor) + 'px', width: item.w * factor + 'px', height: item.h * factor + 'px', fontSize: item.size * factor + 'px', lineHeight: item.h * factor + 'px', transform: style.transform, opacity: style.opacity, color: item.dark ? '#a1a1a1' : '#535953', background: item.dark ? '#0c100d' : '#f9fcf5' });
    });
  }
  /* The source replay has no collapsed-sidebar state. Reflow its columns,
     keeping native UI text/control sizes and widening only layout boxes. */
  var siteScale = 980 / 699.5;
  function px(el, name) { return parseFloat(el.style[name]) || 0; }
  function widenChildren(el, oldWidth, delta) {
    Array.from(el.children).forEach(function (child) {
      if (child.tagName === 'SVG' || child.tagName === 'PATH') return;
      var left = px(child, 'left'), w = px(child, 'width');
      if (w > oldWidth * .68) {
        child.style.width = (w + delta) + 'px';
        widenChildren(child, w, delta);
      } else if (left > oldWidth * .60) child.style.left = (left + delta) + 'px';
    });
  }
  function collapseSnapshot(host) {
    if (!host) return;
    Array.from(host.querySelectorAll('[style]')).forEach(function (el) {
      var left = px(el, 'left'), width = px(el, 'width'), height = px(el, 'height');
      if (left === 0 && width >= 280 && width <= 281 && height === 696) {
        el.classList.add('welcome-hidden-sidebar');
      } else if (left === 280 && width >= 299 && width <= 301 && height >= 648) {
        el.style.left = '0px';
      } else if (left >= 580 && left <= 581 && width >= 699 && width <= 700 && height >= 648) {
        el.style.left = '300px'; el.style.width = '980px'; widenChildren(el, width, 980 - width);
      }
    });
  }
  root.querySelectorAll('.hs2-shell').forEach(collapseSnapshot);
  root.querySelectorAll('.hs2-panel > .hs2-scr').forEach(function (scr) {
    /* These copied panel trees carry an app wrapper offset by -581px. */
    scr.querySelectorAll('[style]').forEach(function (el) {
      if (px(el, 'left') === -581 && px(el, 'width') === 1280) el.style.left = '-300px';
    });
    collapseSnapshot(scr);
  });
  ['start', 'comments', 'rightD', 'team'].forEach(function (name) {
    collapseSnapshot(root.querySelector('[data-hs4-l="' + name + '"]'));
  });
  root.querySelectorAll('[data-hs4-l="popB"] > *,[data-hs4-l="popC"] > *').forEach(function (el) {
    el.style.left = (300 + 18 * siteScale) + 'px';
    el.style.top = (83 + 227 * siteScale) + 'px';
  });
  var own = root.querySelector('.hs5');
  if (own) {
    var chat = root.querySelector('.hs3-chat').cloneNode(true);
    chat.classList.add('welcome-ownership-chat'); own.insertBefore(chat, own.firstChild);
    /* Replace whole-panel rasters with native layout so tables use freed width. */
    var sites = own.querySelector('[data-v="sites"]');
    sites.querySelector('img').classList.add('welcome-hidden-raster');
    var rows = [
      ['kinetic-demo.tracy.ai', 'Live', 'W', 'only you', '8 hours ago'],
      ['northwind-cafe.tracy.ai', 'Draft', 'J', 'only you', '3 days ago'],
      ['atlas-legal.tracy.ai', 'Draft', 'J', 'only you', '3 days ago'],
      ['field-notes.tracy.ai', 'Draft', 'E', '2', '11 days ago'],
      ['harbor-dental.tracy.ai', 'Draft', 'J', 'only you', '21 days ago'],
      ['pine-and-co.tracy.ai', 'Draft', 'J', 'only you', '21 days ago'],
      ['bloom-studio.tracy.ai', 'Live', 'W', '7', '37 days ago']
    ];
    sites.insertAdjacentHTML('afterbegin', '<div class="welcome-sites"><header><strong>Your sites</strong><span>＋ Add sites</span></header><table><thead><tr><th>Site</th><th>CMS</th><th>Role</th><th>Team</th><th>Created</th><th></th></tr></thead><tbody>' + rows.map(function (r, i) {
      return '<tr' + (!i ? ' class="is-current"' : '') + '><td>' + r[0] + ' <small class="' + r[1].toLowerCase() + '">● ' + r[1] + '</small>' + (!i ? ' <small>● Managing</small>' : '') + '</td><td><b class="welcome-cms">' + r[2] + '</b></td><td><small class="welcome-owner">Owner</small></td><td>♧ ' + r[3] + '</td><td>' + r[4] + '</td><td><span class="welcome-row-more"' + (!i ? ' data-welcome-more' : '') + '>•••</span></td></tr>';
    }).join('') + '</tbody></table></div>');
    var changes = own.querySelector('img[data-v="changes"]');
    changes.classList.add('welcome-hidden-raster');
    var changesView = document.createElement('div'); changesView.className = changes.className.replace('welcome-hidden-raster', '') + ' welcome-changes';
    changesView.innerHTML = '<header><strong>kinetic-demo.tracy.ai⌄</strong><span>Create a backup</span></header><div class="welcome-changes-in"><div class="welcome-changes-tools">3 changes by people and Tracy <span>Jump to backup⌄ &nbsp; Type: People and Tracy⌄</span></div><table><thead><tr><th>Description</th><th>Time</th><th>Type</th><th>By</th></tr></thead><tbody><tr><td colspan="4"><strong>Fri, Oct 23</strong></td></tr><tr><td>Updated “Terminal”<small>1 post</small></td><td>29 min ago</td><td>Comment ↗</td><td>● maya</td></tr><tr><td colspan="4"><strong>Thu, Oct 22</strong></td></tr><tr><td>Applied the design system “Notion · notio...”<small>1 setting · 2 files</small></td><td>8h ago</td><td>Design system</td><td>● maya</td></tr><tr><td>Updated 2 content actions and 1 settings ...<small>2 content actions · 1 settings action</small></td><td>8h ago</td><td>Tracy setup</td><td>● maya</td></tr><tr class="welcome-backup"><td><strong>Initial backup, site as built</strong><small>Full backup &nbsp; The site as it was handed over</small></td><td>8h ago</td><td>Backup</td><td>Agent</td></tr></tbody></table><p>ⓘ Chat turns recorded since Oct 23. Earlier moments show without the words typed.</p><p>ⓘ WordPress admin edits are tracked. Last checked just now.</p></div>';
    changes.insertAdjacentElement('afterend', changesView);
    new MutationObserver(function () { changesView.classList.toggle('is-on', changes.classList.contains('is-on')); }).observe(changes, { attributes: true, attributeFilter: ['class'] });
  }
  /* Current web DockKit strip, shared by native and captured replay scenes. */
  var tabGlyph = function (path) { return '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true">' + path + '</svg>'; };
  var tabChevron = tabGlyph('<path d="M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6" stroke="currentColor"/>');
  var tabPlus = tabGlyph('<path d="M8 2V14M2 8H14" stroke="currentColor"/>');
  var tabClose = tabGlyph('<path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" stroke="currentColor"/>');
  var tabSplit = tabGlyph('<rect x="1.5" y="1.5" width="13" height="13" rx="1" stroke="currentColor"/><path d="M8 1.5V14.5" stroke="currentColor"/>');
  var tabEscape = function (value) { var el = document.createElement('span'); el.textContent = value; return el.innerHTML; };
  var tabChrome = Array.from(root.querySelectorAll('.hs3-tabr > i')).map(function (control, index) {
    return '<button type="button" aria-label="' + (index ? 'Collapse panel' : 'Fullscreen') + '">' + control.innerHTML + '</button>';
  }).join('');
  function renderTabStrip(host, tabs) {
    host.setAttribute('data-welcome-tab-strip', '');
    host.setAttribute('role', 'tablist');
    host.innerHTML = '<div data-welcome-tab-run>' + tabs.map(function (tab, index) {
      return (index ? '<div data-welcome-tab-slot></div>' : '') + '<div role="tab" aria-selected="' + tab.active + '" tabindex="' + (tab.active ? '0' : '-1') + '" data-welcome-tab="' + tab.key + '"' + (!tab.closable && tabs.length === 1 ? ' data-welcome-tab-quiet' : '') + '><div data-welcome-tab-title>' + (tab.key === 'browser' ? '<button type="button" aria-label="Switch site" data-welcome-site-switch>' + tabChevron + '</button>' : '') + '<span data-welcome-tab-icon' + (tab.key === 'browser' ? ' class="hs3-tab"' : '') + '>' + tab.icon + '</span><span data-welcome-tab-label>' + tabEscape(tab.title) + '</span></div>' + (tab.closable ? '<button type="button" aria-label="Close tab" data-welcome-tab-close>' + tabClose + '</button>' : '') + '</div>';
    }).join('') + '</div><button type="button" aria-label="New tab" data-welcome-add-tab>' + tabPlus + '</button><div data-welcome-tab-fill></div><button type="button" aria-label="Split pane" data-welcome-tab-split>' + tabSplit + '</button><div data-welcome-tab-chrome>' + tabChrome + '</div>';
    measureTabStrip(host);
    var positions = {};
    host.querySelectorAll('[data-welcome-tab]').forEach(function (tab) { positions[tab.dataset.welcomeTab] = tab.offsetLeft + tab.offsetWidth / 2; });
    return { plusX: host.querySelector('[data-welcome-add-tab]').offsetLeft, tabX: positions };
  }
  function measureTabStrip(host) {
    host.querySelectorAll('[data-welcome-tab-title]').forEach(function (title) { title.toggleAttribute('data-welcome-tab-clipped', title.scrollWidth > title.clientWidth); });
  }
  function syncNativeTabStrips() { root.querySelectorAll('.hs3-tabrow:not([data-welcome-tab-strip])').forEach(function (row) {
    var tab = row.querySelector('.hs3-tab');
    renderTabStrip(row, [{ key: 'browser', title: tab.querySelector('span:last-child').textContent, icon: tab.querySelector('img').outerHTML, active: true, closable: false }]);
  }); }
  syncNativeTabStrips();
  root.querySelectorAll('[data-hs4-l="rightD"], [data-hs4-l="team"]').forEach(function (layer) {
    var backing = layer.querySelector('.hs4-s98'), row = backing.firstElementChild;
    var favicon = row.querySelector('img').outerHTML;
    var tabs = [{ key: 'browser', title: 'fernway.tracy.ai', icon: favicon, active: layer.dataset.hs4L !== 'team', closable: false }];
    if (layer.dataset.hs4L === 'team') tabs.push({ key: 'team', title: 'Team · fernway.tracy.ai', icon: row.querySelector('.hs4-s141 svg').outerHTML, active: true, closable: true });
    renderTabStrip(row, tabs);
    row.style.left = '0px'; row.style.top = '0px'; row.style.width = '100%'; row.style.height = '38px';
    var body = row.nextElementSibling;
    if (body) { body.style.top = '38px'; body.style.height = '658px'; }
  });
  window.welcomeSyncTabStrip = function (source) {
    var bar = source.parentElement, host = bar.querySelector('[data-welcome-tab-strip]');
    if (!host) { host = document.createElement('div'); bar.appendChild(host); }
    var tabs = Array.from(source.querySelectorAll('.hs5-tab')).map(function (tab) {
      return { key: tab.dataset.tab, title: tab.querySelector('.hs5-tt').textContent, icon: tab.querySelector('.hs5-tic').innerHTML, active: tab.classList.contains('is-on'), closable: tab.dataset.tab !== 'browser' };
    });
    return renderTabStrip(host, tabs);
  };
  root.querySelectorAll('.hs5-tabs').forEach(window.welcomeSyncTabStrip);

  function alignSiteTargets() {
    root.querySelectorAll('.hs3-box').forEach(function (el) {
      if (!el.dataset.welcomeGeometry) el.dataset.welcomeGeometry = JSON.stringify([px(el, 'left'), px(el, 'top'), px(el, 'width'), px(el, 'height')]);
      var g = JSON.parse(el.dataset.welcomeGeometry);
      Object.assign(el.style, { left: g[0] * siteScale + 'px', top: g[1] * siteScale + 'px', width: g[2] * siteScale + 'px', height: g[3] * siteScale + 'px' });
    });
    root.querySelectorAll('[data-hs4="out-me"],[data-hs4="out-d"],[data-hs4="out-l"]').forEach(function (el) {
      var site = el.closest('[data-hs4-l]').querySelector('.welcome-kinetic');
      if (!site) return;
      var copy = site.querySelector('.welcome-kinetic-copy'), p = el.offsetParent;
      if (!p || !copy.getClientRects().length) return;
      var a = p.getBoundingClientRect(), b = copy.getBoundingClientRect(), scale = camera.scale || 1;
      Object.assign(el.style, { left: (b.left-a.left)/scale + 'px', top:(b.top-a.top)/scale + 'px', width:b.width/scale+'px', height:b.height/scale+'px' });
    });
  }
  window.welcomeMapPointer = function (box, x, y) {
    if (box.classList.contains('hs3-screen') || box.querySelector('.hs3')) {
      if (x >= 580 && y >= 93) return [300 + (x + 6 - 580) * siteScale - 6, 83 + (y + 6 - 93) * siteScale - 6];
      return [x >= 280 ? x - 280 : x, y];
    }
    if (box.querySelector('.hs5')) {
      /* Keep global dialogs fixed; pane rows move with the shorter strip. */
      if (x > 1000 && y > 100) return [x, y - 10];
      if (x < 100) return [x, y];
      return [x - 280.5, y];
    }
    return [x, y];
  };
  function clamp(v, low, high) { return Math.max(low, Math.min(high, v)); }
  function status() {
    return Object.assign(engine.state(), { theme: theme, motion: motion, ready: ready, camera: Object.assign({}, camera) });
  }
  function announce() {
    window.parent.postMessage(Object.assign({ type: 'welcome-engine-state' }, status()), '*');
  }
  function setTheme(value) {
    theme = value === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
  }
  function snapCamera() {
    syncNativeTabStrips();
    camera.scale = root.getBoundingClientRect().width / appW;
    win.style.transform = 'scale(' + camera.scale + ')';
    engine.scale(camera.scale);
    alignSiteTargets();
    root.querySelectorAll('[data-welcome-tab-strip]').forEach(measureTabStrip);
    return status().camera;
  }
  function frame(now) {
    positionRasterMarks();
    alignSiteTargets();
    if (now - lastMessage > 500) { lastMessage = now; announce(); }
    requestAnimationFrame(frame);
  }
  function setTab(index) {
    engine.pause(true);
    engine.show(clamp(Math.floor(+index || 0), 0, 4));
    root.classList.toggle('is-still', motion === 'reduced' || ready);
    if (motion === 'reduced' || ready) engine.seek(engine.state().still);
    engine.pause(motion === 'reduced' || ready);
    snapCamera(); announce();
  }
  function seek(time) { engine.pause(true); root.classList.add('is-seeking'); engine.seek(+time || 0); snapCamera(); announce(); return status(); }
  window.welcomeEngine = {
    status: status, seek: seek, renderFrame: seek,
    pause: function (value) { engine.pause(value === undefined ? true : !!value); announce(); },
    restart: function () { setTab(engine.state().tab); }, setTab: setTab,
    setTheme: function (value) { setTheme(value); announce(); },
    setMotion: function (value) { motion = value === 'reduced' ? 'reduced' : 'full'; setTab(engine.state().tab); },
    snapCamera: snapCamera
  };
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent || !event.data || event.data.type !== 'welcome-engine-command') return;
    var data = event.data, api = window.welcomeEngine;
    if (data.command === 'pause') api.pause(data.value);
    else if (data.command === 'seek') api.seek(data.value);
    else if (data.command === 'theme') api.setTheme(data.value);
    else if (data.command === 'motion') api.setMotion(data.value);
    else if (data.command === 'restart') api.restart();
  });
  setTheme(theme);
  setTab(ready ? 2 : params.get('tab'));
  addEventListener('resize', snapCamera);
  requestAnimationFrame(frame);
})();
