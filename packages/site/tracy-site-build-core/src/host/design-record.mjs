/**
 * `docs/agents/design.json` — the design system a site WEARS (ADR 0023, Lee 29/09/2026).
 *
 * WHY A FILE IN THE SITE FOLDER. A site's look is decided in three different places — the contract
 * profile a template press installs (`<version>.design.json`), the registry plan a Joomla design
 * press resolves to, the catalogue inspiration a WordPress build dresses the theme in — and none of
 * them is readable by the agent that later edits the site, nor by an adherence check on a running
 * page. T4 compiles the tokens into `template.css`, so on a Joomla site the token VALUES survive
 * nowhere at runtime. This record freezes them at build time: id, source, and the 56 token values
 * read from the same `tokens.css` the seeder dressed the site with. `site-context.mjs` reads the
 * NAMES into the agent's context; the check (`tracy_design_check`) reads the VALUES as its ruler.
 *
 * `bound: false` is an answer, not an error: a JoomlArt quickstart wears its own look and the
 * catalogue cannot name it. The record says so, so the agent is told "none bound" rather than
 * nothing, and the check answers `NO_DESIGN_BOUND` rather than inventing a palette.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const SCHEMA = 'tracy-site-design/v1'
export const DESIGN_FILE = path.join('docs', 'agents', 'design.json')
/** The seeder's copy of each system's `tokens.css` in the image — the very files a site was dressed with. */
export const SEEDER_SYSTEMS = '/opt/tracy/cms/data/systems'
/** The image's own copy of the 154 systems — the fallback when the seeder's copy is not there. */
export const IMAGE_SYSTEMS = '/opt/tracy/design-systems'

/**
 * @typedef {{ id: string, source: 'catalog' } | { id: string, source: 'quickstart' } | { id: string, source: 'brand' } | { id: null, source: 'template' | 'none' }} EffectiveDesign
 * @typedef {{
 *   schemaVersion: string, id: string | null, source: 'catalog' | 'quickstart' | 'brand' | 'template' | 'none', name: string | null,
 *   bound: boolean, platform: string, manifestDesign: { id: string, source: string } | null,
 *   tokens: Record<string, string> | null, tokensFrom: string | null, allow?: { prop: string, value: string }[],
 *   writtenAt: string, wroteBy: string
 * }} DesignRecord
 */

/**
 * The custom properties a `tokens.css` declares: the first declaration of each name, comments
 * stripped. A system's sheet declares each of the 56 once in `:root`; a demo block repeating one
 * lower down does not win.
 * @param {string} css
 * @returns {Record<string, string>}
 */
export function tokensOf(css) {
  /** @type {Record<string, string>} */
  const out = {}
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of bare.matchAll(/(--[A-Za-z0-9][\w-]*)\s*:\s*([^;{}]+);/g)) {
    const name = m[1]
    if (!(name in out)) out[name] = m[2].trim()
  }
  return out
}

/**
 * What the site will wear, from what the job says.
 *
 * In order: a brand id names the brand; a plan that names a design (the registry road, or a
 * template whose sealing profile names one) names THAT design — the fallback's when the plan fell
 * back, and a quickstart's own look when the profile names that (source `quickstart`); a catalogue
 * inspiration outside a template press names itself; a template press whose profile names none
 * wears the template's own look; anything else wears nothing we can name.
 * @param {{ inspiration: string, designPlan?: { workflow?: string, design?: { id: string, source: string } | null } }} job
 * @param {Set<string>} ids the catalogue's ids
 * @returns {EffectiveDesign}
 */
export function effectiveDesignOf(job, ids) {
  if (job.inspiration.startsWith('brand:')) return { id: job.inspiration, source: 'brand' }
  const planned = job.designPlan?.design
  if (planned && typeof planned.id === 'string')
    return { id: planned.id, source: planned.source === 'quickstart' ? 'quickstart' : 'catalog' }
  const template = job.designPlan?.workflow === 'template'
  if (!template && ids.has(job.inspiration)) return { id: job.inspiration, source: 'catalog' }
  return { id: null, source: template ? 'template' : 'none' }
}

