// Browser errors that `errors.mjs` rightly calls Tracy's, that were already there before this suite
// measured anything, and that are raised on their own (not fixed by a journey). A journey that
// meets one moves it from its fails to its notes, by name, so the verdict stays about the mechanism
// the journey checks — and the report still shows the error every time it happens.
//
// Each entry names where it was first seen and where it is raised. An entry that no longer
// matches anything should be deleted, not kept "just in case".

/**
 * @typedef {{ id: string, match: (e: { url?: string, message?: string }) => boolean, seen: string }} KnownError
 */

/** @type {KnownError[]} */
export const KNOWN_ERRORS = [
  {
    // The `dsh-subscriptions` fork's client (`vendor/tracy/dsh-subscriptions/lib/client.js`) asks
    // `/dsh-subscriptions/status` on the `/new/` workspace and nothing answers it there (404).
    // Measured by agent H in S0 (04/10/2026, `GET /` of an account with no site) and again by
    // J2a/J9 on `/new/` the same day; the site workspace `/<siteKey>/` does not ask it.
    id: 'dsh-subscriptions-status-404',
    match: (e) => /\/dsh-subscriptions\/status(?:\?|$)/.test(e.url ?? ''),
    seen: 'S0 04/10/2026; J2a, J9 04/10/2026'
  }
]

/**
 * Split `fails` (from `triage`) into the ones still failing and the known ones, each known one
 * tagged with its id for the notes.
 * @template {{ url?: string, message?: string }} T
 * @param {T[]} fails
 * @returns {{ fails: T[], known: (T & { known: string })[] }}
 */
export function withoutKnown(fails) {
  const out = { fails: /** @type {T[]} */ ([]), known: /** @type {(T & { known: string })[]} */ ([]) }
  for (const e of fails) {
    const k = KNOWN_ERRORS.find((x) => x.match(e))
    if (k) out.known.push({ ...e, known: k.id })
    else out.fails.push(e)
  }
  return out
}
