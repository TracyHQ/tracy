/* Reflow captured header slots instead of retaining a clipped model measurement. */
(function () {
  'use strict';
  var root = document.querySelector('[data-hero-showcase]');
  var templateSite = root.querySelector('.hs3-sitebtn').cloneNode(true);
  var templateTools = root.querySelector('.hs3-hdr-tools').cloneNode(true);
  var favicon = root.querySelector('.hs3-tab img').cloneNode(true);
  favicon.className = 'welcome-site-favicon';

  function mountHeader(host, site, tools, captured) {
    var row = document.createElement('div');
    row.className = 'welcome-conversation-header' + (captured ? ' is-captured' : '');
    Array.from(site.childNodes).forEach(function (node) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return;
      var name = document.createElement('span');
      name.className = 'welcome-site-name';
      name.textContent = node.textContent;
      node.replaceWith(name);
    });
    row.append(site, tools);
    host.append(row);
  }

  function normalizeHeaders() {
    /* Captured comments use absolute nested boxes, including a zero-width label. */
    root.querySelectorAll('.hs4-s51:has(.hs4-s52):not([data-welcome-header])').forEach(function (host) {
      host.dataset.welcomeHeader = 'true';
      var site = templateSite.cloneNode(true);
      var tools = templateTools.cloneNode(true);
      tools.querySelector('.hs3-chip').textContent = host.querySelector('.hs4-s53').textContent;
      var label = Array.from(host.querySelectorAll('.hs4-s31')).find(function (node) {
        return node.textContent.trim() !== 'WordPress';
      });
      Array.from(site.childNodes).forEach(function (node) {
        if (node.nodeType === Node.TEXT_NODE && label) node.textContent = label.textContent;
      });
      Array.from(host.children).slice(0, 2).forEach(function (node) {
        node.classList.add('welcome-captured-header-slot');
      });
      mountHeader(host, site, tools, true);
    });

    root.querySelectorAll('.hs3-chat:has(> .hs3-sitebtn)').forEach(function (host) {
      mountHeader(host, host.querySelector('.hs3-sitebtn'), host.querySelector('.hs3-hdr-tools'), false);
    });
    /* The ownership replay copied the SVG inline and lost its dark media rule. */
    root.querySelectorAll('.hs5-tab[data-tab="browser"] .hs5-tic > svg').forEach(function (icon) {
      icon.replaceWith(favicon.cloneNode(true));
    });
  }
  /* Seeking rebuilds the source scenes, so apply the same normalization to new trees. */
  new MutationObserver(normalizeHeaders).observe(root, { childList: true, subtree: true });
  normalizeHeaders();
})();
