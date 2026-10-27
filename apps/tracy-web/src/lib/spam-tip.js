/**
 * The "check your Spam folder" tip card of the pages Tracy renders itself (spam hints D1,
 * 05/10: variant C, a dismissible card under the page's card). A first mail from a new sender can
 * land in Spam; one "Not spam" from the reader is the strongest signal Gmail takes, so the pages
 * that wait on a mail ask for it.
 *
 * The card is drawn `hidden` and {@link SPAM_TIP_SCRIPT} shows it unless this browser dismissed it
 * before (per tip, in localStorage). Storage that throws (private window, blocked site data) only
 * means the card shows again; nothing else depends on it.
 */
import { escapeHtml } from './html.js'

/** A plain envelope, drawn in the tip's own colour. */
const MAIL_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>'

/**
 * @param {(key: string) => string} t - the page's translator (plain text).
 * @param {string} id - which tip this is; a dismissal is remembered per id.
 * @param {string} text - the tip, already translated.
 * @returns {string} the card, hidden until the script decides.
 */
export function spamTip(t, id, text) {
  return `<aside class="spam-tip" data-spam-tip="${escapeHtml(id)}" hidden>
<span class="spam-tip-icon">${MAIL_ICON}</span>
<p class="spam-tip-text">${escapeHtml(text)}</p>
<button type="button" class="spam-tip-x" aria-label="${escapeHtml(t('tip.dismiss'))}">&times;</button>
</aside>`
}

/**
 * Shows each tip this browser has not dismissed, and remembers a dismissal. Appended to a page's
 * script; the leading `;` keeps it a statement of its own after a script that ends in an expression.
 */
export const SPAM_TIP_SCRIPT = `
;(function(){
  document.querySelectorAll('[data-spam-tip]').forEach(function (tip) {
    var key = 'tracy.tip.' + tip.getAttribute('data-spam-tip');
    var gone = false;
    try { gone = window.localStorage.getItem(key) === '1'; } catch (e) {}
    if (gone) return;
    tip.hidden = false;
    var close = tip.querySelector('.spam-tip-x');
    if (close) close.addEventListener('click', function () {
      tip.hidden = true;
      try { window.localStorage.setItem(key, '1'); } catch (e) {}
    });
  });
})();
`
