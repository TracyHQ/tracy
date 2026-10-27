// The ui layer's engine: selection, probes, measurement, verdicts, RED proofs, coverage and reports.
//
// Verdict policy (plan §2, applied per case):
//   PASS     the assertion held on a story that had something to judge, AND this case has its own RED
//            proof (the same assertion went red on a broken scratch copy, green on the real tree).
//   FAIL     the assertion was violated, the harness measured it properly, AND the assertion family
//            has a valid RED proof somewhere (so the assertion is known to be able to see this class).
//   ENV      a dependency probe failed (no chromium, no Storybook, no esbuild).
//   PENDING  anything else: no RED proof yet (measured green), unproven assertion (violation seen),
//            vacuous story, out of the pilot scope, oracle drifted, target policy, manual review.

import { OUTCOME_GAP } from './outcomes.mjs'
import path from 'node:path'
import {
  LAYER_DIR,
  REPO_ROOT,
  artifactRootDir,
  confineOutput,
  ensureDir,
  readJson,
  readRegular,
  sha256,
  stableStringify,
  writeAtomic,
  writeJson
} from './artifacts.mjs'
import {
  EnvError,
  Ledger,
  entryFor,
  indexStories,
  launchBrowser,
  measureStory,
  startStorybook
} from './browser.mjs'
import { validateCommitted } from '../../lib/denominator.mjs'
import { casesHash, deriveCases, flatView } from './cases.mjs'
import { NEEDS, evaluate } from './families.mjs'
import { loadBanned, loadKeySet, loadPins } from './oracles.mjs'
import {
  STORY_MUTANTS,
  SWITCH_MUTANTS,
  applyEdit,
  buildScratch,
  proveStoryMutants,
  removeScratch,
  targetCaseId
} from './red.mjs'
import { checkBinding, checkConsumer, checkDoorDown, checkTabPolicy, measureSwitches } from './switches.mjs'
import { EXECUTABLE, FAMILIES, SWITCH_FAMILIES, VIEWPORTS } from './tables.mjs'

export const AREAS = Object.freeze(['screens', 'blocks', 'sheets', 'switches', 'legacy', 'outcomes'])
export const TARGETS = Object.freeze(['local', 'dev', 'prod'])
const DENOMINATOR = path.join(LAYER_DIR, 'denominator.json')

export class ContractError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ContractError'
  }
}

let cache = null

/** Load the committed denominator and derive the manifests; throws ContractError when they disagree. */
export async function loadLayer({ denominatorPath = DENOMINATOR } = {}) {
  if (cache && cache.path === denominatorPath) return cache.value
  let denominator
  try {
    denominator = await readJson(denominatorPath, { root: path.dirname(denominatorPath) })
  } catch (error) {
    throw new ContractError(`denominator.json unreadable: ${error.message}`)
  }
  const { problems } = validateCommitted(denominator, 'ui')
  if (problems.length > 0)
    throw new ContractError(`denominator.json breaks the shared contract: ${problems[0]}`)
  denominator = flatView(denominator)
  if (
    !Array.isArray(denominator.items) ||
    typeof denominator.itemDetails !== 'object' ||
    !denominator.cases
  ) {
    throw new ContractError('denominator.json is malformed (items/itemDetails/cases missing)')
  }
  const grouped = deriveCases(denominator)
  if (casesHash(grouped) !== denominator.cases.sha256) {
    throw new ContractError(
      'derived case manifests differ from the sha256 recorded in denominator.json; run node tests/qa/layers/ui/generate.mjs'
    )
  }
  const all = Object.values(grouped).flat()
  const seen = new Set()
  for (const c of all) {
    if (seen.has(c.id)) throw new ContractError(`duplicate case id ${c.id}`)
    seen.add(c.id)
  }
  const value = { denominator, cases: all, grouped }
  cache = { path: denominatorPath, value }
  return value
}

export async function listCasesFor({ area } = {}) {
  const { cases } = await loadLayer()
  if (area === undefined || area === null) return cases
  if (!AREAS.includes(area)) throw new ContractError(`unknown area "${area}"; known: ${AREAS.join(', ')}`)
  return cases.filter((c) => c.area === area)
}

/**
 * The single place that turns a measured check into a verdict (plan §2).
 * @param {{ ok: boolean, vacuous: boolean, violations: { message: string }[] }} check
 * @param {{ proof: object|null, familyProven: boolean, assertionId: string }} ctx
 */
export function decide(check, { proof, familyProven, assertionId }) {
  if (check.vacuous)
    return {
      verdict: 'PENDING',
      reason: 'VACUOUS: nothing is subject to the assertion here, so a green result would prove nothing'
    }
  if (!check.ok) {
    const message = check.violations
      .slice(0, 3)
      .map((x) => x.message)
      .join(' | ')
    return familyProven
      ? { verdict: 'FAIL', reason: message }
      : {
          verdict: 'PENDING',
          reason: `UNPROVEN_ASSERTION: violation seen but ${assertionId} has no valid RED proof in this run (run --prove-red): ${message}`
        }
  }
  if (proof) return { verdict: 'PASS', reason: 'assertion held; RED proof valid', redProof: proof }
  return {
    verdict: 'PENDING',
    reason:
      'NO_RED_PROOF: measured green, but no mutant of this variant has been proven red (green without RED is not PASS)'
  }
}

const result = (c, verdict, reason, extra = {}) => ({
  id: c.id,
  verdict,
  reason,
  assertionIds: c.assertionIds,
  evidence: extra.evidence ?? [],
  durationMs: extra.durationMs ?? 0,
  redProof: extra.redProof ?? null
})

/**
 * A run whose owned scratch could not be removed is not finished: every PASS becomes PENDING (TEST_INVALID) so
 * neither the standalone exit code nor the shared runner reports success. A measured FAIL keeps its verdict and
 * evidence — the product failure was observed regardless of what cleanup did afterwards.
 * @param {Array<ReturnType<typeof result>>} ordered - the run's results.
 * @param {string[]} cleanupInvalid - the cleanup failures that make the run TEST_INVALID.
 */
export function invalidateOnCleanup(ordered, cleanupInvalid) {
  if (!cleanupInvalid.length) return ordered
  const why = `TEST_INVALID: the run's scratch was not removed (${cleanupInvalid.join('; ')})`
  return ordered.map((r) => (r.verdict === 'PASS' ? { ...r, verdict: 'PENDING', reason: why } : r))
}

