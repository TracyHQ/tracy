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
import { GATE_VERSION } from '../ai-quickstart/gate/record.mjs'

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

test('a kit that names a site and carries a hand-made passing verdict is red in the contract check', () => {
  const root = tree({ site: true })
  const kit = path.join(root, 'packages/cms/florist-quickstart/ai-quickstarts/petal/j6/1.0.0')
  mkdirSync(path.join(kit, 'check-record'), { recursive: true })
  const pins = PINS()
  const verdict = {
    schema: 'tracy-ai-quickstart-check-verdict/v1',
    gateVersion: GATE_VERSION,
    plugin: { start: pins.plugin, end: pins.plugin },
    humanQuickstartSha256: pins.humanQuickstartSha256,
    verdict: { pass: true, failing: [], measurements: {} }
  }
  writeFileSync(path.join(kit, 'check-record/verdict.json'), JSON.stringify(verdict))
  const alone = kitReleaseProblems(root, { pinsOf: PINS }).map((p) => p.message.split(':')[0])
  assert.deepEqual(alone, ['no_record'])
  // A record beside it, hand-made to say the same: its contents give no pass and no control binds it.
  const record = { schema: 'tracy-ai-quickstart-check-record/v2', verdict: verdict.verdict, binding: {} }
  writeFileSync(path.join(kit, 'check-record/record.json'), JSON.stringify(record, null, 1))
  const forged = kitReleaseProblems(root, { pinsOf: PINS }).map((p) => p.message.split(':')[0])
  for (const code of ['record_changed', 'verdict_not_from_record', 'record_verdict_wrong', 'control_unbound'])
    assert.ok(forged.includes(code), code + ' in ' + forged.join(', '))
  rmSync(root, { recursive: true, force: true })
})
