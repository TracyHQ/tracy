// The write step (ADR 0044, step 9): frozen files in, one site written, a write report out, with no model. It checks the
// files and builds the owner table before anything is written, so a bad file or a dispute leaves the site untouched.
//
// It takes a site door as input and does not depend on how its site was made. The door has one method:
//   apply({ siteKey, action, params }) -> the plugin's answer
// No template and no version is written here: the contract comes from the kit, the slots from the files and the site.
//
// This slice writes the plan's hide decisions (hide-stage.js), the brand file (brand-stage.js), the picture package
// (picture-stage.js) and the site copy's mapping through `content.contract`. The later write stages of the ADR go in as
// further phases.
//
// Given the last report of the same site, every stage sends only what differs from it, and its lines still come out as if all
// had been written, so that a stage reading another's lines sees the whole site (last-report.js sorts them at the end).
import { correctionsReader, galleryAlts } from './slot-corrections.js'
import { seeder } from '../lib/seeder.js'
import { planShapeProblems } from '../site-writer/bench-control.js'
import { indexInputs } from '../site-writer/copy-check/inputs-index.js'
import { readCopy } from '../site-writer/copy-check/copy-view.js'
import { exportContractMapping } from '../site-writer/contract-mapping.js'
import { prepareBrandStage } from './brand-stage.js'
import { writeContract } from './contract-write.js'
import { goneRowSlots } from './hide-rows.js'
import { runHideStage } from './hide-stage.js'
import { readFrozenFiles } from './input-files.js'
import { againstLast, lastReportProblem, needsNewSite, readLastReport } from './last-report.js'
import { routeChanges } from './kit-slot-routes.js'
import { closeForms } from './form-close.js'
import { keepSpaceAround, keptPagesOf, storedDemoClaims } from './stored-demo.js'
import { kitSlotIds } from './kit-slot-ids.js'
import { withEveryMenuHide } from './menu-hides.js'
import { prepareLinks } from './link-stage.js'
import { runPageSettings } from './page-settings-stage.js'
import { copyClaims, ownerTable, planClaims, unownedSlots } from './owner-table.js'
import { preparePictureStage } from './picture-stage.js'
import { runShareStage } from './share-stage.js'
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
 *   files: { plan: string, copy: string, brief?: string, brand?: string, pictures?: string },
 *   last?: object | null, lastRun?: string | null,
 *   accentPlace?: (slotContract: string) => Promise<object | null>, isCancelled?: () => Promise<boolean>,
 *   place?: { latitude: unknown, longitude: unknown } | null,
 *   onPhase?: (phase: string) => Promise<void>, onNoWayOut?: (named: { slot: string, reason: string }[]) => Promise<void>,
 *   now?: () => number, sleep?: (ms: number) => Promise<void> }} input
 *   `last`: the report of the last run on this site, to write only what differs; `lastRun`: that run's id, for the report;
 *   `onNoWayOut`: told what the plan hides and cannot take off, before anything is written
 * @returns {Promise<object>} the write report; `status` is done, stopped (`cause` says why) or cancelled
 */
