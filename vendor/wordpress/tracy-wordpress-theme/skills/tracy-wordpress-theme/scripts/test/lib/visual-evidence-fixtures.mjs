// Valid visual-gate evidence in the shape the producers write (report.mjs, notes.mjs, fast-gate.mjs), for the tests that
// then break exactly one field. A fixture the schema refuses proves nothing, so these are the controls: every mutation in a
// test starts from one of them.
import { cleanAudit } from './finish-audit.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { shotProjection } from '../../visual/evidence.mjs'
import { claimsOf, reportOf } from './intrinsic-fixtures.mjs'

export const STAGE = 's1'
export const clone = (v) => JSON.parse(JSON.stringify(v))

/** A complete fast-gate plan (fast-gate.mjs resolveFastGate) over `cases` [{ page, variants, stages? }]. */
export function planOf(cases = [{ page: 'p1', variants: ['v1'] }]) {
  const rows = cases.map((c) => ({ page: c.page, path: '/', locale: 'en', layout: c.layout ?? 'home', family: 'home', stages: c.stages ?? [STAGE], variants: c.variants, states: [], why: ['home'] }))
  const axes = rows.reduce((n, c) => n + c.variants.length, 0)
  const sum = (total) => ({ total: total.length, covered: total.length, uncovered: [] })
  return {
    schemaVersion: 1,
    scope: 'fast-gate',
    cases: rows,
    coverage: { components: sum([]), families: sum(['home']), states: sum([]), stages: sum([STAGE]), locales: { total: 1, covered: 1, risks: {} }, layouts: { total: 1, covered: 1 } },
    fullOnly: { layouts: [], pages: [], states: [], components: [] },
    axes: { fast: axes, full: axes },
    ratio: 1,
    nearFull: true,
    notes: [],
    errors: []
  }
}

/** One axis as visual-qa measureOnce writes it (a clean reading, header menus not measured for want of a source). */
export const axisOf = (variant, o = {}) => ({ variant, width: 1440, theme: 'light', layout: 'home', components: [], findings: [], accepted: [], scans: {}, shotConsumers: ['layout', 'color'], screenshot: `shots/${variant}.png`, tiles: [`shots/${variant}/0.png`], tilesCoverPicture: true, coverage: { examined: 30, classified: 0, unclassified: [] }, menus: { measured: false, reason: 'the page declares no source to open its menus on (none)' }, measured: 'now', stage: STAGE, ...o })

/**
 * visual.json of a run (report.mjs writeRun): pages hold one clean axis per case variant. `stageOf(variant)` names the stage a
 * variant runs in (default: the first stage of its case); every count is derived from the axes, as the producer derives them.
 * `intrinsic` / `summaryIntrinsic`: undefined = the valid claim, `false` = the block left out.
 */
export function visualOf({ kind = 'fast-gate', cases = [{ page: 'p1', variants: ['v1'] }], stages = [STAGE], stageOf = null, contractHash = 'sha256:c', findings = 0, intrinsic, summaryIntrinsic } = {}) {
  const claims = claimsOf(reportOf())
  const scope = kind === 'fast-gate' ? { kind, plan: planOf(cases) } : kind === 'full' ? { kind, plan: null } : { kind, plan: null, pages: cases.map((c) => c.page) }
  const claim = intrinsic === undefined ? claims.intrinsic : intrinsic
  const summary = summaryIntrinsic === undefined ? claims.summary : summaryIntrinsic
  const home = (c, variant) => stageOf?.(variant) ?? (c.stages ?? [STAGE])[0]
  const pages = cases.map((c) => {
    const axes = c.variants.map((variant, i) => axisOf(variant, { layout: c.layout ?? 'home', stage: home(c, variant), screenshot: `shots/${c.page}--${variant}.png`, tiles: [`shots/${c.page}--${variant}/0.png`], tilesCoverPicture: true, findings: c === cases[0] && i === 0 ? Array.from({ length: findings }, () => ({ kind: 'parity-mismatch' })) : [] }))
    return { id: c.page, hash: `sha256:${c.page}`, hashParts: { source: 's', target: 't' }, axes, findings: axes.flatMap((a) => a.findings.map((f) => ({ ...f, axis: a.variant }))) }
  })
  const rows = stages.map((id) => {
    const mine = pages.map((pg) => pg.axes.filter((a) => a.stage === id)).filter((x) => x.length)
    return { id, status: 'pass', variants: [...new Set(mine.flat().map((a) => a.variant))], pages: mine.length, axes: mine.flat().length, findings: mine.flat().reduce((n, a) => n + a.findings.length, 0), reused: 0 }
  })
  return {
    schemaVersion: 1,
    at: '2026-09-15T10:00:00Z',
    site: 'http://127.0.0.1:1',
    sourceSite: null,
    contract: 'contract.json',
    identity: { contractHash },
    scope,
    fastGate: null,
    method: 'fixture',
    inputs: null,
    browser: null,
    stages: rows,
    summary: { findings, pages: pages.length, axes: pages.reduce((n, pg) => n + pg.axes.length, 0), reused: 0, ...(summary === false ? {} : { intrinsic: summary }) },
    ...(claim === false ? {} : { intrinsic: claim }),
    pages
  }
}

