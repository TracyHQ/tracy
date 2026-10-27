/**
 * The chat's half of "undo at one door, every door follows" (toolbar contract
 * `tasks/undo-change/toolbar-contract.md` §3): when an undo is said on the page
 * (`TURN_UNDONE_EVENT`, from the Site changes row, the preview's Undo or another card), the page's
 * turns book reads that chat again, so its cards say Undone without a reload.
 *
 * 🔒 NO ECHO. Only `undoTurn` says the event; a read never does. An undo this book itself is running
 * (`undoing`, a card or the preview's Undo of this page) is left alone: its own press reads again
 * when the server answers. A chat the book never read has no card on screen: nothing to read.
 */
import { onTurnUndone, sameSiteKey } from '@tracy/core/turn-undo'

/**
 * @param {{
 *   book: Pick<import('@tracy/core/turn-undo').TurnsBook, 'get' | 'refresh'>,
 *   siteKey: string | null,
 *   target?: EventTarget
 * }} deps - `siteKey`: the site this page is the workspace of; null (the creation workspace): nothing.
 * @returns {() => void} stop following.
 */
export function followTurnUndone({ book, siteKey, target }) {
  if (siteKey === null) return () => {}
  return onTurnUndone(
    (detail) => {
      if (!sameSiteKey(detail.siteKey, siteKey)) return
      const entry = book.get(siteKey, detail.sessionId)
      if (entry === undefined || entry.undoing) return
      void book.refresh(siteKey, detail.sessionId)
    },
    ...(target === undefined ? [] : [target])
  )
}
