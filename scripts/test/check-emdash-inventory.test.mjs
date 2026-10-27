// The `emdash-inventory` gate runs each EmDash template's own `tools/generate-docs.mjs --check`.
// The gate's decisions (`checkTemplates`) are tested on stubs: which templates it visits, and what a
// missing package, a missing generator, a failed spawn, a signal or a non-zero exit becomes.
// The comparison itself belongs to the kit-owned generator, copied into every template (the
// `emdash-kit-sync` gate keeps the copies identical), so the generator's failure classes are run
// once each, through the real gate, on ONE fixture tree holding three minimal template packages
// with the REAL generator copied in; the class rotates over the templates so each one is
// exercised. The gate compares, it never regenerates: every red run leaves the fixture untouched.
// Whether the repo's real inventories are current is the job of the `emdash-inventory` gate in
// `scripts/check-all.ts`, which runs this same script over the real tree.
//
// Scratch goes under `TCH_TEST_ARTIFACTS` when set (the coding-workflow runner keeps fixtures out
// of the system temp dir), otherwise `os.tmpdir()`.

import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkTemplates, GENERATOR, TEMPLATES } from '../check-emdash-inventory.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const GATE = join(ROOT, 'scripts/check-emdash-inventory.mjs')
const AUTHORED = [
  'AGENTS.md',
  ...[
    'architecture',
    'install',
    'content-model',
    'content-api',
    'design-system',
    'languages',
    'content-rules',
    'checks-and-recovery'
  ].map((n) => `docs/${n}.md`)
]

// ── the gate's decisions, on stubs ───────────────────────────────────────────────────────────

const GREEN = { status: 0, stdout: 'ok\n', stderr: '' }
/** Run `checkTemplates` on a fake tree; `run` answers per template name. */
const decide = ({ missing = [], noGenerator = [], answers = {} } = {}) => {
  const calls = []
  const result = checkTemplates({
    root: '/fake',
    exists: (file) =>
      !missing.some((t) => file === `/fake/packages/cms/${t}`) &&
      !noGenerator.some((t) => file === `/fake/packages/cms/${t}/${GENERATOR}`),
    run: (script, cwd) => {
      calls.push({ script, cwd })
      const name = TEMPLATES.find((t) => cwd.endsWith(`/${t}`))
      return answers[name] ?? GREEN
    }
  })
  return { ...result, calls, text: result.lines.map(([, line]) => line).join('\n') }
}

test('every template is checked, from its own directory, and all green means exit 0', () => {
  const r = decide()
  assert.equal(r.bad, 0)
  assert.deepEqual(
    r.calls,
    TEMPLATES.map((t) => ({
      script: `/fake/packages/cms/${t}/${GENERATOR}`,
      cwd: `/fake/packages/cms/${t}`
    }))
  )
  for (const t of TEMPLATES) assert.match(r.text, new RegExp(`${t}: inventory current`))
  assert.match(r.text, new RegExp(`${TEMPLATES.length} template inventories current`))
})

test('a stale template is red, named, shows the generator output and the fix; the others stay current', () => {
  const [stale, ...others] = TEMPLATES
  const r = decide({ answers: { [stale]: { status: 1, stdout: '', stderr: 'Missing or stale: x\n' } } })
  assert.equal(r.bad, 1)
  assert.match(r.text, new RegExp(`${stale}: STALE OR UNCHECKED \\(exit 1\\)`))
  assert.match(r.text, /Missing or stale: x/)
  assert.match(r.text, new RegExp(`cd packages/cms/${stale} && node ${GENERATOR}`))
  for (const t of others) assert.match(r.text, new RegExp(`${t}: inventory current`))
  assert.match(r.text, new RegExp(`1/${TEMPLATES.length} template inventories not current`))
})

test('a missing package or a missing generator is red, not skipped, and the generator is never run for it', () => {
  const [a, b, c] = TEMPLATES
  const r = decide({ missing: [a], noGenerator: [b] })
  assert.equal(r.bad, 2)
  assert.match(r.text, new RegExp(`${a}: package directory missing`))
  assert.match(r.text, new RegExp(`${b}: ${GENERATOR.replace('.', '\\.')} missing`))
  assert.deepEqual(
    r.calls.map((call) => call.cwd),
    [`/fake/packages/cms/${c}`]
  )
})

test('a failed spawn and a signal are red and say why', () => {
  const [a, b] = TEMPLATES
  const r = decide({
    answers: {
      [a]: { status: null, error: new Error('ENOENT') },
      [b]: { status: null, signal: 'SIGKILL' }
    }
  })
  assert.equal(r.bad, 2)
  assert.match(r.text, new RegExp(`${a}: STALE OR UNCHECKED \\(spawn failed: ENOENT\\)`))
  assert.match(r.text, new RegExp(`${b}: STALE OR UNCHECKED \\(killed by SIGKILL\\)`))
})

// ── the real generator through the real gate ─────────────────────────────────────────────────

