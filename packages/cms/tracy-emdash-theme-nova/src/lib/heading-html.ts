/**
 * The inline markup of a heading field (`title`, `info_title`, `cta_title`, ...).
 *
 * The source writes a coloured word with a decorative icon as `<span class="text-cyan text-icon-1 align-icon-right">word</span>`.
 * Editors type that into a text field, so it is printed through an allowlist: only `span` (with classes from the lists below),
 * `br`, `strong` and `em` survive; every other tag is dropped, every attribute but a span's class is dropped, and a stray `<` or `>`
 * is escaped. The printed classes are the template's own (`nv-hl-green`, `nv-hl-icon-1`, `nv-hl-right`), drawn in
 * `src/styles/blocks/features.css`.
 */

const COLOURS = new Set(['green', 'purple', 'cyan', 'red', 'yellow', 'orange', 'black'])

/** Source class -> printed class; any other class is dropped. */
function mapClass(c: string): string | null {
  if (c.startsWith('text-') && COLOURS.has(c.slice(5))) return `nv-hl-${c.slice(5)}`
  const icon = /^text-icon-([1-4])$/.exec(c)
  if (icon) return `nv-hl-icon-${icon[1]}`
  if (c === 'align-icon-right') return 'nv-hl-right'
  return null
}

const TAG = /<(\/?)([a-zA-Z0-9]+)((?:\s+[^<>]*?)?)\s*\/?>/g
const ALLOWED = new Set(['span', 'br', 'strong', 'em'])

const plain = (t: string): string => t.replace(/</g, '&lt;').replace(/>/g, '&gt;')

function dropComments(html: string): string {
  let out = html
  for (let prev = ''; prev !== out; ) {
    prev = out
    out = out.replace(/<!--[\s\S]*?-->/g, '')
  }
  return out
}

/** Sanitised heading HTML, for `set:html`. */
export function headingHtml(input: unknown): string {
  const html = dropComments(String(input ?? ''))
  let out = ''
  let last = 0
  for (const m of html.matchAll(TAG)) {
    const [tag, close, name, attrs] = m
    out += plain(html.slice(last, m.index))
    last = (m.index ?? 0) + tag.length
    const n = name.toLowerCase()
    if (!ALLOWED.has(n)) continue
    if (close) {
      if (n !== 'br') out += `</${n}>`
      continue
    }
    if (n === 'span') {
      const cls = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs)
      const kept = (cls?.[1] ?? cls?.[2] ?? '')
        .split(/\s+/)
        .map(mapClass)
        .filter((c): c is string => !!c)
      out += kept.length ? `<span class="${kept.join(' ')}">` : '<span>'
    } else out += n === 'br' ? '<br />' : `<${n}>`
  }
  return out + plain(html.slice(last))
}
