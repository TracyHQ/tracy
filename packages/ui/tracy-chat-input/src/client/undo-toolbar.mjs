/**
 * The preview toolbar's Undo, Tracy's half (toolbar contract `tasks/undo-change/toolbar-contract.md`
 * §1, §2). The Browser toolbar is drawn by the `dsh-better-sidebar` fork, which imports nothing of
 * Tracy's: it draws what `tracy:undo-toolbar-state` says for its conversation and says a press back
 * on `tracy:undo-toolbar-press`. This module says the state (every word already translated, in the
 * chat card's own words) and runs the press through the SAME engine and book as the card under the
 * chat turn (`@tracy/core/turn-undo`): one undo, three doors.
 *
 * Which conversation: the one on screen (`mainSessionOf`), the one whose Browser tab is in sight.
 * When the screen moves to another, the one left is said `hidden` (nobody keeps its state fresh any
 * more, and the contract draws no button nobody drives), and the new one is read afresh before an
 * Undo is offered (#802 fence, as the card: an answer read before it came on screen never counts).
 *
 * When it is said: on every change of the page's turns book (a read started or answered, an undo
 * begun or ended), when a turn of the conversation starts or ends (`tracy:tracy-working`,
 * `tracy:turn-end` from `comment-status.mjs`), when the conversation on screen changes, and again
 * (forced) whenever the side card's tab registry changes, so a toolbar whose plugin loaded after the
 * last state still gets it. The same state is not said twice in a row.
 *
 * WHAT IT UNDOES: the newest thing — the chat's newest change, or the site's newest design system
 * apply (the Design system button) when that came after it (`newestUndoOf`). A design system apply is
 * not a chat turn: its undo is the Design system door's (`undoDesignSystemApply`), with that door's
 * rules (only the newest apply, only while the site still holds what it wrote, never a Viewer), and the
 * toolbar says it in its own words ("Undo the design system …"). On EmDash, where chat turns have no
 * undo, the button shows only for such an apply.
 *
 * The state is pure (`toolbarDetailOf`); `watchUndoToolbar` is the wiring `index.tsx` runs.
 */
import {
  cardOf,
  newestUndoOf,
  onDesignSystemChanged,
  outcomeKey,
  reasonWords,
  sameSiteKey,
  undoDesignSystemApply,
  undoTurn,
  whatOf
} from '@tracy/core/turn-undo'
import { TURN_END_EVENT, WORKING_EVENT } from './comment-status.mjs'
import { askWhatOf } from './turn-card.mjs'

export const UNDO_TOOLBAR_STATE_EVENT = 'tracy:undo-toolbar-state'
export const UNDO_TOOLBAR_PRESS_EVENT = 'tracy:undo-toolbar-press'

/** After a turn ends, how long the cards have to read the turns before this module reads them itself. */
export const TURN_END_READ_MS = 1500

/**
 * @typedef {import('@tracy/core/turn-undo').BookEntry} BookEntry
 * @typedef {import('@tracy/core/turn-undo').Turn} Turn
 * @typedef {import('@tracy/core/turn-undo').TurnsBook} TurnsBook
 * @typedef {import('@tracy/core/turn-undo').DesignSystemApply} DesignSystemApply
 * @typedef {import('./strings').StringKey} StringKey
 * @typedef {(key: StringKey, params?: Record<string, string | number>) => string} Say
 * @typedef {'ready' | 'off' | 'blocked' | 'working' | 'hidden'} ToolbarState
 * @typedef {{
 *   label: string, tooltip: string, confirmTitle?: string, confirmQuote?: string, confirmBody?: string,
 *   confirmUndo?: string, cancel?: string, blockedTitle?: string, blockedBody?: string,
 *   blockedAction?: string, working?: string, toastDone?: string, toastAction?: string
 * }} ToolbarText
 * @typedef {{ sessionId: string, siteKey: string, state: ToolbarState, text: ToolbarText, toast: 'done' | 'partial' | null }} ToolbarDetail
 * @typedef {{ kind: 'done' | 'partial', text: string }} Toast
 */

/**
 * The newest turn of the chat that changed the site and is not undone (the server's `latest`), or
 * undefined when there is none.
 * @param {{ turns: Turn[] }} answer
 * @returns {Turn | undefined}
 */
export function latestTurnOf(answer) {
  return answer.turns.filter((t) => t.changed && t.undo.latest).at(-1)
}

/**
 * What the toolbar of one conversation shows now.
 * @param {{
 *   sessionId: string,
 *   siteKey: string | null,
 *   entry: BookEntry | undefined,
 *   mark: number,
 *   running: boolean,
 *   say: Say,
 *   timeOf?: (iso: string) => string
 * }} at - `entry`: the page's book for (site, session); `mark`: the book's clock when the conversation
 *   came on screen (only an answer read after it counts); `running`: a turn of it runs now.
 * @returns {ToolbarDetail}
 */
