#!/usr/bin/env node
/**
 * Every template contract under EVERY system the library offers (Refero and OpenDesign, those the
 * quality gate lets through), checked offline against what a page can be judged by without a stand.
 * The sweep sees fifteen systems; a fix tuned to how those fifteen look on a template passes it and
 * breaks under the other twelve hundred. This is the check that it holds for all of them (14/10/2026:
 * "over 1000 design systems, so don't fix it in a way that overfits; it must be as generic as possible").
 *
 *   node scripts/matrix.mjs [--contract name,name] [--every <n>] [--json <file>]   exit 1 when an invariant breaks
 *   (--every n: one system in n, in a fixed order — the test's quick pass; the full library otherwise)
 *
 * Invariants, per contract × system:
 *   text     the page's words (--fg on --bg) read 4.5:1
 *   accent   the accent as text on the page (accent-text) reads 4.5:1; a button's words on the accent 4.5:1
 *   status   each status colour's text shade (--ds-c-<status>-text) reads 4.5:1 on the page and on a card
 *   bands    each band the contract wears either takes a ground its words read on (4.5:1, or no worse
 *            than released) or stays the template's; a band button's pair stands out (3:1) and reads (4.5:1)
 *   sizes    the system's display line and section heading at most 1.25× the template's own (the heading
 *            never under its floor), desktop and phone
 * and per contract, whatever the system:
 *   buttons  no button selector is a bare link (`a`): every link of the page would wear the system's button
 *   literal  no colour written into followRules / sideRules that is not white, black, a role of the
 *            system (`var(--ds-c-…)`, a role name, a mix of one) or a colour the contract names as the
 *            template's own on a photo, a status or a content code (`literalsNote`)
 */
import { readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bandColours, fillRepaints, PANEL_STEP, wornBands } from '../src/bands.mjs'
import { contrast } from '../src/colour.mjs'
import {
  DISPLAY_OVER_TEMPLATE,
  displayWidthOver,
  HEADING_MIN,
  heroCap,
  pxAt,
  slotVars,
  templateSizes,
  trackingEm
} from '../src/emit.mjs'
import { derive, modeOf } from '../src/derive.mjs'
import { contractBase, loadContract, loadProfile } from '../src/library.mjs'
import { joomlaSlot } from '../src/joomla.mjs'
import { gate } from '../src/normalise.mjs'
import { keptButtonPair, STATUS_ROLES, tokens56 } from '../src/tokens56.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const args = process.argv.slice(2)
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null)
const only = opt('--contract')?.split(',') ?? null
const every = Math.max(1, Number(opt('--every') ?? 1))

// every system the library offers: both sources, through the same gate the library applies
const systems = []
for (const [kind, dir] of [
  ['refero', join(ROOT, 'vendor/tracy/refero/systems')],
  ['od', join(ROOT, 'vendor/tracy/od-design-system/systems')]
]) {
  let names = []
  try {
    names = readdirSync(dir)
  } catch {}
  for (const key of names.sort().filter((_, i) => i % every === 0)) {
    try {
      const profile = loadProfile(ROOT, `${kind}:${key}`)
      if (gate(profile).ok) systems.push({ id: `${kind}:${key}`, name: profile.name ?? key, profile })
    } catch {}
  }
}

const contracts = readdirSync(join(HERE, '../templates'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))
  // an abstract family contract (no `runtime` of its own and named by its CMS) is read through its members
  .filter((n) => !only || only.includes(n))

const LITERAL = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi
const allowed = (v) =>
  /^#(?:fff|ffffff|000|000000)$/i.test(v) || /^rgba?\(\s*(0,\s*0,\s*0|255,\s*255,\s*255)\b/i.test(v)
/** Literal colours a contract writes in rules that apply under every system. */
function literals(c) {
  const out = []
  const walk = (where, rules) => {
    for (const [sel, props] of Object.entries(rules ?? {}))
      for (const [prop, value] of Object.entries(props ?? {})) {
        const v = String(value)
        // a mix of a system role with white or black keeps the system's hue and is judged by the roles
        const bare = v.replace(/color-mix\([^()]*(?:\([^()]*\)[^()]*)*\)/g, '')
        for (const m of bare.match(LITERAL) ?? []) if (!allowed(m)) out.push(`${where} ${sel} ${prop}: ${m}`)
      }
  }
  walk('followRules', c.followRules)
  walk('pictureRules', c.pictureRules)
  for (const [side, rules] of Object.entries(c.sideRules ?? {})) walk(`sideRules.${side}`, rules)
  return out
}

