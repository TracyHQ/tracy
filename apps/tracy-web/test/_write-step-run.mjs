// Fixtures for the write step's entry point: a fake site door that answers as the plugin does, including per-slot
// refusals, and frozen input files in a temporary folder. The kit, plan and copy are the invented ones of the copy check
// tests (demo-gym, Quay Fitness Studio); nothing here is a real business.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { contentMapKey } from '../src/lib/site-copy/contract-mapping.js'
import { runWriteStep } from '../src/write-step/write-step.js'
import { copy as baseCopy, kit as baseKit, plan as checkedPlan } from './_site-copy-check.mjs'

export const CONTRACT = 'demo-gym/j6/1.0.0'
export const SITE = 'write-bench-abc.sites.example'

/** The invented plan, with its privacy page on a kit page: only the tests of a created page ask for one (`_write-step-pages.mjs`). */
function basePlan() {
  const plan = checkedPlan()
  plan.site.legalPages = plan.site.legalPages.map((page) => ({ ...page, use: 'page-about' }))
  return plan
}

export const KIT = () => ({ ref: CONTRACT, doc: { ...baseKit(), contract: CONTRACT } })

/** Every kit slot of a kit, as the site's inspect lists them. */
function siteSlots(kit, extra) {
  const ids = kit.blocks.flatMap((b) => [
    ...(b.slots ?? []),
    ...(b.lists ?? []).flatMap((l) => [
      ...(l.rowSlots ?? []),
      ...(l.rows ?? []).flatMap((r) => r.slots ?? [])
    ])
  ])
  const keys = new Set([...ids.map((s) => contentMapKey(s.id)), ...extra])
  return [...keys].map((key) => ({ key, entity: key.slice(0, key.lastIndexOf('.')), canHide: 'unmeasured' }))
}

/**
 * A site behind the door. `refuse` maps a content map key to the entry the plugin lists for it; while a refused key is in
 * the changes the whole apply is refused and nothing lands. `answers` overrides the next apply answers, in order.
 * The hide orders (write-step/hide-stage.js) are answered as the plugin does, see `hideDoor` in `_write-step-hide.mjs`.
 * @param {{ refuse?: Record<string, object>, refuseEmpty?: Record<string, object>, answers?: object[], contract?: string, slots?: object[],
 *   inspect?: object, extraKeys?: string[], hideDoor?: Function, overSlot?: (slot: object) => object }} [script]
 */
export function fakeSite(script = {}) {
  const calls = []
  const held = {}
  const answers = [...(script.answers ?? [])]
  const revision = { now: 'rev-1' }
  const state = () =>
    script.inspect ?? {
      ok: true,
      contract: script.contract ?? CONTRACT,
      revision: revision.now,
      pages: [],
      slots: (script.slots ?? siteSlots(KIT().doc, ['module-6.2', ...(script.extraKeys ?? [])])).map(
        (slot) => ({
          ...slot,
          ...script.overSlot?.(slot)
        })
      )
    }
  // Records behind content.list / content.get / content.update, by kind and id: `script.records` seeds them and
  // `script.refuseUpdate(kind, id, fields)` may return an answer that refuses one write.
  const records = new Map((script.records ?? []).map((r) => [`${r.kind}-${r.id}`, { ...r }]))
  // `content.batch` as the plugin answers it: the same request again answers the same rows, and `script.refuseBatch(kind, fields)`
  // may return a refusal. A list of articles names no note unless the rows are asked for whole.
  const replays = new Map()
  let nextId = 500
  const batchDoor = ({ apply_id: applyId, request_id: requestId, operations }) => {
    if (!applyId || !requestId)
      return { ok: false, error: 'bad_params', message: 'apply_id, request_id required' }
    const name = `${applyId} ${requestId}`
    if (replays.has(name)) return replays.get(name)
    const ids = {}
    for (const { kind, id, key, fields } of operations) {
      const refused = script.refuseBatch?.(kind, fields)
      if (refused) return refused
      const made = id || nextId++
      records.set(`${kind}-${made}`, { kind, id: made, ...fields })
      ids[key] = made
    }
    const answer = { ok: true, ids }
    replays.set(name, answer)
    return answer
  }
  const recordDoor = (call) => {
    const { kind, id } = call.params
    if (call.action === 'content.batch') return batchDoor(call.params)
    if (call.action === 'content.list')
      return (
        script.overList ?? {
          ok: true,
          items: [...records.values()]
            .filter((r) => r.kind === kind)
            .map((r) => {
              const row = { ...r, kind: undefined }
              if (kind === 'article' && !call.params.include_body) delete row.note
              return row
            })
        }
      )
    if (call.action === 'content.get') {
      const row = records.get(`${kind}-${id}`)
      return row ? { ok: true, item: row } : { ok: false, error: 'not_found', message: `no ${kind} ${id}` }
    }
    if (call.action === 'content.update') {
      if (!call.params.apply_id) return { ok: false, error: 'bad_params', message: 'apply_id required' }
      const refused = script.refuseUpdate?.(kind, id, call.params.fields)
      if (refused) return refused
      const row = records.get(`${kind}-${id}`) ?? { kind, id }
      records.set(`${kind}-${id}`, { ...row, ...call.params.fields })
      return { ok: true }
    }
    return { ok: false, error: 'unexpected_action' }
  }
  return {
    calls,
    held,
    records,
    revision,
    updates: () => calls.filter((c) => c.action === 'content.update'),
    applies: () => calls.filter((c) => c.params.operation === 'apply'),
    door: {
      async apply(call) {
        calls.push(call)
        if (call.action === 'info')
          return script.info ?? { ok: true, info: { hide_ops: { version: 1 }, page_create: { version: 1 } } }
        if (call.action.startsWith('content.') && call.action !== 'content.contract') return recordDoor(call)
        const hideAnswer = script.hideDoor?.(call, { state, records, revision })
        if (hideAnswer) return hideAnswer
        if (call.action !== 'content.contract') return { ok: false, error: 'unexpected_action' }
        if (call.params.operation === 'inspect') return state()
        if (!call.params.apply_id) return { ok: false, error: 'bad_params', message: 'apply_id required' }
        const next = answers.shift()
        if (next) return next
        // Only where a hide order can move the revision; other fixtures answer their own inspect.
        if (script.hideDoor && call.params.expected_revision !== revision.now)
          return { ok: false, error: 'contract_failed', message: 'Content changed; inspect again' }
        const emptied = call.params.empty_slots ?? []
        const refused = [...Object.keys(call.params.changes ?? {}), ...emptied].filter(
          (k) => script.refuse?.[k]
        )
        // `refuseEmpty`: refused only as an empty, as the plugin refuses a slot that goes only with its row.
        const unemptied = emptied.filter((k) => script.refuseEmpty?.[k] && !refused.includes(k))
        if (refused.length || unemptied.length)
          return {
            ok: false,
            error: 'contract_failed',
            message: 'The content contract refused some slots',
            errors: [
              ...refused.map((k) => ({ ...script.refuse[k], field: { slotKey: k } })),
              ...unemptied.map((k) => ({ ...script.refuseEmpty[k], field: { slotKey: k } }))
            ]
          }
        Object.assign(held, call.params.changes)
        for (const key of emptied) held[key] = ''
        return { ok: true }
      }
    }
  }
}

