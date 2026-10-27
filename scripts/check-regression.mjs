#!/usr/bin/env node
/**
 * The `Regression` gate: a pull request that fixes a bug or builds a feature leaves behind a
 * regression case that a machine can rerun, and shows that case passing on its own branch.
 *
 * WHY IT EXISTS. The QA nights of 02–03/10/2026 found 14 real bugs (6 in backups #747, 3 in #772,
 * #774, #775, then #786 twice and #787). Each was found by a person or an agent walking the stand
 * by hand, and nothing kept the walk: the next change in the same area could bring any of them
 * back unnoticed. The catalogue in `tests/regression/` keeps the walk; this gate makes adding to it
 * part of the change instead of a promise.
 *
 * WHICH PULL REQUESTS. Kind comes from the title (`fix(...)`, `feat(...)`) and the branch
 * (`fix/…`, `feat/…`); when they disagree `fix` wins, because it is the stricter rule. Every other
 * kind (docs, chore, ci, refactor, release, …) is skipped.
 *
 * WHAT TURNS IT GREEN — one of:
 *   (a) the diff adds or edits a case of the same kind in `tests/regression/cases/`, AND a result
 *       line `PASS` for that case names a commit that belongs to this branch (reachable from the
 *       head, not from the merge base with the target branch);
 *   (b) feat only: a body line `Regression: none — <reason of at least 10 characters>`.
 * A fix never takes (b): a fixed bug was reproducible once, so it can be written down.
 *
 * A CASE IT COUNTS MUST BE WELL-FORMED (`tests/regression/catalogue.mjs` owns the grammar). Every
 * `.json` the diff adds, edits or retypes in the cases folder is judged — a malformed name is
 * reported, never skipped. A case the diff ADDS takes a PR-owned id `REG-PR-<PR number>-<slug>` in
 * a file named `<id>.json`, with `pr` equal to that number: "the next REG-NNN" let two parallel
 * branches take one number (10 of 28 red CI runs reviewed on 04/10/2026). A legacy `REG-NNN` case
 * already on the target branch stays valid and editable under its own id; nothing asks for it to be
 * renamed or rerun. An id carried by two files at the head is red on the case this diff touches.
 * The number is checked against the case's `pr` field, not against the pull request being judged:
 * a release pull request carries cases written by other pull requests.
 *
 * IT DOES NOT RUN THE CASES. Running needs a stand and a model (`tests/regression/run.mjs`), which a
 * nine-second light runner does not have; the gate only checks that a run was recorded on the
 * branch's own code. Merged pull requests are never judged: the gate runs on pull request events.
 *
 * Same shape as `check-changelog.mjs`: logic in the repo, bare `node`, payload from
 * `$GITHUB_EVENT_PATH`, runnable at a desk on a saved payload:
 *
 *   node scripts/check-regression.mjs <payload.json>
 *
 * ⚠ NEEDS FULL HISTORY. The workflow sets `fetch-depth: 0`; with a shallow checkout the ancestry
 * check cannot tell a branch commit from a foreign one.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  CASES_DIR,
  duplicateIds,
  isCasePath,
  isResultPath,
  parseCase,
  parseId,
  parseResults,
  RESULTS_DIR
} from '../tests/regression/catalogue.mjs'

/** Minimum length of the reason after `Regression: none —`. */
export const MIN_REASON = 10

/**
 * The kind of a pull request, from its title and branch.
 * @param {string} title - PR title.
 * @param {string} branch - head branch name.
 * @returns {'fix' | 'feat' | null} `null` when the gate does not apply.
 */
export function prKind(title, branch) {
  const fromTitle = /^\s*(fix|feat)(\([^)]*\))?!?:/i.exec(title)?.[1]?.toLowerCase()
  const fromBranch = /^(fix|feat)\//.exec(branch)?.[1]
  const kinds = [fromTitle, fromBranch]
  if (kinds.includes('fix')) return 'fix'
  if (kinds.includes('feat')) return 'feat'
  return null
}

/**
 * The reason given on a `Regression: none — <reason>` line, HTML comments ignored.
 * @param {string} body - PR body.
 * @returns {string | null} the trimmed reason, or `null` when there is no such line.
 */
export function noneReason(body) {
  const text = body.replace(/<!--[\s\S]*?-->/g, '')
  const found = /^[\s>*-]*Regression:\s*none\b\s*[—–:-]*\s*(.*)$/im.exec(text)
  return found === null ? null : found[1].trim()
}

/** Git tree modes of a plain file; anything else (symlink 120000, submodule 160000) is not a case. */
const REGULAR_MODES = ['100644', '100755']

