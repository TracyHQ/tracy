// The accent of a draft write (#597): the module `look.accent.writtenAs` declares, its text the one the brand and
// write steps build (`accentModule`) from the stylesheets the site's template serves (door `sheets`), one fill per side
// as the plan's `tones` say (`sides.values`), the dark one under `sides.darkHook`. Written as one `mod_custom` on every
// page, read back. Spec: docs/references/ai-quickstart-contract.md, "look.accent: the accent door" (measured, fact L1).
import { DraftWriteError } from 'website-opportunities/domain/draft-write-error.mjs'
import { coloursIn } from './lib/brand-accent/accent-colours.js'
import { accentModule } from './lib/brand-accent/accent-module.js'
import { readRules } from './lib/brand-accent/css-rules.js'

const list = (value) => (Array.isArray(value) ? value : [])

/**
 * The template's own accent: the one colour the stylesheets give the declared accent variables on `:root` (outside any
 * media or theme rule). None, or more than one, stops typed (`accent_template_colour_unknown`): the module would
 * replace a colour the template does not paint.
 */
export function templateAccentOf(sheets, variables) {
  const found = new Set()
  for (const css of list(sheets))
    for (const rule of readRules(String(css)).rules) {
      if (rule.at.length || rule.selector.trim() !== ':root') continue
      for (const d of rule.decls)
        if (list(variables).includes(d.prop)) for (const c of coloursIn(d.value)) found.add(c.hex)
    }
  if (found.size === 1) return [...found][0]
  throw new DraftWriteError(
    'accent_template_colour_unknown',
    `the template stylesheets give the accent variables ${found.size} colours on :root`,
    { colours: [...found] },
    { noRerun: true }
  )
}

const HEX = /^#[0-9a-f]{6}$/i

/**
 * The fill and words per side. As measured (door-measures-kit-accent.mjs): the dark tone fills and words on the dark
 * side, opening there when the template opens on it. When the plan's accent is the brand file's own (`op.shifts`, #575
 * P4 of the brand audit), the brand file's shifts are written as the step chain wrote them (`write-step/brand-stage.js`):
 * its fill per side, and the words its bench measured to read on each side, which may differ from the fill.
 */
export function shiftsOf(op) {
  const opens = op.sides?.opensOn === 'dark'
  const base = [
    { side: 'dark', opens, colour: 'accent', to: op.tones.dark },
    { side: 'dark', colour: 'accent-text', to: op.tones.dark }
  ]
  const brand = list(op.shifts).filter(
    (s) =>
      ['light', 'dark'].includes(s?.side) && ['accent', 'accent-text'].includes(s?.colour) && HEX.test(s?.to)
  )
  // The brand file's shifts as the step chain wrote them (`brand-stage.js` hands `brand.colours` to `accentModule`).
  return brand.length ? brand.map((s) => ({ ...s })) : base
}

/** The module text of the plan's accent op, built from the site's stylesheets. */
export async function accentHtmlOf(op, ctx) {
  if (typeof ctx.doors.sheets !== 'function')
    throw Object.assign(
      new DraftWriteError('door_not_available', 'the sheets door is not available', { door: 'sheets' }),
      {
        noRerun: true,
        fatal: true
      }
    )
  const sheets = await ctx.doors.sheets({ variables: op.variables })
  const { light } = op.tones
  const made = accentModule({
    sheets,
    colours: {
      accent: light,
      replaces: templateAccentOf(sheets, op.variables),
      shifts: shiftsOf(op)
    },
    darkHook: op.sides.darkHook ?? null
  })
  if (made.problem)
    throw new DraftWriteError('accent_module_unbuilt', made.problem, { op: op.key }, { noRerun: true })
  return made.html
}

/** The module columns of the accent op (`writtenAs`). */
export const accentFieldsOf = (op, html) => ({
  title: op.module.title,
  note: op.mark,
  module: op.module.module,
  position: op.module.position,
  content: html,
  showtitle: op.module.showtitle,
  published: 1,
  ordering: op.module.ordering,
  access: 1,
  language: '*',
  params: JSON.stringify({ layout: '_:default', moduleclass_sfx: '', style: op.module.style })
})
