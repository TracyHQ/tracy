/**
 * The Joomla brand writer behind `setSiteBrand` (plan `tasks/plan-ten-logo-favicon.md`, T19, T20): template style params
 * on T3, the plugin's `template.siteSettings` on T4 (Claude Cowork for Joomla 0.23.0), the footer image slot through
 * `content.contract apply`, the favicon through `other_faviconFile`. Held against a fake site that answers the way the
 * plugin does and takes an `apply.revert` back.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { TEMPLATE_PROFILES } from '../src/lib/template-profiles.js'
import { createSiteBrand, setSiteBrand } from '../src/sites/brief-engines/brand.js'
import { throughDoor } from './_apply-door.mjs'

const png = (width, height, ink = { r: 20, g: 30, b: 40, alpha: 1 }) =>
  sharp({ create: { width, height, channels: 4, background: ink } })
    .png()
    .toBuffer()

/** A T3 style row as the release ships it, params a JSON string. */
const t3Style = (id, title, params, template) => ({
  id,
  title,
  template,
  home: '0',
  params: JSON.stringify({ t3_template: '1', theme: '', slogan: '', ...params })
})

/**
 * A Joomla site behind the Apply door.
 * @param {object} o
 * @param {string} [o.component] - the plugin version `info` answers
 * @param {any[]} [o.styles] - template style rows
 * @param {Record<string, Record<string, string>>} [o.profiles] - T4 site profiles by name (template `t4` only)
 * @param {string} [o.template] - the site template folder
 * @param {string} [o.framework]
 * @param {Record<string, {type: string, value: string}>} [o.slots] - contract slots
 */
function fakeJoomla({
  component = '0.23.0',
  styles = [],
  profiles = {},
  template = 'ja_nova',
  framework = 't4',
  slots = {}
} = {}) {
  const state = {
    sitename: 'ja-demo-joomla',
    styles: new Map(styles.map((s) => [s.id, structuredClone(s)])),
    profiles: structuredClone(profiles),
    favicon: '',
    slots: structuredClone(slots),
    files: new Set(),
    revision: 'r1'
  }
  const log = new Map()
  const calls = []
  const record = (id, undo) => {
    if (!log.has(id)) log.set(id, [])
    log.get(id).push(undo)
  }
  const knows = (since) => component !== null && component >= since
  const door = async (call) => {
    calls.push(call)
    const { action, params } = call
    if (action === 'info') return { ok: true, info: { component } }
    if (action === 'site.identity') {
      const before = state.sitename
      state.sitename = params.fields.sitename
      record(params.apply_id, () => {
        state.sitename = before
      })
      return { ok: true }
    }
    if (action === 'content.list' && params.kind === 'templateStyle')
      return {
        ok: true,
        kind: 'templateStyle',
        offset: 0,
        items: [
          { id: 1, title: 'atum - Default', template: 'atum', home: '1' },
          ...[...state.styles.values()].map(({ id, title, template: t, home }) => ({
            id,
            title,
            template: t,
            home
          }))
        ]
      }
    if (action === 'content.get' && params.kind === 'templateStyle') {
      const row = state.styles.get(params.id)
      return row ? { ok: true, item: structuredClone(row) } : { ok: false, error: 'not_found' }
    }
    if (action === 'content.update' && params.kind === 'templateStyle') {
      const row = state.styles.get(params.id)
      const before = row.params
      row.params = params.fields.params
      record(params.apply_id, () => {
        row.params = before
      })
      return { ok: true }
    }
    if (action === 'template.siteSettings') {
      if (!knows('0.23.0'))
        return { ok: false, error: 'bad_action', message: 'unknown action: template.siteSettings' }
      if (params.template !== template) return { ok: false, error: 'not_found' }
      const head = { ok: true, template, framework }
      if ((params.operation ?? 'read') === 'read')
        return framework === 't4'
          ? {
              ...head,
              profiles: Object.fromEntries(
                Object.entries(state.profiles).map(([n, s]) => [
                  n,
                  { source: 'template', settings: { ...s } }
                ])
              ),
              missing: []
            }
          : { ...head, keys: ['other_faviconFile'], settings: { other_faviconFile: state.favicon } }
      for (const value of [
        ...Object.values(params.fields ?? {}),
        ...Object.values(params.profiles ?? {}).flatMap(Object.values)
      ])
        if (value !== '' && value.endsWith('.png') && !state.files.has(value))
          return { ok: false, error: 'bad_params', message: `${value} is not a file on this site` }
      if (framework !== 't4') {
        const before = state.favicon
        state.favicon = params.fields.other_faviconFile
        record(params.apply_id, () => {
          state.favicon = before
        })
        return { ok: true }
      }
      const before = structuredClone(state.profiles)
      for (const [name, values] of Object.entries(params.profiles ?? {}))
        Object.assign(state.profiles[name], params.fields ?? {}, values)
      record(params.apply_id, () => {
        state.profiles = before
      })
      return { ok: true }
    }
    if (action === 'media.upload') {
      state.files.add(params.path)
      record(params.apply_id, () => state.files.delete(params.path))
      return { ok: true, path: params.path }
    }
    if (action === 'content.contract' && params.operation === 'inspect')
      return {
        ok: true,
        contract: 'c',
        revision: state.revision,
        slots: Object.entries(state.slots).map(([key, s]) => ({ key, type: s.type, sample: s.value }))
      }
    if (action === 'content.contract' && params.operation === 'apply') {
      if (!String(params.apply_id).startsWith('contract-'))
        return { ok: false, error: 'apply_id must start with "contract-"' }
      if (params.expected_revision !== state.revision) return { ok: false, error: 'REVISION_STALE' }
      const before = structuredClone(state.slots)
      for (const [key, value] of Object.entries(params.changes)) state.slots[key].value = value
      record(params.apply_id, () => {
        state.slots = before
      })
      return { ok: true }
    }
    if (action === 'apply.revert') {
      for (const undo of (log.get(params.apply_id) ?? []).reverse()) undo()
      log.delete(params.apply_id)
      return { ok: true }
    }
    return { ok: false, error: 'bad_action', message: `unknown action: ${action}` }
  }
  const of = (action, operation) =>
    calls.filter((c) => c.action === action && (operation === undefined || c.params?.operation === operation))
  return { state, calls, door, of }
}

