// A value written into JavaScript source run in a page (`b.evaluate(...)`): JSON, with the characters that end a
// script or a line in JavaScript source escaped, so a contract's selector cannot close the code it is written into.
const UNSAFE = /[<>/\u2028\u2029]/g
const ESCAPED = {
  '<': '\\u003C',
  '>': '\\u003E',
  '/': '\\u002F',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029'
}

/**
 * `value` as a JavaScript literal: what `JSON.stringify` writes, safe inside a script.
 * @param {unknown} value
 * @returns {string}
 */
export const jsLiteral = (value) => String(JSON.stringify(value)).replace(UNSAFE, (c) => ESCAPED[c])
