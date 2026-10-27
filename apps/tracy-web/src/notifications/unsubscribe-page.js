/**
 * The pages of the one-click unsubscribe door (spam hints C1-B, copy approved on 05/10/2026),
 * in the card frame of the other pages Tracy renders itself.
 *
 *   confirm  what a mail client or a person opening the link (GET) sees: a form that POSTs the same
 *            token. A script submits it at once, so a person lands on "You are unsubscribed"; a
 *            scanner or prefetcher that only GETs changes nothing (RFC 8058 §3.2).
 *   done     "You are unsubscribed" for the letter's group, and where to change it again.
 *   invalid  a forged, expired or locked-group link: nothing changed, and where to change it.
 *
 * Pure: the caller passes the translator and the already-checked values.
 */
import { escapeHtml } from '../lib/html.js'
import { pageShell } from '../lib/page-shell.js'

const AUTO_SUBMIT = `
;(function(){
  var form = document.getElementById('unsubscribe-form');
  if (form) form.submit();
})();
`

function card(heading, description) {
  return `<div class="card auth-card">
<div class="card-header">
<h1 class="card-title">${escapeHtml(heading)}</h1>
${description}
</div>
</div>`
}

const settingsLine = (t, manageUrl) =>
  `<p class="card-description"><a href="${escapeHtml(manageUrl)}">${t.html('unsubscribe.settings')}</a></p>`

/**
 * @param {{t: Function & {html: Function, htmlLang: string}, groupId: string, action: string}} input
 *   `action` is the door's own path and query (the token included), already checked.
 */
export function unsubscribeConfirmPage({ t, groupId, action }) {
  const title = t('unsubscribe.confirmTitle', { group: t(`unsubscribe.group.${groupId}`) })
  const form = `<form id="unsubscribe-form" method="post" action="${escapeHtml(action)}">
<input type="hidden" name="List-Unsubscribe" value="One-Click">
<button type="submit">${t.html('unsubscribe.confirm')}</button>
</form>`
  return pageShell(title, card(title, form), AUTO_SUBMIT, { lang: t.htmlLang })
}

/** @param {{t: Function & {html: Function, htmlLang: string}, groupId: string, manageUrl: string}} input */
export function unsubscribeDonePage({ t, groupId, manageUrl }) {
  const title = t('unsubscribe.title')
  const body = `<p class="card-description">${t.html('unsubscribe.body', { group: t(`unsubscribe.group.${groupId}`) })}</p>
${settingsLine(t, manageUrl)}`
  return pageShell(title, card(title, body), '', { lang: t.htmlLang })
}

/** @param {{t: Function & {html: Function, htmlLang: string}, manageUrl: string}} input */
export function unsubscribeInvalidPage({ t, manageUrl }) {
  const title = t('unsubscribe.invalidTitle')
  return pageShell(title, card(title, settingsLine(t, manageUrl)), '', { lang: t.htmlLang })
}
