// What the needs profile research takes from the brief's business reading (`brief.reading`, #609 defects of a real
// run): the reading's own lines, its services as typed items, its audience quotes and its About line. Without these the
// research read only `brief.facts`, so a founding year held only in `reading.facts` and the About line never reached the
// needs profile, and the reading's services were read again from plain quotes by the profile's model. Pure.
//   - a fact or story line (`reading.facts`, `reading.story`) gives its quote to the text of the source it names, so
//     the profile can ground it (a founding year as `business.founded_year`);
//   - a service (`reading.services`) becomes a typed item of the source it names, `{kind, fields, evidence, id}`, its
//     name and price as the reading kept them (`needs-profile-typed.mjs` takes them as they are);
//   - an audience quote is kept on its source as `audience`: a service the profile's model reads only from inside one
//     is not a service the business offers (`needs-profile-typed.mjs`);
//   - the About line (`reading.about`, words of the reading's quoted items only) rides on the sources of the items it
//     is made of, as `about`; the profile carries it as the business's summary (`business.summary`).
// A line, a service or an About line whose source the brief does not name, or that is longer than a fact value holds,
// is set aside with its reason. A brief without a reading gives nothing, so its research is what it was.
import { OWNER_STATEMENT_KIND } from './owner-statement.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
/** The longest About line the plan shows as one fact value (Contract B `facts[].value`). */
export const ABOUT_LIMIT = 200
/** The reading's service kinds (`serviceKindOf`) -> the needs profile's item kind and its name and price roles. */
const TYPED_KINDS = Object.freeze({
  service: ['service', 'offering.name', 'offering.price'],
  class: ['service', 'offering.name', 'offering.price'],
  membership: ['package', 'package.name', 'package.price'],
  package: ['package', 'package.name', 'package.price']
})
export const READING_ASIDE = Object.freeze({
  noSource: 'the reading names no source the needs profile knows for it',
  noQuote: 'a reading line without a quote',
  kind: 'a reading service kind the needs profile has no item kind for',
  aboutLong: `an About line longer than ${ABOUT_LIMIT} characters`,
  aboutSource: 'an About line made of no item whose source the needs profile knows'
})

/** The brief's source name (`needs-research.mjs` ORIGINS) of a reading item's source, or null. */
export function readingSourceName(source) {
  const s = source ?? {}
  if (s.kind === OWNER_STATEMENT_KIND) return OWNER_STATEMENT_KIND
  if (s.kind === 'website') return 'website'
  if (s.kind === 'review') return s.source === 'googleMaps' ? 'google-maps' : (s.source ?? 'google')
  if (s.kind === 'post' || s.kind === 'bio') return isText(s.source) ? s.source : null
  return null
}

/**
 * Add what the brief's reading holds to the research being made (`researchOf`).
 * @param {object} brief
 * @param {{sourceOf: (name: string) => object | null, addText: (source: object, words: string) => void,
 *   setAside: object[], taken: object}} research the research's own source maker and records
 */
export function addReadingOfBrief(brief, { sourceOf, addText, setAside, taken }) {
  const reading = brief?.reading
  if (!reading || typeof reading !== 'object') return
  const aside = (what, item, reason) =>
    setAside.push({ what, ...(isText(item?.id) ? { id: item.id } : {}), reason })
  const own = (item) =>
    item?.source?.kind === OWNER_STATEMENT_KIND ? null : sourceOf(readingSourceName(item?.source))
  const lines = []
  for (const item of [...list(reading.facts), ...list(reading.story)]) {
    const source = own(item)
    if (!isText(item?.quote)) aside('reading line', item, READING_ASIDE.noQuote)
    else if (!source) aside('reading line', item, READING_ASIDE.noSource)
    else {
      addText(source, item.quote.trim())
      lines.push(item.id)
    }
  }
  if (lines.length) taken.reading = lines
  const services = []
  for (const item of list(reading.services)) {
    if (!isText(item?.label)) continue
    const typed = TYPED_KINDS[item.kind ?? 'service']
    const source = sourceOf(readingSourceName(item.source))
    if (!typed) aside('reading service', item, READING_ASIDE.kind)
    else if (!source) aside('reading service', item, READING_ASIDE.noSource)
    else {
      const [kind, name, price] = typed
      const fields = {
        [name]: item.label.trim(),
        ...(isText(item.price) ? { [price]: item.price.trim() } : {})
      }
      source.items = [
        ...list(source.items),
        {
          id: item.id,
          kind,
          fields,
          evidence: item.quote ?? item.label,
          // The page it was read on: an event word on a news or events page marks an event (`needs-profile-events`).
          ...(isText(item.source?.url) ? { page: item.source.url } : {})
        }
      ]
      services.push(item.id)
    }
  }
  if (services.length) taken.services = services
  for (const item of list(reading.audience)) {
    const source = own(item)
    if (source && isText(item?.quote) && !list(source.audience).includes(item.quote.trim()))
      source.audience = [...list(source.audience), item.quote.trim()]
  }
  addAbout(reading, { sourceOf, setAside })
}

/** The About line on the sources of the items it is made of (else of the reading's lines), or set aside. */
function addAbout(reading, { sourceOf, setAside }) {
  if (!isText(reading.about)) return
  const about = reading.about.trim()
  if ([...about].length > ABOUT_LIMIT)
    return setAside.push({ what: 'about', reason: READING_ASIDE.aboutLong })
  const lower = about.toLowerCase()
  const made = [...list(reading.story), ...list(reading.services), ...list(reading.audience)].filter(
    (i) => isText(i?.label) && lower.includes(i.label.toLowerCase())
  )
  const items = made.length ? made : [...list(reading.facts), ...list(reading.story)]
  const sources = [...new Set(items.map((i) => sourceOf(readingSourceName(i?.source))).filter(Boolean))]
  if (!sources.length) return setAside.push({ what: 'about', reason: READING_ASIDE.aboutSource })
  for (const source of sources) source.about = about
}
