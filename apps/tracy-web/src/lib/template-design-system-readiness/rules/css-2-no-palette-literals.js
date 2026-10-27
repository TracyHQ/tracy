/**
 * CSS-2: no palette colour is left as a literal in a stylesheet that reads the slot.
 *
 * The tokenizer, run again with today's contract, replaces what the release still paints in the
 * template's own colours. A few left means the contract learnt a colour, a variable or a scope after
 * the release was cut (a new `extraPalettes` entry, `varRoles`, `classifyText`): those spots keep the
 * template's colour under every system until the template is released again.
 */
import { paintsOwnPalette, slotOf } from '../readers/slot.js'
import { tokenizedSheets } from '../readers/tokenized.js'

/** @type {import('../index.js').Rule} */
export const css2NoPaletteLiterals = {
  id: 'CSS-2',
  title: 'No palette colour is left as a literal',
  platforms: ['joomla', 'wordpress'],
  owner: 'template',
  async run(context) {
    const slot = await slotOf(context)
    if (!slot.contract || !paintsOwnPalette(slot.contract))
      return { status: 'not-applicable', message: 'No palette to tokenize (see CSS-1).' }
    const sheets = ((await tokenizedSheets(context))?.sheets ?? []).filter((s) => s.left > 0)
    if (sheets.length === 0)
      return { status: 'pass', message: 'Every palette colour the stylesheets paint reads the slot.' }
    const total = sheets.reduce((n, s) => n + s.left, 0)
    const roles = /** @type {Record<string, number>} */ ({})
    for (const s of sheets) for (const [r, n] of Object.entries(s.leftByRole)) roles[r] = (roles[r] ?? 0) + n
    const top = Object.entries(roles)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([r, n]) => `${r} ×${n}`)
    return {
      status: 'fail',
      message: `${total} palette colour${total === 1 ? ' does' : 's do'} not read the slot in the role today's contract gives (${top.join(', ')}): painted as literals, or as the wrong role (white words on the accent read as text instead of accent-on), in ${sheets.map((s) => s.file).join(', ')}.`,
      fix: `Tokenize again with templates/${slot.name}.json and release the template; then move maxVersion.`,
      details: sheets.map((s) => `${s.file}: ${s.left} literals`)
    }
  }
}
