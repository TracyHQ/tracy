// new-template.sh: what a fresh package holds, and that the starter questionnaire is one a release would accept.
// Skill-level (runs from the skill folder, `npm run test:docs`), because it needs the kit's assets/.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { questionProblems } from './tools/personalize-gate.mjs'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const scaffold = () => {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), 'newtpl-')), 'pkg')
  const r = spawnSync('bash', [path.join(HERE, 'new-template.sh'), dir, '@tracy/emdash-theme-x', 'tracy-x'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return { dir, out: r.stdout }
}

describe('new-template.sh', () => {
  it('copies the kit folders the copied tests and tools import, and says what it does not create', () => {
    const { dir, out } = scaffold()
    try {
      for (const f of ['contract/validate.mjs', 'contract/site-model.mjs', 'ingest/detect-source.mjs', 'tools/compile-seed.mjs'])
        assert.ok(existsSync(path.join(dir, f)), f)
      assert.match(out, /NOT created here[^\n]*package\.json[^\n]*astro\.config\.mjs[^\n]*sibling theme/)
    } finally {
      rmSync(path.dirname(dir), { recursive: true, force: true })
    }
  })

  // found while porting JA Restaurant: a template's own file under contract/ turned the kit's neutrality test red
  it('a file of the template’s own under contract/ does not fail the kit’s "contract stays neutral" test', () => {
    const { dir } = scaffold()
    try {
      writeFileSync(path.join(dir, 'contract', 'build-contract.mjs'), "export const page = { render: { collections: [] } }\n")
      const r = spawnSync(process.execPath, ['--test', 'tests/site-model.test.mjs'], { cwd: dir, encoding: 'utf8' })
      assert.equal(r.status, 0, r.stdout.slice(-1500))
    } finally {
      rmSync(path.dirname(dir), { recursive: true, force: true })
    }
  })
})

describe('the starter questionnaire', () => {
  const raw = readFileSync(path.join(HERE, '..', 'assets', 'seed-starter', 'questions.json'), 'utf8')
  it('is accepted by the release’s own check and asks for the name, the site languages and an e-mail', () => {
    assert.deepEqual(questionProblems(raw), [])
    const ids = JSON.parse(raw).questions.map((q) => q.id)
    for (const id of ['name', 'languages', 'email']) assert.ok(ids.includes(id), id)
  })
})
