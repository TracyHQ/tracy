/**
 * Small helpers of the Template Customization Question Readiness built-site check (`audit.mjs`): a tally of findings per page, the summary a
 * person reads, and two path and name helpers.
 */

/** The last segment of a path, or ''. */
export const lastSegment = (/** @type {string | null} */ p) =>
  String(p ?? '')
    .replace(/\/$/, '')
    .split('/')
    .pop() ?? ''

/** Names with their initials (the brand mark "NG" of "Northgate Industrial", "TB" of "Tamarind Bakery"). */
export const withInitials = (/** @type {string[]} */ names) => [
  ...names,
  ...names
    .map((n) =>
      (n.match(/\p{L}+/gu) ?? [])
        .map((w) => w[0])
        .join('')
        .toUpperCase()
    )
    .filter((i) => i.length >= 2)
]

/** Count how many pages each item is on: `{ item: pages }`. */
export function tally() {
  /** @type {Map<string, Set<string>>} */
  const seen = new Map()
  return {
    add(/** @type {string} */ item, /** @type {string} */ page) {
      seen.set(item, (seen.get(item) ?? new Set()).add(page))
    },
    items: () =>
      [...seen]
        .sort((a, b) => b[1].size - a[1].size)
        .map(([i, p]) => `${i} (${p.size} page${p.size === 1 ? '' : 's'}: ${[...p][0]})`)
  }
}

/** A short human summary of a report, one line per check, the first items under a failing one. */
export function summary(
  /** @type {{ site: string, set: string, lang: string | null, demo: string, pages: number, articles: number, checks: { id: string, rule: string, outcome: string, count: number, items: string[] }[] }} */ report,
  show = 4
) {
  const lines = [
    `${report.site} (${report.set}${report.lang ? `, ${report.lang}` : ''}) vs ${report.demo}: ${report.pages} pages, ${report.articles} articles`
  ]
  for (const c of report.checks) {
    lines.push(`${c.outcome.padEnd(4)} ${c.id} [${c.rule}]${c.count ? `: ${c.count}` : ''}`)
    if (c.outcome !== 'PASS') for (const i of c.items.slice(0, show)) lines.push(`       ${i}`)
  }
  return lines.join('\n')
}
