/**
 * The task list of the conversation — dsh's own `TodoPanel` in the input dock, fed by the
 * `todo/write` lines the host half appends while a site is provisioned and built.
 *
 * WHAT THIS OPENS, AND WHEN. dsh draws the panel collapsed and keeps that as local component
 * state; a new line never expands it, and nothing in its API asks it to. So a person who pressed
 * Submit saw a one-line header change under the composer while the site was being made — the
 * progress was there, folded. Plan first-site-build-onboarding §5.4: the panel opens ITSELF when an
 * attempt begins, once; a person who folds it again is not fought by every poll; the next attempt
 * (a retry) opens it once more.
 *
 * WHY THE DOM, AND WHY THAT IS THE RIGHT SEAM. `TodoPanel` lives in dsh's `ui-conversation`, which
 * Tracy pins and does not fork for a one-line preference (CLAUDE.md §0.2, ADR 0004). Its header is
 * a `<button aria-expanded>` inside `[data-testid="todo-panel"]` — a contract its own tests read
 * by — and pressing that button is exactly what a person does. Bounded: the panel appears only
 * after the first `todo/write` lands and the dock re-renders, so this waits a few seconds for it,
 * then gives up quietly.
 */

/** How long to wait for the panel to appear after an attempt begins. */
const REVEAL_BUDGET_MS = 6000
const POLL_MS = 150

const PANEL = '[data-testid="todo-panel"] button[aria-expanded]'

/** Which attempt the panel was last opened for. One open per attempt, however many polls. */
let openedFor: string | null = null

/**
 * Open the task list once for `attempt`. Returns a promise that settles when it was opened, was
 * already open, or the budget ran out — never rejects, since the panel is decoration next to the
 * work it reports.
 * @param attempt - an id that changes per press and per retry: the build id plus the attempt.
 * @param doc - the document to look in; a test hands in its own.
 */
export async function revealTaskPanel(attempt: string, doc: Document = document): Promise<boolean> {
  if (openedFor === attempt) return false
  openedFor = attempt
  const until = Date.now() + REVEAL_BUDGET_MS
  for (;;) {
    const header = doc.querySelector<HTMLButtonElement>(PANEL)
    if (header !== null) {
      if (header.getAttribute('aria-expanded') !== 'true') header.click()
      return true
    }
    if (Date.now() >= until) return false
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

/** Test seam: forget which attempt was last opened. */
export function resetTaskPanelMemory(): void {
  openedFor = null
}
