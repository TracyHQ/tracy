// Lens sampling and lens work lists. The layout and colour lenses read pictures of the pages that can
// show them something new: every layout's representative (visual-qa already shoots only those), plus
// each other page of the layout whose machine findings are NOT all found on the representative too —
// a page that fails in its own way is a page the lens must see. The work is then cut into N chunks of
// whole page/variant groups (site and source together), balanced by tile count, so N subagents read
// in parallel; notes.mjs `plan` writes the chunks, `merge-chunks` folds them back and refuses a
// missing, stale or half-read one.
//
// Pure: callers read the files and hand in data (`hashOf` for tile bytes). Nothing here imports
// notes.mjs or visual-qa.mjs — both import this.
import { createHash } from 'node:crypto'
import path from 'node:path'
import { STAGES } from './contract.mjs'
import { contractHash } from '../lib/canonical.mjs'

/** The lenses that read sampled pages; the other lenses keep the representative pictures only. */
export const SAMPLED_LENSES = Object.freeze(['layout', 'color'])

/** What each sampled lens looks for, and what the machine already measures (references/visual-qa.md §lenses). */
const LENS_BRIEF = Object.freeze({
  layout: {
    look: 'nav wrapping, buttons dropping a row, grids out of line, blocks too tight or too loose, section order different from the source, content running past the frame at narrow widths',
    machine: 'horizontal overflow and doubled seams (do not repeat them)'
  },
  color: {
    look: 'dark mode that looks designed: glaring blocks, lost borders, background pictures too dark, active/hover states hard to see, text over pictures',
    machine: 'contrast, white surfaces, dark-on-dark text, bright borders, colours off the palette (do not repeat them)'
  }
})

/**
 * The model each lens chunk subagent is recommended to run on (references/build-subagents.md §Model per
 * role). `inherit` is the dispatcher's own model: the Agent tool without `model`; a CLI fan-out names that
 * model itself (`claude -p --model <dispatcher's model>`), since a bare `claude -p` runs the CLI default.
 * Never the word as a model name.
 * `haiku` only where a measurement of that lens showed Haiku misses nothing the main model finds. `sonnet` for the layout lens: on
 * Nova (30/09/2026) Sonnet 5.5 found 70/82 known differences, Opus 5.5 58/82, at half the cost; one Opus pass is added at the final
 * checkpoint before release. Until 21/10/2026 the layout line said `inherit`, so an Opus dispatcher ran every chunk on Opus.
 */
export const MODEL_CHOICES = Object.freeze(['haiku', 'sonnet', 'inherit'])
export const RECOMMENDED_MODEL = Object.freeze({ layout: 'sonnet', color: 'inherit' })
/** The manifest's recommendation; a manifest planned before the field existed, or with a value outside MODEL_CHOICES, inherits. */
export const recommendedModelOf = (manifest) => (MODEL_CHOICES.includes(manifest?.recommendedModel) ? manifest.recommendedModel : 'inherit')
const MODEL_LINE = {
  haiku: 'run this chunk on Haiku — Agent tool `model: "haiku"`, or `claude -p --model haiku` for a CLI fan-out',
  sonnet: 'run this chunk on Sonnet — Agent tool `model: "sonnet"`, or `claude -p --model sonnet` for a CLI fan-out; at the final checkpoint before release one more pass of the same chunks runs on Opus',
  inherit: "run this chunk on the dispatcher's own model — Agent tool without `model`; a CLI fan-out passes that model by name (`claude -p --model <dispatcher's model>`), never a bare `claude -p`, which runs the CLI default"
}

/** Same route across locales (`ru-about` ~ `en-about`): the rule visual-qa shoots representatives by. */
export const routeOf = (id) => String(id).replace(/^[a-z]{2}-/, '')

/**
 * The findings of `pages` (visual.json shape) as rows, one per finding, with the WHOLE detail in `what`.
 * notes/machine.json cuts `what` at 300 characters for reading; two findings that differ only past
 * that cut are different findings, so the sample compares these rows, never machine.json.
 */
export function findingRows(pages, stageOf) {
  const rows = []
  for (const p of pages ?? [])
    for (const a of p.axes ?? [])
      for (const f of a.findings ?? []) {
        const { kind, ...detail } = f
        rows.push({ lens: `machine:${kind}`, page: p.id, axis: a.variant, stage: a.stage ?? stageOf(a.variant) ?? null, what: JSON.stringify(detail) })
      }
  return rows
}

