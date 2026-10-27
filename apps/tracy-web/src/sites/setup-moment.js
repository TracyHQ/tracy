/**
 * The webroot files of a Tracy setup run (SC-3, dev 11/10/2026).
 *
 * A site set up from its person's brief is written by a run of the brief builder (`brief-build.js`):
 * its database writes go through the Apply door and are recorded as `site_write` rows with
 * `origin = 'setup'` (one "Tracy setup" row in Site changes). Several of those writes also leave
 * FILES on the webroot — WordPress pictures and their thumbnails under `wp-content/uploads/`, a
 * language pack under `wp-content/languages/`, Joomla's `images/`, `configuration.php`, template
 * settings and overrides — and nothing committed them. The first look at Site changes then sealed
 * them as an outside commit: "Files changed; source unknown · 25 files" on a site nobody had touched.
 *
 * The run now holds the webroot the way a chat turn does, with the same two host jobs and the same
 * declared limits (`webroot-git.sh`): before its first write it seals what is already dirty as
 * outside and marks the turn `setup-<run>:1` open, so no look seals its files half-way; once it is
 * done it commits a moment under that turn. The moment is Tracy's own commit, and Site changes shows
 * it on the run's row — never as a row of its own:
 *   - the run records the moment it heard back from as one more `site_write` of the run (the carrier,
 *     `via = 'setup-moment'`, `target = {sha, files}`), which counts as no operation;
 *   - a moment it did not hear back from (the job outlived the wait) is still known by its commit's
 *     `Tracy-Turn` trailer, matched to a run this site has.
 */

/** The `site_write.via` of the carrier row a setup run records for its moment. */
export const SETUP_MOMENT_VIA = 'setup-moment'

/** The `site_write.action` of that row. */
export const SETUP_MOMENT_ACTION = 'setup.files'

/** The title of the moment's commit, as the webroot history shows it. */
export const SETUP_MOMENT_TITLE = 'Tracy setup'

/** A run id (`randomUUID()`), the only shape a setup turn is made of. */
const RUN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The webroot turn id a setup run holds (`<session>:<n>`, the shape the host and `webroot-git.sh`
 * accept), or null for an id that is not a run's.
 * @param {string} runId
 * @returns {string | null}
 */
export function setupTurnOf(runId) {
  return typeof runId === 'string' && RUN.test(runId) ? `setup-${runId}:1` : null
}

/**
 * The run a webroot turn id names, or null when it names none.
 * @param {unknown} turn
 * @returns {string | null}
 */
export function setupRunOf(turn) {
  if (typeof turn !== 'string' || !turn.startsWith('setup-') || !turn.endsWith(':1')) return null
  const run = turn.slice('setup-'.length, -':1'.length)
  return RUN.test(run) ? run : null
}

/**
 * Whether a `site_write` row is a setup run's carrier of its moment.
 * @param {{via?: unknown, origin?: unknown}} w
 */
export const isSetupMoment = (w) => w?.via === SETUP_MOMENT_VIA && w?.origin === 'setup'

/**
 * The files a carrier row names, as the row's `files` effect: `{sha, count}`, or null when the row
 * does not say both.
 * @param {{target?: any}} w
 * @returns {{sha: string, count: number} | null}
 */
export function setupMomentFiles(w) {
  const sha = w?.target?.sha
  const count = w?.target?.files
  if (typeof sha !== 'string' || !/^[0-9a-f]{40,64}$/.test(sha)) return null
  if (!Number.isInteger(count) || count < 0) return null
  return { sha, count }
}
