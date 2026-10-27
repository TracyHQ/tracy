/**
 * Selftests of the unit inventory: every regression case is classified exactly once, the 66 cases with
 * no deterministic run and the 8 flaky_model cases carry an owner, the area suites cover exactly the
 * files `test:workers` globs, and the generator refuses declaration shapes it cannot read.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { globSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { freshDir } from '../../../fixtures/static/fake-tree.mjs'
import { loadManifests, REPO } from '../../static/lib/common.mjs'
import {
  areaOf,
  build,
  CASES_DIR,
  compareOutputs,
  COMMON_TAGS,
  DENOMINATOR,
  readCheckTests,
  UNIT_TAGS
} from '../generate.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'
import { readmePointerProblems } from '../../../fixtures/readme-pointers.mjs'
import { productSourcesOf } from '../lib/sources.mjs'

const GENERATE = fileURLToPath(new URL('../generate.mjs', import.meta.url))
const regDir = join(REPO, 'tests/regression/cases')
const regs = readdirSync(regDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readTextSync(join(regDir, f))))
const manifests = loadManifests(CASES_DIR, 'unit')

test('generate --check is green on the committed inventory', () => {
  const r = spawnSync('node', [GENERATE, '--check'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
})

test('every regression case is classified exactly once, counted straight from the case files', () => {
  const executable = manifests.filter((m) => m.kind === 'regression')
  const noRun = manifests.filter((m) => m.kind === 'no-run')
  assert.equal(executable.length, regs.filter((r) => r.run !== undefined).length)
  assert.equal(noRun.length, regs.filter((r) => r.run === undefined).length)
  assert.equal(executable.length + noRun.length, regs.length)
  const claimed = [...executable, ...noRun].flatMap((m) => m.legacyIds)
  assert.deepEqual([...claimed].sort(), regs.map((r) => r.id).sort(), 'each REG id once, in legacyIds')
  for (const m of executable) {
    const c = regs.find((r) => r.id === m.legacyIds[0])
    assert.deepEqual(
      m.command.filter(
        (a, i) => !(a === '--test-reporter=tap' && !c.run.cmd.includes(a) && m.command[i - 1] === '--test')
      ),
      c.run.cmd,
      m.id
    )
    assert.deepEqual(m.tests, c.run.tests ?? [], m.id)
    assert.deepEqual(m.needs, c.run.needs ?? [], m.id)
  }
})

test('the cases without a run, and the flaky_model cases, each name an owner layer and a source', () => {
  const noRun = manifests.filter((m) => m.kind === 'no-run')
  const flaky = regs.filter((r) => r.flaky_model)
  assert.ok(
    flaky.length > 0 && flaky.every((r) => r.run === undefined),
    'flaky_model cases have no deterministic run'
  )
  for (const m of noRun) {
    assert.ok(m.ownerLayer && m.ownerLayer !== 'unassigned', `${m.id} has an owner`)
    assert.ok(m.ownerSource && m.ownerSource !== 'none')
    assert.equal(m.flakyModel, regs.find((r) => r.id === m.legacyIds[0]).flaky_model)
    if (m.flakyModel) assert.equal(m.ownerLayer, 'harness')
  }
  const d = JSON.parse(readTextSync(DENOMINATOR))
  const items = d.items.filter((i) => i.kind === 'regression-no-run')
  assert.equal(items.length, noRun.length)
  assert.ok(items.every((i) => i.meta.ownerLayer && i.meta.ownerSource))
  assert.deepEqual(d.unresolved, [], 'nothing left unresolved by the generator today')
})

test('area suites hold exactly the files the test:workers globs match, and run them with the existing flags', () => {
  const pkg = JSON.parse(readTextSync(join(REPO, 'package.json')))
  const globs = pkg.scripts['test:workers'].split(/\s+/).filter((a) => a.endsWith('.test.mjs'))
  const wanted = new Set(globs.flatMap((g) => globSync(g, { cwd: REPO })))
  const suites = manifests.filter((m) => m.kind === 'suite' && m.area !== 'interop')
  const got = suites.flatMap((s) => s.files)
  assert.equal(new Set(got).size, got.length, 'a file belongs to one area only')
  assert.deepEqual([...got].sort(), [...wanted].sort())
  for (const s of suites) {
    assert.ok(
      s.command.includes('--test-reporter=tap') &&
        s.command.includes('--test-timeout=120000') &&
        s.command.includes('--test-force-exit'),
      s.id
    )
    assert.ok(
      s.files.every((f) => areaOf(f) === s.area),
      s.id
    )
  }
  const interop = manifests.find((m) => m.id === 'QA-UNIT-area-interop-happy')
  assert.deepEqual(interop.command.slice(0, 5), ['node', '--import', 'tsx', '--test', '--test-reporter=tap'])
})

test('areas can be selected by path or by short name, and every case id is unique and prefixed', () => {
  assert.ok(manifests.some((m) => m.areas.includes('tracy-web')))
  assert.ok(manifests.some((m) => m.areas.includes('apps/tracy-host')))
  assert.equal(new Set(manifests.map((m) => m.id)).size, manifests.length)
  assert.ok(manifests.every((m) => m.id.startsWith('QA-UNIT-')))
})

test('every item states every required tag as covered or open (none silently dropped)', () => {
  const d = JSON.parse(readTextSync(DENOMINATOR))
  for (const item of d.items) {
    for (const tag of item.requiredTags)
      assert.ok(
        ['covered', 'na', 'open'].includes(d.details.coverage[item.id][tag]?.status),
        `${item.id} ${tag}`
      )
  }
  const area = d.items.find((i) => i.kind === 'test-area')
  assert.deepEqual(area.requiredTags, [...COMMON_TAGS, ...UNIT_TAGS])
  assert.equal(d.details.coverage[area.id].happy.status, 'covered')
  assert.equal(
    d.details.coverage[area.id].unicode.status,
    'open',
    'a green suite does not claim edge tags it never proved'
  )
  assert.equal(
    d.details.counts.workersFiles,
    manifests
      .filter((m) => m.kind === 'suite' && m.area !== 'interop')
      .reduce((n, m) => n + m.files.length, 0)
  )
})

test('regeneration is identical and --check names drift', async () => {
  const { files, denominator } = await build()
  assert.deepEqual(compareOutputs(files, denominator, CASES_DIR, DENOMINATOR), [])
  const dir = freshDir()
  assert.ok(
    compareOutputs(files, denominator, join(dir, 'none'), join(dir, 'd.json')).includes('cases/ is missing')
  )
})

test('the generator refuses a check-tests.ts shape it cannot read', () => {
  const ok =
    "const STANDALONE = ['a'] as const\nconst GROUPS = [{ run: 'test:workers', files: /^x\\.test\\.mjs$/ }]\nconst PARTS = ['workers'] as const\n"
  const r = readCheckTests(ok)
  assert.deepEqual(r.standalone, ['a'])
  assert.deepEqual(r.groups, [{ run: 'test:workers', files: '^x\\.test\\.mjs$', flags: '' }])
  assert.throws(() => readCheckTests('const STANDALONE = []\nconst PARTS = []\n'), /GROUPS/)
  assert.throws(() => readCheckTests(ok.replace("['a']", 'compute()')), /STANDALONE/)
  assert.throws(
    () => readCheckTests(ok.replace('/^x\\.test\\.mjs$/', "'string'")),
    /GROUPS entry changed shape/
  )
  assert.throws(() => readCheckTests(ok.replace("['a']", '[a]')), /non-literal/)
})

test('every oracle points at current product source (file:line that exists) or states its gap', () => {
  const cases = loadManifests(CASES_DIR, 'unit')
  assert.ok(cases.length > 0)
  for (const m of cases) {
    const o = m.oracle
    if (o.productSources === undefined) {
      assert.ok(typeof o.productSourceGap === 'string' && o.productSourceGap !== '', `${m.id}: no gap reason`)
      continue
    }
    assert.match(o.productSourcesScope, /^file-level/, `${m.id}: states the scope of its sources`)
    for (const ref of o.productSources) {
      const at = ref.lastIndexOf(':')
      assert.match(
        ref.slice(0, at),
        /\.(?:tsx?|jsx?|mjs|cjs|css|sh|py|php)$/,
        `${m.id}: ${ref} is code, not documentation`
      )
      assert.doesNotMatch(ref, /(?:^|\/)tests?\/|\.test\./, `${m.id}: ${ref} is not a test file`)
      const lines = readTextSync(join(REPO, ref.slice(0, at))).split('\n').length
      const line = Number(ref.slice(at + 1))
      assert.ok(line >= 1 && line <= lines, `${m.id}: ${ref} is a line of an existing product file`)
    }
  }
})

test('sources are resolved from the cwd of the command and documentation is never a source', () => {
  const cases = new Map(loadManifests(CASES_DIR, 'unit').map((m) => [m.id, m]))
  const web = cases.get('QA-UNIT-REG-042-happy')
  assert.ok(
    web.oracle.productSources.length > 0 && web.oracle.productSources.every((s) => !s.includes('/bruno/'))
  )
  const pw = cases.get('QA-UNIT-REG-PR-960-tracy-assertion-service-happy')
  assert.equal(pw.cwd, 'vendor/tracy/dsh-passwords')
  assert.ok(
    pw.oracle.productSources?.some((s) => s.startsWith('vendor/tracy/dsh-passwords/src/')),
    'resolved under cwd'
  )
  assert.equal(pw.oracle.productSourceGap, undefined)
})

test('regression oracles keep the full invariant, and node --test commands are read as TAP', () => {
  for (const m of loadManifests(CASES_DIR, 'unit').filter((x) => x.kind === 'regression')) {
    const reg = JSON.parse(readTextSync(join(REPO, m.oracle.source)))
    assert.equal(m.oracle.source, m.regression.file)
    assert.equal(m.oracle.invariant, reg.expect.join(' '), `${m.id}: invariant is not cut`)
    if (m.command.includes('--test'))
      assert.ok(m.command.includes('--test-reporter=tap') && m.style === 'node-tap', `${m.id}: TAP style`)
  }
})

test('the layer README has a Known limitations section whose pointers name the code and whose counts are current', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..')
  const text = readTextSync(join(dir, 'README.md'))
  const { count, problems } = readmePointerProblems(text, dir, REPO)
  assert.ok(count >= 5, 'the section lists its open items with file:line')
  assert.deepEqual(problems, [])
  const cases = loadManifests(CASES_DIR, 'unit')
  const gap = (kind) => cases.filter((m) => m.kind === kind && m.oracle.productSourceGap !== undefined).length
  const said = (re) => Number(text.match(re)?.[1])
  assert.equal(said(/\((\d+) no-run regression cases/), gap('no-run'))
  assert.equal(said(/, (\d+) groups not executed/), gap('group'))
  assert.equal(said(/and (\d+) regression or suite cases/), gap('regression') + gap('suite'))
  assert.equal(
    said(/\((\d+) cases carry such entries/),
    cases.filter((m) => m.oracle.productSourcesUnresolved).length
  )
})

const SOURCE_PAIRS = [
  [
    'QA-UNIT-REG-PR-960-tracy-assertion-service-happy',
    [
      'vendor/tracy/dsh-passwords/src/tracy/assertion.ts',
      'vendor/tracy/dsh-passwords/src/plugin.ts',
      'apps/tracy-web/src/lib/actor.js'
    ]
  ],
  [
    'QA-UNIT-area-apps-tracy-host-happy',
    ['packages/fleet/tracy-fleet-operation/scripts/webroot/site-address.py']
  ],
  [
    'QA-UNIT-area-packages-cms-tracy-joomla-quickstart-happy',
    [
      'packages/cms/tracy-joomla-quickstart/scripts/capture-contract.py',
      'packages/cms/tracy-joomla-quickstart/plugins/plg_system_tracyidentity/src/Identity.php'
    ]
  ],
  ['QA-UNIT-area-packages-cms-tracy-wordpress-theme-happy', ['tasks/ja-essence-wp7/tools/reconcile.php']],
  [
    'QA-UNIT-area-scripts-happy',
    [
      'deploy/scripts/sync-prefixed-site-dns.py',
      'scripts/brand-leaks.py',
      'packages/cms/tracy-joomla-quickstart/scripts/brand-leaks.py'
    ]
  ]
]

test('the test→source pairs of the Python, PHP and assertion cases are all recorded, and no helper or document is', () => {
  const cases = new Map(loadManifests(CASES_DIR, 'unit').map((m) => [m.id, m]))
  for (const [id, expected] of SOURCE_PAIRS) {
    const files = (cases.get(id)?.oracle.productSources ?? []).map((r) => r.slice(0, r.lastIndexOf(':')))
    for (const f of expected)
      assert.ok(files.includes(f), `${id}: ${f} is a source (got ${files.join(', ')})`)
  }
  for (const m of cases.values())
    for (const r of m.oracle.productSources ?? []) {
      const f = r.slice(0, r.lastIndexOf(':'))
      assert.doesNotMatch(
        f,
        /(?:^|\/)(?:tests?|test-support|fixtures)\/|\.(?:md|json)$/,
        `${m.id}: ${f} is no product source`
      )
    }
  const web = cases.get('QA-UNIT-REG-042-happy')
  assert.ok(web.oracle.productSources.every((r) => !r.endsWith('README.md') && !r.includes('/bruno/')))
})

test('source resolution: only supported forms count; documents, helpers, comments and unused strings never do', () => {
  const root = freshDir('qa-sources-')
  const put = (rel, text = '') => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  put('pkg/src/real.js', '// real\nexport function real() {}\n')
  put('pkg/src/typed.ts', 'export const typed = 1\n')
  put('pkg/src/unused.js', 'export const unused = 1\n')
  put('pkg/src/commented.js', 'export const commented = 1\n')
  put('pkg/scripts/tool.py', '#!/usr/bin/env python3\n"""Doc."""\nimport sys\n')
  put('pkg/docs/guide.md', '# guide\n')
  put('pkg/test/helper.mjs', 'export const helper = 1\n')
  put('scripts/test-support/php.mjs', 'export const php = 1\n')
  put('pkg/data/not-code.json', '{}\n')
  const sources = (files, o = {}) => productSourcesOf(files, { root, ...o })
  const names = (r) => r.sources.map((x) => x.slice(0, x.lastIndexOf(':')))
  // imports, a URL read, a spawned script, and a path constant that is referenced
  put(
    'pkg/test/a.test.mjs',
    `import { real } from '../src/real.js'
import { helper } from './helper.mjs'
import { php } from '../../scripts/test-support/php.mjs'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
// import '../src/commented.js'  and  '../src/unused.js' appear here only as text
const guide = readFileSync(new URL('../docs/guide.md', import.meta.url), 'utf8')
const json = readFileSync(new URL('../data/not-code.json', import.meta.url), 'utf8')
const SCRIPT = new URL('../scripts/tool.py', import.meta.url).pathname
const NEVER = new URL('../src/unused.js', import.meta.url).pathname
const prose = 'pkg/src/commented.js'
spawnSync('python3', [SCRIPT, '--plan'])
`
  )
  const r = sources(['pkg/test/a.test.mjs'])
  assert.deepEqual(names(r).sort(), ['pkg/scripts/tool.py', 'pkg/src/real.js'])
  assert.deepEqual(r.unresolved, [])
  assert.match(
    r.sources.find((x) => x.startsWith('pkg/scripts/tool.py')),
    /:3$/,
    'the line is code, not the shebang or docstring'
  )
  // cwd: the argument is read against the command's directory
  assert.deepEqual(names(sources(['test/a.test.mjs'], { cwd: 'pkg' })).sort(), [
    'pkg/scripts/tool.py',
    'pkg/src/real.js'
  ])
  assert.deepEqual(
    sources(['test/a.test.mjs']).sources,
    [],
    'against the repository root the file is not there'
  )
  // .js reaches .ts only under tsx
  put('pkg/test/b.test.ts', "import { typed } from '../src/typed.js'\n")
  assert.deepEqual(names(sources(['pkg/test/b.test.ts'], { tsx: true })), ['pkg/src/typed.ts'])
  const noTsx = sources(['pkg/test/b.test.ts'])
  assert.deepEqual(noTsx.sources, [])
  assert.match(noTsx.unresolved.join(), /does not resolve/)
  // a computed path is a stated gap, not a guess
  put(
    'pkg/test/c.test.mjs',
    "import { readFileSync } from 'node:fs'\nconst f = (name) => readFileSync(`../src/${name}.js`)\nexport { f }\n"
  )
  const c = sources(['pkg/test/c.test.mjs'])
  assert.deepEqual(c.sources, [])
  assert.match(c.unresolved.join(), /readFileSync\(\) with a computed path/)
  // a name declared twice is ambiguous and is not followed
  put(
    'pkg/test/d.test.mjs',
    "const P = new URL('../src/real.js', import.meta.url)\nfunction f(P) { return P }\nf(P)\n"
  )
  assert.deepEqual(sources(['pkg/test/d.test.mjs']).sources, [])
  // a delegated test file is followed through the helper that really runs it, with the caller's values
  put('pkg/test/e.mjs', "import { nodeTest } from './h.mjs'\nnodeTest(['pkg/test/a.test.mjs'])\n")
  put(
    'pkg/test/h.mjs',
    "import { spawnSync } from 'node:child_process'\nexport const nodeTest = (files) => spawnSync(process.execPath, ['--test', ...files])\n"
  )
  assert.deepEqual(names(sources(['pkg/test/e.mjs'])).sort(), ['pkg/scripts/tool.py', 'pkg/src/real.js'])
  // a sink bound by destructuring a dynamic import or a require counts like an import
  put(
    'pkg/test/f.test.mjs',
    "const { readFileSync: read } = await import('node:fs')\nconst cp = require('node:child_process')\nread(new URL('../src/real.js', import.meta.url))\ncp.spawnSync('python3', [new URL('../scripts/tool.py', import.meta.url).pathname])\n"
  )
  assert.deepEqual(names(sources(['pkg/test/f.test.mjs'])).sort(), ['pkg/scripts/tool.py', 'pkg/src/real.js'])
  // a path interpolated into an inline script is run by the child
  put(
    'pkg/test/g.test.mjs',
    "import { execFileSync } from 'node:child_process'\nconst script = new URL('../scripts/tool.py', import.meta.url).pathname\nexecFileSync('python3', ['-c', `import runpy; runpy.run_path(${JSON.stringify(script)})`])\n"
  )
  assert.deepEqual(names(sources(['pkg/test/g.test.mjs'])), ['pkg/scripts/tool.py'])
  // a helper that only names a file runs nothing, so nothing is reached through it
  put('pkg/test/e2.mjs', "import { named } from './h2.mjs'\nnamed(['pkg/test/a.test.mjs'])\n")
  put('pkg/test/h2.mjs', 'export const named = (files) => files.length\n')
  assert.deepEqual(sources(['pkg/test/e2.mjs']), { sources: [], unresolved: [] })
  // a path the child only prints, or a file passed to a command that does not run it, is not a source but a gap
  put(
    'pkg/test/i.test.mjs',
    "import { execFileSync } from 'node:child_process'\nconst p = 'pkg/src/real.js'\nexecFileSync('node', ['-e', `console.log(${JSON.stringify(p)})`])\nexecFileSync('echo', [p])\n"
  )
  const printed = sources(['pkg/test/i.test.mjs'])
  assert.deepEqual(printed.sources, [])
  assert.deepEqual(printed.unresolved, [
    'pkg/test/i.test.mjs:3 execFileSync() interpolates pkg/src/real.js into an inline script that is not shown to load it',
    'pkg/test/i.test.mjs:4 execFileSync() passes pkg/src/real.js to echo; not proven to run it'
  ])
  // the script position: flags and loaded modules are read, the script's own arguments are only passed
  put(
    'pkg/test/j.test.mjs',
    "import { spawnSync } from 'node:child_process'\nspawnSync(process.execPath, ['--import', 'pkg/src/typed.ts', 'pkg/scripts/tool.py', 'pkg/src/real.js'])\n"
  )
  const argv = sources(['pkg/test/j.test.mjs'])
  assert.deepEqual(names(argv).sort(), ['pkg/scripts/tool.py', 'pkg/src/typed.ts'])
  assert.deepEqual(argv.unresolved, [
    'pkg/test/j.test.mjs:2 spawnSync() passes pkg/src/real.js to node; not proven to run it'
  ])
  // a sink name shadowed in a block is ambiguous: stated, never taken as the import (static and destructured)
  put(
    'pkg/test/k.test.mjs',
    "import { readFileSync } from 'node:fs'\n{ const readFileSync = (x) => x; readFileSync('pkg/src/real.js') }\n"
  )
  put(
    'pkg/test/k2.test.mjs',
    "const { readFileSync } = await import('node:fs')\nif (true) { const readFileSync = (x) => x; readFileSync('pkg/src/real.js') }\n"
  )
  for (const file of ['pkg/test/k.test.mjs', 'pkg/test/k2.test.mjs']) {
    const shadowed = sources([file])
    assert.deepEqual(shadowed.sources, [], `${file}: the local function is not the fs read`)
    assert.match(shadowed.unresolved.join(), /readFileSync\(\) is also bound locally/)
  }
  // computed require, a computed script and an unknown command are stated; a namespace helper is followed
  put(
    'pkg/test/l.test.mjs',
    "import { spawnSync } from 'node:child_process'\nimport * as h from './hl.mjs'\nrequire(process.env.SCRIPT)\nspawnSync('node', [process.env.SCRIPT])\nspawnSync(process.env.CMD, [])\nh.read('pkg/src/real.js')\n"
  )
  put(
    'pkg/test/hl.mjs',
    "import { readFileSync } from 'node:fs'\nexport const read = (f) => readFileSync(f)\n"
  )
  const computed = sources(['pkg/test/l.test.mjs'])
  assert.deepEqual(names(computed), ['pkg/src/real.js'])
  assert.deepEqual(computed.unresolved, [
    'pkg/test/l.test.mjs:3 require() with a computed specifier',
    'pkg/test/l.test.mjs:4 spawnSync() runs a computed path',
    'pkg/test/l.test.mjs:5 spawnSync() runs a computed command'
  ])
  // the node binary handed through a helper with an options object: `o.extra ?? []` is followed to its
  // fallback, a given `extra` adds a load, a pushed `--name=value` flag keeps the argv known, and options
  // the walk cannot read leave it unproven
  put(
    'pkg/test/hm.mjs',
    "import { spawnSync } from 'node:child_process'\nconst run = (cmd, args, o = {}) => spawnSync(cmd, args, { env: o.env })\nexport function nodeTest(files, o = {}) {\n  const args = ['--test', ...(o.extra ?? [])]\n  if (o.pattern) args.push(`--test-name-pattern=${o.pattern}`)\n  return run(process.execPath, [...args, ...files], o)\n}\n"
  )
  put('pkg/src/m1.js', 'export {}\n')
  put('pkg/src/m2.js', 'export {}\n')
  put('pkg/src/m3.js', 'export {}\n')
  put('pkg/src/loader.js', 'export {}\n')
  put(
    'pkg/test/m.test.mjs',
    "import { nodeTest } from './hm.mjs'\nnodeTest(['pkg/src/m1.js'], { env: {} })\nnodeTest(['pkg/src/m2.js'], { extra: ['--import', 'pkg/src/loader.js'] })\nnodeTest(['pkg/src/m3.js'], globalThis.opts)\n"
  )
  const helper = sources(['pkg/test/m.test.mjs'])
  assert.deepEqual(names(helper), ['pkg/src/loader.js', 'pkg/src/m1.js', 'pkg/src/m2.js'])
  assert.deepEqual(helper.unresolved, [
    'pkg/test/m.test.mjs:4 spawnSync() passes pkg/src/m3.js to node; not proven to run it',
    'pkg/test/m.test.mjs:4 spawnSync() runs a computed path'
  ])
  // `bash -c` sources or execs its own numbered operand ($0 first): that operand is loaded, the others are only
  // passed along
  put('pkg/src/lib.sh', 'f() { :; }\n')
  put(
    'pkg/test/n.test.mjs',
    "import { execFileSync } from 'node:child_process'\nexecFileSync('bash', ['-euo', 'pipefail', '-c', '. \"$1\"; f \"$2\"', '_', 'pkg/src/lib.sh', 'pkg/src/m1.js'])\n"
  )
  put('pkg/src/tool.sh', 'echo hi\n')
  put(
    'pkg/test/n2.test.mjs',
    "import { spawnSync } from 'node:child_process'\nspawnSync('bash', ['-c', 'exec \"$0\" 2>&1', 'pkg/src/tool.sh'])\n"
  )
  assert.deepEqual(names(sources(['pkg/test/n2.test.mjs'])), ['pkg/src/tool.sh'])
  const positional = sources(['pkg/test/n.test.mjs'])
  assert.deepEqual(names(positional), ['pkg/src/lib.sh'])
  assert.deepEqual(positional.unresolved, [
    'pkg/test/n.test.mjs:2 execFileSync() passes pkg/src/m1.js to bash; not proven to run it'
  ])
  // `git grep` (after git's own `-C dir`) and `grep` read the files they name; a pattern naming no file is not a source
  put(
    'pkg/test/o.test.mjs',
    "import { spawnSync } from 'node:child_process'\nspawnSync('git', ['-C', '.', 'grep', '-n', 'outline', '--', 'pkg/src/m1.js'])\nspawnSync('grep', ['-c', 'x', 'pkg/src/m2.js'])\n"
  )
  assert.deepEqual(names(sources(['pkg/test/o.test.mjs'])), ['pkg/src/m1.js', 'pkg/src/m2.js'])
  // a conditional spread forks the argv: the script after an optional `--import` runs in both forks
  put(
    'pkg/test/q.test.mjs',
    "import { execFile } from 'node:child_process'\nconst go = (pre) => execFile('node', [...(pre ? ['--import', 'pkg/src/loader.js'] : []), 'pkg/src/m3.js'])\ngo(globalThis.flag)\n"
  )
  const forked = sources(['pkg/test/q.test.mjs'])
  assert.deepEqual(names(forked), ['pkg/src/loader.js', 'pkg/src/m3.js'])
  assert.deepEqual(forked.unresolved, [])
  // loader text handed to a command that runs no inline code loads nothing: a gap, not a source
  put(
    'pkg/test/r.test.mjs',
    "import { execFileSync } from 'node:child_process'\nconst p = 'pkg/src/real.js'\nexecFileSync('echo', [`require(${JSON.stringify(p)})`])\n"
  )
  assert.deepEqual(sources(['pkg/test/r.test.mjs']), {
    sources: [],
    unresolved: [
      'pkg/test/r.test.mjs:3 execFileSync() interpolates pkg/src/real.js into an argument of echo; not proven to run it'
    ]
  })
  // a whole argv that is not known is a stated gap
  put(
    'pkg/test/s.test.mjs',
    "import { spawnSync } from 'node:child_process'\nspawnSync('node', globalThis.args)\n"
  )
  assert.deepEqual(sources(['pkg/test/s.test.mjs']), {
    sources: [],
    unresolved: ['pkg/test/s.test.mjs:2 spawnSync() runs computed arguments']
  })
  // an argv changed in place other than by push is no longer known: the old script is not claimed
  put(
    'pkg/test/t.test.mjs',
    "import { spawnSync } from 'node:child_process'\n{\n  const args = ['pkg/src/real.js']\n  args.unshift('-e', 'console.log(1)')\n  spawnSync('node', args)\n}\n"
  )
  assert.deepEqual(sources(['pkg/test/t.test.mjs']), {
    sources: [],
    unresolved: ['pkg/test/t.test.mjs:5 spawnSync() runs computed arguments']
  })
  // the child's cwd is what its relative operands are read against; an unknown cwd leaves them unknown
  put('other/pkg/src/real.js', 'export const other = 1\n')
  put(
    'pkg/test/u.test.mjs',
    "import { spawnSync } from 'node:child_process'\nspawnSync('node', ['pkg/src/real.js'], { cwd: 'other' })\nspawnSync('node', ['pkg/src/real.js'], { cwd: globalThis.dir })\n"
  )
  assert.deepEqual(sources(['pkg/test/u.test.mjs']), {
    sources: ['other/pkg/src/real.js:1'],
    unresolved: ['pkg/test/u.test.mjs:3 spawnSync() runs a computed path']
  })
  // loader text in an argument after the inline code is the script's own argument, not code it runs
  put(
    'pkg/test/v.test.mjs',
    "import { spawnSync } from 'node:child_process'\nconst p = 'pkg/src/real.js'\nspawnSync('node', ['-e', '0', `require(${JSON.stringify(p)})`])\n"
  )
  assert.deepEqual(sources(['pkg/test/v.test.mjs']).sources, [])
  // a reader under a cwd that is not known reads a file not known: stated
  put(
    'pkg/test/w.test.mjs',
    "import { spawnSync } from 'node:child_process'\nspawnSync('cat', ['pkg/src/real.js'], { cwd: globalThis.dir })\n"
  )
  assert.deepEqual(sources(['pkg/test/w.test.mjs']), {
    sources: [],
    unresolved: ['pkg/test/w.test.mjs:2 spawnSync() reads pkg/src/real.js from a cwd that is not known']
  })
  // a callback after the argv is not options: the default cwd holds
  put(
    'pkg/test/x.test.mjs',
    "import { execFile } from 'node:child_process'\nexecFile('node', ['pkg/src/real.js'], () => {})\n"
  )
  assert.deepEqual(sources(['pkg/test/x.test.mjs']), { sources: ['pkg/src/real.js:2'], unresolved: [] })
  // a spread after `cwd` may override it; a `cwd` after the spread holds
  put(
    'pkg/test/y.test.mjs',
    "import { spawnSync } from 'node:child_process'\nspawnSync('node', ['pkg/src/real.js'], { cwd: 'other', ...globalThis.o })\nspawnSync('node', ['pkg/src/real.js'], { ...globalThis.o, cwd: 'other' })\n"
  )
  assert.deepEqual(sources(['pkg/test/y.test.mjs']), {
    sources: ['other/pkg/src/real.js:1'],
    unresolved: ['pkg/test/y.test.mjs:2 spawnSync() runs a computed path']
  })
  // a test file run by a child is scanned with the child's cwd
  put(
    'other/pkg/test/child.test.mjs',
    "import { readFileSync } from 'node:fs'\nreadFileSync('pkg/src/real.js')\n"
  )
  put(
    'pkg/test/z.test.mjs',
    "import { spawnSync } from 'node:child_process'\nspawnSync('node', ['pkg/test/child.test.mjs'], { cwd: 'other' })\n"
  )
  assert.deepEqual(sources(['pkg/test/z.test.mjs']), { sources: ['other/pkg/src/real.js:1'], unresolved: [] })
  // a test that runs itself again under another cwd is a stated gap, never an endless scan
  put(
    'pkg/test/self.test.mjs',
    "import { spawnSync } from 'node:child_process'\nimport { fileURLToPath } from 'node:url'\nif (!process.env.CHILD) spawnSync('node', [fileURLToPath(import.meta.url)], { cwd: 'sub' })\n"
  )
  assert.deepEqual(sources(['pkg/test/self.test.mjs']), {
    sources: [],
    unresolved: ['pkg/test/self.test.mjs:1 runs itself again under another cwd; not followed']
  })
  // a missing test argument and a pattern are stated gaps; documents and flags are not test files
  assert.deepEqual(
    sources(['pkg/test/missing.test.mjs', 'pkg/docs/guide.md', '--flag', 'pkg/test/*.test.mjs']),
    {
      sources: [],
      unresolved: [
        'pkg/test/*.test.mjs (argument) is a pattern, not a file',
        'pkg/test/missing.test.mjs (argument) is not a file'
      ]
    }
  )
  assert.deepEqual(sources([]), { sources: [], unresolved: [] })
})

test('source resolution: a replayed helper walk equals a fresh one (depth cut, provenance of a reach)', () => {
  const root = freshDir('qa-sources-memo-')
  const put = (rel, text = '') => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  // `leaf` is first walked shallow (memoized), then called again 23 helpers deep: the call itself is under the
  // limit, but the fresh walk of its body meets the depth cut at `inner()`, so the replay must too.
  const chain = Array.from({ length: 22 }, (_, i) => `const c${i} = () => c${i + 1}()`).join('\n')
  put(
    'pkg/test/deep.test.mjs',
    `import { readFileSync } from 'node:fs'\nconst inner = () => readFileSync('pkg/src/real.js')\nconst leaf = () => inner()\nleaf()\n${chain}\nconst c22 = () => leaf()\nc0()\n`
  )
  put('pkg/src/real.js', 'export const real = 1\n')
  const deep = productSourcesOf(['pkg/test/deep.test.mjs'], { root })
  assert.match(deep.unresolved.join('\n'), /is nested too deep to follow/)
  // a helper reaching a test module whose product import does not parse: the gap stays at the import inside that
  // module, never repeated at each caller of the helper.
  put('pkg/src/broken.js', 'export const = \n')
  put('pkg/test/mod.mjs', "import { x } from '../src/broken.js'\n")
  put('pkg/test/prov.test.mjs', "const load = () => import('./mod.mjs')\nload()\nload()\n")
  const prov = productSourcesOf(['pkg/test/prov.test.mjs'], { root })
  assert.deepEqual(prov.unresolved, ['pkg/test/mod.mjs:1 pkg/src/broken.js does not parse (line 1)'])
  // a helper called with two object literals: each call is walked with its own object, never replayed for the other
  put('pkg/src/a.js', 'export const a = 1\n')
  put('pkg/src/b.js', 'export const b = 1\n')
  put(
    'pkg/test/obj.test.mjs',
    "import { readFileSync } from 'node:fs'\nconst read = (o) => readFileSync(o.file)\nread({ file: 'pkg/src/a.js' })\nread({ file: 'pkg/src/b.js' })\n"
  )
  const objs = productSourcesOf(['pkg/test/obj.test.mjs'], { root })
  assert.deepEqual(
    objs.sources.map((x) => x.slice(0, x.lastIndexOf(':'))),
    ['pkg/src/a.js', 'pkg/src/b.js']
  )
  assert.deepEqual(objs.unresolved, [])
})
