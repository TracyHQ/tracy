/**
 * A tiny fake repository for the QA layers' selftests: a rule file, a "gate" script that reads it,
 * the manifests and oracle files the static layer expects, and a scratch output directory. Nothing
 * here touches the real tree.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTextSync } from '../../lib/bounded-reader.mjs'

/** @returns {string} a fresh empty directory (under QA_ARTIFACT_ROOT when set, else the temp dir). */
export function freshDir(prefix = 'qa-selftest-') {
  const base = process.env.QA_ARTIFACT_ROOT ? join(process.env.QA_ARTIFACT_ROOT, 'selftests') : tmpdir()
  mkdirSync(base, { recursive: true })
  return mkdtempSync(join(base, prefix))
}

/**
 * @param {object} [o] - options.
 * @param {string} [o.rule] - contents of rule.txt.
 * @param {string} [o.gate] - source of the gate script (default: exits 1 unless rule.txt says OK).
 * @returns {{root: string, out: string, ctx: object}} the tree, an output dir, and a static-layer context.
 */
export function fakeTree({ rule = 'status: OK\n', gate } = {}) {
  const dir = freshDir()
  const root = join(dir, 'tree')
  const out = join(dir, 'out')
  mkdirSync(join(root, 'scripts'), { recursive: true })
  mkdirSync(join(root, 'node_modules'), { recursive: true })
  mkdirSync(join(dir, 'oracles'), { recursive: true })
  writeFileSync(join(root, 'scripts/check-all.ts'), '// fake\n')
  writeFileSync(join(root, 'rule.txt'), rule)
  writeFileSync(
    join(root, 'gate.mjs'),
    gate ??
      `import { readFileSync } from 'node:fs'
const text = readFileSync(new URL('./rule.txt', import.meta.url), 'utf8')
if (!text.includes('status: OK')) {
  console.error('RULE BROKEN: ' + text.trim())
  process.exit(1)
}
console.log('check-all: 1 gate(s) passed')
`
  )
  writeFileSync(
    join(root, 'fixture-evidence.json'),
    JSON.stringify({ claim: 'known false red', source: 'selftest', packages: ['a'] })
  )
  return {
    root,
    out,
    dir,
    ctx: {
      root,
      casesDir: join(dir, 'cases'),
      oracles: join(dir, 'oracles'),
      heavyDirs: [],
      env: { ...process.env },
      skipToolchainProbe: true
    }
  }
}

/**
 * Write the oracle files and a manifest list into a fake tree's context.
 * @param {object} t - result of fakeTree.
 * @param {object[]} manifests - case manifests.
 * @param {object[]} [mutations] - mutation catalogue.
 * @param {object} [gates] - gate policy `gates` map.
 */
export function install(t, manifests, mutations = [], gates = {}) {
  mkdirSync(t.ctx.casesDir, { recursive: true })
  for (const m of manifests) writeFileSync(join(t.ctx.casesDir, `${m.id}.json`), JSON.stringify(m))
  writeFileSync(join(t.ctx.oracles, 'mutations.json'), JSON.stringify({ mutations }))
  writeFileSync(join(t.ctx.oracles, 'gate-policy.json'), JSON.stringify({ defaultTimeoutMs: 30000, gates }))
}

/**
 * @param {string} name - gate/case key.
 * @param {object} [over] - overrides.
 * @returns {object} a valid static manifest running `node gate.mjs`.
 */
export function manifestFor(name, over = {}) {
  return {
    id: `QA-STATIC-${name}-happy`,
    itemIds: [`gate:${name}`],
    requirement: `gate ${name} holds`,
    oracle: { source: 'selftest', ref: 'rule.txt', invariant: 'rule.txt says status: OK' },
    edgeTags: ['happy'],
    targets: ['local'],
    effects: { reads: ['x'], writes: [], mail: false, model: false, containers: false },
    prerequisites: [],
    assertionIds: [`static.${name}.exit-0`],
    redProof: null,
    legacyIds: [],
    gate: name,
    command: ['node', 'gate.mjs'],
    successMarker: 'check-all: 1 gate(s) passed',
    mode: 'run',
    mutations: [],
    ...over
  }
}

/** @returns {object} a mutation that breaks rule.txt. */
export function breakRule(over = {}) {
  return {
    id: 'break-rule',
    gate: 'g',
    description: 'flip the rule',
    oracle: { source: 'selftest', ref: 'rule.txt' },
    assertionId: 'static.g.rule-broken-detected',
    edits: [{ file: 'rule.txt', op: 'replace', find: 'status: OK', replace: 'status: BAD' }],
    expect: { output: ['RULE BROKEN'] },
    ...over
  }
}

/** @returns {string} file contents. */
export const read = (path) => readTextSync(path)
