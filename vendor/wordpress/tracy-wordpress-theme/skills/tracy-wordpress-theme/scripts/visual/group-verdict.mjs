#!/usr/bin/env node
// group-verdict.mjs — is a page group done? A thin composition over judgments the skill already makes; it
// recounts nothing.
//
//   node scripts/visual/group-verdict.mjs --pages /a,/b --spec <spec dir> --visual <run dir|visual.json>
//        --artifact <theme zip> --seed-report <seed.json> --config <review.config.json>
//        [--parity <http-parity.json> … --accept <parity-accepted.json>]   (one --parity per reference kind the group has)
//        --contract <the group's canonical visual.contract.json> --site <the group's stand origin>
//        --group <id> --port-audit <the group's dossier> [--severity severity.json] [--out verdict.json] [--json]
//
// `--contract` is the GROUP's own contract (`contract.mjs init --run-root <group dossier> --group <id> --pages …`),
// bound to the group's stand: its seed report, its built zip, its spec copy.

// `--port-audit` names the group's own dossier (the directory of --contract, holding DECISIONS.md): its `port-audit.json`
// (review/port-audit.mjs --dossier --out) must be a clean, current receipt of that dossier, of this stand and of every page of
// the group, over this run's interaction.json — lib/audit-receipt.mjs. No receipt, or one that is not current, is `incomplete`.
// `--pages` are WordPress paths. Where each rule lives:
//   run status      visual.json as report.mjs wrote it: stages[].status, summary.stale, summary.intrinsic.blocking
//                   (the run's own exit rule, `exitCodeOf`), axes with `measured:false` = not complete.
//   clusters        cluster.mjs over the group's pages: its `open`/`accepted` split is the tools' (an accepted
//                   finding already cites a decision from review.config.json `visual.exceptions[]`).
//   identity        lib/canonical.mjs: the contract's hash and its `bindings` (spec, page-map, seed report, artifact,
//                   review.config.json) against the files as they are now; the report's identity against the same.
//   parity scope    references/inputs/spec-pack.md: a page's EFFECTIVE `reference.kind` (page entry over the pack
//                   default). Only url/html pages go to http-parity; image/none pages need no parity file.
//   parity input    http-parity.mjs writes `inputs.acceptHash` (parity-accepted.json); a different file now = stale.
//   exceptions      SKILL.md §Done rule: a failing item stays open unless severity.json names it minor AND cites an
//                   S-/D-number (`exception`); a severity label alone never accepts a failure.
// Exit 0 only for `done`; 1 `open` (whole evidence, blocking item open); 3 `incomplete` (missing/stale — measure
// again); 2 bad input. A `--pages` report is targeted evidence: this closes a GROUP, never the release gate.
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { emitResult, oneLine, takeOutputFlags } from '../lib/cli-output.mjs'
import { clusterFindings } from './cluster.mjs'
import { bindingsFrom, contractHash, darkDerivedProblems, fileHash, groupIdOf, isGroupCanonicalPath, stalenessOf } from '../lib/canonical.mjs'
import { exitCodeOf } from './report.mjs'
import { groupPages } from './group-pages.mjs'
import { effectiveKinds, routeIndex } from '../lib/route-index.mjs'
import { citationErrors, parseDecisions, readSmallFile } from '../lib/parity-acceptance.mjs'
import { AUDIT_FILE, DOSSIER_INPUTS, auditReceiptProblems } from '../lib/audit-receipt.mjs'
import { SOURCE_DEPENDENT_CHECKS, checkApplicability, imageReferenceReason } from './applicability.mjs'

const STAGES = ['light-desktop', 'light-responsive', 'dark-desktop', 'dark-responsive']
const VARIANTS = ['1440-light', '390-light', '1440-dark', '390-dark']
const SEVERITIES = ['blocker', 'major', 'minor']
const HTTP_KINDS = ['url', 'html']
const EXCEPTION_ID = /^[SD](?:-[a-z][a-z0-9]*)*-\d+$/

const readJson = (file, what) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`${what} ${file}: ${e.message}`)
  }
}

export { effectiveKinds }

const bare = (x) => (String(x).length > 1 ? String(x).replace(/\/+$/, '') : String(x))