function familyOfCase(c) {
  const id = c.assertionIds[0]
  return FAMILIES.find((f) => f.assertionId === id) ?? null
}
function switchFamilyOfCase(c) {
  return SWITCH_FAMILIES.find((f) => f.assertionId === c.assertionIds[0]) ?? null
}
const variantOf = (c) => c.dimensions?.viewports?.[0] ?? '1440'

async function pool(items, size, worker) {
  const queue = [...items]
  const results = []
  const runners = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift()
      results.push(await worker(item))
    }
  })
  await Promise.all(runners)
  return results
}

/** Outputs never go inside the repository: the artifact root is validated before anything is created. */
export const artifactRoot = artifactRootDir
/**
 * Dry run of the pilot's side-effect path: builds the baseline scratch and applies every story mutant's
 * edits to it with the same code a real run uses, starts nothing, and removes the scratch. Everything
 * lands under `outDir` (outside the repository); the only file that stays is dry.json.
 */
export async function dryRun({ cases, outDir }) {
  await ensureDir(outDir)
  const scratch = path.join(outDir, 'scratch-dry')
  const applied = []
  try {
    await buildScratch(scratch)
    for (const mutant of STORY_MUTANTS)
      for (const edit of mutant.edits)
        applied.push({ mutant: mutant.id, ...(await applyEdit(scratch, edit)) })
  } finally {
    await removeScratch(outDir, scratch)
  }
  const doc = { selected: cases.length, mutants: STORY_MUTANTS.length, edits: applied }
  await writeJson(path.join(outDir, 'dry.json'), doc)
  return doc
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

/**
 * The only stand shape the layer talks to: a bare http loopback origin (no credentials, path, query or
 * fragment). Anything else - production, another site, a lookalike host - is refused before any request.
 * Returns the origin, or null.
 */
export function standOrigin(url) {
  let u
  try {
    u = new URL(String(url))
  } catch {
    return null
  }
  if (u.protocol !== 'http:' || !LOOPBACK_HOSTS.has(u.hostname)) return null
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/') return null
  return u.origin
}

/** A route path the stand can serve: one leading slash, no scheme, authority or backslash tricks. */
const SAFE_ROUTE_PATH = /^\/(?![/\\])[^\s\\#?]*$/
const SAFE_ROUTE_QUERY = /^(\?[^\s#\\]*)?$/

/** Probe a stand URL. Returns { ok, detail }. */
export async function probeStand(url) {
  if (!url) return { ok: false, detail: 'QA_STAND_URL is not set' }
  if (!standOrigin(url))
    return {
      ok: false,
      detail:
        'QA_STAND_URL is refused: only a bare http loopback origin (127.0.0.1, localhost, [::1]) is a stand; nothing was requested'
    }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: 'manual' })
    return { ok: res.status < 500, url, detail: `${url} answered HTTP ${res.status}` }
  } catch (error) {
    return { ok: false, detail: `${url} unreachable: ${error.cause?.code ?? error.message}` }
  }
}

function targetPolicy(c, target) {
  if (!c.targets.includes(target)) return `target-policy: case is not declared for target "${target}"`
  const e = c.effects
  const readOnly = e.writes.length === 0 && !e.mail && !e.model && !e.containers
  if (target === 'prod' && !readOnly) return 'target-policy: prod runs only declared read-only cases'
  if (target !== 'local' && c.prerequisites.includes('storybook'))
    return `target-policy: the design bench runs locally; "${target}" has no bench to measure`
  return null
}

/**
 * Run the selected cases.
 * @param {{ cases: object[], target: string, proveRed: boolean, outDir: string, options?: object }} args
 */
export async function runCases({ cases, target, proveRed, outDir: requestedOut, options = {} }) {
  const started = Date.now()
  const outDir = confineOutput(requestedOut, process.cwd(), 'outDir')
  await ensureDir(outDir)
  const ledger = new Ledger(path.join(outDir, 'owned.json'))
  const { denominator } = await loadLayer()
  const results = new Map()
  const notes = []
  const cleanupInvalid = []
  const scope = options.scope ?? 'pilot'
  const wantSheets = Boolean(options.contactSheets)
  const stand = await probeStand(process.env.QA_STAND_URL)
  const pins = await loadPins().catch((error) => ({
    pins: new Map(),
    drift: new Map([['*', `pins.json unreadable: ${error.message}`]])
  }))
  const keys = await loadKeySet()
  const banned = await loadBanned()
  const ctx = { keys: keys.keys, banned }
  // A RED proof is only ever produced, positive/negative-controlled and published inside THIS run:
  // a proof carried over from an earlier run cannot be traced to the sources it measured, so none is read.
  const proofs = new Map()

  const set = (c, verdict, reason, extra) => results.set(c.id, result(c, verdict, reason, extra))
  const oracleDrift = (c) => {
    const id = c.oracle.ref.split('#')[1]
    return pins.drift.get('*') ?? pins.drift.get(id) ?? null
  }

  // ---- policy, drift and scope: decided before any process starts ----
  const runnable = []
  for (const c of cases) {
    const policy = targetPolicy(c, target)
    if (policy) {
      set(c, 'PENDING', policy)
      continue
    }
    const drift = oracleDrift(c)
    if (drift) {
      set(c, 'PENDING', `ORACLE_DRIFT: ${drift}`)
      continue
    }
    if (c.area === 'legacy') {
      set(
        c,
        'PENDING',
        c.id === 'QA-UI-legacy-map-gap'
          ? `LEGACY_MAP_MISSING: ${denominator.legacyMap.path} is not in this tree; the old SSR/DSH/OPS findings mapped to ui are not carried yet`
          : 'LEGACY_NOT_PROVEN: the old finding has no reproduced pre-fix commit in this layer yet'
      )
      continue
    }
    if (c.area === 'outcomes') {
      set(c, 'PENDING', `${OUTCOME_GAP}; measured meanwhile by: ${c.dimensions.measuredMeanwhile}`)
      continue
    }
    runnable.push(c)
  }

  // ---- which story cases are in scope ----
  const storyCases = runnable.filter((c) => c.area === 'screens' || c.area === 'blocks')
  const selectedIds = new Set(cases.map((c) => c.id))
  const proofTargetKeys = new Set()
  const storyMutantsToProve = []
  if (proveRed) {
    for (const m of STORY_MUTANTS) {
      if (!m.targets.some((t) => selectedIds.has(targetCaseId(denominator.itemDetails, t)))) continue
      storyMutantsToProve.push(m.id)
      for (const t of m.targets) proofTargetKeys.add(`${t.story.file}#${t.story.exportName}`)
    }
  }
  const switchProofWanted =
    proveRed &&
    SWITCH_MUTANTS.some((m) =>
      m.targets.some((t) => selectedIds.has(`QA-UI-${t.switchId}-switch-${t.family}`))
    )
  const inScope = (c) => {
    if (scope === 'all') return true
    if (c.area === 'screens') return true
    const d = denominator.itemDetails[c.itemIds[0]]
    return proofTargetKeys.has(`${d.file}#${d.exportName}`)
  }
  const toMeasure = []
  for (const c of storyCases) {
    if (!inScope(c))
      set(
        c,
        'PENDING',
        'SCOPE: building-block stories are outside the pilot scope (run with --scope all); the case is declared and counted as open'
      )
    else if (!EXECUTABLE.viewports.includes(variantOf(c)))
      set(c, 'PENDING', 'SCOPE: viewport not executable in this run')
    else toMeasure.push(c)
  }
  const switchCases = runnable.filter((c) => c.area === 'switches')
  const sheetCases = runnable.filter((c) => c.area === 'sheets')

  // ---- probes and processes ----
  let browser = null
  let sb = null
  let baselineRoot = null
  let envReason = null
  const onSignal = async (signal) => {
    await ledger.stopAll()
    process.exit(signal === 'SIGINT' ? 130 : 143)
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  const sheetWork = wantSheets && sheetCases.length > 0
  const needBrowser =
    toMeasure.length > 0 ||
    switchCases.length > 0 ||
    sheetWork ||
    storyMutantsToProve.length > 0 ||
    switchProofWanted
  const needStorybook = toMeasure.length > 0 || sheetWork || storyMutantsToProve.length > 0
  const liveEvidence = {}
  try {
    if (needBrowser) {
      try {
        browser = await launchBrowser({ ledger, outDir })
      } catch (error) {
        if (!(error instanceof EnvError)) throw error
        envReason = `ENV: ${error.message}`
        liveEvidence.chromium = error.probe?.probe
      }
    }
    if (browser && needStorybook) {
      try {
        // A scratch copy of the bench: Vite writes node_modules/.vite-temp next to the bench's own
        // node_modules, which in the repository would be a write inside the worktree.
        baselineRoot = path.join(outDir, 'scratch-baseline')
        await buildScratch(baselineRoot)
        sb = await startStorybook({
          benchDir: path.join(baselineRoot, 'packages/dev/tracy-design'),
          outDir,
          ledger
        })
      } catch (error) {
        if (!(error instanceof EnvError)) throw error
        envReason = `ENV: ${error.message}`
        liveEvidence.storybook = error.probe?.probe
      }
    }
    const probeFile = 'probes.json'
    await writeJson(path.join(outDir, probeFile), {
      chromium: browser ? 'ok' : (liveEvidence.chromium ?? 'not needed'),
      storybook: sb ? { port: sb.port } : (liveEvidence.storybook ?? 'not needed'),
      stand
    })

    const storyMap = sb ? indexStories(sb.index) : null
    const real = sb ? { baseUrl: sb.baseUrl, storyMap } : null

    // ---- RED proofs first, so the verdicts below can use them ----
    if (proveRed && browser && (sb || storyMutantsToProve.length === 0)) {
      if (storyMutantsToProve.length > 0) {
        const proved = await proveStoryMutants({
          outDir,
          ledger,
          browser,
          real,
          storyDetails: denominator.itemDetails,
          ctx,
          only: storyMutantsToProve
        })
        for (const [id, p] of proved.proofs) proofs.set(id, p)
        notes.push(...proved.notes)
      }
      if (switchProofWanted) {
        const switchProofs = await proveSwitchMutants({ outDir, browser })
        for (const [id, p] of switchProofs.proofs) proofs.set(id, p)
        notes.push(...switchProofs.notes)
      }
    } else if (proveRed && (storyMutantsToProve.length > 0 || switchProofWanted)) {
      notes.push(
        `--prove-red requested but ${envReason ?? 'the browser or Storybook is unavailable'}; no RED proof was produced`
      )
    }
    const provenFamilies = new Set([...proofs.values()].filter((p) => p.valid).map((p) => p.familyKey))
    const proofFor = (c) => {
      const p = proofs.get(c.id)
      return p?.valid ? { kind: p.kind, ref: p.ref, assertionId: p.assertionId, log: p.log } : null
    }

    // ---- story measurement ----
    if (toMeasure.length || sheetWork) {
      if (!browser || !sb) {
        for (const c of toMeasure) set(c, 'ENV', envReason ?? 'ENV: browser/Storybook unavailable')
      } else {
        const byStory = new Map()
        for (const c of toMeasure) {
          const list = byStory.get(c.itemIds[0]) ?? []
          list.push(c)
          byStory.set(c.itemIds[0], list)
        }
        if (sheetWork)
          for (const c of sheetCases) if (!byStory.has(c.itemIds[0])) byStory.set(c.itemIds[0], [])
        const measureDir = path.join(outDir, 'measure')
        await ensureDir(measureDir)
        const sheetShots = new Map()
        await pool([...byStory.entries()], options.concurrency ?? 2, async ([itemId, list]) => {
          const detail = denominator.itemDetails[itemId]
          const entry = entryFor(storyMap, detail)
          const t0 = Date.now()
          if (!entry) {
            for (const c of list)
              set(
                c,
                'PENDING',
                'TEST_INVALID: the story is in the denominator but not in the Storybook index (new story needs a Storybook restart, or the id mapping is wrong)'
              )
            return
          }
          const wants = new Set()
          for (const c of list) for (const w of NEEDS[familyOfCase(c).key](variantOf(c))) wants.add(w)
          if (wantSheets && detail.storyKind === 'real-screen') {
            wants.add('1440')
            wants.add('390')
            wants.add('shot')
          }
          let m
          try {
            m = await measureStory(browser, { baseUrl: sb.baseUrl, storyId: entry.id, wants })
          } catch (error) {
            for (const c of list)
              set(c, 'PENDING', `TEST_INVALID: measurement threw (${String(error.message).split('\n')[0]})`)
            return
          }
          if (m.shots) sheetShots.set(itemId, m.shots)
          const summary = { storyId: entry.id, key: detail.key, visits: {} }
          for (const [vp, v] of Object.entries(m.visits)) {
            summary.visits[vp] = {
              state: v.state,
              errorText: v.errorText,
              controls: v.facts?.controls.length ?? null,
              events: v.events.length,
              texts: v.facts?.texts.length ?? null,
              tabbed: v.order?.length ?? null
            }
          }
          const evidencePath = path.join('measure', `${detail.key}.json`)
          await writeJson(path.join(outDir, evidencePath), { ...summary, cases: list.map((c) => c.id) })
          for (const c of list) {
            const family = familyOfCase(c)
            const v = evaluate(family.key, variantOf(c), m, ctx)
            const durationMs = Date.now() - t0
            const evidence = [evidencePath]
            if (v.kind === 'harness') {
              set(c, 'PENDING', `TEST_INVALID: ${v.reason}`, { evidence, durationMs })
              continue
            }
            const check = v.result
            const d = decide(check, {
              proof: check.ok ? proofFor(c) : null,
              familyProven: provenFamilies.has(family.key),
              assertionId: family.assertionId
            })
            if (!check.ok && !check.vacuous) {
              const detailPath = path.join('measure', `${c.id}.violations.json`)
              await writeJson(path.join(outDir, detailPath), { id: c.id, violations: check.violations })
              evidence.push(detailPath)
            }
            set(c, d.verdict, d.reason, { evidence, durationMs, redProof: d.redProof ?? null })
          }
        })
        if (sheetWork)
          await captureSheets({
            outDir,
            denominator,
            sheetShots,
            browser,
            results,
            sheetCases,
            stand,
            notes
          })
      }
    }
    if (sheetWork && (!browser || !sb)) {
      for (const c of sheetCases) set(c, 'ENV', envReason ?? 'ENV: browser/Storybook unavailable for sheets')
    }
    for (const c of sheetCases) {
      if (!results.has(c.id)) {
        const lang = c.dimensions.languages[0]
        set(
          c,
          'PENDING',
          lang !== 'en'
            ? 'MANUAL: sheet not captured — the bench has no locale switch (preview.tsx globals are theme and direction only), so a non-English reference cannot be drawn'
            : wantSheets
              ? 'MANUAL: sheet capture failed or story not measured'
              : 'MANUAL: contact sheets not requested (run with --contact-sheets); human review pending'
        )
      }
    }

    // ---- switches ----
    if (switchCases.length)
      await runSwitchCases({
        switchCases,
        browser,
        envReason,
        denominator,
        outDir,
        proofFor,
        provenFamilies,
        set
      })
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    if (sb) await sb.stop().catch((error) => notes.push(`storybook stop failed: ${error.message}`))
    if (browser)
      await browser.close().catch((error) => {
        notes.push(`browser close failed: ${error.message}`)
        if (error.code === 'TEST_INVALID') cleanupInvalid.push(error.message)
      })
    if (baselineRoot)
      await removeScratch(outDir, baselineRoot).catch((error) =>
        notes.push(`baseline scratch removal failed: ${error.message}`)
      )
  }

  const leftovers = ledger.open
  if (leftovers.length)
    notes.push(
      `CLEANUP INCOMPLETE: ${leftovers.map((e) => `${e.kind}:${e.pid ?? e.port}`).join(', ')} still open in owned.json`
    )
  const ordered = invalidateOnCleanup(
    cases.map(
      (c) =>
        results.get(c.id) ??
        result(c, 'PENDING', 'NOT_RUN: no execution path produced a verdict for this case')
    ),
    cleanupInvalid
  )
  const extras = await finish({
    ordered,
    allCases: (await loadLayer()).cases,
    denominator,
    outDir,
    notes,
    stand,
    options,
    started,
    proofs
  })
  return { results: ordered, notes, ...extras }
}

async function runSwitchCases({
  switchCases,
  browser,
  envReason,
  denominator,
  outDir,
  proofFor,
  provenFamilies,
  set
}) {
  const needsBrowser = switchCases.filter((c) => !c.id.endsWith('-consumer'))
  let measured = null
  if (needsBrowser.length) {
    if (!browser) {
      for (const c of needsBrowser) set(c, 'ENV', envReason ?? 'ENV: chromium unavailable')
    } else {
      try {
        measured = await measureSwitches(browser, { workDir: path.join(outDir, 'switch-bundle') })
      } catch (error) {
        for (const c of needsBrowser)
          set(
            c,
            error instanceof EnvError ? 'ENV' : 'PENDING',
            error instanceof EnvError ? `ENV: ${error.message}` : `TEST_INVALID: ${error.message}`
          )
      }
    }
  }
  const evidenceFile = path.join('measure', 'switches.json')
  if (measured) {
    await ensureDir(path.join(outDir, 'measure'))
    await writeJson(path.join(outDir, evidenceFile), { hidden: measured.hidden, doorDown: measured.doorDown })
  }
  for (const c of switchCases) {
    const detail = denominator.itemDetails[c.itemIds[0]]
    const family = switchFamilyOfCase(c)
    let check
    if (family.key === 'consumer') {
      // Showing and hiding a piece is a product fact: it needs the real consumer mounted (in a scratch
      // build) or a verified product screen. A static reference, or a DOM drawn from a CSS rule, is only
      // a lead for a person, so this case is never decided here.
      const texts = []
      for (const file of detail.consumers) {
        try {
          texts.push({ file, text: await readRegular(path.join(REPO_ROOT, file)) })
        } catch {
          // a consumer that disappeared since generation simply stops counting
        }
      }
      const scan = checkConsumer({ id: detail.switchId, tabs: detail.tabs, locked: detail.locked }, texts)
      set(
        c,
        'PENDING',
        `PRODUCT_ADAPTER_MISSING: ${scan.ok ? `"${detail.switchId}" is read in code (${scan.consumers.join(', ')})` : `no product code reference to "${detail.switchId}" found by the static scan`}; showing and hiding the piece needs a mounted consumer or a verified product screen, which no adapter provides yet. A static reference is a lead for a person, not proof the piece hides`
      )
      continue
    } else {
      if (!measured) continue
      if (family.key === 'binding')
        check = checkBinding(detail.switchId, measured.switches, measured.hidden[detail.switchId])
      else if (family.key === 'door-down')
        check = checkDoorDown(detail.switchId, measured.switches, measured.doorDown)
      else
        check = checkTabPolicy(
          measured.switches.find((s) => s.id === detail.switchId),
          measured.hidden[detail.switchId]
        )
    }
    const evidence = [evidenceFile]
    const d = decide(check, {
      proof: check.ok ? proofFor(c) : null,
      familyProven: provenFamilies.has(family.key),
      assertionId: family.assertionId
    })
    set(c, d.verdict, d.reason, { evidence, redProof: d.redProof ?? null })
  }
}

async function proveSwitchMutants({ outDir, browser }) {
  const proofs = new Map()
  const notes = []
  const redDir = path.join(outDir, 'red')
  await ensureDir(redDir)
  const baselineDir = path.join(outDir, 'scratch-switch-baseline')
  const { MODULE_DIR } = await import('./switches.mjs')
  const baseline = await measureSwitches(browser, { workDir: baselineDir })
  await removeScratch(outDir, baselineDir)
  for (const mutant of SWITCH_MUTANTS) {
    const root = path.join(outDir, `scratch-switch-${mutant.id}`)
    try {
      await ensureDir(root)
      const { copyFile } = await import('node:fs/promises')
      for (const f of ['index.mjs', 'catalogue.json'])
        await copyFile(path.join(MODULE_DIR, f), path.join(root, f))
      const edits = []
      for (const e of mutant.edits) {
        const file = path.join(root, 'index.mjs')
        const before = await readRegular(file, { root })
        const parts = before.split(e.find)
        if (parts.length !== 2)
          throw new Error(`mutation anchor occurs ${parts.length - 1} times: ${e.find.slice(0, 60)}`)
        await writeAtomic(file, parts.join(e.replace))
        edits.push({ before: sha256(before), after: sha256(parts.join(e.replace)) })
      }
      const ids = [...new Set(mutant.targets.map((t) => t.switchId))]
      let broken
      try {
        broken = await measureSwitches(browser, {
          moduleDir: root,
          workDir: path.join(root, 'bundle'),
          only: ids
        })
      } catch (error) {
        notes.push(`${mutant.id}: the broken copy did not run (${error.message}); not counted as RED`)
        continue
      }
      for (const t of mutant.targets) {
        const family = SWITCH_FAMILIES.find((f) => f.key === t.family)
        const sw = baseline.switches.find((s) => s.id === t.switchId)
        const run = (m) =>
          family.key === 'binding'
            ? checkBinding(t.switchId, m.switches, m.hidden[t.switchId])
            : family.key === 'door-down'
              ? checkDoorDown(t.switchId, m.switches, m.doorDown)
              : checkTabPolicy(sw, m.hidden[t.switchId])
        const good = run(baseline)
        const bad = run(broken)
        const caseId = `QA-UI-${t.switchId}-switch-${family.key}`
        const valid = good.ok && !good.vacuous && !bad.ok && edits.every((e) => e.before !== e.after)
        const reason = valid
          ? ''
          : !good.ok
            ? 'BASELINE_RED'
            : good.vacuous
              ? 'VACUOUS_BASELINE'
              : bad.ok
                ? 'MUTANT_GREEN'
                : 'MUTATION_UNCHANGED'
        const log = path.join('red', `${caseId}.log`)
        await writeAtomic(
          path.join(outDir, log),
          `${[
            `mutant: ${mutant.id}`,
            `description: ${mutant.description}`,
            `case: ${caseId}`,
            `assertion: ${family.assertionId}`,
            ...edits.map(
              (e) => `edit: ui-switches/index.mjs ${e.before.slice(0, 12)} -> ${e.after.slice(0, 12)}`
            ),
            `baseline (real module): ${JSON.stringify({ ok: good.ok, vacuous: good.vacuous, violations: good.violations.map((v) => v.message).slice(0, 5) })}`,
            `mutant (scratch copy): ${JSON.stringify({ ok: bad.ok, violations: bad.violations.map((v) => v.message).slice(0, 5) })}`,
            `result: ${valid ? 'RED proven' : `NOT proven — ${reason}`}`
          ].join('\n')}\n`
        )
        proofs.set(caseId, {
          kind: 'mutation',
          ref: `${mutant.id}@${sha256(edits.map((e) => `${e.before}>${e.after}`).join('|')).slice(0, 12)}`,
          assertionId: family.assertionId,
          caseId,
          log,
          valid,
          reason,
          familyKey: family.key
        })
      }
    } finally {
      await removeScratch(outDir, root)
    }
  }
  return { proofs, notes }
}

// ---------------------------------------------------------------------------------------------
// Contact sheets and manual review
// ---------------------------------------------------------------------------------------------

const MANUAL_CHECKS = Object.freeze(['layout', 'copy-and-wording', 'clipping', 'icons', 'interactive-states'])

const ROUTES_PATH = path.join(REPO_ROOT, 'tests/qa/oracles/ui/product-routes.json')

function pngSize(buf) {
  return buf.length > 24 && buf.toString('latin1', 1, 4) === 'PNG'
    ? { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
    : null
}

async function loadRoutes() {
  try {
    const doc = JSON.parse(await readRegular(ROUTES_PATH))
    return doc.schema === 'ui-product-routes/1' && doc.routes && typeof doc.routes === 'object'
      ? doc.routes
      : null
  } catch {
    return null
  }
}

/**
 * Photograph the product side of one screen on the stand. Returns { png, url, provenance } or { reason }
 * where the reason says whether a prerequisite (ENV) or a missing adapter (PENDING) stopped it.
 * A page is the product side only when it is VERIFIED to be that screen in that state: it stayed on the
 * route's path (no login redirect), shows the route's identity marker, took effect in the requested
 * locale and the light theme, and states the product revision it was served from. An error status, a
 * redirect, a page that answers 200 without the marker, or an unrevisioned build is never a screenshot
 * of the screen, so none of them becomes one.
 */
export async function captureProduct({ browser, stand, routes, itemId, lang, viewport }) {
  if (!stand.ok) return { reason: `ENV: ${stand.detail}` }
  const origin = standOrigin(stand.url)
  if (!origin) return { reason: 'ENV: the stand is not a loopback origin; nothing was requested' }
  if (!routes) return { reason: 'PENDING: tests/qa/oracles/ui/product-routes.json is missing or malformed' }
  const route = routes[itemId]
  if (!route?.path)
    return { reason: 'PENDING: no verified product route for this screen (product-routes.json)' }
  const id = route.identity
  if (!id?.selector || !id.attribute || !id.value || !route.revisionHeader)
    return {
      reason:
        'PENDING: the route declares no screen identity (identity.selector, attribute and value) or revision header (revisionHeader), so it cannot be verified'
    }
  const query = route.locales?.[lang]
  if (query === undefined) return { reason: `PENDING: no product locale mechanism recorded for "${lang}"` }
  const proof = route.localeProof?.[lang]
  if (!proof?.selector || !proof.includes)
    return {
      reason: `PENDING: no locale proof (localeProof.${lang}: selector and expected text) recorded, so "${lang}" taking effect on the consumer cannot be verified`
    }
  if (!SAFE_ROUTE_PATH.test(route.path) || typeof query !== 'string' || !SAFE_ROUTE_QUERY.test(query))
    return { reason: `PENDING: route "${route.path}" is not a path on the stand; nothing was requested` }
  const url = new URL(`${route.path}${query}`, origin).href
  if (new URL(url).origin !== origin)
    return { reason: `PENDING: route "${route.path}" leaves the stand; nothing was requested` }
  // Service workers would answer outside context.route, so none may register.
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: 'block'
  })
  try {
    // Redirects and subrequests are confined too: anything off the stand origin, and any method that
    // writes, is aborted, not sent. The stand is read with GET and HEAD only.
    await context.route('**/*', (r) => {
      const req = r.request()
      const readOnly = ['GET', 'HEAD'].includes(req.method())
      return readOnly && new URL(req.url()).origin === origin ? r.continue() : r.abort('blockedbyclient')
    })
    // WebSockets bypass context.route; none is allowed to connect.
    await context.routeWebSocket('**/*', (ws) => ws.close())
    const page = await context.newPage()
    const res = await page.goto(url, { waitUntil: 'load', timeout: 30000 })
    if (!res || res.status() >= 400)
      return { reason: `PENDING: ${url} answered HTTP ${res?.status() ?? 'none'}, not a screen` }
    const finalPath = new URL(page.url()).pathname.replace(/\/$/, '') || '/'
    if (finalPath !== (route.path.replace(/\/$/, '') || '/'))
      return { reason: `PENDING: ${url} ended on ${finalPath}, not the screen (redirect or sign-in)` }
    const identity = await page
      .$eval(id.selector, (el, a) => el.getAttribute(a), id.attribute)
      .catch(() => null)
    if (identity === null)
      return { reason: `PENDING: ${url} does not show the identity marker ${id.selector}` }
    if (identity !== id.value)
      return {
        reason: `PENDING: ${url} identifies as ${id.attribute}="${identity}", not the screen "${id.value}"`
      }
    const proven = await page.$eval(proof.selector, (el) => el.textContent ?? '').catch(() => null)
    if (proven === null || !proven.includes(proof.includes))
      return { reason: `PENDING: ${url} does not show the "${lang}" text the locale proof expects` }
    const state = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dark:
        document.documentElement.classList.contains('dark') ||
        document.documentElement.dataset.theme === 'dark'
    }))
    if (state.lang.split('-')[0].toLowerCase() !== lang)
      return { reason: `PENDING: ${url} is in locale "${state.lang}", not "${lang}"` }
    if (state.dark) return { reason: `PENDING: ${url} is in the dark theme, the sheet is light` }
    const revision = res.headers()[route.revisionHeader.toLowerCase()]
    if (!revision)
      return { reason: `PENDING: ${url} did not state its revision (header ${route.revisionHeader})` }
    return {
      png: await page.screenshot({ fullPage: false }),
      url,
      provenance: {
        route: route.path,
        identity: id.selector,
        identityValue: identity,
        localeProof: proof.includes,
        routeSha256: sha256(stableStringify(route)),
        locale: state.lang,
        theme: 'light',
        viewport: `${viewport.width}x${viewport.height}`,
        revision
      }
    }
  } catch (error) {
    return { reason: `PENDING: product capture failed: ${error.message.split('\n')[0]}` }
  } finally {
    await context.close()
  }
}

