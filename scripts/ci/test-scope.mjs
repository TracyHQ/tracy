/**
 * Which opt-in test suites a pull request into `develop` asks for (16/10/2026, anh David / SRE).
 *
 * THE RULE. A routine pull request into `develop` runs neither the `tests e2e` row nor the workers
 * test files that need a database, unless it carries a label:
 *
 *   `ci:e2e`          adds the `tests e2e` row (always, whatever the changed paths say) and lets the three
 *                     EmDash rows (`tests emdash-*`, which open Chromium) run when their paths ask for them;
 *   `ci:integration`  keeps the workers files that read `TEST_DATABASE_URL` in the run.
 *
 * Everything else is unchanged and is NOT decided here: the release pull requests (`main`,
 * `staging`), the nightly, manual runs and pushes run every row and every test, labels or no labels.
 *
 * 🔒 FAILS CLOSED, LIKE THE PLANNER AROUND IT. A label list that could not be read (API error, missing
 * permission, an answer that is not the pull request we asked about) opts NOTHING out: the run is
 * the one `develop` pull requests had before this rule. So is a diff we cannot read, and so is a
 * pull request that EDITS a database test (see `editedDatabaseTests`): the file the author changed
 * must run, and the cheapest way to say so without a second selection mechanism is to not skip.
 *
 * 🔒 THE LABELS ARE READ AT RUN TIME, FROM THE API, NEVER FROM THE EVENT PAYLOAD. A re-run of a
 * workflow run replays the payload it was first started with, so a label added afterwards would be
 * invisible to the re-run that `ci-label-rerun.yml` starts for exactly that label.
 *
 * This file holds the decision as pure functions (`testScope`, unit-tested in
 * `scripts/test/ci-test-scope.test.mjs`) and the one transport that fetches the labels
 * (`readLabels`, driven there with a fake reader). It runs on bare node, before `pnpm install`.
 *
 *   node scripts/ci/test-scope.mjs --read-labels     # `plan` job: writes the `labels` step output
 */
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { githubJson, githubRead } from './github-read.mjs'
import {
  DATABASE_MARK,
  E2E_LABEL,
  INTEGRATION_LABEL,
  isDatabaseGated,
  isWorkersFile
} from './related-tests.mjs'

/** Largest answer accepted for the pull request object. */
const MAX_BYTES = 2 * 1024 * 1024
/** A pull request with this many labels may have more than the API returned: unreadable, not partial. */
const LABEL_CEILING = 100

/**
 * The label names in a step output, or null when it is empty or not a list of names. Empty is how a
 * failed read arrives (the step wrote no output), and it must stay distinguishable from `[]`.
 *
 * @param {string | undefined} text
 * @returns {string[] | null}
 */
export function parseLabels(text) {
  if (typeof text !== 'string' || text.trim() === '') return null
  try {
    const value = JSON.parse(text)
    if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && v !== '')) return null
    return value
  } catch {
    return null
  }
}

/**
 * The labels the pull request carries NOW.
 *
 * @param {object} input
 * @param {(path: string) => Promise<any>} input.get - parsed JSON of a `repos/…` GET.
 * @param {string} input.repo - `owner/name`.
 * @param {number | string} input.pr - the pull request number.
 * @param {string} input.baseRef - the base branch the run was started for.
 * @returns {Promise<{ labels: string[] } | { error: string }>}
 */
export async function readLabels({ get, repo, pr, baseRef }) {
  if (!/^[1-9][0-9]{0,8}$/.test(String(pr))) return { error: `"${String(pr)}" is not a pull request number` }
  let body
  try {
    body = await get(`repos/${repo}/pulls/${String(pr)}`)
  } catch (error) {
    return { error: String(error?.message ?? error) }
  }
  if (body === null || typeof body !== 'object') return { error: 'the pull request answer is not an object' }
  if (Number(body.number) !== Number(pr)) return { error: 'the answer is about another pull request' }
  // A pull request moved to another base after this run started is not the pull request this run is for.
  if (body.base?.ref !== baseRef)
    return { error: `the pull request now targets ${String(body.base?.ref)}, not ${baseRef}` }
  if (!Array.isArray(body.labels)) return { error: 'the answer lists no labels' }
  const names = body.labels.map((l) => l?.name)
  if (!names.every((n) => typeof n === 'string' && n !== '')) return { error: 'a label has no name' }
  if (names.length >= LABEL_CEILING) {
    return { error: `${String(names.length)} labels — the list may be cut short` }
  }
  return { labels: names }
}

/** A path under a `test/` or `tests/` directory: where a test file or one of its helpers lives. */
const inTestTree = (file) => file.split('/').some((part) => part === 'test' || part === 'tests')

/**
 * The files this pull request changes under a test directory that mention the database variable: a
 * `*.test.mjs` that needs one, or a helper such as `_db.mjs` that all of them use. A file that cannot
 * be read counts, because we could not rule it out.
 *
 * @param {readonly string[]} changed
 * @param {ReadonlySet<string>} present - tracked files; a deleted file is not edited, it is gone.
 * @param {(file: string) => string} readText
 * @returns {string[]}
 */
export function editedDatabaseTests(changed, present, readText) {
  return changed.filter((file) => {
    if (!present.has(file) || !inTestTree(file) || !/\.(?:mjs|cjs|js|ts)$/.test(file)) return false
    try {
      return isDatabaseGated(readText(file))
    } catch {
      return true
    }
  })
}