const gate = (root, extra = root ? ['--root', root] : []) => {
  const r = spawnSync(process.execPath, [GATE, ...extra], { encoding: 'utf8' })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}

const write = (file, body) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, body)
}

const pkgOf = (root, name) => join(root, 'packages/cms', name)

// A fixture tree with every package, each inventory freshly generated by the real generator.
const makeFixture = () => {
  const base = process.env.TCH_TEST_ARTIFACTS ?? tmpdir()
  mkdirSync(base, { recursive: true })
  const root = mkdtempSync(join(base, 'emdash-inventory-'))
  for (const name of TEMPLATES) {
    const pkg = pkgOf(root, name)
    write(join(pkg, 'package.json'), JSON.stringify({ name, version: '1.0.0', dependencies: {} }))
    write(
      join(pkg, 'template.config.json'),
      JSON.stringify({ id: name, label: name, defaultLocale: 'en', locales: ['en'] })
    )
    write(join(pkg, 'seed/seed.json'), JSON.stringify({ collections: [], content: {} }))
    write(join(pkg, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    write(join(pkg, 'astro.config.mjs'), 'export default {}\n')
    write(join(pkg, 'src/pages/index.astro'), '<p>home</p>\n')
    for (const doc of AUTHORED) write(join(pkg, doc), `# ${doc}\n`)
    mkdirSync(join(pkg, 'tools'), { recursive: true })
    copyFileSync(join(ROOT, 'packages/cms', name, GENERATOR), join(pkg, GENERATOR))
    const r = spawnSync(process.execPath, [GENERATOR], { cwd: pkg, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
  }
  return root
}

const snapshot = (root) =>
  TEMPLATES.flatMap((name) =>
    ['inventory.json', 'inventory.md'].map((f) => {
      const p = join(pkgOf(root, name), 'docs/generated', f)
      try {
        return `${p}:${statSync(p).mtimeMs}:${readFileSync(p, 'utf8')}`
      } catch {
        return `${p}:absent`
      }
    })
  )

const assertRedFor = (root, name, reason) => {
  const before = snapshot(root)
  const { status, out } = gate(root)
  assert.equal(status, 1, out)
  assert.match(out, new RegExp(`${name}: `), out)
  assert.match(out, reason, out)
  const other = TEMPLATES.find((n) => n !== name)
  assert.match(out, new RegExp(`${other}: inventory current`), out)
  assert.deepEqual(snapshot(root), before, 'the gate must not write any inventory')
}

describe('the real generator through the gate, on one fixture tree', () => {
  const root = makeFixture()
  after(() => rmSync(root, { recursive: true, force: true }))
  // Every case edits the fixture and puts it back, so the next one starts from a fresh inventory.
  const originals = new Map()
  const edit = (file, body) => {
    if (!originals.has(file)) originals.set(file, readFileSync(file, 'utf8'))
    writeFileSync(file, body)
  }
  const created = []
  beforeEach(() => {
    for (const [file, body] of originals) writeFileSync(file, body)
    originals.clear()
    for (const file of created.splice(0)) rmSync(file, { force: true })
  })

  const [first, second, third] = TEMPLATES

  test('a fresh fixture is green', () => {
    const { status, out } = gate(root)
    assert.equal(status, 0, out)
    assert.match(out, new RegExp(`${TEMPLATES.length} template inventories current`))
  })

  test(`${first}: a changed source input is red`, () => {
    edit(join(pkgOf(root, first), 'src/pages/index.astro'), '<p>changed</p>\n')
    assertRedFor(root, first, /Missing or stale: docs\/generated\/inventory\.json/)
  })

  test(`${second}: a new source file is red`, () => {
    const file = join(pkgOf(root, second), 'src/lib/new.ts')
    write(file, 'export {}\n')
    created.push(file)
    assertRedFor(root, second, /Missing or stale: docs\/generated\/inventory\.json/)
  })

  test(`${third}: a hand-edited inventory.json is red`, () => {
    const p = join(pkgOf(root, third), 'docs/generated/inventory.json')
    edit(p, readFileSync(p, 'utf8').replace('"format": 1', '"format": 2'))
    assertRedFor(root, third, /Missing or stale: docs\/generated\/inventory\.json/)
  })

  test(`${first}: an inventory.md that differs from the generated one is red`, () => {
    const p = join(pkgOf(root, first), 'docs/generated/inventory.md')
    edit(p, `${readFileSync(p, 'utf8')}\nhand edit\n`)
    assertRedFor(root, first, /Missing or stale: docs\/generated\/inventory\.md/)
  })

  test(`${second}: a missing inventory.md is red`, () => {
    const p = join(pkgOf(root, second), 'docs/generated/inventory.md')
    edit(p, readFileSync(p, 'utf8'))
    rmSync(p)
    assertRedFor(root, second, /Missing or stale: docs\/generated\/inventory\.md/)
  })
})

test('CLI: an unknown argument is refused with exit 2', () => {
  assert.equal(gate(undefined, ['--fix']).status, 2)
})
