// The site icon is written at the path the kit declares (#597, gate run 7): `look.favicon {from: "logo", fallback:
// "initials", path}`. The write left the template's own icon there. Now one op makes the file: from the logo the plan
// uploads, or from the business initials on the accent when the plan has none (the florist's text logo); `.ico` holds
// 16, 32 and 48 pixel PNG entries. A path the write cannot make is flagged, never written. Invented pictures only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-favicon.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { writePlanOf } from 'website-opportunities/domain/draft-write-plan.mjs'
import { runDraftWrite } from '../src/step-chain-draft-write.js'
import { blankSite, florist, floristPlan, openStored, planOf } from './draft-write-fixtures.mjs'

const PATH = florist.aiq.mapping.look.favicon.path
const faviconOf = (plan) => plan.ops.find((op) => op.kind === 'look.favicon')
/** The square sizes of an ICO's entries, read from its directory. */
const icoSizes = (bytes) => Array.from({ length: bytes.readUInt16LE(4) }, (_, i) => bytes[6 + 16 * i] || 256)

test('the kit declares the icon path; a text logo makes it from the business initials on the accent', () => {
  assert.equal(PATH, 'templates/ja_boxing/favicon.ico')
  const op = faviconOf(floristPlan)
  assert.equal(op.path, PATH)
  assert.equal(op.from, 'initials')
  assert.deepEqual(op.draw, { initials: 'LB', colours: [florist.order.look.accent] })
  assert.deepEqual(op.sizes, [16, 32, 48])
})

test('the write uploads an ICO of 16, 32 and 48 pixel PNGs at the declared path', async () => {
  const memory = blankSite()
  const done = await runDraftWrite({ plan: floristPlan, doors: memory.doors, record: {}, openStored })
  assert.equal(done.status, 'done')
  assert.ok(done.ran.includes('look.favicon'))
  const ico = memory.site.uploads.get(PATH)
  assert.ok(ico, 'an icon is at the declared path')
  assert.deepEqual(icoSizes(ico), [16, 32, 48])
})

test('with a logo picture the icon is made from the logo, contained in a clear square', async () => {
  const order = structuredClone(florist.order)
  order.look.logo = { kind: 'own' }
  const plan = planOf(order)
  const op = faviconOf(plan)
  assert.equal(op.from, 'logo')
  assert.equal(op.stored.id, 'stored-home.home-b8.logo')
  const logo = await sharp({ create: { width: 300, height: 100, channels: 3, background: '#2f6d4a' } })
    .png()
    .toBuffer()
  const memory = blankSite()
  const stored = async (id) => (id === op.stored.id ? { bytes: logo, mime: 'image/png' } : openStored(id))
  await runDraftWrite({ plan, doors: memory.doors, record: {}, openStored: stored })
  const ico = memory.site.uploads.get(PATH)
  const offset = ico.readUInt32LE(6 + 16 + 12)
  const png32 = ico.subarray(offset, offset + ico.readUInt32LE(6 + 16 + 8))
  const { data, info } = await sharp(png32).raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.width, 32)
  assert.equal(data[info.channels - 1], 0, 'the corner is clear: the wide logo is contained, not cut')
  assert.equal(data[(16 * 32 + 16) * info.channels], 0x2f, 'the logo is in the middle')
})

test('a path whose format the write cannot make is flagged and written nowhere', () => {
  const aiq = structuredClone(florist.aiq)
  aiq.mapping.look.favicon.path = 'templates/ja_boxing/favicon.svg'
  const plan = writePlanOf(florist.order, aiq, { stored: florist.stored })
  assert.equal(faviconOf(plan), undefined)
  assert.ok(plan.unproven.some((u) => u.code === 'favicon_format_unknown'))
})
