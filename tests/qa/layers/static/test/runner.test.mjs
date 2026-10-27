/**
 * Selftests of the static layer's runner and of the shared plumbing both layers use. They run the
 * real `run()` against a fake tree: a known-good case passes, an injected fault is caught as FAIL, a
 * missing dependency gives ENV, a case with no red proof stays PENDING, and bad usage exits 2.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  breakRule,
  fakeTree,
  freshDir,
  install,
  manifestFor,
  read
} from '../../../fixtures/static/fake-tree.mjs'
import {
  redProofProblems,
  requiredGateProblems,
  STATIC_REQUIRED_GATES
} from '../../../fixtures/static/acceptance.mjs'
import { run, listCases } from '../index.mjs'
import {
  acquireLock,
  exitCodeFor,
  killAll,
  loadManifests,
  parseArgs,
  parseTap,
  resolveOutDir,
  runChild,
  UsageError,
  writeReports
} from '../lib/common.mjs'

const RUN = fileURLToPath(new URL('../run.mjs', import.meta.url))

/** Run a case list through the real runner. */
async function go(t, manifests, { proveRed = true, target = 'local', mutations = [], gates = {} } = {}) {
  install(t, manifests, mutations, gates)
  const cases = await listCases({}, t.ctx)
  return run({ cases, target, proveRed, outDir: t.out }, t.ctx)
}

test('a known-good case passes only with a RED proof taken from a real mutation', async () => {
  const t = fakeTree()
  const [r] = await go(t, [manifestFor('g', { mutations: ['break-rule'] })], { mutations: [breakRule()] })
  assert.equal(r.verdict, 'PASS', r.reason)
  assert.equal(r.redProof.kind, 'mutation')
  assert.equal(r.redProof.mutations[0].assertionId, 'static.g.rule-broken-detected')
  assert.match(read(join(t.out, r.redProof.mutations[0].log)), /RULE BROKEN: status: BAD/)
  assert.match(read(join(t.out, r.redProof.controlLog)), /1 gate\(s\) passed/)
  assert.equal(read(join(t.root, 'rule.txt')), 'status: OK\n', 'the real tree is never written')
  assert.deepEqual(
    readdirSync(t.out).filter((n) => n.startsWith('scratch')),
    [],
    'scratch overlay removed'
  )
})

test('an injected fault is caught as FAIL, not hidden', async () => {
  const t = fakeTree({ rule: 'status: BAD\n' })
  const [r] = await go(t, [manifestFor('g', { mutations: ['break-rule'] })], { mutations: [breakRule()] })
  assert.equal(r.verdict, 'FAIL')
  assert.match(r.reason, /RULE BROKEN/)
})

test('a missing dependency is ENV, with the failure as the probe evidence', async () => {
  const t = fakeTree()
  const [r] = await go(t, [manifestFor('g', { command: ['qa-no-such-program-xyz', '--x'] })])
  assert.equal(r.verdict, 'ENV')
  assert.match(r.reason, /could not start/)
  const t2 = fakeTree()
  rmSync(join(t2.root, 'node_modules'), { recursive: true })
  t2.ctx.skipToolchainProbe = false
  const [r2] = await go(t2, [manifestFor('g')])
  assert.equal(r2.verdict, 'ENV')
  assert.match(r2.reason, /toolchain probe/)
})

test('a gate whose declared prerequisite file is absent is ENV with the probe, never FAIL', async () => {
  const t = fakeTree({ rule: 'status: BAD\n' }) // would be FAIL if it ran
  const [r] = await go(t, [manifestFor('g')], {
    gates: { g: { requires: ['node_modules/.bin/dsh'], requiresWhy: 'spawns dsh' } }
  })
  assert.equal(r.verdict, 'ENV', r.reason)
  assert.match(r.reason, /node_modules\/\.bin\/dsh not present \(probe: existsSync; spawns dsh\)/)
})

