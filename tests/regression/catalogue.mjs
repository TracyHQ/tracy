/**
 * The regression catalogue: one JSON file per case in `tests/regression/cases/`, and result lines
 * in `tests/regression/results/*.jsonl`.
 *
 * WHY ONE FILE PER CASE, AND WHY JSON. The `Regression` gate runs under a bare `node` with nothing
 * installed (like `changelog` and `description`), so the format must parse without a library —
 * that rules out YAML. One file per case is the lesson of `tasks/nhat-ky/`: a shared file makes
 * every two parallel pull requests edit the same lines.
 *
 * WHY A NEW ID CARRIES ITS PULL REQUEST NUMBER. Until 04/10/2026 a new case took "the next number
 * after the highest": two parallel branches read the same highest number and both took the next
 * one, with different slugs, so git saw two different file names and no conflict — the duplicate
 * id only surfaced later, as a red catalogue in every pull request cut after both had merged (10 of
 * 28 red CI runs in the review of 04/10/2026). A new id is now `REG-PR-<PR number>-<slug>`, in a
 * file named exactly `<id>.json`: GitHub hands out each PR number once, so two pull requests cannot
 * form the same id, and one pull request reusing a slug collides on the file name, which
 * `create.mjs` refuses and git shows loudly. Legacy `REG-NNN` ids stay valid as they are — files,
 * results and every reference — but no new one is allocated.
 *
 * ONE GRAMMAR. The id, its file name and the duplicate rule are defined here and nowhere else; the
 * runner (`run.mjs`), the allocator (`create.mjs`) and the `Regression` gate
 * (`scripts/check-regression.mjs`) import them, so a selector, a result line and a file name cannot
 * drift apart.
 *
 * Everything here is pure: it takes text and returns values, so the gate and the runner share one
 * definition of a case and both are tested on inline data.
 */

/** Directory of case files, relative to the repository root. */
export const CASES_DIR = 'tests/regression/cases/'

/** Directory of result files, relative to the repository root. */
export const RESULTS_DIR = 'tests/regression/results/'

/** The two kinds of change a case can guard, matching the PR title and branch prefixes. */
export const KINDS = ['fix', 'feat']

/** CMS codes a case may name; `any` means the case does not depend on the CMS. */
export const CMS_CODES = ['wp', 'jo', 'em', 'any']

/** Verdicts a result line may carry. Only `PASS` satisfies the gate. */
export const VERDICTS = ['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN']

/** How an id is spelt, for messages: the form a new case takes, and the form old cases keep. */
/**
 * What a case's `run` may need from the machine it runs on (`tests/regression/script.mjs`
 * `missingNeeds`): a Postgres the tests may write to, a running stand, a Chrome on the CDP endpoint.
 */
export const RUN_NEEDS = ['postgres', 'stand', 'chrome']

export const ID_FORMS = 'REG-PR-<PR number>-<slug> (legacy cases keep REG-NNN)'

/** A legacy id: allocated by hand as "the next number" before 04/10/2026. Kept, never allocated. */
const LEGACY_ID_RE = /^REG-(\d{3,})$/

/** A pull request number as written in an id: positive, no leading zero. */
const PR_NUMBER = '[1-9][0-9]*'

/** A case slug: lowercase letters and digits in groups joined by single hyphens. */
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*'

const PR_NUMBER_RE = new RegExp(`^${PR_NUMBER}$`)
const SLUG_RE = new RegExp(`^${SLUG}$`)

/** A PR-owned id. The number has no hyphen, so the first hyphen after it always starts the slug. */
const PR_ID_RE = new RegExp(`^REG-PR-(${PR_NUMBER})-(${SLUG})$`)

/**
 * @typedef {{form: 'legacy', number: number} | {form: 'pr', pr: number, slug: string}} CaseId
 */

/**
 * Read a case id. This is the only place that knows the grammar.
 * @param {unknown} id - candidate id.
 * @returns {CaseId | null} its parts, or `null` when it is not a case id.
 */
export function parseId(id) {
  if (typeof id !== 'string') return null
  const legacy = LEGACY_ID_RE.exec(id)
  if (legacy !== null) return { form: 'legacy', number: Number(legacy[1]) }
  const owned = PR_ID_RE.exec(id)
  if (owned === null) return null
  const pr = Number(owned[1])
  // A number past 2^53 does not survive JSON, so it could never equal the case's `pr` field.
  return Number.isSafeInteger(pr) ? { form: 'pr', pr, slug: owned[2] } : null
}

/**
 * Whether a value is a case id, legacy or PR-owned.
 * @param {unknown} id - candidate id.
 * @returns {boolean} true when `parseId` reads it.
 */
