/**
 * How a WordPress theme touches the browser-tab title, read from its PHP (NAME-1, NAME-2): the
 * functions it hooks on `pre_get_document_title`, `document_title_parts` and `wp_title` (named
 * functions and closures), and any `<title>` it writes into a `<head>` itself. Core builds the tab
 * title from the site name (`title-tag`), so a theme that touches nothing passes both rules.
 */
import { templateSource } from './template-source.js'

export const TITLE_HOOKS = ['pre_get_document_title', 'document_title_parts', 'wp_title']

/**
 * The body of the block that opens at the first `{` from `from`, without its braces.
 * @param {string} code
 * @param {number} from
 */
function blockAt(code, from) {
  const open = code.indexOf('{', from)
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1
    else if (code[i] === '}' && --depth === 0) return code.slice(open + 1, i)
  }
  return code.slice(open + 1)
}

/**
 * @typedef {{ hook: string, file: string, name: string, body: string }} TitleFilter
 */

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<{ filters: TitleFilter[], handWritten: string[] }>}
 */
export async function wordpressTitleFilters(context) {
  const code = await templateSource(context).texts((n) => /\.(php|html)$/.test(n))
  /** @type {TitleFilter[]} */
  const filters = []
  const handWritten = []
  const php = [...code].filter(([n]) => n.endsWith('.php'))
  for (const [file, text] of code)
    if (/<head\b/i.test(text) && /<title\b/i.test(text)) handWritten.push(`${file} writes its own <title>`)
  for (const [file, text] of php)
    for (const m of text.matchAll(/add_filter\s*\(\s*['"]([\w-]+)['"]\s*,\s*/g)) {
      const hook = m[1]
      if (!TITLE_HOOKS.includes(hook)) continue
      const rest = text.slice(m.index + m[0].length)
      const named = /^['"]([\w\\]+)['"]/.exec(rest)
      if (named) {
        const fn = named[1].split('\\').pop() ?? named[1]
        for (const [defFile, defText] of php) {
          const def = new RegExp(`function\\s+${fn}\\s*\\(`).exec(defText)
          if (def) filters.push({ hook, file: defFile, name: fn, body: blockAt(defText, def.index) })
        }
      } else if (/^(?:static\s+)?(?:function|fn)\b/.test(rest))
        filters.push({ hook, file, name: 'a closure', body: blockAt(rest, 0) })
    }
  return { filters, handWritten }
}

/**
 * The PHP string literals of a body, read left to right so a quote inside a comment ("the home
 * page's title") or inside the other kind of string does not open one.
 * @param {string} body
 */
export function phpStrings(body) {
  const out = []
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i]
    if ((c === '/' && body[i + 1] === '/') || c === '#')
      i = body.indexOf('\n', i) < 0 ? body.length : body.indexOf('\n', i)
    else if (c === '/' && body[i + 1] === '*')
      i = body.indexOf('*/', i + 2) < 0 ? body.length : body.indexOf('*/', i + 2) + 1
    else if (c === "'" || c === '"') {
      let j = i + 1
      let text = ''
      for (; j < body.length && body[j] !== c; j += 1) {
        if (body[j] === '\\') j += 1
        text += body[j] ?? ''
      }
      out.push(text)
      i = j
    }
  }
  return out
}
