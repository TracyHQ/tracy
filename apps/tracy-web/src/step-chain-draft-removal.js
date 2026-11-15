// What takes a thing off a built site (#599), with the doors that exist (`siteDoors`, measured on plugin 0.24.85,
// docs/references/ai-quickstart-contract.md "Door measurements"). Nothing is ever deleted: no door deletes a record
// (`deleteRecord` answers DOOR_NOT_AVAILABLE).
//   hide       a record a build made that the site no longer needs (an item's article, a page's menu item, a category,
//              a contact): `published: 0` (an article: `state: 0`), shown on no page, its address 404
//   unassign   a module a build made, or a store module whose assignment a build wrote, that no page shows any more:
//              `menuids: "[]"`, the one "no page" value
// Each act names the operations it settles (`ops`), so the run record says what every act undoes. What only an
// unavailable door would settle stays a typed stop naming it (`stops`): a place written in place that a revision no
// longer writes (a contract slot, a record patch, the site identity: putting the blank site's value back needs a value
// no build kept, or `contract.removes`).
import { holdsSent, holdsWrote } from './step-chain-draft-wrote.js'
import { outsideEdit } from './step-chain-draft-journal.js'
import { placeHolds } from './step-chain-draft-place-value.js'

const list = (value) => (Array.isArray(value) ? value : [])
/** The record kinds a hide takes off every page (measured). */
export const HIDE_KINDS = new Set(['article', 'menuItem', 'category', 'contact'])
/** The operation kinds that make a module (a copy, a library block). */
const MODULE_MAKES = new Set(['module.copy', 'library.create'])
/** The column a hide writes, as the door client sends it. */
export const hiddenColumnOf = (kind) => (kind === 'article' ? 'state' : 'published')

/** The record kind an operation or a run record key makes: a module for a copy or a library block. */
export function madeKindOf(opKindOrKey) {
  const head = String(opKindOrKey).split(/[.:]/)[0]
  return head === 'copy' || head === 'library' || head === 'module' ? 'module' : head
}

/** The module id of a store record key (`store:module-176`), else null. */
const storeModuleOf = (key) => {
  const m = /^store:module-(\d+)$/.exec(key)
  return m ? Number(m[1]) : null
}

/**
 * How each operation the revision takes off the site is settled.
 * @param {{removed: Array<{key: string, kind: string}>, dropped: Array<{key: string, addresses: string[]}>}} delta
 *   the write delta (`writeDeltaOf`)
 * @param {{ids?: Record<string, number>}} previous the previous build's run record state
 * @returns {{acts: Array<{key: string, door: 'hide' | 'unassign', kind: string, id: number, ops: string[]}>,
 *   stops: Array<{key: string, door: string | null, why: string}>, notes: Array<{key: string, why: string}>}}
 */
export function removalActsOf(delta, previous) {
  const ids = previous?.ids ?? {}
  const removed = new Map(list(delta.removed).map((r) => [r.key, r]))
  const acts = new Map()
  const stops = []
  const notes = []
  const act = (door, kind, id, op) => {
    const key = door === 'hide' ? `hide:${kind}:${id}` : `unassign:${id}`
    const had = acts.get(key) ?? { key, door, kind, id, ops: [] }
    had.ops.push(op)
    acts.set(key, had)
  }
  for (const r of removed.values()) {
    const [head, ...rest] = r.key.split(':')
    const target = rest.join(':')
    if (r.kind === 'module.assign') {
      const id = ids[target] ?? storeModuleOf(target)
      if (id) act('unassign', 'module', Number(id), r.key)
      else stops.push({ key: r.key, door: null, why: 'module_id_unknown' })
    } else if (MODULE_MAKES.has(r.kind)) {
      if (ids[r.key] !== undefined) act('unassign', 'module', Number(ids[r.key]), r.key)
      else stops.push({ key: r.key, door: null, why: 'made_id_unknown' })
    } else if (String(r.kind).endsWith('.create')) {
      const kind = madeKindOf(r.kind)
      if (ids[r.key] !== undefined && HIDE_KINDS.has(kind)) act('hide', kind, Number(ids[r.key]), r.key)
      else stops.push({ key: r.key, door: 'deleteRecord', why: 'no_hide_for_kind' })
    } else if (r.kind === 'module.position' && MODULE_MAKES.has(removed.get(target)?.kind)) {
      notes.push({ key: r.key, why: 'position_of_a_module_on_no_page' })
    } else if (head === 'contract' && storeModuleOf(target) && removed.has(`assign:${target}`)) {
      // The slots of a store module that no page shows any more keep their words, shown on no page.
      notes.push({ key: r.key, why: 'words_left_on_a_module_on_no_page' })
    } else {
      stops.push({
        key: r.key,
        door: r.kind === 'contract.apply' ? 'contract.removes' : null,
        why: 'place_written_in_place'
      })
    }
  }
  for (const d of list(delta.dropped))
    stops.push({
      key: d.key,
      door: d.key.startsWith('contract:') ? 'contract.removes' : null,
      why: 'place_dropped'
    })
  return { acts: [...acts.values()], stops, notes }
}