async function captureSheets({
  outDir,
  denominator,
  sheetShots,
  browser,
  results,
  sheetCases,
  stand,
  notes
}) {
  const routes = await loadRoutes()
  const sheetsDir = path.join(outDir, 'sheets')
  await ensureDir(sheetsDir)
  const records = []
  for (const c of sheetCases) {
    const itemId = c.itemIds[0]
    const detail = denominator.itemDetails[itemId]
    const lang = c.dimensions.languages[0]
    const vp = c.dimensions.viewports[0]
    const sourceSha = sha256(await readRegular(path.join(REPO_ROOT, detail.file)))
    const base = `${detail.key}-${lang}-${vp}-light`
    const shot = sheetShots.get(itemId)?.[vp]
    const record = {
      id: c.id,
      screen: itemId,
      language: lang,
      viewport: vp,
      theme: 'light',
      storySourceSha256: sourceSha,
      bench: null,
      product: null,
      sheet: null,
      status: null
    }
    if (lang !== 'en') {
      record.status = 'blocked: the bench has no locale switch, so no non-English reference can be drawn'
    } else if (!shot) {
      record.status = 'blocked: the bench screenshot was not captured (story not measurable)'
    } else {
      const benchFile = path.join('sheets', `${base}.bench.png`)
      await writeAtomic(path.join(outDir, benchFile), shot)
      const benchSha = sha256(shot)
      record.bench = {
        file: benchFile,
        sha256: benchSha,
        size: `${VIEWPORTS.find((v) => v.id === vp).width}x${VIEWPORTS.find((v) => v.id === vp).height}`
      }
      const viewport = VIEWPORTS.find((v) => v.id === vp)
      const benchDims = pngSize(shot)
      record.bench.size = benchDims ? `${benchDims.width}x${benchDims.height}` : record.bench.size
      const prod = await captureProduct({ browser, stand, routes, itemId, lang, viewport })
      let productSha = null
      if (prod.png) {
        const productFile = path.join('sheets', `${base}.product.png`)
        await writeAtomic(path.join(outDir, productFile), prod.png)
        productSha = sha256(prod.png)
        const dims = pngSize(prod.png)
        record.product = {
          file: productFile,
          sha256: productSha,
          url: prod.url,
          provenance: prod.provenance,
          size: dims ? `${dims.width}x${dims.height}` : null
        }
      } else record.product = { file: null, reason: prod.reason }
      const expected = `${viewport.width}x${viewport.height}`
      const sameSize =
        record.product.file &&
        record.product.size === record.bench.size &&
        record.product.provenance?.viewport === expected &&
        record.product.provenance?.locale?.split('-')[0] === lang
      record.status = !record.product.file
        ? 'incomplete: bench captured, product side missing'
        : sameSize
          ? 'complete: both images captured, awaiting human review'
          : `incomplete: bench ${record.bench.size} and product ${record.product.size} differ in size`
      const sheetFile = path.join('sheets', `${base}.sheet.png`)
      try {
        const context = await browser.newContext({
          viewport: { width: Math.min(2400, viewport.width * 2 + 60), height: 1000 }
        })
        try {
          const page = await context.newPage()
          const productPanel = record.product.file
            ? `<div><div>PRODUCT ${record.product.size} light ${lang}</div><img style="border:1px solid #888;max-width:100%" src="data:image/png;base64,${prod.png.toString('base64')}"></div>`
            : `<div style="width:${viewport.width}px;border:2px dashed #c00;padding:20px;color:#c00"><div>PRODUCT: NOT CAPTURED</div><div>${record.product.reason}</div></div>`
          const caption = `story: ${detail.file}#${detail.exportName} · source sha256 ${sourceSha.slice(0, 16)} · bench png sha256 ${benchSha.slice(0, 16)}${productSha ? ` · product png sha256 ${productSha.slice(0, 16)} · ${record.product.url}` : ''} · ${record.status}`
          const html = `<body style="margin:0;font:12px ui-monospace,monospace;background:#fff;color:#111"><div style="display:flex;gap:20px;padding:10px"><div><div>BENCH (reference) ${record.bench.size} light en</div><img style="border:1px solid #888;max-width:100%" src="data:image/png;base64,${shot.toString('base64')}"></div>${productPanel}</div><div style="padding:10px">${caption}</div></body>`
          await page.setContent(html)
          await writeAtomic(path.join(outDir, sheetFile), await page.screenshot({ fullPage: true }))
          record.sheet = { file: sheetFile }
        } finally {
          await context.close()
        }
      } catch (error) {
        notes.push(`sheet render failed for ${c.id}: ${error.message.split('\n')[0]}`)
      }
    }
    records.push(record)
    results.set(
      c.id,
      result(
        c,
        'PENDING',
        `MANUAL: ${record.status}; human review pending (no machine verdict on look or wording)`,
        { evidence: [record.sheet?.file, record.bench?.file].filter(Boolean) }
      )
    )
  }
  await writeJson(path.join(outDir, 'sheets.json'), {
    schema: 'ui-sheets/1',
    generatedBy: 'tests/qa/layers/ui',
    sheets: records
  })
  await writeJson(path.join(outDir, 'manual-review.json'), {
    schema: 'ui-manual-review/1',
    note: 'Ticked by a person, never by the machine. A tick needs a receipt (who, when, revision). The machine only checks that every required sheet exists and is not stale.',
    required: records.length,
    sheets: records.map((r) => ({
      id: r.id,
      sheet: r.sheet?.file ?? null,
      bench: r.bench?.file ?? null,
      status: r.status,
      checks: MANUAL_CHECKS.map((id) => ({ id, state: 'pending' })),
      receipt: null
    }))
  })
}