const brand = (site, release, pack, applyId = 'brand-1') =>
  setSiteBrand({
    platform: 'joomla',
    siteKey: 's',
    release,
    pack,
    call: site.door,
    applyId,
    note: () => {}
  })

const sizeOfUpload = async (site, path) => {
  const call = site.of('media.upload').find((c) => c.params.path === path)
  const { width, height } = await sharp(Buffer.from(call.params.content_b64, 'base64')).metadata()
  return { width, height }
}
const paramsOf = (site, id) => JSON.parse(site.state.styles.get(id).params)

// ---- T3 -------------------------------------------------------------------------------------------------------------

const SMALLBIZ = [
  t3Style(10, 'ja_smallbiz - Default', { logotype: 'image', sitename: '', logoimage: '' }, 'ja_smallbiz'),
  t3Style(
    11,
    'ja_smallbiz - Car',
    { logotype: 'image', logoimage: 'images/joomlart/logo/car-logo.jpg' },
    'ja_smallbiz'
  ),
  t3Style(
    12,
    'ja_smallbiz - Gym',
    { logotype: 'image', logoimage: 'images/joomlart/logo/gym-logo.png' },
    'ja_smallbiz'
  ),
  t3Style(13, 'ja_smallbiz - Wedding', { logotype: 'image', theme: 'pink' }, 'ja_smallbiz')
]

test('T3 JA Smallbiz: four styles, four writes, every other param kept', async () => {
  const site = fakeJoomla({ styles: SMALLBIZ, template: 'ja_smallbiz', framework: 't3' })
  const result = await brand(
    site,
    { tag: 'quickstart/ja-smallbiz/j6', version: '1.0.0' },
    { name: 'Tamq Bakery', logo: { single: await png(600, 200) } }
  )
  const updates = site.of('content.update')
  assert.equal(updates.length, 4)
  assert.ok(updates.every((c) => c.params.kind === 'templateStyle' && c.params.apply_id === 'brand-1'))
  const [upload] = site.of('media.upload')
  assert.match(upload.params.path, /^images\/tracy-brand\/[\w-]+\.png$/)
  for (const id of [10, 11, 12, 13]) {
    const p = paramsOf(site, id)
    assert.equal(p.logotype, 'image')
    assert.equal(p.logoimage, upload.params.path)
    assert.equal(p.sitename, '')
    assert.equal(p.t3_template, '1')
  }
  assert.equal(paramsOf(site, 13).theme, 'pink')
  assert.ok(result.written.includes('logo'))
})

test('T3 JA Morgan with no logo: logotype stays text, the name replaces the demo one', async () => {
  const styles = [9, 10, 11, 12].map((id) =>
    t3Style(id, `ja_morgan - Style ${id}`, { logotype: 'text', sitename: 'Morgan<b>.</b>' }, 'ja_morgan')
  )
  const site = fakeJoomla({ styles, template: 'ja_morgan', framework: 't3' })
  await brand(site, { tag: 'quickstart/ja-morgan/j6', version: '1.0.1' }, { name: 'Tamq Bakery' })
  assert.equal(site.of('content.update').length, 4)
  for (const id of [9, 10, 11, 12]) {
    assert.equal(paramsOf(site, id).logotype, 'text')
    assert.equal(paramsOf(site, id).sitename, 'Tamq Bakery')
  }
  assert.equal(site.of('media.upload').length, 0)
})