/**
 * Where the seeder keeps the data beside its bundle (`…/seed-wordpress` → `…/data`), or null.
 * @param {{ command: string } | null | undefined} seeder
 */
export function seederDataDirOf(seeder) {
  if (!seeder) return null
  try {
    return path.join(path.dirname(realpathSync(seeder.command)), 'data')
  } catch {
    return path.join(path.dirname(seeder.command), 'data')
  }
}

/**
 * The directories a catalogue system's folder may be under, in the order to try: the seeder's
 * copy (the very files the site was dressed with), then the image's own copy.
 * @param {{ command: string } | null | undefined} seeder
 */
export function tokensDirsOf(seeder) {
  const seed = seederDataDirOf(seeder)
  return [...(seed ? [path.join(seed, 'systems')] : []), SEEDER_SYSTEMS, IMAGE_SYSTEMS]
}

/**
 * The `tokens.css` of what the site wears, or null.
 * @param {EffectiveDesign} design
 * @param {{ root: string, tokensDirs: string[] }} where
 */
export function tokensFileFor(design, { root, tokensDirs }) {
  if (design.id === null) return null
  if (design.source === 'brand') {
    const host = design.id.slice('brand:'.length)
    if (!/^[a-z0-9.-]+$/i.test(host)) return null
    const file = path.join(root, 'Brand', host, 'tokens.css')
    return existsSync(file) ? file : null
  }
  for (const dir of tokensDirs) {
    const file = path.join(dir, design.id, 'tokens.css')
    if (existsSync(file)) return file
  }
  return null
}

/**
 * The record for one build.
 * @param {object} input
 * @param {{ job?: string, inspiration: string, platform: string, designPlan?: any }} input.job
 * @param {Set<string>} input.ids
 * @param {string} input.root the site folder
 * @param {string[]} input.tokensDirs
 * @param {Map<string, string>} input.names catalogue id → display name
 * @param {string} [input.wroteBy]
 * @returns {DesignRecord}
 */
export function designRecord({ job, ids, root, tokensDirs, names, wroteBy }) {
  const design = effectiveDesignOf(job, ids)
  const planned = job.designPlan?.design
  // A quickstart's own look is in no catalogue on disk: its sealing profile resolved the tokens from
  // the theme and the plan carried them here, with the name and the theme file they came from.
  const fromPlan = design.source === 'quickstart' && planned?.tokens && typeof planned.tokens === 'object'
  const file = fromPlan ? null : tokensFileFor(design, { root, tokensDirs })
  /** @type {Record<string, string> | null} */
  let tokens = fromPlan ? { ...planned.tokens } : null
  if (file !== null) {
    try {
      tokens = tokensOf(readFileSync(file, 'utf8'))
    } catch {
      tokens = null
    }
  }
  const plannedName =
    design.source === 'quickstart' && typeof planned?.name === 'string' ? planned.name : null
  return {
    schemaVersion: SCHEMA,
    id: design.id,
    source: design.source,
    name: design.id === null ? null : (plannedName ?? names.get(design.id) ?? design.id),
    bound: design.id !== null,
    platform: job.platform,
    manifestDesign:
      planned && typeof planned.id === 'string' && typeof planned.source === 'string'
        ? { id: planned.id, source: planned.source }
        : null,
    tokens,
    tokensFrom: fromPlan ? (typeof planned.tokensFrom === 'string' ? planned.tokensFrom : null) : file,
    writtenAt: new Date().toISOString(),
    wroteBy: wroteBy ?? `build:${job.job ?? '?'}`
  }
}

/** @param {string} root @param {DesignRecord} record */
export function writeDesign(root, record) {
  const file = path.join(root, DESIGN_FILE)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
}