/**
 * Judge one case file the diff touched, pure.
 * @param {object} input - what git says about the file at the head.
 * @param {string} input.path - repo-relative path.
 * @param {string} input.mode - git tree mode at the head.
 * @param {boolean} input.added - true when the file is not on the merge base.
 * @param {() => string} input.read - returns the file's text at the head; only called for a plain file.
 * @returns {{path: string, problems: string[], value?: import('../tests/regression/catalogue.mjs').RegressionCase}} the case or its problems.
 */
export function inspectCase({ path, mode, added, read }) {
  if (!REGULAR_MODES.includes(mode))
    return { path, problems: [`must be a regular file (git mode ${mode} is a symlink or a submodule)`] }
  const parsed = parseCase(read(), path)
  if (!parsed.ok) return { path, problems: parsed.problems }
  if (added && parseId(parsed.value.id)?.form === 'legacy')
    return {
      path,
      problems: [
        `a new case takes a PR-owned id: REG-PR-<PR number>-<slug> in a file named <id>.json ` +
          `(${parsed.value.id} is a legacy number, kept only for cases already on the target branch) — ` +
          'create it with `node tests/regression/create.mjs --pr <n> --slug <slug> --input <file>`'
      ]
    }
  // A case is judged by its own command, written once when it is added (plan
  // `tasks/todo-regression-deterministic.md`): a model reading prose costs minutes and tokens on
  // every rerun. Only a case that judges the model of Tracy itself may still go to a model runner.
  // Touching an old case is when it moves over, so an edit needs the script too.
  if (parsed.value.run === undefined && !parsed.value.flaky_model)
    return {
      path,
      problems: [
        `${parsed.value.id} carries no \`run\`: write the command that judges it — \`run.cmd\` (argv), with ` +
          '`run.tests` naming the tests that must pass, or a script under tests/regression/scripts/ — ' +
          'see tests/regression/README.md "Adding a case". Only a case with flaky_model: true may go without one.'
      ]
    }
  return { path, problems: [], value: parsed.value }
}

/**
 * Add a problem to every touched case whose id another file at the head also carries.
 * @param {ReturnType<typeof inspectCase>[]} changedCases - the cases the diff touched.
 * @param {{id: string, path: string}[]} headCatalogue - id and path of every case file at the head.
 * @returns {ReturnType<typeof inspectCase>[]} the same cases, duplicates turned into problems.
 */
export function flagDuplicates(changedCases, headCatalogue) {
  const duplicates = new Map(duplicateIds(headCatalogue).map((d) => [d.id, d.paths]))
  return changedCases.map((c) => {
    const paths = c.value === undefined ? undefined : duplicates.get(c.value.id)
    if (paths === undefined) return c
    const others = paths.filter((p) => p !== c.path)
    return { path: c.path, problems: [`id ${c.value?.id} is also carried by ${others.join(', ')}`] }
  })
}

/**
 * The gate's decision, pure: no git, no disk, no output.
 * @param {object} input - everything the gate knows about the pull request.
 * @param {'fix' | 'feat' | null} input.kind - `prKind(title, branch)`.
 * @param {string} input.body - PR body.
 * @param {{path: string, problems: string[], value?: import('../tests/regression/catalogue.mjs').RegressionCase}[]} input.changedCases -
 *   case files added or edited by the diff, parsed at the head.
 * @param {string[]} input.resultProblems - problems in result files the diff added or edited.
 * @param {{id: string, verdict: string, commit: string, where: 'branch' | 'base' | 'foreign' | 'missing'}[]} input.results -
 *   every result line in the tree at the head, with where its commit sits.
 * @returns {{code: number, stdout: string, stderr: string}} exit code and the two streams.
 */