/** A recorded sheet is stale when the story source it was drawn from has changed. */
export async function sheetIsFresh(record, root = REPO_ROOT, file = null, current = {}) {
  if (!record.bench?.file || !record.bench.sha256) return false
  // a product image counts only with the provenance that says which screen, state and revision it shows
  if (record.product?.file) {
    const p = record.product.provenance
    if (
      !record.product.sha256 ||
      !p?.route ||
      !p.identityValue ||
      !p.routeSha256 ||
      !p.locale ||
      !p.theme ||
      !p.viewport ||
      !p.revision
    )
      return false
    // the route as declared TODAY must still be the one the image was taken from
    if (current.routes) {
      const now = current.routes[record.screen]
      if (!now || sha256(stableStringify(now)) !== p.routeSha256) return false
    }
    if (current.revision !== undefined && current.revision !== p.revision) return false
  }
  // recorded image hashes must still match the files, when the caller can read them
  if (current.imageRoot) {
    for (const img of [record.bench, record.product?.file ? record.product : null]) {
      if (!img) continue
      try {
        const bytes = await readRegular(path.join(current.imageRoot, img.file), {
          root: current.imageRoot,
          encoding: null
        })
        if (sha256(bytes) !== img.sha256) return false
      } catch {
        return false
      }
    }
  }
  try {
    const current = sha256(await readRegular(path.join(root, file ?? record.storyFile), { root }))
    return current === record.storySourceSha256
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------------------------
// Coverage and report
// ---------------------------------------------------------------------------------------------

/**
 * Obligations come from `cases`, which must be the WHOLE declared manifest, never the run's selection:
 * `ordered` (the results of this run) is merged in afterwards, and a case with no result stays PENDING in
 * its own cell. A result for a case the manifest does not know, or two results for one case, is a
 * contract error rather than something to average away.
 */
export function buildCoverage({ denominator, cases, ordered }) {
  const known = new Set(cases.map((c) => c.id))
  const byCase = new Map()
  for (const r of ordered) {
    if (!known.has(r.id)) throw new ContractError(`result for a case the manifest does not declare: ${r.id}`)
    if (byCase.has(r.id)) throw new ContractError(`two results for case ${r.id}`)
    byCase.set(r.id, r)
  }
  const casesByItem = new Map()
  for (const c of cases) for (const id of c.itemIds) casesByItem.set(id, [...(casesByItem.get(id) ?? []), c])
  const tally = { pass: 0, fail: 0, measuredNoProof: 0, declaredPending: 0, open: 0, na: 0 }
  const perKind = {}
  const items = {}
  for (const item of denominator.items) {
    // An item that is only N-A still counts: its tags are N-A obligations. Nothing asked at all is skipped.
    if (item.requiredTags.length === 0 && Object.keys(item.na).length === 0) continue
    const mine = casesByItem.get(item.id) ?? []
    const tags = {}
    // Required and N-A are disjoint in the shared contract: both lists together are what the item was asked.
    for (const tag of [...item.requiredTags, ...Object.keys(item.na)]) {
      let status
      if (item.na[tag] !== undefined) status = 'na'
      else {
        const covering = mine.filter((c) => c.edgeTags.includes(tag))
        const verdicts = covering.map((c) => byCase.get(c.id))
        if (covering.length === 0) status = 'open'
        else if (verdicts.some((v) => v?.verdict === 'FAIL')) status = 'fail'
        else if (verdicts.every((v) => v?.verdict === 'PASS')) status = 'pass'
        else if (verdicts.some((v) => /^(NO_RED_PROOF|UNPROVEN_ASSERTION)/.test(v?.reason ?? '')))
          status = 'measuredNoProof'
        else status = 'declaredPending'
      }
      tags[tag] = status
      tally[status] += 1
      perKind[item.kind] ??= { pass: 0, fail: 0, measuredNoProof: 0, declaredPending: 0, open: 0, na: 0 }
      perKind[item.kind][status] += 1
    }
    items[item.id] = tags
  }
  const screens = denominator.items.filter((i) => i.kind === 'ui-story-screen')
  // One entry per screen x language x viewport x theme, carrying EVERY obligation of that cell
  // (each story assertion that applies at that viewport, plus the contact sheet) with its own case and
  // verdict. A cell is PASS only when all of its obligations are; one green assertion never lifts the rest.
  const cellStatus = { pass: 0, fail: 0, pending: 0, noObligations: 0 }
  const cells = {}
  const matrixAxes = denominator.matrix.axes
  const verdictCode = (r) =>
    r ? `${r.verdict}${r.reason ? `: ${r.reason.split(/[:(]/)[0].slice(0, 60)}` : ''}` : 'PENDING: not run'
  for (const s of screens) {
    const mine = (casesByItem.get(s.id) ?? []).filter((c) => c.area === 'screens' || c.area === 'sheets')
    const byScreen = {}
    for (const lang of matrixAxes.languages) {
      for (const vp of matrixAxes.viewports) {
        for (const theme of matrixAxes.themes) {
          const obligations = {}
          const applicable = mine.filter((c) => c.dimensions.viewports.includes(vp))
          const exactCases = applicable.filter(
            (c) => c.dimensions.languages.includes(lang) && c.dimensions.themes.includes(theme)
          )
          // every exact case keeps its own obligation: several cases on one assertion never overwrite
          for (const c of exactCases) {
            const key = obligations[c.assertionIds[0]] ? `${c.assertionIds[0]}@${c.id}` : c.assertionIds[0]
            obligations[key] = { case: c.id, verdict: verdictCode(byCase.get(c.id)) }
          }
          // a case with no adapter for this locale/theme keeps its own PENDING obligation, one per case
          const exactIds = new Set(exactCases.map((c) => c.id))
          for (const c of applicable) {
            if (c.area === 'sheets' || exactIds.has(c.id)) continue
            const base = c.assertionIds[0]
            const key = obligations[base] ? `${base}@${c.id}` : base
            obligations[key] = {
              case: null,
              forCase: c.id,
              verdict: `PENDING: no ${lang}/${theme} adapter for this assertion yet`
            }
          }
          const verdicts = Object.values(obligations).map((o) => o.verdict)
          let status
          if (verdicts.length === 0) status = 'noObligations'
          else if (verdicts.some((v) => v.startsWith('FAIL'))) status = 'fail'
          else if (verdicts.every((v) => v.startsWith('PASS'))) status = 'pass'
          else status = 'pending'
          cellStatus[status] += 1
          byScreen[`${lang}/${vp}/${theme}`] = { status, obligations }
        }
      }
    }
    cells[s.id] = byScreen
  }
  return {
    complete: false,
    completeReasons: [
      ...(denominator.unresolved.length
        ? [`${denominator.unresolved.length} unresolved source(s) in the denominator`]
        : []),
      'only en x light cells have case adapters; every other locale and theme obligation is PENDING in coverage.cells',
      'role, switch and platform axes of each screen are not enumerated',
      'contact sheets need a product side that does not exist yet; human verdicts are pending'
    ],
    items: tally,
    byKind: perKind,
    matrix: { cellCount: denominator.matrix.cellCount, executableAxes: EXECUTABLE, cells: cellStatus },
    perItem: items,
    cells
  }
}

async function finish({ ordered, denominator, allCases, outDir, notes, stand, started }) {
  const counts = { PASS: 0, FAIL: 0, ENV: 0, PENDING: 0 }
  for (const r of ordered) counts[r.verdict] += 1
  const coverage = buildCoverage({ denominator, cases: allCases, ordered })
  const redProven = ordered.filter((r) => r.redProof).length
  const reasons = new Map()
  for (const r of ordered) {
    if (r.verdict === 'PASS') continue
    const key = `${r.verdict} ${r.reason.split(/[:(]/)[0].slice(0, 60)}`
    reasons.set(key, (reasons.get(key) ?? 0) + 1)
  }
  await writeJson(path.join(outDir, 'coverage.json'), coverage)
  await writeJson(path.join(outDir, 'results.json'), ordered)
  const fails = ordered.filter((r) => r.verdict === 'FAIL')
  const md = [
    '# ui layer report',
    '',
    `Counts: PASS ${counts.PASS} · FAIL ${counts.FAIL} · ENV ${counts.ENV} · PENDING ${counts.PENDING} (total ${ordered.length}); RED-proven ${redProven}; duration ${Math.round((Date.now() - started) / 1000)}s`,
    `Denominator: ${denominator.items.length} items (${denominator.counts.realScreens} real screens, ${denominator.counts.buildingBlocks} building blocks, ${denominator.counts.proposals} proposals, ${denominator.counts.clientEntries} client entries, ${denominator.counts.switches} switches, ${denominator.counts.languages} languages); ${denominator.unresolved.length} unresolved; complete=${denominator.complete}`,
    `Matrix: ${denominator.matrix.cellCount} cells declared; executable axes ${JSON.stringify(EXECUTABLE)}; cells ${JSON.stringify(coverage.matrix.cells)}`,
    `Obligations (item x required tag): ${JSON.stringify(Object.fromEntries(Object.entries(coverage.items).sort(([a], [b]) => (a < b ? -1 : 1))))}`,
    `Stand: ${stand.detail}`,
    '',
    '## FAIL (product findings)',
    ...(fails.length
      ? fails.slice(0, 200).map((r) => `- ${r.id}: ${r.reason}  [${r.evidence.join(', ')}]`)
      : ['- none']),
    '',
    '## Non-PASS grouped by reason',
    ...[...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${n} × ${k}`),
    '',
    '## Notes',
    ...(notes.length ? notes.map((n) => `- ${n}`) : ['- none']),
    '',
    '## Every non-PASS case',
    ...ordered
      .filter((r) => r.verdict !== 'PASS')
      .slice(0, 5000)
      .map((r) => `- ${r.verdict} ${r.id}: ${r.reason}`)
  ].join('\n')
  await writeAtomic(path.join(outDir, 'report.md'), `${md}\n`)
  return { counts, redProven, coverage }
}
