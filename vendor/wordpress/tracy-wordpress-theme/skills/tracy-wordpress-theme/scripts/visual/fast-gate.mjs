#!/usr/bin/env node
// The Fast Gate (tracy-emdash-template 1.0.4, adapted to a block theme): the visual QA loop
// (shoot → lenses → notes → fix → close) on a SMALL set of cases resolved from the contract of the
// site at hand, so a defect in a shared part, pattern, section or the dark theme is caught once,
// early, before it is multiplied over every page. It never replaces the full gate: a fast-gate run
// never passes the visual gate, and a full run refuses a fast gate that is stale or not clean.
//
//   node scripts/visual/fast-gate.mjs plan    (--contract <file> | --run-root <dir>) --theme <built theme dir>
//        --spec <spec-pack dir> [--json <out>] [--changed a,b,…]
//   node scripts/visual/fast-gate.mjs verdict <run-dir> (--contract <file> | --run-root <dir>) --site <origin>
//        [--theme <dir>] [--spec <dir>] [--json]
//
// How the cases are chosen — deterministic, nothing hard-coded, everything read from the contract:
//   mandatory  the default locale's root page, every page whose status is not 200 (unknown-route
//              handling is an output requirement whether or not the source drew a 404), one page per
//              interaction state, one page per layout FAMILY (`layouts[].family`, else the view's
//              kind: home / listing / article / page), one page per SHARED component — a template
//              part, a pattern or a section type used by ≥ 2 layouts but not by all of them (chrome
//              every page carries is covered by any page); a locale other than the default with a
//              risk of its own (non-Latin script, RTL, longer titles, another font allow-list) on the
//              narrowest variant of each stage for the pages already chosen.
//   how many   greedy set cover over those requirements; candidates are the layouts' representatives;
//              ties break by id, so the same contract always yields the same plan.
//   stages     every stage — the output's viewports and themes are required even when the source
//              offers no frame for them.
//   overrides  `visual.fastGate.add[]` / `.drop[]`, each with a reason; a drop that removes the only
//              coverage of a requirement is an error, not a quieter gate.
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { KIND_OF_VIEW } from './contract.mjs'
import { SOURCE_DEPENDENT_CHECKS, checkApplicability } from './applicability.mjs'
import { CANONICAL, resolveContract, identityOf } from '../lib/canonical.mjs'
import { UsageError, parseStrict } from '../lib/cli-args.mjs'
import { pageHash } from './page-hash.mjs'
import { contentPages } from './intrinsic-mobile.mjs'
import { INTRINSIC_FILE, INTRINSIC_WIDTHS, validateIntrinsicReport } from './intrinsic-report.mjs'
import { machineNotes, intrinsicNotes } from './report.mjs'
import { INDEX, MACHINE, canon, indexBinding, indexInventory, NOTES, RECEIPT, VISUAL, problems, readEvidence } from './evidence.mjs'
import { auditReceiptProblems } from '../lib/audit-receipt.mjs'
import { loadPatternsMap, patternSlugsOf, readJsonFile, readRegularFile } from './pattern-registry.mjs'
import { effectiveKinds } from '../lib/route-index.mjs'

const list = (v) => (Array.isArray(v) ? v : [])
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const familyOf = (layout) => layout?.family ?? KIND_OF_VIEW[layout?.view ?? layout?.id] ?? 'page'

// ── what a layout draws: template → template parts (transitively) → patterns ──────────────────────
const PART_RE = /<!--\s*wp:template-part\s+(\{[^}]*\})/g
const PATTERN_RE = /<!--\s*wp:pattern\s+(\{[^}]*\})/g
const slugIn = (json) => {
  try {
    return JSON.parse(json).slug ?? null
  } catch {
    return null
  }
}
/**
 * Relative theme files the layout's template pulls in: parts/<slug>.html (recursively) and
 * patterns/<slug>.php. A layout with no template, or one the theme does not have, is an Error:
 * read as drawing nothing, it hid six JA Vega layouts' header and footer from the fast gate and
 * `--changed` (M4b, 26/09).
 */
export function layoutComponents(themeDir, layout) {
  if (!layout?.template) throw new Error(`layout ${layout?.id ?? '?'} has no template — the contract does not know what WordPress serves its pages (contract.mjs init --site --built-theme)`)
  if (!existsSync(path.join(themeDir, layout.template))) throw new Error(`layout ${layout.id ?? '?'}: ${layout.template} is not in the theme ${themeDir}`)
  const seen = new Set()
  const visit = (rel) => {
    const abs = path.join(themeDir, rel)
    if (!existsSync(abs) || seen.has(rel)) return
    if (rel !== layout.template) seen.add(rel)
    const src = readRegularFile(abs, rel).toString('utf8')
    for (const m of src.matchAll(PART_RE)) {
      const slug = slugIn(m[1])
      if (slug) visit(`parts/${slug}.html`)
    }
    for (const m of src.matchAll(PATTERN_RE)) {
      const slug = slugIn(m[1])
      if (slug) {
        const file = `patterns/${slug.split('/').pop()}.php`
        if (existsSync(path.join(themeDir, file))) seen.add(file)
      }
    }
  }
  visit(layout.template)
  return [...seen].sort(byId)
}

