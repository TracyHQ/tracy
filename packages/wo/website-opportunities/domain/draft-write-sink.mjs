// Where the draft write planner gathers what each record of the site receives (ticket #597), before it orders the
// door operations. Pure. A record is named by a stable key (`copy:<page>.<block>`, `copy:site.<block>`,
// `store:<entity>`, `article:<subject>`, `menuItem:<menu>:<page>`, `category:<page type>`, `contact:<subject>`,
// `identity`), the key the run record keeps its site id under, so a run resumed after a crash finds it again.
import { addressOf } from './draft-write-codec.mjs'

/** An empty sink. */
export function sinkOf() {
  return { records: new Map(), skipped: [], unproven: [], consumed: new Map() }
}

/**
 * The record of `key`, made on first use.
 * @param {object} sink
 * @param {string} key
 * @param {object} init `{kind: 'copy' | 'store' | 'created' | 'identity', recordKind, entity?, ...}`
 */
export function recordOf(sink, key, init) {
  if (!sink.records.has(key))
    sink.records.set(key, {
      key,
      ...init,
      values: new Map(),
      cuts: [],
      removes: [],
      pages: new Set(),
      entries: [],
      rules: new Set()
    })
  return sink.records.get(key)
}

/**
 * Set a value at a location of a record. A place shared by several pages or fields is written once: a later entry for
 * the same address is skipped. When it agrees, as `address_shared`. When it differs, the entry of the record's own
 * subject page wins (`own`: the service page's own words over a teaser of it on the home page), and the entry it
 * replaces is skipped; any other difference keeps the first value. Either way the losing entry is skipped as
 * `address_conflict`, which the coverage and the run report list apart (entry ids and lengths, never the text).
 */
export function put(sink, key, loc, value, { entry, rule, init, own = false }) {
  const record = recordOf(sink, key, init)
  const address = addressOf(loc)
  const held = record.values.get(address)
  if (held) {
    if (!entry || held.entry === entry || sink.consumed.has(entry)) return record
    const same = JSON.stringify(held.value) === JSON.stringify(value)
    if (same) {
      skip(sink, entry, 'address_shared', { by: held.entry, record: key, same })
      return record
    }
    if (own && !held.own && held.entry) {
      record.values.set(address, { loc, value, entry, rule, own })
      if (rule) record.rules.add(rule)
      // The replaced entry stays written only while another value of the record still carries it.
      if (![...record.values.values()].some((v) => v.entry === held.entry)) release(sink, held.entry, key)
      skip(sink, held.entry, 'address_conflict', { by: entry, record: key, kept: 'own_page' })
      consume(sink, entry, key)
      return record
    }
    skip(sink, entry, 'address_conflict', { by: held.entry, record: key, kept: 'first' })
    return record
  }
  record.values.set(address, { loc, value, entry: entry ?? null, rule, own })
  if (rule) record.rules.add(rule)
  if (entry) consume(sink, entry, key)
  return record
}

/** An entry no longer written by record `key` (its value was replaced). */
function release(sink, entry, key) {
  if (sink.consumed.get(entry) !== key) return
  sink.consumed.delete(entry)
  const entries = sink.records.get(key)?.entries
  if (entries?.includes(entry)) entries.splice(entries.indexOf(entry), 1)
}

/** An entry consumed by the operation of record `key` (the first one, when a fact fans out). */
export function consume(sink, entry, key) {
  if (!sink.consumed.has(entry)) {
    sink.consumed.set(entry, key)
    sink.records.get(key)?.entries.push(entry)
  }
}

/** An entry left unwritten, with its reason. */
export function skip(sink, entry, reason, details = {}) {
  sink.skipped.push({ entry, reason, ...details })
}

/** Something the plan does that no real site measurement has proved yet, typed. */
export function unproven(sink, code, details = {}) {
  sink.unproven.push({ code, ...details })
}
