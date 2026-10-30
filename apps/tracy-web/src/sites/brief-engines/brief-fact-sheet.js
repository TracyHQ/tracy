/**
 * 🔒 THE COPY WRITER IS GIVEN THE BRIEF'S DATA, NOT ONE SENTENCE OF IT (COO, 30/10/2026). Measured on R13 (padelr20): every
 * copy-plan call carried the brief's 141-character description, the phone, the address and the statistics, and nothing of
 * what the content brief holds: the offerings with their own words, the people, the reviews, the key messages, the
 * audience, the owner's posts beyond one offering's, the logo's own words. The writer cannot write good copy from facts it
 * is never shown.
 *
 * `briefFactSheet` reads the content brief (`wo_build` brief) into one compact, CMS-neutral sheet: every record with its
 * sourced words, never cut. The planner gives each call the whole sheet, except that a catalogue too large to travel with
 * every call (a restaurant of 150 dishes, a shop of 500 products) keeps the full records of the offerings the call writes
 * about and the names of the others (`fact-sheet-batch.mjs` of the seeder).
 */

/** Posts at most on the sheet, newest first: the owner's own words beyond the offerings'. */
export const POSTS_MAX = 20

const text = (/** @type {unknown} */ v) => (typeof v === 'string' ? v.trim() : '')
const unique = (/** @type {string[]} */ list) => [...new Set(list.filter(Boolean))]
const quoteOf = (/** @type {any} */ q) => text(q?.quote ?? q?.text)

/**
 * The fact sheet of a content brief, or null when there is no brief.
 * @param {any} brief - the content brief of a brief build
 */
export function briefFactSheet(brief) {
  if (!brief || typeof brief !== 'object') return null
  const reading = brief.reading ?? {}
  const assets = Array.isArray(brief.assets) ? brief.assets : []
  // 🔒 EVERY FACT CARRIES ITS OWN `sourceId` (COO, 30/10/2026, `fact-sources.mjs` of the seeder): a writer names the records
  // each specific fact it writes rests on, and a fact no cited record states is refused. Photo labels are numbered once.
  let photoCount = 0
  const photosOf = (/** @type {string} */ id) =>
    unique(assets.filter((a) => a?.depicts?.id === id).map((a) => text(a?.caption))).map((label) => ({
      sourceId: `photo-${(photoCount += 1)}`,
      label
    }))
  const offerings = (Array.isArray(reading.services) ? reading.services : [])
    .filter((s) => text(s?.label))
    .map((s, i) => {
      const photos = photosOf(s.id)
      return {
        sourceId: `offering-${i + 1}`,
        name: text(s.label),
        said: unique([quoteOf(s), ...(Array.isArray(s.mentions) ? s.mentions.map(quoteOf) : [])]),
        ...(photos.length ? { photos } : {})
      }
    })
  const people = (Array.isArray(reading.team) ? reading.team : [])
    .filter((p) => text(p?.label))
    .map((p, i) => {
      const photos = photosOf(p.id)
      return {
        sourceId: `person-${i + 1}`,
        name: text(p.label),
        ...(text(p.role) ? { role: text(p.role) } : {}),
        said: unique([quoteOf(p)]),
        ...(photos.length ? { photos } : {})
      }
    })
  const reviews = (Array.isArray(brief.googlePlace?.reviews) ? brief.googlePlace.reviews : [])
    .filter((r) => text(r?.text))
    .map((r, i) => ({
      sourceId: `review-${i + 1}`,
      text: text(r.text),
      ...(text(r.author) ? { author: text(r.author) } : {}),
      ...(Number.isFinite(r.rating) ? { rating: r.rating } : {})
    }))
  const posts = (Array.isArray(brief.content?.items) ? brief.content.items : [])
    .filter((it) => text(it?.body))
    .sort((a, b) =>
      String(b?.posts?.[0]?.publishedAt ?? '').localeCompare(String(a?.posts?.[0]?.publishedAt ?? ''))
    )
    .slice(0, POSTS_MAX)
    .map((it, i) => ({
      sourceId: `post-${i + 1}`,
      ...(text(it.title) ? { title: text(it.title) } : {}),
      text: text(it.body)
    }))
  const facts = Array.isArray(brief.facts) ? brief.facts : []
  // A fact the brief kept off the site (`onSite: false`: implausible hours, a rating) is not one the writer may state.
  const onSite = (/** @type {string} */ field) =>
    facts.filter((f) => f?.field === field && f?.onSite === true)
  const hours = onSite('hours').flatMap((f) => (Array.isArray(f.value) ? f.value : [f.value]).map(text))
  const serviceAreas = onSite('serviceAreas').flatMap((f) =>
    (Array.isArray(f.value) ? f.value : [f.value]).map(text)
  )
  const sheet = {
    ...(text(reading.about) ? { about: text(reading.about) } : {}),
    ...(Array.isArray(reading.story) && reading.story.length
      ? {
          story: unique(reading.story.map((s) => quoteOf(s) || text(s?.label))).map((line, i) => ({
            sourceId: `story-${i + 1}`,
            text: line
          }))
        }
      : {}),
    ...(Array.isArray(reading.audience) && reading.audience.length
      ? { audience: unique(reading.audience.map((a) => text(a?.label))) }
      : {}),
    ...(Array.isArray(brief.keyMessages) && brief.keyMessages.length
      ? {
          keyMessages: brief.keyMessages
            .filter((k) => text(k?.label))
            .map((k, i) => ({
              sourceId: `message-${i + 1}`,
              label: text(k.label),
              said: unique((k.quotes ?? []).map(quoteOf))
            }))
        }
      : {}),
    ...(offerings.length ? { offerings } : {}),
    ...(people.length ? { people } : {}),
    ...(reviews.length ? { reviews } : {}),
    ...(posts.length ? { posts } : {}),
    ...(hours.length ? { hours: unique(hours) } : {}),
    ...(serviceAreas.length ? { serviceAreas: unique(serviceAreas) } : {}),
    ...(text(brief.primaryAction?.label) ? { primaryAction: text(brief.primaryAction.label) } : {}),
    ...(text(brief.brand?.logoResearch?.chosen?.readsAs)
      ? { logoReads: text(brief.brand.logoResearch.chosen.readsAs) }
      : {})
  }
  return Object.keys(sheet).length ? sheet : null
}
