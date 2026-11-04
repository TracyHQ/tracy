// Source content keeps inline HTML in text fields (heading `<br/>`, an intro with a link). It is editor-owned text,
// so it is passed through a small allowlist before it is printed -- never trusted as markup.
const ALLOWED = new Set([
  'a',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'p',
  'ul',
  'ol',
  'li',
  'span',
  'blockquote',
  'h2',
  'h3',
  'h4',
  'img'
])

export function cleanHtml(input: unknown): string {
  const html = String(input ?? '')
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-zA-Z0-9]+)((?:\s+[^<>]*?)?)\s*\/?>/g, (tag, name: string, attrs: string) => {
      const n = name.toLowerCase()
      if (!ALLOWED.has(n)) return ''
      if (tag.startsWith('</')) return `</${n}>`
      const keep: string[] = []
      for (const m of attrs.matchAll(/\s([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
        const k = m[1].toLowerCase()
        const v = m[3] ?? m[4] ?? ''
        if (n === 'a' && (k === 'href' || k === 'title' || k === 'target' || k === 'rel')) {
          if (k === 'href' && /^\s*javascript:/i.test(v)) continue
          keep.push(`${k}="${v.replace(/"/g, '&quot;')}"`)
        } else if (n === 'img' && (k === 'src' || k === 'alt'))
          keep.push(`${k}="${v.replace(/"/g, '&quot;')}"`)
      }
      return `<${n}${keep.length ? ' ' + keep.join(' ') : ''}${n === 'br' || n === 'img' ? ' /' : ''}>`
    })
}

/** Plain text of a heading that may hold `<br/>`: its lines. */
export function lines(input: unknown): string[] {
  return String(input ?? '')
    .split(/<br\s*\/?>|\n/i)
    .map((l) =>
      l
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .trim()
    )
    .filter(Boolean)
}