/** One shot of index.json. */
export const shotOf = (o = {}) => ({ layout: 'home', page: 'p1', variant: 'v1', stage: STAGE, side: 'site', file: '/s/p1--v1.png', tiles: ['/s/p1--v1/0.png'], tilesCoverPicture: true, consumers: ['layout', 'color'], hash: 'sha256:p1', measured: true, ...o })
/** index.json exactly as report.mjs writes it for `visual` written into run folder `dir`. */
export function indexFor(visual, dir) {
  try {
    return indexFrom(visual, dir)
  } catch {
    // a visual.json broken on purpose has no pictures to project: the file under test is its own refusal
    return indexOf()
  }
}
const indexFrom = (visual, dir) => ({ at: visual.at, site: visual.site, sourceSite: null, ...shotProjection({ pages: visual.pages, out: path.resolve(dir) }), scope: visual.scope.kind })
export const indexOf = (shots = [shotOf()], missing = []) => ({ at: '2026-09-15T10:00:00Z', site: 'http://127.0.0.1:1', sourceSite: null, shots, missing, menuShots: [], menuMissing: [], scope: 'fast-gate' })

/** One row of notes/machine.json (report.mjs machineNotes). */
export const machineRow = (o = {}) => ({ id: 'M1', lens: 'machine:contrast', page: 'p1', layout: 'home', axis: 'v1', stage: STAGE, what: '{}', fix: 'see the finding', verify: 'rerun this stage', status: 'open', ...o })

/** One todo of NOTES-<stage>.json (notes.mjs mergeNotes). */
export const todoOf = (o = {}) => ({ id: 'N-0a1b2c', lenses: ['layout'], page: 'p1', layout: '', axis: 'v1', what: 'w', where: '', fix: '', verify: '', flag: '', status: 'open', ...o })

/** NOTES-<stage>.json; counts are derived from the todos unless `counts` overrides them. */
export function notesOf(stage = STAGE, { todos = [], lenses = ['layout', 'color'], missing = [], counts = {} } = {}) {
  const base = Object.fromEntries(['open', 'done', 'skipped', 'lee', 'closed', 'reopened'].map((s) => [s, todos.filter((t) => t.status === s).length]))
  base.leeFlagged = todos.filter((t) => t.flag === 'LEE' && t.status !== 'closed').length
  base.sourceFlagged = todos.filter((t) => t.flag === 'SOURCE' && t.status !== 'closed').length
  return { stage, counts: { ...base, ...counts }, lenses, coverage: { missing, extra: [] }, todos }
}

/** A complete run folder in `dir` that the fast-gate verdict passes; `over` replaces any file's content (a string is written as is, `false` leaves it out). */
export function writeRunDir(dir, over = {}) {
  const good = reportOf()
  const visual = over['visual.json'] && typeof over['visual.json'] === 'object' ? over['visual.json'] : visualOf()
  const files = {
    'visual.json': visual,
    'index.json': indexFor(visual, dir),
    'intrinsic.json': good,
    'notes/machine.json': [],
    [`NOTES-${STAGE}.json`]: notesOf(),
    ...over
  }
  mkdirSync(path.join(dir, 'notes'), { recursive: true })
  for (const [rel, v] of Object.entries(files)) if (v !== false) writeFileSync(path.join(dir, rel), typeof v === 'string' ? v : JSON.stringify(v))
  // the run's finish audit: a clean current receipt of a dossier beside it, over the run's own interaction record (lib/finish-audit.mjs)
  const dossier = `${dir}-dossier`
  cleanAudit({ dossier, runs: [dir], routes: ['/'], pages: ['/'] })
  RUN_AUDITS.set(dir, { dossier, site: 'http://site.test', routes: ['/'] })
  return dir
}
const RUN_AUDITS = new Map()
/** The `audit` option assessFastGate needs for a run written by writeRunDir (undefined for a directory that is no run). */
export const auditOf = (dir) => RUN_AUDITS.get(dir)