/**
 * The record a site folder holds, or null when there is none or it cannot be read.
 * @param {string} root
 * @returns {DesignRecord | null}
 */
export function readDesign(root) {
  try {
    const parsed = JSON.parse(readFileSync(path.join(root, DESIGN_FILE), 'utf8'))
    return parsed && typeof parsed === 'object' && parsed.schemaVersion === SCHEMA ? parsed : null
  } catch {
    return null
  }
}

/**
 * The site changed its look through `theme.style`: the record follows, or the ruler measures the
 * wrong palette from the next edit on. What a person allowed (`allow`) survives the change.
 * @param {string} root
 * @param {{ id: string, tokensDirs: string[], names: Map<string, string>, wroteBy: string, platform?: string }} now
 * @returns {DesignRecord}
 */
export function refreshDesign(root, { id, tokensDirs, names, wroteBy, platform }) {
  const before = readDesign(root)
  // A quickstart re-applying its own style keeps its own look: its tokens are in no catalogue
  // `tokens.css`, so rebuilding the record from the catalogue would write `source: catalog`,
  // `tokens: null` over the values the build recorded — the same answer tracy-web's `styleRecord` keeps.
  if (before !== null && before.source === 'quickstart' && before.id === id) {
    const kept = { ...before, wroteBy }
    writeDesign(root, kept)
    return kept
  }
  const record = designRecord({
    job: { inspiration: id, platform: platform ?? before?.platform ?? '' },
    ids: new Set([id]),
    root,
    tokensDirs,
    names,
    wroteBy
  })
  const kept = before?.allow
  const next = { ...record, manifestDesign: before?.manifestDesign ?? null, ...(kept ? { allow: kept } : {}) }
  writeDesign(root, next)
  return next
}

/**
 * A `check` stage that also leaves the site's design record behind — only when the check is done,
 * and without changing what the check answered. Every road's `check` goes through here so the
 * record exists before anything is dressed.
 * @param {{ root: string, ids: Set<string>, seeder?: { command: string, args?: string[] } | null, names?: Map<string, string>, putDesign?: (siteKey: string, record: ReturnType<typeof publicRecordOf>) => Promise<unknown>, warn?: (line: string) => void }} deps
 * @param {import('./build.mjs').StageFn} check
 * @returns {import('./build.mjs').StageFn}
 */
export function recordingDesign(deps, check) {
  return async (job) => {
    const answer = await check(job)
    if (answer.status !== 'done') return answer
    let record = null
    try {
      record = designRecord({
        job,
        ids: deps.ids,
        root: deps.root,
        tokensDirs: tokensDirsOf(deps.seeder),
        names: deps.names ?? new Map()
      })
      writeDesign(deps.root, record)
    } catch {
      // The record is a convenience for later readers; a folder that cannot take it does not fail the build.
    }
    const notSent = await sendDesign(deps.putDesign, job.targetSiteKey, record, deps.warn)
    return notSent === null ? answer : withDesignFact(answer, notSent)
  }
}

/**
 * A stage answer carrying why tracy-web did not take the record, as a fact on the stage (kept in
 * `job.json`, never shown): the build is not failed for it, but it is not silent either.
 * @param {import('./build.mjs').StageResult} answer
 * @param {string} notSent
 * @returns {import('./build.mjs').StageResult}
 */
export function withDesignFact(answer, notSent) {
  return { ...answer, facts: { ...answer.facts, designRecord: `not sent: ${notSent}` } }
}

