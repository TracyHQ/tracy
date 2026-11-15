// The stylesheets of the memory site (ticket #597): the memory site holds no template files, so its `sheets` door
// serves one invented stylesheet that gives the accent variables the write names one colour on `:root` and paints a
// link with it, as JA Boxing's own stylesheets give its five accent variables one colour (measured, fact L1). Enough for
// the write to build the accent module (`accentModule`) and read it back; what a browser computes from it is measured
// on a real site only. Pure.

/** The invented template accent of the memory site. */
export const MEMORY_TEMPLATE_ACCENT = '#c4302b'

/** The memory site's stylesheets for the accent variables `variables`. */
export function memorySheetsOf(variables) {
  const names = (Array.isArray(variables) ? variables : []).filter((v) => /^--[\w-]+$/.test(v))
  if (!names.length) return []
  const root = names.map((n) => `${n}:${MEMORY_TEMPLATE_ACCENT}`).join(';')
  return [`:root{${root}}a{color:${MEMORY_TEMPLATE_ACCENT}}`]
}
