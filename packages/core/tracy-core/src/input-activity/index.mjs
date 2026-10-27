/**
 * The extra pieces Tracy draws in dsh's `conversation.input.activity`, the chat box's seat between
 * the model chip and Send (#1379).
 *
 * That seat is a dsh `single` slot: only its lowest-priority registration renders, and one that
 * draws nothing still holds it (`SlotCore.entriesOfSlot` in the fork's `ui-slots`). Two Tracy
 * plugins need it: the microphone (`@tracy/dsh-chat-input`, `VoiceInput.tsx`) and Help's stop
 * (`@tracy/dsh-assistant`, `HelpStop.tsx`). So chat-input's occupant is the only registration, and
 * it draws every piece added here after its microphone. A piece draws nothing while it has nothing
 * to show, the way HelpStop does while no Help answer is being written.
 *
 * `@tracy/core` is bundled into each plugin's client, so a module-level list would be one per
 * plugin. The list hangs on the page holder under `Symbol.for('tracy.input-activity')` instead,
 * the way `seat/viewer.tsx` shares its store, and the first bundle to ask builds it.
 */
import { pageHolder } from '../seat/index.mjs'

const PIECES = Symbol.for('tracy.input-activity')

/** @returns {import('./index.d.mts').InputActivity} */
function createPieces() {
  /** @type {readonly import('./index.d.mts').ActivityPiece[]} */
  let pieces = []
  const listeners = new Set()
  const changed = () => {
    for (const listener of listeners) listener()
  }
  return {
    add(id, Component) {
      const piece = { id, Component }
      // The same id again (a plugin applied twice, hot reload) replaces the earlier piece in place.
      const at = pieces.findIndex((p) => p.id === id)
      pieces = at === -1 ? [...pieces, piece] : pieces.map((p, i) => (i === at ? piece : p))
      changed()
      return () => {
        if (!pieces.includes(piece)) return
        pieces = pieces.filter((p) => p !== piece)
        changed()
      }
    },
    list: () => pieces,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

/**
 * The page's list of activity pieces, shared by every bundle on it.
 * @returns {import('./index.d.mts').InputActivity}
 */
export function inputActivity() {
  const holder = pageHolder()
  const known = /** @type {import('./index.d.mts').InputActivity | undefined} */ (holder[PIECES])
  if (known !== undefined) return known
  const made = createPieces()
  holder[PIECES] = made
  return made
}
