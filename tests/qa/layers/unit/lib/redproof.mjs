/**
 * RED proof of a regression case on its own pre-fix source.
 *
 * The fix is found in history, never assumed from a merge-base: the first-parent merge commit of the
 * case's pull request, whose FIRST parent is the tree develop had before the fix. The product files
 * that merge changed are put back to that parent's content inside a scratch overlay, the case's own
 * command (the same test, the same oracle, the same inputs) is run there, and the proof is accepted
 * only when a named assertion of the case reports `not ok`. A run that fails to load code, a green
 * run, or a red that names nothing the case asserts leaves the case PENDING.
 */
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tapVerdict } from '../../../../regression/script.mjs'
import {
  git,
  overlayNodeOptions,
  overlayRestore,
  overlayWrite,
  parseTap,
  REPO,
  runChild,
  sha256
} from '../../static/lib/common.mjs'
import { readBytesSync, readTextSync } from '../../../lib/bounded-reader.mjs'

/** Output that means the code could not load: never an assertion. */
export const LOAD_FAILURE =
  /ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)|ERR_UNKNOWN_FILE_EXTENSION|ERR_PACKAGE_PATH_NOT_EXPORTED|does not provide an export named/

/** Paths whose change is not product behaviour (tests, docs, journals, lockfiles, CI). */
const NOT_PRODUCT = [
  /^(tests|tasks|docs|\.github|\.agents|\.claude)\//,
  /(^|\/)(test|tests|__tests__)\//,
  /\.test\.(mjs|cjs|js|ts|tsx)$/,
  /\.md$/,
  /(^|\/)package\.json$/,
  /(^|\/)pnpm-lock\.yaml$/
]

/**
 * @param {string} path - repo-relative path.
 * @returns {boolean} true when the path is product code or product data.
 */
export function isProductPath(path) {
  return !NOT_PRODUCT.some((re) => re.test(path))
}

/**
 * Locate the merge commit of a pull request on the first-parent history of HEAD.
 * @param {number} pr - pull request number.
 * @param {string} [root] - repository.
 * @returns {{merge: string, parent: string, how: string} | null} the merge and its first parent.
 */
export function findFix(pr, root = REPO) {
  for (const [how, needle] of [
    ['merge commit', `Merge pull request #${pr} from`],
    ['squash commit', `(#${pr})`]
  ]) {
    const out = git(
      ['log', '--first-parent', '--fixed-strings', `--grep=${needle}`, '--format=%H %P', 'HEAD'],
      root
    )
    const rows = out.split('\n').filter((l) => l !== '')
    if (rows.length === 0) continue
    // Oldest match: later commits can only mention the PR in passing.
    const [merge, ...parents] = rows[rows.length - 1].split(' ')
    if (parents.length > 0) return { merge, parent: parents[0], how }
  }
  return null
}

/**
 * @param {string} from - base commit.
 * @param {string} to - fix commit.
 * @param {string} [root] - repository.
 * @returns {{status: 'A' | 'M' | 'D', path: string}[]} files the fix changed.
 */
export function changedFiles(from, to, root = REPO) {
  const out = git(['diff', '--name-status', '--no-renames', '-z', from, to], root)
  const parts = out.split('\0').filter((p) => p !== '')
  const rows = []
  for (let i = 0; i + 1 < parts.length; i += 2) rows.push({ status: parts[i][0], path: parts[i + 1] })
  return rows.filter((r) => ['A', 'M', 'D'].includes(r.status))
}

/**
 * @param {string} ref - commit.
 * @param {string} path - repo-relative path.
 * @param {string} [root] - repository.
 * @returns {Buffer} the file at that commit.
 */
