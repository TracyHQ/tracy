/**
 * The build chat's start over page (`build-chat-route.js`): the plain question before a fresh start, and the
 * sentence when one is refused. No script and nothing pressed by itself: the form is plain HTML, so a start over
 * happens only when the owner presses the button. Worded in the language of the request (`translator`, the
 * `startOver.*` words of `lib/i18n/strings.js`).
 */
import { escapeHtml } from '../lib/html.js'
import { translator } from '../lib/i18n/index.js'
import { pageShell } from '../lib/page-shell.js'

/** The refusal codes of `fresh-start.js` that have their own sentence in every language. */
const REFUSALS = new Set(['SITE_BUILT', 'BUILD_RUNNING', 'ENGINE_BUSY', 'NO_DRAFT'])

const card = (t, inner) => `<div class="card auth-card">
<div class="card-header">
<h1 class="card-title">${escapeHtml(t('startOver.title'))}</h1>
</div>
<div class="card-content">
${inner}
</div>
</div>`

/**
 * @param {{action: string, back: string, t?: ReturnType<typeof translator>}} params - where the form posts, where
 *   "Keep my conversation" goes, and the words of the request's language (English when none)
 */
export function startOverConfirmPage({ action, back, t = translator() }) {
  return pageShell(
    t('startOver.title'),
    card(
      t,
      `<p class="card-description">${escapeHtml(t('startOver.confirm'))}</p>
<form method="post" action="${escapeHtml(action)}">
<button type="submit">${escapeHtml(t('startOver.title'))}</button>
</form>
<p class="card-description"><a href="${escapeHtml(back)}">${escapeHtml(t('startOver.keep'))}</a></p>`
    ),
    '',
    { lang: t.htmlLang }
  )
}

/**
 * @param {{error?: string, say: string, back: string, t?: ReturnType<typeof translator>}} params - the refusal code
 *   and its English sentence (the sentence is used as is for a code with no translated words), and the way back
 */
export function startOverRefusedPage({ error, say, back, t = translator() }) {
  const sentence = error && REFUSALS.has(error) ? t(`startOver.${error}`) : say
  return pageShell(
    t('startOver.title'),
    card(
      t,
      `<p class="card-description">${escapeHtml(sentence)}</p>
<p class="card-description"><a href="${escapeHtml(back)}">${escapeHtml(t('startOver.back'))}</a></p>`
    ),
    '',
    { lang: t.htmlLang }
  )
}
