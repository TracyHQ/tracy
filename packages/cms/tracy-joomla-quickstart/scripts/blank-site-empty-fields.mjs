/**
 * The blank site step that empties every content field a mapping file declares (ticket #584, ADR 0045).
 *
 * The blank site keeps every demo block; its demo words, pictures and links stay in the rows until this step empties
 * every place the mapping file says a build writes (a field, or a place of a business fact). A record the blank site
 * deletes (a page, a contact, an account: `entities[].created`) is gone already; a design line keeps its value. Each
 * place becomes the empty string: a whole column, a value at a JSON path (inside a nested JSON value too), or a node
 * of an HTML value (`empty-html-places.php`, loaded the way the Claude Cowork plugin loads it). What the step writes:
 *   rows of the dump    blocks (modules), custom fields (fields), newsletter settings (acym_configuration);
 *   template files      `templates/<tpl>/local/etc/site/<profile>.json` (Site settings: the logos), the shipped
 *                       file with the places emptied and the setting overrides applied; `local/etc/global.json`
 *                       likewise (T4 reads a local file instead of the shipped one, without merging);
 *   language overrides  `language/overrides/<tag>.override.ini`: every template string a field fills, empty, and
 *                       every language override with a value.
 * The global configuration (site name, mail sender) is written by the installer, so it is reported, not changed.
 *
 * An UPDATE statement that sets a column of a row this step empties is folded into the row first (the UPDATE runs
 * after the INSERT at install, so emptying the row alone would leave the demo value in place).
 */

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { emptiedFiles, phpJson } from './blank-site-empty-files.mjs'
import { records, setValue, sqlUnquote } from './joomla-sql-dump.mjs'

export const EMPTY_HTML = fileURLToPath(new URL('./empty-html-places.php', import.meta.url))

/** Each emptied HTML value, by `empty-html-places.php` (one php run for all). */
export function emptyHtmlByPhp(entries, { php = 'php' } = {}) {
  if (!entries.length) return []
  return JSON.parse(execFileSync(php, [EMPTY_HTML], { input: JSON.stringify(entries), maxBuffer: 1 << 28 }))
}

const SQL_TABLES = { module: 'modules', field: 'fields', acymConfiguration: 'acym_configuration' }
const key = (loc) =>
  JSON.stringify([loc.entity, loc.column, loc.nestedJson ?? '', loc.jsonPath ?? [], loc.xpath ?? ''])

/** Every location of `value` (the blocks or facts of a mapping file), skipping derived and fact entries. */
function locationsIn(value, out = []) {
  if (Array.isArray(value)) for (const v of value) locationsIn(v, out)
  else if (value && typeof value === 'object') {
    if (Object.hasOwn(value, 'derived') || Object.hasOwn(value, 'fact')) return out
    if (typeof value.entity === 'string' && typeof value.column === 'string') out.push(value)
    else for (const v of Object.values(value)) locationsIn(v, out)
  }
  return out
}

/** The places of a mapping file a blank site empties: field and fact places of surviving records, no design line. */
export function placesToEmpty(mapping) {
  const design = new Set(Object.values(mapping.blocks ?? {}).flatMap((b) => (b.designLines ?? []).map(key)))
  const blocks = Object.values(mapping.blocks ?? {}).flatMap((b) =>
    locationsIn([b.fields, b.itemFields, b.lists, b.itemLists])
  )
  const seen = new Set()
  return [...blocks, ...locationsIn(mapping.facts ?? {})].filter((loc) => {
    const k = key(loc)
    if (design.has(k) || seen.has(k) || mapping.entities?.[loc.entity]?.created) return false
    seen.add(k)
    return true
  })
}

/** Fold `UPDATE #__<table> SET <column> = '<value>' WHERE id = <id>` statements into the rows they set. */
function foldUpdates(dump, table, ids) {
  let folded = 0
  dump.parts = dump.parts.filter((p) => {
    if (p.kind !== 'update' || p.table !== table || !ids.has(p.id)) return true
    const m =
      /^UPDATE `#__\w+` SET `(\w+)` = '((?:[^'\\]|\\.)*)' WHERE `id` = (\d+)(?: AND [^;]*)?;\s*$/s.exec(
        p.text
      )
    if (!m) throw new Error(`an UPDATE of ${table} ${p.id} sets more than one column: ${p.text.slice(0, 80)}`)
    setValue(dump, table, (r) => r.id === m[3], m[1], sqlUnquote(m[2]))
    folded += 1
    return false
  })
  return folded
}