// ── locale risk: read from the contract's own titles and fonts, no per-project table ─────────────
const SCRIPTS = [
  ['cyrillic', /[Ѐ-ӿ]/],
  ['greek', /[Ͱ-Ͽ]/],
  ['arabic', /[؀-ۿ]/, 'rtl'],
  ['hebrew', /[֐-׿]/, 'rtl'],
  ['devanagari', /[ऀ-ॿ]/],
  ['thai', /[฀-๿]/],
  ['cjk', /[぀-ヿ㐀-䶿一-鿿가-힯]/]
]
const routeKey = (p) => p.id.replace(/^[a-z]{2}-/, '')
export function localeRisks(contract) {
  const dflt = contract.defaultLocale
  const pages = list(contract.pages)
  const textsOf = (locale) => new Map(pages.filter((p) => p.locale === locale && p.identity?.h1).map((p) => [routeKey(p), p.identity.h1]))
  const base = textsOf(dflt)
  const risks = {}
  for (const locale of list(contract.locales)) {
    if (locale === dflt) continue
    const why = []
    const texts = textsOf(locale)
    const all = [...texts.values()].join(' ')
    for (const [name, re, dir] of SCRIPTS) if (re.test(all)) why.push(dir === 'rtl' ? `script:${name}:rtl` : `script:${name}`)
    let longer = 0,
      compared = 0
    for (const [k, t] of texts) {
      const b = base.get(k)
      if (!b) continue
      compared++
      if (t.length >= b.length * 1.25) longer++
    }
    if (compared && longer / compared >= 0.5) why.push(`long-text:${longer}/${compared}`)
    const fonts = contract.design?.fonts?.allowed
    if (fonts && JSON.stringify(fonts[locale] ?? null) !== JSON.stringify(fonts[dflt] ?? null)) why.push('fonts:differ')
    if (why.length) risks[locale] = why
  }
  return risks
}

// ── shot rules derived from the contract, never copied from one project ──────────────────────────
// A stage's lenses follow its theme and width (light+widest: all five; light narrower: layout,
// typography, images; dark+widest: colour, layout; dark narrower: layout, colour). The default locale
// is shot on every stage and its source on the light stages. The kit's standing rule keeps every
// locale's light-responsive picture (a translation's wrapping is a layout question). A locale with a
// risk of its own also gets the narrowest dark variant for the typography lens (plus layout for RTL)
// and its OWN source at the same width — never the default locale's source standing in for it.
const STAGE_LENSES = {
  'light:widest': ['layout', 'typography', 'color', 'images', 'interaction'],
  'light:narrow': ['layout', 'typography', 'images'],
  'dark:widest': ['color', 'layout'],
  'dark:narrow': ['layout', 'color']
}
export function deriveShots(contract) {
  const stages = list(contract.visual?.stages),
    variants = list(contract.variants),
    pages = list(contract.pages),
    locales = list(contract.locales)
  const dflt = contract.defaultLocale ?? locales[0]
  const widest = Math.max(...variants.map((v) => v.width))
  const vOf = (id) => variants.find((v) => v.id === id)
  const kindOf = (st) => {
    const vs = list(st.variants).map(vOf).filter(Boolean)
    const themes = new Set(vs.map((v) => v.theme))
    if (themes.size !== 1) return null
    return `${[...themes][0]}:${vs.some((v) => v.width === widest) ? 'widest' : 'narrow'}`
  }
  const narrowestOf = (st) =>
    list(st.variants)
      .map(vOf)
      .filter(Boolean)
      .sort((a, b) => a.width - b.width || byId(a.id, b.id))[0]?.id
  const sourcesOf = (locale) => new Set(pages.filter((p) => p.locale === locale && (p.referenceKind === undefined || checkApplicability(p.referenceKind, 'content-parity') === 'applicable')).flatMap((p) => list(p.source)))
  const defaultSources = sourcesOf(dflt)
  const hasOwnSource = (locale) => (locale === dflt ? defaultSources.size > 0 : [...sourcesOf(locale)].some((f) => !defaultSources.has(f)))
  const rules = []
  for (const st of stages) {
    const kind = kindOf(st) ?? 'light:widest'
    // the standing rule: light-responsive for every locale
    const all = kind === 'light:narrow'
    rules.push({ side: 'site', stages: [st.id], locales: all ? [...locales] : [dflt], consumers: STAGE_LENSES[kind] })
  }
  const light = stages.filter((st) => (kindOf(st) ?? 'light:widest').startsWith('light'))
  if (hasOwnSource(dflt) && light.length) rules.push({ side: 'source', stages: light.map((st) => st.id), locales: [dflt], consumers: ['layout', 'typography', 'images'] })
  // A dark stage's lenses look at the source IN DARK when the source has a dark of its own — the
  // export's hook (`source.darkHook`) or the request cookie of a live source (`darkRequestHook`).
  // Without this rule a dark stage shot the site alone and its lenses compared it with the LIGHT
  // source picture (JA Vega M4c, #19 item 6). No dark of its own, no rule: nothing could honour it.
  const sourceDark = Boolean(contract.source?.darkHook || contract.source?.darkRequestHook)
  if (hasOwnSource(dflt) && sourceDark)
    for (const st of stages.filter((s) => (kindOf(s) ?? '').startsWith('dark')))
      rules.push({ side: 'source', stages: [st.id], locales: [dflt], consumers: STAGE_LENSES[kindOf(st)] })
  const risks = localeRisks(contract)
  for (const [locale, why] of Object.entries(risks).sort(([a], [b]) => byId(a, b))) {
    const consumers = why.some((w) => w.endsWith(':rtl')) ? ['typography', 'layout'] : ['typography']
    const widthOf = (id) => vOf(id)?.width ?? widest
    const narrow = stages.filter((st) => widthOf(narrowestOf(st)) < widest)
    const target = narrow.length ? narrow : stages
    const dark = target.filter((st) => (kindOf(st) ?? '').startsWith('dark'))
    if (dark.length) rules.push({ side: 'site', stages: dark.map((st) => st.id), locales: [locale], variants: dark.map(narrowestOf), consumers })
    const lightNarrow = target.filter((st) => (kindOf(st) ?? '').startsWith('light'))
    if (hasOwnSource(locale) && lightNarrow.length) rules.push({ side: 'source', stages: lightNarrow.map((st) => st.id), locales: [locale], variants: lightNarrow.map(narrowestOf), consumers })
  }
  return rules
}

