/**
 * The operator's voice switch (`composer-voice-input`, /ops › Agents › Voice) as a LIVE session
 * watches it: a listening session (`speech/relay.js`) or a reading (`speech/say.js`) looks again every
 * second, so turning Voice off ends what is running.
 *
 * A session OPENS only on a fresh read of the switch, and a switch the database cannot read refuses it
 * (fail closed, `lib/speech.js`). Once open, a failed read is not a switch turned off. Until 19/10/2026
 * every session read `ui_setting` itself every second and ended as `provider` on any failed read, so one
 * transient database error ended every live voice session at once. Now one reader answers every session
 * of a process from a value at most `SWITCH_FRESH_MS` old, and a read that fails keeps the last value read.
 */

/** How old the switch may be when a running session asks: at most one read per this long per process. */
export const SWITCH_FRESH_MS = 3000

/**
 * @param {() => Promise<boolean>} read - the switch as stored (`speechSwitchOn`); throws when it cannot say
 * @param {{ freshMs?: number, now?: () => number }} [options]
 * @returns {() => Promise<boolean | null>} the switch as last read, null while no read has succeeded;
 *   never rejects. Concurrent askers share one read.
 */
export function switchWatch(read, { freshMs = SWITCH_FRESH_MS, now = Date.now } = {}) {
  /** @type {boolean | null} */
  let known = null
  let readAt = -Infinity
  /** @type {Promise<boolean | null> | null} */
  let reading = null
  return () => {
    if (reading) return reading
    if (now() - readAt < freshMs) return Promise.resolve(known)
    reading = Promise.resolve()
      .then(read)
      .then(
        (on) => {
          known = Boolean(on)
        },
        () => {
          // Unreadable: the last value read stands, and the read is tried again after `freshMs`.
        }
      )
      .then(() => {
        readAt = now()
        reading = null
        return known
      })
    return reading
  }
}
