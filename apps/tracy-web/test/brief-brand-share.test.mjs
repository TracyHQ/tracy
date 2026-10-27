/**
 * The share picture of a site (TCH #1013, D5): the customer's logo on a 1200 × 630 PNG card (`brand-share-card.js`),
 * written where each CMS's plugin prints og:image from (`brand-share.js`): WordPress option `tracy_share_image`
 * (Claude Cowork for WordPress 0.18.5), Joomla `template.siteSettings` `other_shareImage` on T4 and without it (Claude
 * Cowork for Joomla 0.24.5). No logo, no write; an older plugin is skipped before anything is uploaded.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { setSiteBrand } from '../src/sites/brief-engines/brand.js'
import { writeJoomlaShare, writeWordpressShare } from '../src/sites/brief-engines/brand-share.js'
import { SHARE_CARD, shareCardOf, shareLogoOf } from '../src/sites/brief-engines/brand-share-card.js'

const RED = { r: 200, g: 20, b: 20, alpha: 1 }
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }
/** A logo: a red bar in the middle of a transparent picture. */
const logo = async (width = 900, height = 300) =>
  sharp({ create: { width, height, channels: 4, background: CLEAR } })
    .composite([
      {
        input: await sharp({
          create: {
            width: Math.round(width / 2),
            height: Math.round(height / 2),
            channels: 4,
            background: RED
          }
        })
          .png()
          .toBuffer(),
        gravity: 'centre'
      }
    ])
    .png()
    .toBuffer()
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 10"><rect x="10" y="2" width="20" height="6" fill="#c81414"/></svg>'
)

/** The colour of one pixel of a PNG. */
async function pixel(png, x, y) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  const at = (y * info.width + x) * info.channels
  return [...data.subarray(at, at + 3)]
}

test('shareCardOf: no logo, no card', async () => {
  assert.equal(await shareCardOf(undefined), null)
  assert.equal(await shareCardOf({}), null)
  assert.equal(await shareCardOf({ light: new Uint8Array(0) }), null)
  assert.equal(await shareCardOf({ single: Buffer.from('not a picture') }), null)
})

test('shareCardOf: the logo centred on a 1200 × 630 PNG, a transparent logo on white', async () => {
  const card = await shareCardOf({ light: await logo() })
  const meta = await sharp(card).metadata()
  assert.deepEqual([meta.format, meta.width, meta.height], ['png', SHARE_CARD.width, SHARE_CARD.height])
  assert.deepEqual(await pixel(card, 5, 5), [255, 255, 255], 'the corner is the plain background')
  assert.deepEqual(await pixel(card, 600, 315), [200, 20, 20], 'the logo is in the middle')
})

test('shareCardOf: the one logo or the light one first; a dark-only logo goes on a dark card', async () => {
  const light = await logo()
  const dark = await logo()
  assert.equal(shareLogoOf({ light, dark })?.bytes, light)
  assert.equal(shareLogoOf({ single: dark, light })?.bytes, dark)
  const card = await shareCardOf({ dark })
  const [r, g, b] = await pixel(card, 5, 5)
  assert.ok(r < 40 && g < 40 && b < 40, `a dark card, got ${[r, g, b]}`)
})

test('shareCardOf: a very wide logo fits inside the margin; an SVG logo comes out a PNG', async () => {
  const wide = await shareCardOf({ single: await logo(4000, 400) })
  assert.deepEqual(await pixel(wide, 100, 315), [255, 255, 255], 'the margin stays clear')
  const fromSvg = await shareCardOf({ single: SVG })
  assert.equal((await sharp(fromSvg).metadata()).format, 'png')
  assert.deepEqual(await pixel(fromSvg, 600, 315), [200, 20, 20])
})

