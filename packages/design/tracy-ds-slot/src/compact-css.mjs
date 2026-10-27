/**
 * A stylesheet in fewer bytes with the same rules: every run of whitespace outside strings and comments
 * becomes one space, and that space is dropped next to `{`, `}`, `;` and `,`, where CSS never reads it.
 * A space anywhere else (a descendant combinator, the spaces `calc()` needs around + and -) stays.
 * Strings and comments are kept byte for byte (the slot's `/* mode: dark *\/` and id lines are read back).
 *
 * Joomla's module stores the slot in one MySQL TEXT column (`joomla.mjs` MODULE_MAX_BYTES); the emitter
 * compacts only a module that would not fit, so every module that fits keeps the bytes it had.
 * @param {string} css
 */
export function compactCss(css) {
  const TIGHT = '{};,'
  let out = ''
  let pendingSpace = false
  let i = 0
  const n = css.length
  const emit = (text) => {
    if (pendingSpace && out && !TIGHT.includes(out[out.length - 1]) && !TIGHT.includes(text[0])) out += ' '
    pendingSpace = false
    out += text
  }
  while (i < n) {
    const ch = css[i]
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      const stop = end === -1 ? n : end + 2
      emit(css.slice(i, stop))
      i = stop
    } else if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < n && css[j] !== ch) j += css[j] === '\\' ? 2 : 1
      const stop = Math.min(n, j + 1)
      emit(css.slice(i, stop))
      i = stop
    } else if (/\s/.test(ch)) {
      pendingSpace = true
      i++
    } else {
      emit(ch)
      i++
    }
  }
  return out
}
