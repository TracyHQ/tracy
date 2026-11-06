// The write step (ADR 0044, step 9): frozen files in, one site written, a write report out, with no model. It checks the
// files and builds the owner table before anything is written, so a bad file or a dispute leaves the site untouched.
//
// Only what breaks the whole run stops it (ADR 0044, decision 26): a file that is not JSON or not the shape its step writes,
// files made on another kit or contract, a file outside its folder or not matching its hash, a site that is not ready or answers
// another contract, and a dispute. An item with nothing to write to (a slot the kit or the site does not have, a picture frame
// with no slot) is left out with a `refused` line naming its step (`unaddressable`), and the rest is written. What the look guard
// finds on a value is written all the same and kept in `report.guard.findings`. The site check blocks on both
// (site-check/write-findings.js).
//
// It takes a site door as input and does not depend on how its site was made. The door has one method:
//   apply({ siteKey, action, params }) -> the plugin's answer
// No template and no version is written here: the contract comes from the kit, the slots from the files and the site.
//
// This slice writes the plan's hide decisions (hide-stage.js), the brand file (brand-stage.js), the picture package
// (picture-stage.js) and the site copy's mapping through `content.contract`. The later write stages of the ADR go in as
// further phases.
//
// Last, given a page reader (`pageHtml`), the printed check reads the pages back and prints a gated picture itself (printed-stage.js).
// After it, the kept pages take the plan's slugs (page-route-stage.js); a rerun first gives them their demo addresses back.
//
// Given the last report of the same site, every stage sends only what differs from it, and its lines still come out as if all
// had been written, so that a stage reading another's lines sees the whole site (last-report.js sorts them at the end).
import { correctionsReader, galleryAlts } from './slot-corrections.js'
import { seeder } from '../lib/seeder.js'
import { planShapeProblems } from '../lib/plan-shape.js'
import { indexInputs } from '../lib/site-copy/inputs-index.js'
import { readCopy } from '../lib/site-copy-view.js'
import { contentMapKey, exportContractMapping } from '../lib/site-copy/contract-mapping.js'
import { prepareBrandStage } from './brand-stage.js'
import { writeContract } from './contract-write.js'
import { goneRowSlots } from './hide-rows.js'
import { runHideStage } from './hide-stage.js'
import { readFrozenFiles } from './input-files.js'
import { againstLast, lastReportProblem, needsNewSite, readLastReport } from './last-report.js'
import { routeChanges } from './kit-slot-routes.js'
import { closeForms } from './form-close.js'
import { runEmphasisStage, withEmphasis } from './emphasis-stage.js'
import { climbTextFallback, withTextFallback } from './text-fallback.js'
import { hideEmptyVideoButtons } from './video-buttons-stage.js'
import { hideSelfLinkButtons } from './self-link-buttons-stage.js'
import { hideHiddenPageLinks, relinkOrders } from './hidden-page-links-stage.js'
import { lookGuard } from './look-guard.js'
import { keepSpaceAround, keptPagesOf, storedDemoClaims } from './stored-demo.js'
import { buttonClaims } from './kit-buttons.js'
import { kitSlotIds } from './kit-slot-ids.js'
import { withEveryMenuHide } from './menu-hides.js'
import { prepareLinks } from './link-stage.js'
import { planLinkTable } from './plan-link-table.js'
import { createPages, pagesWithoutCopy } from './page-create-stage.js'
import { routeLines } from './page-route-lines.js'
import { hasPlanSlugs, restoreRoutes, runRouteStage } from './page-route-stage.js'
import { phonesOf } from './phone-links.js'
import { followRenamedLinks, rewriteRenamedLinks } from './renamed-link-stage.js'
import { coordinatesOf, runPageSettings } from './page-settings-stage.js'
import { copyClaims, ownerTable, planClaims, unownedSlots } from './owner-table.js'
import { preparePictureStage } from './picture-stage.js'
import { runPrintedStage } from './printed-stage.js'
import { runShareStage } from './share-stage.js'
import { countsOf, REPORT_VERSION, slotLines } from './write-report.js'
import { unaddressableOf, withGuardFindings, withUnaddressable } from './unaddressable-lines.js'
import { menuRows } from '../lib/joomla-menu-rows.js'
import { doorCall } from './settings-door.js'

/** What one contract call takes (the seeder's and the plugin's own limits); more is refused whole, so it is said first. */
const MAX_SLOTS = 1500
const MAX_ENTITIES = 300
const NAMED = 20

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const named = (list) =>
  list.length > NAMED ? `${list.slice(0, NAMED).join(', ')} and ${list.length - NAMED} more` : list.join(', ')