export function isCaseId(id) {
  return parseId(id) !== null
}

/**
 * Form the id of a new case from its pull request number and slug.
 * @param {number | string} pr - PR number, as a number or as its decimal digits.
 * @param {unknown} slug - case slug.
 * @returns {{ok: true, id: string, pr: number} | {ok: false, problems: string[]}} the id or why not.
 */
export function prCaseId(pr, slug) {
  const problems = []
  const digits = typeof pr === 'number' && Number.isSafeInteger(pr) ? String(pr) : pr
  if (typeof digits !== 'string' || !PR_NUMBER_RE.test(digits) || !Number.isSafeInteger(Number(digits)))
    problems.push('the PR number must be a positive whole number without a leading zero, e.g. 912')
  if (typeof slug !== 'string' || !SLUG_RE.test(slug))
    problems.push(
      'the slug must be lowercase letters and digits joined by single hyphens, e.g. backup-button-enabled'
    )
  if (problems.length > 0) return { ok: false, problems }
  return { ok: true, id: `REG-PR-${String(digits)}-${String(slug)}`, pr: Number(digits) }
}

/**
 * Order two ids: legacy ids by number first, then PR-owned ids by PR number and slug. A plain text
 * sort would put `REG-PR-100-…` before `REG-PR-99-…`.
 * @param {string} a - a case id.
 * @param {string} b - a case id.
 * @returns {number} negative, zero or positive, as `Array.prototype.sort` expects.
 */
export function compareIds(a, b) {
  const [x, y] = [parseId(a), parseId(b)]
  if (x === null || y === null) return a < b ? -1 : a > b ? 1 : 0
  if (x.form !== y.form) return x.form === 'legacy' ? -1 : 1
  if (x.form === 'legacy' && y.form === 'legacy') return x.number - y.number || (a < b ? -1 : a > b ? 1 : 0)
  if (x.form === 'pr' && y.form === 'pr')
    return x.pr - y.pr || (x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0)
  return 0
}

/**
 * The file a PR-owned case lives in: exactly its id.
 * @param {string} id - a PR-owned id.
 * @returns {string} repo-relative path.
 */
export function casePath(id) {
  return `${CASES_DIR}${id}.json`
}

/**
 * What is wrong with a case's file name, given its id. A PR-owned case lives in exactly
 * `<id>.json`; a legacy case keeps `<id>-<slug>.json` (or `<id>.json`), as it was written.
 * @param {string} id - a valid case id.
 * @param {string} path - the file's path (only the last segment is read).
 * @returns {string | null} the problem, or `null` when the name fits.
 */
export function fileNameProblem(id, path) {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const parsed = parseId(id)
  if (parsed === null) return null
  if (parsed.form === 'pr')
    return name === `${id}.json` ? null : `file name must be exactly ${id}.json (it is ${name})`
  return name.startsWith(`${id}-`) || name === `${id}.json`
    ? null
    : `file name must start with the id (${id})`
}

/**
 * Ids carried by more than one case file. The collision this guards is two files with different
 * names and one id, which git merges without a word.
 * @param {{id: string, path: string}[]} entries - one per case file.
 * @returns {{id: string, paths: string[]}[]} each duplicated id with every file that carries it.
 */
export function duplicateIds(entries) {
  /** @type {Map<string, string[]>} */
  const byId = new Map()
  for (const { id, path } of entries) byId.set(id, [...(byId.get(id) ?? []), path])
  return [...byId].flatMap(([id, paths]) => (paths.length > 1 ? [{ id, paths: paths.toSorted() }] : []))
}

/**
 * Whether a repository path is a case file CANDIDATE: any `.json` directly in the cases folder.
 * Deliberately wider than the id grammar — a file there with a malformed name is a broken case to
 * report, not a file to skip (a skipped file is a case that silently never runs and never counts).
 * @param {string} path - repo-relative path.
 * @returns {boolean} true for `tests/regression/cases/<name>.json`.
 */
export function isCasePath(path) {
  return path.startsWith(CASES_DIR) && /^[^/]+\.json$/.test(path.slice(CASES_DIR.length))
}

/**
 * Whether a repository path is a result file.
 * @param {string} path - repo-relative path.
 * @returns {boolean} true for `tests/regression/results/<name>.jsonl`.
 */
export function isResultPath(path) {
  return path.startsWith(RESULTS_DIR) && /^[^/]+\.jsonl$/.test(path.slice(RESULTS_DIR.length))
}

