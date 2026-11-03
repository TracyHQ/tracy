#!/usr/bin/env node
// The Fast Gate: the visual QA loop (shoot → lenses → notes → fix → close) run on a SMALL set of cases
// chosen from the contract of the project at hand, so a defect in a shared component, the chrome or the
// dark theme is caught once, early (P3, P5), before it is multiplied over every page. It is not a
// substitute for the full gate: a fast-gate run never passes `qa.mjs --visual`, and the full gate refuses
// a fast gate that is stale or not clean.
//
//   node tools/fast-gate.mjs plan    --contract qa.contract.json [--json <out>] [--changed a,b,…]
//   node tools/fast-gate.mjs verdict <run-dir> [--contract qa.contract.json] [--json]
//
// plan     resolve the cases (below), print the table, exit 2 when the contract cannot support a fast gate
//          (an override names nothing, drops the only coverage of something, the output requires an
//          unknown-route page and the contract has none). `--changed` lists the cases whose render inputs
//          include those files — the ones to rerun after a fix.
// verdict  read a `visual-qa.mjs --scope fast-gate` run and hold it to the pass conditions: every stage
//          passed, every planned case measured, every stage merged (`qa-notes.mjs merge`) with nothing
//          open, every picture opened by each consumer, no machine finding left, and the inputs unchanged
//          since the run (contract hash, page hashes against the tree). Writes FAST-GATE.json + .md.
//
// How the cases are chosen — deterministic, nothing hard-coded, everything read from the contract:
//   mandatory  the default locale's root page (`path: '/'`), every page whose `status` is not 200
//              (unknown-route handling is an output requirement whether or not the source drew a 404),
//              one page for every `interactions{}` state (measured on the widest axis), one page for every
//              declared `layouts[].family`, one page for every SHARED component — a file in the import
//              closure of ≥ 2 layouts but not of all of them (chrome every page carries is covered by any
//              page); a locale other than the default with a risk of its own (non-Latin script, RTL, text
//              ≥ 25 % longer for the same content id, a different font allow-list) is added on the
//              narrowest variant of each stage for the pages already chosen.
//   how many   greedy set cover over those requirements; candidates are the layouts' representatives;
//              ties break by id, so the same contract always yields the same plan.
//   stages     every stage of `visual.stages` — the output's viewports and themes are required even when
//              the source offers no frame for them.
//   overrides  `visual.fastGate.add[]` / `.drop[]`, each with a reason; a drop that removes the only
//              coverage of a requirement is an error, not a quieter gate.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { importClosure, pageHash } from './visual-lib.mjs'
import { contractHash } from './qa-contract.mjs'

const list = (v) => (Array.isArray(v) ? v : [])
const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// ── locale risk: read from the contract's own content, no per-project table ──────────────────────
const SCRIPTS = [
  ['cyrillic', /[Ѐ-ӿ]/],
  ['greek', /[Ͱ-Ͽ]/],
  ['arabic', /[؀-ۿ]/, 'rtl'],
  ['hebrew', /[֐-׿]/, 'rtl'],
  ['devanagari', /[ऀ-ॿ]/],
  ['thai', /[฀-๿]/],
  ['cjk', /[぀-ヿ㐀-䶿一-鿿가-힯]/]
]
export function localeRisks(contract) {
  // older contracts (and the test mocks) may not declare locales: the root page's locale is the default
  // ⚠ `pages` is not in scope here -- the sibling at `deriveShots` has a local of that name, this
  // function never did. The fallback is only reached when `defaultLocale` is missing, which is
  // exactly the case the comment above says it exists for, so the branch written to rescue an older
  // contract was the one that threw `ReferenceError: pages is not defined`. Reachable from the CLI:
  // `fast-gate.mjs` parses `--contract` and calls straight through without running the validator
  // that would have required `defaultLocale`.
  // Named `allPages`, not `all`: the loop below already has an `all` of its own (the joined text of
  // a locale), and two different things under one name in one function is how the next reader loses.
  const allPages = list(contract.pages)
  const dflt = contract.defaultLocale ?? allPages.find((p) => p.path === '/')?.locale ?? allPages[0]?.locale
  const textsOf = (locale) => {
    const out = new Map()
    for (const p of list(contract.pages).filter((p) => p.locale === locale))
      for (const c of list(p.content))
        if (c.attribute === 'text' && typeof c.expected === 'string')
          out.set(`${p.layout ?? p.id}|${c.id}`, c.expected)
    return out
  }
  const base = textsOf(dflt)
  const risks = {}
  for (const locale of list(contract.locales)) {
    if (locale === dflt) continue
    const why = []
    const texts = textsOf(locale)
    const all = [...texts.values()].join(' ')
    for (const [name, re, dir] of SCRIPTS)
      if (re.test(all)) why.push(dir === 'rtl' ? `script:${name}:rtl` : `script:${name}`)
    let longer = 0,
      compared = 0
    for (const [k, t] of texts) {
      const b = base.get(k)
      if (!b) continue
      compared++
      if (t.length >= b.length * 1.25) longer++
    }
    if (compared && longer / compared >= 0.5) why.push(`long-text:${longer}/${compared}`)
    const fonts = contract.fonts?.allowed
    if (fonts && JSON.stringify(fonts[locale] ?? null) !== JSON.stringify(fonts[dflt] ?? null))
      why.push('fonts:differ')
    if (why.length) risks[locale] = why
  }
  return risks
}