const entityOf = (key) => (key.lastIndexOf('.') > 0 ? key.slice(0, key.lastIndexOf('.')) : key)

/** Where a copy problem is about the whole file rather than one entry of it (site-copy-view.js). */
const WHOLE_COPY = /^(?:file|version|fingerprint(?:\..*)?|slots|alts|seo|pages|notebook|returns)$/
const isWholeCopy = (problem) => WHOLE_COPY.test(String(problem.where))

/** Whatever keeps these files off this kit, each as a sentence. A bad entry of the copy is not here: it is one item left out. */
function fileProblems({ plan, copy, kitRef }, problems) {
  const out = planShapeProblems(plan, kitRef).map((p) => `plan: ${p}`)
  out.push(...problems.filter(isWholeCopy).map((p) => `copy: ${p.where}: ${p.detail}`))
  const made = copy?.fingerprint?.kit
  if (typeof made === 'string' && !made.split(/\s+/).includes(kitRef))
    out.push(`copy: it was made on the kit "${made}", not ${kitRef}`)
  return out
}

/** The content map keys of this mapping the site does not have: nothing to write them to. */
function missingOnSite({ reading, changes }) {
  const onSite = new Set((Array.isArray(reading.slots) ? reading.slots : []).map((s) => s?.key))
  return Object.keys(changes).filter((key) => !onSite.has(key))
}

/** The first thing about the site that keeps this mapping from being sent, or null. */
function siteProblem({ reading, contract, changes }) {
  if (reading.contract !== contract)
    return {
      code: 'CONTRACT_MISMATCH',
      reason: `The site answers the contract ${reading.contract}, the kit is ${contract}.`
    }
  const keys = Object.keys(changes)
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
 *   pageHtml?: (input: { siteKey: string, path: string }) => Promise<string | null>, siteHosts?: string[],
 *   now?: () => number, sleep?: (ms: number) => Promise<void> }} input
 *   `last`: the report of the last run on this site, to write only what differs; `lastRun`: that run's id, for the report;
 *   `onNoWayOut`: told what the plan hides and cannot take off, before anything is written; `pageHtml`: a page of the site as a
 *   visitor reads it, for the printed check (without it the report has no `printed` section); `siteHosts`: the host names
 *   the site answers at, so a full link to a renamed address on one of them is rewritten too (renamed-link-stage.js)
 * @returns {Promise<object>} the write report; `status` is done, stopped (`cause` says why) or cancelled
 */
