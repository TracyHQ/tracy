// The brand stage on a WordPress site (orders `via: 'wordpress-option'`): the JA Diner WordPress release's own kit, whose
// header prints a Site Logo block, takes its logo, its dark-background logo and its tab icon as options that name an
// attachment, the call the Apply popup's WordPress writer makes. Dev 26/11/2026 (`arabian-tea-wp4`): the logo spot
// `site_logo` was ordered through the T4 site profile, which WordPress has no door for, so the demo logo stayed. The
// plugin, the brand file and its pictures are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openKit } from '../src/lib/template-kit-source.js'
import { kitSiteLogoBlock } from '../src/write-step/brand-stage.js'
import { writeBrand } from '../src/write-step/brand-writes.js'
import { exportBrandOrders } from '../src/write-step/brand-write-orders.js'
import { lookGuard } from '../src/write-step/look-guard.js'
import { onPlatform } from '../src/write-step/site-doors/index.js'

const kit = openKit('ja-diner/wp7/1.0.4')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7])
const brand = (spots) => ({
  kind: 'brand-file',
  version: 10,
  kit: 'ja-diner@1.0.4',
  name: { slots: [] },
  logo: { spots },
  favicon: { png512: 'icon-512.png' },
  colours: {}
})
const LIGHT = { spot: 'logo-header-1', file: 'logo.png' }
const orderOf = (orders, slot) => orders.find((o) => o.slot === slot)

test('the theme header prints a Site Logo block, so the logo, the dark logo and the tab icon are options', () => {
  assert.equal(kitSiteLogoBlock(kit), true)
  assert.equal(kitSiteLogoBlock({ ref: 'ja-boxing/j4/1.0.10', platform: 'joomla' }), undefined)
  const { orders, problems } = exportBrandOrders({
    brand: brand([LIGHT, { spot: 'logo-header-2', file: 'logo-dark.png' }]),
    kit: kit.doc,
    world: { siteLogoBlock: true }
  })
  assert.deepEqual(problems, [])
  assert.deepEqual(
    ['logo-header-1', 'logo-header-2', 'favicon-option'].map((slot) => {
      const o = orderOf(orders, slot)
      return [o.via, o.key, o.file]
    }),
    [
      ['wordpress-option', 'site_logo', 'logo.png'],
      ['wordpress-option', 'tracy_logo_dark', 'logo-dark.png'],
      ['wordpress-option', 'site_icon', 'icon-512.png']
    ]
  )
  // No dark logo beside the customer's: the demo's dark logo is taken off, and the site name shows there.
  const one = exportBrandOrders({ brand: brand([LIGHT]), kit: kit.doc, world: { siteLogoBlock: true } })
  const dark = orderOf(one.orders, 'logo-header-2')
  assert.deepEqual(
    [dark.via, dark.key, dark.value, dark.file],
    ['wordpress-option', 'tracy_logo_dark', 0, undefined]
  )
  // Without the Site Logo block's evidence nothing changes: the spot is judged as on Joomla.
  const blind = exportBrandOrders({ brand: brand([LIGHT]), kit: kit.doc })
  assert.equal(orderOf(blind.orders, 'logo-header-1').via, 'profile')
})

/** A WordPress plugin stand-in: uploads answer an attachment per new path (0 for a path it holds), options are kept. */
function wordpressSite() {
  const calls = []
  const files = new Map()
  const options = new Map([['blogname', 'JA Diner']])
  const apply = async (call) => {
    calls.push(structuredClone(call))
    const { action, params } = call
    if (action === 'media.upload') {
      const known = files.has(params.path)
      if (!known) files.set(params.path, 400 + files.size)
      return { ok: true, path: params.path, attachment: known ? 0 : files.get(params.path), created: !known }
    }
    if (action === 'content.update' && params.kind === 'option') {
      options.set(params.key, params.fields.value)
      return { ok: true }
    }
    if (action === 'content.get' && params.kind === 'option')
      return { ok: true, item: { value: options.get(params.key) ?? null } }
    return { ok: false, error: 'bad_action' }
  }
  return { apply, calls, files, options }
}

