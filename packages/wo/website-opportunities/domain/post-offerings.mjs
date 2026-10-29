// Conservative recovery of explicit own-post offers when a model overlooks them.
// These are grammatical offer statements, never trade-specific words or hashtag topics.
const CALL_TO_BUY = /\b(?:book|buy|order|shop|reserve|purchase|enrol|enroll)\b/iu
const EXCLUDED =
  /\b(?:one[- ]off|one[- ]time|pop[- ]up|partner(?:'s|s')?|sponsor(?:ed)?|giveaway|sold out|no longer|not available|(?:do|does|did)\s+not\s+(?:offer|sell|teach|provide)|(?:this|next)\s+(?:weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/iu
const OFFER =
  /\b(?:(?:join|try|book|buy|order|shop|discover)\s+our|we\s+(?:now\s+)?(?:offer|sell|teach|provide|stock)|introducing\s+our)\s+([^.!?;\n]+)/giu
const CLAUSE = /\s+(?:and|with|for|in|at|from|to|are|is|starting|every)\b/iu
const DATE =
  /\b(?:on\s+)?(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}|\d{4}-\d{2}-\d{2})\b/iu
const EVENT = /\b(?:gala|festival|concert|party|fundraiser|meetup|networking event)\b/iu
const RECURRING = /\b(?:every|weekly|daily|recurring|ongoing)\b/iu
const SLOGAN =
  /\b(?:unforgettable|amazing|incredible|best|exceptional)\s+(?:moments|experiences|memories|quality|service)\b/iu
const ACTIVITY =
  /\b(?:sessions?|lessons?|classes|class|coaching|courses?|training|workshops?|memberships?|treatments?|consultations?|tours?)$/iu
const normalized = (value) => String(value).normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase()

/** A one-off event, a partner's item or a hashtag alone is not evidence of an own offering. */
export function excludedPostOffer(source, quote = null) {
  if (source?.kind !== 'post') return false
  const prose = source.text.replace(/#[\p{L}\p{N}_]+/gu, '')
  const context =
    quote === null
      ? prose
      : (prose.split(/[.!?;\n]/u).find((line) => normalized(line).includes(normalized(quote))) ?? prose)
  // A starting date does not make a permanent offering a one-off event.
  const dated = DATE.test(context) && !/\b(?:from|starting)\b/iu.test(context) && !RECURRING.test(context)
  return (
    EXCLUDED.test(context) ||
    dated ||
    (EVENT.test(context) && !RECURRING.test(context)) ||
    SLOGAN.test(context) ||
    !normalized(prose) ||
    (quote !== null && !normalized(prose).includes(normalized(quote)))
  )
}

/** Exact noun phrases in an explicit offer plus a booking/purchase invitation, with their source intact. */
export function postOfferCandidates(sources) {
  const out = []
  for (const source of sources) {
    if (source.kind !== 'post' || !CALL_TO_BUY.test(source.text)) continue
    for (const match of source.text.matchAll(OFFER)) {
      const quote = match[1]
        .split(CLAUSE)[0]
        .trim()
        .replace(/[, :]+$/, '')
      // A long clause cannot safely be read as an offering name without a model.
      if (
        !quote ||
        quote.split(/\s+/u).length < 2 ||
        quote.split(/\s+/u).length > 5 ||
        /[#@\d]|https?:/iu.test(quote)
      )
        continue
      if (
        excludedPostOffer(source, quote) ||
        (/^(?:join|try|discover)\b/iu.test(match[0]) && !ACTIVITY.test(quote))
      )
        continue
      out.push({ label: quote.charAt(0).toUpperCase() + quote.slice(1), quote, source })
    }
  }
  return out
}
