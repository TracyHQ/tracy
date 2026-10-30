/**
 * The "brief facts not shown" list of the site plan (spec TracyHQ/tracy#231, ticket #241), made by code: every record of the
 * brief's fact sheet (`brief-fact-sheet.js`: offerings, people, reviews, posts, story lines, key messages) that the
 * accepted plan does not place anywhere gets one entry with its reason. The author's own entries keep their reason; code
 * adds the ones the author left out, so "why is X not on my site" is always answerable from the build record.
 * CMS-neutral and pure: no model, no template.
 */

const norm = (/** @type {unknown} */ s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v : [])

/** Sheet sections that hold records with a `sourceId`, and the words that identify a record in the plan. */
const SECTIONS = ['offerings', 'people', 'reviews', 'posts', 'story', 'keyMessages']
const KEY_CHARS = 40

/** The words that identify a record: its name or title or author, else the start of its text. */
function keysOf(/** @type {any} */ record) {
  const named = [record?.name, record?.title, record?.label, record?.author].map(norm).filter(Boolean)
  if (named.length) return named
  return [norm(record?.text).slice(0, KEY_CHARS)].filter(Boolean)
}

/** Everything the plan says, as one lowercase text: pages, glossary, card items, photos' reasons are not facts. */
function planText(/** @type {any} */ plan) {
  const parts = []
  for (const page of list(plan?.pages).filter((p) => ['keep', 'add'].includes(p?.decision)))
    parts.push(page.purpose, page.lead, ...list(page.facts), ...list(page.items))
  for (const g of list(plan?.glossary)) parts.push(g?.name, g?.description)
  for (const d of list(plan?.decisions).filter((d) => d?.decision !== 'hide')) parts.push(...list(d.items))
  return norm(parts.join(' \n '))
}

/**
 * The plan with its `outOfScope.brief` completed: the author's entries (each with a reason), then one entry for every
 * sheet record the plan does not place.
 * @param {any} plan @param {any} site - the brief site (`site.factSheet`)
 */
export function withBriefOutOfScope(plan, site) {
  if (!plan || typeof plan !== 'object') return plan
  const text = planText(plan)
  const authored = list(plan.outOfScope?.brief).filter((o) => o && typeof o === 'object' && o.sourceId)
  const listed = new Set(authored.map((o) => String(o.sourceId)))
  const entries = authored.map((o) => ({
    ...o,
    reason: String(o.reason ?? '').trim() || 'left out of this site'
  }))
  for (const section of SECTIONS)
    for (const record of list(site?.factSheet?.[section])) {
      const id = String(record?.sourceId ?? '')
      if (!id || listed.has(id)) continue
      const placed = text.includes(norm(id)) || keysOf(record).some((k) => text.includes(k))
      if (placed) continue
      listed.add(id)
      entries.push({
        sourceId: id,
        reason: `no page, glossary entry or card of the plan places this ${section.replace(/s$/, '')}`,
        by: 'default'
      })
    }
  return { ...plan, outOfScope: { ...(plan.outOfScope ?? {}), brief: entries } }
}
