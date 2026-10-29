/**
 * A brief build's logo made to fit the template's logo frame (spec TracyHQ/tracy#189, COO rules of 29/10/2026): a square
 * badge becomes the owner's mark beside the name set as type, a business with no logo gets a drawn symbol (never letters)
 * beside its name in the template's own logo colours, a wide logo is kept. Every business here is fictional.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import {
  DARK_GROUND,
  LIGHT_GROUND,
  luminance
} from '../src/sites/brief-engines/brand-joomla-logo-contrast.js'
import {
  fitBriefLogo,
  logoFilesOfPage,
  paletteOfLogos,
  TEMPORARY_LOGO_NOTE
} from '../src/sites/brief-engines/brand-logo-fit.js'
import { drawLogoSymbol, symbolItem, symbolVerdict } from '../src/sites/brief-engines/brand-logo-symbol.js'
import { drawPrompt } from '../src/lib/picture-draw.js'
import { createSiteBrand, setSiteBrand } from '../src/sites/brief-engines/brand.js'
import { readMark } from '../src/sites/brief-engines/logo-mark.js'
import { kindOf, tiersOf } from '../src/sites/brief-engines/logo-tiers.js'

const FRAME = { width: 195, height: 56 }
const svgPng = (svg) => sharp(Buffer.from(svg)).png().toBuffer()

/** A bakery's round badge: a cream ring and dot on a dark brown square tile, as a social avatar is exported. */
const bakeryBadge = () =>
  svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#3b2414"/><circle cx="300" cy="300" r="210" fill="none" stroke="#f2d9a6" stroke-width="34"/><circle cx="300" cy="300" r="110" fill="#f2d9a6"/></svg>`
  )
/** A drawn symbol as the picture model answers it: one flat dark shape on a white ground. */
const drawnTooth = () =>
  svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#ffffff"/><path d="M146 120 C200 90 312 90 366 120 C400 160 380 250 350 330 C330 400 300 420 290 360 C280 320 232 320 222 360 C212 420 182 400 162 330 C132 250 112 160 146 120 Z" fill="#303030"/></svg>`
  )
/** A template's own demo logo: a near-black wordmark block with a red accent bar, on transparency. */
const templateDemoLogo = () =>
  svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="112"><rect x="10" y="30" width="250" height="52" fill="#121212"/><rect x="280" y="30" width="90" height="52" fill="#e0353d"/></svg>`
  )
/** A wide flat wordmark in one dark colour, on transparency. */
const wideWordmark = () =>
  svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="180"><rect x="20" y="40" width="660" height="100" rx="20" fill="#1d2a44"/></svg>`
  )

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** The share of a picture's opaque pixels right of `fromX` (a share of its width) that reach `bar` against `ground`. */
async function shareReaching(bytes, ground, bar, fromX) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let n = 0
  let ok = 0
  for (let y = 0; y < info.height; y += 1)
    for (let x = Math.floor(info.width * fromX); x < info.width; x += 1) {
      const o = (y * info.width + x) * 4
      if (data[o + 3] < 250) continue
      n += 1
      if (contrast({ r: data[o], g: data[o + 1], b: data[o + 2] }, ground) >= bar) ok += 1
    }
  return n ? ok / n : 0
}

test('a square badge on a tile: the mark is cut free of its tile and its colours read', async () => {
  const m = await readMark(await bakeryBadge())
  assert.ok(m)
  assert.deepEqual(m.tile, { r: 59, g: 36, b: 20 })
  assert.ok(Math.abs(m.aspect - 1) < 0.05, `aspect ${m.aspect}`)
  assert.equal(m.flat, true)
  // The tile is gone: a corner of the cut mark is transparent.
  const { data } = await sharp(m.mark).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(data[3], 0)
})

test('rule 1: a bakery badge becomes a light and a dark lockup in the frame, the name readable at 4.5:1', async () => {
  const fit = await fitBriefLogo({
    logo: { single: await bakeryBadge() },
    name: 'Harbor Lane Bakery',
    frame: FRAME
  })
  assert.equal(fit.made, 'lockup')
  for (const [side, ground] of [
    ['light', LIGHT_GROUND],
    ['dark', DARK_GROUND]
  ]) {
    const bytes = fit.logo[side]
    const meta = await sharp(bytes).metadata()
    assert.equal(meta.height, FRAME.height * 2, `${side} height`)
    assert.ok(
      meta.width <= FRAME.width * 2 && meta.width > meta.height * 2,
      `${side} ${meta.width}x${meta.height}`
    )
    // The name sits right of the mark: its pixels reach text contrast on this variant's ground.
    assert.ok((await shareReaching(bytes, ground, 4.5, 0.55)) > 0.9, `${side} name contrast`)
  }
})

