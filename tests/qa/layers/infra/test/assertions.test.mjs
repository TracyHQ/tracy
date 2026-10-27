// Tests of the pieces the cases stand on: the mutation applier, the Dockerfile permission
// analysis, the TAP parser, the oracle anchors, and the fakes (a fake that cannot fail would make
// every green case meaningless, so the fakes are checked against known behaviour).
import { scratchDir } from '../lib/scratch.mjs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { after, test } from 'node:test'
import { analyzeStagePermissions, parseDockerfile } from '../lib/dockerfile.mjs'
import { HarnessError, REPO, applyMutation, isAssertionFailure } from '../lib/harness.mjs'
import { parseTap } from '../lib/legacy.mjs'
import { MUTATIONS, TREES, allDefs, checkOracle, loadOracles } from '../lib/runner.mjs'
import { LABEL, OWN_NET, ruleFor, runTeardown, stand } from '../lib/teardown-stand.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const temps = []
const scratch = () => {
  const dir = scratchDir('qa-infra-assert-')
  temps.push(dir)
  return dir
}
after(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })))

test('mutation applier: exactly one match is required; a missing or ambiguous target is a harness error, not a proof', () => {
  const dir = scratch()
  writeFileSync(
    path.join(dir, 'f.txt'),
    'alpha beta alpha\nfunction one() {\n  return 1\n}\nfunction two() {\n  return 1\n}\n'
  )
  assert.throws(
    () => applyMutation(dir, { id: 'm', file: 'f.txt', find: 'alpha', replace: 'x' }),
    HarnessError
  )
  assert.throws(
    () => applyMutation(dir, { id: 'm', file: 'f.txt', find: 'gamma', replace: 'x' }),
    HarnessError
  )
  assert.throws(
    () => applyMutation(dir, { id: 'm', file: 'nope.txt', find: 'a', replace: 'b' }),
    HarnessError
  )
  const done = applyMutation(dir, {
    id: 'm',
    file: 'f.txt',
    after: 'function two()',
    find: /return 1/,
    replace: 'return 2'
  })
  assert.notEqual(done.before, done.after)
  assert.equal(readTextSync(path.join(dir, 'f.txt')).match(/return 2/g).length, 1)
  assert.match(readTextSync(path.join(dir, 'f.txt')), /function one\(\) \{\n {2}return 1/)
})

test('every mutation in the registry matches exactly once in the real tree (no stale mutation)', () => {
  for (const [id, mutation] of MUTATIONS) {
    const edits = mutation.edits ?? [mutation]
    for (const edit of edits) {
      const text = readTextSync(path.join(REPO, edit.file))
      if (typeof edit.find === 'string' && edit.after === undefined) {
        assert.equal(
          text.split(edit.find).length - 1,
          1,
          `${id}: "${edit.find.slice(0, 60)}" does not occur exactly once in ${edit.file}`
        )
      } else if (edit.after !== undefined) {
        assert.equal(text.split(edit.after).length - 1, 1, `${id}: anchor is not unique in ${edit.file}`)
      } else {
        assert.ok(edit.find.test(text), `${id}: pattern does not match in ${edit.file}`)
      }
    }
    assert.ok(TREES[mutation.tree], `${id}: unknown tree ${mutation.tree}`)
  }
})

test('every case names an oracle whose anchors still exist, and a RED mutation or an explicit reason for none', () => {
  for (const def of allDefs()) {
    assert.ok(loadOracles()[def.oracle], `${def.id}: unknown oracle ${def.oracle}`)
    const checked = checkOracle(def.oracle)
    // a non-independent oracle is refused on purpose (PENDING); any other refusal is drift
    assert.ok(
      checked.ok ||
        /not an independent source|agent guidance|no independent source|is not pinned/.test(checked.detail),
      `${def.id}: ${checked.detail}`
    )
    assert.ok(def.run || def.pending, `${def.id}: neither an implementation nor a pending reason`)
    assert.ok(def.edgeTags.length > 0, `${def.id}: no edge tag`)
    if (def.run && !def.legacy) assert.ok(def.assertionIds.length > 0, `${def.id}: no assertion id`)
    if (def.mutation)
      assert.ok(
        def.assertionIds.includes(def.redAssertion),
        `${def.id}: redAssertion is not one of its assertions`
      )
  }
})

test('Dockerfile permission analysis: only a chown/chmod that grants read counts; `chmod +x` alone does not', () => {
  const verdicts = (text) => {
    const { stages } = parseDockerfile(text)
    return analyzeStagePermissions(stages.at(-1), stages).rows.map((r) => r.status)
  }
  assert.deepEqual(verdicts('FROM x\nCOPY a /srv/a\nUSER app'), ['open'])
  assert.deepEqual(verdicts('FROM x\nCOPY a /srv/a'), ['unknown'])
  assert.deepEqual(verdicts('FROM x\nUSER root\nCOPY a /srv/a'), ['covered'])
  assert.deepEqual(verdicts('FROM x\nCOPY --chown=app:app a /srv/a\nUSER app'), ['covered'])
  assert.deepEqual(verdicts('FROM x\nCOPY --chown=other a /srv/a\nUSER app'), ['open'])
  assert.deepEqual(verdicts('FROM x\nCOPY --chmod=0755 a /srv/a\nUSER app'), ['covered'])
  assert.deepEqual(verdicts('FROM x\nCOPY --chmod=0700 a /srv/a\nUSER app'), ['open'])
  assert.deepEqual(verdicts('FROM x\nCOPY a /srv/a\nRUN chmod +x /srv/a\nUSER app'), ['open'])
  assert.deepEqual(verdicts('FROM x\nCOPY a /srv/a\nRUN chmod 0755 /srv/a\nUSER app'), ['unproven'])
  assert.deepEqual(
    verdicts('FROM x\nCOPY --chmod=0644 a /srv/a\nUSER app'),
    ['open'],
    'read without traverse'
  )
  assert.deepEqual(verdicts('FROM x\nWORKDIR /srv\nCOPY a ./a\nRUN chown -R app:app /srv\nUSER app'), [
    'unproven'
  ])
  assert.deepEqual(verdicts('FROM x\nCOPY a /srv/a\nRUN chown app:app /srv/other\nUSER app'), ['open'])
})

test('TAP parser: counts, skips with reasons, failures', () => {
  const tap = parseTap(
    [
      'TAP version 13',
      'ok 1 - a',
      'not ok 2 - b',
      'ok 3 - c # SKIP needs a database',
      '# tests 3',
      '# pass 1',
      '# fail 1',
      '# skipped 1'
    ].join('\n')
  )
  assert.equal(tap.tests, 3)
  assert.equal(tap.fail, 1)
  assert.equal(tap.skipped, 1)
  assert.deepEqual(
    tap.rows.filter((r) => r.directive === 'SKIP').map((r) => r.reason),
    ['needs a database']
  )
})

test('isAssertionFailure only accepts assertion errors', () => {
  assert.equal(isAssertionFailure(new assert.AssertionError({ message: 'x' })), true)
  assert.equal(isAssertionFailure(new TypeError('x')), false)
  assert.equal(isAssertionFailure(null), false)
})

test('fakes behave like the tools they replace: the stand removes a project, keeps a sibling, and fails when told to', () => {
  const s = stand({ rules: [ruleFor(OWN_NET), ruleFor(OWN_NET)] })
  try {
    const ok = runTeardown(REPO, s)
    assert.equal(ok.status, 0, ok.stdout + ok.stderr)
    assert.doesNotMatch(s.table('networks'), new RegExp(`^${LABEL}_default`, 'm'))
    assert.equal(s.table('rules').includes(OWN_NET), false)
    assert.match(s.table('volumes'), /^qa-site-12_db /m)
  } finally {
    s.dispose()
  }
  const stuck = stand({ switches: { 'down-fails': '', stuck: `${LABEL}_db\n` } })
  try {
    assert.equal(runTeardown(REPO, stuck).status, 1)
    assert.match(stuck.table('volumes'), new RegExp(`^${LABEL}_db `, 'm'))
  } finally {
    stuck.dispose()
  }
})

test('the fake iptables deletes ONE matching rule per call, like the real tool', () => {
  const s = stand({ rules: [ruleFor(OWN_NET), ruleFor(OWN_NET)] })
  try {
    const bin = s.dir('bin/iptables')
    const env = { ...process.env, FAKE_DOCKER_STATE: s.dir('state') }
    const run = (...args) => spawnSync(bin, args, { env, encoding: 'utf8' })
    assert.equal(run('-C', 'DOCKER-USER', '-s', OWN_NET, '-j', 'TRACY-FLEET-EGRESS').status, 0)
    assert.equal(run('-D', 'DOCKER-USER', '-s', OWN_NET, '-j', 'TRACY-FLEET-EGRESS').status, 0)
    assert.equal(s.table('rules').split('\n').filter(Boolean).length, 1)
    assert.equal(run('-D', 'DOCKER-USER', '-s', '10.9.9.0/24', '-j', 'TRACY-FLEET-EGRESS').status, 1)
  } finally {
    s.dispose()
  }
})

test('an intent-only oracle never yields a verdict (PENDING), and agent guidance is not an oracle', () => {
  const intent = Object.entries(loadOracles()).filter(([, o]) => o.strength === 'intent')
  assert.ok(intent.length > 0)
  for (const [key] of intent) {
    const checked = checkOracle(key)
    assert.equal(checked.ok, false, key)
    assert.match(checked.detail, /not an independent source/)
  }
  for (const [key, oracle] of Object.entries(loadOracles()))
    if ((oracle.anchors ?? []).some((a) => /(^|\/)(AGENTS|CLAUDE)\.md$/.test(a.file)))
      assert.equal(checkOracle(key).ok, false, `${key} cites agent guidance`)
})

test('an external base image with no USER has an unknown runtime user: never judged readable', () => {
  const { stages } = parseDockerfile('FROM node:24-slim\nCOPY app /app\n')
  assert.deepEqual(
    analyzeStagePermissions(stages.at(-1), stages).rows.map((r) => r.status),
    ['unknown']
  )
  const explicit = parseDockerfile('FROM node:24-slim\nUSER root\nCOPY app /app\n')
  assert.deepEqual(
    analyzeStagePermissions(explicit.stages.at(-1), explicit.stages).rows.map((r) => r.status),
    ['covered']
  )
})

test('a scratch build context is created owner-only and observed on disk (files 0600, dirs 0700)', async () => {
  const { scratchContext } = await import('../lib/cases-docker.mjs')
  const parsed = parseDockerfile('FROM scratch\nCOPY apps/tracy-host/src /src\nCOPY package.json /p\n')
  const made = scratchContext(parsed, REPO)
  assert.deepEqual(made.notPrivate, [])
  assert.ok(made.files >= 2 && made.dirs >= 2)
})
