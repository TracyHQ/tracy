// The check must be able to FAIL: each kind of drift it claims to catch is planted in a throwaway copy of
// the docs and must come back as a problem, and the real tree must come back clean.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { check, measure } from './check-docs-numbers.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SKILL = path.dirname(HERE)
const REPO = path.resolve(SKILL, '..', '..')
const made = []
after(() => {
  for (const d of made) rmSync(d, { recursive: true, force: true })
})

/** The docs and the counted directories, copied to <tmp>/skills/tracy-emdash-template — the layout the check reads. */
function mirror() {
  const root = mkdtempSync(path.join(tmpdir(), 'docs-numbers-'))
  made.push(root)
  const skill = path.join(root, 'skills', 'tracy-emdash-template')
  mkdirSync(path.join(skill, 'scripts'), { recursive: true })
  // every top-level file: the root docs link to their neighbours (NOTICE.md, LICENSE)
  for (const e of readdirSync(REPO, { withFileTypes: true })) if (e.isFile()) cpSync(path.join(REPO, e.name), path.join(root, e.name))
  for (const d of ['references', 'examples', 'assets']) cpSync(path.join(SKILL, d), path.join(skill, d), { recursive: true })
  cpSync(path.join(SKILL, 'SKILL.md'), path.join(skill, 'SKILL.md'))
  cpSync(path.join(SKILL, 'scripts'), path.join(skill, 'scripts'), {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}fixtures${path.sep}`) && !src.endsWith(`${path.sep}fixtures`)
  })
  return skill
}
const edit = (file, from, to) => {
  const text = readFileSync(file, 'utf8')
  assert.ok(text.includes(from), `${file} does not contain ${from}`)
  writeFileSync(file, text.replace(from, to))
}

test('the real tree: every quoted count matches, every tool has a row, every relative link resolves', () => {
  const m = measure()
  assert.ok(m.regressionTests > 250 && m.tools >= 40 && m.packets >= 20, JSON.stringify(m))
  assert.equal(m.invariants, 11)
  assert.deepEqual(check().problems, [])
  const r = spawnSync(process.execPath, [path.join(HERE, 'check-docs-numbers.mjs')], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stdout)
  assert.match(r.stdout, /^docs-numbers: \d+ regression tests · \d+ tools · \d+ packets · 11 invariants/)
})

test('a clean mirror is clean, so the planted cases below fail for their plant alone', () => {
  assert.deepEqual(check(mirror()).problems, [])
})

test('a wrong test count in SKILL.md fails', () => {
  const skill = mirror()
  const n = measure(skill).regressionTests
  edit(path.join(skill, 'SKILL.md'), `kit's ${n} regression tests`, `kit's ${n - 118} regression tests`)
  assert.deepEqual(check(skill).problems, [`SKILL.md says ${n - 118} regressionTests, tree has ${n}`])
})

test('a test added without updating the docs fails', () => {
  const skill = mirror()
  appendFileSync(path.join(skill, 'scripts', 'tests', 'qa.test.mjs'), "\ntest('planted', () => {})\n")
  assert.match(check(skill).problems.join('\n'), /SKILL\.md says \d+ regressionTests/)
})

test('a word count of invariants that disagrees, and numbering out of order, both fail', () => {
  const skill = mirror()
  edit(path.join(skill, '..', '..', 'README.md'), 'the eleven invariants', 'the ten invariants')
  edit(path.join(skill, 'SKILL.md'), '\n10. **Canonical', '\n12. **Canonical')
  const problems = check(skill).problems.join('\n')
  assert.match(problems, /README\.md says ten invariants, tree has 11/)
  assert.match(problems, /invariants are numbered 1,2,3,4,5,6,7,8,9,12,11/)
})

test('a quote reworded away is reported instead of silently not checked', () => {
  const skill = mirror()
  edit(path.join(skill, '..', '..', 'AGENTS.md'), 'the eleven invariants', 'the invariants')
  assert.match(check(skill).problems.join('\n'), /AGENTS\.md: no invariants quote/)
})

test('a kit tool without a row in references/tools.md, and a wrong tool count, fail', () => {
  const skill = mirror()
  writeFileSync(path.join(skill, 'scripts', 'tools', 'planted-tool.mjs'), '')
  const problems = check(skill).problems.join('\n')
  assert.match(problems, /tools\.md has no row for scripts\/tools\/planted-tool\.mjs/)
  assert.match(problems, /references\/tools\.md says \d+ tools, tree has \d+/)
})

test('a relative link to a file that does not exist fails; a link inside a code span does not count', () => {
  const skill = mirror()
  appendFileSync(path.join(skill, 'references', 'tools.md'), '\nSee [`gone.md`](gone.md) and `[x](also-gone.md)`.\n')
  assert.deepEqual(check(skill).problems, ['references/tools.md links to gone.md, which does not exist'])
})