test('rule 1 with no template profile at all: the logo is left as given', async () => {
  const badge = await bakeryBadge()
  const fit = await fitBriefLogo({ logo: { single: badge }, name: 'Harbor Lane Bakery', frame: null })
  assert.equal(fit.made, null)
  assert.equal(fit.logo.single, badge)
})

/** Pictures of every shape an owner's logo comes in (fictional drawings). */
const SHAPES = {
  'round seal on transparency': () =>
    svgPng(
      `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><circle cx="250" cy="250" r="230" fill="#0f4c5c"/><circle cx="250" cy="250" r="150" fill="none" stroke="#f4a261" stroke-width="24"/></svg>`
    ),
  'tall mark on transparency': () =>
    svgPng(
      `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="640"><path d="M150 20 L280 620 L20 620 Z" fill="#2d6a4f"/></svg>`
    ),
  'square flat mark on transparency': () =>
    svgPng(
      `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect x="60" y="60" width="392" height="392" rx="60" fill="#5a189a"/></svg>`
    ),
  'photo of a sign': () =>
    sharp(Buffer.from(Array.from({ length: 320 * 240 * 3 }, (_, i) => (i * 7919) % 251)), {
      raw: { width: 320, height: 240, channels: 3 }
    })
      .png()
      .toBuffer()
}

for (const [shape, make] of Object.entries(SHAPES))
  test(`rule 1 for a ${shape}: a light and a dark lockup of a logo's shape, the name readable`, async () => {
    const fit = await fitBriefLogo({
      logo: { single: await make() },
      name: 'Saltmarsh Swim School',
      frame: FRAME
    })
    assert.equal(fit.made, 'lockup', fit.how)
    for (const [side, ground] of [
      ['light', LIGHT_GROUND],
      ['dark', DARK_GROUND]
    ]) {
      const meta = await sharp(fit.logo[side]).metadata()
      assert.equal(meta.height, FRAME.height * 2)
      assert.ok(meta.width / meta.height > 1.8, `${side} ${meta.width}x${meta.height}`)
      assert.ok((await shareReaching(fit.logo[side], ground, 4.5, 0.7)) > 0.9, `${side} name contrast`)
    }
  })

