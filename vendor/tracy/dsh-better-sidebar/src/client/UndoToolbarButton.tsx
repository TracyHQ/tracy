/**
 * The Browser toolbar's Undo button (TCH #957, `tasks/undo-change/toolbar-contract.md`): the second door
 * of Tracy's turn undo, beside the chat's undo card and Site changes. Tracy says what it shows
 * (`undo-toolbar.ts`); every word on screen comes from that state, none from this fork's locales.
 *
 * - `ready`: a click opens a confirm card under the button; its Undo sends `confirm`.
 * - `off`: dimmed, inert; the tooltip says why.
 * - `blocked`: a warning dot; a click opens a card with the reason and "Open Site changes".
 * - `working`: inert, the working words and a turning icon.
 * - A state carrying `toast` shows a small notice under the button once, for {@link UNDO_TOAST_MS}.
 *
 * Inert states use `aria-disabled` rather than `disabled`, so the tooltip that explains them still shows
 * and a keyboard reaches it. No Redo, no shortcut (contract "Rules").
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { LuLoaderCircle, LuUndo2 } from 'react-icons/lu'
import { AnchoredPopover } from './AnchoredPopover.tsx'
import css from './sidebar.module.css'
import { pressUndoToolbar, useUndoToolbarState, type UndoToolbarAction, type UndoToolbarDetail, type UndoToolbarStore } from './undo-toolbar.ts'

/** How long the "Undone" notice stays (contract §1 `toast`). */
export const UNDO_TOAST_MS = 6_000

/** The cards' width (px, viewport-clamped by the popover). */
const CARD_WIDTH = 300

const cx = (...names: Array<string | false | null | undefined>): string => names.filter(Boolean).join(' ')

/**
 * The state objects whose toast was shown already, page-wide: a re-render, a remount of the tab or a
 * second tab of the session never shows the same notice twice. A new state object is a new notice.
 */
const toastsShown = new WeakSet<UndoToolbarDetail>()

export interface UndoToolbarButtonProps {
  /** The tab's conversation (`props.scope.sessionId`). */
  sessionId: string
  /** The narrow toolbar: the icon alone. */
  compact: boolean
  /** Runs before an `open-changes` press (the Browser tab leaves fullscreen so Site changes can show). */
  onOpenChanges?: () => void
  /** A test's store; the page's by default. */
  store?: UndoToolbarStore | null
  /** Where presses go (the window by default). */
  target?: EventTarget
}