test('T3 JA Sensei: the light logo, padded, into footer slot module-108.2; the dark one into the dark header', async () => {
  const styles = [t3Style(9, 'ja_sensei - Default', { logotype: 'image', logoimage: '' }, 'ja_sensei')]
  const site = fakeJoomla({
    styles,
    template: 'ja_sensei',
    framework: 't3',
    slots: { 'module-108.2': { type: 'image', value: 'images/joomlart/others/logo.png' } }
  })
  const result = await brand(
    site,
    { tag: 'quickstart/ja-sensei/j6', version: '1.0.0' },
    {
      name: 'Tamq',
      logo: { light: await png(600, 600), dark: await png(500, 100, { r: 250, g: 250, b: 250, alpha: 1 }) }
    }
  )
  const [apply] = site.of('content.contract', 'apply')
  assert.match(apply.params.apply_id, /^contract-/)
  const footer = apply.params.changes['module-108.2']
  assert.match(footer, /logo-light/)
  const size = await sizeOfUpload(site, footer)
  assert.ok(Math.abs(size.width / size.height - 81 / 23) <= 0.02)
  assert.match(paramsOf(site, 9).logoimage, /logo-dark/)
  assert.ok(result.written.includes('footer-logo'))
})

test('T3 JA Mood: the "Home Dark" style takes the dark logo, the others the light one', async () => {
  const styles = [
    t3Style(9, 'JA Mood - Default', { logotype: 'image' }, 'ja_mood'),
    t3Style(14, 'JA Mood - Home Dark', { logotype: 'image' }, 'ja_mood')
  ]
  const site = fakeJoomla({ styles, template: 'ja_mood', framework: 't3' })
  await brand(
    site,
    { tag: 'quickstart/ja-mood/j6', version: '1.0.0' },
    { logo: { light: await png(600, 200), dark: await png(600, 201) } }
  )
  assert.match(paramsOf(site, 9).logoimage, /logo-light/)
  assert.match(paramsOf(site, 14).logoimage, /logo-dark/)
})

test('T3 with only the light logo: a dark style shows the name as text (Q7)', async () => {
  const styles = [
    t3Style(9, 'JA Mood - Default', { logotype: 'image' }, 'ja_mood'),
    t3Style(14, 'JA Mood - Home Dark', { logotype: 'image' }, 'ja_mood')
  ]
  const site = fakeJoomla({ styles, template: 'ja_mood', framework: 't3' })
  await brand(
    site,
    { tag: 'quickstart/ja-mood/j6', version: '1.0.0' },
    { name: 'Tamq', logo: { light: await png(600, 200) } }
  )
  assert.equal(paramsOf(site, 14).logotype, 'text')
  assert.equal(paramsOf(site, 14).sitename, 'Tamq')
})

test('T31 T3 JA Morgan 1.0.2 pair: logoimage takes the light logo, logoimage_dark the dark one', async () => {
  const styles = [9, 10].map((id) =>
    t3Style(
      id,
      `ja_morgan - Style ${id}`,
      { logotype: 'text', sitename: 'Morgan<b>.</b>', logoimage: '', logoimage_dark: '' },
      'ja_morgan'
    )
  )
  const site = fakeJoomla({ styles, template: 'ja_morgan', framework: 't3' })
  await brand(
    site,
    { tag: 'quickstart/ja-morgan/j6', version: '1.0.2' },
    { name: 'Tamq', logo: { light: await png(600, 200), dark: await png(600, 201) } }
  )
  for (const id of [9, 10]) {
    assert.equal(paramsOf(site, id).logotype, 'image')
    assert.match(paramsOf(site, id).logoimage, /logo-light/)
    assert.match(paramsOf(site, id).logoimage_dark, /logo-dark/)
  }
})

test('T31 T3 JA Morgan 1.0.2 light logo only: logoimage_dark is emptied, dark mode shows the name (Q7)', async () => {
  const styles = [
    t3Style(
      9,
      'ja_morgan - Default',
      { logotype: 'image', logoimage: 'x.png', logoimage_dark: 'y.png' },
      'ja_morgan'
    )
  ]
  const site = fakeJoomla({ styles, template: 'ja_morgan', framework: 't3' })
  await brand(
    site,
    { tag: 'quickstart/ja-morgan/j6', version: '1.0.2' },
    { name: 'Tamq', logo: { light: await png(600, 200) } }
  )
  assert.match(paramsOf(site, 9).logoimage, /logo-light/)
  assert.equal(paramsOf(site, 9).logoimage_dark, '')
  assert.ok(!site.of('media.upload').some((c) => /logo-dark-/.test(c.params.path)))
})

test('T31 T3 a style without logoimage_dark never gets one', async () => {
  const styles = [t3Style(9, 'JA Mood - Default', { logotype: 'image' }, 'ja_mood')]
  const site = fakeJoomla({ styles, template: 'ja_mood', framework: 't3' })
  await brand(
    site,
    { tag: 'quickstart/ja-mood/j6', version: '1.0.0' },
    { logo: { light: await png(600, 200), dark: await png(600, 201) } }
  )
  assert.ok(!Object.hasOwn(paramsOf(site, 9), 'logoimage_dark'))
})

test('T3 favicon through template.siteSettings other_faviconFile', async () => {
  const site = fakeJoomla({ styles: SMALLBIZ, template: 'ja_smallbiz', framework: 't3' })
  const result = await brand(
    site,
    { tag: 'quickstart/ja-smallbiz/j6', version: '1.0.0' },
    { favicon: await png(512, 512) }
  )
  const [set] = site.of('template.siteSettings', 'set')
  assert.deepEqual(Object.keys(set.params.fields), ['other_faviconFile'])
  assert.equal(set.params.template, 'ja_smallbiz')
  assert.match(site.state.favicon, /^images\/tracy-brand\/favicon-/)
  assert.ok(result.written.includes('favicon'))
})

