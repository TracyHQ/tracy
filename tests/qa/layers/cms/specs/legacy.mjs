// Adapters that run the repository's existing quickstart/release suites. They give a verdict about the suite, not
// about a requirement: a green suite has no per-case oracle or RED proof in this layer, so it is never PASS.
//   every outcome is PENDING with its exit and log (see classifyRun): the layer has no per-case oracle for these suites,
//   and a nonzero exit has no independent mapping to a product defect or an environment gap.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { atomicWrite, safeName, spawnBounded } from '../lib/kit.mjs'

export function countsOf(runner, text) {
  if (runner === 'python3') {
    const ran = /Ran (\d+) tests?/.exec(text)
    return {
      tests: ran ? Number(ran[1]) : null,
      skipped: Number(/skipped=(\d+)/.exec(text)?.[1] ?? 0),
      pass: /_FailedTest/.test(text) ? 0 : null
    }
  }
  const num = (name) => {
    const m = new RegExp(`^# ${name} (\\d+)`, 'm').exec(text)
    return m ? Number(m[1]) : null
  }
  return { tests: num('tests'), skipped: num('skipped') ?? 0, pass: num('pass') }
}

/**
 * One verdict table for a finished or abandoned suite run, shared by the cms and related adapters. It reads only what
 * the OS reported about the process (spawn error, truncation, timeout, signal, exit code) and the runner's own counts.
 * It never reads a cause out of the suite's output: a message that names a missing module, tool or path is text the
 * suite chose to print, so it proves neither an absent dependency nor a product defect. A run that finished with a
 * nonzero exit therefore has no independent assertion mapping here and stays PENDING with its exit and log; an ENV
 * verdict comes only from a prerequisite probed BEFORE the run (declared in the case manifest or the adapter).
 *   kind: invalid | nonzero | zero | skipped | green
 */
export function classifyRun(r, counts) {
  const invalid = (why) => ({ verdict: 'PENDING', kind: 'invalid', reason: `TEST_INVALID: ${why}` })
  if (r.spawnError) return invalid(`the process could not be started (${r.spawnError}); no result exists`)
  if (r.truncated)
    return invalid(
      'output exceeded the limit and the run was stopped, so exit and report are not a complete result'
    )
  if (r.timedOut) return invalid('the run hit its time limit and was stopped; exit status unknown')
  if (r.signal) return invalid(`the process ended by signal ${r.signal}, not by finishing`)
  if (!Number.isInteger(r.exit)) return invalid('the process reported no exit code')
  if (r.exit !== 0)
    return {
      verdict: 'PENDING',
      kind: 'nonzero',
      reason: `the suite finished with exit ${r.exit}; no independent assertion maps that to a product defect or to an environment gap, so it is neither FAIL nor ENV`
    }
  if (counts.tests === null || counts.tests === 0)
    return {
      verdict: 'PENDING',
      kind: 'zero',
      reason: `exit 0 but ${counts.tests ?? 'no'} tests reported; zero tests is not a pass`
    }
  if (counts.skipped > 0)
    return {
      verdict: 'PENDING',
      kind: 'skipped',
      reason: `exit 0 but ${counts.skipped} of ${counts.tests} tests skipped; a skip proves neither a pass nor a missing dependency`
    }
  return {
    verdict: 'PENDING',
    kind: 'green',
    reason: `exit 0, ${counts.tests} tests (a TAP report cannot tell a registered test from a file that merely completed; that gap is recorded, not guessed)`
  }
}

export async function runLegacySuite(ctx) {
  const { file, runner } = ctx.params
  const argv =
    runner === 'node'
      ? ['node', '--test', '--test-reporter=tap', '--test-timeout=240000', file]
      : ['python3', file]
  // A private scratch folder this run owns (unpredictable name, outside the artifacts), removed in `finally`.
  const tmpdir = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'qa-cms-legacy-'))
  const logRel = `logs/${safeName(ctx.caseId)}.log`
  try {
    const r = await spawnBounded({
      argv,
      cwd: ctx.repoRoot,
      env: { ...ctx.env, TMPDIR: tmpdir, PYTHONDONTWRITEBYTECODE: '1' },
      timeoutMs: 600_000
    })
    const header = `argv: ${argv.join(' ')}\nexit: ${r.exit} signal: ${r.signal} timedOut: ${r.timedOut} truncated: ${Boolean(r.truncated)}\n---\n`
    await atomicWrite(path.join(ctx.outDir, logRel), `${header}${r.stdout}\n--- stderr ---\n${r.stderr}\n`)
    const c = classifyRun(r, countsOf(runner, `${r.stdout}\n${r.stderr}`))
    return { verdict: c.verdict, reason: `${file}: ${c.reason}; see ${logRel}`, evidence: [logRel] }
  } finally {
    await fs.rm(tmpdir, { recursive: true, force: true })
  }
}

export function legacySpecs(inventory) {
  return [
    {
      item: null,
      assertion: 'legacy.suite-exit-status',
      area: 'legacy',
      requirement:
        'The existing release/contract/quickstart suite of the repo that owns it runs to the end without failing.',
      oracle: {
        source: 'the suite itself (owner: the package that carries it)',
        section: 'suite assertions',
        invariant:
          'exit 0, no skipped tests; an owner-written suite is evidence about its own assertions only'
      },
      reads: ['the suite file and what it imports'],
      perRelease: false,
      variants: inventory.legacy.map((l) => ({
        key: safeName(l.file.replace(/^(apps|packages)\//, '')),
        itemId: l.id,
        tags: ['happy'],
        params: { file: l.file, runner: l.runner },
        mutation: null,
        prerequisites: [
          ...(l.needsDatabase ? ['db:test-database'] : []),
          ...(l.runner === 'python3' ? ['tool:python3'] : [])
        ]
      })),
      mutations: {},
      execute: runLegacySuite,
      legacy: true
    }
  ]
}
