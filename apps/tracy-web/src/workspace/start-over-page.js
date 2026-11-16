/**
 * The build chat's start over page (`build-chat-route.js`): the plain question before a fresh start, and the
 * sentence when one is refused. No script and nothing pressed by itself: the form is plain HTML, so a start over
 * happens only when the owner presses the button. English only for now (a follow-up adds the interface languages).
 */
import { escapeHtml } from '../lib/html.js'
import { pageShell } from '../lib/page-shell.js'

const card = (inner) => `<div class="card auth-card">
<div class="card-header">
<h1 class="card-title">Start over</h1>
</div>
<div class="card-content">
${inner}
</div>
</div>`

/**
 * @param {{confirm: string, action: string, back: string}} params - the sentence, where the form posts, where
 *   "Keep my conversation" goes
 */
export function startOverConfirmPage({ confirm, action, back }) {
  return pageShell(
    'Start over',
    card(`<p class="card-description">${escapeHtml(confirm)}</p>
<form method="post" action="${escapeHtml(action)}">
<button type="submit">Start over</button>
</form>
<p class="card-description"><a href="${escapeHtml(back)}">Keep my conversation</a></p>`)
  )
}

/** @param {{say: string, back: string}} params - why it was refused, and the way back to the conversation */
export function startOverRefusedPage({ say, back }) {
  return pageShell(
    'Start over',
    card(`<p class="card-description">${escapeHtml(say)}</p>
<p class="card-description"><a href="${escapeHtml(back)}">Back to the conversation</a></p>`)
  )
}
