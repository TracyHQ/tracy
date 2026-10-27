// Selftest of the related layer: chain cases need a RED proof to pass, an injected producer fault is caught, a missing
// clone/config/pin is ENV with its probe, a green sibling suite is never PASS, and the suite adapter refuses to
// trust a run that changed the clone, ran in a dirty clone, wrote outside scratch, skipped tests or ran none.
// Run:  node --test tests/qa/layers/related/test/selftest.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { WEB_COPY } from '../../cms/lib/helpers.mjs'
import { applyMutation, copyTree, exitCodeFor, HarnessError } from '../../cms/lib/kit.mjs'
import { generateFiles } from '../generate.mjs'
import { createLayer } from '../index.mjs'
import { resolveRoot } from '../lib/clone.mjs'
import { extractFunction, WP_RELEASE } from '../specs/chain.mjs'
import { runSuite, SUITES } from '../specs/suites.mjs'
import { readTextAsync } from '../../../lib/bounded-reader.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../../../../..')
const BASE = process.env.QA_TASK_ARTIFACTS
  ? path.join(process.env.QA_TASK_ARTIFACTS, 'selftest-related')
  : path.join(os.tmpdir(), 'qa-related-selftest')
const layer = createLayer()
const CHAIN_GOOD = 'QA-RELATED-chain-wp-setting-from-template-happy-artifact-accepted-by-tch'

// Every area is granted by mkdtemp: nothing here deletes a path it did not just create.
const fresh = async (name) => {
  await fs.mkdir(BASE, { recursive: true })
  return fs.mkdtemp(path.join(BASE, `${name}-`))
}
const byId = async (...ids) => {
  const all = await layer.listCases({})
  return ids.map((id) => {
    const found = all.find((c) => c.id === id)
    assert.ok(found, `case ${id} exists`)
    return found
  })
}

test('a producer-to-consumer chain case passes only with a RED proof on a mutated producer', async () => {
  const out = await fresh('good')
  const [c] = await byId(CHAIN_GOOD)
  const [r] = await layer.run({ cases: [c], target: 'local', proveRed: true, outDir: out })
  assert.equal(r.verdict, 'PASS', r.reason)
  const log = await readTextAsync(path.join(out, r.redProof.log))
  assert.match(log, /mutation: stale-hash-kept/)
  assert.match(log, /result: RED/)
  const [pending] = await layer.run({
    cases: [c],
    target: 'local',
    proveRed: false,
    outDir: await fresh('nored')
  })
  assert.equal(pending.verdict, 'PENDING')
  assert.match(pending.reason, /no RED proof/)
})

test('an injected fault in the producer is caught by the same case', async () => {
  const faulty = await fresh('faulty')
  await copyTree(REPO, faulty, [...WEB_COPY, WP_RELEASE])
  await applyMutation(faulty, {
    id: 'inject',
    files: [{ path: WP_RELEASE, find: 'next.install[key].sha256 = manifest[key].sha256', replace: 'void 0' }]
  })
  const [c] = await byId(CHAIN_GOOD)
  const [r] = await createLayer({ productRoot: faulty }).run({
    cases: [c],
    target: 'local',
    proveRed: false,
    outDir: await fresh('fault-out')
  })
  assert.equal(r.verdict, 'FAIL', r.reason)
  assert.match(r.reason, /hashes to/)
})

test('a faulty EmDash validator that accepts a skeleton with pending decisions is caught', async () => {
  const faulty = await fresh('faulty-emdash')
  const producer =
    'vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/tools/qa-contract.mjs'
  await copyTree(REPO, faulty, [
    producer,
    'packages/cms/tracy-emdash-theme-base/tools/qa-contract.mjs',
    'packages/cms/tracy-emdash-theme-base/qa.contract.json'
  ])
  await applyMutation(faulty, {
    id: 'inject',
    files: [
      {
        path: producer,
        find: "check(Array.isArray(c.pending) && c.pending.length === 0, 'pending decisions must be resolved')",
        replace: "check(true, 'pending decisions must be resolved')"
      }
    ]
  })
  const [c] = await byId('QA-RELATED-chain-emdash-qa-contract-invalid-rejects-pending-base')
  const [r] = await createLayer({ productRoot: faulty }).run({
    cases: [c],
    target: 'local',
    proveRed: false,
    outDir: await fresh('em-out')
  })
  assert.equal(r.verdict, 'FAIL', r.reason)
})