/**
 * @typedef {object} RegressionCase
 * @property {string} id - `REG-PR-<pr>-<slug>` (file `<id>.json`), or a legacy `REG-NNN`.
 * @property {'fix' | 'feat'} kind - what the case guards.
 * @property {string} title - one line.
 * @property {number} pr - the pull request that fixed or built the thing; a PR-owned id names it.
 * @property {string} area - e.g. `site-changes/backup`.
 * @property {string[]} cms - subset of `CMS_CODES`.
 * @property {string[]} needs - what the run needs (`stand`, `model`, `site:em`, …).
 * @property {boolean} flaky_model - true when the verdict depends on what a model chooses to do.
 * @property {string[]} steps - enough for a machine runner to act without judgement.
 * @property {string[]} expect - concrete strings or values to check.
 * @property {Record<string, string>} selectors - stable selectors (`data-*`, door paths).
 * @property {RunSpec} [run] - the deterministic command that judges the case; without it the case
 *   is still handed to Codex (cases move over one by one).
 */

/**
 * @typedef {object} RunSpec
 * @property {string[]} cmd - argv, run without a shell.
 * @property {string} [cwd] - repo-relative folder to run in (default: the repo root).
 * @property {string[]} [needs] - subset of `RUN_NEEDS`; a missing one makes the case BLOCKED.
 * @property {string[]} [tests] - test-name prefixes that must each report `ok` in the TAP output, so
 *   a deleted or renamed test cannot pass as exit 0.
 * @property {number} [timeout_s] - kill the command after this many seconds (default 600).
 */

/**
 * Problems with a case's `run`, or none when it is absent.
 * @param {unknown} run - the `run` value.
 * @returns {string[]} problems.
 */
function runProblems(run) {
  if (run === undefined) return []
  if (run === null || typeof run !== 'object' || Array.isArray(run))
    return ['`run` must be an object {cmd, cwd?, needs?, tests?, timeout_s?}']
  const r = /** @type {Record<string, unknown>} */ (run)
  const problems = []
  const extra = Object.keys(r).filter((k) => !['cmd', 'cwd', 'needs', 'tests', 'timeout_s'].includes(k))
  if (extra.length > 0) problems.push(`\`run\` has unknown field(s): ${extra.join(', ')}`)
  const strings = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim() !== '')
  if (!strings(r.cmd) || /** @type {string[]} */ (r.cmd).length === 0)
    problems.push('`run.cmd` must be a non-empty argv of non-empty strings')
  if (
    r.cwd !== undefined &&
    (typeof r.cwd !== 'string' || r.cwd === '' || r.cwd.startsWith('/') || r.cwd.split('/').includes('..'))
  )
    problems.push('`run.cwd` must be a folder inside the repo, written relative to its root')
  if (r.needs !== undefined) {
    const bad = Array.isArray(r.needs) ? r.needs.filter((n) => !RUN_NEEDS.includes(n)) : ['(not a list)']
    if (bad.length > 0) problems.push(`\`run.needs\` takes ${RUN_NEEDS.join('/')}; got ${bad.join(', ')}`)
  }
  if (r.tests !== undefined) {
    if (!strings(r.tests) || /** @type {string[]} */ (r.tests).length === 0)
      problems.push('`run.tests` must be a non-empty list of test-name prefixes')
    else if (Array.isArray(r.cmd) && !r.cmd.includes('--test-reporter=tap'))
      problems.push('`run.tests` is read from TAP output: `run.cmd` must pass --test-reporter=tap')
  }
  if (
    r.timeout_s !== undefined &&
    (!Number.isInteger(r.timeout_s) || /** @type {number} */ (r.timeout_s) <= 0)
  )
    problems.push('`run.timeout_s` must be a positive whole number of seconds')
  return problems
}

/**
 * Validate a parsed case object.
 * @param {unknown} value - the parsed JSON.
 * @param {string} [path] - file path, to check the id matches the file name.
 * @returns {string[]} problems; empty when the case is valid.
 */