/** The brand stage's writes on that site, through the look guard and the WordPress door as the write step sends them. */
async function written(orders, site = wordpressSite()) {
  const guard = lookGuard({ kit: kit.doc })
  const door = guard.door(onPlatform({ apply: site.apply }, 'wordpress'))
  const results = new Map()
  const pictures = new Map([
    ['logo.png', PNG],
    ['icon-512.png', Buffer.concat([PNG, Buffer.from([1])])]
  ])
  const ask = (action, params) =>
    door.apply({ siteKey: 'harbour', action, params: { apply_id: 'brand-1', ...params } })
  await writeBrand({ orders, plan: {}, pictures, accent: null, ask, results })
  return { site, results, findings: guard.findings() }
}

test('each picture is uploaded to the brand folder and its option names the attachment; each reads back', async () => {
  const { orders } = exportBrandOrders({
    brand: brand([LIGHT]),
    kit: kit.doc,
    world: { siteLogoBlock: true }
  })
  const mine = orders.filter((o) => o.via === 'wordpress-option')
  const { site, results, findings } = await written(mine)
  assert.deepEqual(findings, [])
  const uploads = site.calls.filter((c) => c.action === 'media.upload')
  assert.equal(uploads.length, 2)
  for (const u of uploads) assert.match(u.params.path, /^wp-content\/uploads\/tracy-brand\/[\w-]+\.png$/)
  assert.deepEqual(Object.fromEntries(site.options), {
    blogname: 'JA Diner',
    site_logo: 400,
    tracy_logo_dark: 0,
    site_icon: 401
  })
  const logo = results.get(orderOf(mine, 'logo-header-1'))
  assert.deepEqual([logo.status, logo.ordered], ['written', 400])
  assert.deepEqual(logo.readFrom, {
    action: 'content.get',
    params: { kind: 'option', key: 'site_logo' },
    path: ['item', 'value']
  })
  assert.equal(results.get(orderOf(mine, 'logo-header-2')).status, 'written')
  // The read-back goes through the same door: a brand option is read, never another one.
  const door = onPlatform({ apply: site.apply }, 'wordpress')
  assert.equal((await door.apply({ action: 'content.get', params: logo.readFrom.params })).item.value, 400)
  const other = await door.apply({ action: 'content.get', params: { kind: 'option', key: 'blogname' } })
  assert.equal(other.error, 'not_on_wordpress')
})

test('a picture the site holds already goes once more under its own name, so its option names a real attachment', async () => {
  const site = wordpressSite()
  const { orders } = exportBrandOrders({
    brand: brand([LIGHT]),
    kit: kit.doc,
    world: { siteLogoBlock: true }
  })
  const logo = () => [structuredClone(orderOf(orders, 'logo-header-1'))]
  await written(logo(), site)
  const again = await written(logo(), site)
  const uploads = site.calls.filter((c) => c.action === 'media.upload').map((c) => c.params.path)
  assert.equal(uploads.length, 3)
  assert.equal(uploads[1], uploads[0])
  assert.notEqual(uploads[2], uploads[0])
  assert.equal(site.options.get('site_logo'), 401)
  assert.equal([...again.results.values()][0].status, 'written')
})

test('🔒 the look guard opens only the options the kit names, as the id of a picture', async () => {
  const guard = lookGuard({ kit: kit.doc })
  const sent = []
  const door = guard.door({ apply: async (call) => (sent.push(call), { ok: true }) })
  const update = (params) => door.apply({ siteKey: 'harbour', action: 'content.update', params })
  await update({ apply_id: 'b', kind: 'option', id: 0, key: 'site_logo', fields: { value: 12 } })
  assert.deepEqual(guard.findings(), [])
  // Another option, or a key on a row, is a channel nobody listed: never sent.
  await update({ apply_id: 'b', kind: 'option', id: 0, key: 'blogname', fields: { value: 1 } })
  await update({ apply_id: 'b', kind: 'module', id: 9, key: 'site_logo', fields: { content: 'x' } })
  assert.equal(sent.length, 1)
  // A value that is not an attachment id is a finding on the value.
  await update({ apply_id: 'b', kind: 'option', id: 0, key: 'site_icon', fields: { value: '/x.png' } })
  assert.equal(sent.length, 2)
  assert.ok(guard.findings().some((f) => /site_icon holds the id of a picture/.test(f.reason)))
})