test('a wide logo exported on a white box: the box is taken off, the logo is kept as the owner drew it', async () => {
  const boxed = await svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><rect width="800" height="200" fill="#ffffff"/><rect x="60" y="50" width="680" height="100" fill="#b5179e"/></svg>`
  )
  const fit = await fitBriefLogo({ logo: { single: boxed }, name: 'Saltmarsh Swim School', frame: FRAME })
  assert.equal(fit.made, null)
  const kept = fit.logo.single ?? fit.logo.light
  // Only the drawing is left: no white pixel of the box, and the picture is the drawing's width.
  const { data, info } = await sharp(kept).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let white = 0
  for (let o = 0; o < data.length; o += 4)
    if (data[o + 3] > 200 && data[o] > 240 && data[o + 1] > 240) white += 1
  assert.equal(white, 0)
  assert.ok(Math.abs(info.width / info.height - 680 / 100) < 0.2, `${info.width}x${info.height}`)
})

test('rule 3: a wide flat wordmark is kept, and a variant recoloured for the ground it does not read on', async () => {
  const wide = await wideWordmark()
  const fit = await fitBriefLogo({ logo: { single: wide }, name: 'Northgate Dental', frame: FRAME })
  assert.equal(fit.made, null)
  assert.ok(fit.logo.light && fit.logo.dark)
  assert.ok((await shareReaching(fit.logo.dark, DARK_GROUND, 3, 0)) > 0.9)
  assert.ok((await shareReaching(fit.logo.light, LIGHT_GROUND, 3, 0)) > 0.9)
})

test('rule 2: no logo, a drawn symbol in a badge of the template accent beside the name; nothing drawn, a wordmark', async () => {
  const templatePalette = await paletteOfLogos([await templateDemoLogo()])
  assert.deepEqual(templatePalette?.accent, { r: 224, g: 53, b: 61 })
  const withSymbol = await fitBriefLogo({
    logo: undefined,
    name: 'Northgate Dental Clinic',
    frame: FRAME,
    symbol: await drawnTooth(),
    templatePalette
  })
  assert.equal(withSymbol.made, 'symbol')
  // The symbol sits in a solid circle of the template's accent (it reaches 3:1 on both grounds, so both variants share
  // it), drawn in white: the badge's edge at mid height is red, its middle white.
  for (const variant of [withSymbol.logo.light, withSymbol.logo.dark]) {
    const { data, info } = await sharp(variant).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const at = (x) => {
      const o = (Math.floor(info.height / 2) * info.width + x) * 4
      return [data[o], data[o + 1], data[o + 2], data[o + 3]]
    }
    const pad = Math.round(info.height * 0.06)
    const diameter = info.height - 2 * pad
    assert.deepEqual(at(pad + Math.round(diameter * 0.1)), [224, 53, 61, 255])
    assert.deepEqual(at(pad + Math.round(diameter / 2)), [255, 255, 255, 255])
  }
  const words = await fitBriefLogo({
    logo: undefined,
    name: 'Northgate Dental Clinic',
    frame: FRAME,
    templatePalette
  })
  assert.equal(words.made, 'wordmark')
  assert.ok((await shareReaching(words.logo.dark, DARK_GROUND, 4.5, 0)) > 0.9)
})

test('a name the logo face cannot set is left to the template, never drawn by a model', async () => {
  const fit = await fitBriefLogo({
    logo: { single: await bakeryBadge() },
    name: String.fromCodePoint(0x645, 0x62e, 0x628, 0x632),
    frame: FRAME
  })
  assert.equal(fit.made, null)
})

test('the symbol prompt asks for no letters and names the colours; the verdict refuses words, not being a logo', () => {
  const item = symbolItem({
    name: 'Northgate Dental Clinic',
    trade: 'dental clinic',
    palette: { accent: { r: 224, g: 53, b: 61 }, colours: [{ r: 18, g: 18, b: 18 }] }
  })
  const prompt = drawPrompt(item)
  assert.match(prompt, /no letters, no initials, no numbers and no words/)
  assert.match(prompt, /#e0353d and #121212/)
  assert.equal(symbolVerdict({ subject: 'logo', textPresence: 'absent' }).ok, true)
  assert.equal(symbolVerdict({ textPresence: 'present' }).reason, 'text-found')
  assert.equal(symbolVerdict(null).reason, 'labeller-unavailable')
})

test('drawLogoSymbol: a symbol with letters is drawn once more; no labeller, no symbol', async () => {
  const tooth = await drawnTooth()
  const door = { url: 'https://models.example.test', key: 'k', imageModel: 'image-model' }
  const chat = async () => ({ images: [{ bytes: tooth }], usage: { cost: 0.01 } })
  const answers = [{ textPresence: 'present' }, { textPresence: 'absent', subject: 'logo' }]
  const item = symbolItem({ name: 'Northgate Dental Clinic' })
  const got = await drawLogoSymbol({ door, chat, item, checkDrawing: async () => answers.shift() })
  assert.ok('bytes' in got)
  assert.equal(got.costUsd, 0.02)
  const none = await drawLogoSymbol({ door, chat, item, checkDrawing: null })
  assert.deepEqual(none, { refused: ['labeller-unavailable'], costUsd: 0 })
})

/** A T4 or T3 Joomla site behind the Apply door, as much as the brand step asks of it. */
function fakeJoomla({ template, framework, profiles = {}, styles = [], slots = {} }) {
  const state = {
    profiles: structuredClone(profiles),
    styles: new Map(styles.map((s) => [s.id, s])),
    slots,
    files: new Map()
  }
  const door = async ({ action, params }) => {
    if (action === 'info') return { ok: true, info: { component: '0.23.0' } }
    if (action === 'site.identity') return { ok: true }
    if (action === 'media.upload') {
      state.files.set(params.path, Buffer.from(params.content_b64, 'base64'))
      return { ok: true, path: params.path }
    }
    if (action === 'template.siteSettings' && (params.operation ?? 'read') === 'read')
      return framework === 't4'
        ? {
            ok: true,
            template,
            framework,
            profiles: Object.fromEntries(
              Object.entries(state.profiles).map(([n, s]) => [n, { settings: { ...s } }])
            )
          }
        : { ok: true, template, framework, settings: {} }
    if (action === 'template.siteSettings') {
      for (const [name, values] of Object.entries(params.profiles ?? {}))
        Object.assign(state.profiles[name], values)
      return { ok: true }
    }
    if (action === 'content.list' && params.kind === 'templateStyle')
      return {
        ok: true,
        items: [...state.styles.values()].map(({ id, title, template: t }) => ({ id, title, template: t }))
      }
    if (action === 'content.get' && params.kind === 'templateStyle')
      return { ok: true, item: state.styles.get(params.id) }
    if (action === 'content.update' && params.kind === 'templateStyle') {
      state.styles.get(params.id).params = params.fields.params
      return { ok: true }
    }
    if (action === 'content.list') return { ok: true, items: [] }
    if (action === 'content.contract' && params.operation === 'inspect')
      return {
        ok: true,
        revision: 'r1',
        slots: Object.entries(state.slots).map(([key, s]) => ({ key, type: 'image', sample: s }))
      }
    if (action === 'content.contract') return { ok: true }
    return { ok: false, error: 'bad_action', message: `unknown action: ${action}` }
  }
  return { state, door }
}

const aspectOf = async (bytes) => {
  const m = await sharp(bytes).metadata()
  return m.width / m.height
}

test('T4 brief build with a square badge: site_logo and site_logo_dark are lockups in the frame, the owner is told', async () => {
  const site = fakeJoomla({
    template: 'ja_boxing',
    framework: 't4',
    profiles: {
      default: {
        site_logo: 'images/joomlart/logo/item-2.png',
        site_logo_dark: 'images/joomlart/logo/item-1.png'
      }
    },
    slots: { 'module-170.1': 'images/joomlart/logo/item-1.png' }
  })
  const notes = []
  const result = await setSiteBrand({
    platform: 'joomla',
    siteKey: 's',
    release: { tag: 'quickstart/ja-boxing/j6', version: '1.0.3' },
    pack: { name: 'Harbor Lane Bakery', logo: { single: await bakeryBadge() }, nameFallback: true },
    call: site.door,
    applyId: 'brand-1',
    note: (n) => notes.push(n)
  })
  assert.equal(result.made, 'lockup')
  assert.ok(
    notes.includes(`logo: ${TEMPORARY_LOGO_NOTE}`) || notes.some((n) => n.includes(TEMPORARY_LOGO_NOTE))
  )
  const { site_logo: light, site_logo_dark: dark } = site.state.profiles.default
  assert.match(light, /^images\/tracy-brand\/logo-light-/)
  assert.match(dark, /^images\/tracy-brand\/logo-dark-/)
  for (const path of [light, dark])
    assert.ok(Math.abs((await aspectOf(site.state.files.get(path))) - 195 / 56) < 0.02, path)
})

test('a name too long to read in a small frame keeps the logo as given (the plate and padding rules then hold)', async () => {
  const fit = await fitBriefLogo({
    logo: { single: await bakeryBadge() },
    name: 'Harbor Lane Artisan Bakery and Coffee House',
    frame: { width: 81, height: 23 }
  })
  assert.equal(fit.made, null)
})

test('T3 brief build with a square badge: the dark header style takes the dark lockup', async () => {
  const site = fakeJoomla({
    template: 'ja_sensei',
    framework: 't3',
    styles: [
      {
        id: 9,
        title: 'ja_sensei - Default',
        template: 'ja_sensei',
        params: JSON.stringify({ logotype: 'image', logoimage: 'images/joomlart/logo/logo.png' })
      }
    ]
  })
  const result = await setSiteBrand({
    platform: 'joomla',
    siteKey: 's',
    release: { tag: 'quickstart/ja-sensei/j6', version: '1.0.0' },
    pack: { name: 'Crumb', logo: { single: await bakeryBadge() }, nameFallback: true },
    call: site.door,
    applyId: 'brand-1',
    note: () => {}
  })
  assert.equal(result.made, 'lockup')
  const logo = JSON.parse(site.state.styles.get(9).params).logoimage
  assert.match(logo, /logo-dark-/)
  assert.ok((await aspectOf(site.state.files.get(logo))) > 3)
})

const T4_DEMO = {
  site_logo: 'images/joomlart/logo/logo.png',
  site_logo_dark: 'images/joomlart/logo/logo-dark.png'
}

for (const [layout, tag, version, profiles, expect] of [
  [
    'dark (every spot dark)',
    'quickstart/ja-resort/j6',
    '1.0.6',
    { default: { site_logo: 'images/logo.png' } },
    /logo-dark-/
  ],
  [
    'pair with no measured frame',
    'quickstart/ja-kinetic/j6',
    '1.0.10',
    { default: { ...T4_DEMO }, Blog: { ...T4_DEMO } },
    /logo-light-/
  ]
])
  test(`T4 ${layout}: every profile's logo spot takes a made lockup of a logo's shape`, async () => {
    const site = fakeJoomla({ template: tag.split('/')[1].replace(/-/g, '_'), framework: 't4', profiles })
    const result = await setSiteBrand({
      platform: 'joomla',
      siteKey: 's',
      release: { tag, version },
      pack: { name: 'Saltmarsh Swim School', logo: { single: await bakeryBadge() }, nameFallback: true },
      call: site.door,
      applyId: 'brand-1',
      note: () => {}
    })
    assert.equal(result.made, 'lockup')
    for (const [name, values] of Object.entries(site.state.profiles)) {
      assert.match(values.site_logo, expect, name)
      assert.ok((await aspectOf(site.state.files.get(values.site_logo))) > 2.5, name)
    }
  })

test('T3 single-logo design: every style takes the light lockup', async () => {
  const site = fakeJoomla({
    template: 'ja_smallbiz',
    framework: 't3',
    styles: [
      {
        id: 10,
        title: 'ja_smallbiz - Default',
        template: 'ja_smallbiz',
        params: JSON.stringify({ logotype: 'image' })
      },
      {
        id: 11,
        title: 'ja_smallbiz - Gym',
        template: 'ja_smallbiz',
        params: JSON.stringify({ logotype: 'image' })
      }
    ]
  })
  const result = await setSiteBrand({
    platform: 'joomla',
    siteKey: 's',
    release: { tag: 'quickstart/ja-smallbiz/j6', version: '1.0.4' },
    pack: { name: 'Crumb Bakery', logo: { single: await bakeryBadge() }, nameFallback: true },
    call: site.door,
    applyId: 'brand-1',
    note: () => {}
  })
  assert.equal(result.made, 'lockup')
  for (const id of [10, 11])
    assert.match(JSON.parse(site.state.styles.get(id).params).logoimage, /logo-light-/)
})

test('createSiteBrand, a dental clinic with no logo: a symbol is drawn in the template colours and set beside the name', async () => {
  const site = fakeJoomla({
    template: 'ja_boxing',
    framework: 't4',
    profiles: {
      default: {
        site_logo: 'images/joomlart/logo/item-2.png',
        site_logo_dark: 'images/joomlart/logo/item-1.png'
      }
    }
  })
  const asked = []
  const notes = []
  const brand = createSiteBrand({
    applyFor: () => site.door,
    readFile: async () => null,
    versionOf: async () => '1.0.3',
    sitePlanFor: async () => ({
      logo: { decision: 'name-as-text', demoFiles: ['images/joomlart/logo/item-2.png'] }
    }),
    templateLogos: async (_ctx, files) => {
      asked.push(...files)
      return [await templateDemoLogo()]
    },
    drawSymbol: async (_ctx, item) => {
      assert.equal(item.mode, 'symbol')
      assert.deepEqual(item.colours.slice(0, 1), ['#e0353d'])
      return drawnTooth()
    }
  })
  const result = await brand(
    {
      siteKey: 's',
      platform: 'joomla',
      quickstart: 'quickstart/ja-boxing/j6',
      email: 'owner@example.test',
      brief: { business: { trade: 'dental clinic' } },
      normalized: { name: 'Northgate Dental Clinic' },
      note: (n) => notes.push(n)
    },
    { applyId: 'brand-2' }
  )
  assert.deepEqual(asked, ['images/joomlart/logo/item-2.png'])
  assert.equal(result.made, 'symbol')
  assert.ok(notes.some((n) => n.includes(TEMPORARY_LOGO_NOTE)))
  assert.match(site.state.profiles.default.site_logo, /^images\/tracy-brand\/logo-light-/)
})

test('WordPress takes the brief logo as given: the fit is Joomla only for now', async () => {
  const calls = []
  const result = await setSiteBrand({
    platform: 'wordpress',
    siteKey: 's',
    release: null,
    pack: { name: 'Harbor Lane Bakery', logo: { single: await bakeryBadge() }, nameFallback: true },
    call: async (c) => {
      calls.push(c)
      return { ok: false, error: 'bad_action' }
    },
    applyId: 'brand-1',
    note: () => {}
  })
  assert.equal(result.made, undefined)
})

test('the template palette is read from the logo pictures its page shows when the content map names none', () => {
  const html = `<header><a class="navbar-brand"><img class="logo-img d-light" src="/images/demo/logo/brand-dark.png" alt="Demo"><img class="logo-img d-dark" src="/images/demo/logo/brand-light.png" alt="Demo"></a></header><img src="/images/demo/hero.jpg" alt="Hero"><img src="/images/demo/icons/logo.svg" alt="x">`
  assert.deepEqual(logoFilesOfPage(html), [
    '/images/demo/logo/brand-dark.png',
    '/images/demo/logo/brand-light.png'
  ])
})

/** Blocks standing for letters: `n` small rectangles in a row, as a line of a name looks to a reader of pixels. */
const letterRow = (x, y, n, w, h, fill) =>
  Array.from(
    { length: n },
    (_, i) => `<rect x="${x + i * (w + w / 2)}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`
  ).join('')

/** A bakery crest with its name and year in two lines under the shield, on a dark tile. */
const crestWithWords = () =>
  svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#1f3d2b"/><path d="M180 60 L420 60 L420 230 Q420 330 300 380 Q180 330 180 230 Z" fill="none" stroke="#d9b45a" stroke-width="22"/><circle cx="300" cy="200" r="60" fill="#d9b45a"/>${letterRow(150, 430, 8, 24, 40, '#d9b45a')}${letterRow(210, 500, 5, 20, 26, '#d9b45a')}</svg>`
  )