test('without a recorded mutation, or without --prove-red, a green gate stays PENDING', async () => {
  const t = fakeTree()
  const [none] = await go(t, [manifestFor('g')])
  assert.equal(none.verdict, 'PENDING')
  assert.match(none.reason, /no recorded mutation/)
  const t2 = fakeTree()
  const [notAsked] = await go(t2, [manifestFor('g', { mutations: ['break-rule'] })], {
    proveRed: false,
    mutations: [breakRule()]
  })
  assert.equal(notAsked.verdict, 'PENDING')
  assert.match(notAsked.reason, /--prove-red/)
})

test('a mutation that does not turn the gate red is not a proof', async () => {
  const t = fakeTree()
  const harmless = breakRule({ edits: [{ file: 'rule.txt', op: 'append', text: 'note\n' }] })
  const [r] = await go(t, [manifestFor('g', { mutations: ['break-rule'] })], { mutations: [harmless] })
  assert.equal(r.verdict, 'PENDING')
  assert.match(r.reason, /did not go red/)
})

test('a red that names a different assertion is not accepted', async () => {
  const t = fakeTree()
  const [r] = await go(t, [manifestFor('g', { mutations: ['break-rule'] })], {
    mutations: [breakRule({ expect: { output: ['SOME OTHER MESSAGE'] } })]
  })
  assert.equal(r.verdict, 'PENDING')
  assert.match(r.reason, /expected assertion/)
})

test('a red that is only a load failure is not RED', async () => {
  const gate = `import { readFileSync } from 'node:fs'
if (readFileSync(new URL('./rule.txt', import.meta.url), 'utf8').includes('BAD')) {
  console.error("Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'x' RULE BROKEN")
  process.exit(1)
}
console.log('check-all: 1 gate(s) passed')
`
  const t = fakeTree({ gate })
  const [r] = await go(t, [manifestFor('g', { mutations: ['break-rule'] })], { mutations: [breakRule()] })
  assert.equal(r.verdict, 'PENDING')
  assert.match(r.reason, /load failure/)
})

test('a positive control that is red in the scratch overlay blocks the proof', async () => {
  const gate = `if (process.cwd().includes('scratch')) { console.error('only red in scratch'); process.exit(1) }
console.log('check-all: 1 gate(s) passed')
`
  const t = fakeTree({ gate })
  const [r] = await go(t, [manifestFor('g', { mutations: ['break-rule'] })], { mutations: [breakRule()] })
  assert.equal(r.verdict, 'PENDING')
  assert.match(r.reason, /positive control is not green/)
})

test('a gate that exits 0 without its success line, or says it stood down, is not a pass', async () => {
  const quiet = fakeTree({ gate: 'console.log("nothing happened")\n' })
  const [a] = await go(quiet, [manifestFor('g', { mutations: ['break-rule'] })], { mutations: [breakRule()] })
  assert.equal(a.verdict, 'PENDING')
  assert.match(a.reason, /success line/)
  const down = fakeTree({
    gate: 'console.log("gate stood down: no profile")\nconsole.log("check-all: 1 gate(s) passed")\n'
  })
  const [b] = await go(down, [manifestFor('g', { mutations: ['break-rule'] })], { mutations: [breakRule()] })
  assert.equal(b.verdict, 'PENDING')
  assert.match(b.reason, /did not run/)
})

test('a mutation cannot escape the overlay or edit the real tree', async () => {
  const t = fakeTree()
  const escape = breakRule({ edits: [{ file: '../tree-outside.txt', op: 'append', text: 'x' }] })
  const [r] = await go(t, [manifestFor('g', { mutations: ['break-rule'] })], { mutations: [escape] })
  assert.equal(r.verdict, 'PENDING')
  assert.match(r.reason, /invalid/)
  assert.equal(existsSync(join(t.dir, 'tree-outside.txt')), false)
  const t2 = fakeTree()
  const twice = breakRule({
    edits: [
      { file: 'rule.txt', op: 'replace', find: 'status', replace: 'state' },
      { file: 'rule.txt', op: 'replace', find: 'nope', replace: 'x' }
    ]
  })
  const [r2] = await go(t2, [manifestFor('g', { mutations: ['break-rule'] })], { mutations: [twice] })
  assert.equal(r2.verdict, 'PENDING')
  assert.equal(read(join(t2.root, 'rule.txt')), 'status: OK\n')
})