/**
 * Send a record to tracy-web, which owns it (ADR 0023, "Addendum 29/09") — the folder's file is a
 * copy. Through the lane (`putDesign`, the build's own signed door), best effort: tracy-web down is
 * not a failed build, and the next build or `theme.style` records it again. Nothing is sent without
 * a record, a site key or a door.
 *
 * Best effort is not silent (measured 29/09 on dev: a lane answering 409 `NO_ACTOR` to every
 * form-started build, the build green, tracy-web holding nothing): a refusal or a failure is one
 * `[site-design]` line, and its reason is returned for the caller to keep as a fact. `putDesign`
 * answers `{status, code}` (`designVia`); a bare status or nothing is read as the same.
 *
 * What is sent is what tracy-web keeps. For `source: 'quickstart'` these tokens are the original:
 * tracy-web has no copy of a quickstart's values and never regenerates them (ADR 0023, "Addendum
 * 29/09 (afternoon)").
 * @param {((siteKey: string, record: ReturnType<typeof publicRecordOf>) => Promise<unknown>) | undefined} putDesign
 * @param {unknown} siteKey
 * @param {DesignRecord | null} record
 * @param {(line: string) => void} [warn]
 * @returns {Promise<string | null>} why tracy-web did not take it, or null (taken, or nothing to send)
 */
export async function sendDesign(putDesign, siteKey, record, warn = console.warn) {
  if (record === null || typeof siteKey !== 'string' || siteKey === '' || typeof putDesign !== 'function')
    return null
  let notSent = null
  try {
    const answer = /** @type {any} */ (await putDesign(siteKey, publicRecordOf(record)))
    const status = typeof answer === 'number' ? answer : answer?.status
    if (typeof status === 'number' && (status < 200 || status > 299))
      notSent = [String(status), typeof answer?.code === 'string' ? answer.code : ''].join(' ').trim()
  } catch (error) {
    notSent = error instanceof Error ? error.message : String(error)
  }
  if (notSent !== null) warn(`[site-design] build record not sent: ${notSent} ${siteKey}`)
  return notSent
}

/**
 * The part of a record tracy-web keeps: what the site wears, never the folder's own bookkeeping.
 * @param {DesignRecord} record
 */
export function publicRecordOf(record) {
  return {
    id: record.id,
    source: record.source,
    name: record.name,
    platform: record.platform,
    tokens: record.tokens,
    tokensFrom: record.tokensFrom,
    manifestDesign: record.manifestDesign
  }
}

/**
 * Refresh the folder's copy from tracy-web's record. `fetchDesign` answers tracy-web's
 * `{design: … | null}`, or null when tracy-web did not answer. The copy follows a record; it is
 * KEPT when there is no answer, and when tracy-web holds no record yet (a site built before it
 * kept one) — the folder's word is then the only one. What only the folder knows (`allow`,
 * `manifestDesign`) survives.
 * @param {string} root
 * @param {() => Promise<{ design?: any } | null>} fetchDesign
 * @returns {Promise<'pulled' | 'kept'>}
 */
export async function pullDesign(root, fetchDesign) {
  let answer = null
  try {
    answer = await fetchDesign()
  } catch {
    answer = null
  }
  const d = answer && typeof answer === 'object' ? answer.design : undefined
  if (!d || typeof d !== 'object') return 'kept'
  const before = readDesign(root)
  const id = typeof d.id === 'string' ? d.id : null
  /** @type {DesignRecord} */
  const next = {
    schemaVersion: SCHEMA,
    id,
    source: typeof d.source === 'string' ? /** @type {any} */ (d.source) : 'none',
    name: typeof d.name === 'string' ? d.name : null,
    bound: id !== null,
    platform: typeof d.platform === 'string' ? d.platform : (before?.platform ?? ''),
    manifestDesign: before?.manifestDesign ?? null,
    tokens: d.tokens && typeof d.tokens === 'object' ? d.tokens : null,
    tokensFrom: typeof d.tokensFrom === 'string' ? d.tokensFrom : null,
    writtenAt: typeof d.updatedAt === 'string' ? d.updatedAt : new Date().toISOString(),
    wroteBy: 'tracy-web',
    ...(before?.allow ? { allow: before.allow } : {})
  }
  writeDesign(root, next)
  return 'pulled'
}
