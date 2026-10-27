/** Chat supplies an editable seed; the form and its served questions remain authoritative. */
const FEEDS = ['site.name', 'copy.about', 'copy.tone', 'site.languages']

/** Validate tab metadata again: a tab is not an API trust boundary. @param {unknown} raw */
export function chatDraftOf(raw) {
  const d = /** @type {any} */ (raw)
  if (
    !d ||
    d.version !== 1 ||
    !['create', 'import', 'business'].includes(d.intent) ||
    !/^\d{1,18}$/.test(d.sourceRevision)
  )
    return undefined
  if (d.platform != null && !['joomla', 'wordpress', 'emdash'].includes(d.platform)) return undefined
  if (!d.answersByFeed || typeof d.answersByFeed !== 'object' || Array.isArray(d.answersByFeed))
    return undefined
  /** @type {Record<string,string|string[]>} */
  const answersByFeed = {}
  for (const feed of FEEDS) {
    const value = d.answersByFeed[feed]
    if (feed === 'site.languages') {
      if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string')
        answersByFeed[feed] = value
    } else if (typeof value === 'string' && value.length <= (feed === 'copy.about' ? 300 : 200))
      answersByFeed[feed] = value
  }
  let importUrl
  if (typeof d.importUrl === 'string') {
    try {
      const url = new URL(d.importUrl)
      if (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === '/'
      )
        importUrl = url.origin
    } catch {
      /* An invalid address is never prefilled. */
    }
  }
  return {
    sourceRevision: String(d.sourceRevision),
    answersByFeed,
    importUrl,
    businessQuery:
      typeof d.businessQuery === 'string' && d.businessQuery.length <= 300 ? d.businessQuery : undefined
  }
}

/** Fill only unanswered fields, using the IDs, types and options actually served for this template.
 * @param {{id:string,kind:string,feeds?:string[],options?:string[]}[]} questions
 * @param {ReturnType<typeof chatDraftOf>} draft
 * @param {Record<string,unknown>} current
 * @returns {Record<string,string|string[]>}
 */
export function chatDraftAnswers(questions, draft, current) {
  /** @type {Record<string,string|string[]>} */
  const out = {}
  for (const q of questions) {
    if (current[q.id] != null) continue
    for (const feed of q.feeds ?? []) {
      const value = draft?.answersByFeed[feed]
      if ((q.kind === 'text' || q.kind === 'longtext') && typeof value === 'string')
        out[q.id] = value.slice(0, q.kind === 'longtext' ? 300 : 200)
      if (q.kind === 'choice' && typeof value === 'string' && q.options?.includes(value)) out[q.id] = value
      if (
        q.kind === 'languages' &&
        Array.isArray(value) &&
        value.length === 1 &&
        q.options?.includes(value[0])
      )
        out[q.id] = value
    }
  }
  return out
}
