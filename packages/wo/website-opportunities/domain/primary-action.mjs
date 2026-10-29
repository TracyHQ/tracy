// One business conversion action, selected by the research model. It owns words, never invents an endpoint.
const CHANNELS = new Set(['contact', 'booking', 'whatsapp', 'phone'])
const generic = (label) =>
  /^(?:contact(?: us)?|learn more)$/i.test(
    label
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  )
const text = (value) => typeof value === 'string' && value.trim().length > 0

/** Keep a model selection only on checked owner quotes, or mark its neutral kind-based inference explicitly. */
export function checkPrimaryAction(raw, sources, { quotedIn, labelQuoted, exactQuote }) {
  if (!raw || !text(raw.label) || !CHANNELS.has(raw.channel)) return null
  const label = raw.label.trim()
  if (label.length > 60 || /[\u2013\u2014\n\r]/u.test(label) || generic(label)) return null
  if (!['sourced', 'inferred'].includes(raw.basis)) return null
  const evidence = []
  for (const item of Array.isArray(raw.quotes) ? raw.quotes.slice(0, 3) : []) {
    const source = sources.find((s) => s.ref === item?.ref && s.kind !== 'review')
    if (!source || !quotedIn(item.quote, source)) return null
    evidence.push({
      quote: exactQuote(source.text, item.quote),
      source: {
        kind: source.kind,
        ref: source.ref,
        ...(source.url ? { url: source.url } : {}),
        ...(source.source ? { source: source.source } : {})
      }
    })
  }
  if (
    raw.basis === 'sourced' &&
    (!evidence.length || !labelQuoted(label, evidence.map((e) => e.quote).join(' ')))
  )
    return null
  return { label, channel: raw.channel, basis: raw.basis, evidence }
}

/** Resolve the selected channel from facts still on the site. A missing channel routes to this site's contact page. */
export function primaryActionOf(reading, { phone = null, whatsapp = null, booking = null } = {}) {
  const action = reading?.primaryAction
  if (!action || !text(action.label) || !CHANNELS.has(action.channel)) return null
  const href = {
    contact: null,
    phone: text(phone) ? `tel:${phone.replace(/[^\d+]/g, '')}` : null,
    whatsapp: whatsapp?.href ?? null,
    booking: booking?.verified === true && /^https?:\/\//i.test(booking.url) ? booking.url : null
  }[action.channel]
  return { ...action, channel: href ? action.channel : 'contact', href }
}

/** Cross-field check for a persisted brief: its primary action cannot point outside its real channel facts. */
export function primaryActionErrors(brief) {
  const action = brief.primaryAction
  if (action === undefined) return []
  if (
    !action ||
    !text(action.label) ||
    action.label.length > 60 ||
    generic(action.label) ||
    !CHANNELS.has(action.channel) ||
    !['sourced', 'inferred'].includes(action.basis) ||
    !Array.isArray(action.evidence) ||
    (action.basis === 'sourced' && !action.evidence.length) ||
    !action.evidence.every(
      (e) => text(e?.quote) && text(e?.source?.ref) && ['bio', 'post'].includes(e.source.kind)
    )
  )
    return ['must be a selected conversion action with owner evidence or an explicit inference']
  const expected = primaryActionOf(
    { primaryAction: action },
    {
      phone: brief.business?.phone,
      whatsapp:
        brief.contact?.whatsapp?.verified === false ||
        (brief.facts ?? []).some(
          (f) => f.id === brief.contact?.whatsapp?.factId && f.confidence === 'inferred'
        )
          ? null
          : brief.contact?.whatsapp,
      booking: (brief.integrations ?? []).find(
        (i) => i?.kind === 'booking' && i.verified === true && i.url === action.href
      )
    }
  )
  return expected.channel === action.channel && expected.href === action.href
    ? []
    : ['must use the exact channel URL supported by the brief, or contact with a null URL']
}
