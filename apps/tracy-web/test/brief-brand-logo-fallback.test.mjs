/**
 * A brief build never leaves the template's demo logo on a page (spec TracyHQ/tracy#189, #193). Where the owner's logo is
 * not placed (unreadable, refused, too small for a slot), the spot shows the business name as text; a logo narrower than
 * a picture slot's floor (`fit.minWidth`) goes on a transparent canvas that wide when it stays legible. Held against a
 * fake Joomla site behind the Apply door. Businesses and files are fictional.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { setSiteBrand } from '../src/sites/brief-engines/brand.js'
import { LEGIBLE_LOGO_PX, logoForSlot } from '../src/sites/brief-engines/brand-joomla-logo-fallback.js'

const ink = { r: 30, g: 40, b: 50, alpha: 1 }
const png = (width, height) =>
  sharp({ create: { width, height, channels: 4, background: ink } })
    .png()
    .toBuffer()

/** A drawing of `drawn` pixels high, centred on a transparent canvas of the template's frame shape. */
const framed = async (width, height, drawn) =>
  sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await png(Math.round(drawn * 2), drawn), gravity: 'centre' }])
    .png()
    .toBuffer()

test('a logo as wide as the slot asks goes as it is; a narrower legible one is set on a canvas that wide', async () => {
  const fit = { minWidth: 300, aspect: 3 }
  const wide = await framed(330, 110, 60)
  assert.deepEqual(await logoForSlot(wide, fit), { bytes: wide, padded: false })
  const small = await logoForSlot(await framed(150, 50, 40), fit)
  assert.ok('bytes' in small && small.padded)
  const meta = await sharp(small.bytes).metadata()
  assert.equal(meta.width, 300)
  assert.equal(meta.height, 100)
  assert.equal(meta.hasAlpha, true)
})

test('a logo that would show below a legible height is not placed: the spot shows the name', async () => {
  // 300 wide slot, its box 200: a drawing 18 pixels high shows 12 pixels high.
  const tiny = await logoForSlot(await framed(90, 30, 18), { minWidth: 300, aspect: 3 })
  assert.ok('text' in tiny)
  assert.ok(18 * (200 / 300) < LEGIBLE_LOGO_PX)
})

/** A T4 site with one profile, a footer logo slot with its Slot fit, and modules whose HTML may print a logo file. */
function t4Site({ profileWrites = 'ok', minWidth = 240 } = {}) {
  const state = {
    profile: {
      site_logo: 'images/demo/logo/dark.png',
      site_logo_dark: 'images/demo/logo/light.png',
      site_name: ''
    },
    slot: 'images/demo/logo/light.png',
    modules: new Map([
      [132, '<a href="/"><img src="images/demo/logo/light.png" alt=""></a>'],
      [140, '<div class="offcanvas"><img src="/images/demo/logo/dark.png" alt="Demo"></div>'],
      [150, '<p>Opening hours</p>']
    ]),
    files: new Set()
  }
  const calls = []
  const door = async (call) => {
    calls.push(call)
    const { action, params } = call
    if (action === 'info') return { ok: true, info: { component: '0.24.74' } }
    if (action === 'site.identity') return { ok: true }
    if (action === 'template.siteSettings' && (params.operation ?? 'read') === 'read')
      return {
        ok: true,
        template: 'ja_nova',
        framework: 't4',
        profiles: { default: { source: 'template', settings: { ...state.profile } } }
      }
    if (action === 'template.siteSettings') {
      const values = params.profiles.default
      if (profileWrites === 'refuse-logos' && Object.values(values).some((v) => v !== ''))
        return { ok: false, error: 'bad_params', message: 'the logo is not a file on this site' }
      Object.assign(state.profile, values)
      return { ok: true }
    }
    if (action === 'media.upload') {
      state.files.add(params.path)
      return { ok: true, path: params.path }
    }
    if (action === 'content.contract' && params.operation === 'inspect')
      return {
        ok: true,
        contract: 'c',
        revision: 'r1',
        slots: [
          { key: 'module-132.0', type: 'image', sample: state.slot, fit: { minWidth, aspect: 161 / 49 } }
        ]
      }
    if (action === 'content.contract' && params.operation === 'apply') {
      state.slot = params.changes['module-132.0']
      state.modules.set(132, `<a href="/"><img src="${state.slot}" alt=""></a>`)
      return { ok: true }
    }
    if (action === 'content.list' && params.kind === 'module')
      return {
        ok: true,
        items: [...state.modules]
          .slice(params.offset, params.offset + params.limit)
          .map(([id, content]) => ({ id, content }))
      }
    if (action === 'content.update' && params.kind === 'module') {
      state.modules.set(params.id, params.fields.content)
      return { ok: true }
    }
    if (action === 'content.list' && params.kind === 'menuItem') return { ok: true, items: [] }
    return { ok: false, error: 'bad_action', message: `unknown action: ${action}` }
  }
  return { state, calls, door }
}

