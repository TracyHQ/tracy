/**
 * The "set the site's brand" step of Apply (plan `tasks/plan-ten-logo-favicon.md`, D1, D2, T10, T11): one seam,
 * `setSiteBrand`, and the per-CMS writers behind it, held against a fake Apply door that keeps what the site holds and
 * takes an `apply.revert` back the way the plugins do (every write's previous value, newest first).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { createSiteBrand, monogramOf, setSiteBrand } from '../src/sites/brief-engines/brand.js'
import { writeWordpressBrand } from '../src/sites/brief-engines/brand-wordpress.js'

const INK = { r: 20, g: 30, b: 40, alpha: 1 }
const png = (width, height) =>
  sharp({ create: { width, height, channels: 4, background: INK } })
    .png()
    .toBuffer()

/**
 * A site behind the Apply door: options by name, files by path, and a log per apply id of what each write replaced.
 * `refuse(call)` answers a refusal for the calls it names.
 */
function fakeSite({ options = {}, refuse = () => null, component = '0.22.0', sitename = 'JA Kinetic' } = {}) {
  const state = { options: structuredClone(options), files: new Map(), sitename }
  const log = new Map()
  const calls = []
  let attachment = 100
  const record = (id, undo) => {
    if (!log.has(id)) log.set(id, [])
    log.get(id).push(undo)
  }
  const door = async (call) => {
    calls.push(call)
    const { action, params } = call
    const refused = refuse(call)
    if (refused) return { ok: false, ...refused }
    if (action === 'info') return { ok: true, info: { component } }
    if (action === 'content.get' && params.kind === 'option') {
      if (!Object.hasOwn(state.options, params.key)) return { ok: false, error: 'not_found' }
      return { ok: true, item: { value: structuredClone(state.options[params.key]) } }
    }
    if (action === 'content.update' && params.kind === 'option') {
      const had = Object.hasOwn(state.options, params.key)
      const before = state.options[params.key]
      state.options[params.key] = params.fields.value
      record(params.apply_id, () => {
        if (had) state.options[params.key] = before
        else delete state.options[params.key]
      })
      return { ok: true }
    }
    if (action === 'media.upload') {
      if (state.files.has(params.path)) return { ok: true, path: params.path, attachment: 0 }
      attachment += 1
      state.files.set(params.path, attachment)
      record(params.apply_id, () => state.files.delete(params.path))
      return { ok: true, path: params.path, attachment }
    }
    if (action === 'site.identity' && params.operation === 'set') {
      const before = state.sitename
      state.sitename = params.fields.sitename
      record(params.apply_id, () => {
        state.sitename = before
      })
      return { ok: true, fields: { sitename: state.sitename } }
    }
    if (action === 'apply.revert') {
      for (const undo of (log.get(params.apply_id) ?? []).reverse()) undo()
      log.delete(params.apply_id)
      return { ok: true, reverted: true }
    }
    return { ok: false, error: 'bad_action', message: `unknown action: ${action}` }
  }
  return { state, calls, door }
}

const writes = (calls) => calls.filter((c) => !['info', 'content.get'].includes(c.action))

test('Tracy Base WordPress: two uploads, site_logo and site_icon, all under one apply id', async () => {
  const site = fakeSite({ options: { blogname: 'Bakery' } })
  const notes = []
  const result = await setSiteBrand({
    platform: 'wordpress',
    siteKey: 'bakery.tracy.test',
    release: { tag: 'tracy-base/wp7', version: '1.1.1' },
    pack: { name: 'Bakery', logo: { light: await png(600, 200) }, favicon: await png(512, 512) },
    call: site.door,
    applyId: 'brand-1',
    note: (n) => notes.push(n)
  })
  const w = writes(site.calls)
  // The logo, the favicon and the share card (D5).
  assert.equal(w.filter((c) => c.action === 'media.upload').length, 3)
  assert.deepEqual(new Set(w.map((c) => c.params.apply_id)), new Set(['brand-1']))
  assert.ok(w.every((c) => c.siteKey === 'bakery.tracy.test'))
  assert.equal(typeof site.state.options.site_logo, 'number')
  assert.equal(typeof site.state.options.site_icon, 'number')
  assert.notEqual(site.state.options.site_logo, site.state.options.site_icon)
  assert.deepEqual(result.written.sort(), ['share', 'site_icon', 'site_logo'])
  assert.deepEqual(result.skipped, [])
  assert.deepEqual(notes, [])
  // A new file name every time, named after the bytes.
  const paths = w.filter((c) => c.action === 'media.upload').map((c) => c.params.path)
  for (const path of paths)
    assert.match(path, /^wp-content\/uploads\/tracy-brand\/(logo|favicon|share)-[0-9a-f]{16}-/)
})

