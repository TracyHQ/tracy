// The plan data of the write order (ticket #597): the value a data field takes, and the index of every plan id the
// order may name, so `checkWriteOrder` holds each data value to the plan from the order alone. Pure.
import { ANSWER_SOURCE } from './plan-answers.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
/** A data value as the site writes it: text, or a finite number as text. */
export const valueText = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : isText(value) ? value : null

/** The value of one field of a plan item, as text (the first text of a list value), or null. */
export function itemValueOf(entry, kind) {
  const raw = entry?.source?.fields?.[kind]?.value
  return valueText(Array.isArray(raw) ? raw.find((v) => valueText(v) !== null) : raw)
}

/**
 * The plan data value of a field, with the plan id it came from, or null: an item place reads its item's field; a
 * block place reads a fact of the field's kind the block shows, else the one item it shows when its data is that item
 * alone (a detail block whose name is its item's name).
 */
export function dataValueOf(at, field, data) {
  if (at.row) return null
  if (at.item !== undefined) {
    const entry = data.byId.get(at.item)
    if (entry?.what === 'fact')
      return entry.kind === field.kind && isText(entry.entry.value)
        ? { value: entry.entry.value, data: at.item }
        : null
    const value = itemValueOf(entry, field.kind)
    return value === null ? null : { value, data: at.item }
  }
  const ids = list(at.blockData)
  for (const id of ids) {
    const entry = data.byId.get(id)
    if (entry?.what === 'fact' && entry.kind === field.kind && isText(entry.entry.value))
      return { value: entry.entry.value, data: id }
  }
  const items = ids.filter((id) => data.byId.get(id)?.what === 'item')
  if (items.length !== 1) return null
  const value = itemValueOf(data.byId.get(items[0]), field.kind)
  return value === null ? null : { value, data: items[0] }
}

/** Whether a plan item holds a value in one of its fields. */
const itemHolds = (entry, value) =>
  Object.values(entry?.source?.fields ?? {}).some((f) =>
    (Array.isArray(f?.value) ? f.value : [f?.value]).some((v) => valueText(v) === value)
  )

/**
 * The plan id holding a value, matched exactly, never guessed: a fact holding it, else the item of the place, else the
 * one item the block shows that holds it, else a row of such an item; null when none holds it.
 */
export function dataIdOf(value, at, data) {
  for (const [id, entry] of data.byId) if (entry.what === 'fact' && entry.entry.value === value) return id
  if (at.item !== undefined) return at.item
  const items = list(at.blockData).filter((id) => itemHolds(data.byId.get(id), value))
  if (items.length === 1) return items[0]
  const owners = new Set(list(at.blockData))
  const rows = [...(data.rowsById?.values() ?? [])].filter(
    (row) =>
      owners.has(row.owner) && Object.values(row.values ?? {}).some((parts) => list(parts).includes(value))
  )
  return rows.length === 1 ? rows[0].id : null
}

/**
 * Every plan id the order may name, with its values: the facts (`from: 'answer'` when the customer answered it), the
 * items with their field values, the child list rows with theirs, and the sources (`source:<id>`).
 */
export function dataIndexOf(data, profile) {
  const values = (fields) =>
    Object.fromEntries(
      Object.entries(fields ?? {})
        .map(([kind, f]) => [kind, list(Array.isArray(f?.value) ? f.value : [f?.value]).map(valueText)])
        .map(([kind, parts]) => [kind, parts.filter((v) => v !== null)])
        .filter(([, parts]) => parts.length > 0)
    )
  return {
    facts: data.facts.map(({ id, kind, value }) => ({
      kind,
      value,
      data: id,
      ...(list(data.byId.get(id)?.source?.sources).includes(ANSWER_SOURCE) ? { from: 'answer' } : {})
    })),
    items: data.items.map(({ id, kind }) => ({
      data: id,
      kind,
      values: values(data.byId.get(id).source.fields)
    })),
    rows: [...(data.rowsById?.values() ?? [])].map((row) => ({ data: row.id, values: row.values })),
    sources: list(profile?.sources)
      .filter((s) => isText(s?.id))
      .map((s) => ({ data: `source:${s.id}`, origin: s.origin ?? null }))
  }
}