const brief = (site, pack) =>
  setSiteBrand({
    platform: 'joomla',
    siteKey: 's',
    release: { tag: 'quickstart/ja-nova/j6', version: '1.0.4' },
    pack: {
      nameFallback: true,
      demoLogoFiles: ['images/demo/logo/dark.png', 'images/demo/logo/light.png'],
      ...pack
    },
    call: site.door,
    applyId: 'brand-1',
    note: () => {}
  })

test('a brief logo narrower than the footer slot floor is placed on a canvas that wide; no module keeps a demo logo', async () => {
  const site = t4Site({ minWidth: 240 })
  const result = await brief(site, {
    name: 'Crumb Street Bakery',
    logo: { single: await framed(160, 49, 40) }
  })
  assert.match(site.state.slot, /^images\/tracy-brand\/logo-footer-/)
  const footer = site.calls.find((c) => c.action === 'media.upload' && c.params.path === site.state.slot)
  assert.equal((await sharp(Buffer.from(footer.params.content_b64, 'base64')).metadata()).width, 240)
  assert.match(site.state.profile.site_logo, /^images\/tracy-brand\/logo-/)
  // The off-canvas copy has no door of its own: it shows the name.
  assert.match(site.state.modules.get(140), /<span class="tracy-brand-name">Crumb Street Bakery<\/span>/)
  assert.equal(site.state.modules.get(150), '<p>Opening hours</p>')
  for (const html of site.state.modules.values()) assert.doesNotMatch(html, /images\/demo\/logo/)
  assert.ok(result.written.includes('footer-logo'))
})

test('a brief logo the site refuses, or too small to read, leaves the name everywhere, never the demo logo', async () => {
  const site = t4Site({ profileWrites: 'refuse-logos', minWidth: 600 })
  const result = await brief(site, { name: 'Northgate Dental', logo: { single: await framed(160, 49, 14) } })
  assert.equal(site.state.profile.site_logo, '', 'the header prints the name')
  assert.equal(site.state.profile.site_logo_dark, '')
  assert.equal(site.state.slot, 'images/demo/logo/light.png', 'nothing is written into the footer slot')
  assert.match(site.state.modules.get(132), /Northgate Dental/)
  for (const html of site.state.modules.values()) assert.doesNotMatch(html, /images\/demo\/logo/)
  assert.ok(result.skipped.some((s) => s.where === 'footer-logo'))
})

test('without the brief build flag a refused logo leaves the template as it was', async () => {
  const site = t4Site({ profileWrites: 'refuse-logos' })
  await setSiteBrand({
    platform: 'joomla',
    siteKey: 's',
    release: { tag: 'quickstart/ja-nova/j6', version: '1.0.4' },
    pack: { name: 'Northgate Dental', logo: { single: await png(600, 200) } },
    call: site.door,
    applyId: 'brand-1',
    note: () => {}
  })
  assert.equal(site.state.profile.site_logo, 'images/demo/logo/dark.png')
  assert.match(site.state.modules.get(140), /images\/demo\/logo\/dark\.png/)
})

test('T3: a brief logo the site will not take leaves every style on the name as text', async () => {
  const params = JSON.stringify({ logotype: 'image', logoimage: 'images/demo/logo/mark.png', sitename: '' })
  const styles = new Map([[10, { id: 10, title: 'Default', template: 'ja_smallbiz', home: '1', params }]])
  const door = async ({ action, params: p }) => {
    if (action === 'info') return { ok: true, info: { component: '0.24.74' } }
    if (action === 'site.identity') return { ok: true }
    if (action === 'media.upload') return { ok: false, error: 'bad_params', message: 'refused' }
    if (action === 'content.list' && p.kind === 'templateStyle')
      return {
        ok: true,
        items: [...styles.values()].map(({ id, title, template, home }) => ({ id, title, template, home }))
      }
    if (action === 'content.get') return { ok: true, item: structuredClone(styles.get(p.id)) }
    if (action === 'content.update' && p.kind === 'templateStyle') {
      styles.get(p.id).params = p.fields.params
      return { ok: true }
    }
    if (action === 'content.list') return { ok: true, items: [] }
    return { ok: false, error: 'bad_action', message: `unknown action: ${action}` }
  }
  await setSiteBrand({
    platform: 'joomla',
    siteKey: 's',
    release: { tag: 'quickstart/ja-smallbiz/j6', version: '1.0.0' },
    pack: {
      name: 'Crumb Street Bakery',
      logo: { single: await png(600, 200) },
      nameFallback: true,
      demoLogoFiles: []
    },
    call: door,
    applyId: 'brand-1',
    note: () => {}
  })
  const after = JSON.parse(styles.get(10).params)
  assert.equal(after.logotype, 'text')
  assert.equal(after.sitename, 'Crumb Street Bakery')
})