test('no favicon given: site_icon is not touched', async () => {
  const site = fakeSite({ options: { site_icon: 0 } })
  const result = await setSiteBrand({
    platform: 'wordpress',
    siteKey: 's',
    release: { tag: 'tracy-base/wp7', version: '1.1.1' },
    pack: { name: 'Bakery', logo: { light: await png(600, 200) } },
    call: site.door,
    applyId: 'brand-2',
    note: () => {}
  })
  assert.equal(site.state.options.site_icon, 0)
  assert.ok(!writes(site.calls).some((c) => c.params.key === 'site_icon'))
  assert.deepEqual(result.written, ['site_logo', 'share'])
})

test('Tracy Business keeps every other key of its identity option', async () => {
  const identity = { name: 'Northgate', slogan: 'Built to last', contact: { email: 'a@b.test', phone: '1' } }
  const site = fakeSite({ options: { tracy_site_identity: identity } })
  const result = await setSiteBrand({
    platform: 'wordpress',
    siteKey: 's',
    release: { tag: 'tracy-business/wp7', version: '1.3.2' },
    pack: { name: 'Tamq Bakery Test', logo: { light: await png(600, 200) } },
    call: site.door,
    applyId: 'brand-3',
    note: () => {}
  })
  const stored = site.state.options.tracy_site_identity
  assert.equal(stored.slogan, 'Built to last')
  assert.deepEqual(stored.contact, identity.contact)
  assert.equal(stored.name, 'Northgate')
  assert.equal(stored.legalName, 'Tamq Bakery Test')
  assert.equal(stored.monogram, 'TB')
  assert.match(stored.logo, /^wp-content\/uploads\/tracy-brand\/logo-/)
  assert.ok(result.written.includes('tracy_site_identity'))
})

test('Tracy Business with no logo still takes its legal name and monogram from the name', async () => {
  const site = fakeSite({ options: { tracy_site_identity: { site: { name: 'Northgate', logo: '' } } } })
  await setSiteBrand({
    platform: 'wordpress',
    siteKey: 's',
    release: { tag: 'tracy-business/wp7', version: '1.3.2' },
    pack: { name: 'Bakery' },
    call: site.door,
    applyId: 'brand-4',
    note: () => {}
  })
  // The group the theme reads first is the one written.
  assert.deepEqual(site.state.options.tracy_site_identity, {
    site: { name: 'Northgate', logo: '', legalName: 'Bakery', monogram: 'B' }
  })
  assert.ok(!site.calls.some((c) => c.action === 'media.upload'))
})

test('one refused write: the others still run, and the refusal is a skip with its reason', async () => {
  const site = fakeSite({
    refuse: (c) =>
      c.action === 'media.upload' && c.params.path.includes('/logo-') ? { error: 'write_failed' } : null
  })
  const notes = []
  const result = await setSiteBrand({
    platform: 'wordpress',
    siteKey: 's',
    release: { tag: 'tracy-base/wp7', version: '1.1.1' },
    pack: { name: 'Bakery', logo: { light: await png(600, 200) }, favicon: await png(512, 512) },
    call: site.door,
    applyId: 'brand-5',
    note: (n) => notes.push(n)
  })
  assert.deepEqual(result.written, ['site_icon', 'share'])
  assert.equal(result.skipped.length, 1)
  assert.equal(result.skipped[0].where, 'logo')
  assert.match(result.skipped[0].reason, /write_failed/)
  assert.equal(notes.length, 1)
})

test('a busy site is asked again before a write is given up', async () => {
  let busy = 2
  const site = fakeSite({
    refuse: (c) => (c.action === 'media.upload' && busy-- > 0 ? { error: 'writer_busy' } : null)
  })
  const result = await setSiteBrand({
    platform: 'wordpress',
    siteKey: 's',
    release: { tag: 'tracy-base/wp7', version: '1.1.1' },
    pack: { name: 'Bakery', favicon: await png(512, 512) },
    call: site.door,
    applyId: 'brand-6',
    note: () => {},
    sleep: async () => {}
  })
  assert.deepEqual(result.written, ['site_icon'])
})