// ── shot rules: what gets a picture, derived from the contract rather than copied from a project ──
// A stage's lenses follow its theme and width (light+widest: all five; light narrower: layout,
// typography, images; dark+widest: colour, layout; dark narrower: layout, colour). The default locale
// is shot on every stage; its source is shot on the light stages when it has one. Another locale gets a
// picture only when it carries a risk of its own (localeRisks): the narrowest variant of each stage,
// for the typography lens (plus layout for RTL), and its OWN source at the same width when the source
// has that locale — never the default locale's source standing in for it.
const STAGE_LENSES = {
  'light:widest': ['layout', 'typography', 'color', 'images', 'interaction'],
  'light:narrow': ['layout', 'typography', 'images'],
  'dark:widest': ['color', 'layout'],
  'dark:narrow': ['layout', 'color']
}
export function deriveShots(contract) {
  const stages = list(contract.visual?.stages),
    variants = list(contract.variants),
    pages = list(contract.pages)
  const dflt = contract.defaultLocale ?? pages.find((p) => p.path === '/')?.locale ?? pages[0]?.locale
  const widest = Math.max(...variants.map((v) => v.width))
  const kindOf = (st) => {
    const vs = list(st.variants)
      .map((id) => variants.find((v) => v.id === id))
      .filter(Boolean)
    const themes = new Set(vs.map((v) => v.theme))
    if (themes.size !== 1) return null
    return `${[...themes][0]}:${vs.some((v) => v.width === widest) ? 'widest' : 'narrow'}`
  }
  const narrowestOf = (st) =>
    list(st.variants)
      .map((id) => variants.find((v) => v.id === id))
      .filter(Boolean)
      .sort((a, b) => a.width - b.width || byId(a.id, b.id))[0]?.id
  const known = new Set(
    list(contract.source?.files)
      .filter((f) => ['converted', 'reference'].includes(f.disposition))
      .map((f) => f.path)
  )
  const sourcesOf = (locale) =>
    new Set(
      pages
        .filter((p) => p.locale === locale)
        .flatMap((p) => list(p.source))
        .filter((f) => known.has(f))
    )
  const defaultSources = sourcesOf(dflt)
  // a locale has a source of its own when some page of it cites a file no default-locale page cites
  const hasOwnSource = (locale) =>
    locale === dflt ? defaultSources.size > 0 : [...sourcesOf(locale)].some((f) => !defaultSources.has(f))
  const rules = []
  for (const st of stages) {
    const kind = kindOf(st)
    rules.push({
      stages: [st.id],
      side: 'site',
      locales: [dflt],
      consumers: kind ? STAGE_LENSES[kind] : STAGE_LENSES['light:widest']
    })
  }
  const light = stages.filter((st) => (kindOf(st) ?? 'light:widest').startsWith('light'))
  if (hasOwnSource(dflt) && light.length)
    rules.push({
      stages: light.map((st) => st.id),
      side: 'source',
      locales: [dflt],
      consumers: ['layout', 'typography', 'images'],
      // a layout whose canvas has no page of its own (layouts[].hasSource false) gets no source
      // picture: a Terms page paired with the Home render confused every reviewer of one round
      ownSourceOnly: true
    })
  const risks = localeRisks(contract)
  for (const [locale, why] of Object.entries(risks).sort(([a], [b]) => byId(a, b))) {
    const consumers = why.some((w) => w.endsWith(':rtl')) ? ['typography', 'layout'] : ['typography']
    const widthOf = (id) => variants.find((v) => v.id === id)?.width ?? widest
    const narrow = stages.filter((st) => widthOf(narrowestOf(st)) < widest)
    const target = narrow.length ? narrow : stages
    rules.push({
      stages: target.map((st) => st.id),
      side: 'site',
      locales: [locale],
      variants: target.map(narrowestOf),
      consumers
    })
    const lightNarrow = target.filter((st) => (kindOf(st) ?? '').startsWith('light'))
    if (hasOwnSource(locale) && lightNarrow.length)
      rules.push({
        stages: lightNarrow.map((st) => st.id),
        side: 'source',
        locales: [locale],
        variants: lightNarrow.map(narrowestOf),
        consumers,
        ownSourceOnly: true
      })
  }
  return rules
}