export function validateCase(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return ['not a JSON object']
  const c = /** @type {Record<string, unknown>} */ (value)
  const problems = []
  const nonEmptyStrings = (v) =>
    Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s.trim() !== '')
  const id = parseId(c.id)
  if (id === null) problems.push(`\`id\` must look like ${ID_FORMS}`)
  else if (path !== undefined) {
    const name = fileNameProblem(/** @type {string} */ (c.id), path)
    if (name !== null) problems.push(name)
  }
  // The namespace is only worth something if it is the case's own pull request: an id that names
  // one PR while `pr` names another is two cases waiting to claim the same id.
  if (id !== null && id.form === 'pr' && c.pr !== id.pr)
    problems.push(`\`pr\` must be ${String(id.pr)}, the PR number in the id`)
  if (!KINDS.includes(/** @type {string} */ (c.kind))) problems.push('`kind` must be fix or feat')
  if (typeof c.title !== 'string' || c.title.trim() === '') problems.push('`title` is empty')
  if (!Number.isInteger(c.pr) || /** @type {number} */ (c.pr) <= 0) problems.push('`pr` must be a PR number')
  if (typeof c.area !== 'string' || c.area.trim() === '') problems.push('`area` is empty')
  if (!Array.isArray(c.cms) || c.cms.length === 0 || !c.cms.every((x) => CMS_CODES.includes(x))) {
    problems.push(`\`cms\` must be a non-empty subset of ${CMS_CODES.join('/')}`)
  }
  if (!Array.isArray(c.needs) || !c.needs.every((x) => typeof x === 'string'))
    problems.push('`needs` must be a list of strings')
  if (typeof c.flaky_model !== 'boolean') problems.push('`flaky_model` must be true or false')
  if (!nonEmptyStrings(c.steps)) problems.push('`steps` must be a non-empty list of strings')
  if (!nonEmptyStrings(c.expect)) problems.push('`expect` must be a non-empty list of strings')
  if (
    c.selectors === null ||
    typeof c.selectors !== 'object' ||
    Array.isArray(c.selectors) ||
    !Object.values(c.selectors).every((s) => typeof s === 'string')
  ) {
    problems.push('`selectors` must be an object of strings (may be empty)')
  }
  problems.push(...runProblems(c.run))
  return problems
}

/**
 * Parse one case file's text.
 * @param {string} text - file contents.
 * @param {string} path - repo-relative path, for messages and the id/file-name check.
 * @returns {{ok: true, value: RegressionCase} | {ok: false, problems: string[]}} the case or why not.
 */
export function parseCase(text, path) {
  let value
  try {
    value = JSON.parse(text)
  } catch (error) {
    return { ok: false, problems: [`not valid JSON: ${/** @type {Error} */ (error).message}`] }
  }
  const problems = validateCase(value, path)
  return problems.length === 0 ? { ok: true, value } : { ok: false, problems }
}

/**
 * @typedef {object} ResultLine
 * @property {string} id - case id.
 * @property {string} verdict - one of `VERDICTS`.
 * @property {string} commit - the commit the stand ran.
 * @property {string} ran_at - ISO time.
 * @property {string} evidence - the run's log: its repo-relative path, or only its file name when
 *   the log was written outside the checkout.
 */

/**
 * Parse a results file (JSON Lines). Bad lines are reported, not thrown.
 * @param {string} text - file contents.
 * @returns {{lines: ResultLine[], problems: string[]}} parsed lines and the problems found.
 */
export function parseResults(text) {
  const lines = []
  const problems = []
  text.split('\n').forEach((raw, i) => {
    if (raw.trim() === '') return
    let v
    try {
      v = JSON.parse(raw)
    } catch {
      problems.push(`line ${String(i + 1)}: not valid JSON`)
      return
    }
    if (
      typeof v?.id !== 'string' ||
      typeof v.verdict !== 'string' ||
      typeof v.commit !== 'string' ||
      typeof v.ran_at !== 'string'
    ) {
      problems.push(`line ${String(i + 1)}: needs id, verdict, commit, ran_at`)
      return
    }
    if (!isCaseId(v.id)) {
      problems.push(`line ${String(i + 1)}: id must look like ${ID_FORMS}`)
      return
    }
    if (!VERDICTS.includes(v.verdict)) {
      problems.push(`line ${String(i + 1)}: verdict must be one of ${VERDICTS.join('/')}`)
      return
    }
    lines.push(v)
  })
  return { lines, problems }
}

/**
 * Build one result line.
 * @param {{id: string, verdict: string, commit: string, ranAt: Date, evidence: string}} input - the run.
 * @returns {string} a JSON line without the trailing newline.
 * @throws {Error} on an id or a verdict `parseResults` would refuse: a line nobody can read back
 *   is evidence that silently counts for nothing.
 */
export function formatResult({ id, verdict, commit, ranAt, evidence }) {
  if (!isCaseId(id)) throw new Error(`result id must look like ${ID_FORMS} (got ${JSON.stringify(id)})`)
  if (!VERDICTS.includes(verdict)) throw new Error(`result verdict must be one of ${VERDICTS.join('/')}`)
  return JSON.stringify({ id, verdict, commit, ran_at: ranAt.toISOString(), evidence })
}

/**
 * Result file name for a run: `<YYYY-MM-DD>-<short commit>.jsonl` in UTC.
 * @param {Date} date - when the run started.
 * @param {string} commit - full or short sha.
 * @returns {string} repo-relative path.
 */
export function resultPath(date, commit) {
  return `${RESULTS_DIR}${date.toISOString().slice(0, 10)}-${commit.slice(0, 9)}.jsonl`
}
