// A blank site in memory behind the draft write's doors (ticket #597), the sibling of `write-order-memory-site.mjs`:
// the store records as the blank site keeps them (the blank site contract's lock rows), the contract slots (its content
// map), the HTML pieces (`write-order-memory-html.mjs`) and the refusals measured on a real blank site
// (`write-order-memory-rules.mjs`), ENFORCED so a plan or a step that breaks one fails its test.
//
// Replay, as measured on plugin 0.24.85 (docs/references/ai-quickstart-contract.md, "Replaying a request"): only
// `content.contract` keeps answers, under its apply id with its request id (the apply id when none is sent) and a hash
// of what it asked (`changes`, `removes`; never `expectedRevision`). The same apply id and request id with the same
// content answer the first answer again, whatever revision is sent; with other content, or a new request id under the
// same apply id, `contract_failed`. `content.update`, `media.upload` and `site.identity` keep no replay: the same apply
// id writes again on every call (`steps(applyId)` counts them, as `apply.list` does), so only the run record keeps a
// resumed run from making a record twice.
//
// Pure apart from its own memory. Scripted failures: `fail` (the n-th mutating call throws before it acts) and `crash`
// (`n` or `{at: n, before?}`: the n-th call acts, or not when `before`, then dies `fatal`). Spec: draft-write-step.md.
import { createHash } from 'node:crypto'
import { memoryHtml } from './write-order-memory-html.mjs'
import { memorySheetsOf } from './write-order-memory-sheets.mjs'
import { checkContract, checkUpdate, DoorRefusal, storedIdentity } from './write-order-memory-rules.mjs'

export { memoryHtml }
const list = (value) => (Array.isArray(value) ? value : [])
const START = { module: 1000, menuItem: 2000, article: 3000, category: 4000, contact: 5000 }
const IDENTITY = ['sitename', 'MetaDesc', 'sitename_pagetitles']
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
/** A payload's hash: its JSON with keys sorted, bytes by their own hash. */
const payloadHash = (payload) =>
  sha256(
    JSON.stringify(payload, (_, v) =>
      v instanceof Uint8Array
        ? `bytes:${sha256(v)}`
        : v && typeof v === 'object' && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
          : v
    )
  )

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
  const [assignments, uploads] = [new Map(), new Map()]
  const identity = {}
  const next = { ...START }
  const state = { calls: 0, log: [], revision: 1, answers: new Map(), steps: new Map() }
  /**
   * Every mutating call counts; a contract apply replayed within its apply id answers again or is refused (`replay`);
   * a scripted failure acts first (fail: before).
   */
  const act = (name, applyId, payload, check, run, replay = null) => {
    if (typeof applyId !== 'string' || applyId === '')
      throw new DoorRefusal('APPLY_ID_REQUIRED', `${name} has no apply id`)
    state.calls += 1
    const n = state.calls
    const hash = payloadHash(payload)
    const first = replay ? state.answers.get(applyId) : null
    if (first) {
      if (first.request !== replay.request)
        throw new DoorRefusal('contract_failed', 'Use one new apply_id per content revision')
      if (first.hash !== hash)
        throw new DoorRefusal('contract_failed', 'request_id reused with different content')
      return structuredClone(first.out)
    }
    const dies = (when) =>
      Object.assign(new Error(`scripted crash ${when} call ${n}`), { fatal: true, code: 'crash' })
    if (fail.includes(n))
      throw Object.assign(new Error(`scripted failure of call ${n}`), { code: 'door_failed' })
    check()
    if (crash?.at === n && crash.before) throw dies('before')
    const out = run()
    state.revision += 1
    if (replay) state.answers.set(applyId, { request: replay.request, hash, out: structuredClone(out) })
    state.steps.set(applyId, (state.steps.get(applyId) ?? 0) + 1)
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
        { kind, id: Number(id), fields },
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
    async contract({ applyId, requestId, expectedRevision, changes, removes = [] }) {
      const check = () =>
        checkContract(
          { expectedRevision, changes, removes },
          { slots, revision: state.revision, modules: records.module }
        )
      return act(
        'content.contract',
        applyId,
        { changes, removes },
        check,
        () => {
          for (const [key, value] of Object.entries(changes)) {
            const slot = slots.get(key)
            slot.current = String(value)
            const row = slot.column === 'title' && records.module.get(Number(slot.entity.slice(7)))
            if (row) row.title = slot.current
          }
          for (const key of removes) slots.get(key).removed = true
          return { ok: true }
        },
        { request: requestId ?? applyId }
      )
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
        { path, bytes: new Uint8Array(bytes) },
        () => {},
        () => {
          uploads.set(path, Buffer.from(bytes))
          return { path }
        }
      )
    },
    // The sha256 of the file at a path, or null (the real client reads the site's public file).
    async media({ path }) {
      return uploads.has(path) ? { sha256: sha256(uploads.get(path)) } : null
    },
    async identity({ applyId, fields }) {
      return act(
        'site.identity',
        applyId,
        { fields },
        () => {},
        () => {
          for (const [k, v] of Object.entries(fields))
            if (IDENTITY.includes(k)) identity[k] = storedIdentity(k, v)
          return { ok: true }
        }
      )
    },
    /** `site.identity` read: the site name, description and page title setting only. */
    async readIdentity() {
      return structuredClone(identity)
    },
    // The template's stylesheets (`write-order-memory-sheets.mjs`).
    sheets: async ({ variables } = {}) => memorySheetsOf(variables)
  }
  return {
    doors,
    site: { records, slots, assignments, uploads, identity },
    get calls() {
      return state.calls
    },
    /** How many writes an apply id made (`apply.list {apply_id}` lists one step per write). */
    steps: (applyId) => state.steps.get(applyId) ?? 0,
    log: state.log
  }
}
