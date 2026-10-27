/** Observe the existing Edit UI and its acknowledged, selection-scoped chat submission. */
// ModeBar owns two pressed-state buttons in one group: Interactive first, Edit second.
export const EDIT_CONTROL =
  '[data-browser-tab] [role="group"]:has(> button[aria-pressed] + button[aria-pressed]) > button[aria-pressed]:nth-of-type(2)'
export const PICK_BOX = '[data-browser-tab] [data-comment-box][data-foot="new"]'
export const EDIT_WAIT_STEPS = ['edit', 'pick', 'change']

export function watchTourEdit(step: string, advance: () => void): () => void {
  let done = false
  let submitted: string | null = null
  let request: { requestId: string; sessionId: string } | null = null
  const finish = () => {
    if (done) return
    done = true
    advance()
  }
  const state = () => {
    if (step === 'edit' && document.querySelector(EDIT_CONTROL)?.getAttribute('aria-pressed') === 'true')
      finish()
    if (step === 'pick' && document.querySelector(`${PICK_BOX} textarea`)) finish()
  }
  // Remember only a real Send/Enter from the currently selected component's new-pick box.
  const submit = (event: Event) => {
    if (step !== 'change' || !(event.target instanceof HTMLElement)) return
    const box = event.target.closest(PICK_BOX)
    const field = box?.querySelector('textarea')
    if (!field || field.value.trim() === '') return
    if (event.type === 'keydown') {
      const key = event as KeyboardEvent
      if (event.target !== field || key.key !== 'Enter' || key.shiftKey || key.isComposing) return
    } else {
      const button = event.target.closest<HTMLButtonElement>('button')
      // In a new pick, the owner marks the Send action with its Enter shortcut in every locale.
      if (!button || button.disabled || !button.title.endsWith(' (Enter)')) return
    }
    submitted = field.value.trim()
    request = null
  }
  const send = (event: Event) => {
    if (submitted === null) return
    const detail = (event as CustomEvent).detail
    const siteKey = new URL(document.baseURI).pathname.split('/').filter(Boolean)[0]
    if (
      detail?.siteKey !== siteKey ||
      typeof detail.requestId !== 'string' ||
      typeof detail.sessionId !== 'string' ||
      !Array.isArray(detail.items) ||
      detail.items.length !== 1 ||
      detail.items[0]?.text?.trim() !== submitted ||
      !detail.items[0]?.element ||
      typeof detail.items[0].commentId !== 'string'
    )
      return
    request = { requestId: detail.requestId, sessionId: detail.sessionId }
  }
  const sent = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (request && detail?.requestId === request.requestId && detail?.sessionId === request.sessionId)
      finish()
  }
  const failed = (event: Event) => {
    if ((event as CustomEvent).detail?.requestId === request?.requestId) {
      request = null
      submitted = null
    }
  }
  document.addEventListener('click', submit, true)
  document.addEventListener('keydown', submit, true)
  window.addEventListener('tracy:comment-send', send)
  window.addEventListener('tracy:comment-sent', sent)
  window.addEventListener('tracy:comment-failed', failed)
  state()
  const timer = window.setInterval(state, 100)
  return () => {
    window.clearInterval(timer)
    document.removeEventListener('click', submit, true)
    document.removeEventListener('keydown', submit, true)
    window.removeEventListener('tracy:comment-send', send)
    window.removeEventListener('tracy:comment-sent', sent)
    window.removeEventListener('tracy:comment-failed', failed)
  }
}