test('apply.revert of the brand apply id takes every brand write back', async () => {
  const before = { tracy_site_identity: { name: 'Northgate', contact: { email: 'a@b.test' } }, site_icon: 0 }
  const site = fakeSite({ options: before })
  await setSiteBrand({
    platform: 'wordpress',
    siteKey: 's',
    release: { tag: 'tracy-business/wp7', version: '1.3.2' },
    pack: { name: 'Bakery', logo: { light: await png(600, 200) }, favicon: await png(512, 512) },
    call: site.door,
    applyId: 'brand-7',
    note: () => {}
  })
  assert.notDeepEqual(site.state.options, before)
  await site.door({ siteKey: 's', action: 'apply.revert', params: { apply_id: 'brand-7' } })
  assert.deepEqual(site.state.options, before)
  assert.equal(site.state.files.size, 0)
})

test('a design that does not show a logo yet: the options are written, and the customer is told', async () => {
  const site = fakeSite()
  const result = await setSiteBrand({
    platform: 'wordpress',
    siteKey: 's',
    release: { tag: 'quickstart/ja-nova/wp7', version: '1.1.9' },
    pack: { name: 'Bakery', logo: { light: await png(600, 200), dark: await png(600, 200) } },
    call: site.door,
    applyId: 'brand-8',
    note: () => {}
  })
  assert.deepEqual(result.written, ['site_logo', 'share'])
  assert.deepEqual(
    result.skipped.map((s) => [s.where, s.reason]),
    [
      ['logo', 'this design does not show a logo yet'],
      ['logo-dark', 'this design does not show a dark-background logo yet']
    ]
  )
})

test('a dark-only design takes the dark logo as its one logo', async () => {
  const site = fakeSite()
  const result = await setSiteBrand({
    platform: 'wordpress',
    siteKey: 's',
    release: { tag: 'quickstart/ja-vega/wp7', version: '1.1.11' },
    pack: { name: 'Bakery', logo: { dark: await png(600, 200) } },
    call: site.door,
    applyId: 'brand-9',
    note: () => {}
  })
  assert.deepEqual(result.written, ['site_logo', 'share'])
  assert.deepEqual(result.skipped, [])
})

test('a platform with no brand writer yet says so for each picture and writes nothing', async () => {
  const site = fakeSite()
  const result = await setSiteBrand({
    platform: 'shopify',
    siteKey: 's',
    release: null,
    pack: { name: 'Bakery', logo: { light: await png(600, 200) }, favicon: await png(512, 512) },
    call: site.door,
    applyId: 'brand-10',
    note: () => {}
  })
  assert.deepEqual(result.written, [])
  assert.deepEqual(
    result.skipped.map((s) => s.where),
    ['logo', 'favicon']
  )
  assert.equal(site.calls.length, 0)
})

test('the monogram is the first letters of the first two words', () => {
  assert.equal(monogramOf('Tamq Bakery Test'), 'TB')
  assert.equal(monogramOf('  bakery  '), 'B')
  assert.equal(monogramOf('123 Café Ölberg'), 'CÖ')
  assert.equal(monogramOf(''), '')
})

test('createSiteBrand: reads the files of this site only, records the apply id, says the dropped ids', async () => {
  const site = fakeSite()
  const logo = await png(600, 200)
  const files = {
    'id-logo': { bytes: logo, role: 'logo', siteKey: 's.tracy.test' },
    'id-fav': { bytes: await png(512, 512), role: 'favicon', siteKey: 'other.tracy.test' }
  }
  const applied = []
  const notes = []
  const brand = createSiteBrand({
    applyFor: (email) => {
      assert.equal(email, 'owner@example.test')
      return site.door
    },
    readFile: async (id) => files[id] ?? null,
    versionOf: async () => '1.1.1'
  })
  const result = await brand(
    {
      siteKey: 's.tracy.test',
      platform: 'wordpress',
      quickstart: 'tracy-base/wp7',
      email: 'owner@example.test',
      brief: {
        about: 'x',
        brand: { logo: { single: 'id-logo' }, favicon: 'id-fav' },
        brandNotes: ['a logo id was not yours']
      },
      normalized: { name: 'Bakery' },
      applied: (id) => applied.push(id),
      note: (n) => notes.push(n)
    },
    { applyId: 'brand-11' }
  )
  assert.deepEqual(result.written, ['site_logo', 'share'])
  assert.deepEqual(applied, ['brand-11', 'brand-11', 'brand-11', 'brand-11'])
  assert.ok(notes.includes('a logo id was not yours'))
  assert.ok(notes.some((n) => /favicon/.test(n)))
})
test('Joomla: plugin 0.22.0 or later gets one site.identity with the name', async () => {
  const site = fakeSite({ component: '0.22.0' })
  const result = await setSiteBrand({
    platform: 'joomla',
    siteKey: 's',
    release: { tag: 'quickstart/ja-kinetic/j6', version: '1.0.2' },
    pack: { name: 'Tamq Bakery Test' },
    call: site.door,
    applyId: 'brand-12',
    note: () => {}
  })
  const sets = site.calls.filter((c) => c.action === 'site.identity')
  assert.equal(sets.length, 1)
  assert.deepEqual(sets[0].params, {
    apply_id: 'brand-12',
    operation: 'set',
    fields: { sitename: 'Tamq Bakery Test' }
  })
  assert.equal(site.state.sitename, 'Tamq Bakery Test')
  assert.deepEqual(result.written, ['sitename'])
})