test('a child that outlives its time limit is killed with its descendants', async () => {
  const dir = freshDir()
  const started = Date.now()
  const child = await runChild({
    argv: [
      'node',
      '-e',
      "require('node:child_process').spawn('sleep',['30'],{stdio:'inherit'});setTimeout(()=>{},30000)"
    ],
    cwd: dir,
    log: join(dir, 'child.log'),
    timeoutMs: 600
  })
  assert.equal(child.timedOut, true)
  assert.ok(Date.now() - started < 10000, 'returned promptly')
})

test('target policy: a non-local target turns every case into PENDING target-policy before running', async () => {
  const t = fakeTree()
  const out = await go(t, [manifestFor('g')], { target: 'prod' })
  assert.equal(out[0].verdict, 'PENDING')
  assert.match(out[0].reason, /^target-policy/)
  assert.equal(existsSync(join(t.out, 'logs')), false, 'nothing was executed')
})

test('heavy gates are probed, never silently run; recorded-env gates never run', async () => {
  const t = fakeTree()
  const heavy = manifestFor('heavy', {
    mode: 'heavy',
    gate: 'heavy',
    command: ['node', '-e', 'process.exit(1)']
  })
  const rec = manifestFor('rec', {
    mode: 'recorded-env',
    gate: 'rec',
    command: ['node', '-e', 'process.exit(1)']
  })
  const out = await go(t, [heavy, rec], {
    gates: {
      heavy: { mode: 'heavy', probe: 'boot-graph' },
      rec: { mode: 'recorded-env', evidence: 'fixture-evidence.json' }
    }
  })
  const byId = Object.fromEntries(out.map((r) => [r.id, r]))
  assert.equal(
    byId['QA-STATIC-heavy-happy'].verdict,
    'ENV',
    'boot-graph prerequisites are absent in the fake tree'
  )
  assert.match(byId['QA-STATIC-heavy-happy'].reason, /not present/)
  assert.equal(byId['QA-STATIC-rec-happy'].verdict, 'ENV')
  assert.match(byId['QA-STATIC-rec-happy'].reason, /known local false red/)
  assert.equal(existsSync(join(t.out, 'logs')), false, 'neither command was run')
})

test('argument parsing rejects unknown, repeated, valueless and positional input', () => {
  const spec = {
    area: { type: 'string', repeat: true },
    target: { type: 'string' },
    'prove-red': { type: 'boolean' }
  }
  assert.deepEqual(parseArgs(['--area', 'a', '--area=b', '--prove-red'], spec), {
    area: ['a', 'b'],
    'prove-red': true
  })
  for (const bad of [
    ['--nope'],
    ['--target', 'a', '--target', 'b'],
    ['--target'],
    ['--target', '--prove-red'],
    ['stray'],
    ['--prove-red=1'],
    ['--target=']
  ])
    assert.throws(() => parseArgs(bad, spec), UsageError, bad.join(' '))
})

test('the CLI exits 2 on usage errors before touching anything, 3 on PENDING-only', () => {
  const outside = join(freshDir(), 'x')
  const cases = [
    ['--bogus'],
    ['--area', 'no-such-gate-xyz'],
    ['--target', 'moon'],
    ['--target', 'local', '--target', 'local'],
    ['--out'],
    ['--out', '/etc/qa-out']
  ]
  for (const args of cases) {
    const r = spawnSync('node', [RUN, ...args], { encoding: 'utf8' })
    assert.equal(r.status, 2, `${args.join(' ')} -> ${r.status}: ${r.stderr}`)
  }
  assert.equal(existsSync('/etc/qa-out'), false)
  assert.equal(existsSync(outside), false)
  const ok = spawnSync(
    'node',
    [RUN, '--area', 'QA-STATIC-rule-focus-halo-invalid', '--out', join(freshDir(), 'o')],
    { encoding: 'utf8' }
  )
  assert.equal(ok.status, 3, ok.stderr)
})

