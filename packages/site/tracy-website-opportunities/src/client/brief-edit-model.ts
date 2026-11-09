/**
 * Which lines of the brief cards (`brief-cards-model.ts`) the seller can edit (#524), and the path of the brief each one
 * holds, for `POST …/:id/revisions/:revId/edits`. Only a line that is one text of the brief maps to a path; a line made
 * from several (the hours, the socials) or from another list (the cuisine, the service areas) is not editable.
 */
type Rec = Record<string, unknown>
const rec = (v: unknown): Rec => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : {})
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** `card id + "\n" + line` → path in the brief, the first line of a text winning as on the cards. */
export function briefEditTargets(brief: unknown): Map<string, string> {
  const b = rec(brief)
  const business = rec(b.business)
  const reading = rec(b.reading)
  const out = new Map<string, string>()
  const put = (card: string, value: unknown, path: string): void => {
    const line = text(value)
    if (line !== null && !out.has(`${card}\n${line}`)) out.set(`${card}\n${line}`, path)
  }
  const labels = (card: string, items: unknown, base: string): void => {
    list(items).forEach((item, i) => put(card, rec(item).label, `${base}.${i}.label`))
  }
  put('who', reading.about, 'reading.about')
  labels('who', reading.story, 'reading.story')
  labels('offer', reading.services, 'reading.services')
  labels('standout', b.keyMessages, 'keyMessages')
  labels('standout', reading.facts, 'reading.facts')
  labels('serve', reading.audience, 'reading.audience')
  put('reach', business.address, 'business.address')
  put('reach', business.phone, 'business.phone')
  put('reach', business.website, 'business.website')
  return out
}

/**
 * The side-card tab title once an edit made a new brief: `Brief 3 · Pho Ba` becomes `Brief 4 · Pho Ba`. `label` is the
 * new brief's own words (`Brief {n}`); the place after the first ` · ` is kept, and a title without one is replaced.
 */
export function retitledBrief(title: string, label: string): string {
  const at = title.indexOf(' · ')
  return at < 0 ? label : `${label}${title.slice(at)}`
}
