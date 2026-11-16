// The pin of an AI quickstart (ticket #588): a build reads exactly the pinned version, and refuses a kit whose files,
// check record or template kit are not the ones the pin names. On an invented package tree in a temporary folder;
// the kit files sha256 is the check record's own (`kitFilesSha256` of the release gate).
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { kitFilesSha256, kitHashesOf } from '../../../../scripts/ai-quickstart/gate/record.mjs'
import {
  PINS_FILE,
  PINS_SCHEMA,
  kitFilesSha256Of,
  pinKeyOf,
  readPins,
  resolvePinnedAiQuickstart
} from '../domain/ai-quickstart-pin.mjs'

const sha = (text) => createHash('sha256').update(text).digest('hex')

function tree() {
  const pkg = mkdtempSync(path.join(tmpdir(), 'kit-pin-'))
  const root = path.join(pkg, 'ai-quickstarts')
  for (const version of ['1.0.0', '1.0.1']) {
    const kit = path.join(root, 'petal', 'j6', version)
    mkdirSync(path.join(kit, 'check-record'), { recursive: true })
    mkdirSync(path.join(kit, 'blank-site-contract'), { recursive: true })
    const manifest = { schema: 'tracy-ai-quickstart-kit/v1', site: { platform: 'joomla' }, version }
    writeFileSync(path.join(kit, 'kit-manifest.json'), JSON.stringify(manifest))
    writeFileSync(path.join(kit, 'block-store.json'), '{"blocks":[]}')
    writeFileSync(path.join(kit, 'blank-site-contract/manifest.json'), '{"id":"petal"}')
    writeFileSync(path.join(kit, 'check-record/record.json'), '{"record":"' + version + '"}')
    mkdirSync(path.join(pkg, 'contracts/petal/j6', version), { recursive: true })
    writeFileSync(path.join(pkg, 'contracts/petal/j6', version, 'template-kit.json'), '{"template":"petal"}')
  }
  const kit = path.join(root, 'petal', 'j6', '1.0.0')
  const pin = {
    version: '1.0.0',
    kitFilesSha256: kitFilesSha256Of(kit),
    recordSha256: sha('{"record":"1.0.0"}'),
    templateKitSha256: sha('{"template":"petal"}'),
    blankSite: { file: 'ai-quickstart-petal-j6-1.0.0.blank-site.zip', bytes: 10, sha256: 'b'.repeat(64) },
    manifest: { file: 'ai-quickstart-petal-j6-1.0.0.manifest.json', bytes: 10, sha256: 'c'.repeat(64) },
    release: { repo: 'Example-Org/example-products', tag: 'quickstart/petal/j6' }
  }
  writeFileSync(
    path.join(root, PINS_FILE),
    JSON.stringify({ schema: PINS_SCHEMA, pins: { [pinKeyOf('petal', 'j6')]: pin } })
  )
  return { pkg, root, kit, pin }
}

test('the kit files sha256 is the one the check record binds', () => {
  const t = tree()
  assert.equal(kitFilesSha256Of(t.kit), kitFilesSha256(kitHashesOf(t.kit)))
  rmSync(t.pkg, { recursive: true, force: true })
})

test('a build reads exactly the pinned version, never the newest one', () => {
  const t = tree()
  const r = resolvePinnedAiQuickstart({ root: t.root, slug: 'petal', cms: 'j6' })
  assert.deepEqual(r.problems, undefined)
  assert.equal(r.ok, true)
  assert.equal(r.version, '1.0.0')
  assert.equal(r.folder, t.kit)
  rmSync(t.pkg, { recursive: true, force: true })
})

test('a template with no pin, or no pins file, is not pinned', () => {
  const t = tree()
  const other = resolvePinnedAiQuickstart({ root: t.root, slug: 'fern', cms: 'j6' })
  assert.deepEqual(
    other.problems.map((p) => p.code),
    ['not_pinned']
  )
  rmSync(path.join(t.root, PINS_FILE))
  assert.deepEqual(readPins(t.root), { pins: {}, problems: [] })
  const none = resolvePinnedAiQuickstart({ root: t.root, slug: 'petal', cms: 'j6' })
  assert.deepEqual(
    none.problems.map((p) => p.code),
    ['not_pinned']
  )
  rmSync(t.pkg, { recursive: true, force: true })
})

test('a kit file changed since the pin is refused, the check record too', () => {
  const t = tree()
  writeFileSync(path.join(t.kit, 'block-store.json'), '{"blocks":[1]}')
  const changed = resolvePinnedAiQuickstart({ root: t.root, slug: 'petal', cms: 'j6' })
  assert.deepEqual(
    changed.problems.map((p) => p.code),
    ['kit_files_differ']
  )
  writeFileSync(path.join(t.kit, 'block-store.json'), '{"blocks":[]}')
  writeFileSync(path.join(t.kit, 'check-record/record.json'), '{"record":"other"}')
  const record = resolvePinnedAiQuickstart({ root: t.root, slug: 'petal', cms: 'j6' })
  assert.deepEqual(
    record.problems.map((p) => p.code),
    ['record_differs']
  )
  rmSync(t.pkg, { recursive: true, force: true })
})

test('a moved template kit, a missing kit and a manifest with no site are refused', () => {
  const t = tree()
  writeFileSync(path.join(t.pkg, 'contracts/petal/j6/1.0.0/template-kit.json'), '{"template":"moved"}')
  const tk = resolvePinnedAiQuickstart({ root: t.root, slug: 'petal', cms: 'j6' })
  assert.deepEqual(
    tk.problems.map((p) => p.code),
    ['template_kit_differs']
  )
  const gone = resolvePinnedAiQuickstart({
    root: t.root,
    slug: 'petal',
    cms: 'j6',
    pins: { [pinKeyOf('petal', 'j6')]: { ...t.pin, version: '2.0.0' } }
  })
  assert.deepEqual(
    gone.problems.map((p) => p.code),
    ['kit_missing']
  )
  writeFileSync(path.join(t.pkg, 'contracts/petal/j6/1.0.0/template-kit.json'), '{"template":"petal"}')
  const manifest = JSON.parse(readFileSync(path.join(t.kit, 'kit-manifest.json'), 'utf8'))
  delete manifest.site
  writeFileSync(path.join(t.kit, 'kit-manifest.json'), JSON.stringify(manifest))
  const pins = { [pinKeyOf('petal', 'j6')]: { ...t.pin, kitFilesSha256: kitFilesSha256Of(t.kit) } }
  const noSite = resolvePinnedAiQuickstart({ root: t.root, slug: 'petal', cms: 'j6', pins })
  assert.deepEqual(
    noSite.problems.map((p) => p.code),
    ['no_site']
  )
  rmSync(t.pkg, { recursive: true, force: true })
})

test('a pin of the wrong shape, or a pins file of another schema, is unreadable', () => {
  const t = tree()
  const bad = resolvePinnedAiQuickstart({
    root: t.root,
    slug: 'petal',
    cms: 'j6',
    pins: { [pinKeyOf('petal', 'j6')]: { ...t.pin, recordSha256: 'short' } }
  })
  assert.deepEqual(
    bad.problems.map((p) => p.code),
    ['pin_unreadable']
  )
  writeFileSync(path.join(t.root, PINS_FILE), '{"schema":"other","pins":{}}')
  assert.deepEqual(
    readPins(t.root).problems.map((p) => p.code),
    ['pin_unreadable']
  )
  rmSync(t.pkg, { recursive: true, force: true })
})
