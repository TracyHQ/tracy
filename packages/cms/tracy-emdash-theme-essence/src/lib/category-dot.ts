/** The dot colour of a category label. The source's `cat-*` classes colour the three main categories; any other slug cycles through the same five. */
const DOTS = ['#dc3545', '#6f42c1', '#4d6bff', '#20c997', '#fd7e14']
const NAMED: Record<string, string> = { 'blog-health': '#6f42c1', 'blog-design': '#4d6bff', 'blog-fashion': '#20c997', 'blog-normal-health': '#6f42c1', 'blog-normal-design': '#4d6bff', 'blog-normal-fashion': '#20c997' }

export function categoryDot(slug: string): string {
  if (NAMED[slug]) return NAMED[slug]
  let h = 0
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return DOTS[h % DOTS.length]
}
