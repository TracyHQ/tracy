/**
 * CSS-1: the release's stylesheets read the slot — it was not rebuilt from the untokenized source.
 *
 * A tokenized stylesheet paints each palette colour as `var(--ds-c-<role>, <hex>)`, so a worn system
 * recolours it. A release rebuilt from the template's untokenized source paints its palette as
 * literals: under a dark system its light fills stay while the text turns light (README `maxVersion`:
 * another line re-released ja-spa / ja-voyara from the old source, 11/10/2026). That is what this
 * rule holds Publish for, judged on the release as a whole: the template's main stylesheet
 * (`css/template.css`, `assets/css/<stylesheet>.css`) reads the slot nowhere, or most of the
 * stylesheets that paint the palette read it nowhere. A stray sheet that paints one or two palette
 * colours without reading the slot (JA Donate's `css/themes/dark/home.css`: one colour, 12/10/2026)
 * is a leftover, counted by CSS-2.
 *
 * Only for templates whose contract names their own palette (`paintsOwnPalette`); Tracy Base and the
 * EmDash themes read the slot's variables natively.
 */
import { releaseFiles } from '../readers/release-files.js'
import { paintsOwnPalette, slotOf } from '../readers/slot.js'
import { tokenizedSheets } from '../readers/tokenized.js'

/** The template's main stylesheet: the one every page loads. */
const mainSheetOf = (/** @type {string} */ platform, /** @type {string | null} */ stylesheet) =>
  platform === 'wordpress' ? (stylesheet ? `assets/css/${stylesheet}.css` : null) : 'css/template.css'

/** @type {import('../index.js').Rule} */
export const css1SheetsReadSlot = {
  id: 'CSS-1',
  title: 'The release reads the slot (not rebuilt from untokenized source)',
  platforms: ['joomla', 'wordpress'],
  owner: 'template',
  async run(context) {
    const slot = await slotOf(context)
    if (!slot.contract)
      return { status: 'not-applicable', message: 'Waits for SLOT-1: no contract names the palette.' }
    if (!paintsOwnPalette(slot.contract))
      return {
        status: 'not-applicable',
        message: `${slot.templateKey} reads the slot's variables itself (no palette to tokenize).`
      }
    const result = await tokenizedSheets(context)
    const sheets = (result?.sheets ?? []).filter((s) => s.own)
    if (sheets.length === 0)
      return {
        status: 'fail',
        message:
          'The release carries none of the stylesheets the slot reads through (css/, acm/, local/ or assets/css/).',
        fix: 'Release the template with its stylesheets.'
      }
    const painting = sheets.filter((s) => s.reads > 0 || s.left > 0)
    const untokenized = painting.filter((s) => s.reads === 0)
    const main = mainSheetOf(context.release.platform, (await releaseFiles(context)).stylesheet)
    const mainSheet = sheets.find((s) => s.file.toLowerCase() === main?.toLowerCase())
    const mainUntokenized = !!mainSheet && mainSheet.reads === 0 && mainSheet.left > 0
    const most = painting.length > 0 && untokenized.length * 2 > painting.length
    const total = sheets.reduce((n, s) => n + s.reads, 0)
    const details = sheets.map((s) => `${s.file}: ${s.reads} slot reads, ${s.left} palette literals`)
    if (mainUntokenized || most || total === 0)
      return {
        status: 'fail',
        message: mainUntokenized
          ? `The main stylesheet ${mainSheet.file} paints ${mainSheet.left} palette colours and reads the slot nowhere: the release was built from the untokenized source.`
          : `${untokenized.length} of ${painting.length} stylesheets that paint the palette read the slot nowhere (${untokenized
              .slice(0, 5)
              .map((s) => s.file)
              .join(
                ', '
              )}${untokenized.length > 5 ? ', …' : ''}): the release was built from the untokenized source.`,
        fix: `Tokenize the stylesheets with templates/${slot.name}.json (node packages/design/tracy-ds-slot/scripts/tokenize.mjs --template ${slot.name} --write <files>, or release-joomla.mjs) and release the template again.`,
        details
      }
    return {
      status: 'pass',
      message: `${painting.length - untokenized.length} of ${painting.length} stylesheets that paint the palette read the slot (${total} reads)${untokenized.length ? `; ${untokenized.length} stray one${untokenized.length === 1 ? '' : 's'} counted by CSS-2` : ''}.`
    }
  }
}
