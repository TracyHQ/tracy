// The site agent's icon door: search the library, find an icon slot's light and dark pair in the template kit, and draw the
// slot's icon again with another glyph in its own look and colours. Every kit, slot and icon file here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { mountSiteIcons } from '../src/sites/icon-door.js'
import { iconPairOf, redrawIcon, searchIcons } from '../src/lib/picture-paint/icons/icon-pick.js'
import { iconColourOf } from '../src/lib/picture-paint/icons/icon-ink.js'
import { iconLookOf } from '../src/lib/picture-paint/icons/template-icon-look.js'
import { templateIcon } from './_template-icon-fixtures.mjs'

/** An invented kit: one block with an icon, its light twin, and a photo. */
const KIT = {
  blocks: [
    {
      id: 'body-features',
      frames: [
        { id: 'article-7.4', kind: 'icon', twinOf: null },
        { id: 'article-7.5', kind: 'icon', twinOf: 'article-7.4' },
        { id: 'article-7.9', kind: 'photo', twinOf: null },
        { id: 'block-12.3', kind: 'icon', twinOf: null }
      ]
    }
  ]
}

function bed({ kit = { state: 'read', doc: KIT } } = {}) {
  const app = new Hono()
  mountSiteIcons(app, {
    conversationSite: async () => ({ siteKey: 'shop.example.test' }),
    requireGrant: async () => ({ grant: { role: 'owner' } }),
    siteByKey: async () => ({ site_key: 'shop.example.test', platform: 'joomla' }),
    contractOfSite: () => ({ id: 'invented/j6/1.0.0', dir: '/nowhere' }),
    kitOf: () => kit
  })
  return (body) =>
    app.request('/api/sites/_conversation/icons', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
}

test('a search answers library names that say the words, and never a brand logo', async () => {
  const found = searchIcons('gym')
  assert.ok(found.length > 0 && found.length <= 12)
  assert.ok(
    found.some((i) => i.name === 'barbell'),
    JSON.stringify(found.map((i) => i.name))
  )
  assert.ok(found.every((i) => !i.name.endsWith('-logo')))
  assert.ok(searchIcons('github').every((i) => !i.name.endsWith('-logo')))
})

test('an icon slot names its twin, from either side of the pair', () => {
  assert.deepEqual(iconPairOf(KIT, 'article-7.4'), { ok: true, slots: ['article-7.4', 'article-7.5'] })
  assert.deepEqual(iconPairOf(KIT, 'article-7.5'), { ok: true, slots: ['article-7.4', 'article-7.5'] })
  assert.deepEqual(iconPairOf(KIT, 'module-12.3'), { ok: true, slots: ['module-12.3'] })
  assert.deepEqual(iconPairOf(KIT, 'article-7.9'), { ok: false, code: 'NOT_AN_ICON_SLOT', kind: 'photo' })
  assert.deepEqual(iconPairOf(KIT, 'article-8.1'), { ok: false, code: 'SLOT_UNKNOWN' })
})

test('a redrawn icon keeps the template look and the colours the slot shows now', async () => {
  const template = await templateIcon({ disc: '#17171b', stroke: 2, ink: '#d83a3a' })
  // What the build wrote there: the same look, in the brand's colours.
  const current = await templateIcon({ disc: '#1d2b44', stroke: 2, ink: '#f2b705' })
  const made = await redrawIcon({ glyph: 'barbell', template, current })
  assert.equal(made.ok, true)
  const was = await iconLookOf(template)
  const now = await iconLookOf(made.bytes)
  assert.equal(now.width, was.width)
  assert.equal(now.height, was.height)
  assert.ok(Math.abs(now.plate.box.w - was.plate.box.w) < 0.04)
  assert.equal(now.plate.colour, '#1d2b44')
  assert.equal(made.colour, await iconColourOf(current))
  // Read back from the new drawing, the glyph is in that colour, give or take its anti-aliased edge.
  const ink = Number.parseInt((await iconColourOf(made.bytes)).slice(1), 16)
  const want = Number.parseInt(made.colour.slice(1), 16)
  for (const shift of [16, 8, 0]) assert.ok(Math.abs(((ink >> shift) & 255) - ((want >> shift) & 255)) < 48)
  assert.notDeepEqual(made.bytes, current)
})

test('an icon nobody can read, or a name the set lacks, draws nothing', async () => {
  assert.equal(
    (await redrawIcon({ glyph: 'no-such-icon-anywhere', current: await templateIcon() })).code,
    'ICON_UNKNOWN'
  )
  assert.equal(
    (await redrawIcon({ glyph: 'barbell', current: Buffer.from('not a picture') })).code,
    'ICON_UNREADABLE'
  )
})

test('the door searches, pairs and draws, and refuses what it cannot answer', async () => {
  const call = bed()
  const search = await (await call({ operation: 'search', query: 'gym' })).json()
  assert.equal(search.ok, true)
  assert.match(search.set, /^@phosphor-icons\/core@/)
  assert.ok(search.icons.some((i) => i.name === 'barbell'))

  assert.deepEqual(await (await call({ operation: 'pair', slot: 'article-7.5' })).json(), {
    ok: true,
    slots: ['article-7.4', 'article-7.5']
  })

  const dark = await templateIcon({ ink: '#202020' })
  const light = await templateIcon({ ink: '#f4f4f4' })
  const drawn = await (
    await call({
      operation: 'draw',
      icon: 'barbell',
      files: [
        { slot: 'article-7.4', template_b64: dark.toString('base64') },
        { slot: 'article-7.5', template_b64: light.toString('base64'), current_b64: light.toString('base64') }
      ]
    })
  ).json()
  assert.equal(drawn.ok, true)
  assert.deepEqual(
    drawn.pictures.map((p) => p.slot),
    ['article-7.4', 'article-7.5']
  )
  assert.notEqual(drawn.pictures[0].colour, drawn.pictures[1].colour)
  assert.match(drawn.pictures[0].sha256, /^[0-9a-f]{64}$/)

  assert.equal((await call({ operation: 'pair', slot: 'not a key' })).status, 400)
  assert.equal((await call({ operation: 'nothing' })).status, 400)
  assert.equal(
    (await (await bed({ kit: { state: 'none' } })({ operation: 'pair', slot: 'article-7.4' })).json()).code,
    'NO_KIT'
  )
})