export function judge({ kind, body, changedCases, resultProblems, results }) {
  if (kind === null) {
    return { code: 0, stdout: 'Regression: PR is not fix/feat — skipped.\n', stderr: '' }
  }

  const broken = changedCases.filter((c) => c.problems.length > 0)
  if (broken.length > 0 || resultProblems.length > 0) {
    let stderr = 'Invalid regression case or result file:\n\n'
    for (const c of broken) stderr += `  - ${c.path}: ${c.problems.join('; ')}\n`
    for (const p of resultProblems) stderr += `  - ${p}\n`
    stderr += '\nFormat: tests/regression/README.md\n'
    return { code: 1, stdout: '', stderr }
  }

  const matching = changedCases.flatMap((c) =>
    c.value !== undefined && c.value.kind === kind ? [c.value] : []
  )
  const passed = matching.filter((c) =>
    results.some((r) => r.id === c.id && r.verdict === 'PASS' && r.where === 'branch')
  )
  if (passed.length > 0) {
    const ids = passed.map((c) => c.id).join(', ')
    return { code: 0, stdout: `Regression: ${ids} has a PASS on this branch's commit.\n`, stderr: '' }
  }

  const reason = noneReason(body)
  if (kind === 'feat' && reason !== null && reason.length >= MIN_REASON) {
    return { code: 0, stdout: `Regression: none — ${reason}\n`, stderr: '' }
  }

  let stderr = `This ${kind} PR does not come with a regression case that has been run:\n\n`
  if (matching.length === 0) {
    const other = changedCases.filter((c) => c.value !== undefined && c.value.kind !== kind)
    stderr += `  - the diff adds/edits no case with \`kind: "${kind}"\` in tests/regression/cases/`
    stderr +=
      other.length > 0
        ? ` (${other.map((c) => c.value?.id).join(', ')} changed, but with another kind).\n`
        : '.\n'
  } else {
    for (const c of matching) {
      const own = results.filter((r) => r.id === c.id)
      const pass = own.filter((r) => r.verdict === 'PASS')
      if (own.length === 0) {
        stderr += `  - ${c.id}: no result line yet in ${RESULTS_DIR}.\n`
      } else if (pass.length === 0) {
        stderr += `  - ${c.id}: has results but no PASS line (${own.map((r) => r.verdict).join(', ')}).\n`
      } else {
        const where = {
          base: 'already on the target branch, not code of this PR',
          foreign: 'not in this branch history',
          missing: 'does not exist in the repo'
        }
        for (const r of pass) {
          stderr += `  - ${c.id}: PASS on commit \`${r.commit}\` — ${where[/** @type {'base' | 'foreign' | 'missing'} */ (r.where)]}.\n`
        }
      }
    }
  }
  if (kind === 'fix' && reason !== null) {
    stderr +=
      '  - `Regression: none` is only for feat; a fixed bug was reproducible, so it can be written as a case.\n'
  } else if (kind === 'feat' && reason !== null) {
    stderr += `  - the reason after \`Regression: none —\` is too short (${String(reason.length)} characters, need ≥ ${String(MIN_REASON)}).\n`
  }
  stderr +=
    '\nHow: add a case of the same kind with\n' +
    '`node tests/regression/create.mjs --pr <PR number> --slug <slug> --input <file.json>` (id\n' +
    '`REG-PR-<PR number>-<slug>`), or edit an existing case (keep its id); run\n' +
    '`node tests/regression/run.mjs --stand <url> --id <id>` on this branch code, then commit\n' +
    'the result file in tests/regression/results/.' +
    (kind === 'feat' ? ' Or, for feat, write `Regression: none — <reason>` in the PR description.' : '') +
    '\nGuide: tests/regression/README.md\n'
  return { code: 1, stdout: '', stderr }
}

/** stderr is captured, not inherited: a failing git is reported once, in the gate's own line. */
const GIT_OPTIONS = /** @type {const} */ ({
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe']
})

/**
 * Run git and return trimmed stdout. A failing git throws: the gate then exits 2 instead of
 * reading "no output" as "nothing to judge".
 * @param {string[]} args - git arguments.
 * @returns {string} stdout.
 */
function git(args) {
  return execFileSync('git', args, GIT_OPTIONS).trim()
}

/**
 * Run a git command that prints NUL-separated fields (`-z`) and split them. With `-z` git prints
 * a path as it is; without it a name with a non-ASCII byte comes back quoted and would no longer
 * look like a case path — a malformed case skipped instead of reported.
 * @param {string[]} args - git arguments, `-z` included.
 * @returns {string[]} the fields, empty ones dropped.
 */
function gitFields(args) {
  return execFileSync('git', args, GIT_OPTIONS)
    .split('\0')
    .filter((field) => field !== '')
}

/**
 * Ask git a yes/no question. Git answers these with exit 0 (yes) or 1 (no); anything else — 128
 * from a broken repository, a signal, git not found — is a failure, not a "no". Reading it as "no"
 * would turn "could not check that this commit is on the target branch" into "it is not", and so
 * count a target-branch PASS as the branch's own.
 * @param {string[]} args - git arguments.
 * @returns {boolean} true on exit 0, false on exit 1.
 */
function gitAnswers(args) {
  const r = spawnSync('git', args, GIT_OPTIONS)
  if (r.status === 0) return true
  if (r.status === 1) return false
  const why = r.error?.message ?? (r.signal ? `killed by ${r.signal}` : `exit ${String(r.status)}`)
  throw new Error(`git ${args.join(' ')} failed (${why})${r.stderr ? `: ${r.stderr.trim()}` : ''}`)
}

/**
 * Where a result's commit sits relative to the pull request.
 * @param {string} commit - sha from a result line.
 * @param {string} head - PR head sha.
 * @param {string} mergeBase - merge base of the head and the target branch.
 * @returns {'branch' | 'base' | 'foreign' | 'missing'} classification.
 */
