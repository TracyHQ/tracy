// The write path of the field measurement on Joomla: one stored field set to a marker and put back byte for byte. Only
// the content tables a content map names are reachable, and the value travels as hex, so no stored text can break the
// statement. `measure-fields` is the only caller, on a throwaway site.
const TABLES = {
  article: 'content',
  module: 'modules',
  menuItem: 'menu',
  category: 'categories',
  contact: 'contact_details',
  user: 'users'
}
const hex = (text) => Buffer.from(text, 'utf8').toString('hex')

/**
 * @param {{prefix: string, entities: {key: string, kind: string, sourceId: number}[], select: (sql: string) => object[],
 *   write: (sql: string) => void}} o
 */
export function joomlaFieldWriter({ prefix, entities, select, write }) {
  const byKey = new Map(entities.map((e) => [e.key, e]))
  const saved = new Map()
  const placeOf = (field) => {
    const e = byKey.get(field.entity)
    const table = TABLES[e?.kind]
    if (!table || !Number.isInteger(e?.sourceId) || !/^\w+$/.test(field.column ?? ''))
      throw new Error(`no table for ${field.entity}.${field.column}`)
    return { table: `${prefix}${table}`, id: e.sourceId, column: field.column }
  }
  const store = ({ table, id, column }, text) =>
    write(`UPDATE ${table} SET ${column}=x'${hex(text)}' WHERE id=${id}`)
  return {
    set(field, marker) {
      const place = placeOf(field)
      const rows = select(`SELECT ${place.column} AS value FROM ${place.table} WHERE id=${place.id}`)
      if (rows.length !== 1) throw new Error(`${field.key}: no stored row`)
      const stored = rows[0].value ?? ''
      saved.set(field.key, { place, stored })
      if (!field.jsonPath?.length) return store(place, marker)
      const doc = JSON.parse(stored || '{}')
      let at = doc
      for (const step of field.jsonPath.slice(0, -1)) at = at[step] ??= {}
      at[field.jsonPath.at(-1)] = marker
      return store(place, JSON.stringify(doc))
    },
    restore(field) {
      const had = saved.get(field.key)
      if (!had) return
      store(had.place, had.stored)
      saved.delete(field.key)
    }
  }
}