/** Frozen input files in a temporary folder. A value `null` leaves the file out; a string is written as it is. */
export function frozenFiles(over = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'write-step-files-'))
  const values = { plan: basePlan(), copy: baseCopy(), ...over }
  const files = {}
  for (const [name, value] of Object.entries(values)) {
    files[name] = path.join(dir, `${name}.json`)
    if (value === null) continue
    writeFileSync(files[name], typeof value === 'string' ? value : JSON.stringify(value))
  }
  return { files, done: () => rmSync(dir, { recursive: true, force: true }) }
}

export { basePlan as plan, baseCopy as copy }

/** The entry point on frozen files and a fake site; the helpers read the report back. */
export async function runStep(over = {}, script = {}, deps = {}) {
  const site = fakeSite(script)
  const frozen = frozenFiles(over)
  try {
    const report = await runWriteStep({
      door: site.door,
      siteKey: SITE,
      kit: KIT(),
      contentMap: null,
      files: frozen.files,
      sleep: async () => {},
      ...deps
    })
    return { report, site, line: (slot) => report.slots.find((s) => s.slot === slot) }
  } finally {
    frozen.done()
  }
}

/** The run store's interface, in memory. */
export function memoryRunStore(seed = []) {
  const rows = [...seed]
  let n = 0
  const find = (id) => rows.find((r) => r.id === id) ?? null
  return {
    rows,
    async begin({ siteKey, kit, startedBy }) {
      const active = rows.find((r) => r.siteKey === siteKey && r.status === 'running')
      if (active) return { active: { ...active } }
      const row = {
        id: `run-${++n}`,
        siteKey,
        kit,
        startedBy,
        status: 'running',
        phase: 'waiting',
        cancelRequested: false,
        code: null,
        reason: null,
        report: null,
        createdAt: new Date(0)
      }
      rows.push(row)
      return { run: { ...row } }
    },
    async phase(id, phase) {
      find(id).phase = phase
    },
    async cancelRequested(id) {
      return find(id).cancelRequested
    },
    async finish(id, fields) {
      Object.assign(find(id), fields, { phase: 'done' })
    },
    async saveReport(id, report) {
      find(id).report = report
    },
    async requestCancel(id) {
      const row = find(id)
      if (row?.status !== 'running') return row ? { ...row } : null
      row.cancelRequested = true
      return { ...row }
    },
    async read(id) {
      const row = find(id)
      return row ? { ...row } : null
    },
    async latestEnded(siteKey) {
      const row = rows.filter((r) => r.siteKey === siteKey && r.status !== 'running').at(-1)
      return row ? { ...row } : null
    },
    async list({ limit = 20 } = {}) {
      return rows
        .map((r) => ({ ...r }))
        .reverse()
        .slice(0, limit)
    }
  }
}
