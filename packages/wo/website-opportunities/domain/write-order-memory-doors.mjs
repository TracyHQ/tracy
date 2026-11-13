// A blank site in memory behind the draft write's doors (ticket #597), the sibling of `write-order-memory-site.mjs`:
// the store records as the blank site keeps them (the blank site contract's lock rows), the contract slots (its content
// map), and the plugin rules measured on a real blank site (#584), ENFORCED so a plan that breaks one fails its test:
//
//   content.contract   a slot of a removed record or an unknown slot: SLOT_UNKNOWN; `<` or `>`: SLOT_NOT_CONTENT; a
//                      straight double quote in a slot that opens empty: SLOT_NOT_CONTENT; an empty text node:
//                      HTML_SLOT_MISSING; over the slot's limit: SLOT_TOO_LONG; content map markers at an HTML slot:
//                      MARKERS_PRINTED_AS_WORDS (the real site stores and prints them as words); a module whose title
//                      the blank site emptied, written without its title in the same apply: MODULE_TITLE_REQUIRED
//   content.update     a new module with no title: MODULE_TITLE_REQUIRED (Joomla saves none); copies are not guarded
//
// Pure apart from its own memory. Scripted failures: `fail` (the n-th mutating call throws before it acts, a door that
// may pass when asked again) and `crash` (`n` or `{at: n, before?}`: the n-th mutating call acts, or does not when
// `before`, then the process "dies": an error marked `fatal`, so the resume of a run is tested at every boundary). Spec: docs/references/draft-write-step.md.
import { isTextNode } from './draft-write-codec.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const START = { module: 1000, menuItem: 2000, article: 3000, category: 4000, contact: 5000 }

/** The memory site's HTML pieces: written pieces kept beside the stored HTML (`<!--tracy-pieces {...}-->`). */
export const memoryHtml = {
  read(html) {
    const m = /^<!--tracy-pieces (.*?)-->/s.exec(html ?? '')
    return { pieces: m ? JSON.parse(m[1]) : {}, rest: m ? html.slice(m[0].length) : (html ?? '') }
  },
  write: (pieces, rest) => `<!--tracy-pieces ${JSON.stringify(pieces)}-->${rest}`,
  get(html, xpath) {
    return memoryHtml.read(html).pieces[xpath] ?? ''
  },
  set(html, xpath, value) {
    const { pieces, rest } = memoryHtml.read(html)
    return memoryHtml.write({ ...pieces, [xpath]: value }, rest)
  },
  remove(html, xpath) {
    const { pieces, rest } = memoryHtml.read(html)
    const kept = Object.fromEntries(Object.entries(pieces).filter(([k]) => !k.startsWith(xpath)))
    return memoryHtml.write({ ...kept, [`removed:${xpath}`]: true }, rest)
  }
}