test('output directories are contained and single-writer', () => {
  assert.throws(() => resolveOutDir('/etc/qa', 'static'), UsageError)
  assert.throws(() => resolveOutDir('/Users/../etc', 'static'), UsageError)
  const dir = join(freshDir(), 'locked')
  const release = acquireLock(dir)
  assert.throws(() => acquireLock(dir), /in use/)
  release()
  const again = acquireLock(dir)
  again()
  writeFileSync(join(dir, '.qa.lock'), '999999999')
  acquireLock(dir)()
})

test('manifests: symlinks, duplicate ids and schema errors are rejected', () => {
  const dir = freshDir()
  const good = manifestFor('g')
  mkdirSync(join(dir, 'a'))
  writeFileSync(join(dir, 'a', 'x.json'), JSON.stringify(good))
  assert.equal(loadManifests(join(dir, 'a'), 'static').length, 1)
  mkdirSync(join(dir, 'b'))
  writeFileSync(join(dir, 'real.json'), JSON.stringify(good))
  symlinkSync(join(dir, 'real.json'), join(dir, 'b', 'x.json'))
  assert.equal(lstatSync(join(dir, 'b', 'x.json')).isSymbolicLink(), true)
  assert.throws(() => loadManifests(join(dir, 'b'), 'static'), /not a regular file/)
  mkdirSync(join(dir, 'c'))
  writeFileSync(join(dir, 'c', '1.json'), JSON.stringify(good))
  writeFileSync(join(dir, 'c', '2.json'), JSON.stringify(good))
  assert.throws(() => loadManifests(join(dir, 'c'), 'static'), /duplicate case id/)
  mkdirSync(join(dir, 'd'))
  writeFileSync(join(dir, 'd', '1.json'), JSON.stringify({ ...good, oracle: {} }))
  assert.throws(() => loadManifests(join(dir, 'd'), 'static'), /oracle/)
  mkdirSync(join(dir, 'e'))
  assert.throws(() => loadManifests(join(dir, 'e'), 'static'), /no case manifests/)
  mkdirSync(join(dir, 'f'))
  writeFileSync(join(dir, 'f', '1.json'), '{not json')
  assert.throws(() => loadManifests(join(dir, 'f'), 'static'), /not valid JSON/)
})

test('reports refuse a partial result list and exit codes follow the contract', () => {
  const dir = freshDir()
  assert.throws(() => writeReports(dir, 'static', [], 1), /refusing to report/)
  assert.equal(existsSync(join(dir, 'results.json')), false)
  const r = (verdict) => ({ id: 'x', verdict, reason: 'r', redProof: null })
  assert.equal(exitCodeFor([r('PASS')]), 0)
  assert.equal(exitCodeFor([r('PASS'), r('FAIL')]), 1)
  assert.equal(exitCodeFor([r('PASS'), r('ENV')]), 3)
  assert.equal(exitCodeFor([r('PENDING')]), 3)
  assert.equal(exitCodeFor([]), 3)
})

test('TAP reading: missing summary, zero tests, skip and todo are visible', () => {
  const good =
    '1..1\nok 1 - a\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'
  assert.equal(parseTap(good).valid, true)
  assert.equal(parseTap('ok 1 - a\n').valid, false, 'truncated output has no summary')
  assert.equal(
    parseTap('# tests 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n').valid,
    false,
    'zero tests'
  )
  const skipped = parseTap(
    'ok 1 - a # SKIP set TEST_DATABASE_URL\n# tests 1\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 1\n# todo 0\n'
  )
  assert.equal(skipped.skipped, 1)
  assert.deepEqual(skipped.skipTitles, ['a # SKIP set TEST_DATABASE_URL'])
  assert.deepEqual(
    parseTap('not ok 1 - b\n# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n').notOk,
    ['b']
  )
})

test('cancelling a run kills every child group it started, promptly', async () => {
  const dir = freshDir()
  const pending = runChild({
    argv: ['node', '-e', 'setTimeout(() => {}, 60000)'],
    cwd: dir,
    log: join(dir, 'c.log'),
    timeoutMs: 120000
  })
  await new Promise((resolve) => setTimeout(resolve, 300))
  const started = Date.now()
  killAll()
  const child = await pending
  assert.equal(child.signal, 'SIGKILL')
  assert.equal(child.timedOut, false)
  assert.ok(Date.now() - started < 5000)
})

