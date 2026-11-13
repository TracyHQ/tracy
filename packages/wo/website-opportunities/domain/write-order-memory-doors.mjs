// A blank site in memory behind the draft write's doors (ticket #597), the sibling of `write-order-memory-site.mjs`:
// the store records as the blank site keeps them (the blank site contract's lock rows), the contract slots (its content
// map), the HTML pieces (`write-order-memory-html.mjs`) and the refusals measured on a real blank site
// (`write-order-memory-rules.mjs`), ENFORCED so a plan or a step that breaks one fails its test.
//
// The door interface rule the memory site also holds the step to: every write carries an apply id, one per door call,
// and a replayed apply id answers the first answer again and changes nothing (the real client keeps it: the plugin's
// `content.contract` takes a `request_id` retry key, its `content.update` keeps none).
//
// Pure apart from its own memory. Scripted failures: `fail` (the n-th mutating call throws before it acts, a door that
// may pass when asked again) and `crash` (`n` or `{at: n, before?}`: the n-th mutating call acts, or does not when
// `before`, then the process "dies": an error marked `fatal`, so the resume of a run is tested at every boundary).
// Spec: docs/references/draft-write-step.md.
import { createHash } from 'node:crypto'
import { memoryHtml } from './write-order-memory-html.mjs'
import { checkContract, checkUpdate, DoorRefusal } from './write-order-memory-rules.mjs'

export { memoryHtml }

const list = (value) => (Array.isArray(value) ? value : [])
const START = { module: 1000, menuItem: 2000, article: 3000, category: 4000, contact: 5000 }
const IDENTITY = ['sitename', 'MetaDesc', 'sitename_pagetitles']
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/**
 * @param {{lock: object, contentMap: object, fail?: number[], crash?: number | {at: number, before?: boolean}}} input the
 *   blank site contract's `presentation-lock.json` and `content-map.json`
 */
export function memoryDoors({ lock, contentMap, fail = [], crash = null }) {
  const records = Object.fromEntries(Object.keys(START).map((kind) => [kind, new Map()]))
  for (const [entity, row] of Object.entries(lock.entities ?? {}))
    if (entity.startsWith('module-'))
      records.module.set(Number(entity.slice(7)), { ...row, id: Number(entity.slice(7)) })
  const slots = new Map(list(contentMap.slots).map((s) => [s.key, { ...s, current: s.sample ?? '' }]))
  const assignments = new Map()
  const uploads = new Map()
  const identity = {}
  const next = { ...START }
  const state = { calls: 0, log: [], revision: 1, answers: new Map() }
  /** Every mutating call counts; a replayed apply id answers again; a scripted failure acts first (fail: before). */
  const act = (name, applyId, check, run) => {
    if (typeof applyId !== 'string' || applyId === '')
      throw new DoorRefusal('APPLY_ID_REQUIRED', `${name} has no apply id`)
    state.calls += 1
    const n = state.calls
    if (state.answers.has(applyId)) return structuredClone(state.answers.get(applyId))
    const dies = (when) =>
      Object.assign(new Error(`scripted crash ${when} call ${n}`), { fatal: true, code: 'crash' })
    if (fail.includes(n))
      throw Object.assign(new Error(`scripted failure of call ${n}`), { code: 'door_failed' })
    check()
    if (crash?.at === n && crash.before) throw dies('before')
    const out = run()
    state.revision += 1
    state.answers.set(applyId, structuredClone(out))
    state.log.push(name)
    if (crash === n || (crash?.at === n && !crash.before)) throw dies('after')
    return out
  }
  const doors = {
    html: memoryHtml,
    async inspect() {
      return { revision: state.revision }
    },
    async get({ kind, id }) {
      if (kind === 'moduleAssignment') {
        if (!assignments.has(Number(id))) throw new DoorRefusal('NOT_FOUND', `assignment ${id}`)
        return { menuids: JSON.stringify(assignments.get(Number(id))) }
      }
      const row = records[kind]?.get(Number(id))
      if (!row) throw new DoorRefusal('NOT_FOUND', `${kind} ${id}`)
      return structuredClone(row)
    },
    async find({ kind, mark }) {
      for (const row of records[kind]?.values() ?? [])
        if (row.note === mark || row.alias === mark) return row.id
      return null
    },
    async update({ applyId, kind, id, fields }) {
      return act(
        `update ${kind}`,
        applyId,
        () => checkUpdate({ kind, id, fields }, records),
        () => {
          if (kind === 'moduleAssignment') {
            assignments.set(Number(id), JSON.parse(fields.menuids))
            return { id: Number(id) }
          }
          const table = records[kind]
          if (Number(id) === 0) {
            const made = next[kind]++
            table.set(made, { ...structuredClone(fields), id: made })
            return { id: made }
          }
          table.set(Number(id), { ...table.get(Number(id)), ...structuredClone(fields) })
          return { id: Number(id) }
        }
      )
    },
    async contract({ applyId, expectedRevision, changes, removes = [] }) {
      const check = () =>
        checkContract(
          { expectedRevision, changes, removes },
          { slots, revision: state.revision, modules: records.module }
        )
      return act('content.contract', applyId, check, () => {
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
    async upload({ applyId, path, bytes }) {
      return act(
        'media.upload',
        applyId,
        () => {},
        () => {
          uploads.set(path, Buffer.from(bytes))
          return { path }
        }
      )
    },
    /** The sha256 of the file at a path, or null (the real client reads the site's public file). */
    async media({ path }) {
      return uploads.has(path) ? { sha256: sha256(uploads.get(path)) } : null
    },
    async identity({ applyId, fields }) {
      return act(
        'site.identity',
        applyId,
        () => {},
        () => {
          for (const [key, value] of Object.entries(fields)) if (IDENTITY.includes(key)) identity[key] = value
          return { ok: true }
        }
      )
    },
    /** `site.identity` read: the site name, description and page title setting only. */
    async readIdentity() {
      return structuredClone(identity)
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