test('Joomla: an older plugin is skipped as too old, nothing is written', async () => {
  const site = fakeSite({ component: '0.19.1' })
  const result = await setSiteBrand({
    platform: 'joomla',
    siteKey: 's',
    release: { tag: 'quickstart/ja-voyara/j6', version: '1.0.3' },
    pack: { name: 'Tamq Bakery Test' },
    call: site.door,
    applyId: 'brand-13',
    note: () => {}
  })
  assert.ok(!site.calls.some((c) => c.action === 'site.identity'))
  assert.deepEqual(result.written, [])
  assert.deepEqual(result.skipped, [{ where: 'sitename', reason: 'plugin too old' }])
})

test('Joomla: a plugin that does not know the action is skipped as too old', async () => {
  const site = fakeSite({ component: null })
  const result = await setSiteBrand({
    platform: 'joomla',
    siteKey: 's',
    release: null,
    pack: { name: 'Bakery' },
    call: async (c) =>
      c.action === 'site.identity'
        ? { ok: false, error: 'bad_action', message: 'unknown action: site.identity' }
        : site.door(c),
    applyId: 'brand-14',
    note: () => {}
  })
  assert.deepEqual(result.skipped, [{ where: 'sitename', reason: 'plugin too old' }])
})

test('Joomla: a logo and favicon are said to wait, and the name is still written', async () => {
  const site = fakeSite({ component: '0.22.0' })
  const result = await setSiteBrand({
    platform: 'joomla',
    siteKey: 's',
    release: null,
    pack: { name: 'Bakery', logo: { light: await png(600, 200) }, favicon: await png(512, 512) },
    call: site.door,
    applyId: 'brand-15',
    note: () => {}
  })
  assert.deepEqual(result.written, ['sitename'])
  assert.deepEqual(
    result.skipped.map((s) => s.where),
    ['logo', 'favicon', 'share']
  )
  assert.ok(!site.calls.some((c) => c.action === 'media.upload'))
})

test('the skip of a platform without a writer names it as the customer reads it', async () => {
  const notes = []
  await setSiteBrand({
    platform: 'shopify',
    siteKey: 's',
    release: null,
    pack: { favicon: await png(512, 512) },
    call: async () => ({ ok: true }),
    applyId: 'brand-16',
    note: (n) => notes.push(n)
  })
  assert.deepEqual(notes, ['favicon: a shopify site does not take a favicon from Tracy yet'])
})

// ---- T27: the dark-background logo on WordPress ---------------------------------------------------------------------

/**
 * The WordPress writer behind the same fake door, with a profile row of the test's own: no shipped row reads
 * `tracy_logo_dark` until a theme is released with it (T28, T29).
 */
async function wordpressBrand(site, profile, logo) {
  const result = { written: [], skipped: [] }
  const call = (action, params) =>
    site.door({ siteKey: 's', action, params: { apply_id: 'brand-27', ...params } })
  await writeWordpressBrand({
    siteKey: 's',
    prepared: { name: 'Bakery', logo },
    profile,
    tag: 'quickstart/ja-nova/wp7',
    applyId: 'brand-27',
    stamp: 'brand-27',
    write: async (action, params) => {
      const answer = await call(action, params)
      if (answer?.ok === false) throw new Error(answer.error)
      return answer
    },
    read: call,
    wrote: (where) => result.written.push(where),
    skip: (where, reason) => result.skipped.push({ where, reason })
  })
  return result
}
/** The media path an option's attachment id was uploaded at. */
const pathOf = (site, id) => [...site.state.files].find(([, attachment]) => attachment === id)?.[0]

