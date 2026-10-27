/**
 * The colours a design system paints with, as the slot library states them (15/10/2026): both sides,
 * the profile's own and the one derive.mjs builds for the other side, each as `palette()` and the
 * readable text colours (`readableText`) the emitters write. Read from the library, never from the
 * worn page: a page whose own rules beat the slot (JA Kinetic WordPress's html[data-style] presets)
 * resolves the slot's `--ds-c-*` to the template's palette, and a check that took those for the
 * system's could never see the template's colours kept (`unworn-page`).
 */
import { derive, modeOf } from '../../../../../packages/design/tracy-ds-slot/src/derive.mjs'
import { palette, readableText } from '../../../../../packages/design/tracy-ds-slot/src/emit.mjs'
import { loadProfile } from '../../../../../packages/design/tracy-ds-slot/src/library.mjs'

/**
 * @param {string} root the tch root (the library's vendor folders live under it)
 * @param {string} id a system id as preview-check takes it (`refero:<uuid>` or an OpenDesign id)
 * @returns {string[]} distinct `#rrggbb`, both sides; empty when the profile does not load
 */
export function systemPaletteOf(root, id) {
  let profile
  try {
    profile = loadProfile(root, /^[a-z]+:/.test(id) ? id : `od:${id}`)
  } catch {
    return []
  }
  const mode = modeOf(profile)
  const sides = [profile, derive(profile, mode === 'dark' ? 'light' : 'dark').profile]
  const out = new Set()
  for (const p of sides) {
    const pal = palette(p)
    for (const v of [...Object.values(pal), ...Object.values(readableText(pal).colours)])
      if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) out.add(v.toLowerCase())
  }
  return [...out]
}

/**
 * The status colours (success, warn, danger and their -text / -bg shades) the slot itself writes, as
 * literal values in its own bytes (16/10/2026). Since 15/10/2026 the emitter tunes each status role to
 * the worn system (tokens56: the template's hue moved toward the system's text and made readable), so
 * a status colour the slot writes is the system's paint, even where the tuning barely moves it (Tracy
 * Base WordPress's danger, #e25252 on its own dark page, #e15252 under Figma's dark side: its colours
 * swatch and its palette strip read as the template's colour kept, TPL-1 and GRAD-1). Read from the
 * slot, never off the page: a status variable the slot leaves alone resolves to the template's own
 * colour, and counting that as the system's would hide it (JA Sensei, 14/10/2026). Only a literal
 * declaration counts, never the fallback inside a var().
 * @param {string} text the slot's bytes as laid in the page (its CSS, its HTML, its global styles)
 * @returns {string[]} distinct `#rrggbb`
 */
export function slotStatusColours(text) {
  const out = new Set()
  const re = /--[\w-]*?\b(?:success|warn|danger)(?:-text|-bg)?\s*:\s*(#[0-9a-f]{6}|#[0-9a-f]{3})\b/gi
  for (const m of String(text ?? '').matchAll(re)) {
    let h = m[1].toLowerCase()
    if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`
    out.add(h)
  }
  return [...out]
}
