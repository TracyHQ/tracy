/**
 * Whether the build job sitting on the lane belongs to the tab the person is looking at.
 *
 * WHY THIS IS A QUESTION AT ALL. A lane holds ONE build job, and the Build tab is opened by more
 * than one road: the preview's Create with, a link from the public Design inspiration page, the
 * side card's + menu, a rerun. So the job the lane answers with may be somebody else's, from
 * another session, finished hours ago — and showing it is not a cosmetic slip: it replaces the
 * six questions with a finished build's result screen, and the person waits for a form that will
 * never come. Measured 08/09 on lucaswp.
 */

/**
 * @typedef {object} JobLike
 * @property {string} inspiration
 * @property {string} platform
 * @property {string} status
 * @property {string} startedAt
 */

/**
 * @param {JobLike | null} job - what the lane answers with
 * @param {{ id?: string, platform?: string }} meta - what the tab was opened for
 * @param {number} openedAt - when this tab opened, in ms
 * @returns {boolean} true when the job is not this tab's and must not be shown
 */
export function staleJob(job, meta, openedAt) {
  // Nothing to judge.
  if (job === null) return false
  // A tab opened with no meta is not asking for a build; it is asking what is on the site. Then
  // whatever the lane has is the answer, and hiding it would empty the tab for no reason.
  if (meta.id === undefined) return false
  // Started after this tab opened: a restyle from the Tweaks, a rerun, this tab's own press. It
  // belongs to the tab whatever it says — the meta is the older fact.
  if (job.status === 'running') return false
  if (Date.parse(job.startedAt) >= openedAt) return false
  // Older, and for something else. The PLATFORM counts as much as the inspiration: a press of
  // "Build with WordPress" on `airbnb` met a finished `airbnb` build for Joomla, the inspirations
  // matched, and nothing called it stale.
  if (job.inspiration !== meta.id) return true
  return meta.platform !== undefined && job.platform !== meta.platform
}

/**
 * Whether this tab is looking at a site that could not be stood up.
 *
 * 🔒 A FAILED PROVISION OUTRANKS EVERY FORM SCREEN, AND THE TAB USED TO FORGET IT. `BuildForm`
 * records the failure in React state and draws a notice with a Retry — which is right while the
 * tab is alive. But the customer LEAVES: they open the site they already have, work on it, and
 * come back. The tab is rebuilt from its meta, the state is gone, and with no build job to show
 * `BuildTab` falls through to "Tracy is preparing a few questions… Answer them, and the build
 * starts" — a spinner, for a site that does not exist, that never ends.
 *
 * Measured 19/09/2026 on `site-5big32` (Joomla, Airbnb): the provision job failed after 2.04
 * seconds with `quickstart download failed (HTTP 404)`, the chat's task list said exactly that and
 * offered Try again, and the panel beside it span indefinitely. The customer read the two together
 * as the build refusing to run while another site was open.
 *
 * So the mark goes into the tab's meta — the same place the siteKey goes — and this is the
 * question asked before any form branch.
 *
 * ⚠ A JOB BEATS THE MARK. `job === null` is the whole point: once a build really is running on
 * that site, whatever failed earlier is history and the build screen must win. `undefined` is not
 * `null` here — it means the job has not been fetched yet, and answering during that gap would
 * flash this screen on a tab that is about to show a perfectly good build.
 *
 * @param {{ provisionFailed?: { siteKey: string, message: string } }} meta - the tab's own meta
 * @param {JobLike | null | undefined} job - what the lane answers with; `undefined` = not asked yet
 * @returns {boolean}
 */
export function provisionBlocked(meta, job) {
  if (job !== null) return false
  const failed = meta?.provisionFailed
  return typeof failed?.siteKey === 'string' && failed.siteKey !== ''
}
