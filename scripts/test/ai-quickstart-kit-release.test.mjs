// The release rules the contract check enforces in CI (ticket #586), on an invented package tree in a temporary
// folder: a kit that names a `site` needs a fresh passing check record, and every kit needs a readable template kit
// of the same version. The tree of the repository passes them today.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { kitFolders, kitReleaseProblems } from '../ai-quickstart/check-kit-release.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PINS = () => ({ plugin: '9.9.1', humanQuickstartSha256: 'a'.repeat(64), version: '1.0.0' })

function tree({ site = false, templateKit = '{"template":"petal"}' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'kit-rules-'))
  const pkg = path.join(root, 'packages/cms/florist-quickstart')
  const kit = path.join(pkg, 'ai-quickstarts/petal/j6/1.0.0')
  mkdirSync(kit, { recursive: true })
  const manifest = { schema: 'tracy-ai-quickstart-kit/v1', template: { slug: 'petal', version: '1.0.0' } }
  if (site) manifest.site = { template: 'petal' }
  writeFileSync(path.join(kit, 'kit-manifest.json'), JSON.stringify(manifest))
  if (templateKit !== null) {
    mkdirSync(path.join(pkg, 'contracts/petal/j6/1.0.0'), { recursive: true })
    writeFileSync(path.join(pkg, 'contracts/petal/j6/1.0.0/template-kit.json'), templateKit)
  }
  return root
}

test('a kit with no site and a readable template kit has no release problem', () => {
  const root = tree()
  assert.deepEqual(
    kitFolders(root).map((k) => [k.slug, k.cms, k.version]),
    [['petal', 'j6', '1.0.0']]
  )
  assert.deepEqual(kitReleaseProblems(root, { pinsOf: PINS }), [])
  rmSync(root, { recursive: true, force: true })
})

test('a kit with no template kit, or an unreadable one, is a problem naming the file', () => {
  for (const templateKit of [null, '{not json']) {
    const root = tree({ templateKit })
    const [p, more] = kitReleaseProblems(root, { pinsOf: PINS })
    assert.equal(more, undefined)
    assert.equal(p.file, 'packages/cms/florist-quickstart/contracts/petal/j6/1.0.0/template-kit.json')
    assert.match(p.message, templateKit === null ? /is missing/ : /not readable JSON/)
    rmSync(root, { recursive: true, force: true })
  }
})

test('a kit that names a site and carries no check record is refused', () => {
  const root = tree({ site: true })
  const problems = kitReleaseProblems(root, { pinsOf: PINS })
  assert.deepEqual(
    problems.map((p) => [p.file, p.message.split(':')[0]]),
    [
      [
        'packages/cms/florist-quickstart/ai-quickstarts/petal/j6/1.0.0/check-record/verdict.json',
        'no_verdict'
      ]
    ]
  )
  rmSync(root, { recursive: true, force: true })
})

test('the repository tree passes the release rules today', () => {
  assert.ok(kitFolders(REPO).length > 0)
  assert.deepEqual(kitReleaseProblems(REPO), [])
})
