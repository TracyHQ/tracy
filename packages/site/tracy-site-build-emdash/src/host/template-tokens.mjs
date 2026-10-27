/** Pure reader of the tokens an EmDash template gives its rendered root. Also shipped to tracy-web. */
const VAR = /var\(\s*(--[A-Za-z0-9][\w-]*)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/

/**
 * The attributes of a page's `<html>` element, as served.
 * @param {string} page
 * @returns {Record<string, string>}
 */
export function htmlAttributes(page) {
  const tag = /<html\b([^>]*)>/i.exec(String(page ?? ''))
  /** @type {Record<string, string>} */
  const out = {}
  if (!tag) return out
  for (const m of tag[1].matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g))
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
  return out
}

/**
 * Does one selector apply to the page's root element, given its attributes? Only selectors ABOUT the
 * root count — `:root`, `html`, with attribute conditions and `:not([…])` — never a rule for an
 * element inside it (`html[data-theme="dark"] .text-forest`).
 * @param {string} selector
 * @param {Record<string, string>} attrs
 * @returns {number} the number of conditions it holds (its weight in the cascade), or -1
 */
function rootMatch(selector, attrs) {
  let rest = selector.trim()
  if (!/^(:root|html)(?=$|[[:])/.test(rest)) return -1
  rest = rest.replace(/^(:root|html)/, '')
  let weight = 0
  const cond = /^(:not\()?\[\s*([\w-]+)\s*(?:=\s*"([^"]*)"|=\s*'([^']*)'|=\s*([^\]\s]+))?\s*\]\)?/
  while (rest !== '') {
    if (rest.startsWith(':root')) {
      rest = rest.slice(5)
      continue
    }
    const m = cond.exec(rest)
    if (!m) return -1
    const [all, not, name, a, b, c] = m
    const want = a ?? b ?? c
    const has = name in attrs && (want === undefined || attrs[name] === want)
    if (not ? has : !has) return -1
    weight += 1
    rest = rest.slice(all.length)
  }
  return weight
}

/**
 * The custom properties a sheet gives the page's root, for the `<html>` it renders: `@theme` and
 * `:root` first, then every block whose selector matches those attributes, heavier selectors later
 * (the cascade: `html[data-style="terminal"][data-theme="dark"]` beats `html[data-style="terminal"]`),
 * source order among equals.
 * @param {string} css
 * @param {Record<string, string>} attrs
 */
function rootDeclarations(css, attrs) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  /** @type {{ weight: number, at: number, body: string }[]} */
  const blocks = []
  let at = 0
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const head = m[1].trim()
    const weight =
      head === '@theme' ? 0 : Math.max(-1, ...head.split(',').map((sel) => rootMatch(sel, attrs)))
    if (weight >= 0) blocks.push({ weight, at: at++, body: m[2] })
  }
  blocks.sort((x, y) => x.weight - y.weight || x.at - y.at)
  /** @type {Record<string, string>} */
  const out = {}
  for (const block of blocks) {
    for (const d of block.body.matchAll(/(--[A-Za-z0-9][\w-]*)\s*:\s*([^;{}]+);/g)) out[d[1]] = d[2].trim()
  }
  return out
}

/**
 * The values a template's token sheet gives each name for the page as it first renders, every
 * `var()` followed to a value.
 *
 * WHICH THEME. A template declares light values and dark (and, on SaaS, three styles) as blocks keyed
 * by attributes of `<html>`; the probe measures the page as served. So the blocks that page's
 * `<html>` matches decide — Business and Base render a bare `<html>` (light), SaaS renders
 * `data-style="terminal" data-theme="dark"`. Reading the first declaration instead measured SaaS'
 * dark page against its light palette: 95 where the page is 100 on its own tokens (29/09/2026).
 * Astro's font variables (`--font-archivo`) are not in the sheet; they come from `fonts.json` as
 * `"<name>", <fallbacks>`. A name that still points at nothing after that, and Tailwind's `initial`
 * reset, are dropped — a token the ruler cannot read is not a token to measure by.
 * @param {string} css
 * @param {string} fontsJson
 * @param {Record<string, string>} [html] the rendered `<html>` attributes; none = a bare `<html>`
 * @returns {Record<string, string> | null}
 */
export function templateTokens(css, fontsJson, html = {}) {
  const declared = rootDeclarations(css, html)
  try {
    const fonts = JSON.parse(fontsJson)
    for (const font of Array.isArray(fonts) ? fonts : []) {
      if (typeof font?.cssVariable !== 'string' || typeof font?.name !== 'string') continue
      const fallbacks = Array.isArray(font.fallbacks)
        ? font.fallbacks.filter((f) => typeof f === 'string')
        : []
      const quote = (f) => (/\s/.test(f) ? `"${f}"` : f)
      declared[font.cssVariable] ??= [`"${font.name}"`, ...fallbacks.map(quote)].join(', ')
    }
  } catch {
    // No fonts.json, or not a list: the sheet's own families are all there is.
  }
  /** @param {string} value @param {number} depth @returns {string | null} */
  const resolve = (value, depth) => {
    let out = value
    for (let guard = 0; VAR.test(out); guard += 1) {
      if (depth > 8 || guard > 16) return null
      const m = /** @type {RegExpExecArray} */ (VAR.exec(out))
      const target = declared[m[1]]
      const next =
        target !== undefined
          ? resolve(target, depth + 1)
          : m[2] !== undefined
            ? resolve(m[2].trim(), depth + 1)
            : null
      if (next === null) return null
      out = out.slice(0, m.index) + next + out.slice(m.index + m[0].length)
    }
    return out
  }
  /** @type {Record<string, string>} */
  const tokens = {}
  for (const [name, value] of Object.entries(declared)) {
    const resolved = resolve(value, 0)
    if (resolved === null || resolved === '' || resolved === 'initial') continue
    tokens[name] = resolved
  }
  return Object.keys(tokens).length === 0 ? null : tokens
}