export function toolbarDetailOf({ sessionId, siteKey, entry, mark, running, say, timeOf }) {
  const label = say('undo.undo')
  /** @param {ToolbarState} state @param {string} tooltip @param {Partial<ToolbarText>} [more] @returns {ToolbarDetail} */
  const detail = (state, tooltip, more = {}) => ({
    sessionId,
    siteKey: siteKey ?? '',
    state,
    text: { label, tooltip, ...more },
    toast: null
  })
  // Not a site's workspace: no undo here at all.
  if (siteKey === null) return detail('hidden', label)
  const answer = entry !== undefined && entry.answerFrom > mark ? entry.answer : null
  const newest = answer === null ? null : newestUndoOf(answer)
  // EmDash keeps no receipts and no file history: no Undo button for a chat turn (ADR 0024 §3), as
  // the card — only for a design system apply, which keeps its own.
  if (answer?.cms === 'emdash' && newest?.kind !== 'design-system') return detail('hidden', label)
  if (entry?.undoing === true) {
    const working = say('undo.undoing')
    return detail('working', working, { working })
  }
  if (answer === null) {
    // A door that does not answer (an older server, signed out): no button, never a guess.
    if (entry !== undefined && entry.status === 'failed' && entry.startedAt > mark)
      return detail('hidden', label)
    return detail('off', say('toolbar.checking'))
  }
  if (newest?.kind === 'design-system') {
    const apply = newest.apply
    if (running || answer.siteBusy) return detail('off', say('undo.working'))
    if (!apply.canUndo) return detail('off', say('undo.needsCode'))
    const name = systemName(apply)
    return detail('ready', say('toolbar.dsTooltip', { name }), {
      confirmTitle: say('toolbar.dsConfirmTitle'),
      confirmQuote: name,
      confirmBody: [
        apply.previous === null
          ? say('toolbar.dsPutsBackTemplate')
          : say('toolbar.dsPutsBack', { name: apply.previous.name ?? apply.previous.id }),
        say('toolbar.dsScope')
      ].join(' '),
      confirmUndo: say('undo.undo'),
      cancel: say('undo.cancel')
    })
  }
  const latest = latestTurnOf(answer)
  const first = latest?.undo.reasons[0]
  if (latest?.undo.reasons.some((r) => r.code === 'NO_UNDO_ON_EMDASH')) return detail('hidden', label)
  if (running || answer.siteBusy || first?.code === 'TURN_OPEN') return detail('off', say('undo.working'))
  if (latest === undefined) return detail('off', say('toolbar.nothing'))
  const request = askWhatOf(latest)
  const what = whatOf(latest, say)
  if (latest.undo.state === 'available') {
    const intro = request === null ? say('toolbar.tooltip') : say('toolbar.tooltipRequest', { request })
    return detail('ready', what === '' ? intro : `${intro} · ${what}`, {
      confirmTitle: say('toolbar.confirmTitle'),
      ...(request === null ? {} : { confirmQuote: request }),
      confirmBody: [what === '' ? null : say('undo.putsBack', { what }), say('undo.scope')]
        .filter((line) => line !== null)
        .join(' '),
      confirmUndo: say('undo.undo'),
      cancel: say('undo.cancel')
    })
  }
  if (first?.code === 'MISSING_TOOLSET')
    return detail('off', say(first.toolset === 'content' ? 'undo.needsContent' : 'undo.needsCode'))
  const why = reasonWords(first, answer.cms, say, timeOf)
  const blockedTitle = say('toolbar.blockedTitle')
  return detail('blocked', blockedTitle, {
    blockedTitle,
    blockedBody: say(why.key, why.params),
    blockedAction: say('toolbar.openChanges')
  })
}

/**
 * The line a finished press leaves as the toolbar's one-time notice, or null for none: a clean undo
 * says what went back; anything else that has words (part of it, no clear answer, a refusal the
 * fresh state does not explain) is said as `partial`, in the card's own sentence.
 * @param {import('@tracy/core/turn-undo').UndoOutcome} outcome
 * @param {string | null} request - the request undone, as `askWhatOf` cut it.
 * @param {Say} say
 * @returns {Toast | null}
 */
export function toastOf(outcome, request, say) {
  if (outcome.kind === 'done')
    return {
      kind: 'done',
      text: request === null ? say('undo.undone') : say('toolbar.toastDone', { request })
    }
  const key = outcomeKey(outcome)
  if (key === null) return null
  return { kind: 'partial', text: say(key, outcome.kind === 'refused' ? { code: outcome.code } : {}) }
}

/** A design system's name as the toolbar says it (the library's name; its id when none was kept). */
const systemName = (/** @type {DesignSystemApply} */ apply) => apply.name ?? apply.id