const report = { systems: systems.length, contracts: {}, failures: 0 }
const fail = (r, kind, system, what) => {
  r[kind] ??= { n: 0, systems: new Set(), examples: [] }
  r[kind].n++
  r[kind].systems.add(system)
  if (r[kind].examples.length < 4) r[kind].examples.push(`${system}: ${what}`)
  report.failures++
}
for (const name of contracts) {
  let c
  try {
    c = loadContract(name)
  } catch {
    continue
  }
  const base = contractBase(ROOT, c)
  const r = { pairs: 0 }
  const lit = literals(c)
  // a contract may say why a literal is the template's own (a photo's words, a status, a content code)
  const excused = new Set(String(c.literalsNote ?? '').match(LITERAL) ?? [])
  for (const l of lit) if (!excused.has(l.split(': ').pop())) fail(r, 'literal', 'any', l)
  for (const k of ['button', 'buttonPrimary'])
    for (const x of [c.selectors?.[k] ?? []].flat().flatMap((y) => String(y).split(',')))
      if (/^a$|[\s>]a$/.test(x.trim()) && !/nav-tabs|tabs?\b/.test(x))
        fail(r, 'literal', 'any', `selectors.${k} names every link: ${x.trim()}`)
  const sizes = templateSizes(c)
  const bands = wornBands(c)
  // a two-mode template (#1315) shows the system's own side and, behind its switch, the other side derived from it
  const sidesOf = (s) =>
    c.modes === true
      ? [
          s,
          {
            ...s,
            side: 'derived',
            name: `${s.name} (derived ${modeOf(s.profile) === 'dark' ? 'light' : 'dark'})`,
            profile: derive(s.profile, modeOf(s.profile) === 'dark' ? 'light' : 'dark').profile
          }
        ]
      : [s]
  for (const s of systems.flatMap(sidesOf)) {
    r.pairs++
    let tokens
    let text
    try {
      ;({ tokens, text } = tokens56(s.profile, base))
    } catch (e) {
      fail(r, 'error', s.name, String(e).slice(0, 80))
      continue
    }
    // a Joomla module is one MySQL TEXT column: the whole slot fits it under every system (joomlaSlot throws past it)
    if (name.startsWith('joomla-') && s.side !== 'derived')
      try {
        const html = joomlaSlot(s.profile, base, c).html
        const bytes = html ? new TextEncoder().encode(html).length : 0
        if (bytes > (r.maxModule ?? 0)) r.maxModule = bytes
      } catch (e) {
        fail(r, 'size', s.name, String(e.message ?? e).slice(0, 90))
      }
    const bg = tokens['--bg']
    if (contrast(tokens['--fg'], bg) < 4.5) fail(r, 'text', s.name, `fg ${tokens['--fg']} on ${bg}`)
    const accentText = text?.colours?.['--ds-accent-text'] ?? tokens['--accent']
    if (contrast(accentText, bg) < 4.5) fail(r, 'accent', s.name, `accent-text ${accentText} on ${bg}`)
    if (contrast(tokens['--accent-on'], tokens['--accent']) < 4.5)
      fail(r, 'accent', s.name, `accent-on ${tokens['--accent-on']} on ${tokens['--accent']}`)
    // a status colour set as text (form feedback, .text-danger, outline buttons) reads its shade on the page
    // and on a card (tokens56 statusText; colourVars falls back to the status fill itself when there is none)
    for (const st of STATUS_ROLES) {
      if (!tokens[`--${st}`]) continue
      const shade = text?.colours?.[`--color-${st}-text`] ?? tokens[`--${st}`]
      for (const g of [bg, tokens['--surface']].filter(Boolean))
        if (contrast(shade, g) < 4.5) fail(r, 'status', s.name, `${st}-text ${shade} on ${g}`)
    }
    for (const [key, , spec] of bands) {
      const got = bandColours(tokens, spec, { page: base['--bg'] })
      if (!got) continue
      // a photo or an overlay keeps its ground: its words are judged on the stand, not here
      if (got.keptGround) continue
      // words the slot repaints read on the ground it picked; words it keeps read no worse than released
      const repaint = spec.repaint === true || (spec.fill === true && fillRepaints(spec))
      const words = repaint
        ? [[got.text, 4.5]]
        : (spec.texts ?? []).map((x) => [x, Math.min(4.5, contrast(x, spec.ground) - 0.01)])
      for (const [x, need] of words)
        if (contrast(x, got.ground) < need) fail(r, 'bands', s.name, `${key} ${x} on ${got.ground}`)
      // the accent marks inside it: no worse than the band's own words were on the template's ground
      const accentNeed = Math.min(4.5, ...(spec.texts ?? []).map((x) => contrast(x, spec.ground) - 0.01))
      if (contrast(got.accent, got.ground) < accentNeed)
        fail(
          r,
          'bands',
          s.name,
          `${key} accent ${got.accent} on ${got.ground} (needs ${accentNeed.toFixed(2)})`
        )
      // a panel the template set apart from its page stands apart from the worn page, by its ground or a line
      const ownStep = contrast(spec.ground, base['--bg']) ?? 1
      if (
        got.kind === 'panel' &&
        ownStep >= 1.03 &&
        !got.line &&
        (contrast(got.ground, bg) ?? 1) < PANEL_STEP - 0.005
      )
        fail(r, 'bands', s.name, `${key} panel ${got.ground} on the page ${bg}: no step`)
      // the system's pair cannot stand out on this new ground: the template's own button stays there,
      // which nothing here can judge — counted, not failed, and looked at on the stand
      if (!keptButtonPair(tokens, got.ground)) (r.noPair ??= new Set()).add(`${key}`)
    }
    if (sizes.templateHeading) {
      const h = pxAt(slotVars(s.profile, sizes)['--ds-size-heading'], 1440)
      const cap = Math.max(HEADING_MIN.desktop, Math.round(sizes.templateHeading * DISPLAY_OVER_TEMPLATE))
      if (h > cap + 1) fail(r, 'sizes', s.name, `heading ${h}px over ${cap}px`)
    }
    if (sizes.templateDisplay) {
      const v = slotVars(s.profile, sizes)
      const desk = pxAt(v['--ds-size-display'], 1440)
      if (desk > sizes.templateDisplay * DISPLAY_OVER_TEMPLATE + 1)
        fail(
          r,
          'sizes',
          s.name,
          `display ${desk}px over ${sizes.templateDisplay}px × ${DISPLAY_OVER_TEMPLATE}`
        )
      // and the line's width: a wider face sets the same words no wider than the size cap allows (heroCap)
      const p = s.profile
      const val = (f) => (f && f.s !== 'empty' ? (f.v ?? null) : null)
      const face = val(p.fonts.display) ?? val(p.fonts.body)
      const wider = face
        ? displayWidthOver(
            sizes.templateDisplayFace,
            face,
            val(p.weights.display),
            trackingEm(val(p.scale.tracking), val(p.scale.display)?.size)
          )
        : 1
      if (desk > heroCap(sizes.templateDisplay, wider) + 1)
        fail(
          r,
          'sizes',
          s.name,
          `display ${desk}px in a face ${wider.toFixed(2)}× as wide over ${heroCap(sizes.templateDisplay, wider)}px for ${sizes.templateDisplay}px`
        )
      const phone = pxAt(v['--ds-size-display-phone'] ?? v['--ds-size-display'], 390)
      if (sizes.templateDisplayPhone && phone > sizes.templateDisplayPhone * DISPLAY_OVER_TEMPLATE + 1)
        fail(
          r,
          'sizes',
          s.name,
          `phone display ${phone}px over ${sizes.templateDisplayPhone}px × ${DISPLAY_OVER_TEMPLATE}`
        )
    }
  }
  report.contracts[name] = r
}

const kinds = ['text', 'accent', 'status', 'bands', 'sizes', 'size', 'literal', 'error']
console.log(`${contracts.length} contracts × ${systems.length} systems`)
for (const [name, r] of Object.entries(report.contracts)) {
  const bad = kinds.filter((k) => r[k])
  if (!bad.length) continue
  console.log(
    `${name}: ${bad.map((k) => `${k} ${r[k].n}${k === 'literal' ? '' : ` (${r[k].systems.size} systems)`}`).join(', ')}`
  )
  for (const k of bad) for (const e of r[k].examples) console.log(`   ${k} · ${e}`)
}
const clean = Object.values(report.contracts).filter((r) => !kinds.some((k) => r[k])).length
console.log(
  `${clean}/${Object.keys(report.contracts).length} contracts hold every invariant under every system`
)
const json = opt('--json')
if (json)
  writeFileSync(
    json,
    JSON.stringify(report, (k, v) => (v instanceof Set ? [...v] : v), 1)
  )
process.exit(report.failures ? 1 : 0)
