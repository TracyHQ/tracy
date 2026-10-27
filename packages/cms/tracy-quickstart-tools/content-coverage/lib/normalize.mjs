// Text and path normalisation shared by matching and classification.
// Everything is compared in one canonical form so that entities, tags, whitespace,
// case and typographic punctuation never decide whether two strings are "the same".

const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '-',
  mdash: '-',
  hellip: '...',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  copy: '(c)',
  reg: '(r)',
  trade: '(tm)',
  laquo: '"',
  raquo: '"',
  middot: '.',
  bull: '.',
  times: 'x'
}

/** Decode HTML entities (named subset + numeric). */
export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : m
    }
    return NAMED[e.toLowerCase()] ?? m
  })
}

/** Strip HTML tags (keeps a space where a tag was, so words do not glue). */
export function stripTags(s) {
  return String(s ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
}

/** Canonical comparison form of a piece of visible text. */
export function normText(s) {
  // JA ACM fields spell inline markup as ((span))...((/span)); the template turns it into tags.
  return decodeEntities(stripTags(String(s ?? '').replace(/\(\(\/?[a-z][a-z0-9]*(?:\s[^()]*)?\)\)/gi, ' ')))
    .normalize('NFKC')
    .replace(/[‘’‚′`´]/g, "'")
    .replace(/[“”„″«»]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/[\u00a0\u200b\u200c\ufeff]|\u200d/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Whitespace-free form: "Offline<span>Pages</span>" renders as "OfflinePages" or "Offline Pages" depending on CSS. */
export const compact = (norm) => norm.replace(/[\s\p{P}]+/gu, '')

/** Count of letters (any script) in a string: a text item with fewer than 2 is not content. */
export function letterCount(s) {
  const m = String(s ?? '').match(/\p{L}/gu)
  return m ? m.length : 0
}

/**
 * Count of letters and digits: a price ("$141.00") or a figure ("100k") is demo content even with
 * no word in it, so only a text with fewer than 2 of these is ignored.
 */
export function alnumCount(s) {
  const m = String(s ?? '').match(/[\p{L}\p{N}]/gu)
  return m ? m.length : 0
}

/**
 * Canonical media path: site-relative, decoded, no query/fragment, no leading slash.
 * Joomla image fields carry `#joomlaImage://...`; that suffix is dropped.
 */
export function normPath(src, siteUrl) {
  if (!src) return ''
  let s = decodeEntities(String(src).trim())
  s = s.split('#')[0]
  try {
    const base = new URL(siteUrl)
    const u = new URL(s, base)
    if (u.host !== base.host && /^https?:/.test(u.protocol)) return u.href.split('?')[0].toLowerCase()
    s = u.pathname
    const basePath = base.pathname.replace(/\/$/, '')
    if (basePath && s.startsWith(basePath + '/')) s = s.slice(basePath.length)
  } catch {
    s = s.split('?')[0]
  }
  try {
    s = decodeURIComponent(s)
  } catch {
    /* keep as is */
  }
  return s.replace(/^\/+/, '').toLowerCase()
}

/** Canonical link form: same-site links lose host, trailing slash, `index.php/` SEF prefix. */
export function normHref(href, siteUrl) {
  if (!href) return ''
  const raw = decodeEntities(String(href).trim())
  if (/^(mailto|tel|sms|callto|skype|whatsapp):/i.test(raw)) return raw.toLowerCase()
  try {
    const base = new URL(siteUrl)
    const u = new URL(raw, base)
    if (u.host !== base.host) return (u.host + u.pathname.replace(/\/$/, '') + u.search).toLowerCase()
    let p = u.pathname.replace(/\/$/, '') || '/'
    p = p.replace(/^\/index\.php(?=\/|$)/, '') || '/'
    return (p + u.search).toLowerCase()
  } catch {
    return raw.toLowerCase()
  }
}

export const basename = (p) => String(p).split('/').pop()