/**
 * The notice a design system undo leaves, or null when the re-read toolbar says it all (it is no
 * longer the newest apply, or it was already undone elsewhere).
 * @param {Awaited<ReturnType<typeof undoDesignSystemApply>>} outcome
 * @param {string} name
 * @param {Say} say
 * @returns {Toast | null}
 */
export function designSystemToastOf(outcome, name, say) {
  if (outcome.kind === 'done') return { kind: 'done', text: say('toolbar.dsToastDone', { name }) }
  if (outcome.kind === 'unsure') return { kind: 'partial', text: say('undo.result.unsure') }
  if (outcome.code === 'DS_CHANGED_SINCE') return { kind: 'partial', text: say('toolbar.dsChangedSince') }
  if (outcome.code === 'DS_NOT_LATEST' || outcome.code === 'DS_UNDO_USED') return null
  const key = outcomeKey(outcome)
  return key === null ? null : { kind: 'partial', text: say(key, { code: outcome.code }) }
}

/** A random key for one press, so a retried request cannot run the same undo twice (as the card). */
function pressKey() {
  try {
    return globalThis.crypto?.randomUUID?.()
  } catch {
    return undefined
  }
}

/**
 * Say the toolbar's state for the conversation on screen and run its presses.
 * @param {{
 *   book: TurnsBook,
 *   siteKey: string | null,
 *   sessionOnScreen: () => string | undefined,
 *   subscribeSessions: (listener: () => void) => () => void,
 *   target: EventTarget,
 *   say: Say,
 *   timeOf?: (iso: string) => string,
 *   reloadPreviews: (sessionId: string) => void,
 *   openChanges: () => void,
 *   subscribeRegistry?: (listener: () => void) => () => void,
 *   undo?: typeof undoTurn,
 *   undoDesignSystem?: typeof undoDesignSystemApply,
 *   later?: (fn: () => void, ms: number) => unknown,
 *   readOnly?: () => boolean,
 *   subscribeReadOnly?: (listener: () => void) => () => void
 * }} deps - `subscribeRegistry`: the side card's tab registry (a toolbar plugin arriving late);
 *   `readOnly`: the seat may not change the site (a Viewer, ADR 0028), so the button is `hidden` and
 *   a press runs nothing; `undo` and `later` are for tests.
 * @returns {() => void} stop.
 */