test('missing config, missing clone and a pin the clone lacks are ENV with their probe; nothing passes by default', async () => {
  const cases = await byId(
    'QA-RELATED-suite-infra-mail-happy',
    'QA-RELATED-suite-wordpress-theme-happy',
    'QA-RELATED-chain-vendor-pin-exists-in-producer-happy-wordpress-theme'
  )
  const none = await createLayer({ env: { PATH: process.env.PATH } }).run({
    cases,
    target: 'local',
    proveRed: true,
    outDir: await fresh('noroot')
  })
  for (const r of none) {
    assert.equal(r.verdict, 'ENV')
    assert.match(r.reason, /\[probe: config:related-root\]/)
  }
  const empty = await fresh('emptyroot')
  const missing = await createLayer({ env: { PATH: process.env.PATH, QA_RELATED_ROOT: empty } }).run({
    cases,
    target: 'local',
    proveRed: true,
    outDir: await fresh('noclone')
  })
  for (const r of missing) {
    assert.equal(r.verdict, 'ENV')
    assert.match(r.reason, /\[probe: clone:tracy-/)
  }
})

test('a config file that is malformed or has no root is reported, never guessed around', async () => {
  const dir = await fresh('config')
  const bad = path.join(dir, 'bad.json')
  await fs.writeFile(bad, '{ nope')
  assert.match(resolveRoot({ QA_RELATED_CONFIG: bad }).problem, /not readable JSON/)
  const noRoot = path.join(dir, 'noroot.json')
  await fs.writeFile(noRoot, '{"root": 3}')
  assert.match(resolveRoot({ QA_RELATED_CONFIG: noRoot }).problem, /no "root" string/)
  const good = path.join(dir, 'good.json')
  await fs.writeFile(good, JSON.stringify({ root: dir }))
  assert.deepEqual(resolveRoot({ QA_RELATED_CONFIG: good }), { root: dir, from: good })
  assert.equal(resolveRoot({ QA_RELATED_ROOT: dir, QA_RELATED_CONFIG: bad }).from, 'QA_RELATED_ROOT')
})

test('no machine path is written in the committed layer code', async () => {
  const dirs = [path.join(HERE, '..'), path.join(HERE, '../../cms')]
  const walk = async (dir) => {
    const out = []
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== 'cases') out.push(...(await walk(p)))
      } else if (/\.(mjs|json|py)$/.test(e.name) && e.name !== 'related.config.local.json') out.push(p)
    }
    return out
  }
  for (const dir of dirs)
    for (const file of await walk(dir)) {
      const text = await readTextAsync(file)
      assert.doesNotMatch(text, /\/Users\/[a-z]+\//, `${path.relative(REPO, file)} names a home directory`)
    }
})

// ---- the suite adapter, against a fake sibling clone -------------------------------------------------------------

const MAIL = SUITES.find((s) => s.key === 'infra-mail')
const sh = (cwd, ...args) =>
  spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t'
    }
  })

async function fakeClone(testSource, { dirty = false } = {}) {
  const root = await fresh('fake-root')
  const repo = path.join(root, MAIL.repo)
  const dir = path.join(repo, MAIL.dir)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, MAIL.only), testSource)
  assert.equal(sh(repo, 'init', '-q').status, 0)
  assert.equal(sh(repo, 'add', '-A').status, 0)
  assert.equal(sh(repo, 'commit', '-q', '-m', 'fixture').status, 0)
  if (dirty) await fs.writeFile(path.join(repo, 'uncommitted.txt'), 'x')
  return { root, repo, dir }
}
const suiteCtx = async (root, caseId = 'QA-RELATED-suite-fake-happy') => ({
  env: { ...process.env, QA_RELATED_ROOT: root },
  outDir: await fresh('suite-out'),
  caseId
})

test('a green sibling suite is PENDING (never PASS), with provenance of commit, tools and argv', async () => {
  const { root, repo } = await fakeClone("import test from 'node:test'\ntest('a', () => {})\n")
  const ctx = await suiteCtx(root)
  const r = await runSuite(ctx, MAIL)
  assert.equal(r.verdict, 'PENDING')
  assert.match(r.reason, /green/)
  assert.match(r.reason, /not counted as PASS/)
  const head = sh(repo, 'rev-parse', 'HEAD').stdout.trim()
  const prov = JSON.parse(await readTextAsync(path.join(ctx.outDir, r.evidence[0])))
  assert.equal(prov.headBefore, head)
  assert.equal(prov.headAfter, head)
  assert.equal(prov.cloneUnchanged, true)
  assert.ok(prov.tools.node)
  assert.deepEqual(prov.files[0].argv.slice(0, 3), ['node', '--test', '--test-reporter=tap'])
  assert.equal(exitCodeFor([{ verdict: r.verdict }]), 3)
})

