/**
 * The card dsh draws under a chat turn that changed the site: what it changed, View, and Undo (the
 * latest turn) or Go back to here (an older one), with the confirmation inside the card. Copy and
 * states as Akemi approved them on 06/10/2026 (`plan-verified.html`, door d1). The rules live in
 * `turn-card.mjs` and `turn-undo.mjs`; this file asks the turns door through the page's shared book
 * and draws.
 *
 * ONE CARD PER TURN. It also stands under a turn a Tracy update cut off (#295): the old "Undo all"
 * card no longer registers, and this one keeps that card's two other jobs, the line saying the
 * request was interrupted and Continue (the follow-up through the composer).
 *
 * Mounted in `conversation.chat.turnTail` like `CommentReportCard.tsx`: owner props carry the
 * `TurnLocation`, the runtime shares hand `useChat` / `useInput` / `inputActions`, and the
 * registration's `inject` adds the session id and the page's helpers (the shared book, View, the
 * Site changes tab, the preview reload, the chat send). Shapes are structural, as elsewhere here.
 */

import { interfaceLocale } from '@tracy/core/interface-languages'
import { Undo2 } from 'lucide-react'
import type { JSX } from 'react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { revertMessageOf } from '../../../../core/tracy-core/src/site-tabs/revert-prompt'
import { interruptCause, isInterruptedTurn, readCutTimes, siteKeyFromPath } from './interrupted.mjs'
import { dshUrl } from './dsh-url'
import { isViewerRole, NO_ROLE } from './seat-role.mjs'
import { fallback, type StringKey, type Translate } from './strings'
import { askItemOf, askWhatOf, type Card, cardOf, continueWords, reasonWords, whatOf } from './turn-card.mjs'
import { type createTurnsBook, outcomeKey, type Turn, type TurnsAnswer, undoTurn } from './turn-undo.mjs'

/** The slice of dsh's `TurnLocation` the card reads. */
interface TurnLike {
  turn: number
  start?: { time: number }
  end?: { time: number; data?: { reason?: { kind?: string } } }
}

/** The slice of ui-chat's snapshot the card reads: the turns, and whether the last one ended. */
interface ChatLike {
  timeline: { turnOrder: readonly number[]; turns: ReadonlyMap<number, { end?: unknown }> }
}

export type AskResult = 'sent' | 'no-chat' | 'failed'

export interface TurnUndoCardProps {
  turn?: TurnLike
  useChat?: <T>(selector: (snapshot: ChatLike) => T) => T
  useInput?: <T>(selector: (state: { draft?: string }) => T) => T
  inputActions?: { setDraft?: (text: string) => void; submit?: () => void }
  /** From the registration's `inject`. */
  sessionId?: string
  book?: ReturnType<typeof createTurnsBook>
  /** Bring the site's preview into sight (the open one, else the home page). */
  view?: () => void
  /** Open the right column's Site changes tab. */
  openChanges?: () => void
  /** Ask every open preview of the site to reload, once the undo answered. */
  reloadPreviews?: (sessionId: string) => void
  /** Send one message to this chat (dsh's queue, the draft untouched). */
  askRevert?: (sessionId: string, text: string) => Promise<AskResult>
  /**
   * The page's seat role (`seat-role.mjs`). A Viewer (ADR 0028) sees what a turn changed and View,
   * never Undo, Go back, Ask Tracy to revert or Continue: each of them is a change to the site.
   */
  seatRole?: { subscribe: (fn: () => void) => () => void; getSnapshot: () => string | null }
  /** When deploys cut a running turn of this chat (`readCutTimes`); a test passes its own. */
  readCut?: (sessionId: string) => Promise<number[]>
  t?: Translate
}

const readCutOfHost = (sessionId: string): Promise<number[]> => readCutTimes(sessionId, { dshUrl })

type Phase = { kind: 'idle' } | { kind: 'confirm' } | { kind: 'undoing' }
type Asked = 'idle' | 'sending' | AskResult

/** What the chat looks like right now, as one string: a new turn, or the last one ending, changes it. */
function chatSignal(snapshot: ChatLike): string {
  const order = snapshot.timeline.turnOrder
  const last = order[order.length - 1]
  const ended = last === undefined || snapshot.timeline.turns.get(last)?.end !== undefined
  return `${order.length}:${ended ? 'ended' : 'running'}`
}