/** A round seal whose words run around its ring, on transparency: the words cannot be cut away from the picture. */
const sealWithRingWords = () => {
  const marks = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2
    const x = 250 + Math.cos(a) * 200
    const y = 250 + Math.sin(a) * 200
    return `<rect x="${x - 10}" y="${y - 14}" width="20" height="28" fill="#7a1f2b" transform="rotate(${(a * 180) / Math.PI + 90} ${x} ${y})"/>`
  }).join('')
  return svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><circle cx="250" cy="250" r="235" fill="none" stroke="#7a1f2b" stroke-width="10"/><circle cx="250" cy="250" r="160" fill="none" stroke="#7a1f2b" stroke-width="10"/>${marks}<circle cx="250" cy="250" r="80" fill="#7a1f2b"/></svg>`
  )
}

/** The box of opaque pixels of a picture, by columns and rows from `fromX`. */
async function inkBoxOf(bytes, fromX = 0, toX = Number.POSITIVE_INFINITY) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let left = info.width
  let right = -1
  let top = info.height
  let bottom = -1
  for (let y = 0; y < info.height; y += 1)
    for (let x = fromX; x < Math.min(info.width, toX); x += 1)
      if (data[(y * info.width + x) * 4 + 3] > 128) {
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
  return { left, right, top, bottom }
}

test('a crest with its words under the shield: the words are cut away, the shield goes beside the typeset name', async () => {
  const fit = await fitBriefLogo({
    logo: { single: await crestWithWords() },
    name: 'Copperleaf Bakery',
    frame: FRAME
  })
  assert.equal(fit.made, 'lockup')
  assert.match(fit.how, /words left out/)
  // The dark variant's mark (cut free) is the shield alone: about as wide as it is tall, not the taller crest.
  const meta = await sharp(fit.logo.dark).metadata()
  const mark = await inkBoxOf(fit.logo.dark, 0, Math.round(meta.height * 1.1))
  const ratio = (mark.right - mark.left + 1) / (mark.bottom - mark.top + 1)
  assert.ok(ratio > 0.65, `shield ${ratio}`)
})

test('the name stands close to the mark (about half its cap height) and centred on it', async () => {
  const fit = await fitBriefLogo({ logo: { single: await bakeryBadge() }, name: 'Copperleaf', frame: FRAME })
  const bytes = fit.logo.dark
  const meta = await sharp(bytes).metadata()
  const mark = await inkBoxOf(bytes, 0, meta.height)
  const name = await inkBoxOf(bytes, mark.right + 2)
  const cap = name.bottom - name.top + 1
  const gap = name.left - mark.right - 1
  assert.ok(gap >= cap * 0.25 && gap <= cap * 0.6, `gap ${gap} for cap ${cap}`)
  const markMiddle = (mark.top + mark.bottom) / 2
  const nameMiddle = (name.top + name.bottom) / 2
  assert.ok(Math.abs(markMiddle - nameMiddle) <= cap * 0.25, `middles ${markMiddle} ${nameMiddle}`)
})

test('a seal with words around its ring: seen by the labeller, the owner logo goes alone, no name added', async () => {
  const seal = await sealWithRingWords()
  const fit = await fitBriefLogo({
    logo: { single: seal },
    name: 'Copperleaf Bakery',
    frame: FRAME,
    seesText: async () => true
  })
  assert.equal(fit.made, null)
  for (const side of ['light', 'dark']) {
    const meta = await sharp(fit.logo[side]).metadata()
    assert.equal(meta.height, FRAME.height * 2, `${side} fills the frame height`)
    assert.ok(meta.width <= meta.height * 1.05, `${side} is the seal alone, no name beside it`)
  }
  // No labeller: the words woven into the ring are not seen by the image reader, and the seal is set beside the name.
  const blind = await fitBriefLogo({ logo: { single: seal }, name: 'Copperleaf Bakery', frame: FRAME })
  assert.equal(blind.made, 'lockup')
})

test('a labeller that sees no words keeps the whole mark beside the name', async () => {
  const fit = await fitBriefLogo({
    logo: { single: await bakeryBadge() },
    name: 'Copperleaf Bakery',
    frame: FRAME,
    seesText: async () => false
  })
  assert.equal(fit.made, 'lockup')
  assert.equal(fit.how, 'the mark beside the name')
})

test('a light mark on a light ground is toned to the logo colour that reads, cut free, its inner details kept', async () => {
  // A pale sand emblem with a lighter inner ring (two tones, not flat) on a deep teal tile.
  const emblem = await svgPng(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#0e4d4f"/><circle cx="300" cy="300" r="200" fill="#e8d7b0"/><circle cx="300" cy="300" r="120" fill="none" stroke="#fbf3df" stroke-width="30"/><circle cx="300" cy="300" r="50" fill="#d9c08a"/></svg>`
  )
  const fit = await fitBriefLogo({ logo: { single: emblem }, name: 'Saltmarsh Swim School', frame: FRAME })
  assert.equal(fit.made, 'lockup')
  const bytes = fit.logo.light
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const markBox = await inkBoxOf(bytes, 0, info.height)
  // Cut free: the corners of the mark's box are transparent (no tile behind it).
  assert.equal(data[(markBox.top * info.width + markBox.left) * 4 + 3], 0)
  // Toned: the mark reads at 3:1 on the light ground, in the tile's teal family, and keeps more than one tone.
  assert.ok((await shareReaching(bytes, LIGHT_GROUND, 3, 0)) > 0.85)
  const tones = new Set()
  let teal = 0
  let seen = 0
  for (let y = markBox.top; y <= markBox.bottom; y += 1)
    for (let x = markBox.left; x <= markBox.right; x += 1) {
      const o = (y * info.width + x) * 4
      if (data[o + 3] < 250) continue
      seen += 1
      tones.add(`${data[o] >> 4},${data[o + 1] >> 4},${data[o + 2] >> 4}`)
      if (data[o + 1] > data[o] && data[o + 2] > data[o]) teal += 1
    }
  assert.ok(teal / seen > 0.9, `teal share ${teal / seen}`)
  assert.ok(tones.size >= 2, 'the inner ring still shows')
})