class DoorRefusal extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`)
    this.code = code
  }
}

/**
 * @param {{lock: object, contentMap: object, fail?: number[], crash?: number | {at: number, before?: boolean}}} input the blank site contract's
 *   `presentation-lock.json` and `content-map.json`
 */
export function memoryDoors({ lock, contentMap, fail = [], crash = null }) {
  const records = {
    module: new Map(),
    menuItem: new Map(),
    article: new Map(),
    category: new Map(),
    contact: new Map()
  }
  for (const [entity, row] of Object.entries(lock.entities ?? {}))
    if (entity.startsWith('module-'))
      records.module.set(Number(entity.slice(7)), { ...row, id: Number(entity.slice(7)) })
  const slots = new Map(list(contentMap.slots).map((s) => [s.key, { ...s, current: s.sample ?? '' }]))
  const assignments = new Map()
  const uploads = new Map()
  const identity = {}
  const next = { ...START }
  const state = { calls: 0, log: [] }
  /** Every mutating call counts; a scripted failure acts first (fail: before, crash: after). */
  const act = (name, run) => {
    state.calls += 1
    const n = state.calls
    const dies = (when) =>
      Object.assign(new Error(`scripted crash ${when} call ${n}`), { fatal: true, code: 'crash' })
    if (fail.includes(n))
      throw Object.assign(new Error(`scripted failure of call ${n}`), { code: 'door_failed' })
    if (crash?.at === n && crash.before) throw dies('before')
    const out = run()
    state.log.push(name)
    if (crash === n || (crash?.at === n && !crash.before)) throw dies('after')
    return out
  }
  const tableOf = (kind) => {
    if (!records[kind]) throw new DoorRefusal('KIND_UNKNOWN', kind)
    return records[kind]
  }
  const doors = {
    html: memoryHtml,
    async get({ kind, id }) {
      const row = tableOf(kind).get(Number(id))
      if (!row) throw new DoorRefusal('NOT_FOUND', `${kind} ${id}`)
      return structuredClone(row)
    },
    async find({ kind, mark }) {
      for (const row of tableOf(kind).values()) if (row.note === mark || row.alias === mark) return row.id
      return null
    },
    async update({ kind, id, fields }) {
      return act(`update ${kind}`, () => {
        if (kind === 'moduleAssignment') {
          assignments.set(Number(id), JSON.parse(fields.menuids))
          return { id: Number(id) }
        }
        const table = tableOf(kind)
        if (Number(id) === 0) {
          if (kind === 'module' && !String(fields.title ?? '').trim())
            throw new DoorRefusal('MODULE_TITLE_REQUIRED', 'Module must have a title')
          const made = next[kind]++
          table.set(made, { ...structuredClone(fields), id: made })
          return { id: made }
        }
        const row = table.get(Number(id))
        if (!row) throw new DoorRefusal('NOT_FOUND', `${kind} ${id}`)
        table.set(Number(id), { ...row, ...structuredClone(fields) })
        return { id: Number(id) }
      })
    },
    async contract({ changes, removes = [] }) {
      for (const [key, value] of Object.entries(changes)) {
        const slot = slots.get(key)
        if (!slot) throw new DoorRefusal('SLOT_UNKNOWN', key)
        const text = String(value)
        if (/[<>]/.test(text)) throw new DoorRefusal('SLOT_NOT_CONTENT', `${key} holds a tag`)
        if (slot.opensEmpty && text.includes('"'))
          throw new DoorRefusal('SLOT_NOT_CONTENT', `${key} holds a straight quote`)
        if (text === '' && isTextNode(slot)) throw new DoorRefusal('HTML_SLOT_MISSING', key)
        if (slot.maxCharacters && text.length > slot.maxCharacters)
          throw new DoorRefusal('SLOT_TOO_LONG', key)
        if (slot.xpath && /\(\(\/?[a-z]/i.test(text)) throw new DoorRefusal('MARKERS_PRINTED_AS_WORDS', key)
      }
      const touched = new Set(
        Object.keys(changes)
          .map((k) => slots.get(k).entity)
          .filter((e) => e.startsWith('module-'))
      )
      for (const entity of touched) {
        const row = records.module.get(Number(entity.slice(7)))
        const titleSlot = [...slots.values()].find((s) => s.entity === entity && s.column === 'title')
        if (row && !String(row.title ?? '').trim() && !(titleSlot && titleSlot.key in changes))
          throw new DoorRefusal('MODULE_TITLE_REQUIRED', `${entity}: Module must have a title`)
      }
      for (const key of removes) if (!slots.has(key)) throw new DoorRefusal('SLOT_UNKNOWN', key)
      return act('content.contract', () => {
        for (const [key, value] of Object.entries(changes)) {
          const slot = slots.get(key)
          slot.current = String(value)
          const row = slot.column === 'title' && records.module.get(Number(slot.entity.slice(7)))
          if (row) row.title = slot.current
        }
        for (const key of removes) slots.get(key).removed = true
        return { ok: true }
      })
    },
    async read({ slots: keys }) {
      return Object.fromEntries(
        keys.map((k) => [k, slots.get(k)?.removed ? null : (slots.get(k)?.current ?? null)])
      )
    },
    async upload({ path, bytes }) {
      return act('media.upload', () => {
        uploads.set(path, bytes.length)
        return { path }
      })
    },
    async identity({ fields }) {
      return act('site.identity', () => Object.assign(identity, fields))
    }
  }
  return {
    doors,
    site: { records, slots, assignments, uploads, identity },
    get calls() {
      return state.calls
    },
    log: state.log
  }
}