export function UndoToolbarButton(props: UndoToolbarButtonProps): ReactElement | null {
  const { sessionId, compact, onOpenChanges, target } = props
  const detail = useUndoToolbarState(sessionId, props.store)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [card, setCard] = useState<'confirm' | 'blocked' | null>(null)
  const [toast, setToast] = useState<UndoToolbarDetail | null>(null)
  const state = detail?.state ?? null

  /**
   * Close the card. The focus goes back to the button when it was in the card (or nowhere): Escape,
   * Cancel, a press. A click into the page's frame or onto another control keeps the focus it took.
   */
  const closeCard = useCallback((): void => {
    setCard(null)
    const active = document.activeElement
    const inCard = active !== null && cardRef.current !== null && cardRef.current.contains(active)
    if (active === null || active === document.body || inCard) buttonRef.current?.focus()
  }, [])

  const press = useCallback((action: UndoToolbarAction): void => {
    if (action === 'open-changes') onOpenChanges?.()
    pressUndoToolbar(sessionId, action, target)
  }, [sessionId, onOpenChanges, target])

  // A card only lives in its own state: Tracy moving on (working, done, another turn) closes it.
  useEffect(() => {
    if ((card === 'confirm' && state !== 'ready') || (card === 'blocked' && state !== 'blocked')) closeCard()
  }, [card, state, closeCard])

  // An opened card takes the focus once it is placed (the popover measures it hidden first).
  useEffect(() => {
    if (card === null) return
    const frame = requestAnimationFrame(() => {
      cardRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    })
    return () => { cancelAnimationFrame(frame) }
  }, [card])

  // A new state with a toast shows its notice, once.
  useEffect(() => {
    if (detail === null || detail.toast === null || detail.text.toastDone === undefined || toastsShown.has(detail)) return
    toastsShown.add(detail)
    setToast(detail)
  }, [detail])
  useEffect(() => {
    if (toast === null) return
    const timer = setTimeout(() => { setToast(null) }, UNDO_TOAST_MS)
    return () => { clearTimeout(timer) }
  }, [toast])

  if (detail === null) return null
  const { text } = detail
  const inert = state === 'off' || state === 'working'
  const working = state === 'working'
  const shownLabel = working ? text.working ?? text.label : text.label
  const cardTitle = card === 'confirm' ? text.confirmTitle ?? text.label : text.blockedTitle ?? text.label

  return (
    <span className={css.undoWrap}>
      <button
        ref={buttonRef}
        type="button"
        className={cx(css.undoButton, compact && css.undoButtonIcon)}
        aria-label={text.label}
        title={text.tooltip}
        aria-disabled={inert ? 'true' : undefined}
        aria-busy={working ? 'true' : undefined}
        aria-haspopup={state === 'ready' || state === 'blocked' ? 'dialog' : undefined}
        aria-expanded={state === 'ready' || state === 'blocked' ? card !== null : undefined}
        data-undo={state ?? undefined}
        onClick={() => {
          if (inert) return
          if (card !== null) { closeCard(); return }
          setCard(state === 'blocked' ? 'blocked' : 'confirm')
        }}
      >
        {working
          ? <LuLoaderCircle size={14} className={css.commentSpin} aria-hidden />
          : <LuUndo2 size={14} aria-hidden />}
        {!compact && <span>{shownLabel}</span>}
        {state === 'blocked' && <span className={css.undoDot} aria-hidden="true" />}
      </button>
      {toast !== null && toast.text.toastDone !== undefined && (
        <div role="status" className={css.undoToast} data-undo-toast={toast.toast ?? undefined}>
          <span className={css.undoToastText}>{toast.text.toastDone}</span>
          {toast.text.toastAction !== undefined && (
            <button
              type="button"
              className={css.undoToastAction}
              onClick={() => { setToast(null); press('open-changes') }}
            >
              {toast.text.toastAction}
            </button>
          )}
        </div>
      )}
      <AnchoredPopover anchor={card === null ? null : buttonRef.current} onClose={closeCard} width={CARD_WIDTH} label={cardTitle}>
        <div ref={cardRef} className={css.undoCard} data-undo-card={card ?? undefined}>
          <div className={css.undoCardTitle}>{cardTitle}</div>
          {card === 'confirm' && (
            <>
              {text.confirmQuote !== undefined && <p className={css.undoCardQuote}><q>{text.confirmQuote}</q></p>}
              {text.confirmBody !== undefined && <p className={css.undoCardBody}>{text.confirmBody}</p>}
              <div className={css.undoCardActions}>
                {text.cancel !== undefined && (
                  <button type="button" className={css.undoCardGhost} onClick={closeCard}>{text.cancel}</button>
                )}
                <button
                  type="button"
                  className={css.undoCardPrimary}
                  onClick={() => { press('confirm'); closeCard() }}
                >
                  {text.confirmUndo ?? text.label}
                </button>
              </div>
            </>
          )}
          {card === 'blocked' && (
            <>
              {text.blockedBody !== undefined && <p className={css.undoCardBody}>{text.blockedBody}</p>}
              {text.blockedAction !== undefined && (
                <div className={css.undoCardActions}>
                  <button
                    type="button"
                    className={css.undoCardGhost}
                    onClick={() => { closeCard(); press('open-changes') }}
                  >
                    {text.blockedAction}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </AnchoredPopover>
    </span>
  )
}
