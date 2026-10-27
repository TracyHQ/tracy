/*
 * Scene 7 "Site changes": engine.html?tab=2&changes=1. Fernway Studio open in the Tracy app; the pointer
 * opens Site changes from the start screen, the timeline lists what was done to the site in this popup,
 * the pointer opens the headline change Maya asked for in a comment (scene 6) and rests on "Ask Tracy to
 * revert" without pressing it. Then it restores Backup 2, the backup Maya took after that headline change:
 * Restore… on its row, the real restore dialog (Everything, the default scope), "Restore" typed, Restore
 * everything, Restoring…, and the list read again with the restore row on top. The opening hours change made
 * after Backup 2 is undone; the shorter headline stays, so scene 8 publishes the site as scene 6 left it.
 * The real restore runs in the dialog only: nothing is posted in the chat (ChangesView.tsx afterRestore
 * 589-592 reads the list and the backups again, no chat turn), so the chat column does not change.
 *
 * Built from tch origin/develop (read only):
 *   page shell        packages/core/tracy-core/src/site-tabs/ChangesView.tsx ChangesPage (715-725)
 *   header            site-tabs/pieces.tsx TabHeader (65-90) + ChangesView.tsx createBackup (573-588)
 *   summary, filter   ChangesView.tsx ChangesList (1079-1095), SourceFilter (1270-1278)
 *   event row         site-tabs/ActivityEventRow.tsx ActivityEventRow (267-380), RowActions (410-445)
 *   opened row        ActivityEventRow.tsx Detail (480-605), Identity (610-812), Effects (884-950),
 *                     Technical (985-1000), Actions (1027-1135)
 *   backup row        site-tabs/BackupRow.tsx BackupRow (110-160), secondLine (64-75), BackupActions (225-256)
 *   restore dialog    site-tabs/RestoreBackupDialog.tsx (ScopeChoice 35-90, default scope 125-127),
 *                     site-tabs/BackupDialogs.tsx RestoreEverythingDialog (325-500), @tracy/ui dialog.tsx
 *   restore row       ActivityEventRow.tsx row title + return point (315-325), activity-v2.ts 494-503,
 *                     backup-list.ts mergeTimeline (the Before-restore backup rides on the row, 186-192)
 *   coverage foot     ChangesView.tsx Coverage (740-800)
 *   words             packages/site/tracy-site-tabs/src/client/strings.ts
 *   rules             site-changes-scene.css (site-tabs-rules.css, verbatim)
 */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  if (params.get('changes') !== '1' || !window.TracySiteInApp || !window.WelcomeSiteTab) return;
  var S = window.WelcomeSiteTab.open(), I = S.ICON, P = S.PACE;
  var tab = S.addTab('changes', I.listChecks, 'Site changes · ' + S.host);
  var page = S.addPage('stp-changes');
  var ICN = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; };
  var HISTORY = ICN('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>');
  var ALERT = ICN('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>');
  var XMARK = ICN('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
  var BOT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>';
  var MAYA = '<span class="stp-face" aria-hidden="true">M</span>';

  /* One event row (ActivityEventRow): the chevron, the title, then who · type · when · what. */
  function row(o) {
    var quick = o.quick ? '<span class="tv-activity-quick" aria-hidden="true">' + I.external + '</span>' : '';
    var actions = o.actions || '<span class="tv-row-more-slot" aria-hidden="true"></span>';
    return '<li class="tv-activity-event" data-row-in data-event="' + o.id + '" data-source="' + o.source + '"' + (o.unread ? ' data-unread="true"' : '') + '>' +
      '<div class="tv-row-box"><div class="tv-row-head">' +
        '<div class="tv-activity-event-main">' + I.chevRight.replace('<svg', '<svg class="tv-row-chevron"') +
          '<span class="tv-row-body"><button type="button" class="tv-activity-toggle" data-cell="description"><span class="tv-activity-desc-line"' + (o.request ? ' data-request-title="true"' : '') + '><span class="tv-activity-desc-text">' + o.title + '</span></span></button>' +
          '<span class="tv-row-meta" data-meta>' +
            '<span class="tv-row-part" data-cell="by">' + MAYA + '<span class="tv-activity-cell-text">Maya</span></span>' +
            '<span class="tv-row-part" data-cell="source">' + o.glyph.replace('<svg', '<svg class="tv-activity-glyph"') + '<span class="tv-activity-cell-text">' + o.label + '</span>' + quick + '</span>' +
            '<span class="tv-row-part" data-cell="time"><time class="tv-activity-time">' + o.ago + '</time></span>' +
            (o.scope ? '<span class="tv-row-part tv-row-scope" data-scope>' + o.scope + '</span>' : '') +
          '</span></span></div>' +
        '<div class="tv-row-actions">' + actions + '</div></div>' +
        (o.detail ? '<div class="tv-activity-detail" data-detail hidden>' + o.detail + '</div>' : '') +
      '</div></li>';
  }
  var more = '<button type="button" class="tv-row-action tv-row-more" aria-label="More">' + I.more + '</button>';
  /* The opened headline row (Detail): identity, the request, what it changed, technical details, actions. */
  var detail = '<div class="tv-activity-detail-body">' +
    '<div class="tv-activity-block" data-block="identity"><div class="tv-activity-identity">' +
      '<span class="tv-activity-source-chip">' + I.comment.replace('<svg', '<svg class="tv-activity-glyph"') + 'Comment</span>' +
      '<span class="tv-activity-identity-who">' + MAYA + '<span class="min-w-0">Requested by <span class="tv-activity-strong">Maya</span> · Applied by <span class="tv-activity-strong">Tracy</span></span></span>' +
      '<p class="tv-activity-identity-row">Comment by <span class="tv-activity-strong">Maya</span> on / · <a class="tv-moment-link tv-activity-link" data-open-comment>Open comment' + I.external + '</a></p>' +
    '</div></div>' +
    '<div class="tv-activity-block" data-block="request"><h4 class="tv-activity-block-title">Request</h4>' +
      '<blockquote class="tv-activity-request">Make this headline shorter. @daniel can you check mobile?</blockquote></div>' +
    '<div class="tv-activity-block" data-block="effects"><div class="tv-activity-group" data-group="content"><h4 class="tv-activity-section-title">' + I.database + 'Content<span class="tv-activity-section-count">1</span></h4>' +
      '<ul class="tv-activity-list"><li class="tv-activity-line"><span class="tv-activity-line-text"><span class="tv-activity-strong">Updated article “Home”</span></span></li></ul></div></div>' +
    '<div class="tv-activity-block" data-block="technical"><details><summary class="tv-activity-summary">Technical details</summary></details></div>' +
    '<div class="tv-activity-block" data-block="actions"><div class="tv-activity-actions">' +
      '<button type="button" class="stp-btn is-sm is-outline" data-ask-revert>' + I.chatPlus + 'Ask Tracy to revert</button></div></div>' +
  '</div>';
  /* A backup milestone (BackupRow): its name, who · when · what it keeps since the previous one, Restore… and Download…. */
  function backupRow(o) {
    return '<li class="tv-backup" data-row-in data-backup="' + o.n + '"><div class="tv-row-box"><div class="tv-row-head">' +
      '<button type="button" class="tv-activity-event-main">' + I.chevRight.replace('<svg', '<svg class="tv-row-chevron"') +
        '<span class="tv-row-body"><span class="tv-activity-desc-line" data-cell="description"><span class="tv-backup-name">' + o.name + '</span></span>' +
        '<span class="tv-row-meta" data-meta><span class="tv-row-part" data-cell="by">' + o.face + '<span class="tv-activity-cell-text">' + o.by + '</span></span>' +
        '<span class="tv-row-part" data-cell="time"><time class="tv-activity-time">' + o.ago + '</time></span>' +
        '<span class="tv-row-part tv-row-scope" data-scope>' + o.second + '</span></span></span></button>' +
      '<div class="tv-row-actions"><button type="button" class="tv-row-action" data-row-restore="' + o.n + '">' + I.rotate + 'Restore…</button>' +
        '<button type="button" class="tv-row-action" data-row-download>' + I.download + 'Download…</button><span class="tv-row-more-slot" aria-hidden="true"></span></div>' +
    '</div></div></li>';
  }
  /* Backup 2: taken by Maya after the headline change, titled with the suggested date (Create a backup's default title). */
  var B2 = 'Oct 23, 2026, 4:12 PM';
  var ROWS = [
    row({ id: 'hours', source: 'chat', request: true, title: 'Add our opening hours to the contact page', glyph: I.chat, label: 'Chat', ago: '1 min ago', scope: 'Updated article “Contact”', actions: more }),
    backupRow({ n: 2, name: 'Backup 2 · ' + B2, face: MAYA, by: 'Maya', ago: '2 min ago', second: '3 changes since Backup 1' }),
    row({ id: 'headline', source: 'comment', title: 'Updated article “Home”', glyph: I.comment, label: 'Comment', quick: true, ago: '3 min ago', scope: '1 article', actions: more, detail: detail }),
    row({ id: 'system', source: 'design-system', title: 'Applied the design system “' + S.biz.designSystem.name + '”', glyph: I.palette, label: 'Design system', ago: '14 min ago', scope: '1 setting · 2 files', actions: more }),
    row({ id: 'setup', source: 'setup', title: 'Updated 9 articles and 2 settings', glyph: I.rocket, label: 'Tracy setup', ago: '20 min ago', scope: '9 articles · 2 settings', actions: more }),
    backupRow({ n: 1, name: 'Initial backup', face: '<span class="stp-face is-agent" aria-hidden="true">' + BOT + '</span>', by: 'Tracy', ago: '21 min ago', second: 'The site as it was handed over' })
  ];
  /* After the restore the list is read again: the restore row on top (activity-v2.ts: "Restored everything to
     Backup {version}"), its Before-restore backup riding on it as the return point (ActivityEventRow 318-323). */
  var RESTORED = row({ id: 'restore', source: 'site-changes', title: 'Restored everything to Backup 2<span data-return-point="3"> · Return point: Backup 3</span>', glyph: HISTORY, label: 'Restore', ago: 'just now', actions: more });
  page.innerHTML = S.header('<button type="button" class="stp-btn is-sm" data-create-backup>' + I.archive + 'Create a backup</button>') +
    '<div class="stp-scroll"><div class="tv-changes-page" data-changes-page>' +
      '<div class="tas-wizard-head"><h2 class="tas-wizard-title">Site changes</h2><p class="tas-wizard-desc">Every recorded change to this site, who made it and when. Undo a change or restore a backup from here.</p></div>' +
      '<div><div class="tv-activity-v2" data-site-changes-v2>' +
        '<div class="tv-changes-summary" data-row-in><span class="tv-activity-total" data-total>4 changes by people and Tracy</span>' +
          '<span class="tv-changes-tools"><button type="button" class="tv-changes-filter tv-backup-jump">Jump to backup' + I.chevDown + '</button>' +
          '<span class="tv-changes-filter-anchor"><button type="button" class="tv-changes-filter tv-activity-filter">Type: People and Tracy' + I.chevDown + '</button></span></span></div>' +
        '<div class="tv-moment-list"><section><h3 class="tv-moment-day" data-row-in>Fri, Oct 23</h3><ol>' + RESTORED.replace('data-row-in', 'data-restored') + ROWS.join('') + '</ol></section></div>' +
        '<div class="tv-activity-coverage" data-coverage data-row-in><div class="tv-activity-coverage-line">' + I.info.replace('<svg', '<svg class="tv-activity-coverage-icon"') +
          '<div><p class="tv-activity-coverage-hint">Joomla admin edits are tracked. Last checked just now.</p></div></div></div>' +
      '</div></div></div></div>';

  /* The restore dialog (RestoreBackupDialog → RestoreEverythingDialog), over the whole app window. */
  var WHEN = B2, LOST = ['Posts and pages', 'Orders', 'Form entries', 'Users', 'Comments', 'Settings'];
  var layer = document.createElement('div');
  layer.className = 'stp stp-layer'; layer.hidden = true;
  layer.innerHTML = '<div class="stp-dialog" role="dialog" aria-modal="true" data-restore-dialog>' +
    '<button type="button" class="stp-dialog-close" aria-label="Close">' + XMARK + '</button>' +
    '<div class="stp-dialog-head"><h2 class="stp-dialog-title">Restore everything on ' + S.biz.answers.name + ' to Backup 2 · ' + B2 + '?</h2>' +
      '<p class="stp-dialog-desc">Files and the database go back to how they were on ' + WHEN + '.</p></div>' +
    '<div class="stp-scopes" role="radiogroup" aria-label="Restore">' +
      '<label class="stp-scope is-checked" data-scope-option="everything"><input type="radio" name="stp-restore-scope" checked tabindex="-1"><span class="stp-scope-text"><span class="stp-scope-name">Everything</span></span></label>' +
      '<label class="stp-scope" data-scope-option="files"><input type="radio" name="stp-restore-scope" tabindex="-1"><span class="stp-scope-text"><span class="stp-scope-name">Files only</span>' +
        '<span class="stp-scope-warn">' + ALERT + 'Images uploaded after this backup are removed; posts that use them will show broken images.</span></span></label>' +
    '</div>' +
    '<div class="tv-backup-lost" data-lost role="alert"><p class="tv-backup-lost-title">' + ALERT.replace('<svg', '<svg class="tv-activity-note-icon"') + 'Everything saved on the site after ' + WHEN + ' is deleted:</p>' +
      '<ul class="tv-backup-lost-list">' + LOST.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>' +
    '<p class="tv-backup-before" data-before-first>' + I.archive.replace('<svg', '<svg class="tv-backup-mark"') + 'Tracy will take a “Before restore” backup first, so you can come back to now.</p>' +
    '<div class="stp-confirm"><label class="stp-confirm-label">Type “Restore” to confirm</label>' +
      '<span class="stp-field" data-confirm-word><span class="stp-field-placeholder" data-placeholder>Restore</span><span data-typed></span><span class="stp-field-caret" data-caret></span></span></div>' +
    '<div class="stp-dialog-foot"><button type="button" class="stp-btn is-sm is-outline" data-cancel>Cancel</button>' +
      '<button type="button" class="stp-btn is-sm is-destructive" data-confirm-everything>' + I.database + '<span data-confirm-words>Restore everything</span></button></div>' +
  '</div>';
  S.app.appendChild(layer);

  var q = function (s) { return page.querySelector(s); };
  var ql = function (s) { return layer.querySelector(s); };
  var lines = Array.from(page.querySelectorAll('[data-row-in]'));
  var headRow = q('[data-event="headline"]'), headTitle = headRow.querySelector('.tv-activity-desc-text'), headDetail = headRow.querySelector('[data-detail]');
  var ask = q('[data-ask-revert]'), restoreBtn = q('[data-row-restore="2"]'), b2Box = q('[data-backup="2"] .tv-row-box');
  var restoredRow = q('[data-restored]'), restoredTitle = restoredRow.querySelector('.tv-activity-desc-text'), total = q('[data-total]');
  var field = ql('[data-confirm-word]'), typed = ql('[data-typed]'), holder = ql('[data-placeholder]'), caret = ql('[data-caret]');
  var confirm = ql('[data-confirm-everything]'), confirmWords = ql('[data-confirm-words]'), cancel = ql('[data-cancel]');
  var WORD = 'Restore';
  restoredRow.hidden = true;

  /* ---- Timeline (ms): scene 1's tempo, round 46's rest (site-tab-scene.js PACE) ---- */
  var T = { card: 1500 };
  T.page = T.card + P.OPEN;                          // the tab opens 400 ms after the press, so its ripple is seen
  T.listIn = T.page + 90 * lines.length + 250;       // rows come in one after another, well under 0.8 s
  T.open = T.listIn + P.GAP;                         // read 1.5 s, glide, rest 0.7 s on the headline row, press
  T.rest = T.open + P.READ + P.GLIDE;                // read the opened row, then come to rest on Ask Tracy to revert
  T.restore = T.rest + P.GAP;                        // 1.5 s there (nothing pressed), glide, rest 0.7 s on Restore…, press
  T.dialog = T.restore + P.OPEN;                     // the dialog opens 400 ms after the press
  T.field = T.dialog + P.GAP;                        // read it 1.5 s, glide, rest, press the confirm field
  T.typeStart = T.field + 150;
  T.typeEnd = T.typeStart + WORD.length * P.TYPE;
  T.confirm = Math.max(T.typeEnd + 300 + P.GLIDE + P.REST_ON, T.field + 1900); // rest 0.7 s on Restore everything, press
  T.done = T.confirm + P.WORK;                       // Restoring… for 0.8 s, then the dialog closes and the list is read again
  T.result = T.done + 300 + P.GLIDE;                 // the pointer comes to rest on the restore row
  T.total = T.result + P.READ + 500;                 // the scene ends there
  function stage(t) {
    return t < T.card ? 'app' : t < T.page ? 'opening' : t < T.open ? 'list' : t < T.rest ? 'opened' : t < T.restore ? 'resting'
      : t < T.dialog ? 'restore-pressed' : t < T.confirm ? 'dialog' : t < T.done ? 'restoring' : 'restored';
  }

  S.run({
    total: T.total,
    clicks: [
      { t: T.card, el: function () { return S.changesCard; }, fx: .45 },
      { t: T.open, el: function () { return headTitle; }, fx: .5 },
      { t: T.rest, el: function () { return ask; }, fx: .82, hover: true },
      { t: T.restore, el: function () { return restoreBtn; }, fx: .5 },
      { t: T.field, el: function () { return field; }, fx: .7 },
      { t: T.confirm, el: function () { return confirm; }, fx: .6 },
      { t: T.result, el: function () { return restoredTitle; }, fx: .35, hover: true }
    ],
    render: function (t, hover) {
      var shown = t >= T.page;
      tab.show(t >= T.page);
      S.selectTab(shown ? 'changes' : 'browser');
      page.hidden = !shown;
      lines.forEach(function (el, i) { el.classList.toggle('is-in', t >= T.page + 90 * i); });
      S.changesCard.classList.toggle('stp-hover', !!hover && hover.t === T.card);
      var opened = t >= T.open;
      headRow.toggleAttribute('data-open', opened);
      headDetail.hidden = !opened;
      var hb = headRow.querySelector('.tv-row-box'), onHead = !!hover && hover.t === T.open;
      hb.classList.toggle('is-hover', onHead);
      hb.style.backgroundColor = onHead ? 'color-mix(in oklab, var(--foreground) 4%, var(--tsb-surface, var(--background)))' : '';
      ask.classList.toggle('is-hover', !!hover && hover.t === T.rest);
      /* Restore… on Backup 2: the row's hover look while the pointer rests on its action. */
      var onRestore = !!hover && hover.t === T.restore;
      restoreBtn.classList.toggle('is-hover', onRestore);
      b2Box.style.backgroundColor = onRestore ? 'color-mix(in oklab, var(--foreground) 4%, var(--tsb-surface, var(--background)))' : '';
      /* The dialog, from its opening to the end of Restoring…. */
      layer.hidden = !(t >= T.dialog && t < T.done);
      var n = t < T.typeStart ? 0 : Math.min(WORD.length, Math.floor((t - T.typeStart) / P.TYPE) + 1);
      typed.textContent = WORD.slice(0, n);
      holder.hidden = n > 0;
      var focus = t >= T.field;
      field.classList.toggle('is-focus', focus);
      caret.hidden = !focus || t >= T.confirm || (t > T.typeEnd && Math.floor((t - T.typeEnd) / 530) % 2 === 1);
      var busy = t >= T.confirm;
      confirm.classList.toggle('is-off', n < WORD.length || busy);
      cancel.classList.toggle('is-off', busy);
      confirm.classList.toggle('is-hover', !!hover && hover.t === T.confirm && !busy);
      confirmWords.textContent = busy ? 'Restoring…' : 'Restore everything';
      /* The list read again: the restore row on top, one more change counted. */
      var restored = t >= T.done;
      restoredRow.hidden = !restored;
      restoredRow.classList.toggle('is-in', t >= T.done + 90);
      total.textContent = (restored ? 5 : 4) + ' changes by people and Tracy';
      restoredRow.querySelector('.tv-row-box').style.backgroundColor = hover && hover.t === T.result ? 'color-mix(in oklab, var(--foreground) 4%, var(--tsb-surface, var(--background)))' : '';
    },
    status: function (t) {
      return { scene: 'changes', stage: stage(t), rows: Array.from(page.querySelectorAll('.tv-activity-desc-text,.tv-backup-name')).filter(function (e) { return e.offsetParent; }).map(function (e) { return e.textContent; }),
        opened: headRow.hasAttribute('data-open'), dialog: !layer.hidden, typed: typed.textContent, confirmWords: confirmWords.textContent,
        restored: !restoredRow.hidden, count: total.textContent, finalHold: t >= T.result, timeline: T };
    }
  });
  window.siteChangesSceneReplay = { timeline: T };
})();
