// Bounded owner-page passages for business reading. Keep coverage across pages before taking a second passage
// from any page, so a long landing page cannot crowd out services, people or prices further down the crawl.
const PASSAGE_CHARS = 2400
const MAX_PASSAGES = 20
const PAGE_GROUPS = [
  /team|coach|staff/i,
  /about|story|history/i,
  /price|pricing|membership|plan/i,
  /class|service/i,
  /schedule/i,
  /^\/$/
]

export function websiteReadingSources(pages = []) {
  const seen = new Set()
  const rows = []
  for (const page of Array.isArray(pages) ? pages : []) {
    let url
    try {
      url = new URL(page?.url)
      if (!['http:', 'https:'].includes(url.protocol)) continue
      url.hash = ''
    } catch {
      continue
    }
    const text = String(page?.text ?? '')
      .replace(/\r\n?/g, '\n')
      .trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    const passages = []
    for (let start = 0; start < text.length; ) {
      let end = Math.min(start + PASSAGE_CHARS, text.length)
      if (end < text.length) {
        const boundary = text.lastIndexOf('\n', end)
        if (boundary > start + PASSAGE_CHARS / 2) end = boundary
      }
      passages.push(text.slice(start, end))
      start = end
    }
    rows.push({
      url: url.href,
      passages,
      group: PAGE_GROUPS.findIndex((pattern) => pattern.test(url.pathname))
    })
  }
  rows.sort((a, b) => a.url.localeCompare(b.url))
  // Share the budget across subjects before taking more pages of one subject.
  const groups = Array.from({ length: PAGE_GROUPS.length + 1 }, () => [])
  for (const row of rows) groups[row.group < 0 ? PAGE_GROUPS.length : row.group].push(row)
  const ordered = []
  for (let index = 0; ordered.length < rows.length; index++)
    for (const group of groups) if (group[index]) ordered.push(group[index])
  const out = []
  for (let passage = 0; out.length < MAX_PASSAGES; passage++) {
    let added = false
    for (const [index, row] of ordered.entries()) {
      if (!row.passages[passage]) continue
      out.push({
        ref: `website:${index + 1}:${passage + 1}`,
        kind: 'website',
        source: 'website',
        url: row.url,
        text: row.passages[passage]
      })
      added = true
      if (out.length === MAX_PASSAGES) break
    }
    if (!added) break
  }
  return out
}