const T = "import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport fs from 'node:fs'\n"

test('no suite outcome is FAIL or ENV from what the suite printed: nonzero, skipped, empty and dependency-looking runs are PENDING', async () => {
  const cases = [
    [`${T}test('a', () => { throw new Error('boom') })\n`, /exit 1/],
    ["import 'qa-package-that-does-not-exist-xyz'\n", /neither FAIL nor ENV/],
    // the missing-package text is only a string the assertion printed; the package is absent AND the test failed on its own
    [
      `${T}test('a', () => { assert.fail("Cannot find package 'qa-package-that-does-not-exist-xyz'") })\n`,
      /neither FAIL nor ENV/
    ],
    // hostile module-looking text must not become a probe argument or code
    [
      `${T}test('a', () => { assert.fail("ModuleNotFoundError: No module named 'os; open(1)'") })\n`,
      /neither FAIL nor ENV/
    ],
    [`${T}test('a', { skip: true }, () => {})\n`, /skipped/],
    ['// no tests at all\n', /./]
  ]
  for (const [source, pattern] of cases) {
    const { root } = await fakeClone(source)
    const ctx = await suiteCtx(root)
    const r = await runSuite(ctx, MAIL)
    assert.equal(r.verdict, 'PENDING', `${source.slice(0, 60)} -> ${r.verdict} ${r.reason}`)
    assert.match(r.reason, pattern)
    const prov = JSON.parse(await readTextAsync(path.join(ctx.outDir, r.evidence[0])))
    assert.ok(
      !JSON.stringify(prov.files.map((f) => f.argv)).includes('does-not-exist'),
      'a name from output reached an argv'
    )
  }
})

test('truncated output is PENDING TEST_INVALID, and a mixed run is never reduced to ENV', async () => {
  const flood = await fakeClone(`${T}test('a', () => { process.stdout.write('x'.repeat(2_000_000)) })\n`)
  const t = await runSuite(await suiteCtx(flood.root), MAIL)
  assert.equal(t.verdict, 'PENDING')
  assert.match(t.reason, /TEST_INVALID/)
  const mixed = await fakeClone(
    `${T}test('dep', async () => { await import('qa-package-that-does-not-exist-xyz') })\ntest('real', () => { throw new Error('boom') })\n`
  )
  const m = await runSuite(await suiteCtx(mixed.root), MAIL)
  assert.equal(m.verdict, 'PENDING', m.reason)
  assert.match(m.reason, /nonzero/)
})

test('a suite runs from a read-only copy of one commit: direct, computed, imported and child-process writes are all denied and nothing lands anywhere', async () => {
  const outside = await fresh('fence')
  const target = path.join(outside, 'escaped')
  const dyn = path.join(outside, 'dyn')
  const viaChild = path.join(outside, 'child')
  const helperTarget = path.join(outside, 'helper')
  const sentinel = path.join(outside, 'sentinel.txt')
  await fs.writeFile(sentinel, 'untouched')
  const writer = await fakeClone(
    `${T}import { spawnSync } from 'node:child_process'\nimport { help } from './helper.mjs'\n` +
      `const denied = (fn) => assert.throws(fn, /EPERM|EACCES|EROFS/)\n` +
      `test('absolute write', () => denied(() => fs.writeFileSync(${JSON.stringify(target)}, 'x')))\n` +
      `test('computed write', () => denied(() => fs.writeFileSync(${JSON.stringify(path.dirname(dyn))} + '/' + ['d', 'yn'].join(''), 'x')))\n` +
      `test('imported write', () => denied(() => help()))\n` +
      `test('child write', () => assert.notEqual(spawnSync('sh', ['-c', 'echo x > "$1"', '_', ${JSON.stringify(viaChild)}]).status, 0))\n` +
      `test('sentinel overwrite', () => denied(() => fs.writeFileSync(${JSON.stringify(sentinel)}, 'changed')))\n` +
      `test('source is read-only', () => denied(() => fs.writeFileSync(new URL('./junk.txt', import.meta.url), 'x')))\n` +
      `test('source file is read-only', () => denied(() => fs.appendFileSync(new URL(import.meta.url), '// tamper')))\n`
  )
  await fs.writeFile(
    path.join(writer.dir, 'helper.mjs'),
    `import fs from 'node:fs'\nexport const help = () => fs.writeFileSync(${JSON.stringify(helperTarget)}, 'x')\n`
  )
  sh(writer.repo, 'add', '-A')
  sh(writer.repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'helper')
  const ctx = await suiteCtx(writer.root)
  const r = await runSuite(ctx, MAIL)
  for (const f of [target, dyn, viaChild, helperTarget])
    await assert.rejects(() => fs.stat(f), `${f} was written`)
  assert.equal(await readTextAsync(sentinel), 'untouched')
  assert.equal(r.verdict, 'PENDING', r.reason)
  assert.match(r.reason, /green/, r.reason)
  const prov = JSON.parse(await readTextAsync(path.join(ctx.outDir, r.evidence[0])))
  assert.equal(prov.sourceUnchanged, true)
  assert.equal(prov.inputFingerprint, prov.inputFingerprintAfter)
  assert.equal(prov.policy.backend, 'sandbox-exec')
  assert.equal(prov.policy.network, 'denied')
  await assert.rejects(() => fs.stat(path.join(writer.dir, 'junk.txt')))
  assert.equal(sh(writer.repo, 'status', '--porcelain').stdout, '')
})

