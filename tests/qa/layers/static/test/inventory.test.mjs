/**
 * Selftests of the static inventory: one case per gate read from check-all.ts, a denominator whose
 * every required tag has a status, regeneration that is identical, and a generator that refuses
 * declaration shapes it does not understand instead of emitting an empty or partial denominator.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { freshDir } from '../../../fixtures/static/fake-tree.mjs'
import { build, CASES_DIR, compareOutputs, DENOMINATOR, readGates, REQUIRED_TAGS } from '../generate.mjs'
import { parseNa } from '../../../lib/denominator.mjs'
import { loadManifests, REPO } from '../lib/common.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'
import { readmePointerProblems } from '../../../fixtures/readme-pointers.mjs'

const GENERATE = fileURLToPath(new URL('../generate.mjs', import.meta.url))

test('generate --check is green on the committed inventory', () => {
  const r = spawnSync('node', [GENERATE, '--check'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
})

test('there is exactly one case per gate of check-all.ts, counted without the generator', () => {
  const text = readTextSync(join(REPO, 'scripts/check-all.ts'))
  const block = text.slice(text.indexOf('const GATES'), text.indexOf('\n]\n', text.indexOf('const GATES')))
  const names = [...block.matchAll(/^\s*\{ name: '([^']+)', script: '[^']+'/gm)].map((m) => m[1])
  assert.ok(names.length > 30, 'counted the gates by pattern')
  const cases = loadManifests(CASES_DIR, 'static').filter((c) => c.gate !== null)
  assert.deepEqual(cases.map((c) => c.gate).sort(), [...names].sort())
  for (const c of cases)
    assert.deepEqual(c.command, ['pnpm', 'exec', 'tsx', 'scripts/check-all.ts', '--only', c.gate])
})

test('every denominator item states every required tag as covered, N-A with a reason, or open', () => {
  const d = JSON.parse(readTextSync(DENOMINATOR))
  assert.ok(d.items.length > 0)
  assert.match(d.command, /generate\.mjs/)
  for (const item of d.items) {
    const cov = d.details.coverage[item.id]
    assert.ok(cov, `coverage for ${item.id}`)
    for (const tag of [...item.requiredTags, ...Object.keys(item.na)]) {
      const c = cov[tag]
      assert.ok(c && ['covered', 'na', 'open'].includes(c.status), `${item.id} ${tag}`)
      if (c.status === 'na')
        assert.ok(parseNa(d.naReasons[item.na[tag]]), `N-A of ${item.id} ${tag} names a reason and a source`)
      if (c.status === 'covered') assert.ok(c.cases.length > 0)
    }
  }
  const gate = d.items.find((i) => i.kind === 'gate')
  assert.deepEqual([...gate.requiredTags, ...Object.keys(gate.na)].sort(), [...REQUIRED_TAGS].sort())
  assert.ok(
    d.items.some((i) => i.kind === 'rule-without-gate'),
    'the focus-halo rule without a gate stays an open obligation'
  )
})

test('regeneration is identical and --check names drift', () => {
  const { files, denominator } = build()
  assert.deepEqual(compareOutputs(files, denominator, CASES_DIR, DENOMINATOR), [])
  const dir = freshDir()
  mkdirSync(join(dir, 'cases'))
  const [first] = [...files.keys()]
  writeFileSync(join(dir, 'cases', first), JSON.stringify({ ...files.get(first), requirement: 'tampered' }))
  writeFileSync(join(dir, 'cases', 'QA-STATIC-stale.json'), '{}')
  const problems = compareOutputs(files, denominator, join(dir, 'cases'), join(dir, 'denominator.json'))
  assert.ok(problems.includes(`differs ${first}`))
  assert.ok(problems.includes('stale case file QA-STATIC-stale.json'))
  assert.ok(problems.includes('denominator.json is missing'))
  assert.ok(problems.some((p) => p.startsWith('missing ')))
})

test('the generator refuses a GATES it cannot read instead of emitting an empty denominator', () => {
  const wrap = (body) => `const GATES = ${body}\nmain()\n`
  assert.throws(() => readGates(wrap('[]')), /empty or unreadable/)
  assert.throws(() => readGates('const OTHER = []\n'), /no longer declares GATES/)
  assert.throws(
    () => readGates(wrap("[{ name: 'a', script: 'x.ts' }, { name: 'a', script: 'y.ts' }]")),
    /duplicate gate names/
  )
  const partial = readGates(
    wrap(
      "[{ name: 'a', script: 'x.ts' }, { name: dynamic, script: 'y.ts' }, 'oops', { name: 'b', script: 'z.ts', args: [cmd] }]"
    )
  )
  assert.deepEqual(
    partial.gates.map((g) => g.name),
    ['a']
  )
  assert.equal(partial.unresolved.length, 3, 'every element it could not resolve is listed, not dropped')
  const ok = readGates(wrap("[{ name: 'a', script: 'x.ts', args: ['--check'] }]"))
  assert.deepEqual(ok.gates, [{ name: 'a', script: 'x.ts', args: ['--check'], line: ok.gates[0].line }])
})

test('policy, mutation and rule files reference gates that exist', () => {
  const names = new Set(readGates().gates.map((g) => g.name))
  const dir = join(REPO, 'tests/qa/oracles/static')
  const policy = JSON.parse(readTextSync(join(dir, 'gate-policy.json')))
  const muts = JSON.parse(readTextSync(join(dir, 'mutations.json'))).mutations
  const rules = JSON.parse(readTextSync(join(dir, 'rules.json'))).rules
  for (const g of Object.keys(policy.gates)) assert.ok(names.has(g), `policy gate ${g}`)
  for (const m of muts) {
    assert.ok(names.has(m.gate), `mutation gate ${m.gate}`)
    assert.ok(m.assertionId && m.expect.output.length > 0 && m.edits.length > 0, m.id)
  }
  for (const r of rules) for (const g of r.gates) assert.ok(names.has(g), `rule gate ${g}`)
  assert.equal(new Set(muts.map((m) => m.id)).size, muts.length, 'mutation ids are unique')
})

test('every oracle points at current product source (file:line that exists) or states its gap', () => {
  const cases = loadManifests(CASES_DIR, 'static')
  assert.ok(cases.length > 0)
  for (const m of cases) {
    const o = m.oracle
    if (o.productSources === undefined) {
      assert.ok(typeof o.productSourceGap === 'string' && o.productSourceGap !== '', `${m.id}: no gap reason`)
      continue
    }
    for (const ref of o.productSources) {
      const at = ref.lastIndexOf(':')
      assert.match(
        ref.slice(0, at),
        /\.(?:tsx?|jsx?|mjs|cjs|css|sh)$/,
        `${m.id}: ${ref} is code, not documentation`
      )
      assert.doesNotMatch(ref, /(?:^|\/)tests?\/|\.test\./, `${m.id}: ${ref} is not a test file`)
      const lines = readTextSync(join(REPO, ref.slice(0, at))).split('\n').length
      const line = Number(ref.slice(at + 1))
      assert.ok(line >= 1 && line <= lines, `${m.id}: ${ref} is a line of an existing product file`)
    }
  }
})

test('a rule no gate enforces is a stated gap, never documentation passed off as product source', () => {
  const halo = loadManifests(CASES_DIR, 'static').find((m) => m.id === 'QA-STATIC-rule-focus-halo-invalid')
  assert.equal(halo.oracle.productSources, undefined)
  assert.match(halo.oracle.productSourceGap, /no gate|no product code/)
})

test('a gate case points at the line that declares the gate and at the first code line of its script', () => {
  const gates = loadManifests(CASES_DIR, 'static').filter((m) => m.gate !== undefined)
  assert.ok(gates.filter((x) => x.oracle.productSources).length >= 20, 'the gate cases are present')
  for (const m of gates.filter((x) => x.oracle.productSources === undefined))
    assert.ok(m.oracle.productSourceGap, `${m.id}: no source and no gap`)
  for (const m of gates.filter((x) => x.oracle.productSources !== undefined)) {
    const [declared, script] = m.oracle.productSources.map((ref) => [
      ref.slice(0, ref.lastIndexOf(':')),
      Number(ref.slice(ref.lastIndexOf(':') + 1))
    ])
    assert.equal(declared[0], 'scripts/check-all.ts', m.id)
    const line = readTextSync(join(REPO, declared[0])).split('\n')[declared[1] - 1]
    assert.ok(
      line.includes(`'${m.gate}'`),
      `${m.id}: ${declared.join(':')} declares the gate, not "${line.trim()}"`
    )
    assert.equal(script[0], m.gateScript, `${m.id}: the second source is the gate's script`)
    const first = readTextSync(join(REPO, script[0])).split('\n')[script[1] - 1].trim()
    assert.ok(
      first !== '' && !/^(?:\/\/|\/\*|\*|#)/.test(first),
      `${m.id}: ${script.join(':')} is code, not "${first}"`
    )
  }
})

test('the layer README has a Known limitations section whose file:line references name the code they point at', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..')
  const text = readTextSync(join(dir, 'README.md'))
  const { count, problems } = readmePointerProblems(text, dir, REPO)
  assert.ok(count >= 5, 'the section lists its open items with file:line')
  assert.deepEqual(problems, [])
  assert.match(
    text,
    /focus-halo rule has no gate[^]*`productSourceGap`/,
    'the gap of the focus rule is described as it is'
  )
  assert.doesNotMatch(text, /productSources`? point at the doc/)
})

test('a README pointer is refused when its line names another symbol, is outside the file or has no symbol', () => {
  const files = { 'tests/x.mjs': 'one\ntwo\nthree\nfour\nexport function real() {}\n' }
  const read = (path) => {
    const f = files[path.slice(path.indexOf('tests/'))]
    if (f === undefined) throw new Error('no such file')
    return f
  }
  const readme = (...pointers) => `## Known limitations\n\n${pointers.join('\n')}\n`
  const check = (...pointers) => readmePointerProblems(readme(...pointers), '/b', '/r', read).problems
  assert.deepEqual(check('`tests/x.mjs:5` (`real`)'), [])
  assert.match(check('`tests/x.mjs:1` (`real`)').join(), /does not point at real/)
  assert.match(check('`tests/x.mjs:9` (`real`)').join(), /outside the file/)
  assert.match(check('`tests/x.mjs:5`').join(), /names no symbol/)
  assert.match(check('`tests/gone.mjs:5` (`real`)').join(), /cannot be read/)
  assert.match(
    check('`tests/x.mjs:5` (`rea`)').join(),
    /does not point at rea/,
    'a prefix of a name is not the name'
  )
})
