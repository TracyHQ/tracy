// The template's page background: a T4 template paints one picture behind the blocks of many pages from one site
// setting (`body_bg_img`). The kit names that setting as one writable slot, and every frame painted behind with that
// picture points at it. Fabricated tennis club template.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { settleSettingSlots } from '../template-kit/lib/setting-slots.mjs'
import { joomlaAdapter } from '../template-kit/lib/site/adapters/joomla.mjs'

const BG = 'images/demo/others/court-dusk.jpg'
const PROFILE = 'templates/demo_court/etc/site/default.json'

function fakeSource(siteSettings, profile = null) {
  const files = {
    'configuration.php': "public $sitename = 'Clay Court Club';",
    [PROFILE]: JSON.stringify(profile ? { body_bg_img: 'images/demo/others/old.jpg' } : siteSettings),
    ...(profile ? { [`templates/demo_court/etc/site/${profile}.json`]: JSON.stringify(siteSettings) } : {})
  }
  const params = JSON.stringify(profile ? { 'typelist-site': profile } : {})
  const rows = {
    'SHOW TABLES': [{ t: 'cc_extensions' }, { t: 'cc_menu' }],
    template_styles: [{ template: 'demo_court', params }]
  }
  return {
    readFile: (rel) => files[rel] ?? null,
    query: (sql) => rows[sql === 'SHOW TABLES' ? sql : /FROM cc_(\w+)/.exec(sql)?.[1]] ?? []
  }
}

const behind = (id, picture, twinOf = null) => ({
  id,
  kind: 'photo',
  canHide: true,
  twinOf,
  picture,
  shownAs: 'background',
  painter: 'div.bg-mask',
  paintedBehind: true,
  writable: false,
  writableReason: 'painted behind the block by the template'
})

const kitOf = () => ({
  template: { name: 'demo_court' },
  pages: [],
  blocks: [
    { id: 'block-20', frames: [behind('block-20.picture-1', BG)] },
    { id: 'body-coaches', frames: [behind('body-coaches.picture-2', BG, 'block-20.picture-1')] },
    { id: 'body-shop', frames: [behind('body-shop.picture-1', 'images/demo/others/net.jpg')] },
    {
      id: 'body-home',
      frames: [{ id: 'body-home.1', picture: BG, shownAs: 'img', writable: true }]
    }
  ],
  site: { contactBlocks: [] }
})

test('the T4 adapter reads the page background setting, without the media field suffix', () => {
  const adapter = joomlaAdapter(
    fakeSource({
      site_name: '',
      body_bg_img: `${BG}#joomlaImage://local-images/demo/others/court-dusk.jpg?width=2000`
    })
  )
  assert.deepEqual(adapter.backgroundSettings(), [
    { key: 'body_bg_img', value: BG, template: 'demo_court', file: PROFILE }
  ])
  assert.deepEqual(joomlaAdapter(fakeSource({ body_bg_img: '' })).backgroundSettings(), [])
  assert.equal(joomlaAdapter({ query: null, readFile: null }).backgroundSettings(), null)
})

test('the background is read from the profile the home style names, not always the default one', () => {
  const adapter = joomlaAdapter(fakeSource({ body_bg_img: BG }, 'evening'))
  assert.deepEqual(adapter.backgroundSettings(), [
    {
      key: 'body_bg_img',
      value: BG,
      template: 'demo_court',
      file: 'templates/demo_court/etc/site/evening.json'
    }
  ])
})

test('every frame painted behind with the setting picture points at one writable slot; others keep their reason', () => {
  const kit = kitOf()
  const setting = { key: 'body_bg_img', value: BG, template: 'demo_court', file: PROFILE }
  const r = settleSettingSlots(kit, { map: {}, mapSettings: [], backgroundSettings: [setting] })
  assert.equal(r.backgrounds, 2)
  const frames = kit.blocks.flatMap((b) => b.frames)
  const byId = Object.fromEntries(frames.map((f) => [f.id, f]))
  for (const id of ['block-20.picture-1', 'body-coaches.picture-2']) {
    assert.deepEqual(
      [byId[id].writable, byId[id].slotId, byId[id].writableReason],
      [true, 'site.body-background', undefined]
    )
  }
  assert.equal(byId['body-shop.picture-1'].writable, false)
  assert.equal(byId['body-shop.picture-1'].slotId, undefined)
  assert.equal(byId['body-home.1'].slotId, undefined)
  const [slot] = kit.site.settingSlots
  assert.equal(slot.id, 'site.body-background')
  assert.equal(slot.kind, 'template-background')
  assert.deepEqual(slot.writeTo, {
    action: 'template.siteSettings',
    template: 'demo_court',
    key: 'body_bg_img',
    file: PROFILE
  })
  assert.equal(slot.sample, BG)
  assert.equal(slot.canHide, true)
  assert.deepEqual(slot.frames, ['block-20.picture-1', 'body-coaches.picture-2'])
  assert.match(slot.valueFormat, /media\.upload/)
  assert.match(slot.fillFrom, /hiddenSlots/)
  assert.equal(kit.site.backgroundSettings, undefined)
})

