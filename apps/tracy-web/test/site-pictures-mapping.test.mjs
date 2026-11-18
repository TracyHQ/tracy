// Tests for the site-pictures/1 to Joomla contract mapping export (ADR 0043, #339). Seam 3: a manifest in, a fill
// table out that the existing Joomla write door (applyJoomlaContract) validates, plus uploads and site settings.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyJoomlaContract } from '../../../packages/cms/tracy-seeder/src/apply-joomla-contract.mjs'
import { exportPictureMapping } from '../src/site-pictures/contract-mapping.js'
import { brief, FILES, kit, pictures, plan } from './_site-pictures-check.mjs'

const CONTRACT = 'demo-clay/j6/1.0.0'
const sha = (name) => FILES[`out/${name}`].sha256
const path = (name) => `images/tracy-content/${sha(name)}.png`
const run = (over = {}) =>
  exportPictureMapping({
    pictures: pictures(),
    contract: CONTRACT,
    revision: 'rev-1',
    kit: kit(),
    plan: plan(),
    brief: brief(),
    ...over
  })

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

test('initials and icons are not final uploads: they leave the fill table for the painted list', () => {
  const { mapping, uploads } = run()
  for (const key of ['module-4.1', 'module-5.1', 'module-5.9']) assert.ok(!(key in mapping.changes), key)
  const sent = uploads.map((u) => u.sha256)
  for (const name of ['initials.png', 'icon-light.png', 'icon-dark.png'])
    assert.ok(!sent.includes(sha(name)), name)
})

test('the painted list hands the write step the roles, what to draw and the preview files', () => {
  const { painted } = run()
  const by = new Map(painted.map((p) => [p.key, p]))
  assert.deepEqual([...by.keys()].sort(), ['module-4.1', 'module-5.1', 'module-5.9'])
  const initials = by.get('module-4.1')
  assert.deepEqual(
    { kind: initials.kind, paint: initials.paint, holds: initials.holds, draw: initials.draw },
    {
      kind: 'initials',
      paint: { background: 'accent', foreground: 'on-accent' },
      holds: null,
      draw: { letters: 'RV' }
    }
  )
  assert.equal(initials.preview.sitePath, path('initials.png'))
  const icon = by.get('module-5.1')
  assert.equal(icon.kind, 'icon')
  assert.deepEqual(icon.paint, {
    light: { glyph: 'accent', plate: null },
    dark: { glyph: 'on-dark', plate: null }
  })
  assert.deepEqual(icon.draw, { icon: 'paint-brush', set: '@phosphor-icons/core@2.1.1', weight: 'regular' })
  assert.equal(icon.holds, 'light')
  assert.equal(icon.preview.sha256, sha('icon-light.png'))
  assert.equal(icon.previewDark.sha256, sha('icon-dark.png'))
  // The dark twin slot is drawn from its source icon, in the dark variant.
  const twin = by.get('module-5.9')
  assert.deepEqual([twin.kind, twin.holds, twin.draw.icon], ['icon', 'dark', 'paint-brush'])
  assert.equal(twin.preview.sha256, sha('icon-dark.png'))
  assert.ok(
    !JSON.stringify(painted.map((p) => [p.paint, p.draw])).includes('#'),
    'roles only, no colour value'
  )
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
    ['hero', 'cutout', 'shelf', 'drawn'].map((n) => path(`${n}.png`)).sort()
  )
  const hero = uploads.find((u) => u.sha256 === sha('hero.png'))
  assert.equal(hero.file, 'out/hero.png')
  assert.ok(!hashes.includes(sha('band.png')))
})

test('two frames sharing one file upload it once', () => {
  const input = pictures()
  const a = input.frames.find((e) => e.frame === 'block-3.1')
  const b = input.frames.find((e) => e.frame === 'block-2.1')
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

test('the painted list is the only record of painted frames', () => {
  const out = run()
  assert.ok(!('recolourable' in out))
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

test('a twin of a twin is hidden when the root source is hidden', () => {
  const input = pictures()
  const root = input.frames.find((e) => e.frame === 'block-7.1')
  Object.assign(root, { source: 'hide', file: null, width: null, height: null, sha256: null, sitePath: null })
  const middle = input.frames.find((e) => e.frame === 'block-7.2')
  const last = { ...middle, frame: 'block-7.3', twinOf: 'block-7.2' }
  input.frames.push(last)
  const out = run({ pictures: input })
  assert.ok(!('module-7.3' in out.mapping.changes))
  assert.ok(out.hidden.some((h) => h.frame === 'block-7.3'))
})

test('a twin whose source was returned is hidden with the reason source returned', () => {
  const input = pictures()
  input.frames = input.frames.filter((e) => e.frame !== 'block-7.1')
  const out = run({ pictures: input })
  assert.ok(!('module-7.2' in out.mapping.changes))
  assert.deepEqual(
    out.hidden.find((h) => h.frame === 'block-7.2'),
    {
      frame: 'block-7.2',
      key: 'module-7.2',
      reason: 'source returned'
    }
  )
  assert.ok(!out.problems.some((p) => p.where === 'block-7.2'))
})
