/**
 * Run a package's own vitest (its `node_modules/.bin/vitest`, from that package's folder) and read
 * the result from vitest's JSON report, so a case script can check counts and test titles exactly.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT, cannotRun, run } from './lib.mjs'

/**
 * @typedef {object} VitestRun
 * @property {number | null} status - exit code.
 * @property {{tests: number, passed: number, failed: number, pending: number}} counts - from the report.
 * @property {string[]} passed - titles of the tests that passed (the test's own title, no suite).
 * @property {string[]} failed - titles of the tests that failed.
 * @property {string} output - stdout and stderr, for a failure message.
 */

/**
 * Run `vitest run <args>` in a repo folder.
 * @param {string} pkg - repo-relative folder holding the package.
 * @param {string[]} args - arguments after `vitest run`.
 * @returns {VitestRun} the run.
 */
export function vitestRun(pkg, args) {
  const cwd = join(ROOT, pkg)
  const bin = join(cwd, 'node_modules/.bin/vitest')
  if (!existsSync(bin)) cannotRun(`${pkg}/node_modules/.bin/vitest is missing (install the workspace)`)
  const dir = mkdtempSync(join(tmpdir(), 'reg-vitest-'))
  const report = join(dir, 'report.json')
  try {
    const r = run(bin, ['run', ...args, '--reporter=default', '--reporter=json', `--outputFile=${report}`], {
      cwd
    })
    const output = `${r.stdout}\n${r.stderr}`
    if (!existsSync(report))
      return {
        status: r.status,
        counts: { tests: -1, passed: -1, failed: -1, pending: -1 },
        passed: [],
        failed: [],
        output
      }
    const j = JSON.parse(readFileSync(report, 'utf8'))
    const all = j.testResults.flatMap((f) => f.assertionResults)
    return {
      status: r.status,
      counts: {
        tests: j.numTotalTests,
        passed: j.numPassedTests,
        failed: j.numFailedTests,
        pending: j.numPendingTests
      },
      passed: all.filter((a) => a.status === 'passed').map((a) => a.title),
      failed: all.filter((a) => a.status === 'failed').map((a) => a.title),
      output
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
