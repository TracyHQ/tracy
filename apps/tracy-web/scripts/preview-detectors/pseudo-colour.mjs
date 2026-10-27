/**
 * Pseudo-elements left in a template colour while their element wears the system (E3 of PR 2,
 * 14/10/2026). The slot repaints an element's own fill and words; its `::before` / `::after` are
 * separate boxes with their own rules. JA Rent Joomla under Moxie: `.btn.btn-decor` became a
 * periwinkle pill while its `::before` flag stayed the template's blue (rgb(22,166,248)), a pill with
 * a square blue tab on its left on every Book now, Readmore and Subscribe.
 *
 * In the page: every shown pseudo-element with a paint (a fill, a border, a glyph's colour) and its
 * element's fill and words. A finding is a pseudo-element of the worn page with a paint in a brand
 * colour (chroma from `brandChroma`) far from every colour of the system (its `--ds-c-*` roles,
 * status ones included) and the same on the
 * template's own page, while its element follows the system (its fill or its words changed). Large
 * shapes are judged by `shape-fill` too; this one asks whether the element moved without them.
 * The rule is TPL-1.
 */
import {
  byPath,
  chroma,
  DETECTOR_LIMITS,
  dist,
  hex,
  ofSystem,
  PAGE_HELPERS,
  ROLES_IN_PAGE,
  systemOf
} from './lib/colour.mjs'

export const kind = 'pseudo-colour'

export const probe = `(() => {${PAGE_HELPERS}${ROLES_IN_PAGE}
  const out = []
  for (const e of document.querySelectorAll('body *')) {
    if (out.length >= 600) break
    const cs = getComputedStyle(e)
    if (!seen(e, cs)) continue
    for (const part of ['::before', '::after']) {
      const s = getComputedStyle(e, part)
      if (s.content === 'none' || s.content === 'normal' || s.display === 'none' || +s.opacity === 0 || s.visibility === 'hidden') continue
      if (/url\\(/.test(s.backgroundImage)) continue
      const paints = []
      const bg = ch(s.backgroundColor)
      if (bg && bg.a >= 0.5) paints.push({ what: 'background', c: bg })
      for (const k of ['Top', 'Right', 'Bottom', 'Left']) { const c = ch(s['border' + k + 'Color']); if ((parseFloat(s['border' + k + 'Width']) || 0) >= 1 && !/none|hidden/.test(s['border' + k + 'Style']) && c && c.a >= 0.5) paints.push({ what: 'border-' + k.toLowerCase(), c }) }
      if (!/^(""|'')$/.test(s.content)) { const c = ch(s.color); if (c && c.a >= 0.5) paints.push({ what: 'color', c }) }
      if (!paints.length) continue
      out.push({ path: pathOf(e) + part, host: { bg: ch(cs.backgroundColor), fg: ch(cs.color) }, at: label(e) + part, paints })
    }
  }
  return { roles: rolesOf().map((r) => r.c), pseudos: out }
})()`

/** The element moved: its fill or its words are not what the template's own page had. */
const moved = (/** @type {any} */ a, /** @type {any} */ b, t = DETECTOR_LIMITS) => {
  const differ = (/** @type {any} */ x, /** @type {any} */ y) =>
    (x?.a ?? 0) >= 0.5 || (y?.a ?? 0) >= 0.5
      ? !x || !y || dist(x, y) > t.same || Math.abs(x.a - y.a) > 0.1
      : false
  return differ(a.bg, b.bg) || (a.fg && b.fg ? dist(a.fg, b.fg) > t.same : false)
}

/** @param {{ worn: any, plain: any, systemColours: string[] }} input */
export function detect({ worn, plain, systemColours }, t = DETECTOR_LIMITS) {
  // the page's roles too: the harness's list leaves the status roles (success, warn, danger) out
  const sys = [...systemOf(systemColours), ...(worn?.data?.roles ?? [])]
  const was = byPath(plain?.data?.pseudos)
  const findings = []
  for (const x of worn?.data?.pseudos ?? []) {
    const p = was.get(x.path)
    if (!p || !moved(x.host, p.host, t)) continue
    const kept = x.paints.filter(
      (/** @type {any} */ k) =>
        chroma(k.c) >= t.brandChroma &&
        !ofSystem(k.c, sys, t) &&
        p.paints.some((/** @type {any} */ q) => q.what === k.what && dist(q.c, k.c) <= t.same)
    )
    if (kept.length)
      findings.push({
        at: x.at,
        colour: hex(kept[0].c),
        paints: [...new Set(kept.map((/** @type {any} */ k) => k.what))].join(', ')
      })
  }
  return { count: findings.length, findings }
}