export async function runWriteStep(input) {
  const { door, siteKey, kit, contentMap = null, files } = input
  const {
    isCancelled = async () => false,
    onPhase = async () => {},
    onNoWayOut = async () => {},
    now = Date.now,
    sleep = sleepFor
  } = input
  const contract = kit.doc?.contract ?? kit.ref
  const last = readLastReport(input.last)
  const started = now()
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
  let brand = { active: false, lines: () => [] }
  let sent = {}
  let settled = new Map()
  let pictures = { active: false, lines: () => [] }
  let hide = null
  let emptied = []
  let shareLines = []
  let links = null
  const finish = (status, cause, written = [], refused = new Map()) => {
    report.status = status
    report.cause = cause
    let lines = []
    if (table) {
      const hidden = hide?.results({ emptied, refused, settled })
      lines = slotLines({
        owners: table.owners,
        unowned: report.unowned,
        extras,
        written,
        refused,
        ordered,
        brandLines: brand.lines({ written, refused }),
        settled,
        pictureLines: pictures.lines({ written, refused }),
        hides: hidden?.hides,
        frameLines: hidden?.lines,
        shareLines,
        links: links?.results({ written, refused, settled, hides: hidden?.hides ?? new Map() }),
        ...routes
      })
    }
    const against = last.active ? againstLast(lines, last, status) : { slots: lines }
    report.slots = against.slots
    report.counts = countsOf(report.slots)
    if (last.active) report.rewrite = { from: input.lastRun ?? null, left: against.left }
    timings.total = now() - started
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
    const wrongReport = lastReportProblem(last, { siteKey, contract })
    if (wrongReport) return { stop: wrongReport }
    const read = await readFrozenFiles(files)
    report.inputs = read.inputs
    if (read.stop) return { stop: read.stop }
    const { plan, copy, brief } = read.values
    brand = await prepareBrandStage({
      brand: read.values.brand,
      brandPath: files.brand,
      inputs: read.inputs.brand,
      kit: kit.doc,
      accentPlace: input.accentPlace,
      last
    })
    if (brand.stop) return { stop: brand.stop }
    const corrections = correctionsReader(door, siteKey, contract)
    pictures = await preparePictureStage({
      corrections,
      pictures: read.values.pictures,
      picturesPath: files.pictures,
      inputs: read.inputs.pictures,
      kit: kit.doc,
      contract,
      brand: read.values.brand,
      brandPath: files.brand,
      contentMap,
      last
    })
    if (pictures.stop) return { stop: pictures.stop }
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
    const fromPlan = planClaims(
      {
        plan,
        hidden: index.hidden,
        menuHide: extras.mainMenu?.hide,
        filled: index.expected,
        rowsGone: goneRowSlots({ plan, kit: kit.doc, filled: index.expected })
      },
      read.inputs.plan.file
    )
    // An alt goes through the door only where the plugin says it opens its slot; any other keeps its skipped line.
    const placed = galleryAlts({
      alts: extras.alts ?? {},
      contentMap,
      hidden: new Set([...pictures.claims, ...fromPlan].filter((c) => c.kind === 'hide').map((c) => c.slot)),
      file: read.inputs.copy.file
    })
    const alts =
      placed.claims.length && !(await corrections()).alts
        ? { claims: [], changes: {}, left: extras.alts ?? {} }
        : placed
    extras = { ...extras, alts: alts.left }
    // The slot prints only as its kept picture's alt, so a plan's hide of it hides nothing: the alt stands.
    const altSlots = new Set(alts.claims.map((claim) => claim.slot))
    const filing = [
      ...brand.claims,
      ...pictures.claims,
      ...copyClaims(view.slots, read.inputs.copy.file),
      ...alts.claims,
      ...fromPlan.filter((claim) => !altSlots.has(claim.slot))
    ]
    table = ownerTable([
      ...filing,
      ...storedDemoClaims({
        plan,
        kit: kit.doc,
        contentMap,
        filled: new Set(filing.map((claim) => claim.slot)),
        file: kit.ref
      })
    ])
    extras = withEveryMenuHide({ extras, owners: table.owners, contentMap })
    report.keptPages = keptPagesOf(plan, kit.doc)
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
    const spaced = keepSpaceAround(changes, contentMap)
    ordered = { ...spaced, ...alts.changes }
    sent = exported.mapping.changes
    const allChanges = { ...spaced, ...alts.changes, ...brand.changes, ...pictures.changes }
    const refusal = needsNewSite(last, {
      plan,
      kit: kit.doc,
      owners: table.owners,
      extras,
      changes: allChanges
    })
    if (refusal) return { stop: refusal }
    return {
      plan,
      brief,
      mapping: {
        ...exported.mapping,
        changes: allChanges,
        evidence: { ...exported.mapping.evidence, ...brand.evidence, ...pictures.evidence }
      }
    }
  })
  if (checked.stop) return stopped(checked.stop)
  const { mapping, plan, brief } = checked
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

  // Before the hide stage: a slot a kept link writes is not emptied as well.
  if ([...table.owners.values()].some((claim) => claim.kind === 'link')) {
    links = await timed('links', () =>
      prepareLinks({
        contentMap,
        door,
        siteKey,
        kit: kit.doc,
        plan,
        brief,
        owners: table.owners,
        reading: inspected.reading,
        extras,
        taken: mapping.changes,
        last
      })
    )
    Object.assign(mapping.changes, links.changes)
    Object.assign(mapping.evidence, links.evidence)
  }

  // Page frame first: the blocks and pages the plan drops; the hidden slots go with the contract call.
  const hiding = await timed('hide', () =>
    runHideStage({
      door,
      siteKey,
      kit: kit.doc,
      plan,
      owners: table.owners,
      extras,
      reading: inspected.reading,
      changes: mapping.changes,
      contract,
      sleep,
      last,
      onNoWayOut: async (named) => {
        report.noWayOut = named
        await onNoWayOut(named)
      }
    })
  )
  if (hiding.stop) return stopped(hiding.stop)
  hide = hiding
  mapping.emptySlots = hide.emptySlots
  if (await isCancelled()) return finish('cancelled', null)

  let reading = hide.reading
  if (brand.active) {
    const branded = await timed('brand', () => brand.write({ apply, siteKey, sleep, reading }))
    if (branded.stop) return stopped(branded.stop)
    reading = branded.reading
    for (const key of branded.dropped) delete mapping.changes[key]
    if (await isCancelled()) return finish('cancelled', null)
  }

  if (pictures.active) {
    const placed = await timed('pictures', () => pictures.write({ apply, siteKey, sleep, reading }))
    if (placed.stop) return stopped(placed.stop)
    reading = placed.reading
    for (const key of placed.dropped) delete mapping.changes[key]
    if (await isCancelled()) return finish('cancelled', null)
  }

  // What the site already holds stays out of the one call, and its lines read as written.
  const held = Object.keys(mapping.changes).filter((key) => last.sameKey(key, mapping.changes[key]))
  for (const key of held) {
    delete mapping.changes[key]
    delete mapping.evidence?.[key]
  }
  const wrote = await timed('write', async () => {
    const { applyJoomlaContract } = await seeder('apply-joomla-contract')
    return writeContract({
      applyJoomlaContract,
      apply,
      siteKey,
      reading,
      mapping,
      isCancelled,
      sleep
    })
  })
  report.rounds = wrote.rounds
  emptied = wrote.emptied ?? []
  if (wrote.cancelled) return finish('cancelled', null, [], wrote.refused)
  if (wrote.stop) return finish('stopped', wrote.stop, [], wrote.refused)
  const written = [...wrote.written, ...held]
  // Last: the page settings, which the contract door does not take (page-settings-stage.js).
  const settings = await timed('settings', () =>
    runPageSettings({
      door,
      siteKey,
      kit: kit.doc,
      sent,
      extras: hide.settingsExtras,
      place: input.place ?? null,
      isCancelled,
      last
    })
  )
  settled = new Map([...settings.results, ...hide.held])
  if (settings.cancelled) return finish('cancelled', null, written, wrote.refused)
  // Then the share pictures, from what the picture and brand stages say they wrote (share-stage.js).
  // It has no phase of its own: it makes a few calls, and the phase list is what callers already know.
  const shared = await runShareStage({
    door,
    siteKey,
    kit: kit.doc,
    pageIds: (plan.pages ?? []).filter((p) => p?.decision === 'keep').map((p) => p.id),
    menutype: hide.settingsExtras?.mainMenu?.menutype ?? null,
    pictureLines: pictures.lines({ written, refused: wrote.refused }),
    brandLines: brand.lines({ written, refused: wrote.refused }),
    isCancelled,
    last
  })
  shareLines = [...shared.lines, ...(await closeForms({ door, siteKey, plan, kit: kit.doc, last }))]
  if (shared.cancelled) return finish('cancelled', null, written, wrote.refused)
  if (links) await timed('link-menus', () => links.writeMenu())
  return finish('done', null, written, wrote.refused)
}