test('the suite cannot read outside its copy and runtime roots (absolute path, symlink inside the commit, original clone), has no network, and sees no injected environment', async () => {
  const outside = await fresh('readfence')
  const secret = path.join(outside, 'secret.txt')
  await fs.writeFile(secret, 'secret')
  const marker = path.join(outside, 'preload-ran')
  const preload = path.join(outside, 'preload.cjs')
  await fs.writeFile(preload, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')\n`)
  const { createServer } = await import('node:net')
  const server = createServer((c) => c.end())
  await new Promise((res) => server.listen(0, '127.0.0.1', res))
  try {
    const port = server.address().port
    const clone = await fakeClone(
      `${T}import net from 'node:net'\nconst denied = (fn) => assert.throws(fn, /EPERM|EACCES/)\n` +
        `test('absolute read', () => denied(() => fs.readFileSync(${JSON.stringify(secret)})))\n` +
        `test('symlink read', () => denied(() => fs.readFileSync(new URL('./link.txt', import.meta.url))))\n` +
        `test('clone read', () => denied(() => fs.readFileSync(process.env.QA_RELATED_ROOT + '/x')))\n` +
        `test('environment', () => { assert.equal(process.env.QA_RELATED_ROOT, undefined); assert.equal(process.env.NODE_OPTIONS, undefined); assert.equal(process.env.PYTHONPATH, undefined) })\n` +
        `test('network', () => new Promise((res, rej) => { const s = net.connect(${port}, '127.0.0.1'); s.on('connect', () => rej(new Error('connected'))); s.on('error', () => res()) }))\n`
    )
    await fs.symlink(secret, path.join(clone.dir, 'link.txt'))
    sh(clone.repo, 'add', '-A')
    sh(clone.repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'symlink')
    const ctx = await suiteCtx(clone.root)
    ctx.env = { ...ctx.env, NODE_OPTIONS: `--require ${preload}`, PYTHONPATH: outside }
    const r = await runSuite(ctx, MAIL)
    assert.equal(r.verdict, 'PENDING', r.reason)
    assert.match(r.reason, /green/, r.reason)
    await assert.rejects(() => fs.stat(marker), 'NODE_OPTIONS reached the suite')
  } finally {
    await new Promise((res) => server.close(res))
  }
})

test('temporary files are confined to the run scratch folder; a file already named like a fence probe survives', async () => {
  const { root } = await fakeClone(`${T}test('a', () => { console.log('TMP=' + process.env.TMPDIR) })\n`)
  const keepDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-selftest-keep-'))
  const preexisting = path.join(keepDir, 'sentinel.txt')
  await fs.writeFile(preexisting, 'not ours')
  try {
    const ctx = await suiteCtx(root)
    const r = await runSuite(ctx, MAIL)
    const log = await readTextAsync(
      path.join(
        ctx.outDir,
        r.evidence.find((e) => e.startsWith('logs/'))
      )
    )
    const tmp = /TMP=(\S+)/.exec(log)
    assert.ok(tmp, log.slice(0, 400))
    assert.match(tmp[1], /qa-rel-/)
    assert.ok(!tmp[1].startsWith(root), 'TMPDIR is outside the clone')
    assert.ok(!tmp[1].startsWith(BASE), 'TMPDIR is not inside the artifacts')
    await assert.rejects(
      () => fs.stat(tmp[1].replace(/\/work\/tmp$/, '')),
      'the scratch folder is removed after the run'
    )
    assert.equal(await readTextAsync(preexisting), 'not ours')
  } finally {
    await fs.rm(keepDir, { recursive: true, force: true })
  }
})

test('a suite whose tool is proven absent is ENV with the probe; a dirty clone, a symlinked suite directory and a non-git clone are refused', async () => {
  const php = SUITES.find((s) => s.key === 'fleet-joomla-access')
  const hasPhp = spawnSync('sh', ['-c', 'command -v php']).status === 0
  if (!hasPhp) {
    const root = await fresh('phproot')
    const repo = path.join(root, php.repo)
    await fs.mkdir(path.join(repo, php.dir), { recursive: true })
    await fs.writeFile(path.join(repo, php.dir, php.only), '<?php echo 1;\n')
    sh(repo, 'init', '-q')
    sh(repo, 'add', '-A')
    sh(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'php')
    const r = await runSuite(await suiteCtx(root), php)
    assert.equal(r.verdict, 'ENV', r.reason)
    assert.match(r.reason, /php is not installed \(probe: command -v php/)
  }
  const dirty = await fakeClone("import test from 'node:test'\ntest('a', () => {})\n", { dirty: true })
  const d = await runSuite(await suiteCtx(dirty.root), MAIL)
  assert.equal(d.verdict, 'PENDING')
  assert.match(d.reason, /uncommitted/)
  const sym = await fakeClone("import test from 'node:test'\ntest('a', () => {})\n")
  const outside = await fresh('outside')
  await fs.writeFile(
    path.join(outside, 'emails.test.mjs'),
    "import test from 'node:test'\ntest('a', () => {})\n"
  )
  await fs.rm(sym.dir, { recursive: true, force: true })
  await fs.symlink(outside, sym.dir)
  sh(sym.repo, 'add', '-A')
  sh(sym.repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'symlink the suite dir')
  const symCtx = await suiteCtx(sym.root)
  const s2 = await runSuite(symCtx, MAIL)
  assert.equal(s2.verdict, 'PENDING', s2.reason)
  assert.match(s2.reason, /outside the committed copy/)
  // a refusal still records which commit and which reason it concerned
  const prov = JSON.parse(await readTextAsync(path.join(symCtx.outDir, s2.evidence[0])))
  assert.equal(prov.sha, sh(sym.repo, 'rev-parse', 'HEAD').stdout.trim())
  assert.equal(prov.refusal, 'suite-dir')
})

test('a configured root with no such clone is ENV, and a clone directory that is not a git repo is refused', async () => {
  const root = await fresh('norepo')
  await fs.mkdir(path.join(root, MAIL.repo, MAIL.dir), { recursive: true })
  const r = await runSuite(await suiteCtx(root), MAIL)
  assert.equal(r.verdict, 'ENV')
  assert.match(r.reason, /not a git clone/)
})

test('extractFunction reads a producer function by brace matching and refuses what it cannot read', () => {
  const text =
    'const a = 1\nexport function f(x) {\n  const s = \'}\' + `${x}}`\n  if (x) { return { y: 1 } }\n  return "{"\n}\nexport function g() {}\n'
  const src = extractFunction(text, 'f')
  assert.match(src, /^function f\(x\) \{/)
  assert.ok(src.endsWith('"{"\n}'))
  assert.throws(() => extractFunction(text, 'missing'), HarnessError)
  assert.throws(() => extractFunction('export function h() { if (1) {', 'h'), HarnessError)
})

test('the CLI refuses bad arguments with exit 2; cases and denominator on disk equal what is generated', async () => {
  for (const args of [['--nope'], ['--target', 'x'], ['--area', 'x']])
    assert.equal(
      spawnSync('node', [path.join(HERE, '../run.mjs'), ...args], { encoding: 'utf8', timeout: 60_000 })
        .status,
      2
    )
  const { files } = generateFiles()
  for (const [rel, content] of Object.entries(files))
    assert.equal(await readTextAsync(path.join(HERE, '..', rel)), content, rel)
  const cov = await layer.coverage({})
  assert.equal(cov.complete, false)
  assert.equal(cov.totals.obligations, cov.totals.na + cov.totals.open + cov.totals.implemented)
})

// ---- default-deny reads, suite inventory and verdict priority ---------------------------------------------------

test('a file in a place that no list names (not home, not a clone) is unreadable: read scope is default-deny', async () => {
  const zone = await fs.mkdtemp(path.join(os.tmpdir(), 'qa-selftest-outside-'))
  try {
    const secret = path.join(zone, 'secret.txt')
    await fs.writeFile(secret, 'secret')
    const clone = await fakeClone(
      `${T}test('outside read', () => assert.throws(() => fs.readFileSync(${JSON.stringify(secret)}), /EPERM|EACCES/))\n` +
        `test('outside listing', () => assert.throws(() => fs.readdirSync(${JSON.stringify(zone)}), /EPERM|EACCES/))\n`
    )
    const r = await runSuite(await suiteCtx(clone.root), MAIL)
    assert.equal(r.verdict, 'PENDING', r.reason)
    assert.match(r.reason, /green/, r.reason)
  } finally {
    await fs.rm(zone, { recursive: true, force: true })
  }
})

test('every test-named file of a suite folder is accounted for: nested and unsupported ones are PENDING gaps, never silently dropped', async () => {
  const suite = { key: 'inv', repo: MAIL.repo, dir: MAIL.dir, kind: 'mixed' }
  const root = await fresh('inv-root')
  const repo = path.join(root, suite.repo)
  const dir = path.join(repo, suite.dir)
  await fs.mkdir(path.join(dir, 'nested'), { recursive: true })
  await fs.writeFile(path.join(dir, 'a.test.mjs'), "import test from 'node:test'\ntest('a', () => {})\n")
  await fs.writeFile(
    path.join(dir, 'nested', 'b.test.mjs'),
    "import test from 'node:test'\ntest('b', () => {})\n"
  )
  await fs.writeFile(path.join(dir, 'test-helper.rb'), 'puts 1\n')
  await fs.writeFile(path.join(dir, 'README.md'), 'not a test\n')
  assert.equal(sh(repo, 'init', '-q').status, 0)
  sh(repo, 'add', '-A')
  assert.equal(sh(repo, 'commit', '-q', '-m', 'fixture').status, 0)
  const ctx = await suiteCtx(root)
  const r = await runSuite(ctx, suite)
  assert.equal(r.verdict, 'PENDING', r.reason)
  assert.match(r.reason, /nested\/b\.test\.mjs/)
  assert.match(r.reason, /test-helper\.rb/)
  assert.doesNotMatch(r.reason, /README/)
  const prov = JSON.parse(await readTextAsync(path.join(ctx.outDir, r.evidence[0])))
  assert.deepEqual(prov.inventory.run, ['a.test.mjs'])
  assert.equal(prov.inventory.unsupported.length, 2)
})

test('an invalid file outranks a missing tool in another file: the suite is TEST_INVALID, not ENV', async () => {
  const suite = { key: 'prio', repo: MAIL.repo, dir: MAIL.dir, kind: 'mixed' }
  const root = await fresh('prio-root')
  const repo = path.join(root, suite.repo)
  const dir = path.join(repo, suite.dir)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'a.test.mjs'),
    `${T}test('a', () => { process.stdout.write('x'.repeat(2_000_000)) })\n`
  )
  await fs.writeFile(path.join(dir, 'test_b.py'), 'import unittest\n')
  assert.equal(sh(repo, 'init', '-q').status, 0)
  sh(repo, 'add', '-A')
  assert.equal(sh(repo, 'commit', '-q', '-m', 'fixture').status, 0)
  // a PATH that holds `sh` only: python3 is then genuinely absent for the adapter's `command -v` probe
  const bin = await fresh('prio-bin')
  await fs.symlink('/bin/sh', path.join(bin, 'sh'))
  const ctx = await suiteCtx(root)
  ctx.env = { ...ctx.env, PATH: bin }
  const r = await runSuite(ctx, suite)
  assert.equal(r.verdict, 'PENDING', r.reason)
  assert.match(r.reason, /TEST_INVALID/)
  const prov = JSON.parse(await readTextAsync(path.join(ctx.outDir, r.evidence[0])))
  assert.equal(
    prov.files.find((f) => f.file === 'test_b.py').verdict,
    'ENV',
    'the absent tool is still recorded'
  )
})