// ── the plan ───────────────────────────────────────────────────────────────────────────────────────
export function resolveFastGate(contract, { themeDir = null } = {}) {
  const errors = [],
    notes = []
  const pages = list(contract.pages)
  const page = (id) => pages.find((p) => p.id === id)
  const layouts = list(contract.layouts)
  const stages = list(contract.visual?.stages)
  const variants = list(contract.variants)
  if (!layouts.length) errors.push('layouts[] required: the fast gate picks representatives per layout')
  if (!stages.length) errors.push('visual.stages required: every stage is a required output')
  if (!themeDir) notes.push('no --theme: template parts and patterns are unknown, only section types count as shared components')
  // the contract's page.sections are section TYPES (contract.mjs resolves the page-map's module ids through sections.json)
  const layoutOf = (p) => layouts.find((l) => l.id === p.layout) ?? layouts.find((l) => list(l.pages).includes(p.id))
  const dflt = contract.defaultLocale ?? pages.find((p) => p.path === '/')?.locale ?? pages[0]?.locale

  // components per layout: theme files the template draws + section types of its pages
  const compsOf = new Map(
    layouts.map((l) => {
      let files = []
      if (themeDir)
        try {
          files = layoutComponents(themeDir, l)
        } catch (e) {
          errors.push(`template: ${e.message}`)
        }
      const sections = pages.filter((p) => layoutOf(p) === l).flatMap((p) => list(p.sections).filter(Boolean).map((t) => `section:${t}`))
      return [l.id, new Set([...files, ...sections])]
    })
  )
  const count = new Map()
  for (const set of compsOf.values()) for (const c of set) count.set(c, (count.get(c) ?? 0) + 1)
  const shared = [...count].filter(([, n]) => n >= 2 && n < layouts.length).map(([c]) => c).sort(byId)
  const families = [...new Set(layouts.map(familyOf))].sort(byId)
  const states = Object.keys(contract.interactions ?? {})
    .filter((s) => pages.some((p) => list(p.states).includes(s)))
    .sort(byId)

  const req = new Set()
  for (const c of shared) req.add(`component:${c}`)
  for (const f of families) req.add(`family:${f}`)
  for (const s of states) req.add(`state:${s}`)
  const home = pages.find((p) => p.locale === dflt && p.path === '/')
  if (home) req.add('home')
  else errors.push(`requirement-missing: no root page (path "/") for the default locale ${dflt}`)
  const system = pages.filter((p) => (p.status ?? 200) !== 200 && p.locale === dflt)
  if (system.length) for (const p of system) req.add(`status:${p.status}@${p.id}`)
  else errors.push('requirement-missing: unknown-route — no page with a non-200 status; a 404 page is an output requirement even when the source has none')
  const coversOf = (p) => {
    const l = layoutOf(p)
    const out = new Set()
    if (!l) return out
    const own = new Set(list(p.sections).filter(Boolean))
    for (const c of compsOf.get(l.id) ?? []) if (req.has(`component:${c}`) && (!c.startsWith('section:') || own.has(c.slice(8)))) out.add(`component:${c}`)
    out.add(`family:${familyOf(l)}`)
    for (const s of list(p.states)) if (s !== 'default' && req.has(`state:${s}`)) out.add(`state:${s}`)
    if (p === home) out.add('home')
    if (system.includes(p)) out.add(`status:${p.status}@${p.id}`)
    return out
  }
  // candidates: every page of the default locale (a family may have several views; a section may sit on one page only)
  const candidates = pages.filter((p) => p.locale === dflt).sort((a, b) => byId(a.id, b.id))
  const chosen = new Map()
  const covered = new Set()
  const take = (p, why) => {
    const c = chosen.get(p.id) ?? []
    for (const w of [...why, ...[...coversOf(p)].sort(byId)]) if (!c.includes(w)) c.push(w)
    chosen.set(p.id, c)
    for (const k of coversOf(p)) covered.add(k)
  }
  if (home) take(home, ['home'])
  for (const p of system) take(p, [])
  const fg = contract.visual?.fastGate ?? {}
  const dropped = new Set()
  for (const [i, o] of list(fg.drop).entries()) {
    const l = layouts.find((x) => x.id === o?.layout)
    if (!l) errors.push(`visual.fastGate.drop[${i}]: unknown layout ${o?.layout}`)
    else if (!o.reason) errors.push(`visual.fastGate.drop[${i}]: reason required`)
    else dropped.add(l.id)
  }
  for (const [i, o] of list(fg.add).entries()) {
    const p = o?.page ? page(o.page) : o?.layout ? page(layouts.find((x) => x.id === o.layout)?.representative) : null
    if (!p) errors.push(`visual.fastGate.add[${i}]: unknown page/layout ${o?.page ?? o?.layout}`)
    else if (!o.reason) errors.push(`visual.fastGate.add[${i}]: reason required`)
    else take(p, [`override:${o.reason}`])
  }
  for (;;) {
    let best = null,
      gain = []
    for (const p of candidates) {
      if (chosen.has(p.id) || dropped.has(layoutOf(p)?.id)) continue
      const g = [...coversOf(p)].filter((k) => !covered.has(k)).sort(byId)
      if (g.length > gain.length) (best = p), (gain = g)
    }
    if (!best) break
    take(best, gain)
  }
  for (const k of [...req].filter((k) => !covered.has(k)).sort(byId))
    errors.push(dropped.size ? `override-breaks-coverage: ${k} is covered by no remaining page (a drop removed it)` : `coverage: ${k} is covered by no page of the default locale`)
  // locales with a risk of their own: the chosen pages' counterparts on the narrowest variant of every stage
  const risks = localeRisks(contract)
  // the narrowest variant of every stage that has a narrow width at all (a stage of one desktop
  // variant is not "narrow"); a contract with no narrow stage falls back to every stage
  const widest = Math.max(...variants.map((v) => v.width))
  const narrowestOf = (st) =>
    list(st.variants)
      .map((id) => variants.find((v) => v.id === id))
      .filter(Boolean)
      .sort((a, b) => a.width - b.width || byId(a.id, b.id))[0]
  const narrowStages = stages.filter((st) => (narrowestOf(st)?.width ?? widest) < widest)
  const narrowest = (narrowStages.length ? narrowStages : stages).map((st) => narrowestOf(st)?.id).filter(Boolean)
  const localeCases = []
  for (const [locale, why] of Object.entries(risks).sort(([a], [b]) => byId(a, b))) {
    for (const [pid] of [...chosen].sort(([a], [b]) => byId(a, b))) {
      const p = page(pid)
      const twin = pages.find((x) => x.locale === locale && routeKey(x) === routeKey(p)) ?? pages.find((x) => x.locale === locale && layoutOf(x) === layoutOf(p))
      if (!twin || chosen.has(twin.id) || localeCases.some((x) => x.page === twin)) continue
      localeCases.push({ page: twin, variants: narrowest.filter((v) => list(twin.variants).includes(v)), why: why.map((w) => `locale:${locale}:${w}`) })
    }
    if (!list(contract.visual?.shots).some((sh) => sh.side === 'site' && list(sh.locales).includes(locale))) notes.push(`locale ${locale}: measured only — visual.shots names no site picture for it`)
  }
  const stageIds = stages.map((s) => s.id)
  const variantIds = variants.map((v) => v.id)
  const mk = (p, why, vs) => {
    const l = layoutOf(p)
    return { page: p.id, path: p.path, locale: p.locale, layout: l?.id ?? null, family: l ? familyOf(l) : null, stages: stageIds.filter((id) => stages.find((s) => s.id === id).variants.some((v) => vs.includes(v))), variants: vs, states: list(p.states), why }
  }
  const cases = [...[...chosen].sort(([a], [b]) => byId(a, b)).map(([pid, why]) => mk(page(pid), why, list(page(pid).variants).filter((v) => variantIds.includes(v)))), ...localeCases.map((x) => mk(x.page, x.why, x.variants))]
  const chosenLayouts = new Set(cases.map((c) => c.layout))
  const fullOnly = {
    layouts: layouts.map((l) => l.id).filter((id) => !chosenLayouts.has(id)).sort(byId),
    pages: pages.map((p) => p.id).filter((id) => !cases.some((c) => c.page === id)).sort(byId),
    states: states.filter((s) => !cases.some((c) => c.states.includes(s))),
    components: [...count.keys()].filter((c) => !cases.some((k) => (compsOf.get(k.layout) ?? new Set()).has(c))).sort(byId)
  }
  const summary = (total, coveredList) => ({ total: total.length, covered: coveredList.length, uncovered: total.filter((x) => !coveredList.includes(x)) })
  const fullAxes = pages.reduce((n, p) => n + list(p.variants).length, 0)
  const fastAxes = cases.reduce((n, c) => n + c.variants.length, 0)
  const ratio = fullAxes ? +(fastAxes / fullAxes).toFixed(3) : 0
  const nearFull = ratio >= 0.6
  if (nearFull) notes.push(`the fast gate measures ${fastAxes} of ${fullAxes} axes (${Math.round(ratio * 100)} %): this site is small or its layouts share little — the fast gate is close to the full gate, and that is the honest answer`)
  return {
    schemaVersion: 1,
    scope: 'fast-gate',
    cases,
    coverage: {
      components: summary(shared, shared.filter((c) => covered.has(`component:${c}`))),
      families: summary(families, families.filter((f) => covered.has(`family:${f}`))),
      states: summary(states, states.filter((s) => covered.has(`state:${s}`))),
      stages: summary(stageIds, stageIds.filter((id) => cases.some((c) => c.stages.includes(id)))),
      locales: { total: list(contract.locales).length, covered: [...new Set(cases.map((c) => c.locale))].length, risks },
      layouts: { total: layouts.length, covered: chosenLayouts.size }
    },
    fullOnly,
    axes: { fast: fastAxes, full: fullAxes },
    ratio,
    nearFull,
    notes,
    errors
  }
}

