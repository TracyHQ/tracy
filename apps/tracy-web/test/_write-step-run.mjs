// Fixtures for the write step's entry point: a fake site door that answers as the plugin does, including per-slot
// refusals, and frozen input files in a temporary folder. The kit, plan and copy are the invented ones of the copy check
// tests (demo-gym, Quay Fitness Studio); nothing here is a real business.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { contentMapKey } from '../src/site-writer/contract-mapping.js'
import { runWriteStep } from '../src/write-step/write-step.js'
import { copy as baseCopy, kit as baseKit, plan as basePlan } from './_site-copy-check.mjs'

export const CONTRACT = 'demo-gym/j6/1.0.0'
export const SITE = 'write-bench-abc.sites.example'

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
  return [...keys].map((key) => ({ key, entity: key.slice(0, key.lastIndexOf('.')) }))
}

/**
 * A site behind the door. `refuse` maps a content map key to the entry the plugin lists for it; while a refused key is in
 * the changes the whole apply is refused and nothing lands. `answers` overrides the next apply answers, in order.
 * @param {{ refuse?: Record<string, object>, answers?: object[], contract?: string, slots?: object[],
 *   inspect?: object, extraKeys?: string[] }} [script]
 */
export function fakeSite(script = {}) {
  const calls = []
  const held = {}
  const answers = [...(script.answers ?? [])]
  const state = () =>
    script.inspect ?? {
      ok: true,
      contract: script.contract ?? CONTRACT,
      revision: 'rev-1',
      pages: [],
      slots: script.slots ?? siteSlots(KIT().doc, ['module-6.2', ...(script.extraKeys ?? [])])
    }
  return {
    calls,
    held,
    applies: () => calls.filter((c) => c.params.operation === 'apply'),
    door: {
      async apply(call) {
        calls.push(call)
        if (call.action !== 'content.contract') return { ok: false, error: 'unexpected_action' }
        if (call.params.operation === 'inspect') return state()
        const next = answers.shift()
        if (next) return next
        const refused = Object.keys(call.params.changes ?? {}).filter((k) => script.refuse?.[k])
        if (refused.length)
          return {
            ok: false,
            error: 'contract_failed',
            message: 'The content contract refused some slots',
            errors: refused.map((k) => ({ ...script.refuse[k], field: { slotKey: k } }))
          }
        Object.assign(held, call.params.changes)
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
    async list({ limit = 20 } = {}) {
      return rows
        .map((r) => ({ ...r }))
        .reverse()
        .slice(0, limit)
    }
  }
}
