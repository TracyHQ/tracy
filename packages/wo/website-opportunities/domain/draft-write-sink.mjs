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
 * Set a value at a location of a record. The first value of an address wins; a later entry for the same address is
 * listed as skipped (`address_shared`), with whether it agrees, since a place shared by several pages or fields is
 * written once.
 */
export function put(sink, key, loc, value, { entry, rule, init }) {
  const record = recordOf(sink, key, init)
  const address = addressOf(loc)
  const held = record.values.get(address)
  if (held) {
    if (entry && held.entry !== entry && !sink.consumed.has(entry))
      skip(sink, entry, 'address_shared', {
        by: held.entry,
        record: key,
        same: JSON.stringify(held.value) === JSON.stringify(value)
      })
    return record
  }
  record.values.set(address, { loc, value, entry: entry ?? null, rule })
  if (rule) record.rules.add(rule)
  if (entry) consume(sink, entry, key)
  return record
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