test('kindOf: the kind of business the brief states, in a few words; nothing reliable, none', () => {
  assert.equal(kindOf({ trade: 'fitness', subTrade: { id: 'gym' } }), 'gym')
  assert.equal(kindOf({ trade: 'fitness', subTrade: { id: 'coaching' } }), 'coaching team')
  assert.equal(kindOf({ trade: 'beauty' }), 'salon')
  assert.equal(kindOf({ cuisine: ['Lebanese'] }), 'Lebanese restaurant')
  assert.equal(kindOf({ cuisine: ['Thai', 'Lao'] }), 'restaurant')
  assert.equal(kindOf({ trade: 'home' }), null)
  assert.equal(kindOf({ trade: 'unknown' }), null)
  assert.equal(kindOf({}), null)
  assert.equal(kindOf(null), null)
})

test('tiersOf: a name ending in its kind is split; a name holding it elsewhere gets no line; else the kind goes under', () => {
  assert.deepEqual(tiersOf('Saigon Iron Boxing Gym', 'gym'), {
    name: 'Saigon Iron',
    descriptor: 'Boxing Gym'
  })
  assert.deepEqual(tiersOf('Copperleaf Gym', 'gym'), { name: 'Copperleaf', descriptor: 'Gym' })
  assert.deepEqual(tiersOf('Gym Lantern Collective', 'gym'), {
    name: 'Gym Lantern Collective',
    descriptor: null
  })
  assert.deepEqual(tiersOf('Copperleaf', 'Lebanese restaurant'), {
    name: 'Copperleaf',
    descriptor: 'Lebanese restaurant'
  })
  assert.deepEqual(tiersOf('Copperleaf', null), { name: 'Copperleaf', descriptor: null })
})