test('T27 WordPress pair on a theme that reads it: site_logo is the light logo, tracy_logo_dark the dark one', async () => {
  const site = fakeSite()
  const profile = { logos: 'pair', brandReady: true, faviconReady: true, darkLogo: true }
  const result = await wordpressBrand(site, profile, {
    light: await png(600, 200),
    dark: await png(600, 200)
  })
  assert.deepEqual(result.written.sort(), ['site_logo', 'tracy_logo_dark'])
  assert.deepEqual(result.skipped, [])
  assert.match(pathOf(site, site.state.options.site_logo), /\/logo-[0-9a-f]{16}-/)
  assert.match(pathOf(site, site.state.options.tracy_logo_dark), /\/logo-dark-[0-9a-f]{16}-/)
  await site.door({ siteKey: 's', action: 'apply.revert', params: { apply_id: 'brand-27' } })
  assert.deepEqual(site.state.options, {})
  assert.equal(site.state.files.size, 0)
})

test('T27 WordPress with only the light logo: no dark key is written, the theme shows the name (Q7)', async () => {
  const site = fakeSite()
  const profile = { logos: 'pair', brandReady: true, faviconReady: true, darkLogo: true }
  const result = await wordpressBrand(site, profile, { light: await png(600, 200) })
  assert.deepEqual(result.written, ['site_logo'])
  assert.deepEqual(result.skipped, [])
  assert.ok(!Object.hasOwn(site.state.options, 'tracy_logo_dark'))
  assert.equal(site.calls.filter((c) => c.action === 'media.upload').length, 1)
})

test('T27 WordPress theme that does not read a dark logo: nothing is uploaded for it, and the skip says why', async () => {
  const site = fakeSite()
  const profile = { logos: 'pair', brandReady: true, faviconReady: true }
  const result = await wordpressBrand(site, profile, {
    light: await png(600, 200),
    dark: await png(600, 200)
  })
  assert.deepEqual(result.written, ['site_logo'])
  assert.ok(!Object.hasOwn(site.state.options, 'tracy_logo_dark'))
  assert.equal(site.calls.filter((c) => c.action === 'media.upload').length, 1)
  assert.deepEqual(result.skipped, [
    { where: 'logo-dark', reason: 'this design does not show a dark-background logo yet' }
  ])
})

test('T27 WordPress dark-only design: the dark logo is the one logo, never also tracy_logo_dark', async () => {
  const site = fakeSite()
  const profile = { logos: 'dark', brandReady: true, faviconReady: true, darkLogo: true }
  const result = await wordpressBrand(site, profile, { dark: await png(600, 200) })
  assert.deepEqual(result.written, ['site_logo'])
  assert.ok(!Object.hasOwn(site.state.options, 'tracy_logo_dark'))
})

// ---- A blank Logo answer keeps the template's logo (LOGO-4 dropped 09/10/2026) ----------------------------------------

/**
 * The brand step fed a brief as `briefOfPress` wrote it before LOGO-4 was dropped: no logo given, and `logoAsked`
 * saying the Logo question was on screen. A build queued then still carries that brief, so the step must read it as
 * "no answer" and leave the template's logo exactly as released.
 */
const fromBrief = (site, quickstart, version, brandOfBrief) =>
  createSiteBrand({
    applyFor: () => site.door,
    readFile: async () => null,
    versionOf: async () => version
  })(
    {
      siteKey: 's.tracy.test',
      platform: 'wordpress',
      quickstart,
      email: 'owner@example.test',
      brief: { about: 'x', brand: brandOfBrief },
      normalized: { name: 'Tamarind Bakery' },
      note: () => {}
    },
    { applyId: 'brand-blank' }
  )

test('a blank Logo answer on JA Essence WP keeps the demo logo and dark logo (no name as text)', async () => {
  const site = fakeSite({ options: { site_logo: 826, tracy_logo_dark: 65 } })
  await fromBrief(site, 'quickstart/ja-essence/wp7', '1.0.10', { logo: null, favicon: null, logoAsked: true })
  assert.equal(site.state.options.site_logo, 826)
  assert.equal(site.state.options.tracy_logo_dark, 65)
  assert.ok(!writes(site.calls).some((c) => ['site_logo', 'tracy_logo_dark'].includes(c.params?.key)))
})

