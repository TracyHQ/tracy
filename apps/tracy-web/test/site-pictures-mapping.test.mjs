// Tests for the site-pictures/1 to Joomla contract mapping export (ADR 0043, #339). Seam 3: a manifest in, a fill
// table out that the existing Joomla write door (applyJoomlaContract) validates, plus uploads and site settings.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyJoomlaContract } from '../../../packages/cms/tracy-seeder/src/apply-joomla-contract.mjs'
import { exportPictureMapping } from '../src/site-pictures/contract-mapping.js'
import { FILES, kit, pictures } from './_site-pictures-check.mjs'

const CONTRACT = 'demo-clay/j6/1.0.0'
const sha = (name) => FILES[`out/${name}`].sha256
const path = (name) => `images/tracy-content/${sha(name)}.png`
const run = (over = {}) =>
  exportPictureMapping({ pictures: pictures(), contract: CONTRACT, revision: 'rev-1', kit: kit(), ...over })

// A site that holds the kit's image slots, and a media library that holds what was uploaded. The door call below is
// the real applyJoomlaContract; only the site behind it is faked (it refuses an image path nobody uploaded).
function site(uploads) {
  const slots = kit().contentMap.slots.map((s) => ({ key: s.key, type: s.type, sample: s.sample }))
  const library = new Set(uploads.map((u) => u.sitePath))
  return async ({ action, params }) => {
    assert.equal(action, 'content.contract')
    if (params.operation === 'inspect') return { ok: true, contract: CONTRACT, slots, pages: [] }
    for (const [key, value] of Object.entries(params.changes))
      if (!library.has(value))
        return { ok: false, message: `Image must already exist in the site media library: ${key}` }
    return { ok: true }
  }
}
const door = (out, dry = true) =>
  applyJoomlaContract({ apply: site(out.uploads), siteKey: 's', mapping: out.mapping, dry })

test('the fill table passes the write door and its upload check', async () => {
  const out = run()
  assert.deepEqual(out.problems, [])
  const applied = await door(out, false)
  assert.equal(applied.contract, CONTRACT)
  const dry = await door(out)
  assert.deepEqual(dry.params.changes, out.mapping.changes)
  assert.equal(dry.params.expected_revision, 'rev-1')
  assert.deepEqual(out.mapping.pending, [])
  assert.deepEqual(out.mapping.emptyLinks, [])
  assert.deepEqual(out.mapping.evidence, {})
})

test('kit block ids become module keys and values are site paths', () => {
  const { mapping } = run()
  assert.equal(mapping.changes['module-2.0'], path('hero.png'))
  assert.equal(mapping.changes['module-2.1'], path('cutout.png'))
  assert.equal(mapping.changes['module-3.1'], path('shelf.png'))
  assert.equal(mapping.changes['module-4.1'], path('initials.png'))
  assert.ok(!Object.keys(mapping.changes).some((k) => k.startsWith('block-')))
})

test('a hidden frame is not in the fill table and is listed as hidden', () => {
  const out = run()
  assert.ok(!('module-3.2' in out.mapping.changes))
  assert.deepEqual(out.hidden, [
    { frame: 'block-3.2', key: 'module-3.2', reason: 'no fitting real photo left' }
  ])
  assert.deepEqual(out.mapping.pending, [])
})

test('an icon maps to its light file and its dark twin slot to the dark file', () => {
  const { mapping } = run()
  assert.equal(mapping.changes['module-5.1'], path('icon-light.png'))
  assert.equal(mapping.changes['module-5.9'], path('icon-dark.png'))
})

test('a twin follows its source: same file, and hidden when its source is hidden', () => {
  const { mapping } = run()
  assert.equal(mapping.changes['module-7.2'], mapping.changes['module-7.1'])
  const input = pictures()
  const source = input.frames.find((e) => e.frame === 'block-7.1')
  Object.assign(source, {
    source: 'hide',
    file: null,
    width: null,
    height: null,
    sha256: null,
    sitePath: null
  })
  const out = run({ pictures: input })
  assert.ok(!('module-7.1' in out.mapping.changes) && !('module-7.2' in out.mapping.changes))
  assert.deepEqual(out.hidden.map((h) => h.frame).sort(), ['block-3.2', 'block-7.1', 'block-7.2'])
})

test('a twin that holds another file than its source is left out with a problem', () => {
  const input = pictures()
  input.frames.find((e) => e.frame === 'block-7.2').sha256 = 'f'.repeat(64)
  const out = run({ pictures: input })
  assert.ok(!('module-7.2' in out.mapping.changes))
  assert.ok(out.problems.some((p) => p.where === 'block-7.2' && /twin/.test(p.detail)))
})

test('uploads list each file once by hash and only files that are placed', () => {
  const { uploads } = run()
  const hashes = uploads.map((u) => u.sha256)
  assert.equal(new Set(hashes).size, hashes.length)
  assert.deepEqual(
    uploads.map((u) => u.sitePath).sort(),
    ['hero', 'cutout', 'shelf', 'initials', 'icon-light', 'icon-dark', 'drawn']
      .map((n) => path(`${n}.png`))
      .sort()
  )
  const hero = uploads.find((u) => u.sha256 === sha('hero.png'))
  assert.equal(hero.file, 'out/hero.png')
  assert.ok(!hashes.includes(sha('band.png')))
})

test('two frames sharing one file upload it once', () => {
  const input = pictures()
  const a = input.frames.find((e) => e.frame === 'block-3.1')
  const b = input.frames.find((e) => e.frame === 'block-4.1')
  Object.assign(b, { file: a.file, sha256: a.sha256, sitePath: a.sitePath })
  const { uploads } = run({ pictures: input })
  assert.equal(uploads.filter((u) => u.sha256 === a.sha256).length, 1)
})

test('site settings stay separate, marked as having no write door, never in the fill table', () => {
  const out = run()
  assert.equal(out.siteSettings.length, 1)
  assert.equal(out.siteSettings[0].frame, 'block-6.picture-1')
  assert.equal(out.siteSettings[0].writeDoor, 'none')
  assert.equal(out.siteSettings[0].sitePath, path('band.png'))
  assert.ok(!('module-6.picture-1' in out.mapping.changes))
  assert.ok(!Object.values(out.mapping.changes).includes(path('band.png')))
})

test('recolourable frames (initials, icons) are listed by key', () => {
  assert.deepEqual(run().recolourable.sort(), ['module-4.1', 'module-5.1', 'module-5.9'])
})

test('a frame the kit has no image slot for is left out with a problem', () => {
  const k = kit()
  k.contentMap.slots = k.contentMap.slots.filter((s) => s.key !== 'module-3.1')
  const out = run({ kit: k })
  assert.ok(!('module-3.1' in out.mapping.changes))
  assert.ok(out.problems.some((p) => p.where === 'block-3.1'))
})

test('manifest problems are passed through and bad entries are not exported', () => {
  const input = pictures()
  input.frames.find((e) => e.frame === 'block-3.1').sha256 = 'nope'
  const out = run({ pictures: input })
  assert.ok(out.problems.some((p) => p.where.includes('block-3.1')))
  assert.ok(!('module-3.1' in out.mapping.changes))
})