/** The colours of a picture's opaque pixels between two columns, as `#rrggbb`, most used first. */
async function inksBetween(bytes, fromX, toX) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const seen = new Map()
  for (let y = 0; y < info.height; y += 1)
    for (let x = fromX; x < Math.min(info.width, toX); x += 1) {
      const o = (y * info.width + x) * 4
      if (data[o + 3] < 255) continue
      const hex = `#${[data[o], data[o + 1], data[o + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
      seen.set(hex, (seen.get(hex) ?? 0) + 1)
    }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex)
}

test('one style for every made logo: the name in the ground strong text colour, the kind under it in the accent', async () => {
  const templatePalette = await paletteOfLogos([await templateDemoLogo()])
  const fit = await fitBriefLogo({
    logo: undefined,
    name: 'Saigon Iron Boxing Gym',
    descriptor: 'gym',
    frame: FRAME,
    symbol: await drawnTooth(),
    templatePalette
  })
  assert.equal(fit.made, 'symbol')
  for (const [variant, name, ground] of [
    [fit.logo.light, '#141414', LIGHT_GROUND],
    [fit.logo.dark, '#f6f6f6', DARK_GROUND]
  ]) {
    const meta = await sharp(variant).metadata()
    const text = await inkBoxOf(variant, meta.height)
    // Two tiers: the upper rows hold the name's colour, the lower rows (the descriptor) an accent that reads at 4.5:1.
    const { data, info } = await sharp(variant).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const rowInks = (y0, y1) => {
      const seen = new Map()
      for (let y = y0; y <= y1; y += 1)
        for (let x = text.left; x <= text.right; x += 1) {
          const o = (y * info.width + x) * 4
          if (data[o + 3] < 255) continue
          const key = `${data[o]},${data[o + 1]},${data[o + 2]}`
          seen.set(key, (seen.get(key) ?? 0) + 1)
        }
      return [...seen.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    }
    const height = text.bottom - text.top
    const hexOfKey = (key) =>
      `#${key
        .split(',')
        .map((v) => Number(v).toString(16).padStart(2, '0'))
        .join('')}`
    assert.equal(hexOfKey(rowInks(text.top, text.top + Math.round(height * 0.4))), name)
    const sub = rowInks(text.bottom - Math.round(height * 0.12), text.bottom)
    assert.ok(sub && hexOfKey(sub) !== name, 'the descriptor has its own colour')
    const [r, g, b] = sub.split(',').map(Number)
    assert.ok(contrast({ r, g, b }, ground) >= 4.5, `descriptor ${sub}`)
    assert.ok(r > g && r > b, `descriptor ${sub} is the red accent`)
  }
  assert.equal((await inksBetween(fit.logo.light, 0, 5)).length, 0, 'transparent around the logo')
})
