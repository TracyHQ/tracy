#!/usr/bin/env node
/**
 * Every system in both libraries through the whole pipeline, checked against the slot's invariants.
 * The pilot flow measures a page against its own profile, so a profile that picks the wrong font is
 * "matched" there; this is the check that looks at the profile against its SOURCE, at library scale.
 *
 *   node scripts/audit.mjs [--json <file>]      exit 1 when any invariant breaks
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contrast } from '../src/colour.mjs'
import { emdashCss, fontsHref, safeValue } from '../src/emit.mjs'
import { googleFamily } from '../src/fonts.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { baseTokens, contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { wordpressVariation } from '../src/wordpress.mjs'
import { fontRoles } from '../src/normalise.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const FONT_HREF = /^https:\/\/fonts\.googleapis\.com\/css2\?[A-Za-z0-9=&:;+@.%_-]+$/
const ids = [
  ...readdirSync(join(ROOT, 'vendor/tracy/refero/systems')).map((k) => `refero:${k}`),
  ...readdirSync(join(ROOT, 'vendor/tracy/od-design-system/systems'))
    .filter((k) => !k.startsWith('_') && !k.startsWith('.'))
    .map((k) => `od:${k}`)
]
const breaks = {}
const brk = (rule, id, detail) => (breaks[rule] ??= []).push(`${id} ${detail ?? ''}`.trim())
const WP = loadContract('wordpress-tracy-base')
const JO = loadContract('joomla-tracy-base')
const APPLE = baseTokens(ROOT, 'od:apple')
// every ready WordPress and Joomla template contract, each from its own base: the systems a site of
// that template can be offered go through ITS emitter too (Tracy Business, 11/10/2026)
const TEMPLATES = readdirSync(join(ROOT, 'packages/design/tracy-ds-slot/templates'))
  .map((f) => f.replace(/\.json$/, ''))
  .filter((n) => /^(wordpress|joomla)-/.test(n))
  .map((n) => ({ n, c: loadContract(n) }))
  .filter(({ c }) => c.template && c.ready !== false)
  .map(({ n, c }) => ({ n, c, base: contractBase(ROOT, c) }))
const counts = { systems: 0, offered: 0, refused: {}, adjusted: {}, substituted: 0, fontEmpty: 0 }
const mono = (t) =>
  /\bmono\b|monospace|\bcode\b/i.test(`${t?.family} ${String(t?.role ?? '').split(/[—–:;,.(]/)[0]}`)

for (const id of ids) {
  let p
  try {
    p = loadProfile(ROOT, id)
  } catch {
    continue
  }
  counts.systems += 1
  const r = emdashCss(p)
  if (r.refused) {
    for (const why of r.refused)
      counts.refused[why.split(':')[0]] = (counts.refused[why.split(':')[0]] ?? 0) + 1
    continue
  }
  counts.offered += 1
  const v = r.vars
  for (const a of r.adjusted) counts.adjusted[a.split(':')[0]] = (counts.adjusted[a.split(':')[0]] ?? 0) + 1
  if (['display', 'body'].some((k) => p.fonts[k].s === 'substituted')) counts.substituted += 1
  if (p.fonts.body.s === 'empty') counts.fontEmpty += 1

  if (id.startsWith('refero:')) {
    const sys = JSON.parse(
      readFileSync(join(ROOT, 'vendor/tracy/refero/systems', id.slice(7), 'design-system.json'), 'utf8')
    )
    const { display, body } = fontRoles(sys.typography)
    const hasPlainBody = (sys.typography ?? []).some(
      (t) => !mono(t) && /^\s*(body|ui|primary ui|all ui)/i.test(t.role ?? '')
    )
    // the body face is never a mono face when the source names a non-mono body face
    if (hasPlainBody && mono(body)) brk('mono-body', id, body?.family)
    // the display face is not taken from a role that starts as body/UI while a display role exists
    const hasDisplayRole = (sys.typography ?? []).some((t) =>
      /^\s*(display|heading|headline|hero)/i.test(t.role ?? '')
    )
    if (hasDisplayRole && /^\s*(body|ui\b|primary ui|all ui)/i.test(display?.role ?? ''))
      brk('display-from-body-role', id, display?.family)
    // tracking keeps the sign of the structured scale
    const step = (sys.typeScale ?? []).find(
      (s) =>
        ['display', 'display-lg', 'display-xl', 'hero'].includes(s.role) &&
        typeof s.letterSpacing === 'number'
    )
    const tr = v['--ds-tracking-display']
    // (a step under 0.001em rounds to 0em and has no sign left to keep)
    if (
      tr &&
      step &&
      Math.abs(step.letterSpacing / step.size) >= 0.001 &&
      Math.sign(parseFloat(tr)) !== Math.sign(step.letterSpacing)
    )
      brk('tracking-sign', id, `${tr} vs ${step.letterSpacing}px`)
  }
  // every text reads 4.5:1 on the page and on the surface; button text on rest/hover/active fills
  const bg = v['--color-bg']
  const surface = v['--color-surface']
  const accentText = v['--ds-accent-text'] ?? v['--color-accent']
  const accentTextHover = v['--ds-accent-text-hover'] ?? v['--color-accent-hover']
  for (const [name, c] of [
    ['fg', v['--color-fg']],
    ['muted', v['--color-fg-muted']],
    ['meta', v['--color-fg-meta']],
    ['fg-2', v['--color-fg-2']],
    ['accent-text', accentText],
    ['accent-text-hover', accentTextHover]
  ])
    for (const [gname, g] of [
      ['bg', bg],
      ['surface', surface]
    ])
      if ((contrast(c, g) ?? 0) < 4.5)
        brk(`contrast:${name}-on-${gname}`, id, (contrast(c, g) ?? 0).toFixed(2))
  for (const fill of ['--color-accent', '--color-accent-hover', '--color-accent-active'])
    if ((contrast(v['--color-accent-on'], v[fill]) ?? 0) < 4.5)
      brk(
        `contrast:button-text-on-${fill.slice(8)}`,
        id,
        (contrast(v['--color-accent-on'], v[fill]) ?? 0).toFixed(2)
      )
  // nothing in the sheet can leave its declaration; the font link is Google's and well formed
  for (const [k, x] of Object.entries(v)) if (!safeValue(String(x))) brk('unsafe-value', id, k)
  if (/\*\/.*\*\//s.test(r.css.split('\n')[0])) brk('comment-break', id)
  const href = fontsHref(p)
  if (href && (!FONT_HREF.test(href) || /undefined|wght@(&|$)/.test(href))) brk('font-href', id, href)
  for (const role of ['display', 'body']) {
    const f = p.fonts[role]
    if (f.source === 'google' && f.v && !googleFamily(f.v)) brk('font-not-google', id, f.v)
  }
  // WordPress and Joomla get the same system, and nothing in either can leave its place
  let wp = null
  try {
    wp = wordpressVariation(p, APPLE, WP)
  } catch (e) {
    brk('wordpress-throws', id, e.message)
  }
  if (wp && !wp.refused) {
    const css = wp.variation.styles.css
    if (!/^\/\* tracy-ds-slot: [A-Za-z0-9:-]+ \*\/\n/.test(css)) brk('wordpress-marker', id)
    if (/@import|url\(|<\/?style|\*\/[^\n]/.test(css.split('\n').slice(1).join('\n')))
      brk('wordpress-unsafe-css', id)
    if (!/^[a-z0-9-]+$/.test(wp.slug)) brk('wordpress-slug', id, wp.slug)
    if (wp.variation.settings.color.palette.length !== 16) brk('wordpress-palette', id)
  } else if (wp?.refused) brk('wordpress-refused-but-offered', id)
  let jo = null
  try {
    jo = joomlaSlot(p, APPLE, JO)
  } catch (e) {
    brk('joomla-throws', id, e.message)
  }
  if (jo && !jo.refused) {
    if (
      (jo.html.match(/<style/g) ?? []).length !== 1 ||
      (jo.html.match(/<\/style>/g) ?? []).length !== 1 ||
      !jo.html.endsWith('</style>')
    )
      brk('joomla-style-block', id)
    if (/@import|url\(/.test(jo.css)) brk('joomla-unsafe-css', id)
    if (jo.fontsHref && !FONT_HREF.test(jo.fontsHref)) brk('joomla-font-href', id)
  } else if (jo?.refused) brk('joomla-refused-but-offered', id)

  for (const { n, c, base } of TEMPLATES) {
    try {
      if (n.startsWith('wordpress-')) {
        const t = wordpressVariation(p, base, c)
        if (t.refused) brk('template-refused-but-offered', id, n)
        else if (
          /@import|url\(|<\/?style|\*\/[^\n]/.test(t.variation.styles.css.split('\n').slice(1).join('\n'))
        )
          brk('template-unsafe-css', id, n)
      } else {
        const t = joomlaSlot(p, base, c)
        if (t.refused) brk('template-refused-but-offered', id, n)
        else if ((t.html.match(/<style/g) ?? []).length !== 1 || /@import|url\(/.test(t.css))
          brk('template-unsafe-css', id, n)
      }
    } catch (e) {
      brk('template-throws', id, `${n}: ${e.message}`)
    }
  }
  counts.templates = TEMPLATES.length

  const lead = Number(v['--ds-leading-display'])
  if (v['--ds-leading-display'] && !(lead >= 0.95)) brk('leading-too-tight', id, String(lead))
  const phone = parseFloat(v['--ds-size-display-phone'] ?? '0')
  if (phone > 56) brk('phone-display-too-big', id, String(phone))
}

const total = Object.values(breaks).reduce((a, b) => a + b.length, 0)
const report = {
  counts,
  breaks: Object.fromEntries(
    Object.entries(breaks).map(([k, list]) => [k, { n: list.length, sample: list.slice(0, 5) }])
  )
}
const jsonAt = process.argv.indexOf('--json')
if (jsonAt !== -1) writeFileSync(process.argv[jsonAt + 1], `${JSON.stringify(report, null, 1)}\n`)
console.log(
  `${counts.systems} systems · ${counts.offered} offered (each through ${counts.templates ?? 0} ready WordPress/Joomla template contracts too) · refused ${JSON.stringify(counts.refused)}`
)
console.log(
  `adjusted ${JSON.stringify(counts.adjusted)} · font substituted ${counts.substituted} · body font empty ${counts.fontEmpty}`
)
console.log(total === 0 ? 'invariants: all hold' : `invariants broken: ${total}`)
for (const [k, b] of Object.entries(report.breaks))
  console.log(`  ${k}: ${b.n}  e.g. ${b.sample.slice(0, 3).join(' | ')}`)
process.exitCode = total === 0 ? 0 : 1