function whereIs(commit, head, mergeBase) {
  if (
    !/^[0-9a-f]{7,40}$/.test(commit) ||
    !gitAnswers(['rev-parse', '--verify', '--quiet', `${commit}^{commit}`])
  )
    return 'missing'
  if (!gitAnswers(['merge-base', '--is-ancestor', commit, head])) return 'foreign'
  if (gitAnswers(['merge-base', '--is-ancestor', commit, mergeBase])) return 'base'
  return 'branch'
}

/**
 * Read the payload and git, then ask `judge`. Only this part touches the outside world.
 * @param {string | undefined} payloadPath - event payload path.
 * @returns {number} exit code.
 */
function main(payloadPath) {
  if (payloadPath === undefined) {
    process.stderr.write('check-regression: no payload — pass a path, or set GITHUB_EVENT_PATH\n')
    return 2
  }
  const payload = JSON.parse(readFileSync(payloadPath, 'utf8'))
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('payload is not a JSON object')
  const pr = payload.pull_request
  if (pr === undefined) {
    process.stdout.write('Regression: not a pull_request event — skipped.\n')
    return 0
  }
  if (pr === null || typeof pr !== 'object' || Array.isArray(pr))
    throw new Error('payload.pull_request is not an object')
  const kind = prKind(pr.title ?? '', pr.head?.ref ?? '')
  if (kind === null) {
    const result = judge({ kind, body: '', changedCases: [], resultProblems: [], results: [] })
    process.stdout.write(result.stdout)
    return result.code
  }
  const head = pr.head.sha
  const mergeBase = git(['merge-base', pr.base.sha, head])
  // `T` (type change) is listed with A and M: a case turned into a symlink is a changed case.
  const status = gitFields([
    'diff',
    '--name-status',
    '-z',
    '--no-renames',
    '--diff-filter=AMT',
    `${mergeBase}..${head}`
  ])
  /** @type {{path: string, added: boolean}[]} */
  const changed = []
  for (let i = 0; i + 1 < status.length; i += 2)
    changed.push({ path: status[i + 1], added: status[i] === 'A' })
  const show = (path) => git(['show', `${head}:${path}`])
  // `<mode> <type> <object>\t<path>` for every file in the cases folder at the head.
  const headCases = gitFields(['ls-tree', '-r', '-z', head, '--', CASES_DIR]).flatMap((line) => {
    const tab = line.indexOf('\t')
    const path = line.slice(tab + 1)
    return isCasePath(path) ? [{ path, mode: line.slice(0, line.indexOf(' ')) }] : []
  })
  const modeOf = new Map(headCases.map((c) => [c.path, c.mode]))
  const inspected = changed
    .filter((c) => isCasePath(c.path))
    .map((c) => inspectCase({ ...c, mode: modeOf.get(c.path) ?? '', read: () => show(c.path) }))
  // Ids of the whole catalogue at the head, read leniently: a file that is not a case here is
  // somebody else's problem unless this diff touched it, but its id still collides.
  const headCatalogue = inspected.some((c) => c.value !== undefined)
    ? headCases.flatMap(({ path, mode }) => {
        if (!REGULAR_MODES.includes(mode)) return []
        try {
          const id = JSON.parse(show(path))?.id
          return typeof id === 'string' ? [{ id, path }] : []
        } catch (error) {
          if (error instanceof SyntaxError) return []
          throw error
        }
      })
    : []
  const changedCases = flagDuplicates(inspected, headCatalogue)
  const resultProblems = changed
    .filter((c) => isResultPath(c.path))
    .flatMap((c) => parseResults(show(c.path)).problems.map((p) => `${c.path}: ${p}`))
  const resultFiles = gitFields(['ls-tree', '-r', '-z', '--name-only', head, '--', RESULTS_DIR]).filter(
    isResultPath
  )
  const ids = new Set(changedCases.flatMap((c) => (c.value === undefined ? [] : [c.value.id])))
  const lines = resultFiles.flatMap((path) => parseResults(show(path)).lines).filter((l) => ids.has(l.id))
  const results = lines.map((l) => ({ ...l, where: whereIs(l.commit, head, mergeBase) }))
  const result = judge({ kind, body: pr.body ?? '', changedCases, resultProblems, results })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  return result.code
}

// realpath on both sides: a temp path on macOS is reached through a symlink (/var -> /private/var).
if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  let code
  try {
    code = main(process.argv[2] ?? process.env.GITHUB_EVENT_PATH)
  } catch (error) {
    // An unreadable payload or a failing git is not a verdict on the pull request: say so and
    // exit 2, never green.
    process.stderr.write(
      `check-regression: cannot read the payload or git — ${/** @type {Error} */ (error).message}\n`
    )
    code = 2
  }
  process.exit(code)
}
