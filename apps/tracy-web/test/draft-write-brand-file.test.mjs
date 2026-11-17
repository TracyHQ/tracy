// The draft write places the brand file the draft keeps (#575, P1 to P3 of the brand audit). Before, every logo frame
// of the write order had no stored bytes (`logo_from_brand_step`, source none) and the write guard stopped the build
// with `picture_not_stored`; the site icon was remade from the raw logo. Now each logo frame takes the brand file's
// picture of the logo spot its fact is written to (the light ground logo for `site_logo`, the dark ground one for
// `site_logo_dark` and the footer), and the site icon is the brand file's own set. On the real JA Boxing kit, a memory
// site, invented pictures and an invented business.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-brand-file.test.mjs
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { keptBrandFileOf } from '../src/brand-before-site-files.js'
import { runDraftWrite } from '../src/step-chain-draft-write.js'
import { storedPicturesOf } from '../src/step-chain-draft-stored.js'
import { boxingKitValue, keptBrandFile, writeBrandFolder } from './_brand-kept-fixtures.mjs'
import { blankSite, florist, openStored, planOf } from './draft-write-fixtures.mjs'

const { dir, file } = await writeBrandFolder({ brandFile: keptBrandFile() })
const { kept, bytes } = await keptBrandFileOf({
  brandFile: JSON.parse(readFileSync(file, 'utf8')),
  file,
  kit: boxingKitValue()
})
rmSync(dir, { recursive: true, force: true })
// Every picture as the draft picture store keeps it: an id per picture, the bytes behind it.
const byId = new Map()
for (const [name, entry] of Object.entries(kept.pictures)) {
  entry.id = `pic-${Object.keys(kept.pictures).indexOf(name)}`
  byId.set(entry.id, { bytes: bytes.get(name), mime: entry.mime, sha256: entry.sha256 })
}
const brand = { file: kept, template: { slug: 'ja-boxing', version: '1.0.11' } }
const order = structuredClone(florist.order)
order.look.logo = { kind: 'own', source: 'Tracy drew a logo based on your logo' }
const LOGO_FRAMES = order.pictures.filter((p) => p.reason === 'logo_from_brand_step').map((p) => p.frame)
const pictures = storedPicturesOf({
  manifest: [],
  brand,
  mapping: florist.aiq.mapping,
  accountId: 'acct-1',
  openDraftPicture: async (id) => byId.get(id) ?? null
})
const stored = pictures.stored(order)
const pictureOf = (spot) => kept.pictures[`spots/${spot}.png`].id

test('every logo frame takes the brand picture of the logo spot its fact is written to', () => {
  assert.ok(LOGO_FRAMES.length > 0)
  for (const frame of LOGO_FRAMES) assert.ok(stored[frame]?.id?.startsWith('brand:'), frame)
  assert.equal(stored['home.home-b1.logo-light'].id, `brand:${pictureOf('logo-header-1')}`)
  // The dark frame is no twin of the light one any more: it has a picture of its own, made for a dark ground.
  assert.equal(stored['home.home-b1.logo-dark'].id, `brand:${pictureOf('logo-header-2')}`)
  // The footer logo is a place of the dark logo fact (`site_logo_dark`): the dark ground picture.
  assert.equal(stored['home.home-b8.logo'].id, `brand:${pictureOf('logo-header-2')}`)
  assert.equal(stored['look.favicon'].id, `brand:${kept.pictures['favicon/favicon.ico'].id}`)
})

test('without a kept brand file the logo frames have no stored bytes and the guard stops typed', () => {
  const bare = storedPicturesOf({ manifest: [], openDraftPicture: async () => null }).stored(order)
  for (const frame of LOGO_FRAMES) assert.equal(bare[frame], undefined)
  assert.throws(
    () => planOf(order, { stored: bare }),
    (e) => e.code === 'picture_not_stored'
  )
})

test('the write uploads the brand pictures of both grounds and the brand icon set as it is', async () => {
  const all = { ...florist.stored }
  for (const frame of LOGO_FRAMES) delete all[frame]
  const plan = planOf(order, { stored: { ...all, ...stored } })
  const favicon = plan.ops.find((op) => op.kind === 'look.favicon')
  assert.equal(favicon.from, 'brand')
  const memory = blankSite()
  const open = (id) => (String(id).startsWith('brand:') ? pictures.openStored(id) : openStored(id))
  const done = await runDraftWrite({ plan, doors: memory.doors, record: {}, openStored: open })
  assert.equal(done.status, 'done')
  const uploads = [...memory.site.uploads.entries()]
  const ico = memory.site.uploads.get(florist.aiq.mapping.look.favicon.path)
  assert.deepEqual(ico, bytes.get('favicon/favicon.ico'), 'the brand icon set, byte for byte')
  // The light and the dark site settings name two different uploaded pictures.
  const light = memory.site.slots.get('siteSetting-257986166.0')?.current
  const dark = memory.site.slots.get('siteSetting-211586990.0')?.current
  assert.ok(light && dark && light !== dark, JSON.stringify({ light, dark }))
  for (const value of [light, dark])
    assert.ok(
      uploads.some(([p]) => String(value).includes(path.basename(p))),
      `${value} is an uploaded picture`
    )
})

test('a stored brand picture whose bytes changed is not opened', async () => {
  const id = stored['home.home-b1.logo-light'].id
  const changed = storedPicturesOf({
    manifest: [],
    brand,
    mapping: florist.aiq.mapping,
    // Other bytes under the same id; the reader says nothing of their hash, the bytes are measured.
    openDraftPicture: async (raw) => ({ mime: byId.get(raw).mime, bytes: Buffer.from('other bytes') })
  })
  await assert.rejects(changed.openStored(id), (e) => e.code === 'stored_picture_gone')
})