/**
 * Cases whose theme inputs include any of `files` (paths relative to the theme dir, or absolute):
 * the template each case's layout is SERVED by (contract.mjs) and what it draws. A case whose
 * template is missing throws (layoutComponents) rather than drop out of the answer.
 */
export function affectedCases(plan, contract, files, { themeDir } = {}) {
  const rel = files.map((f) => (path.isAbsolute(f) && themeDir ? path.relative(themeDir, f) : f))
  const global = (f) => f === 'theme.json' || f === 'functions.php' || f.startsWith('assets/') || f.startsWith('inc/')
  return plan.cases.filter((c) => {
    const layout = list(contract.layouts).find((l) => l.id === c.layout)
    const comps = themeDir && layout ? layoutComponents(themeDir, layout) : []
    return rel.some((f) => global(f) || f === layout?.template || comps.includes(f))
  })
}

/**
 * The intrinsic probe's evidence is the literal `intrinsic.json` of the run folder (a regular file, read once within a
 * bound) and it passes the one validator (intrinsic-report.mjs): closed schema, every total recomputed from the readings
 * and compared with visual.json's `intrinsic` and `summary.intrinsic`, unique and exactly-complete route × width against
 * the page-map's inventory and the required widths. A status of `run` alone is a claim, not evidence.
 * Returns the refusals and, only when there are none, the recomputed totals.
 */
const MAX_INTRINSIC_BYTES = 32 * 1024 * 1024
function intrinsicEvidence(runDir, visual, expectedRoutes) {
  const intr = visual.intrinsic
  const at = (m) => ({ reasons: [`intrinsic mobile probe: ${m}`], totals: null })
  if (intr.file !== INTRINSIC_FILE) return at(`visual.json names ${JSON.stringify(intr.file ?? null)} as its report; only ${INTRINSIC_FILE} is read`)
  let rep
  try {
    rep = JSON.parse(readRegularFile(path.join(runDir, INTRINSIC_FILE), INTRINSIC_FILE, MAX_INTRINSIC_BYTES).toString('utf8'))
  } catch (e) {
    return at(`${INTRINSIC_FILE} not readable — ${String(e.message).split('\n')[0]}`)
  }
  const out = validateIntrinsicReport(rep, { claims: { intrinsic: intr, summary: visual.summary?.intrinsic }, owedRoutes: expectedRoutes, owedWidths: INTRINSIC_WIDTHS })
  return out.length ? at(out.join('; ')) : { reasons: [], totals: rep.summary, report: rep }
}