// ── the plan ───────────────────────────────────────────────────────────────────────────────────────
export function resolveFastGate(contract, { root = process.cwd() } = {}) {
  const errors = [],
    notes = []
  const pages = list(contract.pages)
  const page = (id) => pages.find((p) => p.id === id)
  const layouts = list(contract.layouts)
  const stages = list(contract.visual?.stages)
  const variants = list(contract.variants)
  if (!layouts.length) errors.push('layouts[] required: the fast gate picks representatives per layout')
  if (!stages.length) errors.push('visual.stages required: every stage is a required output')
  const layoutOf = (p) =>
    layouts.find((l) => l.id === p.layout) ?? layouts.find((l) => list(l.pages).includes(p.id))

  // import closures per layout; shared = in ≥ 2 layouts, not in all; the view file itself is the layout
  const closure = new Map(
    layouts.map((l) => [l.id, importClosure(root, l.view).filter((f) => f !== path.normalize(l.view))])
  )
  const count = new Map()
  for (const files of closure.values()) for (const f of files) count.set(f, (count.get(f) ?? 0) + 1)
  const shared = [...count]
    .filter(([, n]) => n >= 2 && n < layouts.length)
    .map(([f]) => f)
    .sort(byId)
  const families = [...new Set(layouts.map((l) => l.family).filter(Boolean))].sort(byId)
  // a state is a requirement when some page lists it; declared in interactions{} but used nowhere is noted
  const states = Object.keys(contract.interactions ?? {})
    .filter((s) => pages.some((p) => list(p.states).includes(s)))
    .sort(byId)
  for (const s of Object.keys(contract.interactions ?? {}))
    if (!states.includes(s))
      notes.push(`interaction state ${s} is declared but no page lists it — nothing to measure`)
  const dflt = contract.defaultLocale

  // requirements, each a string key; a candidate covers a set of them
  const req = new Set()
  for (const f of shared) req.add(`component:${f}`)
  for (const f of families) req.add(`family:${f}`)
  for (const s of states) req.add(`state:${s}`)
  const home = pages.find((p) => p.locale === dflt && p.path === '/')
  if (home) req.add('home')
  else errors.push(`requirement-missing: no root page (path "/") for the default locale ${dflt}`)
  // non-200 pages of the default locale are mandatory; other locales' follow the locale-risk rule
  const system = pages.filter((p) => (p.status ?? 200) !== 200 && p.locale === dflt)
  if (system.length) for (const p of system) req.add(`status:${p.status}@${p.id}`)
  else
    errors.push(
      'requirement-missing: unknown-route — no page with a non-200 status; a 404 page is an output requirement even when the source has none'
    )
  const coversOf = (p) => {
    const l = layoutOf(p)
    const out = new Set()
    if (!l) return out
    for (const f of closure.get(l.id) ?? []) if (req.has(`component:${f}`)) out.add(`component:${f}`)
    if (l.family) out.add(`family:${l.family}`)
    for (const s of list(p.states)) if (s !== 'default' && req.has(`state:${s}`)) out.add(`state:${s}`)
    if (p === home) out.add('home')
    if (system.includes(p)) out.add(`status:${p.status}@${p.id}`)
    return out
  }
  const candidates = layouts
    .map((l) => page(l.representative))
    .filter(Boolean)
    .sort((a, b) => byId(a.id, b.id))
  const chosen = new Map() // page id → why[]
  const covered = new Set()
  // `why` = the reason it was taken plus everything it covers, so the plan reads as "this page stands for…"
  const take = (p, why) => {
    const c = chosen.get(p.id) ?? []
    for (const w of [...why, ...[...coversOf(p)].sort(byId)]) if (!c.includes(w)) c.push(w)
    chosen.set(p.id, c)
    for (const k of coversOf(p)) covered.add(k)
  }
  if (home) take(home, ['home'])
  for (const p of system) take(p, [])
  // overrides first: an `add` is a fixed point of the plan, a `drop` removes a candidate
  const fg = contract.visual?.fastGate ?? {}
  const dropped = new Set()
  for (const [i, o] of list(fg.drop).entries()) {
    const l = layouts.find((x) => x.id === o?.layout)
    if (!l) errors.push(`visual.fastGate.drop[${i}]: unknown layout ${o?.layout}`)
    else if (!o.reason) errors.push(`visual.fastGate.drop[${i}]: reason required`)
    else dropped.add(l.id)
  }
  for (const [i, o] of list(fg.add).entries()) {
    const p = o?.page
      ? page(o.page)
      : o?.layout
        ? page(layouts.find((x) => x.id === o.layout)?.representative)
        : null
    if (!p) errors.push(`visual.fastGate.add[${i}]: unknown page/layout ${o?.page ?? o?.layout}`)
    else if (!o.reason) errors.push(`visual.fastGate.add[${i}]: reason required`)
    else take(p, [`override:${o.reason}`])
  }
  // greedy: the candidate covering the most still-uncovered requirements; ties by id
  for (;;) {
    let best = null,
      gain = []
    for (const p of candidates) {
      if (chosen.has(p.id) || dropped.has(layoutOf(p)?.id)) continue
      const g = [...coversOf(p)].filter((k) => !covered.has(k)).sort(byId)
      if (g.length > gain.length) {
        best = p
        gain = g
      }
    }
    if (!best) break
    take(best, gain)
  }
  const uncovered = [...req].filter((k) => !covered.has(k)).sort(byId)
  for (const k of uncovered)
    errors.push(
      dropped.size
        ? `override-breaks-coverage: ${k} is covered by no remaining page (a drop removed it)`
        : `coverage: ${k} is covered by no layout representative`
    )
  // locales: risk → the chosen pages' counterparts on the narrowest variant of every stage
  const risks = localeRisks(contract)
  const narrowest = stages
    .map((st) => {
      const vs = list(st.variants)
        .map((id) => variants.find((v) => v.id === id))
        .filter(Boolean)
      return vs.sort((a, b) => a.width - b.width || byId(a.id, b.id))[0]?.id
    })
    .filter(Boolean)
  const localeCases = []
  for (const [locale, why] of Object.entries(risks).sort(([a], [b]) => byId(a, b))) {
    for (const [pid] of [...chosen].sort(([a], [b]) => byId(a, b))) {
      const p = page(pid)
      const l = layoutOf(p)
      const twin =
        pages.find(
          (x) =>
            x.locale === locale &&
            x !== p &&
            layoutOf(x) === l &&
            x.path.replace(`/${locale}`, '') === p.path.replace(/^\/$/, '')
        ) ?? pages.find((x) => x.locale === locale && layoutOf(x) === l)
      if (!twin || chosen.has(twin.id)) continue
      const vs = narrowest.filter((v) => list(twin.variants).includes(v))
      localeCases.push({ page: twin, variants: vs, why: why.map((w) => `locale:${locale}:${w}`) })
    }
    const hasPicture = list(contract.visual?.shots).some(
      (sh) => sh.side === 'site' && list(sh.locales).includes(locale)
    )
    if (!hasPicture)
      notes.push(
        `locale ${locale}: measured only — visual.shots names no site picture for it, so no lens sees it in the fast gate`
      )
  }
  const stageIds = stages.map((s) => s.id)
  const variantIds = variants.map((v) => v.id)
  const mk = (p, why, vs) => {
    const l = layoutOf(p)
    return {
      page: p.id,
      path: p.path,
      locale: p.locale,
      layout: l?.id ?? null,
      family: l?.family ?? null,
      stages: stageIds.filter((id) => stages.find((s) => s.id === id).variants.some((v) => vs.includes(v))),
      variants: vs,
      states: list(p.states),
      why
    }
  }
  const cases = [
    ...[...chosen]
      .sort(([a], [b]) => byId(a, b))
      .map(([pid, why]) =>
        mk(
          page(pid),
          why,
          list(page(pid).variants).filter((v) => variantIds.includes(v))
        )
      ),
    ...localeCases.map((x) => mk(x.page, x.why, x.variants))
  ]
  const chosenLayouts = new Set(cases.map((c) => c.layout))
  const fullOnly = {
    layouts: layouts
      .map((l) => l.id)
      .filter((id) => !chosenLayouts.has(id))
      .sort(byId),
    pages: pages
      .map((p) => p.id)
      .filter((id) => !cases.some((c) => c.page === id))
      .sort(byId),
    states: states.filter((s) => !cases.some((c) => c.states.includes(s))),
    components: [...count.keys()]
      .filter((f) => !cases.some((c) => (closure.get(c.layout) ?? []).includes(f)))
      .sort(byId)
  }
  const stagesCovered = stageIds.filter((id) => cases.some((c) => c.stages.includes(id)))
  const summary = (total, coveredList) => ({
    total: total.length,
    covered: coveredList.length,
    uncovered: total.filter((x) => !coveredList.includes(x))
  })
  const fullAxes = pages.reduce((n, p) => n + list(p.variants).length, 0)
  const fastAxes = cases.reduce((n, c) => n + c.variants.length, 0)
  const ratio = fullAxes ? +(fastAxes / fullAxes).toFixed(3) : 0
  const nearFull = ratio >= 0.6
  if (nearFull)
    notes.push(
      `the fast gate measures ${fastAxes} of ${fullAxes} axes (${Math.round(ratio * 100)} %): this site is small or its layouts share little — the fast gate is close to the full gate, and that is the honest answer`
    )
  if (!families.length)
    notes.push(
      'no layouts[].family declared: a layout whose components are all shared elsewhere gets no picture in the fast gate; declare families (list, detail, form, …) to force one representative each'
    )
  return {
    schemaVersion: 1,
    scope: 'fast-gate',
    contractHash: contractHash(contract),
    cases,
    coverage: {
      components: summary(
        shared,
        shared.filter((f) => covered.has(`component:${f}`))
      ),
      families: summary(
        families,
        families.filter((f) => covered.has(`family:${f}`))
      ),
      states: summary(
        states,
        states.filter((s) => covered.has(`state:${s}`))
      ),
      stages: summary(stageIds, stagesCovered),
      locales: {
        total: list(contract.locales).length,
        covered: new Set(cases.map((c) => c.locale)).size,
        risks
      },
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

/** Cases whose page hash inputs include any of `files` (paths relative to the template root). */
export function affectedCases(plan, contract, files, { root = process.cwd() } = {}) {
  const rel = files.map((f) => path.normalize(path.isAbsolute(f) ? path.relative(root, f) : f))
  return plan.cases.filter((c) => {
    const spec = list(contract.pages).find((p) => p.id === c.page)
    const view = spec?.render?.view
    const closure = view ? importClosure(root, view) : []
    return rel.some(
      (f) =>
        closure.includes(f) ||
        f.startsWith('src/styles/') ||
        f.startsWith('src/layouts/') ||
        f === 'seed/seed.json' ||
        f.startsWith('seed/media') ||
        f === 'qa.contract.json' ||
        f.startsWith('tools/')
    )
  })
}

// ── the verdict ────────────────────────────────────────────────────────────────────────────────────
export function assessFastGate(runDir, { contract, root = process.cwd(), now = Date.now() } = {}) {
  const reasons = []
  const read = (rel) => JSON.parse(readFileSync(path.join(runDir, rel), 'utf8'))
  let visual
  try {
    visual = read('visual.json')
  } catch (e) {
    return { status: 'fail', reasons: [`no visual.json in ${runDir}: ${e.message}`] }
  }
  if (visual.scope?.kind !== 'fast-gate')
    reasons.push(`scope is ${visual.scope?.kind ?? 'full (unscoped)'}, not fast-gate`)
  const plan = visual.scope?.plan
  if (contract && visual.contractHash && visual.contractHash !== contractHash(contract))
    reasons.push('stale: the contract changed since the run')
  const stages = list(contract?.visual?.stages ?? visual.stages).map((s) => s.id)
  for (const id of stages) {
    const got = list(visual.stages).find((s) => s.id === id)
    if (!got || got.status !== 'pass')
      reasons.push(`stage ${id}: ${got?.status ?? 'absent'}${got?.reason ? ` — ${got.reason}` : ''}`)
  }
  // every planned case measured on every planned axis
  for (const c of list(plan?.cases)) {
    const p = list(visual.pages).find((x) => x.id === c.page)
    if (!p) {
      reasons.push(`case ${c.page}: not measured`)
      continue
    }
    for (const v of c.variants)
      if (!p.axes.some((a) => a.variant === v)) reasons.push(`case ${c.page}/${v}: not measured`)
  }
  if (visual.summary?.findings) reasons.push(`${visual.summary.findings} machine finding(s)`)
  // the review loop closed on every stage: merged notes, nothing open, every picture opened, every lens heard
  let index = { shots: [] }
  try {
    index = read('index.json')
  } catch {
    reasons.push('no index.json')
  }
  let machine = []
  try {
    machine = read('notes/machine.json')
  } catch {
    reasons.push('no notes/machine.json')
  }
  for (const id of stages) {
    const consumers = new Set(index.shots.filter((s) => s.stage === id).flatMap((s) => s.consumers ?? []))
    const rel = `NOTES-${id}.json`
    if (!existsSync(path.join(runDir, rel))) {
      reasons.push(`stage ${id}: notes not merged (qa-notes.mjs merge --stage ${id})`)
      continue
    }
    const notes = read(rel)
    const c = notes.counts ?? {}
    for (const k of ['open', 'reopened', 'lee', 'leeFlagged'])
      if (c[k]) reasons.push(`stage ${id}: ${c[k]} todo(s) ${k}`)
    if (notes.coverage?.missing?.length)
      reasons.push(`stage ${id}: ${notes.coverage.missing.length} picture(s) not opened by a consumer`)
    for (const lens of [...consumers].sort(byId))
      if (lens !== 'reviewer' && !list(notes.lenses).includes(lens))
        reasons.push(`stage ${id}: lens ${lens} never reported`)
    const fresh = list(notes.todos).filter((t) => t.id.startsWith('N-') && t.status !== 'closed')
    if (fresh.length)
      reasons.push(
        `stage ${id}: ${fresh.length} note(s) not closed — a run with open notes is not the confirmation round`
      )
    const m = machine.filter((x) => !x.stage || x.stage === id)
    if (m.length) reasons.push(`stage ${id}: ${m.length} machine finding(s) still listed`)
  }
  // stale: any measured page whose hash no longer matches the tree
  const pageHashes = {}
  const stale = []
  if (contract)
    for (const p of list(visual.pages)) {
      const spec = list(contract.pages).find((x) => x.id === p.id)
      if (!spec) {
        stale.push(`${p.id}: no longer in the contract`)
        continue
      }
      const { hash } = pageHash(contract, spec, {
        root,
        toolsDir: path.dirname(new URL(import.meta.url).pathname)
      })
      pageHashes[p.id] = hash
      if (hash !== p.hash) stale.push(p.id)
    }
  if (stale.length)
    reasons.push(`stale: ${stale.length} page(s) changed since the run — ${stale.slice(0, 8).join(', ')}`)
  return {
    schemaVersion: 1,
    scope: 'fast-gate',
    status: reasons.length ? 'fail' : 'pass',
    run: path.resolve(runDir),
    at: new Date(now).toISOString(),
    contractHash: visual.contractHash ?? null,
    stages,
    cases: list(plan?.cases).map((c) => ({ page: c.page, layout: c.layout, variants: c.variants })),
    pageHashes,
    stale,
    reasons
  }
}

export function planMarkdown(plan) {
  const md = [
    `# Fast Gate plan — ${plan.cases.length} case(s), ${plan.axes.fast} of ${plan.axes.full} axes (${Math.round(plan.ratio * 100)} %)`,
    '',
    'Scope: **fast-gate**. A pass here is not visual acceptance and not a release receipt — it means the shared parts are clean enough to multiply. Everything under "Only at the full gate" is measured there and nowhere else.',
    '',
    '| Page | Layout | Family | Stages | States | Stands for |',
    '|---|---|---|---|---|---|',
    ...plan.cases.map(
      (c) =>
        `| ${c.page} | ${c.layout ?? '—'} | ${c.family ?? '—'} | ${c.stages.join(', ')} | ${c.states.join(', ')} | ${c.why.join('; ')} |`
    ),
    '',
    '## Coverage',
    '',
    `- shared components: ${plan.coverage.components.covered}/${plan.coverage.components.total}${plan.coverage.components.uncovered.length ? ` — uncovered: ${plan.coverage.components.uncovered.join(', ')}` : ''}`,
    `- layout families: ${plan.coverage.families.covered}/${plan.coverage.families.total}`,
    `- interaction states: ${plan.coverage.states.covered}/${plan.coverage.states.total}`,
    `- stages: ${plan.coverage.stages.covered}/${plan.coverage.stages.total}`,
    `- locales: ${plan.coverage.locales.covered}/${plan.coverage.locales.total}${
      Object.keys(plan.coverage.locales.risks).length
        ? ` — risks: ${Object.entries(plan.coverage.locales.risks)
            .map(([l, w]) => `${l} (${w.join(', ')})`)
            .join('; ')}`
        : ' — no locale-specific risk detected'
    }`,
    `- layouts with a picture: ${plan.coverage.layouts.covered}/${plan.coverage.layouts.total}`,
    '',
    '## Only at the full gate',
    '',
    `- layouts: ${plan.fullOnly.layouts.join(', ') || 'none'}`,
    `- pages: ${plan.fullOnly.pages.length}`,
    `- states: ${plan.fullOnly.states.join(', ') || 'none'}`,
    `- components never rendered by a fast-gate case: ${plan.fullOnly.components.join(', ') || 'none'}`,
    '',
    '## Notes',
    '',
    ...(plan.notes.length ? plan.notes.map((n) => `- ${n}`) : ['- none']),
    ...(plan.errors.length ? ['', '## Errors', '', ...plan.errors.map((e) => `- ${e}`)] : []),
    ''
  ]
  return md.join('\n')
}
export function verdictMarkdown(v) {
  return [
    `# Fast Gate verdict — ${v.status.toUpperCase()} — ${v.at}`,
    '',
    `Run: ${v.run}`,
    `Contract: ${v.contractHash ?? 'unknown'}`,
    `Stages: ${v.stages.join(' → ')}`,
    `Cases: ${v.cases.map((c) => c.page).join(', ') || 'none'}`,
    '',
    'Scope **fast-gate**: this verdict is neither visual acceptance nor a release receipt.',
    '',
    '## Reasons',
    '',
    ...(v.reasons.length
      ? v.reasons.map((r) => `- ${r}`)
      : [
          '- none: every stage passed, every case measured, every note closed, every picture opened, inputs unchanged'
        ]),
    ''
  ].join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  const opt = (n) => {
    const i = args.indexOf(n)
    return i < 0 ? undefined : args[i + 1]
  }
  const command = args[0]
  const contractFile = opt('--contract') ?? 'qa.contract.json'
  const contract = existsSync(contractFile) ? JSON.parse(readFileSync(contractFile, 'utf8')) : null
  if (command === 'plan') {
    if (!contract) {
      console.error(`no contract at ${contractFile}`)
      process.exit(2)
    }
    const plan = resolveFastGate(contract)
    if (opt('--changed')) {
      const hit = affectedCases(plan, contract, opt('--changed').split(',').filter(Boolean))
      console.log(JSON.stringify({ changed: opt('--changed').split(','), cases: hit.map((c) => c.page) }))
    } else {
      process.stdout.write(planMarkdown(plan))
    }
    if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(plan, null, 2) + '\n')
    process.exit(plan.errors.length ? 2 : 0)
  } else if (command === 'verdict' && args[1]) {
    const v = assessFastGate(args[1], { contract })
    writeFileSync(path.join(args[1], 'FAST-GATE.json'), JSON.stringify(v, null, 2) + '\n')
    writeFileSync(path.join(args[1], 'FAST-GATE.md'), verdictMarkdown(v))
    console.log(args.includes('--json') ? JSON.stringify(v) : verdictMarkdown(v))
    process.exit(v.status === 'pass' ? 0 : 1)
  } else {
    console.error(
      'usage: fast-gate.mjs plan --contract qa.contract.json [--json out] [--changed a,b] | verdict <run-dir> [--contract f]'
    )
    process.exit(2)
  }
}
