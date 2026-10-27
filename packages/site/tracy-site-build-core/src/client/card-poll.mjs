/**
 * When the running card of a Build tool call (`BuildCard.tsx`) reads the host's `GET job`, and what
 * it says while there is no job to show.
 *
 * WHY THE FIRST "NONE" IS FINAL — the host's own `NO_JOB`, not a read that failed (`job-read.mjs`). Since 09/09 the agent's tool never makes a build: `start` joins the
 * job the Build tab already made, and `rerun`, `revise`, `review` and a `request` all act on a job
 * that exists or on the site itself (`site.rebuild`, `site.inspect`, ADR 0022). So a call that finds
 * no job on its first read will not see one appear before it settles. The card used to keep asking
 * every 1.5 s for as long as the call ran — on an EmDash site that was never built through Build,
 * each `request site.rebuild` (one to three minutes) logged a 404 `NO_JOB` about every 1.5 s, ~18
 * per rebuild (P1 stand, 02/10/2026, `tasks/evidence/site-changes/P1/stand2/ui/browser-errors.txt`).
 */

/**
 * Whether the card reads the job at all. A form-sending call (`ask`) draws its own one line and
 * never shows stages, so there is nothing to read.
 * @param {string | undefined} action - the call's `action` argument
 * @returns {boolean}
 */
export function readsJob(action) {
  return action !== 'ask'
}

/** How often a running card follows a job it found. */
export const FOLLOW_MS = 1500
/** How often a running card asks again after a read that could not be made: slower, the host may be busy or away. */
export const RETRY_MS = 5000

/**
 * When the card reads the job next, or null to stop. A settled call reads once. A running one stops
 * only on the host's own word that there is no job (`NO_JOB`), and only before it has found one; a
 * read that could not be made (`job-read.mjs`) is no answer, so it asks again, more slowly.
 * @param {{ settled: boolean, read: import('./job-read.mjs').JobRead, followed: boolean }} state -
 *   the call's phase, the last read, and whether any read so far found a job
 * @returns {number | null}
 */
export function nextReadIn({ settled, read, followed }) {
  if (settled) return null
  if (read.state === 'unreadable') return followed ? FOLLOW_MS : RETRY_MS
  if (read.state === 'none' && !followed) return null
  return FOLLOW_MS
}

/**
 * The card's line when there is no job to show. Running, a call that changes an existing site reads
 * as an update — "Starting the build…" over a rebuild of a site finished long ago was the wrong
 * thing to say; a settled call falls back to "no build" when its own result has no line.
 * @param {{ action: string | undefined, settled: boolean }} call
 * @returns {'card.noBuild' | 'card.updating' | 'card.starting'}
 */
export function cardWords({ action, settled }) {
  if (settled) return 'card.noBuild'
  return action === 'request' || action === 'rerun' || action === 'revise' ? 'card.updating' : 'card.starting'
}
