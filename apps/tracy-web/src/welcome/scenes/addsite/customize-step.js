/*
 * Scene 5 markup (and the last frame of scene 4, empty): the Add site wizard's Customize step being filled for one business, then Review and the build.
 * Structure, labels and buttons follow tch origin/develop: AskWizard.tsx groups (Your business, Language and tone,
 * Brand, Pages), wizard-customize-css.ts, brand-tiles.tsx compact uploads and strings.ts. The questions are the Joomla
 * set, apps/tracy-web/src/questions/joomla.json: name, about, languages, tone, logo (light and dark pair), favicon,
 * pages. The quickstart profile (template-profiles.json, quickstart/ja-kinetic/j6) ships a logo pair, so the Brand
 * group has three tiles. Pages are the JA Kinetic quickstart's own page list (tracy_site_pages.json).
 */
(function () {
  'use strict';
  var biz = window.TracyBusinesses.fernway;
  var LOGO = '../sites/fernway/brand/fernway-logo.svg', LOGO_DARK = '../sites/fernway/brand/fernway-logo-on-dark.svg', FAVICON = '../sites/fernway/brand/fernway-favicon.svg';
  var PAGES = ['Home', 'Features', 'Integrations', 'Changelog', 'Blog', 'FAQ', 'All Categories', 'Pricing', 'About', 'Team', 'Contact', 'Landing', 'Single Article', 'Engineering'];
  function esc(value) {
    return String(value || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function icon(status, turn) {
    return '<svg class="import-status-icon" data-preflight-icon="' + status + '" viewBox="0 0 16 16" aria-hidden="true"' + (status === 'pending' ? ' style="transform:rotate(' + turn + 'deg)"' : '') + '>' + (status === 'pending' ? '<path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5"/>' : '<circle cx="8" cy="8" r="6.25"/><path d="m5 8 2 2 4-4"/>') + '</svg>';
  }
  function header(title, desc) { return '<div class="tas-wizard-head"><h2 class="tas-wizard-title">' + title + '</h2><p class="tas-wizard-desc">' + desc + '</p></div>'; }
  function label(text, hint, inline) {
    return '<div class="tas-customize-label" data-hint-inline="' + (inline ? 'true' : 'false') + '"><label>' + text + '</label><span>' + hint + '</span></div>';
  }
  /* A text field drawn as DOM so it can show the typing caret. */
  function field(id, s, placeholder) {
    var value = s.values[id] || '', focused = s.field === id;
    return '<div class="cz-input' + (focused ? ' is-focused' : '') + '" id="cz-' + id + '" data-answer="' + id + '"><span class="cz-line">' + (value ? '<span class="cz-value">' + esc(value) + '</span>' : '<span class="cz-placeholder">' + esc(placeholder) + '</span>') + (focused ? '<i class="cz-caret"></i>' : '') + '</span></div>';
  }
  function upload(id, title, rule, s, src) {
    var state = s.uploads[id];
    var button = state === 'busy' ? '<svg class="cz-spin" viewBox="0 0 16 16" aria-hidden="true" style="transform:rotate(' + s.turn + 'deg)"><path d="M8 1.5a6.5 6.5 0 1 1-6.5 6.5"/></svg>Uploading…' : state === 'done' ? 'Replace' : 'Upload';
    return '<div class="tas-customize-upload" data-tile="' + id + '" data-filled="' + (state === 'done' ? '1' : '0') + '"><span class="tas-customize-upload-preview' + (id === 'dark' ? ' is-dark' : id === 'light' ? ' is-light' : '') + '">' + (state === 'done' ? '<img src="' + src + '" alt="' + title + '">' : id === 'favicon' ? '<span aria-hidden="true">◐</span>' : '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="2"/><circle cx="7.5" cy="8" r="1.5"/><path d="m3 15 4.5-4.5 3 3 2-2 4.5 4.5"/></svg>') + '</span><div class="tas-customize-upload-copy"><span>' + title + '</span><small>' + rule + '</small></div><button class="btn tas-customize-upload-button" id="cz-' + id + '-upload">' + button + '</button></div>';
  }
  function customize(s) {
    var tone = ['Plain', 'Warm', 'Bold'].map(function (name) {
      var on = s.tone === name;
      return '<button class="cz-tone-item" id="cz-tone-' + name.toLowerCase() + '" aria-pressed="' + on + '">' + name + '</button>';
    }).join('');
    var pages = PAGES.map(function (name, i) {
      return '<span class="tas-customize-page"' + (i === 0 ? ' data-locked="1"' : '') + '><i class="cz-check" data-checked="1"></i>' + name + '</span>';
    }).join('');
    var groups =
      '<section class="tas-customize-group" data-ask-group="Business"><div class="tas-customize-heading"><h2>Your business</h2><span>Tracy writes your pages from this</span></div><div class="tas-customize-box">' +
        '<div class="tas-customize-field" data-ask-item="name">' + label('Business name', 'Write it exactly as customers should see it.', true) + field('name', s, 'e.g. Acme Dental') + '</div>' +
        '<div class="tas-customize-field" data-ask-item="about">' + label('One line about your business', 'What you do, for whom, and what makes you the right choice.', false) +
          '<div class="tas-customize-textarea' + (s.field === 'about' ? ' is-focused' : '') + '" id="cz-about"><div class="cz-textarea">' + (s.values.about ? '<span class="cz-value">' + esc(s.values.about) + '</span>' : '<span class="cz-placeholder">e.g. We help families in Dubai keep healthy smiles with gentle, modern dentistry.</span>') + (s.field === 'about' ? '<i class="cz-caret"></i>' : '') + '</div>' +
          '<div class="tas-customize-textarea-foot"><span class="tas-customize-starter">What you make</span><span class="tas-customize-starter">Who it is for</span><span class="tas-customize-starter">Where you are</span><span class="tas-customize-starter">What makes you different</span><span class="tas-customize-rewrite"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m10 1 1.3 3.7L15 6l-3.7 1.3L10 11 8.7 7.3 5 6l3.7-1.3L10 1ZM3 8l1 2.7L7 12l-3 1-1 3-1-3-3-1 3-1.3L3 8Z"/></svg>Rewrite</span></div></div></div>' +
      '</div></section>' +
      '<section class="tas-customize-group" data-ask-group="LanguageTone"><div class="tas-customize-heading"><h2>Language and tone</h2></div><div class="tas-customize-box" data-group-layout="LanguageTone">' +
        '<div class="tas-customize-field">' + label('Site language', 'Your site is written in this language.', true) + '<div class="cz-input cz-select' + (s.languageOpen ? ' is-focused' : '') + '" id="cz-language">' + (s.language ? '<span class="cz-value">' + esc(s.language) + '</span>' : '<span class="cz-placeholder">Choose a language...</span>') + '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></div></div>' +
        '<div class="tas-customize-field">' + label('Tone', 'Sets the writing style Tracy uses for the text on your site.', true) + '<div class="cz-tone" role="group">' + tone + '</div></div>' +
      '</div></section>' +
      '<section class="tas-customize-group" data-ask-group="Brand"><div class="tas-customize-heading"><h2>Brand</h2><span>Optional, add later any time</span></div><div class="tas-customize-box" data-group-layout="Brand">' +
        upload('light', 'Light theme', 'PNG, transparent, 500px or more', s, LOGO) + upload('dark', 'Dark theme', 'PNG, transparent, 500px or more', s, LOGO_DARK) + upload('favicon', 'Favicon', 'PNG, square, 512px or more', s, FAVICON) +
      '</div></section>' +
      '<section class="tas-customize-group" data-ask-group="Pages"><div class="tas-customize-heading"><h2>Pages</h2><div class="tas-customize-pages-heading"><span>' + PAGES.length + ' of ' + PAGES.length + ' kept</span><button>Keep all</button></div></div><div class="tas-customize-box"><div class="tas-customize-pages">' + pages + '</div></div></section>';
    return header('Customize your site', "What you enter here is what your customers will read. Anything you skip keeps the template's text.") +
      '<div class="cz-viewport"><div class="cz-scroll" data-ask-variant="wizard" style="transform:translateY(' + (-s.scroll).toFixed(1) + 'px)"><div class="tas-customize-groups">' + groups + '</div></div></div>';
  }
  function review(s) {
    var rows = [['Platform', biz.platform], ['Starting design', biz.template], ['Design system', esc(biz.designSystem.name)], ['Site address', biz.host], ['Your business', s.answered + ' of ' + s.total + ' answered <span class="secondary">· ' + PAGES.length + ' of ' + PAGES.length + ' pages</span>']];
    return header('Ready to create your site', 'Check your choices. You can change any of them now, or later in chat.') +
      '<div class="tas-wizard-summary" data-customize-review><div class="tas-wizard-review-hero"><div class="tas-wizard-review-url">' + biz.host + '</div><div class="tas-wizard-review-live">Live in a few minutes after you press Create site.</div><div class="tas-wizard-review-chips"><span class="tas-wizard-review-chip">' + biz.platform + '</span><span class="tas-wizard-review-chip">' + biz.template + '</span><span class="tas-wizard-review-chip"><span class="swatches">' + biz.designSystem.colors.map(function (c) { return '<i style="--s:' + c + '"></i>'; }).join('') + '</span>' + esc(biz.designSystem.name) + '</span><span class="tas-wizard-review-chip cz-review-brand"><img src="' + FAVICON + '" alt="">' + esc(biz.answers.name) + '</span></div></div>' +
      '<dl class="tas-wizard-review">' + rows.map(function (r) { return '<div class="tas-wizard-review-row"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd><button class="tas-wizard-review-change">Change</button></div>'; }).join('') + '</dl></div>';
  }
  /* The main lines of the fleet's build steps for Joomla (plugin step named as tch strings.ts import_step_installing_joomla), with the two steps that write the Customize answers (steps.mjs). */
  var BUILD = ['Fetching the files', 'Installing the platform', 'Installing the Claude Cowork component', 'Writing your text and pictures', 'Publishing the address'];
  function building(s) {
    var seen = s.buildSteps || 0;
    /* Once every line is done, the ready screen of tch (tracy-add-site wizard.tsx 1349-1427, strings.ts 963, 968, 976): "Your {url} is ready.",
       the steps as milestones, then "Open the workspace" and the link "Open your site in a new tab". */
    var ready = !!s.buildDone;
    return '<div class="create-progress-panel cz-build" data-stage="' + (ready ? 'ready' : 'building') + '"><div class="create-progress-title">' + (ready ? 'Your ' + biz.host + ' is ready.' : 'Building ' + biz.host) + '</div>' + (seen === 0 ? '<p class="hint">Getting a machine ready…</p>' : '<ol class="create-progress">' + BUILD.slice(0, seen).map(function (text, i) {
      var done = i < seen - 1 || s.buildDone;
      return '<li data-done="' + (done ? '1' : '0') + '"' + (i >= 7 ? ' data-brief-step="1"' : '') + '>' + icon(done ? 'ok' : 'pending', s.turn) + '<span>' + text + '</span></li>';
    }).join('') + '</ol>') + (ready ? '<div class="cz-ready-actions" data-cz-ready><button class="btn primary" id="cz-open-workspace">Open the workspace</button><button class="btn link' + (s.openHover ? ' is-hover' : '') + '" id="cz-open-site">Open your site in a new tab</button></div>' : '') + '</div>';
  }
  function footer(s) {
    var isReview = s.stage === 'review';
    return '<footer class="tas-wizard-footer"><button class="btn" id="back">Back</button><div class="tas-wizard-actions">' + (isReview ? '' : '<span class="tas-wizard-answered">' + s.answered + ' of ' + s.total + ' answered</span><button class="btn" id="skip">Skip</button>') + '<button class="btn primary" id="continue">' + (isReview ? 'Create site' : 'Continue') + '</button></div></footer>';
  }
  function render(s) {
    var steps = ['Adding', 'Platform', 'Starting design', 'Design system', 'Site address', 'Customize your site', 'Review'];
    var done = s.stage === 'create-building';
    var content = s.stage === 'customize' ? customize(s) : s.stage === 'review' ? review(s) : building(s);
    return '<div class="tas-wizard-steps"><div class="tas-wizard-segments">' + steps.map(function (name, i) { return '<button class="tas-wizard-segment" ' + (i < s.step ? 'data-active' : '') + ' aria-label="' + name + '"><span></span></button>'; }).join('') + '</div><div class="tas-wizard-position">' + (done ? '<span>All steps completed</span>' : '<b>Step ' + s.step + ' of ' + steps.length + '</b><span>' + s.label + '</span>') + '</div></div><div class="tas-wizard-body' + (s.stage === 'customize' ? ' cz-body' : '') + '">' + content + '</div>' + (done ? '' : footer(s));
  }
  window.CustomizeStepMarkup = { render: render, buildSteps: BUILD.length };
})();