/**
 * What a machine row says, without the page it was seen on: stage, axis, kind and the full detail,
 * with the page's own id and path blanked. Two pages share a row only when everything else is equal
 * — an observed/expected value or an element that differs is a different row.
 */
export function findingKey(row, page = null) {
  let what = String(row.what ?? '')
  const names = [page?.id, page?.path && page.path !== '/' ? page.path : null].filter(Boolean).sort((a, b) => b.length - a.length)
  for (const n of names) what = what.split(n).join('<page>')
  return JSON.stringify([row.stage ?? '', row.axis ?? '', row.lens ?? '', what])
}

/**
 * Which pages the sampled lenses read in `stage`: the representative(s) of every layout (every page on
 * the representative's route, as visual-qa shoots them) and every other page with a finding its
 * representative does not also have. `machine` is findingRows() of the run (whole details). Errors,
 * never guesses, when a row names a page the contract does not have or a page sits in no layout.
 */
export function lensSample(contract, stage, machine) {
  const errors = []
  const layouts = contract.layouts ?? []
  const pages = new Map((contract.pages ?? []).map((p) => [p.id, p]))
  const rows = (machine ?? []).filter((m) => !m.stage || m.stage === stage)
  const byPage = new Map()
  for (const m of rows) {
    if (!pages.has(m.page)) {
      errors.push(`machine finding on ${m.page}, a page the contract does not have`)
      continue
    }
    if (!byPage.has(m.page)) byPage.set(m.page, [])
    byPage.get(m.page).push(m)
  }
  const representatives = []
  const extras = []
  if (!layouts.length) return { layouts: [], representatives, extras, errors }
  for (const p of pages.values()) if (!layouts.some((l) => l.id === p.layout)) errors.push(`page ${p.id} is in layout ${p.layout ?? '(none)'}, which the contract does not list`)
  for (const l of layouts) {
    const members = [...pages.values()].filter((p) => p.layout === l.id)
    const reps = members.filter((p) => routeOf(p.id) === routeOf(l.representative))
    if (!reps.length) {
      errors.push(`layout ${l.id}: representative ${l.representative} is not one of its pages`)
      continue
    }
    for (const p of reps) representatives.push({ page: p.id, layout: l.id })
    const covered = new Set(reps.flatMap((p) => (byPage.get(p.id) ?? []).map((m) => findingKey(m, p))))
    for (const p of members) {
      if (reps.includes(p)) continue
      const own = (byPage.get(p.id) ?? []).filter((m) => !covered.has(findingKey(m, p)))
      if (own.length) extras.push({ page: p.id, layout: l.id, representative: l.representative, findings: own })
    }
  }
  return { layouts: layouts.map((l) => l.id), representatives, extras, errors }
}

/**
 * Whole groups into at most `n` chunks, heaviest first onto the lightest chunk (ties: key, then the
 * lower chunk). The spread between the heaviest and lightest chunk is never more than the heaviest group.
 */
export function chunkGroups(groups, n) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`chunks must be a positive integer (got ${n})`)
  const chunks = Array.from({ length: Math.min(n, groups.length) }, (_, i) => ({ chunk: i + 1, groups: [], weight: 0 }))
  const order = [...groups].sort((a, b) => b.weight - a.weight || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  for (const g of order) {
    let best = chunks[0]
    for (const c of chunks) if (c.weight < best.weight) best = c
    best.groups.push(g.key)
    best.weight += g.weight
  }
  return chunks
}

const stagesOf = (contract) => contract.visual?.stages ?? STAGES
const stageFor = (contract, variant) => stagesOf(contract).find((s) => s.variants.includes(variant))?.id ?? null
/**
 * Does the contract give `lens` the `side` picture of `page` at `variant` in `stage`? (visual.shots, as
 * visual-qa consumersFor reads it). `anyLocale` for a page picked for its own findings: `locales` limits
 * which representatives are pictured, not which failing pages the lens reads.
 */
const contractWants = (contract, page, variant, side, stage, lens, { anyLocale = false } = {}) =>
  (contract.visual?.shots ?? []).some((sh) => sh.side === side && sh.stages.includes(stage) && (!sh.variants || sh.variants.includes(variant)) && (anyLocale || sh.locales.includes(page.locale)) && sh.consumers.includes(lens))

