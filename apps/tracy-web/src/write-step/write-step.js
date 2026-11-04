// The write step (ADR 0044, step 9): frozen files in, one site written, a write report out, with no model. It checks the
// files and builds the owner table before anything is written, so a bad file or a dispute leaves the site untouched.
//
// It takes a site door as input and does not depend on how its site was made. The door has one method:
//   apply({ siteKey, action, params }) -> the plugin's answer
// No template and no version is written here: the contract comes from the kit, the slots from the files and the site.
//
// This slice writes the site copy's mapping through `content.contract`. The later write stages of the ADR go in as
// further phases, and pictures and brand as further claim lists (owner-table.js).
import { seeder } from '../lib/seeder.js'
import { planShapeProblems } from '../site-writer/bench-control.js'
import { indexInputs } from '../site-writer/copy-check/inputs-index.js'
import { readCopy } from '../site-writer/copy-check/copy-view.js'
import { exportContractMapping } from '../site-writer/contract-mapping.js'
import { writeContract } from './contract-write.js'
import { readFrozenFiles } from './input-files.js'
import { routeChanges } from './kit-slot-routes.js'
import { kitSlotIds } from './kit-slot-ids.js'
import { runPageSettings } from './page-settings-stage.js'
import { copyClaims, ownerTable, planClaims, unownedSlots } from './owner-table.js'
import { countsOf, REPORT_VERSION, slotLines } from './write-report.js'

/** What one contract call takes (the seeder's and the plugin's own limits); more is refused whole, so it is said first. */
const MAX_SLOTS = 1500
const MAX_ENTITIES = 300
const NAMED = 20

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const named = (list) =>
  list.length > NAMED ? `${list.slice(0, NAMED).join(', ')} and ${list.length - NAMED} more` : list.join(', ')
const entityOf = (key) => (key.lastIndexOf('.') > 0 ? key.slice(0, key.lastIndexOf('.')) : key)

/** Whatever keeps these files off this kit, each as a sentence. */
function fileProblems({ plan, copy, kitRef }, problems) {
  const out = planShapeProblems(plan, kitRef).map((p) => `plan: ${p}`)
  out.push(...problems.map((p) => `copy: ${p.where}: ${p.detail}`))
  const made = copy?.fingerprint?.kit
  if (typeof made === 'string' && !made.split(/\s+/).includes(kitRef))
    out.push(`copy: it was made on the kit "${made}", not ${kitRef}`)
  return out
}

/** The first thing about the site that keeps this mapping from being sent, or null. */
function siteProblem({ reading, contract, changes }) {
  if (reading.contract !== contract)
    return {
      code: 'CONTRACT_MISMATCH',
      reason: `The site answers the contract ${reading.contract}, the kit is ${contract}.`
    }
  const onSite = new Set((Array.isArray(reading.slots) ? reading.slots : []).map((s) => s?.key))
  const keys = Object.keys(changes)
  const missing = keys.filter((key) => !onSite.has(key))
  if (missing.length)
    return { code: 'UNKNOWN_SLOT', reason: `Slots the site does not have: ${named(missing)}.` }
  const entities = new Set(keys.map(entityOf)).size
  if (keys.length > MAX_SLOTS || entities > MAX_ENTITIES)
    return {
      code: 'TOO_MANY_SLOTS',
      reason: `${keys.length} slots on ${entities} entities; one contract call takes ${MAX_SLOTS} slots on ${MAX_ENTITIES} entities.`
    }
  return null
}

/**
 * @param {{ door: { apply: Function }, siteKey: string, kit: { ref: string, doc: object }, contentMap?: object | null,
 *   files: { plan: string, copy: string, brief?: string }, isCancelled?: () => Promise<boolean>,
 *   place?: { latitude: unknown, longitude: unknown } | null, onPhase?: (phase: string) => Promise<void>, now?: () => number, sleep?: (ms: number) => Promise<void> }} input
 * @returns {Promise<object>} the write report; `status` is done, stopped (`cause` says why) or cancelled
 */
