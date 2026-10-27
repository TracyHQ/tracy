/**
 * The `TPL_*` language keys a Joomla template's PHP asks for, for STAB-7 (a key that is in no
 * `.ini` file prints raw on the page):
 *
 *   templateLanguageKeys([['helper.php', text], ...])
 *   // { keys: [{ file, key, prefix }], uncalled: ['relTime (helper.php)'] }
 *
 * Read from the first argument of `Text::_`, `Text::sprintf`, `Text::plural`, `Text::script` (and
 * `JText::`): a plain literal, each branch of a ternary (`$future ? 'TPL_RT_FUTURE' : 'TPL_RT_PAST'`),
 * and a literal the code extends at run time (`'TPL_RT_' . $key`), which is a `prefix`: the language
 * file must hold some key that starts with it, not that string itself (ja_smallbiz, ja_resume,
 * ja_mood, ja_directory `helper.php`, 12/10/2026).
 *
 * A key asked only inside a function that no template file calls is never printed (those four
 * `helper.php` define `relTime()`, and only some templates call it), so it is left out of `keys`
 * and named in `uncalled`. A static scan: a function called by a name built at run time would be
 * missed, so `uncalled` is reported as a note, never dropped silently.
 */

/** Where the argument that starts at `from` ends: a comma or the closing parenthesis at its depth. */
function argumentEnd(/** @type {string} */ text, /** @type {number} */ from) {
  let depth = 0
  for (let at = from; at < text.length; at += 1) {
    const c = text[at]
    if (c === "'" || c === '"') {
      const close = text.indexOf(c, at + 1)
      if (close < 0) return text.length
      at = close
    } else if (c === '(') depth += 1
    else if (c === ')' && depth-- === 0) return at
    else if (c === ',' && depth === 0) return at
  }
  return text.length
}

/** The functions declared in one file, each with the span of its body. */
function functionsIn(/** @type {string} */ text) {
  const out = []
  for (const m of text.matchAll(/\bfunction\s+(\w+)\s*\(/g)) {
    const open = text.indexOf('{', (m.index ?? 0) + m[0].length)
    if (open < 0) continue
    let depth = 0
    let at = open
    for (; at < text.length; at += 1) {
      if (text[at] === '{') depth += 1
      else if (text[at] === '}' && --depth === 0) break
    }
    out.push({ name: m[1], from: open, to: at })
  }
  return out
}

/**
 * @param {[string, string][]} php the template's PHP files, `[path, text]`
 * @returns {{ keys: { file: string, key: string, prefix: boolean }[], uncalled: string[] }}
 */
export function templateLanguageKeys(php) {
  const all = php.map(([, t]) => t).join('\n')
  const called = (/** @type {string} */ name) =>
    new RegExp(`(?<!function\\s+)\\b${name}\\s*\\(`).test(
      all.replace(new RegExp(`function\\s+${name}\\s*\\(`, 'g'), '')
    )
  const keys = []
  const uncalled = new Set()
  for (const [file, text] of php) {
    const functions = functionsIn(text)
    for (const call of text.matchAll(/\bJ?Text::(?:_|sprintf|plural|script)\(/g)) {
      const from = (call.index ?? 0) + call[0].length
      const argument = text.slice(from, argumentEnd(text, from))
      const inside = functions.filter((f) => f.from < from && from < f.to).at(-1)
      const dead = inside && !called(inside.name)
      for (const m of argument.matchAll(/['"](TPL_[A-Z0-9_]+)['"](\s*\.)?/g)) {
        if (dead) uncalled.add(`${inside.name} (${file})`)
        else keys.push({ file, key: m[1], prefix: Boolean(m[2]) })
      }
    }
  }
  return { keys, uncalled: [...uncalled] }
}
