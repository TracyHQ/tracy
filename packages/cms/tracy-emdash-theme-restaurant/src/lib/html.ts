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

const TAG = /<\/?([a-zA-Z0-9]+)((?:\s+[^<>]*?)?)\s*\/?>/g

/** Removes every `<!-- ... -->`, repeating until none is left so a comment cannot be rebuilt from what surrounds it. */
function dropComments(html: string): string {
  let out = html
  for (let prev = ''; prev !== out; ) {
    prev = out
    out = out.replace(/<!--[\s\S]*?-->/g, '')
  }
  return out
}

/** Text that is not part of an allowed tag: a stray `<` or `>` is escaped, so `<scr<script>ipt>` can never become a tag. */
const plain = (text: string): string => text.replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function cleanHtml(input: unknown): string {
  const html = dropComments(String(input ?? ''))
  let out = ''
  let last = 0
  for (const m of html.matchAll(TAG)) {
    const [tag, name, attrs] = m
    out += plain(html.slice(last, m.index))
    last = m.index + tag.length
    const n = name.toLowerCase()
    if (!ALLOWED.has(n)) continue
    if (tag.startsWith('</')) {
      out += `</${n}>`
      continue
    }
    const keep: string[] = []
    for (const a of attrs.matchAll(/\s([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const k = a[1].toLowerCase()
      const v = a[3] ?? a[4] ?? ''
      if (n === 'a' && (k === 'href' || k === 'title' || k === 'target' || k === 'rel')) {
        if (k === 'href' && /^\s*javascript:/i.test(v)) continue
        keep.push(`${k}="${v.replace(/"/g, '&quot;')}"`)
      } else if (n === 'img' && (k === 'src' || k === 'alt')) keep.push(`${k}="${v.replace(/"/g, '&quot;')}"`)
    }
    out += `<${n}${keep.length ? ' ' + keep.join(' ') : ''}${n === 'br' || n === 'img' ? ' /' : ''}>`
  }
  return out + plain(html.slice(last))
}

/** Plain text of a heading that may hold `<br/>`: its lines. */
export function lines(input: unknown): string[] {
  return String(input ?? '')
    .split(/<br\s*\/?>|\n/i)
    .map((l) => {
      let text = l
      for (let prev = ''; prev !== text; ) {
        prev = text
        text = text.replace(/<[^<>]+>/g, '')
      }
      return text.replace(/&amp;/g, '&').trim()
    })
    .filter(Boolean)
}