test('a FIFO or a directory in place of a manifest is refused, not read', () => {
  const dir = freshDir()
  mkdirSync(join(dir, 'cases'))
  const fifo = join(dir, 'cases', 'x.json')
  assert.equal(spawnSync('mkfifo', [fifo]).status, 0)
  assert.throws(() => loadManifests(join(dir, 'cases'), 'static'), /not a regular file/)
  const dir2 = freshDir()
  mkdirSync(join(dir2, 'cases', 'x.json'), { recursive: true })
  assert.throws(() => loadManifests(join(dir2, 'cases'), 'static'), /not a regular file/)
})

test('acceptance: each required gate must itself be PASS with a valid RED proof, whatever other gates do', () => {
  const MUT = [{ id: 'm', expect: { output: ['assertion line'] } }]
  const LOGS = {
    red: 'x\nassertion line\n',
    load: 'Cannot find module x\nassertion line',
    ok: '1 gate(s) passed',
    bad: 'nothing'
  }
  const read = (rel) => {
    if (!(rel in LOGS)) throw new Error(`no ${rel}`)
    return LOGS[rel]
  }
  const proof = (o = {}) => ({
    controlLog: 'ok',
    mutations: [{ mutation: 'm', log: 'red', files: [{ before: 'a', after: 'b' }] }],
    ...o
  })
  const pass = (gate, o) => ({
    id: `QA-STATIC-${gate}-happy`,
    verdict: 'PASS',
    reason: 'ok',
    redProof: proof(o)
  })
  const others = ['lint', 'bundles', 'language'].map((g) => pass(g))
  const good = STATIC_REQUIRED_GATES.map((g) => pass(g))
  assert.deepEqual(requiredGateProblems([...good, ...others], read, MUT), [])
  // other gates' PASS never replace a required one
  for (const gate of STATIC_REQUIRED_GATES) {
    const without = good.filter((r) => r.id !== `QA-STATIC-${gate}-happy`)
    assert.match(
      requiredGateProblems([...without, ...others], read, MUT).join('\n'),
      new RegExp(`${gate}: no result`)
    )
    for (const verdict of ['FAIL', 'ENV', 'PENDING']) {
      const swapped = good.map((r) =>
        r.id === `QA-STATIC-${gate}-happy` ? { ...r, verdict, redProof: null } : r
      )
      assert.match(
        requiredGateProblems([...swapped, ...others], read, MUT).join('\n'),
        new RegExp(`${gate}: ${verdict}`)
      )
    }
  }
  const broken = (o) =>
    requiredGateProblems([pass('plugin-identity', o), ...good.slice(1)], read, MUT).join('\n')
  assert.match(broken({ mutations: [] }), /without a red proof/)
  assert.match(broken({ controlLog: 'bad' }), /control run is not green/)
  assert.match(broken({ controlLog: 'gone' }), /control run is not green/)
  assert.match(
    broken({ mutations: [{ mutation: 'm', log: 'load', files: [{ before: 'a', after: 'b' }] }] }),
    /load failure/
  )
  assert.match(
    broken({ mutations: [{ mutation: 'm', log: 'bad', files: [{ before: 'a', after: 'b' }] }] }),
    /lacks/
  )
  assert.match(
    broken({ mutations: [{ mutation: 'm', log: 'red', files: [{ before: 'a', after: 'a' }] }] }),
    /changed nothing/
  )
  assert.match(broken({ mutations: [{ mutation: 'm', log: 'red', files: [] }] }), /changed nothing/)
  assert.match(broken({ mutations: [{ mutation: 'zz', log: 'red', files: [] }] }), /unrecorded mutation/)
  assert.match(
    broken({ mutations: [{ mutation: 'm', log: 'gone', files: [{ before: 'a', after: 'b' }] }] }),
    /unreadable/
  )
  assert.equal(redProofProblems({ id: 'x', redProof: null }, read, MUT).length, 1)
})