/** The refusals of a machine.json that is not what the run's findings produce. Intrinsic rows are checked only against a probe report that was read. */
function machineInventory(machine, visual, intr, report) {
  const row = ({ id, ...r }) => canon(r)
  const isProbe = (r) => r.lens.startsWith('machine:intrinsic')
  const want = machineNotes(visual.pages, () => null).map(row)
  if (report) want.push(...intrinsicNotes({ ...intr, rows: report.findings.filter((x) => x.class === 'site-only'), errorRows: report.errors }).map(row))
  const have = machine.filter((r) => report || !isProbe(r)).map(row)
  const wantOf = report ? want : want.filter((k) => !k.includes('"lens":"machine:intrinsic'))
  const left = new Map()
  for (const k of have) left.set(k, (left.get(k) ?? 0) + 1)
  const out = []
  for (const k of wantOf) {
    if (left.get(k)) left.set(k, left.get(k) - 1)
    else out.push(`notes/machine.json: a machine row for ${JSON.parse(k).lens} on ${JSON.parse(k).page}/${JSON.parse(k).axis} is missing — the run's findings produce it`)
  }
  for (const [k, n] of left) for (let i = 0; i < n; i++) out.push(`notes/machine.json: a machine row for ${JSON.parse(k).lens} on ${JSON.parse(k).page}/${JSON.parse(k).axis} is not produced by the run's findings`)
  return out.slice(0, 8)
}

// ── the verdict ────────────────────────────────────────────────────────────────────────────────────
/**
 * @param {string} runDir              a `visual-qa.mjs --scope fast-gate` run
 * @param {object} o
 * @param {string|null} o.contractHash  the current contract's hash (identityOf) — differs → stale
 * @param {string[]} [o.currentStale]  the reasons the contract is stale against its inputs now (identityOf(...).stale) — any → no pass
 * @param {(id: string) => string|null} [o.pageHashOf]  current hash of a page against the tree — differs → stale
 * @param {{dossier: string, site: string, source?: string|null, routes?: string[]}} [o.audit]  the consumer's own dossier and the site it
 *   measured: the finish audit (`port-audit.json`, lib/audit-receipt.mjs) must be a clean, current receipt of it, over this run's
 *   interaction record. Not given → no pass: a gate that does not look at the audit cannot be stopped by it.
 */
