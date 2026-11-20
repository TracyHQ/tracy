/** The dot colour of a category label. The source's `cat-*` classes colour the three main categories; any other slug cycles through the same five. */
const ROLE: Record<string, string> = {
  '#dc3545': '--ds-c-heading',
  '#6f42c1': '--ds-c-accent-text',
  '#4d6bff': '--ds-c-accent',
  '#20c997': '--ds-c-muted',
  '#fd7e14': '--ds-c-meta'
}
const DOTS = ['#dc3545', '#6f42c1', '#4d6bff', '#20c997', '#fd7e14']
const NAMED: Record<string, string> = {
  'blog-health': '#6f42c1',
  'blog-design': '#4d6bff',
  'blog-fashion': '#20c997',
  'blog-normal-health': '#6f42c1',
  'blog-normal-design': '#4d6bff',
  'blog-normal-fashion': '#20c997'
}

/** The CSS value of the dot: the system's role when one is worn, the source's colour otherwise. */
export function categoryDot(slug: string): string {
  const hex = dotHex(slug)
  return `var(${ROLE[hex]}, ${hex})`
}

function dotHex(slug: string): string {
  if (NAMED[slug]) return NAMED[slug]
  let h = 0
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return DOTS[h % DOTS.length]
}
