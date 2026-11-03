// What build_design_system reports besides the module: the accent's contrast table (hard rule 3:1 for text and
// buttons; the slot's own aim for words is 4.5:1) and the advisory slot drift (where the slot's rendering of the
// template itself, with the template accent, differs from the template's own tokens; not caused by the brand).
import { contrastHex } from '../colour-math.js'
import { sideText } from '../kit-grounds.js'

export function contrastTable(sides) {
  const contrast = Object.fromEntries(
    Object.entries(sides).map(([side, w]) => [
      side,
      [
        ['accent fill (buttons) on ground', w.accent, w.bg, 3],
        ['accent words on ground', w['accent-text'], w.bg, 4.5],
        ['button words on accent', w['accent-on'], w.accent, 4.5],
        ['accent fill on surface', w.accent, w.surface, 3]
      ]
        .filter(([, x, y]) => x && y)
        .map(([what, x, y, target]) => {
          const ratio = contrastHex(x, y)
          return { what, colour: x, on: y, ratio, min: 3, codeTarget: target, ok: ratio >= 3 }
        })
    ])
  )
  return {
    contrast,
    contrastOk: Object.values(contrast)
      .flat()
      .every((c) => c.ok)
  }
}

export function slotDriftOf(K, baselineSides) {
  const tokens = K.site.brandColours.tokens
  const tok = (sideSel, n) =>
    tokens.find((t) => t.side === sideSel && t.name === n)?.value?.toLowerCase() ?? null
  const tpl = sideText(K)
  const other = tpl.opens === 'dark' ? 'light' : 'dark'
  const roles = (sel) => ({
    bg: tok(sel, '--body-bg-color') ?? tok('base', '--body-bg-color'),
    heading: tok(sel, '--headings-color') ?? tok('base', '--headings-color'),
    fg: tok(sel, '--body-text-color') ?? tok('base', '--body-text-color')
  })
  const tplRoles = { [tpl.opens]: roles('base'), [other]: roles(`.${other}-active`) }
  const drift = []
  for (const [side, r] of Object.entries(tplRoles))
    for (const [role, v] of Object.entries(r))
      if (v && baselineSides[side]?.[role] && baselineSides[side][role] !== v)
        drift.push({ side, role, template: v, slotWears: baselineSides[side][role] })
  return drift
}
