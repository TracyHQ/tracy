// The contact channels as a visitor meets them on the served pages (spec TracyHQ/tracy#189, kind C22, COO decision of
// 30/10/2026), read from the HTML any CMS serves (Joomla, WordPress, EmDash):
// - an ICON ROW (links that show an icon and no words, side by side) shows one icon per channel kind: two links of one kind
//   (two phones, a phone and a mobile, two mailboxes) are a finding;
// - a SUMMARY CONTACT BLOCK (a run of contact lines shown on every page, such as a footer "get in touch") shows one channel
//   and one location line: a second channel, or a line of the areas served beside the street address, is a finding. The
//   contact page's own block, shown on that page only, lists every channel and is not judged here;
// - an ADDRESS shows its parts with commas: a spaced hyphen or dash between two parts of the brief's address is a finding.
// Pure: the served pages and the brief in, findings out.

/** An `<a>` element, its attributes and what it shows. */
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
/** Words a page shows no visitor: the screen-reader label beside an icon. */
const HIDDEN_WORDS =
  /<(\w+)\b[^>]*\bclass\s*=\s*(["'])[^"']*\b(?:d-none|sr-only|visually-hidden|screen-reader-text)\b[^"']*\2[^>]*>[\s\S]*?<\/\1\s*>/gi
/** A link no visitor sees. */
const HIDDEN_LINK = /\shidden(?:\s|=|$)|display\s*:\s*none/i
const SHARE = /sharer|share\?|intent\/tweet|share\.php/i
/** Gaps a run of links may have and still be one row or one block (characters of HTML). */
const ROW_GAP = 800
const BLOCK_GAP = 1500
/** How far past its last contact line a block's location lines are read (characters of HTML). */
const BLOCK_TAIL = 600

/** The channel kinds, by link and icon class: a phone and a mobile are one kind. */
const KINDS = [
  ['phone', /^tel:|\bfa-(?:phone|mobile)\b/i],
  ['email', /^mailto:|\bfa-envelope\b/i],
  ['whatsapp', /wa\.me\/|api\.whatsapp\.com|\bwhatsapp\b/i],
  ['zalo', /zalo/i],
  ['telegram', /(?:^|\/\/)t\.me\/|telegram/i],
  ['instagram', /instagram|ig\.me\//i],
  ['facebook', /facebook|fb\.com|m\.me\//i],
  ['x', /twitter|(?:^|\/\/)(?:www\.)?x\.com/i],
  ['tiktok', /tiktok/i],
  ['youtube', /youtube|youtu\.be/i],
  ['linkedin', /linkedin/i],
  ['pinterest', /pinterest/i]
]
/** The kinds a contact block lists as lines: a call, a mail, a chat app, a direct message. */
const LINE_KINDS = new Set(['phone', 'email', 'whatsapp', 'zalo', 'telegram'])
const DIRECT_MESSAGE = /(?:^|\/\/)(?:ig\.me|m\.me)\//i
/** A profile link worded as a way to write to the business ("Message us on Instagram"). */
const MESSAGE_WORDS = /\b(?:message|dm|chat with) us\b/i

const textOf = (/** @type {string} */ html) =>
  String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(HIDDEN_WORDS, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
const escapeRe = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The channel kind of a link: its target first, then its icon's class. */
function kindOf(/** @type {string} */ href, /** @type {string} */ marks) {
  for (const [kind, re] of KINDS) if (re.test(href)) return kind
  if (href !== '' && href !== '#' && !/^javascript:/i.test(href)) return null
  for (const [kind, re] of KINDS) if (re.test(marks)) return kind
  return null
}

/** The visible links of a page that reach the business, each with its place, kind and whether it shows only an icon. */
function linksOf(/** @type {string} */ html) {
  const out = []
  for (const m of html.matchAll(ANCHOR)) {
    const [whole, attrs, inner] = m
    if (HIDDEN_LINK.test(attrs)) continue
    const href = (/\shref\s*=\s*(["'])([\s\S]*?)\1/i.exec(attrs)?.[2] ?? '').replace(/&amp;/g, '&').trim()
    if (SHARE.test(href)) continue
    const kind = kindOf(href, `${attrs} ${inner}`)
    if (!kind) continue
    const words = textOf(inner)
    const icon = words === '' && /<(?:i|span|svg|img)\b/i.test(inner)
    const start = /** @type {number} */ (m.index)
    out.push({ start, end: start + whole.length, href: href.toLowerCase(), kind, icon, words })
  }
  return out
}

/** Runs of links: a link joins the run before it when the HTML between them holds no words and no heading. */
function runsOf(
  /** @type {string} */ html,
  /** @type {any[]} */ links,
  /** @type {number} */ gap,
  wordsAllowed = 0
) {
  const runs = []
  for (const link of links) {
    const last = runs.at(-1)?.at(-1)
    const between = last ? html.slice(last.end, link.start) : ''
    const joins =
      last &&
      link.start - last.end <= gap &&
      !/<h[1-6]\b/i.test(between) &&
      textOf(between).length <= wordsAllowed
    if (joins) runs.at(-1).push(link)
    else runs.push([link])
  }
  return runs
}

/** The brief's street address as it was given, in its parts (`"A - B, C"` → `["a", "b", "c"]`). */
function addressPartsOf(/** @type {any} */ brief) {
  const b = brief?.business ?? {}
  const raw = [b.address, brief?.googlePlace?.formattedAddress, brief?.contact?.address].find(
    (v) => typeof v === 'string' && v.trim() !== ''
  )
  if (!raw) return []
  return raw
    .split(/\s+[-–—]\s+|\s*,\s*|\s*\n+\s*/)
    .map((p) => p.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean)
}

/** The areas the brief says the business serves: a location line a summary block does not need beside the address. */
function areasOf(/** @type {any} */ brief) {
  const list = Array.isArray(brief?.business?.serviceAreas) ? brief.business.serviceAreas : []
  return list
    .map((a) => (typeof a === 'string' ? a : a?.text))
    .filter((a) => typeof a === 'string' && a.trim() !== '')
    .map((a) => a.replace(/\s+/g, ' ').trim().toLowerCase())
}

/**
 * @param {{ served: Array<{ path: string, html: string }>, brief?: any }} ctx
 * @returns {Array<{ page: string, place: string, found: string }>}
 */
export function channelLeftovers(ctx) {
  const out = []
  const pages = (ctx.served ?? []).map((p) => ({ path: p.path, html: String(p.html ?? '') }))
  const reported = new Set()
  const report = (
    /** @type {string} */ key,
    /** @type {{ page: string, place: string, found: string }} */ finding
  ) => {
    if (reported.has(key)) return
    reported.add(key)
    out.push(finding)
  }
  /** @type {Map<string, { pages: Set<string>, first: string, run: any[], tail: string }>} */
  const blocks = new Map()
  for (const page of pages) {
    const links = linksOf(page.html)
    // Icon rows: one icon per kind.
    for (const row of runsOf(
      page.html,
      links.filter((l) => l.icon),
      ROW_GAP
    )) {
      const counts = new Map()
      for (const l of row) counts.set(l.kind, (counts.get(l.kind) ?? 0) + 1)
      for (const [kind, n] of counts)
        if (n > 1)
          report(`row|${row.map((l) => l.href).join(' ')}|${kind}`, {
            page: page.path,
            place: `icon row: ${kind}`,
            found: `${n} ${kind} icons in one row`
          })
    }
    // Contact blocks: runs of contact lines in words, recognised again on every page they are shown on.
    const lines = links.filter(
      (l) => !l.icon && (LINE_KINDS.has(l.kind) || DIRECT_MESSAGE.test(l.href) || MESSAGE_WORDS.test(l.words))
    )
    for (const run of runsOf(page.html, lines, BLOCK_GAP, 200)) {
      const key = run.map((l) => l.href).join(' ')
      const after = page.html.slice(run.at(-1).end, run.at(-1).end + BLOCK_TAIL)
      const tail = after.split(/<h[1-6]\b/i)[0]
      const seen = blocks.get(key) ?? { pages: new Set(), first: page.path, run, tail: '' }
      seen.pages.add(page.path)
      seen.tail = textOf(page.html.slice(run[0].start, run.at(-1).end) + tail)
      blocks.set(key, seen)
    }
  }
  // A block shown on two pages or more is a summary block: one channel, one location line.
  const areas = areasOf(ctx.brief)
  const street = addressPartsOf(ctx.brief)[0] ?? null
  for (const [key, block] of blocks) {
    if (block.pages.size < 2) continue
    const channels = new Set(block.run.map((l) => l.href))
    if (channels.size > 1)
      report(`summary|${key}`, {
        page: block.first,
        place: 'summary contact block',
        found: `${channels.size} channels: ${[...channels].join(', ')}`
      })
    const area = street && block.tail.includes(street) ? areas.find((a) => block.tail.includes(a)) : null
    if (area)
      report(`location|${key}`, {
        page: block.first,
        place: 'summary contact block: second location line',
        found: area
      })
  }
  // An address with a spaced dash between two of its parts.
  const parts = addressPartsOf(ctx.brief)
  for (const page of pages) {
    const text = textOf(page.html)
    for (let i = 0; i + 1 < parts.length; i += 1) {
      const dashed = new RegExp(`${escapeRe(parts[i])}\\s+[-\\u2013\\u2014]\\s+${escapeRe(parts[i + 1])}`)
      if (!dashed.test(text)) continue
      report(`address|${page.path}`, {
        page: page.path,
        place: 'address with a dash between its parts',
        found: `${parts[i]} - ${parts[i + 1]}`
      })
      break
    }
  }
  return out
}
