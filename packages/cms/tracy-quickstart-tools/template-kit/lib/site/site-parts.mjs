// Site-wide parts measured on the pages: summary contact blocks (how many lines of each kind the demo shows), forms
// (by kind), footer link columns (with what each holds). Pure: they take what the browser read on every page.

/** A loose pattern for a block that may hold contact details (read in the browser to pick the blocks). */
export const CONTACT_PATTERN =
  '@|\\+?\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{3,4}|\\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\\b'

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/
const PHONE_DIGITS = /(?:\+?\d[\d\s().-]{6,}\d)/
const HOURS =
  /\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b.*\d|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}[:.]\d{2}\s*[-–]\s*\d{1,2}[:.]\d{2}\b|\b(?:open|hours)\b/i
const STREET =
  /\b\d+[a-z]?\s+(?:[\w.'-]+\s+){0,4}(?:ave(?:nue)?|st(?:reet)?|r(?:oa)?d|blvd|boulevard|lane|ln|drive|dr|way|square|sq|place|pl|court|ct|highway|hwy)\b/i
const norm = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** The kind of one line: `email` | `phone` | `hours` | `address` | null. */
export function lineKind(line, addressSamples = []) {
  const text = String(line?.text ?? '')
  const href = String(line?.href ?? '')
  if (/^mailto:/i.test(href) || EMAIL.test(text)) return 'email'
  const digits = (PHONE_DIGITS.exec(text)?.[0] ?? '').replace(/\D/g, '')
  if (/^tel:/i.test(href) || (digits.length >= 7 && digits.length <= 15 && !STREET.test(text))) return 'phone'
  if (HOURS.test(text)) return 'hours'
  const n = norm(text)
  if (STREET.test(text) || addressSamples.some((a) => n.length >= 8 && norm(a).includes(n))) return 'address'
  return null
}

/** How many lines of each kind a block shows, each line counted once. */
export function contactKinds(lines, addressSamples = []) {
  const kinds = { phone: 0, email: 0, address: 0, hours: 0 }
  const seen = new Set()
  const shown = []
  for (const l of lines ?? []) {
    const key = norm(l.text)
    if (seen.has(key)) continue
    seen.add(key)
    const k = lineKind(l, addressSamples)
    if (!k) continue
    kinds[k] += 1
    shown.push({ kind: k, sample: l.text.slice(0, 80) })
  }
  return { kinds, lines: shown }
}

/**
 * Summary contact blocks: blocks that show two kinds of contact detail or more, or any on more than one page.
 * @param {Array<{pageId: string, contacts: Array<{block: string, region: string, lines: object[]}>}>} reads
 */
export function buildContactBlocks(reads, { addressSamples = [], idOf = (b) => b } = {}) {
  const by = new Map()
  for (const r of reads)
    for (const c of r.contacts ?? []) {
      const id = idOf(c.block, r)
      const rec = by.get(id) ?? {
        block: id,
        placement: c.region,
        pages: [],
        ...contactKinds(c.lines, addressSamples)
      }
      if (!rec.pages.includes(r.pageId)) rec.pages.push(r.pageId)
      by.set(id, rec)
    }
  return [...by.values()]
    .filter(
      (b) => Object.values(b.kinds).filter(Boolean).length >= 2 || (b.pages.length > 1 && b.lines.length)
    )
    .map((b) => ({ ...b, shared: b.pages.length > 1, pages: b.pages.length }))
}

/** The kind of a form from its fields: `login` | `registration` | `search` | `newsletter` | `contact` | `other`. */
export function formKind(form) {
  const f = form?.fields ?? []
  const type = (t) => f.filter((x) => x.type === t).length
  const named = (re) => f.some((x) => re.test(x.name ?? ''))
  if (type('password') >= 2 || (type('password') && named(/name|email/i) && f.length >= 4))
    return 'registration'
  if (type('password')) return 'login'
  if (type('search') || (f.length <= 2 && named(/^(?:q|s|search(?:word)?|keyword)$/i))) return 'search'
  if (f.some((x) => x.tag === 'textarea')) return 'contact'
  if (
    (type('email') || named(/email/i)) &&
    f.filter((x) => x.tag !== 'button' && x.type !== 'submit' && x.type !== 'button').length <= 3
  )
    return 'newsletter'
  return 'other'
}

/** Every form of the site once: `{block, kind, placement, pages, fields}`. */
export function buildForms(reads, { idOf = (b) => b } = {}) {
  const by = new Map()
  for (const r of reads)
    for (const f of r.forms ?? []) {
      if (!f.block) continue
      const id = idOf(f.block, r)
      const kind = formKind(f)
      // One form per block and kind: a form's own id may change on every page (a generated id).
      const key = `${id}#${kind}`
      const rec = by.get(key) ?? {
        block: id,
        kind,
        placement: f.region,
        pages: new Set(),
        fields: f.fields.length
      }
      rec.pages.add(r.pageId)
      by.set(key, rec)
    }
  return [...by.values()].map((f) => ({ ...f, pages: f.pages.size }))
}

/**
 * Footer link columns and what each holds: `offerings` when its heading names a listing page of the site (the column
 * lists that page's items), `pages` when most of its labels are names of the site's own main menu pages.
 * @param {{listingTitles: Map<string, string>, menuLabels: Set<string>, idOf?: Function}} ctx listing title -> page id
 */
export function buildNavigationGroups(reads, { listingTitles, menuLabels, idOf = (b) => b }) {
  const by = new Map()
  const errors = []
  for (const r of reads)
    for (const g of r.navGroups ?? []) {
      const id = idOf(g.block, r)
      const key = `${id}|${norm(g.heading)}`
      if (by.has(key)) continue
      const labels = g.links.map((l) => norm(l.label))
      const listing = listingTitles.get(norm(g.heading))
      // A label is a page name as written or in its other number (`Class` for a page named `Classes`).
      const named = labels.filter((l) =>
        [l, `${l}s`, `${l}es`, l.replace(/e?s$/, '')].some((x) => menuLabels.has(x))
      ).length
      const holds = listing ? 'offerings' : named * 2 >= labels.length ? 'pages' : null
      const group = {
        id: `footer-${by.size + 1}`,
        block: id,
        heading: g.heading,
        holds,
        ...(listing ? { itemsOf: listing } : {}),
        links: g.links.map((l) => ({
          label: l.label,
          leadsNowhere: !l.href || /^(?:#|javascript:)/.test(l.href)
        }))
      }
      if (!holds)
        errors.push({
          kind: 'missing',
          field: `site.navigationGroups[${group.id}].holds`,
          reason: 'the heading names no listing page and most labels are not main menu pages'
        })
      by.set(key, group)
    }
  return { navigationGroups: [...by.values()], errors }
}