export async function runWriteStep(input) {
  const { siteKey, kit, contentMap = null, files } = input
  // Every write of the run goes through this door (look-guard.js), and what it refuses is never sent.
  const guard = lookGuard({ kit: kit.doc, contentMap })
  const door = guard.door(input.door)
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
    unowned: [],
    unaddressable: []
  }
  // Items with nothing to write to, each `{ slot, key, owner, reason, part?, spot? }`: left out, and said as refused lines.
  const unaddressable = []
  const leaveOut = (items) => unaddressable.push(...items)
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
  let relinked = new Map()
  let shareLines = []
  let settingLines = []
  let links = null
  let created = { pages: new Map(), results: [], lines: [], kept: [] }
  let restored = []
  let renamedLines = null
  let renamedLinks = null
  let emphasis = new Map()
  let fallbacks = new Map()
  const finish = (status, cause, written = [], refused = new Map()) => {
    report.status = status
    report.cause = cause
    // What the guard found on a value was written all the same; what it held back (a channel nobody listed) was not sent.
    report.guard = { findings: guard.findings(), refused: guard.refused(), allowed: guard.allowed() }
    report.unaddressable = unaddressableOf(unaddressable)
    let lines = []
    if (table) {
      const hidden = hide?.results({ emptied, refused, settled, relinked })
      lines = slotLines({
        owners: table.owners,
        // A slot of a row the plan gave up has its own line, as it left with its row.
        unowned: report.unowned.filter((u) => !hidden?.rowKeys?.has(contentMapKey(u.slot))),
        extras,
        written,
        refused,
        ordered,
        brandLines: brand.lines({ written, refused }),
        settled,
        pictureLines: pictures.lines({ written, refused }),
        hides: hidden?.hides,
        frameLines: hidden?.lines,
        shareLines: [
          ...created.lines,
          ...settingLines,
          ...shareLines,
          ...pageRouteLines(),
          ...(renamedLinks?.lines ?? [])
        ],
        links: links?.results({
          written,
          refused,
          settled,
          hides: hidden?.hides ?? new Map(),
          removed: hidden?.removed ?? new Map()
        }),
        ...routes
      })
    }
    // A value the renamed-link stage rewrote is read back as the site holds it now (renamed-link-stage.js).
    lines = followRenamedLinks(lines, renamedLinks)
    lines = withGuardFindings(withUnaddressable(lines, report.unaddressable), report.guard.findings)
    lines = withTextFallback(withEmphasis(lines, emphasis), fallbacks)
    if (emphasis.size)
      report.emphasis = [...emphasis].map(([key, e]) => ({
        key,
        storage: e.storage,
        converted: Boolean(e.stored),
        ...(e.warning ? { warning: e.warning } : {}),
        ...(e.blocking ? { blocking: true } : {})
      }))
    const against = last.active ? againstLast(lines, last, status) : { slots: lines }
    report.slots = against.slots
    // Rows kept against the plan, per list (hide-lines.js): what the site check's list-rows holds the printed list to.
    if (table && hide) {
      const rows = hide.results({ emptied, refused, settled, relinked }).rows
      if (rows.length) report.rows = rows
    }
    report.counts = countsOf(report.slots)
    if (last.active) report.rewrite = { from: input.lastRun ?? null, left: against.left }
    timings.total = now() - started
    return report
  }
  const stopped = (cause) => finish('stopped', cause)
  // A page the run gave its demo address back and did not rename again is said to be at the demo address, never carried as renamed.
  const pageRouteLines = () =>
    renamedLines ??
    routeLines(
      restored.map(({ article: _article, ...route }) => ({
        ...route,
        to: route.from,
        outcome: 'refused',
        reason:
          'the run gave this page its demo address back for the rewrite and ended before it took its slug again'
      }))
    )
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
      last,
      templateSheets: input.templateSheets && (() => input.templateSheets({ door, siteKey }))
    })
    if (brand.stop) return { stop: brand.stop }
    leaveOut(brand.unaddressable ?? [])
    const corrections = correctionsReader(door, siteKey, contract)
    pictures = await preparePictureStage({
      corrections,
      templateFile: input.templateFiles && ((file) => input.templateFiles({ siteKey, file })),
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
    leaveOut(pictures.unaddressable ?? [])
    guard.refuse(pictures.refused ?? [])
    const copyRead = readCopy(copy)
    const problems = fileProblems({ plan, copy, kitRef: kit.ref }, copyRead.problems)
    if (problems.length)
      return { stop: { code: 'BAD_FILE', reason: `The files cannot be written: ${problems.join('; ')}` } }
    // A copy entry that is not what the copy step writes is left out of the copy's view; it is said once, on step 6.
    leaveOut(
      copyRead.problems
        .filter((p) => !isWholeCopy(p))
        .map((p) => ({ slot: String(p.where), owner: null, step: 6, reason: `copy: ${p.detail}` }))
    )
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
    const wordless = pagesWithoutCopy(plan, extras.pages)
    if (wordless.length)
      return {
        stop: {
          code: 'PAGE_WITHOUT_COPY',
          reason: `The plan creates these pages and the copy holds no words for them: ${named(wordless)}.`
        }
      }
    const index = indexInputs({ plan, kit: kit.doc, brief, contentMap: contentMap ?? undefined })
    // A copy slot the kit does not have has nothing to write to: it is left out and said as refused, and the rest is written.
    const known = kitSlotIds(kit.doc)
    for (const slot of index.kitSlots.keys()) known.add(slot)
    const copyView = copyRead.view
    const strays = copyView.slots.filter((s) => !known.has(s.slot))
    for (const stray of strays) delete exported.mapping.changes[contentMapKey(stray.slot)]
    leaveOut(
      strays.map((s) => ({
        slot: s.slot,
        key: contentMapKey(s.slot),
        owner: s.owner,
        step: 6,
        reason: `copy: the kit has no slot ${s.slot}`
      }))
    )
    const view = { ...copyView, slots: copyView.slots.filter((s) => known.has(s.slot)) }
    const fromPlan = planClaims(
      {
        plan,
        kit: kit.doc,
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
    const buttons = buttonClaims({ plan, kit: kit.doc, contentMap, claims: filing, file: kit.ref })
    for (const [slot, source] of buttons.twins)
      exported.mapping.changes[contentMapKey(slot)] = exported.mapping.changes[contentMapKey(source)]
    const speaking = [...filing, ...buttons.claims]
    table = ownerTable([
      ...speaking,
      ...storedDemoClaims({
        plan,
        kit: kit.doc,
        contentMap,
        filled: new Set(speaking.map((claim) => claim.slot)),
        file: kit.ref
      })
    ])
    extras = withEveryMenuHide({ extras, owners: table.owners, contentMap })
    guard.know({ owners: table.owners, routes: brand.routes ?? null, copy, brief })
    report.keptPages = keptPagesOf(plan, kit.doc)
    report.disputes = table.disputes
    report.unowned = unownedSlots({ plan, kit: kit.doc, owners: table.owners })
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
  // What the site check holds the printed pages to: the plan's kept links and end actions, the brief's phones, where the business is.
  const planned = planLinkTable({ plan, kit: kit.doc, brief })
  if (planned.planLinks.length) report.planLinks = planned.planLinks
  if (planned.endActions.length) report.endActions = planned.endActions
  if (planned.phones.length) report.phones = planned.phones
  const coordinates = coordinatesOf(input.place ?? null, brief)
  if (coordinates) report.place = coordinates
  if (await isCancelled()) return finish('cancelled', null)

  const apply = (call) => door.apply(call)
  const inspected = await timed('inspect', async () => {
    const { doorRefusal } = await seeder('apply-joomla-contract')
    try {
      const reading = await apply({ siteKey, action: 'content.contract', params: { operation: 'inspect' } })
      if (!reading?.ok) return { stop: { code: 'INSPECT_REFUSED', reason: doorRefusal(reading) } }
      // A slot the site does not have has nothing to write to: it is left out, and its owner's step is named.
      const missing =
        reading.contract === contract ? missingOnSite({ reading, changes: mapping.changes }) : []
      for (const key of missing) {
        delete mapping.changes[key]
        delete mapping.evidence?.[key]
      }
      const ownerOf = (key) => table.owners.get(key.replace(/^module-/, 'block-'))?.owner ?? null
      leaveOut(
        missing.map((key) => ({
          slot: key.replace(/^module-/, 'block-'),
          key,
          owner: ownerOf(key),
          reason: `the site does not have the slot ${key}`
        }))
      )
      const problem = siteProblem({ reading, contract, changes: mapping.changes })
      if (problem) return { stop: problem }
      return { reading }
    } catch (error) {
      return { stop: { code: 'INSPECT_REFUSED', reason: String(error?.message ?? error) } }
    }
  })
  if (inspected.stop) return stopped(inspected.stop)
  if (await isCancelled()) return finish('cancelled', null)

  // Before the first write: what the run already knows it will send, judged once; a finding does not hold the write back.
  guard.check({
    action: 'content.contract',
    params: { operation: 'apply', changes: mapping.changes }
  })
  for (const call of brand.planned ?? []) guard.check(call)

  // A rerun on pages the last run renamed: they answer at their demo addresses again, which every stage before the route stage reads.
  const restoring = await restoreRoutes({ door, siteKey, routes: input.last?.routes })
  restored = restoring.restored
  if (restoring.stop) return stopped(restoring.stop)

  // First of all the writes: a link to a created page needs its address (page-create-stage.js).
  created = await createPages({
    door,
    siteKey,
    kit: kit.doc,
    plan,
    owners: table.owners,
    extras,
    last,
    phones: phonesOf(brief)
  })
  settled = new Map(created.results)
  report.keptPages.push(...created.kept)

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
        last,
        createdPages: created.pages
      })
    )
    Object.assign(mapping.changes, links.changes)
    Object.assign(mapping.evidence, links.evidence)
    // A slot a plan link writes has an owner, though the plan names the link and not the slot.
    report.unowned = report.unowned.filter((u) => !(contentMapKey(u.slot) in links.changes))
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
  // A link slot to a hidden page that its kept row keeps (SLOT_NOT_HIDEABLE) is written with a living page instead (card AM).
  if (Array.isArray(kit.doc?.site?.hiddenPageLinks) && mapping.emptySlots.length) {
    try {
      const rows = await menuRows(doorCall(door, siteKey))
      mapping.relink = relinkOrders({
        reading: hide.reading,
        emptySlots: mapping.emptySlots,
        kit: kit.doc,
        plan,
        rows
      })
    } catch {
      // No menu to read: the slots are emptied or refused as before, and the plain text rule at the end still holds them.
    }
  }
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
  const { applyJoomlaContract } = await seeder('apply-joomla-contract')
  const wrote = await timed('write', () =>
    writeContract({
      applyJoomlaContract,
      apply,
      siteKey,
      reading,
      mapping,
      isCancelled,
      sleep
    })
  )
  report.rounds = wrote.rounds
  emptied = wrote.emptied ?? []
  relinked = wrote.relinked ?? new Map()
  if (wrote.cancelled) return finish('cancelled', null, [], wrote.refused)
  if (wrote.stop) return finish('stopped', wrote.stop, [], wrote.refused)
  // A refused text slot keeps no demo words if it can help it: plain words, else hidden, else said (text-fallback.js).
  fallbacks = await climbTextFallback({
    refused: wrote.refused,
    changes: mapping.changes,
    evidence: mapping.evidence,
    kit: kit.doc,
    contentMap,
    before: reading,
    inspect: () => apply({ siteKey, action: 'content.contract', params: { operation: 'inspect' } }),
    send: (order) =>
      writeContract({
        applyJoomlaContract,
        apply,
        siteKey,
        reading: order.reading,
        mapping: {
          contract: mapping.contract,
          changes: order.changes,
          evidence: order.evidence,
          emptySlots: order.emptySlots
        },
        isCancelled,
        sleep
      })
  })
  const written = [...wrote.written, ...held]
  // A heading whose demo value is HTML takes its emphasis as real tags, after the contract call wrote its words (emphasis-stage.js).
  emphasis = await runEmphasisStage({ door, siteKey, contentMap, written: wrote.written, ordered })
  // Last: the page settings, which the contract door does not take (page-settings-stage.js).
  const settings = await timed('settings', () =>
    runPageSettings({
      door,
      siteKey,
      kit: kit.doc,
      sent,
      extras: hide.settingsExtras,
      place: input.place ?? null,
      brief,
      isCancelled,
      last
    })
  )
  settingLines = settings.lines ?? []
  settled = new Map([...settings.results, ...hide.held, ...created.results])
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
  shareLines = [
    ...shared.lines,
    ...(await closeForms({ door, siteKey, plan, kit: kit.doc, last })),
    // After the contract call, which saves the head block's module in its own form: the kit's empty video button rule.
    ...(await hideEmptyVideoButtons({ door, siteKey, kit: kit.doc }))
  ]
  if (shared.cancelled) return finish('cancelled', null, written, wrote.refused)
  if (links) await timed('link-menus', () => links.writeMenu())
  const done = finish('done', null, written, wrote.refused)
  if (input.pageHtml && done.status === 'done')
    report.printed = await timed('printed', () =>
      runPrintedStage({
        door,
        siteKey,
        kit: kit.doc,
        lines: done.slots,
        keptPages: done.keptPages ?? [],
        pageHtml: (path) => input.pageHtml({ siteKey, path })
      })
    )
  // Last of the writes, once every page was found and read back at its demo address: the kept pages take the plan's slugs.
  if (report.status === 'done' && hasPlanSlugs(plan)) {
    const routed = await timed('routes', async () => {
      const out = await runRouteStage({
        door,
        siteKey,
        kit: kit.doc,
        plan,
        keptPages: report.keptPages ?? [],
        menutype: hide.settingsExtras?.mainMenu?.menutype ?? null
      })
      // Then every link written as a string to an address the stage moved follows it (card AD).
      renamedLinks = await rewriteRenamedLinks({
        door,
        siteKey,
        routes: out.routes,
        hosts: input.siteHosts ?? [],
        writeSlots: async ({ reading, changes, evidence }) => {
          const { applyJoomlaContract } = await seeder('apply-joomla-contract')
          return writeContract({
            applyJoomlaContract,
            apply,
            siteKey,
            reading,
            mapping: { contract: mapping.contract, changes, evidence },
            isCancelled,
            sleep
          })
        }
      })
      return out
    })
    renamedLines = routed.lines
    report.keptPages = routed.keptPages
    if (routed.routes.length) report.routes = routed.routes
  }
  // After the renames: the kit's "more" buttons that lead to their own page, each kept page named at the address it answers now.
  if (report.status === 'done')
    shareLines = [
      ...shareLines,
      ...(await hideSelfLinkButtons({
        door,
        siteKey,
        kit: kit.doc,
        keptPages: report.keptPages ?? [],
        menutype: hide.settingsExtras?.mainMenu?.menutype ?? null
      })),
      // And the links in the kit's containers that still lead to a page the plan hid read as plain text (card AM).
      ...(await hideHiddenPageLinks({ door, siteKey, kit: kit.doc, plan, keptPages: report.keptPages ?? [] }))
    ]
  return finish('done', null, written, wrote.refused)
}
