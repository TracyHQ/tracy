/**
 * What a failed teardown job says, for the person who deleted the site (`hostReason` of
 * `DELETE /api/sites/:key`, shown by the my-sites delete notice).
 *
 * 🔒 THE SCRIPT'S OWN VERDICT, NOT THE BARE CODE. tracy-host's teardown job carries the script's last
 * lines as `output` and no `error` (`runTeardownJob`, apps/tracy-host), and the door read `error` only:
 * the person saw `TEARDOWN_FAILED` and never teardown.sh's "teardown of <label> did not finish … still
 * on this host …" (05/10/2026). teardown.sh marks what it says to a reader with `!!`, and ends a run it
 * could not finish with a verdict line that begins `teardown of <label>`; that line is taken, else the
 * last `!!` line.
 *
 * 🔒 ONLY THIS SITE'S NAMES LEAVE THE HOST. The line is written for an operator: it carries the host's
 * own paths (`/srv/tracy-private/<label>`) and, in a refusal, whatever docker answered — which can be a
 * NEIGHBOUR's volume or container. A path is cut down to the root's own name and the part from this
 * site's label on (`tracy-private/<label>/…`, so the private directory and the site folder stay apart),
 * or to `…` when the label is not one of its segments; any other quoted name is kept only when it is
 * one of this site's own (the label, `<label>_db|_app|_default`, `<label>-<service>-<n>`), else it
 * becomes `'…'`.
 */

/** How much of the line the answer carries; the notice cuts at 300 (`REASON_MAX`, my-sites). */
export const TEARDOWN_SAID_MAX = 200

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** An absolute path, cut to its root's name and the part from the label on; `…` without the label. */
function ownPath(path, label) {
  const segments = path.split('/')
  const at = segments.indexOf(label)
  return at === -1 ? '…' : segments.slice(Math.max(at - 1, 1)).join('/')
}

/**
 * @param {unknown} job - the job record tracy-host answered (`{state, output?, error?}`).
 * @param {string} label - the site's label.
 * @returns {string | null} the line, sanitised and bounded; null when the job said nothing.
 */
export function teardownSaid(job, label) {
  const record = /** @type {{ error?: unknown, output?: unknown } | null} */ (
    typeof job === 'object' && job !== null ? job : null
  )
  let line = null
  if (typeof record?.error === 'string' && record.error.trim() !== '') line = record.error.trim()
  else if (typeof record?.output === 'string') {
    const said = record.output
      .split('\n')
      .filter((l) => l.startsWith('!!'))
      .map((l) => l.replace(/^!!\s*/, '').trim())
      .filter((l) => l !== '')
    line = said.filter((l) => l.startsWith(`teardown of ${label} `)).at(-1) ?? said.at(-1) ?? null
  }
  if (line === null) return null

  const own = new RegExp(`^${escape(label)}(?:_(?:db|app|default)|-[a-z]+-\\d+)?$`)
  // A path ends before trailing punctuation: "could not remove /srv/…/<label>: rm: …".
  const paths = (text) =>
    text.replace(/(^|[\s(=:])(\/[^\s'"(),]*[^\s'"(),:;.])/g, (_, lead, path) => lead + ownPath(path, label))
  const cleaned = paths(
    line.replace(/'([^']*)'|"([^"]*)"/g, (_, single, double) => {
      const quote = single === undefined ? '"' : "'"
      const value = single ?? double
      if (value.startsWith('/')) return `${quote}${ownPath(value, label)}${quote}`
      return own.test(value) ? `${quote}${value}${quote}` : `${quote}…${quote}`
    })
  )
  return cleaned.length > TEARDOWN_SAID_MAX ? `${cleaned.slice(0, TEARDOWN_SAID_MAX - 1)}…` : cleaned
}