test('a favicon Tracy made goes up as its ICO and other_faviconFile names the .ico (T3 and T4 print it as the tab icon)', async () => {
  const { icoOf } = await import('../src/sites/brief-engines/brand-favicon.js')
  const ico = await icoOf([await png(16, 16), await png(32, 32), await png(48, 48)])
  const site = fakeJoomla({ styles: SMALLBIZ, template: 'ja_smallbiz', framework: 't3' })
  await brand(
    site,
    { tag: 'quickstart/ja-smallbiz/j6', version: '1.0.0' },
    { favicon: await png(512, 512), faviconIco: ico }
  )
  assert.match(site.state.favicon, /^images\/tracy-brand\/favicon-[0-9a-f]{16}-.+\.ico$/)
  const [upload] = site.of('media.upload')
  assert.deepEqual([...Buffer.from(upload.params.content_b64, 'base64').subarray(0, 4)], [0, 0, 1, 0])
  // An uploaded PNG alone stays a .png.
  const plain = fakeJoomla({ styles: SMALLBIZ, template: 'ja_smallbiz', framework: 't3' })
  await brand(plain, { tag: 'quickstart/ja-smallbiz/j6', version: '1.0.0' }, { favicon: await png(512, 512) })
  assert.match(plain.state.favicon, /\.png$/)
})

test('T3 on plugin 0.22.0: the logo is written, the favicon is skipped as plugin too old', async () => {
  const site = fakeJoomla({ component: '0.22.0', styles: SMALLBIZ, template: 'ja_smallbiz', framework: 't3' })
  const result = await brand(
    site,
    { tag: 'quickstart/ja-smallbiz/j6', version: '1.0.0' },
    { logo: { single: await png(600, 200) }, favicon: await png(512, 512) }
  )
  assert.equal(site.of('content.update').length, 4)
  assert.equal(site.of('template.siteSettings').length, 0)
  assert.deepEqual(result.skipped.find((s) => s.where === 'favicon')?.reason, 'plugin too old')
})

// ---- T4 -------------------------------------------------------------------------------------------------------------

const NOVA = {
  default: {
    site_logo: 'images/joomlart/logo/item-1.png',
    site_logo_small: '',
    site_logo_dark: 'images/joomlart/logo/item-2.png',
    site_logo_dark_small: '',
    site_name: '',
    other_faviconFile: ''
  }
}
const NOVA_SLOTS = { 'module-132.0': { type: 'image', value: 'images/joomlart/logo/item-2.png' } }

test('T4 JA Nova pair: one siteSettings set with site_logo and site_logo_dark, one contract apply on module-132.0', async () => {
  const site = fakeJoomla({ profiles: NOVA, slots: NOVA_SLOTS })
  const result = await brand(
    site,
    { tag: 'quickstart/ja-nova/j6', version: '1.0.4' },
    {
      name: 'Tamq',
      logo: { light: await png(600, 200), dark: await png(600, 200, { r: 240, g: 240, b: 240, alpha: 1 }) },
      favicon: await png(512, 512)
    }
  )
  const sets = site.of('template.siteSettings', 'set')
  assert.equal(sets.length, 1)
  assert.equal(sets[0].params.template, 'ja_nova')
  assert.equal(sets[0].params.apply_id, 'brand-1')
  const nova = site.state.profiles.default
  assert.match(nova.site_logo, /^images\/tracy-brand\/logo-light-/)
  assert.match(nova.site_logo_dark, /^images\/tracy-brand\/logo-dark-/)
  assert.match(nova.other_faviconFile, /^images\/tracy-brand\/favicon-/)
  const applies = site.of('content.contract', 'apply')
  assert.equal(applies.length, 1)
  const footer = applies[0].params.changes['module-132.0']
  assert.equal(footer, nova.site_logo_dark)
  const size = await sizeOfUpload(site, footer)
  assert.ok(Math.abs(size.width / size.height - 161 / 49) <= 0.02)
  assert.deepEqual([...result.written].sort(), ['favicon', 'footer-logo', 'logo', 'logo-dark', 'sitename'])
})

test('T4 JA Essence 1.0.1: the header logo is made as tall as the demo one (40 px), since its CSS lets a logo reach 100 px', async () => {
  // Measured 08/10/2026 on dev (tamq-7q-ess): the customer's 1200 x 364 logo showed at 330 x 100 where the demo's is 132 x 40.
  // The template holds .navbar-brand img.logo-img to max-height 100px, so the picture's own height decides (`logoHeight`).
  const logo = {
    site_logo: 'images/joomlart/logo/logo.png',
    site_logo_small: '',
    site_logo_dark: '',
    site_logo_dark_small: '',
    site_name: '',
    other_faviconFile: ''
  }
  const site = fakeJoomla({
    template: 'ja_essence',
    profiles: { default: { ...logo }, 'home-4': { ...logo } },
    slots: { 'module-121.1': { type: 'image', value: 'images/joomlart/logo/item-1.png' } }
  })
  await brand(
    site,
    { tag: 'quickstart/ja-essence/j6', version: '1.0.1' },
    {
      name: 'Tamq',
      logo: { light: await png(1200, 364), dark: await png(1200, 364, { r: 240, g: 240, b: 240, alpha: 1 }) }
    }
  )
  const header = site.state.profiles.default.site_logo
  assert.match(header, /^images\/tracy-brand\/logo-light-/)
  assert.equal((await sizeOfUpload(site, header)).height, 40)
  assert.equal((await sizeOfUpload(site, site.state.profiles.default.site_logo_dark)).height, 40)
})