/**
 * One route identity per page: a page is asked for by the WordPress path the group was given — the page-map's
 * (`/team`) or the seeded one (`/our-team/`) — and every record (spec kind, visual report, parity route) is found
 * through the contract's page, which knows both.
 */
export function routeIdentity(contract, asked) {
  // an ambiguous contract (two pages on one route) resolves nothing here; groupVerdict names the ambiguity itself
  let hit
  try {
    hit = routeIndex(contract?.pages).resolve(asked) ?? undefined
  } catch {
    hit = undefined
  }
  const forms = [...new Set([asked, hit?.pagemapPath, hit?.path].filter((x) => typeof x === 'string' && x).map(bare))]
  // `target` is the seeded route: the one path the visual report and the parity run must have measured
  return { asked, key: hit ? `page:${hit.id}` : bare(asked), forms, target: bare(hit?.path ?? asked) }
}

/** DECISIONS.md parsed, or null when it cannot be read: a citation then resolves to nothing. */
const decisionsFor = (file) => {
  try {
    return parseDecisions(readSmallFile(file, 'decisions'))
  } catch {
    return null
  }
}

/** Pure: the verdict over parsed inputs. `current` = { bindings, acceptHash, newest (ms), site } of the files now. */
export function groupVerdict({ group = null, pages, kinds, visual, parity = null, contract, plan = null, severity = {}, decisions, current = {}, audit = null }) {
  const incomplete = []
  const open = []
  const minor = []
  const paths = new Set(pages)
  try {
    routeIndex(contract?.pages)
  } catch (e) {
    incomplete.push(`contract: ${e.message}`)
  }
  const ids = new Map(pages.map((p) => [p, routeIdentity(contract, p)]))
  const kindOf = (p) => {
    const nk = new Map([...kinds].map(([k, v]) => [bare(k), v]))
    for (const f of ids.get(p).forms) if (nk.has(f)) return nk.get(f)
    return undefined
  }
  const knownKind = (p) => ids.get(p).forms.some((f) => [...kinds.keys()].some((k) => bare(k) === f))
  const sev = (id) => {
    const s = severity[id]
    if (s === undefined) return { level: null }
    if (!SEVERITIES.includes(s?.severity) || !s?.reason) throw new Error(`severity ${id}: needs severity (${SEVERITIES.join('|')}) and a reason`)
    if (s.severity === 'minor') {
      // a minor severity is an acceptance: it cites ONE existing decision that is about this item
      if (!EXCEPTION_ID.test(s.exception ?? '')) return { level: null, note: `severity minor without a named exception (S-/D-number): still open` }
      // (`decisions` left out: the legacy check above is all that is applied; the CLI always passes what DECISIONS.md parsed to, or null)
      const refused = decisions === undefined ? [] : citationErrors(s.exception, [String(id)], decisions)
      if (refused.length) return { level: null, note: `severity minor: exception ${s.exception} refused (${refused[0]}): still open` }
    }
    return { level: s.severity, exception: s.exception }
  }
  const row = (base, id) => {
    const s = sev(id)
    const r = { ...base, severity: s.level ?? 'unclassified', ...(s.exception ? { exception: s.exception } : {}), ...(s.note ? { note: s.note } : {}) }
    ;(r.severity === 'minor' ? minor : open).push(r)
  }
  for (const p of paths) if (!knownKind(p)) incomplete.push(`spec: ${p} is not a page of the page-map`)

  // --- Visual QA: the run's own verdict ---
  const idOfPath = new Map()
  const wantOfPage = new Map()
  const inGroup = []
  const claimed = new Set()
  for (const want of paths) {
    const target = ids.get(want).target
    for (const p of visual.pages ?? []) if (bare(p.path) === target && !claimed.has(p)) (claimed.add(p), idOfPath.set(want, p.id), wantOfPage.set(p, want), inGroup.push(p))
  }
  for (const want of paths) {
    const target = ids.get(want).target
    const rows = (visual.pages ?? []).filter((p) => bare(p.path) === target)
    if (rows.length > 1) incomplete.push(`visual: ${rows.length} page reports for the seeded route ${target} — the run's route is ambiguous`)
  }
  for (const want of paths) if (!idOfPath.has(want)) incomplete.push(`visual: no page report for ${want}`)
  // A source the contract declares has no dark of its own (source.darkDerived: page-map theme.darkDerived, no dark switch on the
  // source) leaves a dark axis's menus nothing to be opened against. That axis is closed by the declaration and listed in
  // `notOwed`, never silently: any other reason, a light axis, or a contract without the declaration still owes it (ja-restaurant S-32).
  // The declaration stands only on a contract fresh for the spec-pack being read: `current.sourceDarkDerived` is what
  // lib/canonical.mjs darkDerivedProblems found on it (the CLI computes it, as release.mjs does), and no binding moved since.
  const derivedDark = current.sourceDarkDerived === true && contract?.source?.darkDerived === true && !contract.source.darkHook && !contract.source.darkRequestHook && Boolean(current.bindings?.specHash) && current.bindings.specHash === contract.bindings?.specHash && !stalenessOf(contract, current.bindings).length
  const notOwed = []
  for (const p of inGroup) {
    const have = new Set((p.axes ?? []).map((a) => a.variant))
    for (const v of VARIANTS) if (!have.has(v)) incomplete.push(`visual: ${p.path} has no ${v} axis`)
    const contractPage = (contract?.pages ?? []).find((x) => x.id === p.id)
    // `kinds` is computed from page-map.json + reference.json by the CLI. The contract's copy is
    // validated against those files, but a report must never grant N/A based on that copy alone.
    const referenceKind = kindOf(wantOfPage.get(p))
    const hasBoundKind = referenceKind != null
    const sourceIndependent = checkApplicability(referenceKind, 'menu-comparison') === 'not-applicable'
    if (hasBoundKind && contractPage?.referenceKind !== undefined && contractPage.referenceKind !== referenceKind)
      incomplete.push(`visual: ${p.path} contract reference.kind ${contractPage.referenceKind} differs from reference.json (${referenceKind ?? 'legacy/unknown'})`)
    for (const a of p.axes ?? []) {
      const darkClosed = derivedDark && !sourceIndependent && a.menus?.measured === false && /-dark$/.test(a.variant ?? '') && /^the source export has no dark of its own/.test(a.menus.reason ?? '')
      if (darkClosed) notOwed.push({ page: p.path, variant: a.variant, what: 'menus', reason: 'the contract declares the source has no dark of its own (source.darkDerived): the dark menus have no source to be compared with; the port\'s dark is measured by this axis' })
      const naRows = a.notApplicable ?? []
      const na = new Set(naRows.map((x) => x?.check))
      if (naRows.length && !hasBoundKind) incomplete.push(`visual: ${p.path} ${a.variant} not-applicable evidence requires --spec to bind reference.kind=none`)
      else if (naRows.length && !sourceIndependent) incomplete.push(`visual: ${p.path} ${a.variant} has not-applicable evidence but reference.kind is ${referenceKind}`)
      if (sourceIndependent) {
        if (na.size !== naRows.length) incomplete.push(`visual: ${p.path} ${a.variant} repeats a not-applicable check`)
        for (const row of naRows) if (!SOURCE_DEPENDENT_CHECKS.includes(row?.check) || row?.status !== 'not-applicable' || row?.reason !== 'reference.kind=none') incomplete.push(`visual: ${p.path} ${a.variant} has malformed not-applicable evidence`)
        for (const check of SOURCE_DEPENDENT_CHECKS)
          if (!na.has(check) || checkApplicability(referenceKind, check) !== 'not-applicable') incomplete.push(`visual: ${p.path} ${a.variant} lacks typed not-applicable evidence for ${check}`)
      }
      const menusOwed = sourceIndependent
        ? a.menus?.measured !== true || a.menus?.targetOnly !== true || a.menus?.comparison?.check !== 'menu-comparison' || a.menus?.comparison?.status !== 'not-applicable' || a.menus?.comparison?.reason !== 'reference.kind=none'
        : referenceKind === 'image' && a.menus?.measured === false
          ? a.menus?.comparison?.check !== 'menu-comparison' || a.menus?.comparison?.status !== 'source-unavailable' || a.menus?.comparison?.reason !== imageReferenceReason
          : a.menus?.measured === false && !darkClosed
      if (!hasBoundKind && a.menus?.targetOnly === true) incomplete.push(`visual: ${p.path} ${a.variant} target-only menu evidence requires --spec to bind reference.kind=none`)
      if ((a.findings ?? []).some((f) => f.kind === 'axis-error')) incomplete.push(`visual: ${p.path} ${a.variant} ended in axis-error`)
      if (a.measured === false || menusOwed) incomplete.push(`visual: ${p.path} ${a.variant} was not measured${a.menus?.reason ? ` (${a.menus.reason})` : ''}`)
    }
  }
  const stages = new Map((visual.stages ?? []).map((s) => [s.id, s.status]))
  for (const s of STAGES) if (!['pass', 'fail'].includes(stages.get(s))) incomplete.push(`visual: stage ${s} is ${stages.get(s) ?? 'absent'}, not run`)
  if (!['targeted-debug', 'full'].includes(visual.scope?.kind)) incomplete.push(`visual: scope ${visual.scope?.kind ?? 'absent'} is not a group measurement`)
  if (!visual.summary?.intrinsic) incomplete.push('visual: no intrinsic mobile probe in the run (it is part of every run)')
  const id = visual.identity ?? {}
  if (id.stale?.length) incomplete.push(`visual: contract stale — ${id.stale.join('; ')}`)

  // --- identity: bound to what the skill records (canonical.mjs) as the files are now ---
  const b = current.bindings ?? {}
  if (!contract) incomplete.push('contract: not given or not readable')
  else {
    // The group's OWN contract (`contract.mjs init --group`): its id, its pages, its bindings. A site contract
    // (all pages, main stand's seed report) or another group's can never close this group.
    const cg = groupIdOf(contract)
    if (!cg) incomplete.push('contract: not a page group contract — run `contract.mjs init --group <id> --pages …` in the group dossier')
    else {
      if (group !== cg) incomplete.push(`contract: belongs to group ${cg}, this verdict is for group ${group ?? '(none given)'}`)
      // one identity per page whichever route form names it (the page-map's or the seeded one)
      const owned = new Map(contract.group.pages.map((x) => [routeIdentity(contract, x).key, x]))
      const asked = new Map(pages.map((x) => [ids.get(x).key, x]))
      for (const [k, x] of asked) if (!owned.has(k)) incomplete.push(`contract: ${x} is not one of group ${cg}'s pages`)
      for (const [k, x] of owned) if (!asked.has(k)) incomplete.push(`contract: group ${cg} owns ${x}, which --pages leaves out — the verdict covers every page of the group`)
      // the group's OWN stand, and canonical evidence: the report and the contract name the same origin, and the
      // contract is the dossier's canonical file, not a measured attempt
      const target = contract.target?.site
      if (!target) incomplete.push('contract: records no target site — re-init the group contract with --site <origin>')
      else {
        const measured = originOrNull(visual.site)
        if (!measured || measured !== target) incomplete.push(`visual: measured at ${visual.site ?? '(no site)'}, the group's stand is ${target}`)
        // the stand this verdict is asked for is mandatory: without it a report measured elsewhere cannot be told apart
        if (!current.site || originOrNull(current.site) !== target) incomplete.push(current.site ? `contract: bound to ${target}, this verdict is for the stand ${current.site}` : 'verdict: no --site — the group\'s own stand origin is required')
      }
      if (id.canonical !== true) incomplete.push('visual: measured against a contract that is not the canonical one (an attempt, or a copy) — not group evidence')
      // the contract given is the very file the run measured against (a copy has another path), and it is canonical
      if (!current.contractPath || !isGroupCanonicalPath(current.contractPath, contract)) incomplete.push(`contract: ${current.contractPath ?? '(no path)'} is not the canonical visual.contract.json of the dossier it names (${contract.group?.dossier ?? 'no group.dossier — re-init'}): a copy or an attempts/ file is never group evidence`)
      else if (!id.contractPath || !isGroupCanonicalPath(id.contractPath, contract)) incomplete.push(`visual: the run measured against ${id.contractPath ?? '(no contract path)'}, not the group's contract ${path.resolve(current.contractPath)}`)
      if (id.group !== cg) incomplete.push(`visual: the run's report is for ${id.group ? `group ${id.group}` : 'a site contract'}, not group ${cg}`)
    }
    if (id.contractHash !== contractHash(contract)) incomplete.push('visual: measured against a different contract than the one now (re-init changed it)')
    for (const r of stalenessOf(contract, b)) incomplete.push(`contract: stale — ${r}`)
    if (!contract.bindings?.configHash) incomplete.push('contract: records no review.config.json hash — run `contract.mjs init` again')
    for (const k of ['specHash', 'pageMapHash', 'seedReportHash', 'artifactHash', 'configHash'])
      if (!b[k]) incomplete.push(`identity: ${k} could not be computed from the inputs given`)
  }
  if (!b.specHash || id.sourceHash !== b.specHash) incomplete.push('visual: spec binding differs from the spec now (or none given)')
  if (!b.artifactHash || id.artifactHash !== b.artifactHash) incomplete.push('visual: artifact binding differs from the installed zip (or none given)')
  if (!b.seedReportHash || id.seedReportHash !== b.seedReportHash) incomplete.push('visual: seed-report binding differs from the current seed report (or none given)')
  if (current.newest && !(Date.parse(visual.at) >= current.newest)) incomplete.push('visual: measured before the last build/seed/spec change')

  // --- the finish audit: a clean current receipt of the group's dossier, over THIS run's interaction record ---
  // `audit` = { dossier, interaction (the run's interaction.json), now }; the dossier, the stand and the routes are the verdict's own
  if (!audit) incomplete.push('audit: no --port-audit — name the group\'s dossier whose finish audit (port-audit.json) this verdict stands on')
  else {
    const at = Date.parse(visual.at)
    // the group's own dossier is where its contract lives: an audit of another directory is another dossier's audit
    if (audit.contractDir && path.resolve(audit.dossier) !== audit.contractDir) incomplete.push(`audit: ${audit.dossier} is not the dossier of the contract (${audit.contractDir})`)
    const r = auditReceiptProblems({
      dossier: audit.dossier,
      site: current.site ?? '',
      routes: pages.map((p) => ids.get(p).forms),
      interaction: [{ file: audit.interaction, routes: inGroup.map((p) => p.path), source: originOrNull(contract?.source?.site), referenceKinds: Object.fromEntries(inGroup.filter((p) => p.referenceKind).map((p) => [p.path, p.referenceKind])) }],
      notBefore: Number.isFinite(at) ? at : null,
      ...(audit.now ? { now: audit.now } : {})
    })
    for (const p of r.problems) incomplete.push(`audit [${p.code}]: ${p.message}`)
  }

  // --- HTTP parity: only the pages whose effective kind has an HTTP source ---
  const needParity = [...paths].filter((p) => HTTP_KINDS.includes(kindOf(p)))
  const noParity = [...paths].filter((p) => knownKind(p) && !HTTP_KINDS.includes(kindOf(p)))
  // the seeded route itself: a report that measured only the obsolete page-map path (`/team` for `/our-team/`) is no evidence
  const byForm = new Map()
  const dupRoutes = new Set()
  for (const r of parity?.routes ?? []) {
    const k = bare(r.targetPath)
    if (byForm.has(k)) dupRoutes.add(k)
    byForm.set(k, r)
  }
  for (const k of dupRoutes) incomplete.push(`parity: more than one row for the seeded route ${k} — the evidence is ambiguous`)
  const byTarget = { has: (p) => byForm.has(ids.get(p).target), get: (p) => byForm.get(ids.get(p).target) }
  if (needParity.length) {
    if (!parity) incomplete.push(`parity: --parity is required for ${needParity.join(', ')} (kind ${HTTP_KINDS.join('/')})`)
    else {
      // parity measured on the group's own stand, like the visual run
      const pt = originOrNull(parity.target)
      if (!pt || (contract?.target?.site && pt !== contract.target.site)) incomplete.push(`parity: measured at ${parity.target ?? '(no target)'}, the group's stand is ${contract?.target?.site ?? '(unknown)'}`)
      // every HTTP page: one row at the seeded target, read from the PLANNED source (route and origin), not any row that landed there
      const planOf = new Map((plan ?? []).flatMap((e) => [[`page:${e.id}`, e], [bare(e.path), e]]))
      for (const want of needParity) {
        const target = ids.get(want).target
        if (!byTarget.has(want)) {
          incomplete.push(`parity: no route reached ${target}`)
          continue
        }
        const planned = planOf.get(ids.get(want).key) ?? planOf.get(target)
        const row = byTarget.get(want)
        if (!planned) incomplete.push(`parity: no route plan for ${want} — the verdict cannot tell what source ${target} should have been read from`)
        else {
          if (bare(row.route ?? '') !== bare(planned.sourceRoute ?? '')) incomplete.push(`parity: ${target} was read from the source route ${row.route ?? '(none)'}, the plan says ${planned.sourceRoute}`)
          if (planned.kind === 'url') {
            const want0 = originOrNull(contract?.source?.site)
            if (!want0 || row.sourceOrigin !== want0) incomplete.push(`parity: ${target} was read from the source ${row.sourceOrigin ?? '(none)'}, the contract's live source is ${want0 ?? '(none)'}`)
          } else if (!row.sourceOrigin) incomplete.push(`parity: ${target} names no source origin`)
        }
      }
      if (current.newest && !(Date.parse(parity.generatedAt) >= current.newest)) incomplete.push('parity: measured before the last build/seed/spec change')
      if ((parity.inputs?.acceptHash ?? null) !== (current.acceptHash ?? null)) incomplete.push('parity: parity-accepted.json differs from the one the run used — measure again')
    }
  }

  // --- clusters and failing routes: open unless a named exception says otherwise ---
  const result = clusterFindings(inGroup)
  for (const c of result.clusters.filter((x) => x.status === 'open')) row({ id: c.id, kind: c.kind, selector: c.selector, property: c.property, pages: c.pages }, c.id)
  for (const want of needParity) {
    const r = byTarget.get(want)
    if (r && !r.ok) row({ id: `parity:${want}`, kind: 'parity', pages: [want] }, `parity:${want}`)
  }
  if (visual.summary?.intrinsic?.blocking) open.push({ id: 'intrinsic-mobile', kind: 'intrinsic', pages: [], severity: 'blocker', note: 'the run reports a blocking intrinsic mobile defect (report.mjs exitCodeOf)' })
  const verdict = incomplete.length ? 'incomplete' : open.length ? 'open' : 'done'
  const notApplicable = Object.fromEntries(SOURCE_DEPENDENT_CHECKS.map((check) => [check, 0]))
  for (const page of inGroup) {
    const referenceKind = kindOf(wantOfPage.get(page))
    for (const axis of page.axes ?? []) for (const row of axis.notApplicable ?? [])
      if (SOURCE_DEPENDENT_CHECKS.includes(row.check) && checkApplicability(referenceKind, row.check) === row.status && row.reason === 'reference.kind=none') notApplicable[row.check]++
  }
  return {
    verdict,
    group,
    pages: [...paths],
    parityScope: { http: needParity, none: noParity },
    notApplicable,
    runExit: visual.summary ? exitCodeOf(visual.summary) : null,
    incomplete,
    open,
    minor,
    notOwed,
    accepted: { visualClusters: result.totals.acceptedClusters, parityRuns: needParity.reduce((n, p) => n + (byTarget.get(p)?.accepted?.length ?? 0), 0) }
  }
}

