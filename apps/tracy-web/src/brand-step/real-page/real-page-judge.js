// The real-page judge (brand bench real-page check, #322). It takes the captures of ANY site (the trial site now, a
// customer's own site in step 9) and the brand file they should show. The script measures and decides; a model looks
// once (through the brand reviewer door call the bench already has, handed in as `review`) and can only add a
// failure, never remove one. Checks, per the acceptance of the ticket:
//   views       every view was taken (header, footer, opened phone menu, tab; light and dark)
//   letters     the name on the page is at least 14 px tall, and its ink reaches 3:1 on its ground
//   menu-mark   the phone menu shows the mark when the brand file asks for it (decision 1), else the brand's logo
//   footer-logo the footer shows the brand logo
//   favicons    every favicon size is linked from the page and answers (ico, PNG 32, PNG 512, phone icon 180)
//   accent-only only accent-family colours differ from the template's palette
//   look        the model saw nothing broken
import { MIN_RATIO, parseHexColour, rgbToHsl } from '../colour-math.js'
import { MIN_LETTER_PX } from '../tools/common.js'
import { measureLogo } from './measure-crop.js'

const SCHEMES = ['light', 'dark']
const BRAND_PATH = '/tracy-brand/'
const WHERE = { header: 'header', footer: 'footer', menu: 'offcanvas' }
const check = (id, ok, detail, extra = {}) => ({ id, ok, detail, ...extra })

/** The kit spot a view shows on a side, joined with what the brand file says it shows there. */
function expectedSpot({ view, scheme, kit, brandFile }) {
  const doc = kit?.doc ?? kit
  const spots = (doc?.site?.logoSpots ?? []).filter((s) => s.where === WHERE[view])
  const spot = spots.find((s) => s.ground.side === scheme) ?? spots[0]
  const file = (brandFile?.logo?.spots ?? []).find((s) => s.spot === spot?.id)
  return spot ? { id: spot.id, shows: file?.shows ?? null } : null
}

async function lettersCheck({ captures, kit, brandFile }) {
  const problems = []
  const measured = []
  for (const v of captures.views) {
    if (!['header', 'footer', 'menu'].includes(v.id) || !v.ok || !v.png || !v.facts?.logo) continue
    const spot = expectedSpot({ view: v.id, scheme: v.scheme, kit, brandFile })
    const m = await measureLogo(v.png, v.facts.logo.rect)
    measured.push({ view: v.id, scheme: v.scheme, spot: spot?.id ?? null, shows: spot?.shows ?? null, ...m })
    const name = !String(spot?.shows ?? '').startsWith('mark')
    if (name && m.letterPx !== null && m.letterPx < MIN_LETTER_PX)
      problems.push(`${v.id} ${v.scheme}: letters ${m.letterPx}px, under ${MIN_LETTER_PX}px`)
    if (m.contrast !== null && m.contrast < MIN_RATIO)
      problems.push(`${v.id} ${v.scheme}: contrast ${m.contrast}:1, under ${MIN_RATIO}:1`)
  }
  return check(
    'letters',
    problems.length === 0 && measured.length > 0,
    problems.join('; ') || (measured.length ? 'ok' : 'no logo was found to measure'),
    { measured }
  )
}

function menuCheck({ captures, kit, brandFile }) {
  const problems = []
  for (const v of captures.views.filter((x) => x.id === 'menu')) {
    const spot = expectedSpot({ view: 'menu', scheme: v.scheme, kit, brandFile })
    const src = v.facts?.logo?.src ?? ''
    if (!v.ok || !v.opened) problems.push(`${v.scheme}: the phone menu did not open`)
    else if (!src) problems.push(`${v.scheme}: the phone menu shows no logo picture`)
    else if (String(spot?.shows ?? '').startsWith('mark') && !src.includes('menu-mark'))
      problems.push(`${v.scheme}: the menu should show the mark, it shows ${tail(src)}`)
    else if (!src.includes(BRAND_PATH))
      problems.push(`${v.scheme}: the menu shows the template's picture ${tail(src)}`)
  }
  return check('menu-mark', problems.length === 0, problems.join('; ') || 'ok')
}

const tail = (src) => String(src).split('/').slice(-2).join('/')

function footerCheck({ captures }) {
  const problems = []
  for (const v of captures.views.filter((x) => x.id === 'footer')) {
    const logo = v.facts?.logo
    if (!v.ok || !logo) problems.push(`${v.scheme}: the footer shows no logo picture`)
    else if (!logo.src.includes(BRAND_PATH) || !(logo.naturalWidth > 0))
      problems.push(`${v.scheme}: the footer shows ${tail(logo.src)}, not the brand logo`)
  }
  return check('footer-logo', problems.length === 0, problems.join('; ') || 'ok')
}

const NEEDED = [
  { name: 'ico', test: (i) => i.kind === 'ico' && /icon/.test(i.rel) },
  { name: 'png32', test: (i) => i.kind === 'png' && i.width === 32 && i.height === 32 && /icon/.test(i.rel) },
  {
    name: 'png512',
    test: (i) => i.kind === 'png' && i.width === 512 && i.height === 512 && /icon/.test(i.rel)
  },
  {
    name: 'phone180',
    test: (i) => i.kind === 'png' && i.width === 180 && i.height === 180 && /apple-touch/.test(i.rel)
  }
]