export function blobAt(ref, path, root = REPO) {
  const r = spawnSync('git', ['show', `${ref}:${path}`], { cwd: root, maxBuffer: 512 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`git show ${ref}:${path} failed`)
  return r.stdout
}

/**
 * Judge the output of the case's command on the pre-fix source.
 * @param {object} manifest - the case.
 * @param {{status: number | null, timedOut: boolean}} child - how the run ended.
 * @param {string} text - the run's output.
 * @param {string} [control] - output of the green run on the real tree; a script case's failed check
 *   counts only when the same check passed there (an unrelated or new failure proves nothing).
 * @returns {{red: boolean, assertions: string[], why: string}} the judgement.
 */
export function judgeRed(manifest, child, text, control = '') {
  if (child.timedOut) return { red: false, assertions: [], why: 'the run timed out' }
  if (child.status === 0) return { red: false, assertions: [], why: 'still green on the pre-fix source' }
  // Only a normal exit with a non-zero code is a failed assertion; a signal, a spawn error or no status proves nothing.
  if (!Number.isInteger(child.status) || child.signal || child.spawnFailed)
    return {
      red: false,
      assertions: [],
      why: `the run did not end normally (${child.signal ?? 'no exit status'})`
    }
  if (LOAD_FAILURE.test(text))
    return {
      red: false,
      assertions: [],
      why: 'the run failed to load code (module missing), which is not an assertion'
    }
  if (manifest.style === 'node-tap') {
    if (manifest.tests.length > 0) {
      const out = text.split('\n--- stderr ---')[0]
      const whole = parseTap(out)
      if (!whole.valid)
        return { red: false, assertions: [], why: `the TAP output is not a complete run: ${whole.why}` }
      const v = tapVerdict(out, manifest.tests)
      // tapVerdict counts SKIP/TODO as failed (right for a green run); a skipped assertion never ran,
      // so only a plain `not ok` line is a RED.
      const notOk = out
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^not ok \d+ - /.test(l) && !/\s#\s*(?:SKIP|TODO)\b/i.test(l))
        .map((l) => l.replace(/^not ok \d+ - /, ''))
      const failed = v.failed.filter((n) => notOk.includes(n))
      return failed.length > 0
        ? { red: true, assertions: failed, why: '' }
        : {
            red: false,
            assertions: [],
            why: `no named assertion reported a plain not ok (skipped/todo is not red; not found: ${v.missing.length})`
          }
    }
    // No named assertion: the case's whole command is its oracle, so a red counts only when the same test
    // passed on the real tree (the control) and the pre-fix output is a complete, self-consistent TAP run.
    const out = text.split('\n--- stderr ---')[0]
    const tap = parseTap(out)
    if (!tap.valid)
      return { red: false, assertions: [], why: `the TAP output is not a complete run: ${tap.why}` }
    const green = new Set(parseTap(control.split('\n--- stderr ---')[0]).ok)
    const related = tap.notOk.filter((t) => green.has(t))
    return related.length > 0
      ? { red: true, assertions: related.slice(0, 5), why: '' }
      : {
          red: false,
          assertions: [],
          why: 'no `not ok` test that passed on the real tree: the failure is unrelated or new'
        }
  }
  // script style: the case prints `not ok - <check>` lines and `N CHECK(S) FAILED`.
  const lines = text.split('\n').filter((l) => l.startsWith('not ok - '))
  const passedBefore = new Set(
    control
      .split('\n')
      .filter((l) => l.startsWith('ok - '))
      .map((l) => l.slice(5).trim())
  )
  // A failed check proves the case only when it passed on the real tree and, if the manifest names its
  // assertions, is one of them.
  const named = (l) => manifest.tests.length === 0 || manifest.tests.some((t) => l.slice(9).trim() === t)
  const related = lines.filter((l) => passedBefore.has(l.slice(9).trim()) && named(l))
  if (!/CHECK\(S\) FAILED/.test(text) || lines.length === 0)
    return { red: false, assertions: [], why: 'the script reported no failed check' }
  return related.length > 0
    ? { red: true, assertions: related.slice(0, 8).map((l) => l.slice(0, 160)), why: '' }
    : {
        red: false,
        assertions: [],
        why: 'no failed check that passed on the real tree and is named by the case: the failure is unrelated'
      }
}

/**
 * Try to prove a regression case RED.
 * @param {object} o - inputs.
 * @param {object} o.manifest - the case.
 * @param {string} o.root - real tree.
 * @param {string} o.scratch - overlay root.
 * @param {string} o.outDir - output directory.
 * @param {(p: string) => string} o.rel - path relative to the output directory.
 * @param {string} o.controlLog - log of the green run on the real tree.
 * @param {Record<string, string | undefined>} o.env - environment for the run (no database URL).
 * @returns {Promise<{ok: true, proof: object, evidence: string[]} | {ok: false, reason: string, evidence: string[]}>} outcome.
 */
export async function proveRegressionRed({ manifest, root, scratch, outDir, rel, controlLog, env }) {
  const fix = findFix(manifest.regression.pr, root)
  if (fix === null)
    return {
      ok: false,
      reason: `no first-parent merge or squash commit for PR #${manifest.regression.pr} in this history`,
      evidence: []
    }
  const changed = changedFiles(fix.parent, fix.merge, root).filter((f) => isProductPath(f.path))
  if (changed.length === 0)
    return {
      ok: false,
      reason: `PR #${manifest.regression.pr} (${fix.merge.slice(0, 9)}) changed no product file`,
      evidence: []
    }
  const restore = changed.filter((f) => f.status !== 'A')
  const added = changed.filter((f) => f.status === 'A')
  const candidates = []
  if (restore.length > 0) candidates.push({ name: 'restore-changed', restore, remove: [] })
  if (added.length > 0) candidates.push({ name: 'restore-changed-and-remove-added', restore, remove: added })
  const why = []
  const evidence = []
  for (const cand of candidates) {
    const touched = []
    let child = null
    let text = ''
    let log = ''
    try {
      for (const f of cand.restore) {
        overlayWrite(scratch, f.path, blobAt(fix.parent, f.path, root))
        touched.push(f.path)
      }
      for (const f of cand.remove) {
        overlayWrite(scratch, f.path, null)
        touched.push(f.path)
      }
      log = join(outDir, 'logs', `${manifest.id}.red-${cand.name}.log`)
      child = await runChild({
        argv: manifest.command,
        cwd: join(scratch, manifest.cwd === '.' ? '' : manifest.cwd),
        log,
        env: { ...env, NODE_OPTIONS: overlayNodeOptions() },
        timeoutMs: manifest.timeoutS * 1000
      })
      text = readTextSync(log)
      evidence.push(rel(log))
    } finally {
      for (const p of touched) overlayRestore(scratch, root, p)
    }
    const verdict = judgeRed(
      manifest,
      child,
      text,
      (() => {
        try {
          return readTextSync(join(outDir, controlLog))
        } catch {
          return ''
        }
      })()
    )
    if (verdict.red) {
      const testFiles = manifest.command
        .filter((a) => /\.(?:test\.)?(?:mjs|ts)$/.test(a))
        .map((a) => {
          try {
            return {
              path: a,
              sha256: // `root` may be a scratch overlay of links: resolve it, then read the real file.
                sha256(readBytesSync(realpathSync(join(root, manifest.cwd === '.' ? '' : manifest.cwd, a))))
            }
          } catch {
            return { path: a, sha256: 'unreadable' }
          }
        })
      return {
        ok: true,
        evidence,
        proof: {
          kind: 'commit',
          ref: fix.parent,
          fixCommit: fix.merge,
          source: `first parent of the ${fix.how} of PR #${manifest.regression.pr}`,
          candidate: cand.name,
          assertionId: verdict.assertions.join(' | '),
          log: rel(log),
          controlLog,
          restored: cand.restore.map((f) => ({
            path: f.path,
            status: f.status,
            preFixSha256: sha256(blobAt(fix.parent, f.path, root))
          })),
          removed: cand.remove.map((f) => f.path),
          testFiles,
          caseFile: manifest.regression.file
        }
      }
    }
    why.push(`${cand.name}: ${verdict.why}`)
  }
  return { ok: false, reason: why.join('; '), evidence }
}
