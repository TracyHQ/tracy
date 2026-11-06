// W14 (ADR 0042, decision of 2026-11-04): a privacy page the plan creates is a complete policy for the business, not a
// retelling of the plan's line. Its body holds at least PRIVACY_MIN_PARAGRAPHS paragraphs and names at least
// PRIVACY_MIN_THEMES of the themes below, each found by keyword. Only when the plan creates a privacy page.
export const PRIVACY_MIN_PARAGRAPHS = 5
export const PRIVACY_MIN_THEMES = 4
export const PRIVACY_THEMES = [
  ['what is collected', /\b(collect\w*|data)\b/i],
  ['photos and videos', /\b(photo\w*|video\w*|image\w*)\b/i],
  ['sharing with third parties', /\b(shar(e|es|ed|ing)|third[ -]part(y|ies))\b/i],
  ['how long it is kept', /\b(retain\w*|retention|keep\w*|kept)\b/i],
  ['the visitor rights', /\b(rights?|request\w*|delet\w*)\b/i],
  ['how to get in touch', /\bcontact\w*\b/i]
]

/** The ids of the privacy pages the plan creates. */
const createdPrivacyPages = (plan) =>
  (Array.isArray(plan?.site?.legalPages) ? plan.site.legalPages : [])
    .filter((l) => l && l.use === 'create' && l.kind === 'privacy')
    .map((l) => (typeof l.id === 'string' ? l.id : `legal:${l.kind}`))

export function checkW14({ R, view, plan }) {
  for (const id of createdPrivacyPages(plan)) {
    const page = view.pages.find((p) => p.page === id)
    if (!page) continue // a missing or returned page is W02's business
    const paragraphs = page.body.filter((t) => t.trim() !== '')
    const text = paragraphs.join(' ')
    const missing = PRIVACY_THEMES.filter(([, re]) => !re.test(text)).map(([name]) => name)
    const named = PRIVACY_THEMES.length - missing.length
    if (paragraphs.length < PRIVACY_MIN_PARAGRAPHS)
      R.w14.fail(
        `${id} (body)`,
        `${id}: ${paragraphs.length} paragraphs, a privacy policy needs at least ${PRIVACY_MIN_PARAGRAPHS}`,
        'thin'
      )
    else if (named < PRIVACY_MIN_THEMES)
      R.w14.fail(
        `${id} (body)`,
        `${id}: names ${named} of the privacy themes, at least ${PRIVACY_MIN_THEMES} are needed; missing: ${missing.join(', ')}`,
        'thin'
      )
    else R.w14.ok()
  }
}