/** Set every place of one column value to empty; HTML places are queued in `html` and filled in afterwards. */
function emptyValue(value, locs, html) {
  if (locs.some((l) => !l.jsonPath && !l.xpath)) return ''
  const plain = locs.filter((l) => !l.jsonPath)
  if (plain.length && plain.length < locs.length)
    throw new Error(`${locs[0].entity}.${locs[0].column}: an HTML value and JSON places in one column`)
  if (plain.length)
    return html.queue(
      value,
      plain.map((l) => l.xpath)
    )
  const outer = JSON.parse(value)
  const nested = new Map()
  const docOf = (name) => {
    if (!name) return outer
    if (!nested.has(name)) nested.set(name, JSON.parse(outer[name]))
    return nested.get(name)
  }
  const byPath = new Map()
  for (const l of locs) {
    const k = JSON.stringify([l.nestedJson ?? '', l.jsonPath])
    byPath.set(k, [...(byPath.get(k) ?? []), l])
  }
  for (const [k, at] of byPath) {
    const [name, steps] = JSON.parse(k)
    let holder = docOf(name)
    for (const s of steps.slice(0, -1)) holder = holder?.[s]
    const last = steps.at(-1)
    if (typeof holder?.[last] !== 'string') throw new Error(`${at[0].slot ?? at[0].entity}: no text at ${k}`)
    if (at.some((l) => !l.xpath)) holder[last] = ''
    else
      html.queue(
        holder[last],
        at.map((l) => l.xpath),
        (v) => (holder[last] = v)
      )
  }
  return () => {
    for (const [name, doc] of nested) outer[name] = phpJson(doc)
    return phpJson(outer)
  }
}

/**
 * The step: `{id: 'empty-declared-fields', run(ctx)}` for `produceBlankSite`. `readFile(name)` reads an entry of the
 * installer archive (a Buffer, or null); the files it writes go to `ctx.files`.
 */
export function emptyDeclaredFieldsStep({ mapping, readFile, emptyHtml = emptyHtmlByPhp }) {
  return {
    id: 'empty-declared-fields',
    run(ctx) {
      const places = placesToEmpty(mapping)
      const report = { places: places.length, rows: {}, folded: 0, files: [], byInstaller: [], htmlValues: 0 }
      const pending = []
      const html = {
        entries: [],
        queue(value, xpaths, set) {
          this.entries.push({ html: value, xpaths })
          let out = null
          pending.push({ at: this.entries.length - 1, set: set ?? ((v) => (out = v)) })
          return () => out
        }
      }
      const writes = []
      const byCell = new Map()
      for (const loc of places) {
        const entity = mapping.entities?.[loc.entity]
        const table = SQL_TABLES[entity?.kind]
        if (entity?.kind === 'globalConfiguration') report.byInstaller.push(`${loc.entity}.${loc.column}`)
        if (!table) continue
        const id = entity.kind === 'acymConfiguration' ? entity.identity.name : String(entity.sourceId)
        const cell = JSON.stringify([table, id, loc.column])
        byCell.set(cell, [...(byCell.get(cell) ?? []), loc])
      }
      for (const table of new Set([...byCell.keys()].map((c) => JSON.parse(c)[0])))
        report.folded += foldUpdates(
          ctx.dump,
          table,
          new Set(
            [...byCell.keys()]
              .map((c) => JSON.parse(c))
              .filter((c) => c[0] === table)
              .map((c) => c[1])
          )
        )
      for (const [cell, locs] of byCell) {
        const [table, id, column] = JSON.parse(cell)
        const match = table === 'acym_configuration' ? (r) => r.name === id : (r) => r.id === id
        const row = records(ctx.dump, table).find(match)
        if (!row) throw new Error(`${table} ${id} is not in the demo data`)
        const result = emptyValue(row[column] ?? '', locs, html)
        writes.push({ table, match, column, result })
        report.rows[table] = (report.rows[table] ?? 0) + 1
      }
      const done = emptyHtml(html.entries)
      done.forEach((r, i) => {
        if (r.error) throw new Error(`an HTML value cannot be emptied: ${r.error}`)
        pending[i].set(r.html)
      })
      report.htmlValues = html.entries.length
      for (const w of writes) {
        const value = typeof w.result === 'function' ? w.result() : w.result
        setValue(ctx.dump, w.table, w.match, w.column, value)
      }
      for (const [name, content] of emptiedFiles({ mapping, places, readFile })) {
        ctx.files.set(name, content)
        report.files.push(name)
      }
      return report
    }
  }
}
