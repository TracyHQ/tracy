/**
 * A panel that stays dark in both themes (a terminal or code panel: `--k-panel`, `--k-panel-text`),
 * read from the template's own variables (`palette.mjs` `templateVarRoles`). PURE.
 */
import { chromaOf, SATURATED } from '../auto-palette.mjs'
import { contrast, luminance, parseHex } from '../colour.mjs'
import { colourRoleOfName, isComponentVar } from './hints.mjs'

const c = (r) => `--ds-c-${r}`
const lumOf = (hex) => luminance(parseHex(hex) ?? { r: 0, g: 0, b: 0 })

/**
 * Dark panels: a surface-named variable (`--k-panel`, `--code-card`) whose LIGHT side is dark against
 * the light page. It stays dark in both themes (a terminal or code panel), so it is the ink ground,
 * not the surface the name suggests.
 * @param {Map<string, { hex: string, alpha: number, scheme: string }>} first one definition per name
 */
export function darkPanels(first, grounds) {
  const out = new Set()
  for (const [name, d] of first) {
    if (d.scheme !== 'light' || d.alpha < 0.9 || isComponentVar(name)) continue
    const role = colourRoleOfName(name, lumOf(d.hex), null, d.hex)
    if (!/^--ds-c-surface(-warm)?$/.test(role ?? '') || chromaOf(d.hex) >= SATURATED) continue
    if ((contrast(d.hex, grounds.light) ?? 1) >= 7) out.add(name)
  }
  return out
}

/** The role of a dark panel (ink) or of a variable of its family (`--k-panel-text` → on-ink), or null. */
export function panelFamilyRole(name, panels) {
  if (panels.has(name))
    return { role: c('ink'), candidates: [c('ink')], why: 'a dark panel in both themes', panel: true }
  const base = [...panels].find((p) => name.startsWith(`${p}-`))
  if (!base) return null
  const part = name.slice(base.length + 1)
  if (/^(text|fg|color|colour|foreground)$/.test(part))
    return {
      role: c('on-ink'),
      candidates: [c('on-ink')],
      why: `text on the dark panel ${base}`,
      panel: true
    }
  return {
    role: null,
    candidates: [c('on-ink'), c('accent'), c('border')],
    why: `${part} of the dark panel ${base}: no role names it on an ink ground`,
    panel: true
  }
}