/**
 * @typedef {object} Scope
 * @property {boolean} applies - the event is a pull request into `develop`.
 * @property {boolean} labelsKnown - `labels` was a list; false = unreadable (and nothing is opted out).
 * @property {string[]} labels
 * @property {boolean} e2eLeftOut - the browser rows do not exist in this run (no `ci:e2e`): `tests e2e` and the three EmDash rows.
 * @property {boolean} e2eForced - the `tests e2e` row exists whatever the paths say (`ci:e2e`); the EmDash rows follow their paths.
 * @property {boolean} skipDb - the workers files that read the database are left out of the run.
 * @property {number | null} dbFiles - how many such files the tree holds; null when not counted.
 * @property {string[]} dbEdited - database tests the pull request edits (why the skip is off).
 * @property {'full' | 'partial:db' | 'partial:e2e' | 'partial:db+e2e'} record - what the run tests.
 * @property {string[]} why - one line per decision, for notices and the job summary.
 */

/**
 * What the opt-in rule says for this event, labels and diff.
 *
 * @param {object} input
 * @param {string} input.event - `github.event_name`.
 * @param {string} [input.baseRef] - `github.base_ref`.
 * @param {readonly string[] | null | undefined} [input.labels] - the labels read at run time; null = unreadable.
 * @param {readonly string[] | null} [input.changed] - changed files, null when git could not say.
 * @param {readonly string[]} [input.allFiles] - tracked files.
 * @param {(file: string) => string} [input.readText] - reads a tracked file; without it the skip is off.
 * @returns {Scope}
 */
export function testScope({ event, baseRef = '', labels = null, changed = null, allFiles = [], readText }) {
  const applies = event === 'pull_request' && baseRef === 'develop'
  const base = {
    applies,
    labelsKnown: false,
    labels: [],
    e2eLeftOut: false,
    e2eForced: false,
    skipDb: false,
    dbFiles: null,
    dbEdited: [],
    record: /** @type {const} */ ('full'),
    why: /** @type {string[]} */ ([])
  }
  if (!applies) return base
  if (!Array.isArray(labels)) {
    return {
      ...base,
      why: [
        'could not read the labels of this pull request — nothing is opted out: every row and every test runs as it did before the opt-in rule'
      ]
    }
  }
  // A diff we cannot read keeps the planner's own rule: every row runs, so nothing is opted out.
  if (!Array.isArray(changed) || changed.length === 0) {
    return {
      ...base,
      labelsKnown: true,
      labels: [...labels],
      why: ['the changed files are unknown — nothing is opted out: every row and every test runs']
    }
  }
  const why = []
  const e2eForced = labels.includes(E2E_LABEL)
  const e2eLeftOut = !e2eForced
  why.push(
    e2eForced
      ? `label ${E2E_LABEL}: the tests e2e row runs, and the EmDash rows run when their paths are touched`
      : `no label ${E2E_LABEL}: the tests e2e row and the EmDash rows do not run on a pull request into develop`
  )

  let skipDb = false
  let dbFiles = null
  let dbEdited = []
  if (labels.includes(INTEGRATION_LABEL)) {
    why.push(`label ${INTEGRATION_LABEL}: the workers tests that read ${DATABASE_MARK} run`)
  } else if (typeof readText !== 'function') {
    why.push(`the tree cannot be read, so the workers tests that read ${DATABASE_MARK} are not left out`)
  } else {
    dbEdited = editedDatabaseTests(changed, new Set(allFiles), readText)
    if (dbEdited.length > 0) {
      const shown = dbEdited.slice(0, 3).join(', ')
      const more = dbEdited.length > 3 ? ` and ${String(dbEdited.length - 3)} more` : ''
      why.push(
        `this pull request edits ${shown}${more}, which ${dbEdited.length === 1 ? 'reads' : 'read'} ${DATABASE_MARK}: the workers tests that read it run, so the file you changed is tested`
      )
    } else {
      skipDb = true
      dbFiles = allFiles.filter((f) => {
        if (!isWorkersFile(f)) return false
        try {
          return isDatabaseGated(readText(f))
        } catch {
          return false
        }
      }).length
      why.push(
        `no label ${INTEGRATION_LABEL}: ${String(dbFiles)} workers test file(s) that read ${DATABASE_MARK} are left out of the workers tests`
      )
    }
  }
  const left = [skipDb ? 'db' : null, e2eLeftOut ? 'e2e' : null].filter(Boolean).join('+')
  return {
    ...base,
    labelsKnown: true,
    labels: [...labels],
    e2eLeftOut,
    e2eForced,
    skipDb,
    dbFiles,
    dbEdited,
    record: /** @type {Scope['record']} */ (left === '' ? 'full' : `partial:${left}`),
    why
  }
}

// ── transport ────────────────────────────────────────────────────────────────────────────────────

/** `--read-labels`: the `labels` output of the `plan` job. A failed read writes none, never a guess. */
async function readLabelsMain() {
  const repo = process.env.GITHUB_REPOSITORY ?? ''
  const result = await readLabels({
    get: (path) => githubJson(githubRead, path, MAX_BYTES),
    repo,
    pr: process.env.PR_NUMBER ?? '',
    baseRef: process.env.BASE_REF ?? ''
  })
  if ('error' in result) {
    console.log(
      `::warning::plan: could not read the labels of this pull request (${result.error}) — nothing is opted out, every row runs as before`
    )
    return
  }
  const carried = result.labels.length === 0 ? 'no label' : result.labels.join(', ')
  console.log(`plan: this pull request carries ${carried}`)
  const line = `labels=${JSON.stringify(result.labels)}`
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`)
  else console.log(line)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length === 3 && process.argv[2] === '--read-labels') {
    readLabelsMain().catch((error) => {
      // Never let the read break the plan: no output means every row runs.
      console.log(
        `::warning::plan: reading the labels failed (${String(error?.message ?? error)}) — every row runs as before`
      )
    })
  } else {
    console.error('test-scope: the only argument is --read-labels')
    process.exit(2)
  }
}
