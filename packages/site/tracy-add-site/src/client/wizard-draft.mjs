/**
 * What the Add site wizard keeps of a person's own picks while its tab is off screen.
 *
 * The right column renders only the tab on screen, so leaving the Add site tab unmounts the wizard
 * and its React state goes with it. "Change design" on the template card does exactly that: it opens
 * Design inspiration in the same column. Coming back without picking a design mounted a fresh wizard
 * on the default CMS (Joomla), with the address field empty — the walkthrough of 11/10/2026 (bug 6)
 * had to pick WordPress a second time. This module holds the picks (CMS, origin card, address) for the
 * life of the page (and the Design system pick), one draft per wizard scope (conversation + shown site, the wizard's own `key`).
 *
 * 🔒 A NEW PRESS STILL WINS. A draft is handed back only to a wizard whose tab carries the SAME press
 * the draft was made under (`pressKey`, `press-state.mjs`). Picking a design in the gallery reopens
 * the tab with a new press — that press moves the pill, as before; only a return with nothing new
 * resumes what the person had picked by hand.
 *
 * Page memory, not storage: a reload starts a clean form, as it always did.
 */

/** Drafts kept at most; the oldest goes first (a person switches conversations, never hundreds). */
const MAX_DRAFTS = 20

/**
 * @typedef {{ pressKey: string | undefined, platform: string, origin: string, name: string,
 *   design?: string, currentStep?: string, doneSteps?: string[], returnToReview?: boolean, customizeSkipped?: boolean, answers?: Record<string, unknown>,
 *   chatApplied?: Record<string, unknown>, chatEdited?: string[],
 *   designSystem?: import('./design-system-pick.mjs').DesignSystemPick | null }} Draft
 */

/** @type {Map<string, Draft>} */
const drafts = new Map()

/**
 * Remember the wizard's picks under its scope.
 * @param {string} scope - the wizard's scope (`<sessionId>:<shown site>`).
 * @param {Draft} draft - the press the picks were made under and the picks themselves.
 */
export function keepDraft(scope, draft) {
  drafts.delete(scope)
  drafts.set(scope, { ...draft })
  while (drafts.size > MAX_DRAFTS) {
    const oldest = drafts.keys().next().value
    if (oldest === undefined) break
    drafts.delete(oldest)
  }
}

/**
 * The draft a wizard mounting under `scope` resumes, or undefined.
 * @param {string} scope - the wizard's scope.
 * @param {string | undefined} pressKey - the press its tab carries now.
 * @returns {Draft | undefined} The draft when it was made under that same press; a new press (or
 *   none kept) gives undefined, and the wizard starts from the press as before.
 */
export function draftOf(scope, pressKey) {
  const draft = drafts.get(scope)
  if (draft === undefined || draft.pressKey !== pressKey) return undefined
  return { ...draft }
}

/**
 * Drop the draft: the site was created, the form starts clean next time.
 * @param {string} scope - the wizard's scope.
 */
export function forgetDraft(scope) {
  drafts.delete(scope)
}

/** Only answer provenance crosses a new chat press; the new platform and entry step still win.
 * @param {string} scope
 */
export function chatCarryOf(scope) {
  const draft = drafts.get(scope)
  if (!draft) return undefined
  return { answers: draft.answers, chatApplied: draft.chatApplied, chatEdited: draft.chatEdited }
}