export function watchUndoToolbar(deps) {
  const { book, siteKey, target, say } = deps
  const undo = deps.undo ?? undoTurn
  const undoDesignSystem = deps.undoDesignSystem ?? undoDesignSystemApply
  const later = deps.later ?? ((fn, ms) => setTimeout(fn, ms))
  /** @type {string | undefined} */
  let current
  let mark = 0
  /** Conversations a turn runs in now (from the progress events). @type {Set<string>} */
  const running = new Set()
  /** The last detail said per conversation, as JSON, so the same state is not said twice. */
  const said = new Map()
  /** A notice waiting for the press's end, per conversation. @type {Map<string, Toast>} */
  const toasts = new Map()
  let stopped = false

  // The target's own realm makes the event when it has one (a window), as `announceTurnUndone`.
  const Make =
    /** @type {{ CustomEvent?: typeof CustomEvent }} */ (target).CustomEvent ?? globalThis.CustomEvent
  /** @param {ToolbarDetail} detail @param {boolean} force */
  const send = (detail, force) => {
    const json = JSON.stringify(detail)
    if (!force && said.get(detail.sessionId) === json) return
    said.set(detail.sessionId, json)
    target.dispatchEvent(new Make(UNDO_TOOLBAR_STATE_EVENT, { detail }))
  }
  const publish = (force = false) => {
    if (stopped || current === undefined) return
    const detail = toolbarDetailOf({
      sessionId: current,
      siteKey,
      entry: siteKey === null ? undefined : book.get(siteKey, current),
      mark,
      running: running.has(current),
      say,
      timeOf: deps.timeOf
    })
    // A seat that may not change the site gets no button: hidden, never a disabled one.
    if (deps.readOnly?.() === true) {
      detail.state = 'hidden'
      detail.toast = null
    }
    // The notice rides the first state after the press ended, never a `working` one.
    const toast = detail.state === 'working' ? undefined : toasts.get(current)
    if (toast !== undefined) {
      toasts.delete(current)
      detail.toast = toast.kind
      detail.text.toastDone = toast.text
      detail.text.toastAction = say('start.site.changes')
    }
    send(detail, force)
  }
  const follow = () => {
    const next = deps.sessionOnScreen()
    if (next === current) return
    // The conversation left: nobody keeps its button fresh any more.
    if (current !== undefined)
      send(
        {
          sessionId: current,
          siteKey: siteKey ?? '',
          state: 'hidden',
          text: { label: say('undo.undo'), tooltip: say('undo.undo') },
          toast: null
        },
        false
      )
    current = next
    mark = book.mark()
    if (current !== undefined && siteKey !== null) book.wantSince(siteKey, current, mark)
    publish()
  }
  /** @param {Event} event */
  const onWorking = (event) => {
    const id = /** @type {CustomEvent} */ (event).detail?.sessionId
    if (typeof id !== 'string') return
    running.add(id)
    if (id === current) publish()
  }
  /** @param {Event} event */
  const onTurnEnd = (event) => {
    const id = /** @type {CustomEvent} */ (event).detail?.sessionId
    if (typeof id !== 'string') return
    running.delete(id)
    if (id !== current || siteKey === null) return
    publish()
    // The turn's own cards read the turns as it ends; read here only if none did meanwhile.
    const since = book.mark()
    later(() => {
      if (!stopped && current === id) book.wantSince(siteKey, id, since)
    }, TURN_END_READ_MS)
  }
  /** @param {string} sessionId */
  const confirm = async (sessionId) => {
    if (siteKey === null || sessionId !== current) return
    if (deps.readOnly?.() === true) return publish(true)
    const entry = book.get(siteKey, sessionId)
    const answer = entry !== undefined && entry.answerFrom > mark ? entry.answer : null
    const newest = answer === null ? null : newestUndoOf(answer)
    if (answer !== null && newest?.kind === 'design-system') {
      const apply = newest.apply
      // Only what the toolbar offered: the newest apply, undoable by this seat, the site not busy.
      if (!apply.canUndo || running.has(sessionId) || answer.siteBusy) return publish(true)
      if (!book.begin(siteKey, sessionId)) return
      try {
        const outcome = await undoDesignSystem({ siteKey, applyId: apply.applyId })
        const toast = designSystemToastOf(outcome, systemName(apply), say)
        if (toast !== null) toasts.set(sessionId, toast)
        await book.refresh(siteKey, sessionId)
        if (outcome.kind !== 'refused') deps.reloadPreviews(sessionId)
      } finally {
        book.end(siteKey, sessionId)
      }
      return
    }
    const latest = answer === null ? undefined : latestTurnOf(answer)
    const card = answer === null || latest === undefined ? null : cardOf(answer, latest.turn)
    // Only what the toolbar offered: the latest turn, undoable now. Anything else: say the truth again.
    if (latest === undefined || card?.kind !== 'ready' || card.action !== 'undo' || running.has(sessionId))
      return publish(true)
    if (!book.begin(siteKey, sessionId)) return
    try {
      const outcome = await undo({
        siteKey,
        sessionId,
        turnId: latest.turnId,
        scope: 'turn',
        idemKey: pressKey()
      })
      const toast = toastOf(outcome, askWhatOf(latest), say)
      if (toast !== null) toasts.set(sessionId, toast)
      await book.refresh(siteKey, sessionId)
      if (outcome.kind !== 'refused') deps.reloadPreviews(sessionId)
    } finally {
      book.end(siteKey, sessionId)
    }
  }
  /** @param {Event} event */
  const onPress = (event) => {
    const d = /** @type {CustomEvent} */ (event).detail
    if (d === null || typeof d !== 'object' || typeof d.sessionId !== 'string') return
    if (d.action === 'open-changes') deps.openChanges()
    else if (d.action === 'confirm') void confirm(d.sessionId)
  }

  // A design system put on or taken off at another door (the panel, a Site changes row): the chat's
  // turns are read again, so the toolbar offers the newest apply, or stops offering an undone one.
  // An undo this toolbar runs itself reads when it answers.
  const stopDesignSystem = onDesignSystemChanged((d) => {
    if (siteKey === null || current === undefined || !sameSiteKey(d.siteKey, siteKey)) return
    if (book.get(siteKey, current)?.undoing === true) return
    void book.refresh(siteKey, current)
  }, target)
  const stopBook = book.subscribe(() => publish())
  const stopSessions = deps.subscribeSessions(follow)
  const stopRegistry = deps.subscribeRegistry?.(() => publish(true)) ?? (() => {})
  const stopReadOnly = deps.subscribeReadOnly?.(() => publish(true)) ?? (() => {})
  target.addEventListener(WORKING_EVENT, onWorking)
  target.addEventListener(TURN_END_EVENT, onTurnEnd)
  target.addEventListener(UNDO_TOOLBAR_PRESS_EVENT, onPress)
  follow()
  return () => {
    stopped = true
    stopDesignSystem()
    stopBook()
    stopSessions()
    stopRegistry()
    stopReadOnly()
    target.removeEventListener(WORKING_EVENT, onWorking)
    target.removeEventListener(TURN_END_EVENT, onTurnEnd)
    target.removeEventListener(UNDO_TOOLBAR_PRESS_EVENT, onPress)
  }
}