export async function runWriteStep(input) {
  const { door, siteKey, kit, contentMap = null, files } = input
  const {
    isCancelled = async () => false,
    onPhase = async () => {},
    now = Date.now,
    sleep = sleepFor
  } = input
  const contract = kit.doc?.contract ?? kit.ref
  const timings = {}
  const report = {
    version: REPORT_VERSION,
    status: 'stopped',
    cause: null,
    site: siteKey,
    kit: kit.ref,
    contract,
    inputs: {},
    timings,
    counts: countsOf([]),
    slots: [],
    disputes: [],
    unowned: []
  }
  let table = null
  let extras = {}
  let routes = { routed: new Map(), deferred: new Map() }
  let ordered = {}
  let sent = {}
  let settled = new Map()
  const finish = (status, cause, written = [], refused = new Map()) => {
    report.status = status
    report.cause = cause
    if (table) {
      report.slots = slotLines({
        owners: table.owners,
        unowned: report.unowned,
        extras,
        written,
        refused,
        ordered,
        settled,
        ...routes
      })
      report.counts = countsOf(report.slots)
    }
    return report
  }
  const stopped = (cause) => finish('stopped', cause)
  const timed = async (stage, job) => {
    await onPhase(stage)
    const from = now()
    try {
      return await job()
    } finally {
      timings[stage] = now() - from
    }
  }

  const checked = await timed('check', async () => {
    const read = await readFrozenFiles(files)
    report.inputs = read.inputs
    if (read.stop) return { stop: read.stop }
    const { plan, copy, brief } = read.values
    const problems = fileProblems({ plan, copy, kitRef: kit.ref }, readCopy(copy).problems)
    if (problems.length)
      return { stop: { code: 'BAD_FILE', reason: `The files cannot be written: ${problems.join('; ')}` } }
    const exported = exportContractMapping({
      copy,
      contract,
      revision: 'set from the site',
      kit: kit.doc,
      brief,
      plan,
      contentMap
    })
    extras = exported.extras
    const index = indexInputs({ plan, kit: kit.doc, brief, contentMap: contentMap ?? undefined })
    const { view } = readCopy(copy)
    table = ownerTable([
      ...copyClaims(view.slots, read.inputs.copy.file),
      ...planClaims(
        { plan, hidden: index.hidden, menuHide: extras.mainMenu?.hide, filled: index.expected },
        read.inputs.plan.file
      )
    ])
    report.disputes = table.disputes
    report.unowned = unownedSlots({ plan, kit: kit.doc, owners: table.owners })
    const known = kitSlotIds(kit.doc)
    for (const slot of index.kitSlots.keys()) known.add(slot)
    const unknown = view.slots.map((s) => s.slot).filter((slot) => !known.has(slot))
    if (unknown.length)
      return {
        stop: {
          code: 'UNKNOWN_SLOT',
          reason: `Slots the kit does not have: ${named([...new Set(unknown)])}.`
        }
      }
    if (table.disputes.length)
      return {
        stop: {
          code: 'SLOT_DISPUTE',
          reason: table.disputes
            .map((d) => `${d.slot}: ${d.claims.map((c) => `${c.file} (${c.owner})`).join(' against ')}`)
            .join('; ')
        }
      }
    const { changes, ...found } = routeChanges(exported.mapping.changes, kit.doc, view.slots)
    routes = found
    ordered = changes
    sent = exported.mapping.changes
    return { mapping: { ...exported.mapping, changes } }
  })
  if (checked.stop) return stopped(checked.stop)
  const { mapping } = checked
  if (await isCancelled()) return finish('cancelled', null)

  const apply = (call) => door.apply(call)
  const inspected = await timed('inspect', async () => {
    const { doorRefusal } = await seeder('apply-joomla-contract')
    try {
      const reading = await apply({ siteKey, action: 'content.contract', params: { operation: 'inspect' } })
      if (!reading?.ok) return { stop: { code: 'INSPECT_REFUSED', reason: doorRefusal(reading) } }
      const problem = siteProblem({ reading, contract, changes: mapping.changes })
      return problem ? { stop: problem } : { reading }
    } catch (error) {
      return { stop: { code: 'INSPECT_REFUSED', reason: String(error?.message ?? error) } }
    }
  })
  if (inspected.stop) return stopped(inspected.stop)
  if (await isCancelled()) return finish('cancelled', null)

  const wrote = await timed('write', async () => {
    const { applyJoomlaContract } = await seeder('apply-joomla-contract')
    return writeContract({
      applyJoomlaContract,
      apply,
      siteKey,
      reading: inspected.reading,
      mapping,
      isCancelled,
      sleep
    })
  })
  report.rounds = wrote.rounds
  if (wrote.cancelled) return finish('cancelled', null, [], wrote.refused)
  if (wrote.stop) return finish('stopped', wrote.stop, [], wrote.refused)
  // Last: the page settings, which the contract door does not take (page-settings-stage.js).
  const settings = await timed('settings', () =>
    runPageSettings({ door, siteKey, kit: kit.doc, sent, extras, place: input.place ?? null, isCancelled })
  )
  settled = settings.results
  if (settings.cancelled) return finish('cancelled', null, wrote.written, wrote.refused)
  return finish('done', null, wrote.written, wrote.refused)
}