/** A WordPress or Joomla site behind the Apply door: options, files, the template's site settings, and the undo log. */
function fakeSite({ component = '0.18.5', refuse = () => null } = {}) {
  const state = { options: {}, files: new Map(), settings: {} }
  const log = new Map()
  const calls = []
  let attachment = 400
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
    if (action === 'content.get') return { ok: false, error: 'not_found' }
    if (action === 'media.upload') {
      attachment += 1
      state.files.set(params.path, attachment)
      record(params.apply_id, () => state.files.delete(params.path))
      return { ok: true, path: params.path, attachment }
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
    if (action === 'template.siteSettings' && params.operation === 'set') {
      const before = { ...state.settings }
      Object.assign(state.settings, params.fields)
      record(params.apply_id, () => {
        state.settings = before
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
  return { state, calls, door }
}

/** The writer's input around a fake site, as `setSiteBrand` hands it. */
function inputFor(site, { share, profile = null }) {
  const written = []
  const skipped = []
  const write = async (action, params) => {
    const answer = await site.door({ siteKey: 's', action, params: { apply_id: 'brand-s', ...params } })
    if (answer?.ok === false) throw Object.assign(new Error(answer.error), { answer })
    return answer
  }
  return {
    written,
    skipped,
    input: {
      siteKey: 's',
      prepared: share ? { share } : {},
      profile,
      tag: null,
      applyId: 'brand-s',
      stamp: 'brand-s',
      write,
      read: (action, params) => site.door({ siteKey: 's', action, params }),
      wrote: (where) => written.push(where),
      skip: (where, reason) => skipped.push([where, reason])
    }
  }
}

test('WordPress: the card is uploaded and named by tracy_share_image; apply.revert takes both back', async () => {
  const site = fakeSite({ component: '0.18.5' })
  const result = await setSiteBrand({
    platform: 'wordpress',
    siteKey: 's',
    release: { tag: 'tracy-base/wp7', version: '1.1.1' },
    pack: { name: 'Bakery', logo: { light: await logo() } },
    call: site.door,
    applyId: 'brand-w',
    note: () => {}
  })
  assert.ok(result.written.includes('share'))
  const shared = [...site.state.files].find(([path]) => /tracy-brand\/share-[0-9a-f]{16}-/.test(path))
  assert.ok(shared, 'the card has its own file')
  assert.equal(site.state.options.tracy_share_image, shared[1])
  const bytes = Buffer.from(site.calls.find((c) => c.params.path === shared[0]).params.content_b64, 'base64')
  assert.deepEqual(
    [(await sharp(bytes).metadata()).width, (await sharp(bytes).metadata()).height],
    [1200, 630]
  )
  await site.door({ siteKey: 's', action: 'apply.revert', params: { apply_id: 'brand-w' } })
  assert.equal(site.state.options.tracy_share_image, undefined)
  assert.equal(site.state.files.size, 0)
})

test('WordPress: no logo given, nothing is shared; a plugin older than 0.18.5 is skipped before any upload', async () => {
  const none = fakeSite()
  const result = await setSiteBrand({
    platform: 'wordpress',
    siteKey: 's',
    release: { tag: 'tracy-base/wp7', version: '1.1.1' },
    pack: { name: 'Bakery' },
    call: none.door,
    applyId: 'brand-n',
    note: () => {}
  })
  assert.deepEqual(result, { written: [], skipped: [] })
  assert.equal(none.calls.length, 0, 'not even a read')

  const old = fakeSite({ component: '0.18.4' })
  const t = inputFor(old, { share: await shareCardOf({ light: await logo() }) })
  await writeWordpressShare(t.input)
  assert.deepEqual(t.skipped, [['share', 'plugin too old']])
  assert.equal(old.calls.filter((c) => c.action !== 'info').length, 0)
})

test('WordPress: a refused option is a skip with its reason', async () => {
  const site = fakeSite({
    refuse: (c) => (c.params.key === 'tracy_share_image' ? { error: 'write_failed' } : null)
  })
  const t = inputFor(site, { share: await shareCardOf({ light: await logo() }) })
  await writeWordpressShare(t.input)
  assert.deepEqual(t.written, [])
  assert.match(t.skipped[0][1], /refused tracy_share_image \(write_failed\)/)
})

const T3 = { framework: 't3', release: 'quickstart/ja-morgan/j6' }
const T4 = { framework: 't4', release: 'quickstart/ja-nova/j6' }

for (const [name, profile, folder] of [
  ['without T4', T3, 'ja_morgan'],
  ['on T4', T4, 'ja_nova']
]) {
  test(`Joomla ${name}: the card goes to other_shareImage in a call of its own, and apply.revert takes it back`, async () => {
    const site = fakeSite({ component: '0.24.5' })
    const t = inputFor(site, { share: await shareCardOf({ light: await logo() }), profile })
    await writeJoomlaShare(t.input)
    assert.deepEqual(t.written, ['share'])
    assert.deepEqual(t.skipped, [])
    const set = site.calls.filter((c) => c.action === 'template.siteSettings')
    assert.equal(set.length, 1)
    assert.deepEqual(Object.keys(set[0].params.fields), ['other_shareImage'], 'no other key rides with it')
    assert.equal(set[0].params.profiles, undefined, 'one share image for the site, never a profile')
    assert.equal(set[0].params.template, folder)
    assert.match(site.state.settings.other_shareImage, /^images\/.+\/share-[0-9a-f]{16}-brand-s\.png$/)
    assert.ok(site.state.files.has(site.state.settings.other_shareImage), 'it names the file just uploaded')
    await site.door({ siteKey: 's', action: 'apply.revert', params: { apply_id: 'brand-s' } })
    assert.deepEqual(site.state.settings, {})
  })
}

test('Joomla: an older plugin (T4 or not) and an unknown design are skipped with their reason, nothing uploaded', async () => {
  const share = await shareCardOf({ light: await logo() })
  const cases = [
    [{ component: '0.24.4' }, T3, 'plugin too old'],
    [{ component: '0.24.4' }, T4, 'plugin too old'],
    [{ component: '0.24.5' }, null, /does not know this design/]
  ]
  for (const [o, profile, reason] of cases) {
    const site = fakeSite(o)
    const t = inputFor(site, { share, profile })
    await writeJoomlaShare(t.input)
    assert.equal(t.skipped.length, 1)
    assert.equal(t.skipped[0][0], 'share')
    if (typeof reason === 'string') assert.equal(t.skipped[0][1], reason)
    else assert.match(t.skipped[0][1], reason)
    assert.equal(site.calls.filter((c) => c.action === 'media.upload').length, 0)
  }
})

test('Joomla: a plugin whose version cannot be read is tried, and its refusal of the key reads as too old', async () => {
  const site = fakeSite({
    component: null,
    refuse: (c) =>
      c.action === 'template.siteSettings' ? { error: 'unsupported', message: 'other_shareImage' } : null
  })
  const t = inputFor(site, { share: await shareCardOf({ light: await logo() }), profile: T3 })
  await writeJoomlaShare(t.input)
  assert.deepEqual(t.skipped, [['share', 'plugin too old']])
})
