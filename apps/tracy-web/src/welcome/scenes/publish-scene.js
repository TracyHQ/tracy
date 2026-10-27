/*
 * Scene 8 "Publish when you are ready": engine.html?tab=2&publish=1, the popup's last scene. Fernway
 * Studio open in the Tracy app; Publish in the browser toolbar opens the site's Publish tab, the step
 * wizard of tch origin/develop (777d51c3ff and its follow-ups), walked as an Owner of a site built in
 * Tracy walks it: Choose how › Tracy address › Your domain (packages/core/tracy-core/src/site-tabs/publish/plan.ts
 * stepsFor: an Owner, not imported, connect-domain on: kind, address, domain).
 *
 *   tab header      site-tabs/SiteScreen.tsx:226 + pieces.tsx TabHeader (65-90), no action on Publish
 *   wizard root     publish/PublishWizard.tsx PublishFlow (254-300): .tas-root.tas-wizard-card.tv-pub-wizard
 *   step bar        wizard-shell/steps.tsx WizardSteps (24-79), words flow.steps / flow.position / flow.name.*
 *   page + footer   publish/page.tsx StepPage (34-95), wizard-shell/footer.tsx WizardFooter (15-92)
 *   1 Choose how    publish/KindStep.tsx (13-58), site-build-core ask-form/primitives.tsx ChoiceOption (84-110)
 *   2 Tracy address publish/AddressStep.tsx (55-280): card head + chip, address bar, lead, working strip, callout
 *   3 Your domain   publish/DomainStep.tsx (20-116), publish/AddressForm.tsx (15-122), SiteDomains.tsx OwnDomainCard (700-915)
 *   words           packages/site/tracy-site-tabs/src/client/strings.ts (publish.*, flow.*, domains.*, settings.url.*)
 *   rules           publish-scene.css (wizard-shell CSS and site-tabs-rules.css, verbatim)
 *
 * Kept from the old scene 7: the replay ends on its final state and the shell then offers "Let's build
 * your first site" (welcome-shell.js ready:true).
 */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  if (params.get('publish') !== '1' || !window.TracySiteInApp || !window.WelcomeSiteTab) return;
  var S = window.WelcomeSiteTab.open(), I = S.ICON, P = S.PACE;
  var HOST = S.host, NAME = HOST.replace(/\.tracy\.ai$/, ''), DOMAIN = 'www.' + S.biz.slug + '.example';
  var tab = S.addTab('publish', I.globe, 'Publish · ' + HOST);
  var page = S.addPage('stp-publish');
  var copy = function (label) { return '<span class="tv-copy" data-copy><button type="button" class="tv-copy-button" aria-label="' + label + '">' + I.copy + '</button></span>'; };
  var spin = function () { return I.spin.replace('<svg', '<svg class="tv-spinner stp-spin"'); };
  var btn = function (cls, attrs, words) { return '<button type="button" class="stp-btn ' + cls + '" ' + attrs + '>' + words + '</button>'; };
  var RECORDS = [
    ['ownership', 'Proves the domain is yours', 'TXT', '_tracy.' + DOMAIN, '4b9e2c71d05a83f6e2c19b7d4a60f85e3c2d71b9a4e6f058'],
    ['routing', 'Points the domain at this site', 'CNAME', DOMAIN, 'connect.tracy.ai']
  ];
  var choice = function (kind, title, desc, best) {
    return '<label class="stp-choice" data-kind="' + kind + '" data-selected="0"><span class="stp-radio" role="radio"></span><span class="stp-choice-text">' +
      '<span class="stp-choice-title">' + title + '</span><span class="stp-choice-desc">' + desc + '</span>' +
      '<span class="stp-choice-hint">' + I.bulb + '<span><b>Best if</b> ' + best + '</span></span></span></label>';
  };
  page.innerHTML = S.header('') +
    '<div class="tas-root tas-wizard-card tv-pub-wizard stp-wizard" data-publish-wizard="1">' +
      '<div class="tas-wizard-steps" data-wizard-steps="1"><nav class="tas-wizard-segments" aria-label="Publish steps">' +
        ['Choose how', 'Tracy address', 'Your domain'].map(function (label, i) { return '<button type="button" class="tas-wizard-segment" data-seg="' + i + '" aria-label="' + label + '"><span aria-hidden="true"></span></button>'; }).join('') +
      '</nav><div class="tas-wizard-position"><b data-position></b><span data-position-label></span></div></div>' +

      /* Step 1, Choose how (KindStep). */
      '<div class="tas-wizard-body" data-step="kind"><div class="tas-create-step tv-pub-step">' +
        '<div class="tas-wizard-head"><h2 class="tas-wizard-title">How do you want to publish this site?</h2><p class="tas-wizard-desc">Choose where the site will run. You can come back and choose the other way later.</p></div>' +
        '<div class="stp-kinds" role="radiogroup">' +
          choice('online', 'Make it live on Tracy', 'Search engines can find it and it can send email. Then you connect a domain you own.', 'you want Tracy to host the site and you keep editing it here.') +
          choice('zip', 'Download a ZIP', 'Get your site’s files and database to host it somewhere else.', 'you already have hosting. Changes you make in Tracy afterwards are not in the ZIP.') +
        '</div></div></div>' +

      /* Step 2, Tracy address (AddressStep). */
      '<div class="tas-wizard-body" data-step="address"><div class="tas-create-step tv-pub-step">' +
        '<div class="tas-wizard-head"><h2 class="tas-wizard-title" data-address-title></h2><p class="tas-wizard-desc" data-address-desc></p></div>' +
        '<div class="tv-pub-addr" data-card="primary">' +
          '<div class="tv-pub-card-head"><h3>Site address</h3><span class="tv-site-head-status"><span class="stp-chip tv-status-chip" data-site-chip><i></i><span></span></span></span></div>' +
          '<div class="tv-pub-bar"><span class="tv-pub-bar-lk">' + I.lock + '<span class="tv-pub-url"><span class="tv-pub-sfx tv-mono">https://</span><span class="tv-host tv-mono" data-address><span class="tv-pub-name">' + NAME + '</span><span class="tv-pub-sfx">.tracy.ai</span></span></span>' + copy('Copy address') + '</span>' +
            '<button type="button" class="stp-btn is-sm is-ghost tv-pub-change" data-action="change-address">' + I.pencil + 'Change</button></div>' +
          '<p class="tv-domain-lead" data-lead></p>' +
          '<p class="tv-pub-strip tv-domain-working" data-severity="waiting" data-working>' + spin() + 'Publishing… this takes about a minute.</p>' +
          '<div class="tv-pub-callout" data-own-domain-hint>' + I.globe + '<div><b>Your own domain</b><span data-hint-words></span></div></div>' +
        '</div></div></div>' +

      /* Step 3, Your domain (DomainStep, AddressForm, OwnDomainCard). */
      '<div class="tas-wizard-body" data-step="domain"><div class="tas-create-step tv-pub-step">' +
        '<div class="tas-wizard-head"><h2 class="tas-wizard-title">Connect a domain you own</h2><p class="tas-wizard-desc">Optional. ' + HOST + ' keeps answering. A connected domain is added beside it.</p></div>' +
        '<div class="tv-own-domain-entry" data-own-domain-entry><form class="tv-site-address-form tv-pub-form" data-form="domain"><label>Domain</label>' +
          '<div class="tv-pub-field-row"><span class="stp-input" data-input><span data-typed></span><span class="stp-caret" data-caret></span></span>' +
            btn('is-sm is-outline', 'data-action="check-name"', '<span data-check-words>Check availability</span>') + '</div>' +
          '<p class="tv-site-address-help">Enter a subdomain of a domain you own, such as www.example.com or shop.example.com. Do not include https:// or a path.</p>' +
          '<p class="tv-pub-strip" data-severity="success" data-line="name-free">' + I.circleCheck + '<span>This domain is available. Save it to see the DNS records to add.</span></p>' +
        '</form></div>' +
        '<div class="tv-domain-card tv-own-domain" data-card="own-domain"><div class="tv-domain-card-body">' +
          '<div class="tv-own-domain-head"><h3 class="tv-host tv-mono" data-domain-name>' + DOMAIN + '</h3><span class="stp-chip tv-status-chip tv-domain-chip" data-domain-chip><i></i><span></span></span></div>' +
          '<p class="tv-domain-lead" data-line="domain-lead"></p>' +
          '<p class="tv-pub-strip tv-domain-working" data-severity="waiting" data-working-domain>' + spin() + 'Connecting…</p>' +
          '<div class="tv-domain-records" role="group" aria-label="DNS records">' + RECORDS.map(function (r) {
            return '<div class="tv-domain-record" data-record="' + r[0] + '" data-check="ok"><p class="tv-domain-record-title">' + r[1] + '</p><dl>' +
              '<dt>Record type</dt><dd class="tv-domain-record-plain">' + r[2] + '</dd>' +
              '<dt>Record name</dt><dd class="tv-domain-record-value tv-pub-value"><code class="tv-mono">' + r[3] + '</code>' + copy('Copy ' + r[2] + ' record name') + '</dd>' +
              '<dt>Record value</dt><dd class="tv-domain-record-value tv-pub-value"><code class="tv-mono">' + r[4] + '</code>' + copy('Copy ' + r[2] + ' record value') + '</dd></dl>' +
              '<p class="tv-domain-found" data-found="ok">' + I.circleCheck + '<span>Found, with the right value.</span></p></div>';
          }).join('') + '</div>' +
          '<div class="tv-domain-notes" data-notes><p class="tv-domain-note">Last checked Oct 23, 2026, 4:14 PM. Tracy rechecks automatically once the site is live.</p>' +
            '<p class="tv-domain-note">On Cloudflare, set the CNAME to DNS only (grey cloud).</p><p class="tv-domain-note">To make ' + DOMAIN.slice(4) + ' work too, redirect it to ' + DOMAIN + '.</p></div>' +
          '<div class="tv-own-domain-actions" data-actions>' + btn('is-sm is-outline', 'data-action="check-dns"', 'Check again') +
            btn('is-sm', 'data-action="connect-live"', 'Publish on ' + DOMAIN) + btn('is-sm is-ghost tv-domain-draft', 'data-action="remove-domain"', 'Remove domain') + '</div>' +
        '</div></div></div></div>' +

      '<footer class="tas-wizard-footer" data-wizard-footer="1">' + btn('is-ghost', 'data-wizard-back="1"', 'Back') +
        '<div class="tas-wizard-actions">' + btn('is-ghost', 'data-wizard-skip="1"', 'Skip') + btn('', 'data-wizard-continue="1"', '<span data-continue-spin>' + I.spin.replace('<svg', '<svg class="stp-spin"') + '</span><span data-continue-words></span>') + '</div></footer>' +
    '</div>';

  var q = function (s) { return page.querySelector(s); };
  var wizard = q('[data-publish-wizard]'), segs = Array.from(page.querySelectorAll('[data-seg]'));
  var bodies = { kind: q('[data-step="kind"]'), address: q('[data-step="address"]'), domain: q('[data-step="domain"]') };
  var online = q('[data-kind="online"]');
  var siteChip = q('[data-site-chip]'), lead = q('[data-lead]'), working = q('[data-working]'), hintWords = q('[data-hint-words]');
  var change = q('[data-action="change-address"]');
  var typed = q('[data-typed]'), input = q('[data-input]'), caret = q('[data-caret]'), check = q('[data-action="check-name"]'), checkWords = q('[data-check-words]');
  var nameFree = q('[data-line="name-free"]'), entry = q('[data-own-domain-entry]');
  var own = q('[data-card="own-domain"]'), ownChip = q('[data-domain-chip]'), ownLead = q('[data-line="domain-lead"]'), ownWorking = q('[data-working-domain]');
  var ownActions = q('[data-actions]'), connectLive = q('[data-action="connect-live"]'), records = q('.tv-domain-records'), notes = q('[data-notes]');
  var footer = q('[data-wizard-footer]'), back = q('[data-wizard-back]'), skip = q('[data-wizard-skip]'), go = q('[data-wizard-continue]');
  var goWords = q('[data-continue-words]'), goSpin = q('[data-continue-spin]');

  /* ---- Timeline (ms): scene 1's tempo, round 46's rest (site-tab-scene.js PACE) ---- */
  var T = { publish: 1500 };
  T.wizard = T.publish + P.OPEN;            // the Publish tab opens 400 ms after the press
  T.choose = T.wizard + P.GAP;              // read the two ways, rest on "Make it live on Tracy", press
  T.cont1 = T.choose + P.GAP;               // Continue appears; read, rest, press
  T.address = T.cont1 + 100;
  T.live = T.address + P.GAP;               // Publish (the footer's press)
  T.isLive = T.live + P.WORK;               // "Publishing… this takes about a minute." stays 0.8 s
  T.cont2 = T.isLive + P.GAP;               // Continue to the domain step
  T.domain = T.cont2 + 100;
  T.typeStart = T.domain + 600; T.typeEnd = T.typeStart + DOMAIN.length * P.TYPE;
  T.check = T.typeEnd + 600 + P.GLIDE + P.REST_ON;
  T.free = T.check + 700;                    // "Checking…", then the name is free and Save shows
  T.save = T.free + P.GAP;
  T.saved = T.save + 600;                    // "Saving…", then the domain's card with its records
  T.scrollEnd = T.saved + 600;
  T.connect = T.scrollEnd + P.READ + P.GLIDE + P.REST_ON;   // "Publish on www.fernway.example"
  T.domainLive = T.connect + P.WORK;         // "Connecting…" stays 0.8 s
  T.total = T.domainLive + 2300;
  function step(t) { return t < T.address ? 'kind' : t < T.domain ? 'address' : 'domain'; }
  function stage(t) {
    return t < T.publish ? 'app' : t < T.choose ? 'kind' : t < T.address ? 'kind-chosen' : t < T.live ? 'draft' : t < T.isLive ? 'publishing' :
      t < T.domain ? 'live' : t < T.check ? 'domain-typing' : t < T.save ? 'domain-free' : t < T.connect ? 'domain-verified' : t < T.domainLive ? 'domain-connecting' : 'domain-live';
  }
  function chip(el, kind, word) { el.dataset.status = kind; el.querySelector('span').textContent = word; }
  var scrollMax = 0;
  function ease(v) { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); }

  S.run({
    total: T.total,
    start: { x: 1060, y: 610 },
    clicks: [
      { t: T.publish, el: function () { return S.publishButton; } },
      { t: T.choose, el: function () { return online.querySelector('.stp-choice-title'); }, fx: .4 },
      { t: T.cont1, el: function () { return go; } },
      { t: T.live, el: function () { return go; } },
      { t: T.cont2, el: function () { return go; } },
      { t: T.domain + 300 + P.GLIDE, el: function () { return input; }, fx: .82, hover: true },
      { t: T.check, el: function () { return check; } },
      { t: T.save, el: function () { return go; } },
      { t: T.connect, el: function () { return connectLive; } },
      { t: T.domainLive + 300 + P.GLIDE, el: function () { return ownChip; }, fx: .5, fy: 1.6, hover: true }
    ],
    render: function (t, hover) {
      var open = t >= T.wizard, s = step(t);
      tab.show(open); S.selectTab(open ? 'publish' : 'browser'); page.hidden = !open;
      S.publishButton.classList.toggle('stp-hover', !!hover && hover.t === T.publish);
      wizard.dataset.publishStep = s;
      Object.keys(bodies).forEach(function (k) { bodies[k].hidden = k !== s; });
      var at = ['kind', 'address', 'domain'].indexOf(s), chosen = t >= T.choose;
      segs.forEach(function (seg, i) { seg.toggleAttribute('data-active', i <= at); });
      q('[data-position]').textContent = 'Step ' + (at + 1) + ' of 3';
      q('[data-position-label]').textContent = chosen ? 'Online with Tracy' : 'Publishing';
      online.dataset.selected = chosen ? '1' : '0';
      online.classList.toggle('is-hover', !!hover && hover.t === T.choose);

      /* Step 2: draft, publishing, live (AddressStep). */
      var publishing = t >= T.live && t < T.isLive, live = t >= T.isLive;
      q('[data-address-title]').textContent = publishing ? 'Publishing your site' : live ? 'Your site is live' : 'Publish on your Tracy address';
      q('[data-address-desc]').textContent = live ? 'Anyone can open the site at its Tracy address, and it can send email.' : 'Publishing lets search engines list the site and lets it send email.';
      chip(siteChip, live ? 'live' : publishing ? 'publishing' : 'draft', live ? 'Live' : publishing ? 'Publishing…' : 'Draft');
      siteChip.classList.toggle('is-pulse', publishing);
      lead.hidden = publishing;
      lead.innerHTML = live ? 'Live since Oct 23, 2026, 4:12 PM<span class="tv-pub-lead-sep" aria-hidden="true"> · </span><button type="button" class="tv-pub-back-draft" data-action="draft">Back to draft</button>' : 'Only people with the link can open it until the site is published.';
      working.hidden = !publishing; change.hidden = publishing;
      hintWords.textContent = live ? 'Like www.example.com. Continue to connect it.' : 'Like www.example.com. You connect it in the next step, right after you publish.';

      /* Step 3: the name field, Check availability, Save, the domain's card (DomainStep). */
      var saved = t >= T.saved, checking = t >= T.check && t < T.free, free = t >= T.free;
      entry.hidden = saved;
      typed.textContent = DOMAIN.slice(0, Math.max(0, Math.min(DOMAIN.length, Math.floor((t - T.typeStart) / P.TYPE) + 1)));
      if (t < T.typeStart) typed.textContent = '';
      input.classList.toggle('is-focus', s === 'domain' && !checking);
      caret.hidden = checking || Math.floor((t - T.domain) / 530) % 2 === 1 && (t < T.typeStart || t > T.typeEnd);
      checkWords.textContent = checking ? 'Checking…' : 'Check availability';
      check.classList.toggle('is-busy', checking);
      check.classList.toggle('is-hover', !!hover && hover.t === T.check);
      nameFree.hidden = !free;
      own.hidden = !saved;
      var connecting = t >= T.connect && t < T.domainLive, domainLive = t >= T.domainLive;
      var ownState = domainLive ? 'live' : connecting ? 'connecting' : 'verified';
      chip(ownChip, ownState, domainLive ? 'Live' : connecting ? 'Connecting…' : 'Verified');
      ownLead.hidden = connecting; ownWorking.hidden = !connecting; ownActions.hidden = connecting;
      ownLead.textContent = domainLive ? 'The site answers at this domain.' : 'The domain is proven yours. Tracy connects ' + DOMAIN + ' by itself within a few minutes.';
      connectLive.hidden = domainLive;
      connectLive.classList.toggle('is-hover', !!hover && hover.t === T.connect);

      /* The footer (WizardFooter): what StepPage hands it on each state. */
      var primary = null;
      if (s === 'kind') primary = chosen ? 'Continue' : null;
      else if (s === 'address') primary = live ? 'Continue' : publishing ? null : 'Publish';
      else primary = saved ? null : t >= T.save ? 'Saving…' : free ? 'Save' : null;
      footer.hidden = s === 'kind' && !chosen;
      back.hidden = s === 'kind';
      skip.hidden = !(s === 'domain' && !saved);
      go.hidden = !primary;
      goWords.textContent = primary || '';
      var busy = primary === 'Saving…';
      goSpin.hidden = !busy; go.classList.toggle('is-busy', busy);
      go.classList.toggle('is-hover', !!hover && [T.cont1, T.live, T.cont2, T.save].indexOf(hover.t) >= 0);

      /* The panel scrolls to the domain's records once its card is in. */
      /* Verified: down to the records and "Publish on …"; once it is pressed, back up so the step heading, the domain and its chip are in view. */
      var bodyEl = bodies.domain, inner = bodyEl.firstElementChild, scroll = 0;
      if (saved) {
        page.style.setProperty('--pub-scroll', '0px');
        /* Layout px inside the card (the camera scales the rects): the page ends 24px above the footer at most. */
        var wr = wizard.getBoundingClientRect(), k = wr.height / wizard.offsetHeight || 1;
        var y = function (r) { return (r - wr.top) / k; };
        scrollMax = Math.max(0, y(inner.getBoundingClientRect().bottom) + 24 - y(footer.getBoundingClientRect().top));
        var head = Math.min(scrollMax, Math.max(0, y(inner.querySelector('.tas-wizard-head').getBoundingClientRect().top) - 16));
        scroll = ease((t - T.saved) / (T.scrollEnd - T.saved)) * scrollMax;
        if (t >= T.connect + 100) scroll = scrollMax + (head - scrollMax) * ease((t - T.connect - 100) / 500);
      }
      page.style.setProperty('--pub-scroll', scroll + 'px');
    },
    status: function (t) {
      return { scene: 'publish', stage: stage(t), step: step(t), domain: DOMAIN, siteState: siteChip.textContent, domainState: own.hidden ? null : ownChip.textContent,
        finalHold: t >= T.domainLive + 300, timeline: T, scroll: scrollMax };
    }
  });
  window.publishSceneReplay = { timeline: T };
})();
