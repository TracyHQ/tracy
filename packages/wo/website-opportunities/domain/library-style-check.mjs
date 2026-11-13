// The colour literal check of a Tracy library stylesheet (ticket #596): a library block takes every colour from the
// template's design variables, so its stylesheet carries no colour of its own. The check reads every declaration value,
// including the last one of a rule written without a semicolon and those inside at-rules (`@media`, `@supports`), and
// allows only CSS variables, numbers with a unit and a short list of layout words. A hex, a colour function or a colour
// name anywhere fails it, also as the fallback of a `var()`. The tests of the block and the contract check command
// (`scripts/ai-quickstart/check.mjs`) both run it.

/** Words a layout declaration may use. A colour name is not one of them, nor are `transparent` and `currentColor`. */
export const LAYOUT_WORDS = new Set(
  'grid flex column none solid underline auto auto-fill repeat minmax min fr pre-line 1fr inherit'.split(' ')
)
export const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\s*\(/i
export const HEX = /#[0-9a-f]{3,8}\b/i
const NUMBER = /^-?\d*\.?\d+(?:px|rem|em|%|fr)?$/

/** Every declaration of a stylesheet as `[property, value]`, comments dropped, rule and at-rule nesting ignored. */
function declarationsOf(css) {
  const body = String(css).replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  // A declaration block is the text between `{` and `}` that holds no other brace: the innermost rule body.
  for (const [, block] of body.matchAll(/\{([^{}]*)\}/g))
    for (const part of block.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      const property = part.slice(0, colon).trim()
      const value = part.slice(colon + 1).trim()
      if (/^[\w-]+$/.test(property) && value) out.push([property, value])
    }
  return out
}

/**
 * Every colour literal of a stylesheet, as `property: token`. Empty when the sheet carries none.
 * @param {string} css
 * @returns {string[]}
 */
export function colourLiterals(css) {
  const found = []
  for (const [property, value] of declarationsOf(css)) {
    if (HEX.test(value) || COLOUR_FUNCTION.test(value)) {
      found.push(`${property}: ${value}`)
      continue
    }
    const words = value
      .replace(/!important$/i, '')
      .replace(/var\(\s*--[\w-]+/g, ' ')
      .replace(/[(),]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    for (const word of words) {
      if (NUMBER.test(word) || LAYOUT_WORDS.has(word)) continue
      found.push(`${property}: ${word}`)
    }
  }
  return found
}
