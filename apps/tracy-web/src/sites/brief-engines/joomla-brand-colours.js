/**
 * The brand colours of a Joomla brief build (spec TracyHQ/tracy#189, ADR 0023 amended 29/10/2026): when the site plan
 * says the site takes the logo's colours (`plan.colours`, `website-opportunities/domain/brand-colours.mjs`), the
 * template's brand colour roles are repainted with them by one CSS block, measured from the stylesheets and pages the
 * site serves (`brand-colour-css.mjs`).
 *
 * 🔒 THE SAME ROAD AS THE LEFTOVER BLOCK. The CSS travels inside the marked head block (`joomla-outside-map.js`): T3
 * prints it from the style's head-code param, T4 from one custom module on every page (`joomla-head-module.js`). Both
 * print after the template's stylesheets, so a rule declared again under the same selector wins; no template file,
 * template param or compiled stylesheet is written, and the build's undo takes the block back with the rest.
 * 🔒 T4's theme settings (`etc/theme/*.json`, compiled into `media/t4/css` when the admin saves) are a FILE no Apply door
 * writes; the block sets the variables they compile to (`--color-primary`, `--body-link-color`...) instead, so the page
 * shows the logo's colours while the admin settings still name the template's. Measured on a T4 brief build 29/10/2026.
 * 🔒 NO LOGO, NO CHANGE: a plan without the decision `logo-colours` writes nothing.
 */
import { brandColourCss } from 'website-opportunities/domain/brand-colour-css.mjs'
import { HEAD_BLOCK_END, HEAD_BLOCK_START } from 'website-opportunities/domain/outside-map.mjs'

/**
 * The CSS for the site, or '' when the plan keeps the template's colours or the stylesheets show no brand colour.
 * @param {{plan: any, styles: Array<{css: string}>, pages: Array<{html: string}>, note: (line: string) => void}} input
 * @returns {string}
 */
export function brandColoursCss({ plan, styles, pages, note }) {
  const colours = plan?.colours
  if (colours?.decision !== 'logo-colours' || !colours.palette?.primary) return ''
  try {
    const css = brandColourCss({ styles, palette: colours.palette, pages })
    if (!css) note('the template shows no brand colour the logo colours could take, so it keeps its own')
    return css
  } catch (error) {
    note(
      `the brand colours could not be read from the template: ${error instanceof Error ? error.message : error}`
    )
    return ''
  }
}

/**
 * The marked head block with the brand colours in their own `<style>`, beside the leftover rules (whose reader,
 * `hiddenByHeadBlock`, reads only `data-tracy-leftovers`). A block with no leftover rule is made for the colours alone.
 * @param {string} block - `leftoverHeadBlock`'s answer, '' when it has nothing
 * @param {string} css
 */
export function withColoursBlock(block, css) {
  if (!css) return block
  const style = `<style data-tracy-brand-colours>\n${css}\n</style>`
  if (!block) return `${HEAD_BLOCK_START}${style}${HEAD_BLOCK_END}`
  const end = block.lastIndexOf(HEAD_BLOCK_END)
  return end < 0 ? `${block}${style}` : `${block.slice(0, end)}${style}${block.slice(end)}`
}