function faviconCheck({ captures }) {
  const icons = captures.icons ?? []
  const missing = NEEDED.filter(
    (n) => !icons.some((i) => n.test(i) && i.status === 200 && i.href.includes(BRAND_PATH))
  ).map((n) => n.name)
  return check(
    'favicons',
    missing.length === 0,
    missing.length ? `not linked from the page, or not the brand's: ${missing.join(', ')}` : 'ok',
    { icons: icons.length }
  )
}

/** Hue distance in degrees. */
const hueGap = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

/** The template's own palette: every colour the kit measured. */
export const paletteOf = (kit) => {
  const bc = (kit?.doc ?? kit)?.site?.brandColours ?? {}
  return [
    ...new Set(
      [...(bc.tokens ?? []).map((t) => t.value), bc.primary?.value, bc.secondary?.value]
        .map((c) => String(c ?? '').toLowerCase())
        .filter((c) => /^#[0-9a-f]{6}$/.test(c))
    )
  ]
}

function accentCheck({ captures, kit, brandFile, palette }) {
  const accent = brandFile?.colours?.accent
  const a = parseHexColour(accent)
  const own = (palette ?? paletteOf(kit)).map(parseHexColour).filter(Boolean)
  const near = (c, d) => own.some((p) => Math.hypot(p.r - c.r, p.g - c.g, p.b - c.b) <= d)
  const stray = []
  for (const scheme of SCHEMES)
    for (const { hex, count } of captures.colours?.[scheme] ?? []) {
      const c = parseHexColour(hex)
      if (!c || near(c, 10)) continue
      const hsl = rgbToHsl(c)
      const chromatic = hsl.s > 0.15 && hsl.l > 0.08 && hsl.l < 0.95
      if (chromatic && a && hueGap(hsl.h, rgbToHsl(a).h) <= 30) continue // accent family
      if (!chromatic && count < 3) continue // a stray grey on one or two elements is a blend, not a change
      stray.push(`${scheme} ${hex} x${count}`)
    }
  return check(
    'accent-only',
    stray.length === 0,
    stray.length
      ? `colours that are neither the template's nor the accent's: ${stray.slice(0, 8).join(', ')}`
      : 'ok'
  )
}

const QUESTION =
  'These are pictures of one web page: the header, the footer, the phone menu opened, and the browser tab icon. Answer ONLY a JSON object: {"broken": [...]}, a list of short reasons, empty when nothing is wrong. Report only a logo that overlaps other content, is cropped, is stretched, is unreadable, or an icon that is empty or does not match the logo. Do not judge taste.'

async function lookCheck({ captures, review }) {
  if (!review) return check('look', true, 'no model look asked')
  const pick = (id, scheme) => captures.views.find((v) => v.id === id && v.scheme === scheme && v.png)?.png
  const images = [
    pick('header', 'light'),
    pick('header', 'dark'),
    pick('footer', 'light'),
    pick('menu', 'light'),
    pick('tab', 'light')
  ].filter(Boolean)
  if (!images.length) return check('look', false, 'no picture to look at')
  try {
    const { answer, cost } = await review({ images, question: QUESTION })
    const json = /\{[\s\S]*\}/.exec(answer)?.[0]
    const broken = json ? JSON.parse(json).broken : null
    if (!Array.isArray(broken))
      return check('look', false, 'the reviewer did not answer in the form asked', { cost })
    return check('look', broken.length === 0, broken.length ? broken.map(String).join('; ') : 'ok', { cost })
  } catch (error) {
    return check('look', false, `the look failed: ${String(error?.message ?? error).slice(0, 200)}`)
  }
}

/**
 * @param {{ captures: { views: object[], icons: object[], colours: object }, brandFile: object, kit: object,
 *   review?: Function, palette?: string[] }} input
 * @returns {Promise<{ verdict: 'pass' | 'fail', checks: object[], failed: string[] }>}
 */
export async function judgeRealPage(input) {
  const { captures } = input
  const bad = []
  for (const scheme of SCHEMES)
    for (const id of ['header', 'footer', 'menu', 'tab'])
      if (!captures.views.some((v) => v.id === id && v.scheme === scheme && v.ok))
        bad.push(
          `${id} ${scheme}: ${captures.views.find((v) => v.id === id && v.scheme === scheme)?.error ?? 'not taken'}`
        )
  const checks = [check('views', bad.length === 0, bad.join('; ') || 'ok')]
  checks.push(
    await lettersCheck(input),
    menuCheck(input),
    footerCheck(input),
    faviconCheck(input),
    accentCheck(input)
  )
  checks.push(await lookCheck(input))
  const failed = checks.filter((c) => !c.ok).map((c) => c.id)
  return { verdict: failed.length ? 'fail' : 'pass', checks, failed }
}
