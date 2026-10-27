/**
 * Large blocks and full-width strips on a neutral ground the system does not paint (G3 of PR 2,
 * 14/10/2026). TPL-1 lets any neutral pass that sits near a colour of the system, and a system's ink
 * is a colour of the system too: JA Vega WordPress's hero stayed pure black on Moxie's cream page
 * (#000 is Moxie's text), JA Kinetic Joomla kept near-black strips above its logo marquee and ticker
 * on Moxie's grey page, JA Resort Joomla kept black card rows. Glare (a light block on a dark page) was
 * the only neutral check, and only on dark pages.
 *
 * A finding is the outermost block, flat (no picture, opaque), neutral (chroma under `brandChroma`),
 * either a strip across most of the width or a large surface, whose ground is none of the system's
 * ground roles (`--ds-c-bg`, `--ds-c-surface`, `--ds-c-muted`… read by name in the worn page) and
 * steps visibly off the page's ground. A text colour used as a ground counts, as does a template
 * neutral the wear left alone. A light block on a dark page already counts as glare (TPL-1), so it is
 * left there. `by` says whether the template's own page already had that ground (fix the template's
 * band) or the system put it there (fix the role map).
 */
import {
  byPath,
  chroma,
  DETECTOR_LIMITS,
  dist,
  hex,
  lum,
  outermost,
  PAGE_HELPERS,
  ratio,
  ROLES_IN_PAGE
} from './lib/colour.mjs'
import { groundsOf } from './lib/colour.mjs'
import { HAIRLINES_IN_PAGE } from '../../src/sites/design-system-preview-probe.js'

export const kind = 'off-ground'

const LIMITS = Object.freeze({
  /** a strip: at least this share of the page width, this tall */
  stripWidth: 0.8,
  stripHeight: 16,
  /** a surface: at least this many px² (1000 × 150) */
  surfaceArea: 150000,
  /** a ground steps off the page from this contrast */
  step: 1.15,
  /** a light block on a dark page from this contrast is glare (PREVIEW_LIMITS.glareContrast) */
  glare: 4,
  /** a dark page: luminance under this (PREVIEW_LIMITS.darkPage) */
  darkPage: 0.2
})

export const probe = `(() => {${PAGE_HELPERS}${ROLES_IN_PAGE}${HAIRLINES_IN_PAGE}
  const roles = rolesOf()
  const opaque = (x) => { const c = ch(getComputedStyle(x).backgroundColor); return c && c.a > 0.9 ? c : null }
  const bgRole = roles.find((r) => r.name === 'bg')
  const page = bgRole ? bgRole.c : opaque(document.body) || opaque(document.documentElement) || { r: 255, g: 255, b: 255, a: 1 }
  const blocks = []
  for (const e of document.querySelectorAll('body *')) {
    if (blocks.length >= 200) break
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r) continue
    const strip = r.width >= W * ${LIMITS.stripWidth} && r.height >= ${LIMITS.stripHeight}
    if (!strip && r.width * r.height < ${LIMITS.surfaceArea}) continue
    if (cs.backgroundImage !== 'none' || +cs.opacity < 0.95) continue
    const bg = ch(cs.backgroundColor)
    if (!bg || bg.a <= 0.9) continue
    // a ruled grid's fill shows only as lines between its cells (HAIRLINES_IN_PAGE): not a ground
    if (hairlines(e, r)) continue
    blocks.push({ path: pathOf(e), at: label(e), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top + scrollY), bg })
  }
  return { page, roles, blocks }
})()`

/**
 * The blocks of one page on a ground the system does not paint.
 * @param {any} data this probe's result @param {any[]} grounds
 */
const offGround = (data, grounds, t = LIMITS, d = DETECTOR_LIMITS) => {
  const page = data?.page
  if (!page) return []
  const dark = lum(page) < t.darkPage
  const seen = new Set()
  return outermost(
    (data.blocks ?? []).filter((b) => {
      if (chroma(b.bg) >= d.brandChroma) return false
      if (dist(b.bg, page) <= d.systemTolerance || grounds.some((g) => dist(b.bg, g) <= d.systemTolerance))
        return false
      if (ratio(b.bg, page) < t.step) return false
      // glare is TPL-1's
      return !(dark && lum(b.bg) > lum(page) && ratio(b.bg, page) >= t.glare)
    })
  ).filter((b) => {
    // two boxes of one place (a wrapper and its twin of the same size): one finding
    const key = `${b.at}|${b.top}|${b.w}×${b.h}`
    return seen.has(key) ? false : (seen.add(key), true)
  })
}

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const grounds = groundsOf(worn?.data?.roles)
  const plainOf = byPath(plain?.data?.blocks)
  const findings = offGround(worn?.data, grounds).map((b) => {
    const was = plainOf.get(b.path)
    return {
      at: b.at,
      colour: hex(b.bg),
      page: hex(worn.data.page),
      size: `${b.w}×${b.h}`,
      top: b.top,
      // who painted it: the template's own page had that ground already, or the wear put it there
      by: was && dist(was.bg, b.bg) <= DETECTOR_LIMITS.same ? 'template' : 'system'
    }
  })
  return { count: findings.length, findings }
}
