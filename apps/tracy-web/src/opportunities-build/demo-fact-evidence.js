/** Content-only evidence for the QA fact matcher, never a replacement for frozen research. */
export const QA_EVIDENCE_MAX = 400_000

// These are business/content fields, not a recursive walk through provider metadata or media URLs.
const CONTENT_FIELDS = new Set([
  'name',
  'title',
  'text',
  'caption',
  'message',
  'body',
  'bio',
  'about',
  'description',
  'googlePlace',
  'phoneNumber',
  'internationalPhoneNumber',
  'nationalPhoneNumber',
  'phone',
  'telephone',
  'email',
  'address',
  'formattedAddress',
  'formatted_address',
  'streetAddress',
  'street',
  'city',
  'locality',
  'region',
  'postalCode',
  'country',
  'hours',
  'openingHours',
  'opening_hours',
  'regularOpeningHours',
  'weekdayDescriptions',
  'weekday_text',
  'hoursCheck',
  'price',
  'currency',
  'priceScale',
  'size',
  'section',
  'items',
  'sections',
  'content'
])

/** Strip link destinations and markup: a number in a media URL or attribute is no business fact. */
function contentText(value) {
  return String(value)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/[^\s<>]+/gi, ' ')
}

/**
 * Exact segments in first-occurrence order; every occurrence points back into the immutable bundle.
 * Splitting after punctuation only saves repeated boilerplate: segments are not verified claims.
 */
export function demoFactEvidence(bundle) {
  const segments = new Map()
  const visit = (value, path, sourceId = null, sourceHash = bundle.hash) => {
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) {
      const parts = contentText(value).split(/(?<=[.!?])\s+/)
      for (const [part, raw] of parts.entries()) {
        const text = raw.trim()
        if (!text) continue
        const occurrence = { path, part, sourceId, sourceHash }
        const held = segments.get(text)
        if (held) held.occurrences.push(occurrence)
        else segments.set(text, { text, occurrences: [occurrence] })
      }
    } else if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) visit(item, `${path}[${index}]`, sourceId, sourceHash)
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value))
        if (CONTENT_FIELDS.has(key)) visit(item, `${path}.${key}`, sourceId, sourceHash)
    }
  }
  visit(bundle.profile, 'profile')
  visit(bundle.menu?.items, 'menu.items')
  visit(bundle.posts, 'posts')
  for (const [index, source] of (bundle.sources ?? []).entries()) {
    const collected = source.data?.collected
    for (const [key, value] of Object.entries(collected ?? {}))
      if (CONTENT_FIELDS.has(key) || ['profile', 'pages', 'posts', 'menuItems', 'menus'].includes(key))
        visit(value, `sources[${index}].data.collected.${key}`, source.id, source.hash)
  }
  return [...segments.values()]
}

/** Never judge against a silently truncated corpus. Count the exact text sent across the host boundary. */
export function checkedFactText(prose, segments) {
  const text = `${prose}\n${segments.map((segment) => segment.text).join('\n')}`
  if (text.length > QA_EVIDENCE_MAX) {
    const error = new Error('QA fact evidence exceeds its complete-text budget')
    error.code = 'DEMO_QA_EVIDENCE_TOO_LARGE'
    error.detail = { chars: text.length, maxChars: QA_EVIDENCE_MAX, segments: segments.length }
    throw error
  }
  return text
}