test('settling again with nothing read keeps the slot; a template without the setting unties the frames', () => {
  const kit = kitOf()
  const setting = { key: 'body_bg_img', value: BG, template: 'demo_court', file: PROFILE }
  settleSettingSlots(kit, { map: {}, mapSettings: [], backgroundSettings: [setting] })
  const once = JSON.stringify(kit)
  settleSettingSlots(kit, { map: {}, mapSettings: [] })
  assert.equal(JSON.stringify(kit), once)
  settleSettingSlots(kit, { map: {}, mapSettings: [], backgroundSettings: [setting] })
  assert.equal(JSON.stringify(kit), once)
  settleSettingSlots(kit, { map: {}, mapSettings: [], backgroundSettings: [] })
  const root = kit.blocks[0].frames[0]
  assert.deepEqual([root.writable, root.slotId], [false, undefined])
  assert.match(root.writableReason, /painted behind the block by the template's own page settings/)
  assert.deepEqual(kit.site.settingSlots, [])
})

test('the site part hands the background settings to the slot step through site.backgroundSettings', () => {
  const kit = kitOf()
  kit.site.backgroundSettings = [{ key: 'body_bg_img', value: BG, template: 'demo_court', file: PROFILE }]
  settleSettingSlots(kit, { map: {} })
  assert.equal(kit.blocks[0].frames[0].slotId, 'site.body-background')
  assert.equal(kit.site.backgroundSettings, undefined)
})

// A T4 layout section's background picture is an image slot of the layout (`templateConfig-<id>`): one picture may sit
// in the sections of several layouts, and every frame showing it writes all of them.
const HERO = 'images/demo/hero/court-wide.jpg'
const layoutSlot = (key, sample) => ({ key, entity: key.split('.')[0], type: 'image', sample })
const LAYOUT_MAP = {
  slots: [
    layoutSlot('templateConfig-11.0', HERO),
    layoutSlot('templateConfig-12.3', `/${HERO.toUpperCase()}#joomlaImage://local-images/x.jpg`),
    layoutSlot('templateConfig-12.4', 'images/demo/others/elsewhere.jpg'),
    { key: 'module-20.1', entity: 'module-20', type: 'image', sample: 'images/demo/others/net.jpg' }
  ]
}

test('a frame a layout paints behind writes every layout slot holding its picture, its twins too', () => {
  const kit = kitOf()
  kit.blocks.push(
    { id: 'block-30', frames: [behind('block-30.picture-1', HERO)] },
    { id: 'body-courts', frames: [behind('body-courts.picture-1', HERO, 'block-30.picture-1')] }
  )
  kit.blocks.at(-2).frames[0].sameFileAs = 'a content map slot shows the same file elsewhere'
  const setting = { key: 'body_bg_img', value: BG, template: 'demo_court', file: PROFILE }
  settleSettingSlots(kit, { map: LAYOUT_MAP, mapSettings: [], backgroundSettings: [setting] })
  const byId = Object.fromEntries(kit.blocks.flatMap((b) => b.frames).map((f) => [f.id, f]))
  for (const id of ['block-30.picture-1', 'body-courts.picture-1'])
    assert.deepEqual(
      [byId[id].writable, byId[id].writesTo, byId[id].writableReason, byId[id].slotId],
      [true, ['templateConfig-11.0', 'templateConfig-12.3'], undefined, undefined]
    )
  assert.equal(byId['block-30.picture-1'].sameFileAs, undefined)
  // The page background keeps its setting slot; a picture no layout slot holds stays not writable.
  assert.deepEqual(
    [byId['block-20.picture-1'].slotId, byId['block-20.picture-1'].writesTo],
    ['site.body-background', undefined]
  )
  assert.deepEqual(
    [byId['body-shop.picture-1'].writable, byId['body-shop.picture-1'].writesTo],
    [false, undefined]
  )
  // The layout no longer shows the picture: the frames go back to not writable.
  settleSettingSlots(kit, { map: { slots: [] }, mapSettings: [] })
  assert.deepEqual(
    [byId['block-30.picture-1'].writable, byId['block-30.picture-1'].writesTo],
    [false, undefined]
  )
  assert.match(byId['block-30.picture-1'].writableReason, /painted behind the block/)
})