/**
 * One parity picture from the reports of a group's runs (one http-parity run per reference kind): routes joined, the
 * OLDEST generation, one target and one parity-accepted.json — a disagreement stays visible and fails the checks.
 */
export function mergeParity(list) {
  if (!list.length) return null
  const same = (f) => (list.every((x) => f(x) === f(list[0])) ? f(list[0]) : '(differs between the parity reports)')
  return {
    target: same((x) => x.target),
    generatedAt: list.map((x) => x.generatedAt).sort()[0],
    inputs: { acceptHash: same((x) => x.inputs?.acceptHash ?? null) },
    // each row keeps the origin ITS report read the source from: html (exported files) and url (live) runs differ
    routes: list.flatMap((x) => (x.routes ?? []).map((r) => ({ sourceOrigin: originOrNull(x.source), ...r })))
  }
}

const originOrNull = (u) => {
  try {
    return new URL(String(u)).origin
  } catch {
    return null
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const { argv, json } = takeOutputFlags(process.argv.slice(2), { out: false })
  const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined)
  const optAll = (n) => argv.flatMap((a, i) => (a === n ? [argv[i + 1]] : []))
  try {
    const list = (opt('--pages') ?? '').split(',').filter(Boolean)
    const need = ['--spec', '--visual', '--artifact', '--seed-report', '--config', '--group', '--contract', '--site']
    if (!list.length || list.some((p) => !p.startsWith('/')) || need.some((n) => !opt(n))) throw new Error(`usage: group-verdict.mjs --pages /a,/b ${need.map((n) => `${n} <x>`).join(' ')} [--parity <x> --accept <parity-accepted.json>] [--severity severity.json] [--out verdict.json] [--json]`)
    for (const n of ['--spec', '--artifact', '--seed-report', '--config']) if (!existsSync(opt(n))) throw new Error(`${n} ${opt(n)}: no such file`)
    if (opt('--accept') && !existsSync(opt('--accept'))) throw new Error(`--accept ${opt('--accept')}: no such file`)
    const v = opt('--visual')
    const visualFile = existsSync(v) && statSync(v).isDirectory() ? path.join(v, 'visual.json') : v
    const visual = readJson(visualFile, '--visual')
    const contractFile = opt('--contract')
    const spec = opt('--spec')
    const pageMapFile = path.join(spec, 'page-map.json')
    const refFile = path.join(spec, 'reference.json')
    const stamps = [opt('--artifact'), opt('--seed-report'), pageMapFile, path.join(spec, 'sections.json'), path.join(spec, 'content.json'), refFile].filter(existsSync).map((f) => statSync(f).mtimeMs)
    const pageMap = readJson(pageMapFile, '--spec page-map.json')
    const reference = existsSync(refFile) ? readJson(refFile, '--spec reference.json') : { pages: [] }
    const groupContract = contractFile && existsSync(contractFile) ? readJson(contractFile, '--contract') : null
    if (!opt('--port-audit')) throw new Error('--port-audit <the group\'s dossier> is required: the finish audit is part of the verdict')
    const auditDossier = path.resolve(opt('--port-audit'))
    // the group's own dossier is where its contract lives (and its DECISIONS.md): another directory is another dossier's audit
    const out = groupVerdict({
      group: opt('--group'),
      audit: { dossier: auditDossier, contractDir: path.dirname(path.resolve(contractFile)), interaction: path.join(path.dirname(visualFile), 'interaction.json') },
      pages: list,
      kinds: effectiveKinds(pageMap, reference),
      visual,
      parity: mergeParity(optAll('--parity').map((f) => readJson(f, '--parity'))),
      contract: groupContract,
      plan: groupContract && groupIdOf(groupContract) ? groupPages(groupContract, pageMap, reference) : null,
      severity: opt('--severity') ? readJson(opt('--severity'), '--severity') : {},
      decisions: decisionsFor(opt('--decisions') ?? path.join(path.dirname(opt('--severity') ?? contractFile ?? '.'), 'DECISIONS.md')),
      current: {
        bindings: bindingsFrom({ specDir: spec, artifactPath: opt('--artifact'), seedReportPath: opt('--seed-report'), configPath: opt('--config') }),
        site: opt('--site') ?? null,
        sourceDarkDerived: Boolean(groupContract) && darkDerivedProblems(groupContract, { specDir: spec }).length === 0,
        contractPath: contractFile ?? null,
        acceptHash: opt('--accept') ? fileHash(opt('--accept')) : null,
        newest: Math.max(...stamps)
      }
    })
    const first = (out.incomplete[0] ?? out.open[0]?.note ?? out.open[0]?.id) || null
    emitResult({
      result: out,
      json,
      out: opt('--out') ?? null,
      script: 'group-verdict',
      label: out.group ?? 'group',
      key: [visualFile, contractFile, list.join(',')].join('\0'),
      protect: [visualFile, path.join(path.dirname(visualFile), 'interaction.json'), spec, contractFile, opt('--artifact'), opt('--seed-report'), opt('--config'), opt('--accept'), opt('--severity'), opt('--decisions'), path.join(path.dirname(opt('--severity') ?? contractFile ?? '.'), 'DECISIONS.md'), path.join(auditDossier, AUDIT_FILE), ...DOSSIER_INPUTS.map((i) => path.join(auditDossier, i.name)), ...optAll('--parity')],
      summary: `verdict=${out.verdict} pages=${out.pages.length} incomplete=${out.incomplete.length} open=${out.open.length} minor=${out.minor.length}${first ? ` first=${oneLine(typeof first === 'string' ? first : first.id ?? first, 100)}` : ''}`
    })
    process.exit(out.verdict === 'done' ? 0 : out.verdict === 'open' ? 1 : 3)
  } catch (e) {
    console.error(`group-verdict: ${e.message}`)
    process.exit(2)
  }
}