test('T4 templates whose CSS sets no desktop cap on the header logo: it is made as tall as the demo one', async () => {
  // Read from each release's compiled css/template.css (08/10/2026): JA Resort caps .logo-img only below 992px (36px) and
  // JA Impact only under .logo-control, which a site profile without a small logo never gets; T4 prints the logo at its
  // own size (getimagesize in element/logo.php), so the demo logos show at 168 x 48 and 426 x 123, and a customer's
  // 1200 x 364 one at full size. JA Nova (48px) and JA Vega (40px) cap it in CSS and keep the full picture.
  const logo = {
    site_logo: 'images/joomlart/logo/logo.png',
    site_logo_small: '',
    site_logo_dark: '',
    site_logo_dark_small: '',
    site_name: '',
    other_faviconFile: ''
  }
  for (const [tag, version, template, profiles, height] of [
    ['quickstart/ja-resort/j6', '1.0.1', 'ja_resort', ['default'], 48],
    ['quickstart/ja-impact/j6', '1.0.0', 'ja_impact', ['default', 'Blog', 'home-magz'], 123],
    ['quickstart/ja-nova/j6', '1.0.4', 'ja_nova', ['default'], null],
    ['quickstart/ja-vega/j6', '1.0.3', 'ja_vega', ['default'], null]
  ]) {
    const site = fakeJoomla({
      template,
      profiles: Object.fromEntries(profiles.map((name) => [name, { ...logo }]))
    })
    await brand(
      site,
      { tag, version },
      {
        name: 'Tamq',
        logo: {
          light: await png(1200, 364),
          dark: await png(1200, 364, { r: 240, g: 240, b: 240, alpha: 1 })
        }
      }
    )
    const header = site.state.profiles.default.site_logo
    assert.match(header, /^images\/tracy-brand\/logo-/, tag)
    const made = (await sizeOfUpload(site, header)).height
    // null: the template caps the logo in CSS, so the full picture (padded to the frame, never scaled down) goes up.
    if (height === null) assert.ok(made >= 364, `${tag}: ${made}`)
    else assert.equal(made, height, tag)
  }
})

test('T4 on an older plugin: logo, favicon and share picture skipped as plugin too old, the name still written', async () => {
  const site = fakeJoomla({ component: '0.22.0', profiles: NOVA, slots: NOVA_SLOTS })
  const result = await brand(
    site,
    { tag: 'quickstart/ja-nova/j6', version: '1.0.4' },
    { name: 'Tamq', logo: { light: await png(600, 200) }, favicon: await png(512, 512) }
  )
  assert.equal(site.state.sitename, 'Tamq')
  // Nothing reaches the template settings of an older plugin, and the share card is not even uploaded.
  assert.equal(site.of('template.siteSettings', 'set').length, 0)
  assert.ok(!site.of('media.upload').some((c) => /share/.test(c.params.path)))
  assert.deepEqual(
    result.skipped.filter((s) => s.reason === 'plugin too old').map((s) => s.where),
    ['logo', 'favicon', 'share']
  )
})

test('T4 plugin that answers bad_action for template.siteSettings: skipped as plugin too old', async () => {
  const site = fakeJoomla({ component: null, profiles: NOVA })
  const result = await brand(
    site,
    { tag: 'quickstart/ja-nova/j6', version: '1.0.4' },
    { favicon: await png(512, 512) }
  )
  assert.deepEqual(result.skipped, [{ where: 'favicon', reason: 'plugin too old' }])
})

test('T4 file names are new every run and never a template file', async () => {
  const pack = async () => ({ logo: { light: await png(600, 200) } })
  const site = fakeJoomla({ profiles: NOVA, slots: NOVA_SLOTS })
  await brand(site, { tag: 'quickstart/ja-nova/j6', version: '1.0.4' }, await pack(), 'brand-100')
  const first = site.state.profiles.default.site_logo
  await brand(site, { tag: 'quickstart/ja-nova/j6', version: '1.0.4' }, await pack(), 'brand-200')
  const second = site.state.profiles.default.site_logo
  assert.notEqual(first, second)
  for (const path of [first, second]) assert.ok(!path.startsWith('images/joomlart/'))
})