export const lensWorkDir = (runDir, stage, lens) => path.join(path.resolve(runDir), 'notes', 'lens-work', `${stage}--${lens}`)
/** The first line of every chunk output and the line in the merged note that names the manifest. */
export const identityLine = (id, chunk = null, of = null) => (chunk == null ? `Lens-work: ${id}` : `Lens-work: ${id} chunk ${chunk}/${of}`)
/** The manifest id: sha256 over everything but `id` and `at`, so an edited manifest no longer matches. */
export const manifestId = (m) => {
  const { id: _i, at: _a, ...core } = m
  return createHash('sha256').update(JSON.stringify(core)).digest('hex').slice(0, 16)
}

/**
 * The work list of one lens in one stage of one run: groups (page × variant, site + source tiles with
 * their bytes' hashes), chunks, prompts. Throws with every problem listed when the inputs disagree:
 * a contract other than the one the run measured, an index page the contract does not have, a selected
 * page without its pictures, a missing tile. `files` carries the paths and hashes the manifest binds to.
 */
export function buildLensWork({ runDir, stage, lens, chunks, contract, visual, index, files, hashOf }) {
  const errors = []
  if (!SAMPLED_LENSES.includes(lens)) errors.push(`lens must be one of ${SAMPLED_LENSES.join(', ')} (got ${lens})`)
  if (!Number.isInteger(chunks) || chunks < 1) errors.push(`--chunks must be a positive integer (got ${chunks})`)
  const stageDef = stagesOf(contract).find((s) => s.id === stage)
  if (!stageDef) errors.push(`unknown stage ${stage}`)
  const measuredWith = visual?.identity?.contractHash ?? null
  if (!measuredWith) errors.push('visual.json names no contract hash (identity.contractHash); the run cannot be tied to this contract')
  else if (measuredWith !== contractHash(contract)) errors.push(`the contract (${contractHash(contract)}) is not the one the run measured (${measuredWith})`)
  if (errors.length) throw new Error(errors.join('\n'))
  const pages = new Map(contract.pages.map((p) => [p.id, p]))
  for (const s of index.shots ?? []) {
    if (!pages.has(s.page)) errors.push(`index.json: ${s.page} is not a page of the contract`)
    else if (s.layout && s.layout !== pages.get(s.page).layout) errors.push(`index.json: ${s.page} is layout ${s.layout} there, ${pages.get(s.page).layout} in the contract`)
  }
  if (!(contract.visual?.shots ?? []).some((sh) => sh.stages.includes(stage) && sh.consumers.includes(lens))) errors.push(`the contract gives the ${lens} lens no picture in ${stage}`)
  const machine = findingRows(visual.pages, (v) => stageFor(contract, v))
  const sample = lensSample(contract, stage, machine)
  errors.push(...sample.errors)
  // what the run measured in this stage, page → variant → axis
  const measured = new Map()
  for (const p of visual.pages ?? [])
    for (const a of p.axes ?? [])
      if (stageDef.variants.includes(a.variant)) {
        if (!measured.has(p.id)) measured.set(p.id, new Map())
        measured.get(p.id).set(a.variant, a)
        if (a.lensShot?.error) errors.push(`${p.id} ${a.variant}: the lens picture failed in the run (${a.lensShot.error})`)
      }
  const shots = (index.shots ?? []).filter((s) => s.stage === stage && s.consumers?.includes(lens))
  const reason = new Map()
  for (const r of sample.representatives) reason.set(r.page, { reason: 'representative', layout: r.layout })
  for (const x of sample.extras) reason.set(x.page, { reason: 'finding', layout: x.layout, representative: x.representative, uncovered: x.findings })
  const notMeasured = []
  for (const [id, why] of reason) {
    const page = pages.get(id)
    const variants = measured.get(id)
    if (!variants) {
      if (why.reason === 'representative') notMeasured.push(id)
      for (const v of stageDef.variants.filter((variant) => page.variants.includes(variant))) {
        if (contractWants(contract, page, v, 'site', stage, lens, { anyLocale: why.reason === 'finding' }) && !shots.some((s) => s.page === id && s.variant === v && s.side === 'site'))
          errors.push(`${id} ${v}: no site picture for the ${lens} lens (${why.reason === 'representative' ? `representative of ${why.layout}` : `findings its representative ${why.representative} does not have`}) — no axis lists this required picture`)
        if ((page.sourceRendered || page.sourceRoute) && contractWants(contract, page, v, 'source', stage, lens, { anyLocale: why.reason === 'finding' }) && !shots.some((s) => s.page === id && s.variant === v && s.side === 'source'))
          errors.push(`${id} ${v}: no source picture for the ${lens} lens — no axis lists this required picture`)
      }
      continue
    }
    const because = why.reason === 'representative' ? `representative of ${why.layout}` : `findings its representative ${why.representative} does not have`
    const anyLocale = why.reason === 'finding'
    for (const v of stageDef.variants.filter((variant) => page.variants.includes(variant))) {
      if (variants.has(v)) continue
      if (contractWants(contract, page, v, 'site', stage, lens, { anyLocale }) && !shots.some((s) => s.page === id && s.variant === v && s.side === 'site'))
        errors.push(`${id} ${v}: no site picture for the ${lens} lens (${because}) — no axis lists this required picture`)
      if ((page.sourceRendered || page.sourceRoute) && contractWants(contract, page, v, 'source', stage, lens, { anyLocale }) && !shots.some((s) => s.page === id && s.variant === v && s.side === 'source'))
        errors.push(`${id} ${v}: no source picture for the ${lens} lens — no axis lists this required picture`)
    }
    for (const [v, axis] of variants) {
      if (contractWants(contract, page, v, 'site', stage, lens, { anyLocale }) && !shots.some((s) => s.page === id && s.variant === v && s.side === 'site'))
        errors.push(`${id} ${v}: no site picture for the ${lens} lens (${because}) — shoot it with visual-qa, which pictures pages with uncovered findings`)
      // The source is wanted when the contract gives it to this lens AND the run opened the source for
      // this axis (`sourceMotion` is set only then) — a dark axis without a dark source has none to picture.
      if (contractWants(contract, page, v, 'source', stage, lens, { anyLocale }) && axis.sourceMotion && !shots.some((s) => s.page === id && s.variant === v && s.side === 'source'))
        errors.push(`${id} ${v}: no source picture for the ${lens} lens (${because})${axis.sourceShotError ? ` — the run failed to shoot it (${axis.sourceShotError})` : ''}; the run compared this axis with the source, so the lens needs it — shoot it again with visual-qa`)
    }
  }
  const groups = new Map()
  for (const s of shots) {
    const key = `${s.page}|${s.variant}`
    if (!groups.has(key)) {
      const why = reason.get(s.page) ?? { reason: 'index', layout: pages.get(s.page)?.layout ?? null }
      const rows = (machine ?? []).filter((m) => m.page === s.page && m.axis === s.variant && (!m.stage || m.stage === stage))
      const uncovered = new Set((why.uncovered ?? []).map((m) => findingKey(m, pages.get(s.page))))
      groups.set(key, {
        key,
        page: s.page,
        variant: s.variant,
        layout: why.layout,
        reason: why.reason,
        ...(why.representative ? { representative: why.representative } : {}),
        tiles: [],
        findings: rows.map((m) => ({ lens: m.lens, axis: m.axis, what: m.what, uncovered: uncovered.has(findingKey(m, pages.get(s.page))) }))
      })
    }
    // tiles are what the lens reads; a shot without them is a run the lens cannot read, not a full-page fallback
    if (!Array.isArray(s.tiles) || !s.tiles.length) {
      errors.push(`${s.page} ${s.variant} ${s.side}: no tiles in index.json (only ${s.file ?? 'no picture'}) — shoot it again with visual-qa; a full-page picture does not replace its tiles`)
      continue
    }
    for (const f of s.tiles) {
      const hash = hashOf(f)
      if (!hash) errors.push(`${s.page} ${s.variant} ${s.side}: tile ${f} is not there`)
      groups.get(key).tiles.push({ side: s.side, file: f, hash })
    }
  }
  if (!groups.size && !errors.length) errors.push(`no picture in index.json is for the ${lens} lens in ${stage}`)
  if (errors.length) throw new Error(errors.join('\n'))
  const list = [...groups.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
  const cut = chunkGroups(list.map((g) => ({ key: g.key, weight: g.tiles.length })), chunks)
  const dir = lensWorkDir(runDir, stage, lens)
  const weights = cut.map((c) => c.weight)
  const core = {
    schema: 1,
    kind: 'lens-work',
    run: path.resolve(runDir),
    stage,
    lens,
    requested: chunks,
    chunks: cut.length,
    recommendedModel: RECOMMENDED_MODEL[lens],
    contract: { path: files.contract, hash: contractHash(contract) },
    index: { path: files.index, hash: files.indexHash },
    visual: { path: files.visual, hash: files.visualHash },
    selection: {
      layouts: sample.layouts.length,
      representatives: sample.representatives.map((r) => r.page),
      extras: sample.extras.map((x) => ({ page: x.page, layout: x.layout, representative: x.representative, uncovered: x.findings.length })),
      notMeasured
    },
    tiles: list.reduce((n, g) => n + g.tiles.length, 0),
    load: { min: Math.min(...weights), max: Math.max(...weights), maxGroup: Math.max(...list.map((g) => g.tiles.length)) },
    groups: list,
    assignments: cut.map((c) => ({ chunk: c.chunk, groups: c.groups, tiles: c.weight, prompt: path.join(dir, `chunk-${c.chunk}.prompt.md`), output: path.join(dir, `chunk-${c.chunk}.md`) }))
  }
  const manifest = { id: manifestId(core), at: new Date().toISOString(), ...core }
  return { manifest, prompts: manifest.assignments.map((a) => ({ file: a.prompt, text: chunkPrompt(manifest, a.chunk) })) }
}

const LIST_CAP = 25
const WHAT_CAP = 300

/** One chunk's brief for one subagent: everything it needs, nothing it must look up. */
export function chunkPrompt(manifest, chunk) {
  const a = manifest.assignments.find((x) => x.chunk === chunk)
  const brief = LENS_BRIEF[manifest.lens]
  const groups = a.groups.map((k) => manifest.groups.find((g) => g.key === k))
  const model = recommendedModelOf(manifest)
  const out = [
    identityLine(manifest.id, chunk, manifest.chunks),
    `Model: ${model} — ${MODEL_LINE[model]} (references/build-subagents.md §Model per role).`,
    '',
    `# ${manifest.lens} lens — stage ${manifest.stage} — chunk ${chunk} of ${manifest.chunks}`,
    '',
    `Run \`${manifest.run}\`. You are one of ${manifest.chunks} ${manifest.lens} lens readers working in parallel; this chunk is yours alone (${a.tiles} tiles, ${groups.length} page/variant group(s)).`,
    '',
    `**Look for:** ${brief.look}. **The machine already measures** ${brief.machine}.`,
    '',
    'Open **every** tile listed below — site next to its source where both exist. A full-page picture does not replace its tiles. Compare with the source; do not "improve" on it.',
    ''
  ]
  for (const g of groups) {
    const why = g.reason === 'representative' ? `representative of layout ${g.layout}` : g.reason === 'finding' ? `findings its layout's representative ${g.representative} does not have` : 'listed for this lens in index.json'
    out.push(`## ${g.page} · ${g.variant} · layout ${g.layout ?? '—'} — ${why}`, '')
    const uncovered = g.findings.filter((f) => f.uncovered)
    if (uncovered.length) {
      // the findings that put this page in the sample, each whole: they may differ from the
      // representative's only past machine.json's 300-character cut, and that difference is the brief
      out.push(`Machine findings only this page has (${uncovered.length}, in full — look at what they point to):`)
      for (const f of uncovered) out.push(`- ${f.lens} ${f.what}`)
      out.push('')
    } else if (g.findings.length) {
      out.push(`Machine findings on this page/variant (${g.findings.length}; already todos — look past them):`)
      for (const f of g.findings.slice(0, LIST_CAP)) out.push(`- ${f.lens} ${f.what.length > WHAT_CAP ? `${f.what.slice(0, WHAT_CAP)}…` : f.what}`)
      if (g.findings.length > LIST_CAP) out.push(`- … ${g.findings.length - LIST_CAP} more in notes/machine.json`)
      out.push('')
    }
    for (const side of ['site', 'source']) {
      const tiles = g.tiles.filter((t) => t.side === side)
      if (!tiles.length) continue
      out.push(`${side === 'site' ? 'Site' : 'Source'} tiles:`, ...tiles.map((t) => `- ${t.file}`), '')
    }
  }
  out.push(
    '## Write',
    '',
    `Write \`${a.output}\` (only you write it) in exactly this shape — the first line verbatim, every tile you opened under \`## Opened\`, one row per defect under \`## Notes\` (keep the header when you found none). Flag: empty, \`LEE\` (a design decision the agent may not take) or \`SOURCE\` (the source has the same defect).`,
    '',
    '```',
    identityLine(manifest.id, chunk, manifest.chunks),
    '',
    '## Opened',
    '- /absolute/path/of/each/tile.png',
    '',
    '## Notes',
    '| Page | Axis | What | Where | Fix | Verify | Flag |',
    '|---|---|---|---|---|---|---|',
    '| <page id> | <variant> | <what differs from the source> | <section/element> | <fix in the theme> | <what to see after> | |',
    '```',
    ''
  )
  return out.join('\n')
}