export function assessFastGate(runDir, { contractHash = null, pageHashOf = null, expectedRoutes = null, currentStale = [], now = Date.now(), visual: snapshot = null, audit = null, referenceKinds = null } = {}) {
  const reasons = []
  // every evidence file is read once, bounded, and validated against its closed schema (evidence.mjs) before any field is used
  const read = (rel, schema, max) => readEvidence(path.join(runDir, rel), schema, { what: rel, ...(max ? { max } : {}) })
  // a refusal names the file relative to the run, never its absolute path
  const why = (rel, e) => String(e.message).split('\n')[0].replaceAll(path.join(runDir, rel), rel)
  const failed = (list) => ({ status: 'fail', scope: 'fast-gate', reasons: list, stale: [], cases: [], stages: [] })
  // `snapshot` is a visual.json the caller already read and validated (the CLI hashes pages from it): the verdict is decided on that one
  // snapshot, never on a second read a concurrent rewrite could have changed
  let visual = snapshot
  if (!visual)
    try {
      visual = read('visual.json', VISUAL)
    } catch (e) {
      return failed([`no usable visual.json in ${runDir}: ${why('visual.json', e)}`])
    }
  if (visual.scope.kind !== 'fast-gate') reasons.push(`scope is ${visual.scope.kind}, not fast-gate`)
  const plan = visual.scope.plan
  const notApplicable = Object.fromEntries(SOURCE_DEPENDENT_CHECKS.map((check) => [check, 0]))
  for (const page of visual.pages ?? []) {
    const hasBoundKind = referenceKinds != null && Object.hasOwn(referenceKinds, page.id) && referenceKinds[page.id] != null
    const kind = hasBoundKind ? referenceKinds[page.id] : null
    const sourceIndependent = checkApplicability(kind, 'menu-comparison') === 'not-applicable'
    if (hasBoundKind && page.referenceKind !== undefined && page.referenceKind !== kind) reasons.push(`${page.id}: visual referenceKind ${page.referenceKind} differs from the contract (${kind})`)
    for (const axis of page.axes ?? []) {
      const rows = axis.notApplicable ?? []
      if (rows.length && !hasBoundKind) reasons.push(`${page.id}/${axis.variant}: not-applicable evidence requires --spec to bind reference.kind=none`)
      else if (rows.length && !sourceIndependent) reasons.push(`${page.id}/${axis.variant}: not-applicable evidence is only valid for reference.kind=none`)
      for (const row of rows) if (SOURCE_DEPENDENT_CHECKS.includes(row.check) && checkApplicability(kind, row.check) === row.status && row.reason === 'reference.kind=none') notApplicable[row.check]++
      if (!hasBoundKind && axis.menus?.targetOnly === true) reasons.push(`${page.id}/${axis.variant}: target-only menu evidence requires --spec to bind reference.kind=none`)
      if (sourceIndependent) {
        const have = new Set(rows.map((x) => x.check))
        for (const check of SOURCE_DEPENDENT_CHECKS) if (!have.has(check) || checkApplicability(kind, check) !== 'not-applicable') reasons.push(`${page.id}/${axis.variant}: missing not-applicable check ${check}`)
        if (axis.menus?.measured !== true || axis.menus?.targetOnly !== true) reasons.push(`${page.id}/${axis.variant}: target menu capture was not measured`)
        if (axis.menus?.comparison?.check !== 'menu-comparison' || axis.menus?.comparison?.status !== 'not-applicable' || axis.menus?.comparison?.reason !== 'reference.kind=none') reasons.push(`${page.id}/${axis.variant}: menu comparison is not recorded as not-applicable`)
      }
    }
  }
  const runHash = visual.identity.contractHash
  if (contractHash && runHash !== contractHash) reasons.push('stale: the contract changed since the run')
  // a run that recorded itself stale (--allow-stale), or a contract stale against its inputs now, cannot pass a gate whatever its hashes say
  for (const [where, list] of [['the run recorded identity.stale', visual.identity.stale], ['the run recorded summary.stale', visual.summary.stale], ['the contract is stale against its inputs now', currentStale]])
    if (list?.length) reasons.push(`stale: ${where} — ${list.slice(0, 3).join('; ')}`)
  const stages = visual.stages.map((s) => s.id)
  for (const st of visual.stages) {
    if (st.status !== 'pass') reasons.push(`stage ${st.id}: ${st.status}${st.reason ? ` — ${st.reason}` : ''}`)
    else if (!st.axes) reasons.push(`stage ${st.id}: passed with no axis measured`)
  }
  for (const c of plan?.cases ?? []) {
    const p = visual.pages.find((x) => x.id === c.page)
    if (!p) {
      reasons.push(`case ${c.page}: not measured`)
      continue
    }
    for (const v of c.variants) if (!p.axes.some((a) => a.variant === v)) reasons.push(`case ${c.page}/${v}: not measured`)
  }
  // intrinsic mobile defects (#65): the probe is part of the run; a site-only defect blocks, a shared one is listed
  const intr = visual.intrinsic
  let intrinsicTotals = null
  let intrinsicReport = null
  if (!intr || intr.status !== 'run') reasons.push(`the intrinsic mobile probe did not run${intr?.reason ? ` — ${intr.reason}` : ''}`)
  else {
    const ev = intrinsicEvidence(runDir, visual, expectedRoutes)
    reasons.push(...ev.reasons)
    intrinsicTotals = ev.totals
    intrinsicReport = ev.report ?? null
    // decided from the recomputed totals, never the stored ones
    if (intrinsicTotals?.siteOnly) reasons.push(`intrinsic mobile probe: ${intrinsicTotals.siteOnly} site-only defect(s) (see ${INTRINSIC_FILE})`)
  }
  if (visual.summary.findings) reasons.push(`${visual.summary.findings} machine finding(s)`)
  // the finish audit: a clean current receipt of this dossier and site, over THIS run's interaction record
  if (!audit) reasons.push('the finish audit was not checked: name the dossier (--run-root, --dossier) whose port-audit.json this verdict stands on')
  else {
    const at = Date.parse(visual.at)
    const r = auditReceiptProblems({
      dossier: audit.dossier,
      site: audit.site,
      routes: audit.routes ?? [],
      interaction: [{ file: path.join(runDir, 'interaction.json'), routes: visual.pages.map((p) => p.path).filter(Boolean), source: audit.source ?? null, referenceKinds: Object.fromEntries(visual.pages.filter((p) => referenceKinds?.[p.id]).map((p) => [p.path, referenceKinds[p.id]])) }],
      notBefore: Number.isFinite(at) ? at : null,
      now
    })
    for (const p of r.problems) reasons.push(`finish audit [${p.code}]: ${p.message}`)
  }
  let index = { shots: [], missing: [], menuShots: [], menuMissing: [] }
  try {
    index = read('index.json', INDEX)
  } catch (e) {
    reasons.push(`no usable index.json: ${why('index.json', e)}`)
  }
  // a shot whose stage the run does not have carries no lens obligation of any stage: it would be a picture no lens must open
  const known = new Set(stages)
  for (const [list, field] of [[index.shots, 'shots'], [index.missing, 'missing'], [index.menuShots, 'menuShots'], [index.menuMissing, 'menuMissing']])
    for (const s of list) if (!known.has(s.stage)) reasons.push(`index.json: ${field} row ${s.page}/${s.variant} (${s.side}) names stage ${JSON.stringify(s.stage)}, which the run does not have`)
  reasons.push(...indexBinding(index, visual))
  // the file is held to the axes that produced it, both ways; lens obligations are read from what the axes produce, never from rows the file chose to keep
  const inventory = indexInventory(index, visual, runDir)
  reasons.push(...inventory.refusals)
  // A source picture the contract's shot rules ask for and the run could not write (report.mjs
  // shotIndex `missing`): the lenses of that stage had no same-mode source, whatever they said.
  for (const m of index.missing) reasons.push(`stage ${m.stage}: source picture of ${m.page}/${m.variant} missing — ${m.reason}`)
  let machine = []
  try {
    machine = read('notes/machine.json', MACHINE)
  } catch (e) {
    reasons.push(`no usable notes/machine.json: ${why('notes/machine.json', e)}`)
  }
  // a machine row of a stage the run does not have is an orphan: no stage's notes would ever list it
  for (const x of machine) if (x.stage && !known.has(x.stage)) reasons.push(`notes/machine.json: ${x.id} names stage ${JSON.stringify(x.stage)}, which the run does not have`)
  // the machine notes are the findings they were written from, row for row (report.mjs machineNotes + intrinsicNotes): a deleted row would leave a failed run looking settled
  reasons.push(...machineInventory(machine, visual, intr, intrinsicReport))
  for (const id of stages) {
    const consumers = new Set(inventory.projection.shots.filter((s) => s.stage === id).flatMap((s) => s.consumers))
    const rel = `NOTES-${id}.json`
    if (!existsSync(path.join(runDir, rel))) {
      reasons.push(`stage ${id}: notes not merged (notes.mjs merge --stage ${id})`)
      continue
    }
    let notes
    try {
      notes = read(rel, NOTES)
      if (notes.stage !== id) throw new Error(`${rel}: stage is ${JSON.stringify(notes.stage)}, not ${id}`)
    } catch (e) {
      reasons.push(`stage ${id}: ${rel} unusable — ${why(rel, e)}`)
      continue
    }
    const c = notes.counts
    for (const k of ['open', 'reopened', 'lee', 'leeFlagged']) if (c[k]) reasons.push(`stage ${id}: ${c[k]} todo(s) ${k}`)
    if (notes.coverage.missing.length) reasons.push(`stage ${id}: ${notes.coverage.missing.length} picture(s) not opened by a consumer`)
    for (const lens of [...consumers].sort(byId)) if (lens !== 'reviewer' && !notes.lenses.includes(lens)) reasons.push(`stage ${id}: lens ${lens} never reported`)
    // every row not closed is open work, whatever its id form (N- lens notes and M- machine rows alike)
    const fresh = notes.todos.filter((t) => t.status !== 'closed')
    if (fresh.length) reasons.push(`stage ${id}: ${fresh.length} note(s) not closed — a run with open notes is not the confirmation round`)
    const m = machine.filter((x) => !x.stage || x.stage === id)
    if (m.length) reasons.push(`stage ${id}: ${m.length} machine finding(s) still listed`)
  }
  const stale = []
  if (pageHashOf)
    for (const p of visual.pages) {
      const h = pageHashOf(p.id)
      if (h === null) stale.push(`${p.id}: no longer in the contract`)
      else if (h !== p.hash) stale.push(p.id)
    }
  if (stale.length) reasons.push(`stale: ${stale.length} page(s) changed since the run — ${stale.slice(0, 8).join(', ')}`)
  return {
    schemaVersion: 1,
    scope: 'fast-gate',
    status: reasons.length ? 'fail' : 'pass',
    run: path.resolve(runDir),
    at: new Date(now).toISOString(),
    contractHash: runHash,
    stages,
    notApplicable,
    cases: (plan?.cases ?? []).map((c) => ({ page: c.page, layout: c.layout, stages: c.stages, variants: c.variants })),
    pageHashes: Object.fromEntries(visual.pages.map((p) => [p.id, p.hash])),
    intrinsic: intr ? { status: intr.status, siteOnly: intrinsicTotals?.siteOnly ?? null, shared: intrinsicTotals?.shared ?? null, sourceFixed: intrinsicTotals?.sourceFixed ?? null } : null,
    stale,
    reasons
  }
}