test('T4 JA Spa: the overlay logo and the logo-light profile take the dark logo', async () => {
  const site = fakeJoomla({
    template: 'ja_spa',
    profiles: {
      default: {
        site_logo: 'images/joomlart/logo/logo-color.png',
        site_logo_2: 'images/joomlart/logo/logo-light.png'
      },
      'logo-light': {
        site_logo: 'images/joomlart/logo/logo-light.png',
        site_logo_2: 'images/joomlart/logo/logo-light.png'
      }
    }
  })
  await brand(
    site,
    { tag: 'quickstart/ja-spa/j6', version: '1.0.1' },
    { logo: { light: await png(600, 200), dark: await png(600, 201) } }
  )
  const { default: main, 'logo-light': overlay } = site.state.profiles
  assert.match(main.site_logo, /logo-light-/)
  assert.match(main.site_logo_2, /logo-dark-/)
  assert.match(overlay.site_logo, /logo-dark-/)
  assert.match(overlay.site_logo_2, /logo-dark-/)
})

test('T4 JA Podcast: the small variants are cleared, so the new logo shows on phones too', async () => {
  const site = fakeJoomla({
    template: 'ja_podcast',
    profiles: {
      default: {
        site_logo: 'images/joomlart/others/Logo.png',
        site_logo_small: 'images/joomlart/others/logo-mobile.png',
        site_logo_dark: 'images/joomlart/others/Logo-light.png',
        site_logo_dark_small: 'images/joomlart/others/logo-mobile.png'
      }
    }
  })
  await brand(
    site,
    { tag: 'quickstart/ja-podcast/j6', version: '1.0.1' },
    { logo: { light: await png(600, 200) } }
  )
  const p = site.state.profiles.default
  assert.equal(p.site_logo_small, '')
  assert.equal(p.site_logo_dark_small, '')
  // Only the light logo was given: the dark-mode slot is emptied rather than left with the demo logo.
  assert.equal(p.site_logo_dark, '')
})

test('T4 a profile carrying the demo name takes the customer name; no logo given leaves the logos alone', async () => {
  const site = fakeJoomla({
    template: 'ja_kinetic',
    profiles: {
      default: { site_logo: '', site_name: 'Kinetic' },
      Blog: { site_logo: 'images/demo/misc/t4-blank-logo.png', site_name: '' }
    }
  })
  await brand(site, { tag: 'quickstart/ja-kinetic/j6', version: '1.0.2' }, { name: 'Tamq' })
  assert.equal(site.state.profiles.default.site_name, 'Tamq')
  assert.equal(site.state.profiles.Blog.site_logo, 'images/demo/misc/t4-blank-logo.png')
  assert.equal(site.of('content.contract', 'apply').length, 0)
})

test('apply.revert of every recorded id puts a T4 site back as it was', async () => {
  const site = fakeJoomla({ profiles: NOVA, slots: NOVA_SLOTS })
  const before = structuredClone({ profiles: site.state.profiles, slots: site.state.slots })
  await brand(
    site,
    { tag: 'quickstart/ja-nova/j6', version: '1.0.4' },
    { logo: { light: await png(600, 200) } },
    'brand-9'
  )
  const ids = [...new Set(site.calls.map((c) => c.params?.apply_id).filter(Boolean))]
  for (const id of ids.reverse()) await site.door({ action: 'apply.revert', params: { apply_id: id } })
  assert.deepEqual({ profiles: site.state.profiles, slots: site.state.slots }, before)
  assert.equal(site.state.files.size, 0)
})

test('a Joomla release Tracy has no profile for: logo and favicon are said, nothing is uploaded', async () => {
  const site = fakeJoomla({ profiles: NOVA })
  const result = await brand(site, null, {
    logo: { light: await png(600, 200) },
    favicon: await png(512, 512)
  })
  assert.deepEqual(
    result.skipped.map((s) => s.where),
    ['logo', 'favicon', 'share']
  )
  assert.equal(site.of('media.upload').length, 0)
})

test('T27 T4 a profile with no dark spot never gets site_logo_dark, even with a dark logo given', async () => {
  const site = fakeJoomla({
    template: 'ja_prodex',
    profiles: { default: { site_logo: 'images/joomlart/logo.png', site_name: '' } }
  })
  const result = await brand(
    site,
    { tag: 'quickstart/ja-prodex/j6', version: '1.0.0' },
    { logo: { light: await png(600, 200), dark: await png(600, 200, { r: 240, g: 240, b: 240, alpha: 1 }) } }
  )
  const p = site.state.profiles.default
  assert.match(p.site_logo, /^images\/tracy-brand\/logo-light-/)
  assert.ok(!Object.hasOwn(p, 'site_logo_dark'))
  assert.ok(!site.of('media.upload').some((c) => /logo-dark-/.test(c.params.path)))
  assert.deepEqual(
    result.skipped.filter((s) => s.where === 'logo-dark').map((s) => s.reason),
    ['this design does not show a dark-background logo yet']
  )
})

test('T27 T4 JA Nova with only the light logo: no dark logo is uploaded, the dark spot is emptied (Q7)', async () => {
  const site = fakeJoomla({ profiles: NOVA, slots: NOVA_SLOTS })
  await brand(
    site,
    { tag: 'quickstart/ja-nova/j6', version: '1.0.4' },
    { logo: { light: await png(600, 200) } }
  )
  const nova = site.state.profiles.default
  assert.match(nova.site_logo, /^images\/tracy-brand\/logo-light-/)
  assert.equal(nova.site_logo_dark, '')
  assert.ok(!site.of('media.upload').some((c) => /logo-dark-/.test(c.params.path)))
})

