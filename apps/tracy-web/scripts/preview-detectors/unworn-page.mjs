/**
 * A page that did not wear the system (15/10/2026, JA Kinetic WordPress). Its Blueprint and Signal
 * homes pin the theme's presets on the html element (html[data-style="blueprint"], 0,1,1), above the
 * slot's :root presets (0,1,0), so both pages kept their own cool greys and indigo (Blueprint) or teal
 * (Signal) under every system, while TPL-1 read 0 there. Every other TPL-1 check asks "is this colour
 * one the system paints with?", and the system's colours are read off the worn page's `--ds-c-*`; the
 * slot's roles resolve through those same presets, so on such a page the template's own palette is
 * what the page calls the system's, and nothing the template kept could ever look foreign.
 *
 * This kind judges against the system's palette as the slot library states it, both sides of it
 * (`systemPalette`: the profile's roles and the side derive.mjs builds), never the page. A finding is
 * a page whose dominant colours stay the template's: most of its large grounds (the blocks that make
 * up half of the area, by share) and its accent (the saturated colour the template uses most on texts,
 * buttons and blocks) are the same colour as on the template's own page and far from every colour of
 * the system. A page whose accent moved, or whose grounds took the system's, wore it, even when a card
 * or two kept a template colour (those are `kept` and `keptText`). TPL-1.
 */
import { chroma, DETECTOR_LIMITS, dist, hex, ofSystem, systemOf } from './lib/colour.mjs'

export const kind = 'unworn-page'

const LIMITS = Object.freeze({
  /** a block counts as a ground from this share of the page (PREVIEW_LIMITS.keptShare) */
  share: 0.004,
  /** the dominant grounds: the largest blocks that together make this share of the blocks' area */
  dominant: 0.5,
  /** the page did not wear the system when this share of its dominant ground area kept its colour */
  keptGrounds: 0.5,
  /** a colour still painted this share of as much as the template painted it is kept */
  keptUse: 0.5,
  /** the template's accent: the saturated colour it uses at least this many times */
  accentUses: 3
})

/** The grounds of a page by colour: { hex: share }; a block inside one of its own colour is not counted twice. */
function groundsOf(/** @type {any} */ base) {
  const blocks = (base?.blocks ?? []).filter(
    (/** @type {any} */ b) => b.bg && b.share >= LIMITS.share && !b.lines
  )
  const own = blocks.filter(
    (/** @type {any} */ b) =>
      !blocks.some(
        (/** @type {any} */ o) =>
          o !== b && b.path.startsWith(`${o.path}/`) && dist(o.bg, b.bg) <= DETECTOR_LIMITS.same
      )
  )
  /** @type {Map<string, { c: any, share: number }>} */
  const out = new Map()
  for (const b of own) {
    const k = hex(b.bg)
    const was = out.get(k)
    out.set(k, { c: b.bg, share: (was?.share ?? 0) + b.share })
  }
  return out
}

/** The saturated colours of a page by use: texts, button fills and blocks each count once. */
function accentsOf(/** @type {any} */ base) {
  const colours = [
    ...(base?.texts ?? []).map((/** @type {any} */ x) => x.fg),
    ...(base?.buttons ?? []).map((/** @type {any} */ x) => x.fill),
    ...(base?.blocks ?? []).map((/** @type {any} */ x) => x.bg)
  ].filter((c) => c && (c.a ?? 1) > 0.5 && chroma(c) >= DETECTOR_LIMITS.brandChroma)
  /** @type {Map<string, { c: any, uses: number }>} */
  const out = new Map()
  for (const c of colours) {
    const k = hex(c)
    out.set(k, { c, uses: (out.get(k)?.uses ?? 0) + 1 })
  }
  return out
}

/** How much of `c` a map holds, counting every colour within the same-colour step. */
const amountOf = (/** @type {Map<string, any>} */ map, /** @type {any} */ c, /** @type {string} */ field) =>
  [...map.values()].filter((x) => dist(x.c, c) <= DETECTOR_LIMITS.same).reduce((a, x) => a + x[field], 0)

/**
 * @param {{ worn: { base: any }, plain: { base: any }, systemPalette?: string[] }} input
 */
export function detect({ worn, plain, systemPalette }) {
  const sys = systemOf(systemPalette ?? [])
  // without the system's own palette (an older run) nothing here can be judged
  if (!sys.length || !worn?.base?.blocks || !plain?.base?.blocks) return { count: 0, findings: [] }
  const far = (/** @type {any} */ c) => !ofSystem(c, sys)

  // the dominant grounds of the worn page, largest first, until they make half of the blocks' area
  const wornGrounds = groundsOf(worn.base)
  const plainGrounds = groundsOf(plain.base)
  const total = [...wornGrounds.values()].reduce((a, g) => a + g.share, 0)
  const dominant = []
  let sum = 0
  for (const g of [...wornGrounds.values()].sort((a, b) => b.share - a.share)) {
    if (sum >= total * LIMITS.dominant) break
    dominant.push(g)
    sum += g.share
  }
  if (!sum) return { count: 0, findings: [] }
  const keptGrounds = dominant.filter(
    (g) => far(g.c) && amountOf(plainGrounds, g.c, 'share') >= g.share * LIMITS.keptUse
  )
  const keptArea = keptGrounds.reduce((a, g) => a + g.share, 0)
  if (keptArea < sum * LIMITS.keptGrounds) return { count: 0, findings: [] }

  // the template's accent: its most used saturated colour; still as used, far from the system
  const plainAccents = [...accentsOf(plain.base).values()].sort((a, b) => b.uses - a.uses)
  const accent = plainAccents[0]?.uses >= LIMITS.accentUses ? plainAccents[0] : null
  let keptAccent = null
  if (accent) {
    const now = amountOf(accentsOf(worn.base), accent.c, 'uses')
    if (!far(accent.c) || now < accent.uses * LIMITS.keptUse) return { count: 0, findings: [] }
    keptAccent = { c: accent.c, uses: now, was: accent.uses }
  }

  const findings = [
    ...keptGrounds.map((g) => ({
      at: `page ground ${hex(g.c)}`,
      role: 'ground',
      colour: hex(g.c),
      share: Math.round(g.share * 1000) / 1000
    })),
    ...(keptAccent
      ? [
          {
            at: `page accent ${hex(keptAccent.c)}`,
            role: 'accent',
            colour: hex(keptAccent.c),
            uses: keptAccent.uses,
            was: keptAccent.was
          }
        ]
      : [])
  ]
  return { count: findings.length, findings }
}