/**
 * An act must find its record as Tracy left it: every place of the record (or the module's assignment) a build or this
 * run wrote holds what was written (`states`: `{wrote, shapes}` each), an earlier value this run sent (`undo.sent`),
 * its value before this run (`undo`), or for the hidden column of a hide 0 (the act ran before a crash). Else the owner
 * edited it and nothing is hidden over the edit (`code`, `site_changed_outside` by default). A record the owner deleted
 * outright is the same typed stop, naming the record.
 * A SHOW of a module (`act.show`, `step-chain-draft-show-again.js`) writes the module record again as well as its
 * pages: both are checked, and a module whose page list is gone stops too (nothing would put it back as Tracy left it).
 */
export async function checkAct(act, doors, states, undo, code = 'site_changed_outside') {
  if (act.door === 'unassign') {
    await checkAssignment(act, doors, states, undo, code)
    if (act.show) await checkRecord({ ...act, kind: 'module' }, doors, states, undo, code)
    return
  }
  await checkRecord(act, doors, states, undo, code)
}

const holdsOf = (states, undo) => (name, now, before) =>
  states.some((s) => holdsWrote(name, now, s)) ||
  holdsSent(name, now, undo) ||
  (before !== undefined && placeHolds(name, before, now))

const stopAt = (place, code) => Object.assign(outsideEdit(place), { code })

/** A door read that answers NOT_FOUND: the record (or its page list) is gone, read as null. */
async function readOrNull(doors, query) {
  try {
    return await doors.get(query)
  } catch (error) {
    if (error?.code === 'NOT_FOUND') return null
    throw error
  }
}

async function checkAssignment(act, doors, states, undo, code) {
  const name = `assignment:${act.id}`
  const now = (await readOrNull(doors, { kind: 'moduleAssignment', id: act.id }))?.menuids ?? null
  if (now === null) {
    if (act.show) throw stopAt(name, code)
    return
  }
  const kept = undo?.assignments?.[String(act.id)]
  const before = kept === undefined ? undefined : JSON.stringify(kept ?? [])
  const written = states.some((s) => s.wrote?.[name])
  if (placeHolds(name, '[]', now) || !written || holdsOf(states, undo)(name, now, before)) return
  throw stopAt(name, code)
}

async function checkRecord(act, doors, states, undo, code) {
  const prefix = `record:${act.kind}:${act.id}:`
  const row = await readOrNull(doors, { kind: act.kind, id: act.id })
  if (row === null) throw stopAt(prefix.slice(0, -1), code)
  const names = new Set(states.flatMap((s) => Object.keys(s.wrote ?? {}).filter((k) => k.startsWith(prefix))))
  const fields = undo?.records?.[`${act.kind}:${act.id}`]?.fields ?? {}
  const holds = holdsOf(states, undo)
  for (const name of names) {
    const column = name.slice(prefix.length)
    const now = row[column] ?? null
    if (act.door === 'hide' && column === hiddenColumnOf(act.kind) && Number(now) === 0) continue
    if (!holds(name, now, Object.hasOwn(fields, column) ? fields[column] : undefined))
      throw stopAt(name, code)
  }
}

/** What the report says of the acts: each record hidden or module put on no page, never deleted. */
export function removalFlagsOf(removal) {
  const of = (door) => removal.acts.filter((a) => a.door === door).flatMap((a) => a.ops)
  const flags = []
  if (of('hide').length) flags.push({ code: 'hidden_not_deleted', ops: of('hide') })
  if (of('unassign').length) flags.push({ code: 'on_no_page_not_deleted', ops: of('unassign') })
  if (removal.notes.length) flags.push({ code: 'left_on_no_page', ops: removal.notes.map((n) => n.key) })
  return flags
}