test('T4 JA Resort given only the dark logo its Logo question asks: every logo spot shows it, nothing is skipped', async () => {
  // JA Resort 1.0.1 has one logo key (etc/site/default.json site_logo) for the header, the footnav and the off-canvas,
  // all on its green bands, and its dark-mode switch is off: the dark-background logo is the only one it ever shows.
  const site = fakeJoomla({
    template: 'ja_resort',
    profiles: {
      default: { site_logo: 'images/joomlart/logo/logo.png', site_logo_small: '', site_name: '' }
    }
  })
  const result = await brand(
    site,
    { tag: 'quickstart/ja-resort/j6', version: '1.0.1' },
    { name: 'Tamq', logo: { dark: await png(600, 200, { r: 240, g: 240, b: 240, alpha: 1 }) } }
  )
  const p = site.state.profiles.default
  assert.match(p.site_logo, /^images\/tracy-brand\/logo-dark-/)
  assert.ok(!Object.hasOwn(p, 'site_logo_dark'))
  assert.deepEqual(
    result.skipped.filter((s) => s.where.startsWith('logo')),
    [],
    'the dark logo is used, so no logo spot is said to be skipped'
  )
})

// ---- A blank Logo answer keeps the template's logo (LOGO-4 dropped 09/10/2026) ----------------------------------------

/** The brand step fed a brief from before LOGO-4 was dropped: no logo, `logoAsked` true. It must change no logo. */
const fromBrief = (site, quickstart, version) =>
  createSiteBrand({
    applyFor: () => throughDoor(site.door),
    readFile: async () => null,
    versionOf: async () => version
  })(
    {
      siteKey: 's.tracy.test',
      platform: 'joomla',
      quickstart,
      email: 'owner@example.test',
      brief: { about: 'x', brand: { logo: null, favicon: null, logoAsked: true } },
      normalized: { name: 'Tamq Bakery' },
      note: () => {}
    },
    { applyId: 'brand-1' }
  )

test('a blank Logo answer on T3 keeps every style logo as released', async () => {
  const site = fakeJoomla({ styles: SMALLBIZ, template: 'ja_smallbiz', framework: 't3' })
  const before = [10, 11, 12, 13].map((id) => paramsOf(site, id).logotype)
  await fromBrief(site, 'quickstart/ja-smallbiz/j6', '1.0.0')
  assert.deepEqual(
    [10, 11, 12, 13].map((id) => paramsOf(site, id).logotype),
    before
  )
  assert.equal(paramsOf(site, 11).logoimage, 'images/joomlart/logo/car-logo.jpg')
  assert.equal(site.of('media.upload').length, 0)
})

test('a blank Logo answer on T4 keeps every logo key and the footer slot as released', async () => {
  const site = fakeJoomla({
    profiles: {
      ...NOVA,
      Blog: {
        site_logo: 'images/joomlart/logo/item-1.png',
        site_logo_small: 'images/x-sm.png',
        site_name: 'Nova'
      }
    },
    slots: NOVA_SLOTS
  })
  const logosBefore = structuredClone(site.state.profiles)
  await fromBrief(site, 'quickstart/ja-nova/j6', '1.0.4')
  for (const [name, profile] of Object.entries(logosBefore))
    for (const key of [
      'site_logo',
      'site_logo_dark',
      'site_logo_2',
      'site_logo_small',
      'site_logo_dark_small'
    ])
      assert.equal(site.state.profiles[name][key], profile[key], `${name}.${key}`)
  assert.equal(site.state.slots['module-132.0'].value, 'images/joomlart/logo/item-2.png')
  assert.equal(site.state.sitename, 'Tamq Bakery', 'the name is still written')
})

test('Q7 T4 JA Spa given only the light logo: the dark profile and the overlay logo are emptied, never left as the demo', async () => {
  const site = fakeJoomla({
    template: 'ja_spa',
    profiles: {
      default: {
        site_logo: 'images/joomlart/logo/logo-color.png',
        site_logo_2: 'images/joomlart/logo/logo-light.png'
      },
      'logo-light': {
        site_logo: 'images/joomlart/logo/logo-light.png',
        site_logo_2: 'images/joomlart/logo/logo-light.png'
      }
    }
  })
  await brand(
    site,
    { tag: 'quickstart/ja-spa/j6', version: '1.0.1' },
    { name: 'Tamq', logo: { light: await png(600, 200) } }
  )
  assert.match(site.state.profiles.default.site_logo, /^images\/tracy-brand\/logo-light-/)
  assert.equal(site.state.profiles.default.site_logo_2, '')
  assert.equal(site.state.profiles['logo-light'].site_logo, '')
  assert.equal(site.state.profiles['logo-light'].site_logo_2, '')
})