export function planMarkdown(plan) {
  return [
    `# Fast Gate plan — ${plan.cases.length} case(s), ${plan.axes.fast} of ${plan.axes.full} axes (${Math.round(plan.ratio * 100)} %)`,
    '',
    'Scope: **fast-gate**. A pass here is not visual acceptance and not a release receipt — it means the shared parts are clean enough to multiply. Everything under "Only at the full gate" is measured there and nowhere else.',
    '',
    '| Page | Layout | Family | Stages | States | Stands for |',
    '|---|---|---|---|---|---|',
    ...plan.cases.map((c) => `| ${c.page} | ${c.layout ?? '—'} | ${c.family ?? '—'} | ${c.stages.join(', ')} | ${c.states.join(', ')} | ${c.why.join('; ')} |`),
    '',
    '## Coverage',
    '',
    `- shared parts / patterns / section types: ${plan.coverage.components.covered}/${plan.coverage.components.total}${plan.coverage.components.uncovered.length ? ` — uncovered: ${plan.coverage.components.uncovered.join(', ')}` : ''}`,
    `- layout families: ${plan.coverage.families.covered}/${plan.coverage.families.total}`,
    `- interaction states: ${plan.coverage.states.covered}/${plan.coverage.states.total}`,
    `- stages: ${plan.coverage.stages.covered}/${plan.coverage.stages.total}`,
    `- locales: ${plan.coverage.locales.covered}/${plan.coverage.locales.total}${Object.keys(plan.coverage.locales.risks).length ? ` — risks: ${Object.entries(plan.coverage.locales.risks).map(([l, w]) => `${l} (${w.join(', ')})`).join('; ')}` : ' — no locale-specific risk detected'}`,
    `- layouts with a picture: ${plan.coverage.layouts.covered}/${plan.coverage.layouts.total}`,
    '',
    '## Only at the full gate',
    '',
    `- layouts: ${plan.fullOnly.layouts.join(', ') || 'none'}`,
    `- pages: ${plan.fullOnly.pages.length}`,
    `- states: ${plan.fullOnly.states.join(', ') || 'none'}`,
    `- parts / patterns / sections never rendered by a fast-gate case: ${plan.fullOnly.components.join(', ') || 'none'}`,
    '',
    '## Notes',
    '',
    ...(plan.notes.length ? plan.notes.map((n) => `- ${n}`) : ['- none']),
    ...(plan.errors.length ? ['', '## Errors', '', ...plan.errors.map((e) => `- ${e}`)] : []),
    ''
  ].join('\n')
}
function verdictMarkdown(v) {
  return [
    `# Fast Gate verdict — ${v.status.toUpperCase()} — ${v.at ?? ''}`,
    '',
    `Run: ${v.run ?? ''}`,
    `Contract: ${v.contractHash ?? 'unknown'}`,
    `Stages: ${v.stages.join(' → ')}`,
    `Cases: ${v.cases.map((c) => c.page).join(', ') || 'none'}`,
    '',
    'Scope **fast-gate**: this verdict is neither visual acceptance nor a release receipt.',
    '',
    '## Reasons',
    '',
    ...(v.reasons.length ? v.reasons.map((r) => `- ${r}`) : ['- none: every stage passed, every case measured, every note closed, every picture opened, inputs unchanged']),
    ''
  ].join('\n')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const argv = process.argv.slice(2)
  const USAGE = 'usage: fast-gate.mjs plan (--contract f | --run-root d) --theme <dir> [--json out] [--changed a,b] | verdict <run-dir> (--contract f | --run-root d) --site <origin> [--theme d] [--spec d] [--patterns-map f] [--dossier d] [--json]'
  const command = argv[0]
  // the whole list is validated before anything is read or measured
  let args
  try {
    if (command !== 'plan' && command !== 'verdict') throw new UsageError(command ? `unknown command ${command}` : 'no command')
    const values = ['--contract', '--run-root', '--theme', '--spec']
    args =
      command === 'plan'
        ? parseStrict(argv.slice(1), { values: [...values, '--json', '--changed'] })
        : parseStrict(argv.slice(1), { values: [...values, '--site', '--patterns-map', '--dossier'], flags: ['--json'], positionals: 1 })
    if (command === 'verdict' && !args.positional[0]) throw new UsageError('verdict needs a run directory')
  } catch (e) {
    if (!(e instanceof UsageError)) throw e
    console.error(`fast-gate: ${e.message}\n${USAGE}`)
    process.exit(2)
  }
  const opt = args.opt
  const resolved = resolveContract({ runRoot: opt('--run-root'), explicit: opt('--contract'), name: CANONICAL.visual })
  const contract = readJsonFile(resolved.path, 'contract')
  const themeDir = opt('--theme')
  if (command === 'plan') {
    const plan = resolveFastGate(contract, { themeDir })
    if (opt('--changed')) {
      // A case whose template cannot be read is not "unaffected": stop.
      let cases
      try {
        cases = affectedCases(plan, contract, opt('--changed').split(',').filter(Boolean), { themeDir }).map((c) => c.page)
      } catch (e) {
        console.error(`fast-gate: --changed cannot be answered — ${e.message}`)
        process.exit(2)
      }
      console.log(JSON.stringify({ changed: opt('--changed').split(','), cases }))
    }
    else process.stdout.write(planMarkdown(plan))
    if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(plan, null, 2) + '\n')
    process.exit(plan.errors.length ? 2 : 0)
  } else if (command === 'verdict') {
    const identity = identityOf({ contractPath: resolved.path, contract, specDir: opt('--spec') })
    // page hashes against the tree: the served HTML is part of the hash (page-hash.mjs), so the
    // site must be up to recompute them — a verdict that skipped staleness would be a weaker gate
    const site = opt('--site')
    if (!site) {
      console.error('verdict needs --site <origin>: page hashes include the served HTML and are recomputed against it')
      process.exit(2)
    }
    const run = args.positional[0]
    let specKinds = new Map()
    if (opt('--spec')) {
      const pageMap = readJsonFile(path.join(opt('--spec'), 'page-map.json'), 'page-map.json')
      const referenceFile = path.join(opt('--spec'), 'reference.json')
      const reference = existsSync(referenceFile) ? readJsonFile(referenceFile, 'reference.json') : { pages: [] }
      specKinds = effectiveKinds(pageMap, reference)
    }
    const referenceKinds = Object.fromEntries(contract.pages.map((p) => {
      const kind = [p.pagemapPath, p.path].map((route) => specKinds.get(route)).find((value) => value !== undefined)
      return [p.id, kind]
    }))
    let visual
    try {
      visual = readEvidence(path.join(run, 'visual.json'), VISUAL, { what: 'visual.json', referenceKinds })
    } catch (e) {
      console.error(`fast-gate: ${e.message}`)
      process.exit(2)
    }
    // the map the run hashed with is recorded in visual.json (`inputs.patternsMap`); it is read again from there, and a
    // --patterns-map that names another file or content is refused — the verdict hashes the run's pattern set, not its own
    const recorded = visual.inputs?.patternsMap || null
    const given = loadPatternsMap(opt('--patterns-map'), args.has('--patterns-map'))
    if (recorded && given && (given.file !== recorded.file || given.sha256 !== recorded.sha256)) throw new Error(`--patterns-map ${given.file} is not the map the run recorded (${recorded.file})`)
    const chosen = given ?? (recorded ? loadPatternsMap(recorded.file) : null)
    if (recorded && chosen.sha256 !== recorded.sha256) throw new Error(`patterns map ${recorded.file} changed since the run recorded it — measure again`)
    if (!recorded && chosen) throw new Error('the run recorded no patterns map; its page hashes did not cover patterns — measure again with --patterns-map')
    const patternsMap = chosen?.map ?? null
    const hashes = new Map()
    for (const p of visual.pages) {
      const page = contract.pages.find((x) => x.id === p.id)
      if (!page) {
        hashes.set(p.id, null)
        continue
      }
      const html = await fetch(new URL(page.path, site).href, { signal: AbortSignal.timeout(30000) })
        .then((r) => r.text())
        .catch(() => '')
      try {
        // the same pattern set as visual-qa's hash: the map recorded with the run selects it there
        if (!patternsMap && page.sections?.length) throw new Error('the page has sections and the run recorded no patterns map — its patterns are not in the hash; measure again with --patterns-map')
        const patternSlugs = patternsMap ? patternSlugsOf(page.sections, patternsMap) : { slugs: [], unmapped: [] }
        if (patternSlugs.unmapped.length) throw new Error(`section type(s) ${patternSlugs.unmapped.join(', ')} have no pattern in ${chosen.file}`)
        hashes.set(p.id, pageHash({ contract, page, themeDir, specDir: opt('--spec'), targetHtml: html, patternSlugs: patternSlugs.slugs }).hash)
      } catch (e) {
        console.error(`fast-gate: the hash of ${p.id} cannot be computed — ${e.message}`)
        process.exit(2)
      }
    }
    let expectedRoutes = null
    if (opt('--spec')) {
      try {
        expectedRoutes = contentPages(readJsonFile(path.join(opt('--spec'), 'page-map.json'), 'page-map.json')).map((p) => p.path)
      } catch (e) {
        console.error(`fast-gate: the page-map of --spec cannot be read — ${e.message}`)
        process.exit(2)
      }
    }
    // the dossier whose port-audit.json this verdict stands on: --dossier, else the run root, else the directory of the contract
    const dossier = path.resolve(opt('--dossier') ?? opt('--run-root') ?? path.dirname(resolved.path))
    // N/A is granted only by the effective kind in the bound spec. Without --spec, ordinary pages
    // retain the legacy verdict path while source-less evidence is refused by the evidence reader.
    const v = assessFastGate(run, { visual, contractHash: identity.contractHash, pageHashOf: (id) => hashes.get(id) ?? null, expectedRoutes, currentStale: identity.stale, referenceKinds, audit: { dossier, site, source: contract.source?.site ?? null, routes: expectedRoutes ?? [] } })
    // the receipt is held to the schema its reader (visual-qa --fast-gate) applies, before it is published
    const own = problems(v, RECEIPT, 'FAST-GATE.json')
    if (own.length) {
      console.error(`fast-gate: the verdict is not a valid receipt — ${own.slice(0, 3).join('; ')}`)
      process.exit(2)
    }
    writeFileSync(path.join(run, 'FAST-GATE.json'), JSON.stringify(v, null, 2) + '\n')
    writeFileSync(path.join(run, 'FAST-GATE.md'), verdictMarkdown(v))
    console.log(args.flag('--json') ? JSON.stringify(v) : verdictMarkdown(v))
    process.exit(v.status === 'pass' ? 0 : 1)
  }
}
