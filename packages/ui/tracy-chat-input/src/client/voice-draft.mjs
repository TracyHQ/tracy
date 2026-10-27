/**
 * Where dictated words stand in the chat box while they are spoken (`VoiceInput.tsx`).
 *
 * The speech service sends the phrase being spoken again and again as it revises it, then the
 * finished phrase (`apps/tracy-web/src/speech/relay.js`). The chat box shows all of it live, at one
 * place in the draft: every `show` replaces exactly what the previous one wrote, through dsh's
 * `inputActions.insertText(text, span)` — one plain-text edit over a span, refused once the draft's
 * revision is not the one this writer left (`ui-conversation` `InputActions`).
 *
 * 🔒 THE DRAFT STAYS THE PERSON'S.
 *   - The words go at the caret, AFTER any selection: a selection is never replaced, so Cancel
 *     (`show('')`) gives back exactly the draft that was there (council 15/10/2026: replacing a
 *     selection and then removing only the dictated words loses what was selected).
 *   - A refused edit means the person typed, pasted or sent in between: the writer stops for good
 *     (`detached`) and never writes over them. Moving the caret does not change the revision, so
 *     the words keep their place while the person clicks around.
 *   - An unchanged text is not written again: no edit, no extra undo step.
 *
 * Offsets are dsh's detect coordinates; the draft's text (`InputState.draft`) is its clipboard
 * text. They are the same string unless the draft holds a reference chip, and the draft's text is
 * read only to decide on one space before and after the words.
 */

/** Scripts written without spaces between words (CJK, kana, full-width forms) and their punctuation. */
const NO_SPACE_END = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]$/u
const NO_SPACE_START = /^[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯,.;:!?)\]}]/u

/**
 * Two pieces of spoken text, joined as they are written: a space between words, none in a script
 * written without spaces, none before closing punctuation.
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function glue(a, b) {
  if (a === '') return b
  if (b === '') return a
  return NO_SPACE_END.test(a) || NO_SPACE_START.test(b) ? a + b : `${a} ${b}`
}

/**
 * The words to show: every finished phrase, then the one being spoken.
 * @param {readonly string[]} committed
 * @param {string} partial
 * @returns {string}
 */
export function spokenText(committed, partial) {
  return [...committed, partial]
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '')
    .reduce(glue, '')
}

/**
 * @typedef {{ start: number, end: number, draftRev: number }} TokenSpan
 * @typedef {{ captureInsertion(): TokenSpan, insertText(text: string, span: TokenSpan): boolean }} DraftActions
 */

/**
 * Open the dictation's place in the draft, at the caret as it is now.
 * @param {DraftActions} actions - the session's `inputActions`.
 * @param {string} draft - the draft's text now.
 */
export function draftWriter(actions, draft) {
  const caret = actions.captureInsertion()
  const at = caret.end
  let rev = caret.draftRev
  let written = ''
  let detached = false
  const before = draft.slice(0, at)
  const after = draft.slice(at)
  const lead = before !== '' && !/\s$/u.test(before) && !NO_SPACE_END.test(before)
  const trail = after !== '' && !/^\s/u.test(after)
  return {
    /** The writer stopped: the person changed the draft, or it was told to stop. */
    get detached() {
      return detached
    },
    /** Whether the draft holds dictated words right now. */
    get wrote() {
      return written !== ''
    },
    /**
     * Show `text` in place of what this writer showed before; `''` takes it all out.
     * @param {string} text
     * @returns {boolean} false once the draft is no longer this writer's.
     */
    show(text) {
      if (detached) return false
      const words = text === '' ? '' : `${lead ? ' ' : ''}${text}${trail ? ' ' : ''}`
      if (words === written) return true
      if (!actions.insertText(words, { start: at, end: at + written.length, draftRev: rev })) {
        detached = true
        return false
      }
      written = words
      rev = actions.captureInsertion().draftRev
      return true
    },
    /** Stop writing; what is in the draft stays. */
    detach() {
      detached = true
    }
  }
}