// The footer logo of JA Essence and JA Vogue is a Custom module image slot. From JA Essence 1.0.2 (and 1.0.3, 1.0.4, 1.0.5) and JA Vogue 1.0.3 the
// template prints that picture as a .d-light/.d-dark pair WHEN IT IS THE FILE OF site_logo (html/mod_custom/default.php,
// ja-products PR #23), so the footer follows the theme like the header. That holds only while the writer puts the very
// same uploaded file into the footer slot and into every light-header site_logo.
for (const [tag, version, folder, slot, profiles] of [
  [
    'quickstart/ja-essence/j6',
    '1.0.2',
    'ja_essence',
    'module-121.1',
    {
      default: { site_logo: '', site_logo_dark: '' },
      'home-4': {
        site_name: '',
        site_logo: 'images/joomlart/logo/item-2.png',
        site_logo_small: '',
        site_logo_dark: 'templates/ja_essence/images/item-2-dark.png'
      }
    }
  ],
  [
    'quickstart/ja-essence/j6',
    '1.0.3',
    'ja_essence',
    'module-121.1',
    {
      default: { site_logo: '', site_logo_dark: '' },
      'home-4': {
        site_name: '',
        site_logo: 'images/joomlart/logo/item-2.png',
        site_logo_small: '',
        site_logo_dark: 'templates/ja_essence/images/item-2-dark.png'
      }
    }
  ],
  [
    'quickstart/ja-essence/j6',
    '1.0.4',
    'ja_essence',
    'module-121.1',
    {
      default: { site_logo: '', site_logo_dark: '' },
      'home-4': {
        site_name: '',
        site_logo: 'images/joomlart/logo/item-2.png',
        site_logo_small: '',
        site_logo_dark: 'templates/ja_essence/images/item-2-dark.png'
      }
    }
  ],
  [
    'quickstart/ja-essence/j6',
    '1.0.5',
    'ja_essence',
    'module-121.1',
    {
      default: { site_logo: '', site_logo_dark: '' },
      'home-4': {
        site_name: '',
        site_logo: 'images/joomlart/logo/item-2.png',
        site_logo_small: '',
        site_logo_dark: 'templates/ja_essence/images/item-2-dark.png'
      }
    }
  ],
  [
    'quickstart/ja-vogue/j6',
    '1.0.3',
    'ja_vogue',
    'module-126.1',
    {
      default: {
        site_name: '',
        site_logo: 'images/joomlart/logo/item-1.svg',
        site_logo_small: '',
        site_logo_dark: 'templates/ja_vogue/images/logo-dark/item-1.svg'
      },
      'home-2': {
        site_name: '',
        site_logo: 'images/joomlart/logo/item-2.svg',
        site_logo_small: 'images/joomlart/logo/item-1.svg',
        site_logo_dark: 'templates/ja_vogue/images/logo-dark/item-2.svg',
        site_logo_dark_small: 'templates/ja_vogue/images/logo-dark/item-1.svg'
      },
      'home-6': {
        site_name: '',
        site_logo: 'images/joomlart/logo/item-3.svg',
        site_logo_small: '',
        site_logo_dark: 'images/joomlart/logo/item-3.svg'
      }
    }
  ]
])
  test(`${tag} ${version}: the footer slot holds the site_logo file, so the template pairs it with site_logo_dark`, async () => {
    const row = TEMPLATE_PROFILES.releases[tag]?.[version]
    assert.ok(row, `${tag} ${version} has a profile row of its own`)
    assert.equal(row.brandReady, true)
    assert.equal(row.footerSlot, slot)
    assert.match(row.note, /footer/i)
    assert.doesNotMatch(row.note, /one logo for both modes/)
    const site = fakeJoomla({
      template: folder,
      profiles,
      slots: { [slot]: { type: 'image', value: 'images/joomlart/logo/item-1.png' } }
    })
    const result = await brand(
      site,
      { tag, version },
      {
        logo: { light: await png(600, 200), dark: await png(600, 200, { r: 240, g: 240, b: 240, alpha: 1 }) }
      }
    )
    const footer = site.state.slots[slot].value
    assert.match(footer, /^images\/tracy-brand\/logo-light-/)
    assert.equal(site.state.profiles.default.site_logo, footer)
    assert.match(site.state.profiles.default.site_logo_dark, /^images\/tracy-brand\/logo-dark-/)
    assert.ok(result.written.includes('footer-logo'))
    assert.ok(!result.skipped.some((s) => s.where === 'logo-dark'))
  })

// ---- No logo of the business in a brief build (ticket #193): the name as text, never the demo's logo -----------------------

test('T4 brief build with no logo: every demo logo key is emptied so the name shows as text', async () => {
  const site = fakeJoomla({ profiles: NOVA })
  await brand(
    site,
    { tag: 'quickstart/ja-nova/j6', version: '1.0.4' },
    { name: 'Northgate Dental', textLogo: true }
  )
  const nova = site.state.profiles.default
  assert.equal(nova.site_logo, '')
  assert.equal(nova.site_logo_dark, '')
})

test('T4 without the brief build flag and no logo: the template logo stays as released', async () => {
  const site = fakeJoomla({ profiles: NOVA })
  await brand(site, { tag: 'quickstart/ja-nova/j6', version: '1.0.4' }, { name: 'Northgate Dental' })
  assert.equal(site.state.profiles.default.site_logo, 'images/joomlart/logo/item-1.png')
})