/** A time from the record, in the reader's language: hours and minutes today, with the date before. */
export function timeOf(iso: string): string {
  const when = new Date(iso)
  const today = new Date().toDateString() === when.toDateString()
  return when.toLocaleString(interfaceLocale(), {
    ...(today ? {} : { month: 'short', day: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** A random key for one press, so a retried request cannot run the same undo twice on the server. */
function pressKey(): string | undefined {
  try {
    return globalThis.crypto?.randomUUID?.()
  } catch {
    return undefined
  }
}

const noBook = { subscribe: () => () => {}, get: () => undefined }

export function TurnUndoCard(props: TurnUndoCardProps): JSX.Element | null {
  const {
    turn,
    useChat,
    useInput,
    inputActions,
    sessionId,
    book,
    view,
    openChanges,
    reloadPreviews,
    askRevert,
    seatRole = NO_ROLE,
    readCut = readCutOfHost,
    t
  } = props
  const say = (key: StringKey, params?: Record<string, string | number>): string => fallback(t, key, params)
  const siteKey = typeof location === 'undefined' ? null : siteKeyFromPath(location.pathname)
  const ready = book !== undefined && siteKey !== null && typeof sessionId === 'string' && turn !== undefined
  const interrupted = isInterruptedTurn(turn)
  // Hooks run on every render, whether or not this turn shows a card.
  const signal = useChat ? useChat(chatSignal) : ''
  const readOnly = useSyncExternalStore(seatRole.subscribe, () => isViewerRole(seatRole.getSnapshot()))
  const draft = useInput ? useInput((state) => state.draft ?? '') : ''
  const source = book ?? noBook
  const entry = useSyncExternalStore(source.subscribe, () =>
    ready ? source.get(siteKey, sessionId) : undefined
  )
  const context = ready ? JSON.stringify([siteKey, sessionId, turn.turn]) : null
  const [seen, setSeen] = useState(context)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [note, setNote] = useState<{ key: StringKey; params?: Record<string, string | number> } | null>(null)
  const [asked, setAsked] = useState<Asked>('idle')
  const [continued, setContinued] = useState(false)
  /**
   * The book's clock when this card was shown for its chat: only an answer read after it is drawn,
   * so a card handed another chat, or coming back to one, never offers what an earlier read said.
   */
  const [mark, setMark] = useState(() => book?.mark() ?? 0)
  // A card handed another chat or turn starts clean: no confirmation, note or sent state carries over.
  if (seen !== context) {
    setSeen(context)
    setPhase({ kind: 'idle' })
    setNote(null)
    setAsked('idle')
    setContinued(false)
    setMark(book?.mark() ?? 0)
  }
  /** True from the confirming press until the server answered: a second press sends nothing. */
  const busy = useRef(false)
  // What interrupted an interrupted turn: a deploy only when the host's record says so (#1403 item
  // 11). Until it answers, and when it cannot, the sentence that is true either way.
  const [cause, setCause] = useState<'update' | 'restart'>('restart')
  const turnStart = turn?.start?.time
  const turnEnd = turn?.end?.time
  useEffect(() => {
    if (!interrupted || typeof sessionId !== 'string') return
    let alive = true
    void readCut(sessionId).then((cutAt) => {
      if (alive) setCause(interruptCause({ start: { time: turnStart }, end: { time: turnEnd } }, cutAt))
    })
    return () => {
      alive = false
    }
  }, [interrupted, sessionId, turnStart, turnEnd, readCut])
  const interruptedTitle = cause === 'update' ? say('interrupted.title') : say('interrupted.titleRestart')

  useEffect(() => {
    if (!ready) return
    book.want(siteKey, sessionId, signal)
    book.wantSince(siteKey, sessionId, mark)
    // A turn that just started may not be on the server's books yet: ask once more a little later,
    // so the cards above it show "Tracy is working" instead of an Undo the server would refuse.
    if (!signal.endsWith(':running')) return
    const later = window.setTimeout(() => book.want(siteKey, sessionId, `${signal}:later`), 2000)
    return () => window.clearTimeout(later)
  }, [ready, book, siteKey, sessionId, signal, mark])

  if (!ready) return null
  const fresh = entry !== undefined && entry.answerFrom > mark
  const answer: TurnsAnswer | null = fresh ? entry.answer : null
  if (answer === null) {
    if (!interrupted) return null
    if (entry === undefined || entry.status === 'loading' || entry.startedAt <= mark)
      return <div className="tv-undo tv-undo-quiet">{say('interrupted.loading')}</div>
    return (
      <div className="tv-undo" role="status">
        <p className="tv-undo-title" data-interrupt-cause={cause}>
          {interruptedTitle}
        </p>
        <p className="tv-undo-line">{say('interrupted.unknown')}</p>
      </div>
    )
  }
  const card = cardOf(answer, turn.turn)
  if (card === null) {
    if (!interrupted) return null
    const row = answer.turns.find((r) => r.turn === turn.turn)
    return (
      <div className="tv-undo tv-undo-quiet">
        {say(row === undefined ? 'interrupted.unknown' : 'interrupted.nothing')}
      </div>
    )
  }
  const row: Turn = card.turn
  /** An undo of this chat is in flight (this card's or another's): no new one may start. */
  const chatUndoing = entry?.undoing === true
  const what = whatOf(row, say)
  const cut = interrupted ? (
    <p className="tv-undo-cut" data-interrupt-cause={cause}>
      {interruptedTitle}
    </p>
  ) : null

  const onConfirm = async (): Promise<void> => {
    // One undo per chat at a time: this card's own second press, and every other card of the chat
    // while this one runs, start nothing (#802 fence, kept from the old card).
    if (busy.current || card.kind !== 'ready' || !book.begin(siteKey, sessionId)) return
    busy.current = true
    setPhase({ kind: 'undoing' })
    try {
      const outcome = await undoTurn({
        siteKey,
        sessionId,
        turnId: row.turnId,
        scope: card.action === 'undo' ? 'turn' : 'from-here',
        idemKey: pressKey()
      })
      const key = outcomeKey(outcome)
      setNote(key === null ? null : { key, params: outcome.kind === 'refused' ? { code: outcome.code } : {} })
      // Read the turns again whatever the answer: a refusal may mean the card is behind the site.
      await book.refresh(siteKey, sessionId)
      if (outcome.kind !== 'refused') reloadPreviews?.(sessionId)
    } finally {
      busy.current = false
      book.end(siteKey, sessionId)
      setPhase({ kind: 'idle' })
    }
  }

  const askMessage =
    card.kind === 'blocked' || card.kind === 'emdash'
      ? revertMessageOf(
          askItemOf(row, { cms: answer.cms, sessionId }),
          { siteKey, cms: answer.cms },
          say('undo.askMessage', { what: askWhatOf(row) ?? say('undo.askThis') })
        )
      : null
  const onAsk = (): void => {
    if (askMessage === null || askRevert === undefined || asked === 'sending' || asked === 'sent') return
    setAsked('sending')
    askRevert(sessionId, askMessage).then(setAsked, () => setAsked('failed'))
  }
  const askButton =
    askMessage !== null && askRevert !== undefined ? (
      <button
        type="button"
        className="tv-undo-button"
        disabled={asked === 'sending' || asked === 'sent'}
        onClick={onAsk}
      >
        {say('undo.ask')}
      </button>
    ) : null
  const askLine =
    asked === 'idle' ? null : (
      <p className="tv-undo-line tv-undo-muted" role="status">
        {say(
          asked === 'sending'
            ? 'undo.askSending'
            : asked === 'sent'
              ? 'undo.askSent'
              : asked === 'no-chat'
                ? 'undo.askNoChat'
                : 'undo.askFailed'
        )}
      </p>
    )

  const canContinue =
    interrupted &&
    !continued &&
    draft === '' &&
    typeof inputActions?.submit === 'function' &&
    phase.kind === 'idle'
  const onContinue = (): void => {
    // The composer's own path, as `InterruptedCard` did: a follow-up queued like a typed message.
    const words = continueWords(row)
    inputActions?.setDraft?.(say(words.key, words.params))
    window.setTimeout(() => inputActions?.submit?.(), 60)
    setContinued(true)
  }
  const continueButton =
    interrupted && !readOnly ? (
      <button
        type="button"
        className="tv-undo-button"
        disabled={!canContinue}
        title={draft === '' ? undefined : say('interrupted.continueHint')}
        onClick={onContinue}
      >
        {say('interrupted.continue')}
      </button>
    ) : null
  const viewButton =
    view === undefined ? null : (
      <button type="button" className="tv-undo-button tv-undo-ghost" onClick={view}>
        {say('undo.view')}
      </button>
    )
  const noteLine =
    note === null ? null : (
      <p className="tv-undo-line" role="status">
        {say(note.key, note.params)}
      </p>
    )

  if (card.kind === 'undone')
    return (
      <div className="tv-undo tv-undo-done" data-undo-state="undone">
        {cut}
        <p className="tv-undo-title tv-undo-with-icon">
          <Undo2 aria-hidden="true" />
          {say('undo.undone')}
        </p>
        <p className="tv-undo-line tv-undo-muted">
          {say('undo.undoneLine')}{' '}
          {openChanges === undefined ? null : (
            <button type="button" className="tv-undo-link" onClick={openChanges}>
              {say('undo.seeChanges')}
            </button>
          )}
        </p>
        {noteLine}
        {continueButton ? <div className="tv-undo-actions tv-undo-foot">{continueButton}</div> : null}
      </div>
    )

  // A Viewer (an undone card returned above): what changed and View, nothing that changes the site again.
  if (readOnly)
    return (
      <div className="tv-undo" data-undo-state="read-only">
        {cut}
        <div className="tv-undo-row">
          <div className="tv-undo-text">
            <p className="tv-undo-title">{say('undo.changed')}</p>
            {what === '' ? null : <p className="tv-undo-line tv-undo-muted">{what}</p>}
          </div>
          {viewButton ? <div className="tv-undo-actions">{viewButton}</div> : null}
        </div>
      </div>
    )

  if (card.kind === 'blocked')
    return (
      <div className="tv-undo" data-undo-state="blocked">
        {cut}
        <p className="tv-undo-title tv-undo-warn">{say('undo.cannot')}</p>
        <p className="tv-undo-line tv-undo-muted">{blockedSentence(card, answer, say)}</p>
        {noteLine}
        {askLine}
        {askButton || continueButton ? (
          <div className="tv-undo-actions tv-undo-foot">
            {continueButton}
            {askButton}
          </div>
        ) : null}
      </div>
    )

  if (phase.kind === 'confirm' && card.kind === 'ready')
    return (
      <div className="tv-undo" data-undo-state="confirm">
        <p className="tv-undo-title">
          {say(card.action === 'undo' ? 'undo.confirmTitle' : 'undo.confirmGoBackTitle')}
        </p>
        {what === '' ? null : <p className="tv-undo-line tv-undo-muted">{say('undo.putsBack', { what })}</p>}
        {card.later > 0 ? (
          <p className="tv-undo-line tv-undo-muted">
            {say(card.later === 1 ? 'undo.alsoLater.one' : 'undo.alsoLater.other', { count: card.later })}
          </p>
        ) : null}
        <p className="tv-undo-line tv-undo-muted">{say('undo.scope')}</p>
        <div className="tv-undo-actions tv-undo-foot">
          <button type="button" className="tv-undo-button" onClick={() => setPhase({ kind: 'idle' })}>
            {say('undo.cancel')}
          </button>
          <button
            type="button"
            className="tv-undo-button tv-undo-primary"
            disabled={chatUndoing}
            onClick={() => void onConfirm()}
          >
            {say(card.action === 'undo' ? 'undo.undo' : 'undo.goBackConfirm')}
          </button>
        </div>
      </div>
    )

  if (phase.kind === 'undoing')
    return (
      <div className="tv-undo" data-undo-state="undoing" role="status">
        <p className="tv-undo-title tv-undo-with-icon">
          <span className="tv-undo-spin" aria-hidden="true" />
          {say('undo.undoing')}
        </p>
        {what === '' ? null : <p className="tv-undo-line tv-undo-muted">{what}</p>}
      </div>
    )

  // Ready, disabled (Tracy working / role) and EmDash share one layout: what changed, then actions.
  const label = card.kind === 'emdash' ? null : say(card.action === 'undo' ? 'undo.undo' : 'undo.goBack')
  const undoButton =
    card.kind === 'emdash' || label === null ? null : (
      <button
        type="button"
        className="tv-undo-button tv-undo-with-icon"
        disabled={card.kind !== 'ready' || chatUndoing}
        onClick={() => {
          setNote(null)
          setPhase({ kind: 'confirm' })
        }}
      >
        {card.action === 'undo' ? <Undo2 aria-hidden="true" /> : null}
        {label}
      </button>
    )
  return (
    <div className="tv-undo" data-undo-state={card.kind}>
      {cut}
      <div className="tv-undo-row">
        <div className="tv-undo-text">
          <p className="tv-undo-title">{say('undo.changed')}</p>
          {what === '' ? null : <p className="tv-undo-line tv-undo-muted">{what}</p>}
        </div>
        <div className="tv-undo-actions">
          {viewButton}
          {undoButton}
          {card.kind === 'emdash' ? askButton : null}
        </div>
      </div>
      {card.kind === 'disabled' ? (
        <p className="tv-undo-line tv-undo-muted">{say(card.note.key, card.note.params)}</p>
      ) : null}
      {noteLine}
      {card.kind === 'emdash' ? askLine : null}
      {continueButton ? <div className="tv-undo-actions tv-undo-foot">{continueButton}</div> : null}
    </div>
  )
}

/** The blocked card's sentence, its times in the reader's language. */
function blockedSentence(
  card: Extract<Card, { kind: 'blocked' }>,
  answer: TurnsAnswer,
  say: (key: StringKey, params?: Record<string, string | number>) => string
): string {
  const words = reasonWords(card.turn.undo.reasons[0], answer.cms, say, timeOf)
  return say(words.key, words.params)
}