test('a blank Logo answer on Tracy Business WP keeps the identity logo; the name and monogram still change', async () => {
  const site = fakeSite({
    options: {
      site_logo: 12,
      tracy_site_identity: { site: { name: 'Northgate', logo: 'wp-content/demo.svg' } }
    }
  })
  await fromBrief(site, 'tracy-business/wp7', '1.3.4', { logo: null, favicon: null, logoAsked: true })
  assert.equal(site.state.options.site_logo, 12)
  assert.equal(site.state.options.tracy_site_identity.site.logo, 'wp-content/demo.svg')
  assert.equal(site.state.options.tracy_site_identity.site.legalName, 'Tamarind Bakery')
})

test('a logo id that could not be read keeps the template logo too', async () => {
  const site = fakeSite({ options: { site_logo: 56 } })
  await fromBrief(site, 'tracy-base/wp7', '1.1.1', { logo: { single: 'gone' }, favicon: null })
  assert.equal(site.state.options.site_logo, 56)
})

test('Q7 WordPress darkLogo theme given only a light logo: the demo dark logo is taken off, the dark spot shows the name', async () => {
  const site = fakeSite({ options: { site_logo: 826, tracy_logo_dark: 65 } })
  const result = await setSiteBrand({
    platform: 'wordpress',
    siteKey: 's',
    release: { tag: 'quickstart/ja-nova/wp7', version: '1.1.10' },
    pack: { name: 'Bakery', logo: { light: await png(600, 200) } },
    call: site.door,
    applyId: 'brand-q7',
    note: () => {}
  })
  assert.equal(site.state.options.tracy_logo_dark, 0)
  assert.notEqual(site.state.options.site_logo, 826)
  assert.deepEqual(result.written.sort(), ['share', 'site_logo', 'tracy_logo_dark'])
  assert.equal(site.calls.filter((c) => c.action === 'media.upload').length, 2)
  await site.door({ siteKey: 's', action: 'apply.revert', params: { apply_id: 'brand-q7' } })
  assert.deepEqual(site.state.options, { site_logo: 826, tracy_logo_dark: 65 }, 'one undo takes it back')
})

test('Q7 WordPress darkLogo theme with no demo dark logo: nothing written for it', async () => {
  const site = fakeSite({ options: { tracy_logo_dark: 0 } })
  const profile = { logos: 'pair', brandReady: true, faviconReady: true, darkLogo: true }
  const result = await wordpressBrand(site, profile, { light: await png(600, 200) })
  assert.deepEqual(result.written, ['site_logo'])
})

test('D1 createSiteBrand: only a name the customer gave turns the site name on in Joomla page titles', async () => {
  /** A Joomla site on plugin 0.24.5 that keeps what `site.identity` sets; no menu, no template. */
  const joomla = () => {
    const fields = {}
    const door = async ({ action, params }) => {
      if (action === 'info') return { ok: true, info: { component: '0.24.5' } }
      if (action === 'site.identity' && params.operation === 'set') {
        Object.assign(fields, params.fields)
        return { ok: true, fields }
      }
      if (action === 'content.list') return { ok: true, items: [] }
      return { ok: false, error: 'bad_action', message: `unknown action: ${action}` }
    }
    return { fields, door }
  }
  const run = async (normalized) => {
    const site = joomla()
    const brand = createSiteBrand({
      applyFor: () => site.door,
      readFile: async () => null,
      versionOf: async () => null
    })
    await brand(
      {
        siteKey: 'j.tracy.test',
        platform: 'joomla',
        quickstart: null,
        email: 'owner@example.test',
        brief: { about: 'x', brand: {} },
        normalized,
        note: () => {}
      },
      { applyId: 'brand-d1' }
    )
    return site.fields
  }
  assert.deepEqual(await run({ name: 'Golden Crust', nameFrom: 'answer' }), {
    sitename: 'Golden Crust',
    sitename_pagetitles: 2
  })
  assert.deepEqual(await run({ name: 'Golden Crust', nameFrom: 'text' }), {
    sitename: 'Golden Crust',
    sitename_pagetitles: 2
  })
  // Made from the site address, or the template's own standing in for it: no answer, so the site keeps the template's
  // name and page titles exactly (TCH #1013, 13/10/2026: every template came out named after its address).
  assert.deepEqual(await run({ name: 'Golden Crust', nameFrom: 'label' }), {})
  assert.deepEqual(await run({ name: 'JA Essence', nameFrom: 'template' }), {})
})
