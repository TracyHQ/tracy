/**
 * Bands the template lifts a hair off the page that a system turns into blocks (GROUND-2, Akemi
 * 14/10/2026). JA Kinetic Joomla's timeline band and footer sit on its "elevated" ground, 1.06:1 from
 * the page on the template's own page; the contract gave them the system's card surface, and under
 * Moxie dark they became grey blocks (#1a1a1a, 1.21:1) on its black page, where the WordPress twin
 * (which gives them the quiet raised surface) stays one page. The page still reads, so the rule is
 * worth fixing, not blocking.
 *
 * The probe reads every BAND (a box the width of the window, `minHeight` px or taller, with an opaque
 * ground of its own) and the ground around it (the nearest opaque ground of its parents). `detect` pairs
 * each worn band with its twin on the template's page: a finding is a band the template kept quiet
 * (under `quiet`:1 from what surrounds it) that now stands `loud`:1 or more off its surroundings and
 * at least `step` further than the template's.
 */
import { byPath, hex, PAGE_HELPERS, ratio } from './lib/colour.mjs'

export const kind = 'loud-band'

export const BAND = Object.freeze({ quiet: 1.12, loud: 1.15, step: 0.08, minHeight: 64, wide: 0.9 })

export const probe = `(() => {${PAGE_HELPERS}
  const groundOf = (e) => { for (let x = e; x; x = x.parentElement) { const c = ch(getComputedStyle(x).backgroundColor); if (c && c.a > 0.9) return c } return ch(getComputedStyle(document.documentElement).backgroundColor) }
  const bands = []
  for (const e of document.querySelectorAll('body *')) {
    if (bands.length >= 120) break
    const cs = getComputedStyle(e)
    const r = seen(e, cs)
    if (!r || r.width < ${BAND.wide} * W || r.height < ${BAND.minHeight}) continue
    if (cs.backgroundImage !== 'none') continue
    const c = ch(cs.backgroundColor)
    if (!c || c.a <= 0.9) continue
    const around = groundOf(e.parentElement)
    if (!around) continue
    bands.push({ path: pathOf(e), at: label(e), c, around })
  }
  return { bands }
})()`

/** How far a band stands off what surrounds it. @param {any} b */
export const lift = (b) => (b?.c && b?.around ? ratio(b.c, b.around) : 1)

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const was = byPath(plain?.data?.bands)
  const findings = []
  for (const b of worn?.data?.bands ?? []) {
    const p = was.get(b.path)
    if (!p) continue
    const then = lift(p)
    const now = lift(b)
    if (then >= BAND.quiet || now < BAND.loud || now - then < BAND.step) continue
    findings.push({
      at: b.at,
      why: `${hex(b.c)} stands ${now.toFixed(2)}:1 off ${hex(b.around)}; the template lifts it ${then.toFixed(2)}:1`
    })
  }
  return { count: findings.length, findings }
}
