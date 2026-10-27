/**
 * The page's one listening place (council 15/10/2026: one microphone at a time). Dictation in any
 * box (`VoiceInput.tsx`) and a voice conversation (`voice-mode.mjs`) each take it before they listen:
 * whoever listened before is finished, its words kept.
 */

/** @type {(() => void) | null} the microphone listening on this page now, by the way to finish it */
let speaking = null

/**
 * Take this page's one listening place: the one listening now finishes, its words kept.
 * @param {() => void} stop - how this one is finished when another takes the place
 * @returns {() => void} give the place back (a no-op once another took it)
 */
export function claimVoice(stop) {
  const previous = speaking
  speaking = stop
  previous?.()
  return () => {
    if (speaking === stop) speaking = null
  }
}
