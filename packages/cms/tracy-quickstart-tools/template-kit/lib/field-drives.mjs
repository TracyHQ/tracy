// What each stored field drives on the page, measured: the field is set alone to a marker no page holds, its pages are
// read for that marker (in printed words, or in an attribute such as a link's address), and the field is put back.
// Nothing else tells a field two buttons read, or a title that replaces the page's real one, from a field no page uses:
// their demo values ("#", the article's own title) look like anything. It writes to the site, so it runs only on a
// throwaway site rebuilt from the quickstart.
import { neutralKey } from './ids.mjs'

/** The slots a measurement can set whole: text or an address stored as a value of its own, not a piece of HTML. */
export const measurableFields = (map) =>
  (map.slots ?? []).filter(
    (s) => (s.type === 'text' || s.type === 'url') && !/\/(text\(\)(\[\d+\])?|@[\w-]+)$/.test(s.xpath ?? '')
  )

/**
 * @param {{fields: object[], pagesOf: (field: object) => string[], site: {set: Function, restore: Function,
 *   read: (path: string, marker: string) => object[]|Promise<object[]>}, log?: Function}} o
 * @returns {Promise<Record<string, {controls?: object[], error?: string}>>} by slot id
 */
export async function measureFieldDrives({ fields, pagesOf, site, log = () => {} }) {
  const out = {}
  for (const [i, field] of fields.entries()) {
    const id = neutralKey(field.key)
    const marker = `KITFIELD${i}MARK`
    try {
      await site.set(field, marker)
      const controls = []
      for (const path of pagesOf(field)) controls.push(...(await site.read(path, marker)))
      out[id] = { controls }
    } catch (e) {
      out[id] = { error: String(e?.message ?? e) }
      log('field-drives:', id, out[id].error)
    } finally {
      await site.restore(field)
    }
  }
  return out
}
