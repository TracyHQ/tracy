/**
 * Turning one commit's tree into the reading `/ops/cms` draws. Pure: a tree in, an envelope out.
 *
 * THE RULE THAT SHAPES EVERY FUNCTION HERE: a section that cannot be read says so, names the file
 * it wanted and why it failed, and returns no data. It never returns an empty array. An empty array
 * draws as "there are none", and "there are none" is a claim — on the ref where the capability
 * catalogue does not exist at all, that claim is false and would send somebody to fix the wrong
 * thing.
 *
 * ABSENT IS NOT ONE THING. `packages/…/capabilities.json` is absent on `main-v3` because that ref
 * predates it — `unsupported`. The same file absent on a ref that has the rest of the quickstart
 * work would be `missing`. The difference is decided by evidence in the tree (does the feature's
 * other half exist here?), never by which environment the reader happens to be looking at.
 *
 * 🔒 NOTHING HERE EXECUTES WHAT IT READS. The one place where the honest answer lives inside
 * executable code — the stage arrays — is parsed with a narrow, anchored matcher that FAILS LOUDLY
 * when the shape moves, and is covered by a parity test that runs the real module in this repo and
 * asserts the parser agrees. A parser without that test is a guess wearing a fact's clothes. (The
 * standard question list used to be the second such place; since 15/09 it is data —
 * `questions.json`, tracy-questions/v1 — and is read as data.)
 */
import { CMS, layers, STATUS, section, source } from './schema.mjs'
import { sha256 } from './tree.mjs'

const P = {
  quickstarts: 'packages/fleet/tracy-fleet-operation/scripts/provision/quickstarts.json',
  capabilities: (cms) => `packages/site/tracy-site-build-${cms}/src/host/capabilities.json`,
  stages: (cms) => `packages/site/tracy-site-build-${cms}/src/host/stages.mjs`,
  designs: {
    joomla: 'packages/cms/tracy-joomla-template/src/tpl_tracy/inspirations.json',
    wordpress: 'packages/cms/tracy-wordpress-theme/src/tracy/inspirations.json'
  },
  contractsRoot: 'packages/cms/tracy-joomla-quickstart/contracts',
  modeMatrix: 'config/mode-matrix.json',
  /** dsh ≥ 0.1.7: one `preset-<id>` row per preset in this generated file (`scripts/gen-presets.ts`). */
  presetsFile: 'packages/bundle/tracy-cowork/presets.patch.yml',
  /** dsh ≤ 0.1.6: one folder per preset. Still read, because an older ref still has it. */
  presetsRoot: 'packages/bundle/tracy-cowork/presets',
  presetFor: 'packages/design/tracy-design-inspiration/src/client/preset-for.mjs',
  questions: (cms) => `packages/site/tracy-site-build-${cms}/questions.json`,
  fence: 'packages/tools/tracy-subprocess-docker/src/route.mjs',
  contentContract: 'packages/tools/tracy-subprocess-docker/src/content-contract.mjs'
}

/** Read a file and remember what we read, so the section can prove it. */
async function readSourced(tree, path, sources) {
  const buf = await tree.read(path)
  if (buf === null) return null
  sources.push(source(path, sha256(buf), buf.length))
  return buf.toString('utf8')
}

/** JSON with a reason instead of a stack trace: a truncated file must draw as `error`, not crash. */
function parseJson(raw, path) {
  try {
    return { value: JSON.parse(raw), error: null }
  } catch (e) {
    return {
      value: null,
      error: `${path} did not parse as JSON: ${e instanceof Error ? e.message : String(e)}`
    }
  }
}

// ── bases ────────────────────────────────────────────────────────────────────────────────────

/**
 * The archive a new site is restored from, and the Claude Cowork plugin installed beside it.
 *
 * 🔒 A URL HERE IS A DECLARATION, NOT A PACKAGED FILE. Every artifact carries `packaged: unknown`
 * for exactly that reason: this catalogue proves somebody wrote down a name, a size and a hash. It
 * does not prove the bytes are reachable, and the screen must not let a reader believe otherwise.
 */
export async function extractBases(tree) {
  const sources = []
  const raw = await readSourced(tree, P.quickstarts, sources)
  if (raw === null)
    return section(STATUS.UNSUPPORTED, {
      reason: `No ${P.quickstarts} at this ref — this ref has no declared base quickstart.`,
      sources
    })
  const { value, error } = parseJson(raw, P.quickstarts)
  if (error) return section(STATUS.ERROR, { reason: error, sources })

  const bases = Object.entries(/** @type {Record<string, any>} */ (value)).map(([id, b]) => ({
    id,
    // The CMS this archive restores. Absent means Joomla: every entry predating the WordPress and
    // EmDash quickstarts is a Joomla one, and the fleet reads the same default. Never guessed from
    // the id — `tracy-business/j6` and `tracy-business/emdash` differ by a suffix nobody parses.
    platform: b.platform ?? 'joomla',
    version: b.version ?? null,
    format: b.format ?? null,
    // The template a quickstart IS, when it is one. EmDash ships a whole template per archive, so
    // for that CMS this is what a design catalogue would otherwise list (`extractDesigns`).
    template: b.template
      ? {
          id: b.template.id ?? null,
          label: b.template.label ?? null,
          cmsVersion: b.template.cmsVersion ?? null,
          languages: Array.isArray(b.template.languages) ? b.template.languages : null
        }
      : null,
    contract: b.contract ?? null,
    cowork: b.cowork
      ? {
          file: b.cowork.file ?? null,
          version: b.cowork.version ?? null,
          bytes: b.cowork.bytes ?? null,
          sha256: b.cowork.sha256 ?? null,
          contractFiles: b.cowork.contractFiles ?? null
        }
      : null,
    // Three shapes of archive, one list: the PHP platforms pin `webroot` + `database`, a JPA
    // quickstart pins one `artifact` the fleet splits, and EmDash pins `source` (the packed
    // template an image is built from) + `state` (scrubbed SQLite + uploads). A kind left out here
    // draws as an entry with no files at all — which is what `tracy-base/j6` looked like.
    artifacts: ['webroot', 'database', 'artifact', 'source', 'state']
      .filter((k) => b[k])
      .map((k) => ({
        kind: k,
        file: b[k].file ?? null,
        bytes: b[k].bytes ?? null,
        sha256: b[k].sha256 ?? null,
        // The host this is fetched from, never the signed URL itself.
        host: hostOf(b[k].url)
      })),
    layers: layers({ inRepo: STATUS.OK })
  }))
  return section(STATUS.OK, { data: { bases }, sources })
}

/** The host of a download, kept; the path and any signature, dropped. */
function hostOf(url) {
  if (typeof url !== 'string') return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

// ── capabilities ─────────────────────────────────────────────────────────────────────────────

/** Providers and their ready/pending state, per CMS. Only Joomla has ever had one. */
export async function extractCapabilities(tree) {
  const sources = []
  /** @type {Record<string, any>} */
  const byCms = {}
  for (const cms of CMS) {
    const path = P.capabilities(cms)
    const raw = await readSourced(tree, path, sources)
    if (raw === null) {
      byCms[cms] = {
        status: STATUS.UNSUPPORTED,
        reason: `No capability catalogue at ${path}; this CMS declares no providers at this ref.`,
        providers: null
      }
      continue
    }
    const { value, error } = parseJson(raw, path)
    if (error) {
      byCms[cms] = { status: STATUS.ERROR, reason: error, providers: null }
      continue
    }
    const v = /** @type {Record<string, any>} */ (value)
    byCms[cms] = {
      status: STATUS.OK,
      reason: null,
      schemaVersion: v.schemaVersion ?? null,
      version: v.version ?? null,
      providers: Object.entries(v.providers ?? {}).map(([id, p]) => ({
        id,
        version: p.version ?? null,
        state: p.state ?? null,
        reason: p.reason ?? null,
        recipe: p.recipe ?? null,
        verification: p.verification ?? null,
        artifact: p.artifact ?? null,
        requires: p.requires ?? [],
        platformMajors: p.platformMajors ?? [],
        extensions: p.extensions ?? []
      })),
      capabilities: Object.entries(v.capabilities ?? {}).map(([id, c]) => ({
        id,
        provider: c.provider ?? null
      })),
      artifacts: Object.entries(v.artifacts ?? {}).map(([id, a]) => ({
        id,
        kind: a.kind ?? null,
        version: a.version ?? null,
        release: a.release ?? null,
        bytes: a.bytes ?? null,
        sha256: a.sha256 ?? null,
        host: hostOf(a.url)
      }))
    }
  }
  const anyOk = Object.values(byCms).some((v) => v.status === STATUS.OK)
  return section(anyOk ? STATUS.OK : STATUS.UNSUPPORTED, {
    reason: anyOk ? null : 'No CMS declares a capability catalogue at this ref.',
    data: { byCms },
    sources
  })
}

// ── stages ───────────────────────────────────────────────────────────────────────────────────

/**
 * The pipeline each CMS really runs, read off its own `STAGES` array.
 *
 * 🔒 ANCHORED, NOT SEARCHED. The matcher demands `export const STAGES = Object.freeze([ … ])` on
 * one logical line with string literals inside. A ref that writes it any other way gets `error`
 * naming the file — which is the correct outcome, because a stage list guessed from a file we did
 * not understand is worse than no stage list. gate `infra-contracts` imports the real
 * modules in THIS repo and asserts this parser returns what they export.
 */
const STAGES_RE = /export\s+const\s+STAGES\s*=\s*Object\.freeze\(\s*\[([^\]]*)\]\s*\)/
const STRING_RE = /'([^']*)'|"([^"]*)"/g

export function parseStages(sourceText) {
  const m = STAGES_RE.exec(sourceText)
  if (!m) return null
  const out = []
  for (const s of m[1].matchAll(STRING_RE)) out.push(s[1] ?? s[2])
  return out.length > 0 ? out : null
}

export async function extractStages(tree) {
  const sources = []
  /** @type {Record<string, any>} */
  const byCms = {}
  for (const cms of CMS) {
    const path = P.stages(cms)
    const raw = await readSourced(tree, path, sources)
    if (raw === null) {
      byCms[cms] = {
        status: STATUS.UNSUPPORTED,
        reason: `No ${path} — this CMS has no build pipeline at this ref. Not an empty pipeline: none.`,
        stages: null
      }
      continue
    }
    const stages = parseStages(raw)
    if (stages === null) {
      byCms[cms] = {
        status: STATUS.ERROR,
        reason: `${path} has no readable \`export const STAGES = Object.freeze([...])\`; the pipeline is not being guessed.`,
        stages: null
      }
      continue
    }
    byCms[cms] = { status: STATUS.OK, reason: null, stages, path }
  }
  const anyOk = Object.values(byCms).some((v) => v.status === STATUS.OK)
  return section(anyOk ? STATUS.OK : STATUS.UNSUPPORTED, {
    reason: anyOk ? null : 'No CMS has a build pipeline at this ref.',
    data: { byCms },
    sources
  })
}

// ── designs ──────────────────────────────────────────────────────────────────────────────────

/**
 * The design-system catalogue, per CMS theme. The count is counted, never quoted from a doc.
 *
 * TWO SHAPES OF ANSWER, AND THE SECOND IS NOT A PLACEHOLDER. Joomla and WordPress carry ONE theme
 * parameterised by 152 design systems, so their catalogue is a generated `inspirations.json`.
 * EmDash carries no such theme: a site is one template wearing one look (10/09), so what a
 * reader picks there is a TEMPLATE, and every template is a base quickstart of its own. So for a
 * CMS with no theme package the catalogue falls back to the templates its base quickstarts declare
 * — the same archive the Default build base names — and says so in `kind`. Drawing "there are none"
 * for EmDash would be false: there is exactly one, and it is the one a new site starts from.
 */
export async function extractDesigns(tree) {
  const sources = []
  /** @type {Record<string, any>} */
  const byCms = {}
  const templates = await templatesByPlatform(tree, sources)
  for (const cms of CMS) {
    const path = P.designs[cms]
    if (!path) {
      const mine = templates.byPlatform[cms] ?? []
      byCms[cms] = mine.length
        ? {
            status: STATUS.OK,
            reason: `No theme package for this CMS: what a build picks here is a TEMPLATE, one base quickstart each (${P.quickstarts}), not a design system carried by a theme.`,
            path: P.quickstarts,
            schemaVersion: null,
            kind: 'template',
            count: mine.length,
            systems: mine
          }
        : {
            status: templates.error ? STATUS.ERROR : STATUS.UNSUPPORTED,
            reason:
              templates.error ??
              `No theme package for this CMS, and no base quickstart in ${P.quickstarts} declares a template for it, so there is nothing to pick from at this ref.`,
            systems: null,
            count: null
          }
      continue
    }
    const raw = await readSourced(tree, path, sources)
    if (raw === null) {
      byCms[cms] = {
        status: STATUS.MISSING,
        reason: `Expected ${path}, not found at this ref.`,
        systems: null,
        count: null
      }
      continue
    }
    const { value, error } = parseJson(raw, path)
    if (error) {
      byCms[cms] = { status: STATUS.ERROR, reason: error, systems: null, count: null }
      continue
    }
    const systems = Object.entries(/** @type {any} */ (value).systems ?? {}).map(([id, s]) => ({
      id,
      name: s.name ?? id,
      category: s.category ?? null,
      dark: s.dark ?? null
    }))
    byCms[cms] = {
      status: STATUS.OK,
      reason: null,
      path,
      schemaVersion: /** @type {any} */ (value).schemaVersion ?? null,
      kind: 'design-system',
      count: systems.length,
      systems
    }
  }
  return section(STATUS.OK, { data: { byCms }, sources })
}

/**
 * Templates declared by base quickstarts, grouped by the platform each restores.
 *
 * Read from the same file `extractBases` reads, and deliberately not passed between the two: each
 * section proves its own reading with its own `sources` entry, so a snapshot stays readable one
 * section at a time. A catalogue that will not parse is reported, never treated as "none".
 * @returns {Promise<{ byPlatform: Record<string, any[]>, error: string | null }>}
 */
async function templatesByPlatform(tree, sources) {
  const raw = await readSourced(tree, P.quickstarts, sources)
  if (raw === null) return { byPlatform: {}, error: null }
  const { value, error } = parseJson(raw, P.quickstarts)
  if (error) return { byPlatform: {}, error }
  /** @type {Record<string, any[]>} */
  const byPlatform = {}
  for (const [id, b] of Object.entries(/** @type {Record<string, any>} */ (value))) {
    if (!b || typeof b !== 'object' || !b.template) continue
    const platform = b.platform ?? 'joomla'
    ;(byPlatform[platform] ??= []).push({
      id: b.template.id ?? id,
      name: b.template.label ?? b.template.id ?? id,
      category: null,
      dark: null,
      quickstart: id,
      version: b.version ?? null
    })
  }
  return { byPlatform, error: null }
}

// ── contracts ────────────────────────────────────────────────────────────────────────────────

/**
 * Every contract profile in the tree, found by walking rather than by knowing the names.
 *
 * A profile is any directory under the contracts root holding a `manifest.json`. Walking is the
 * point: the second profile (`tracy-airbnb/j6`) arrives on a feature branch, and a reader that
 * knew only `tracy-apple` would report it missing on the very ref that added it.
 */
export async function extractContracts(tree) {
  const sources = []
  const all = await tree.listAll(P.contractsRoot)
  if (all.length === 0)
    return section(STATUS.UNSUPPORTED, {
      reason: `No ${P.contractsRoot}/ at this ref — no quickstart content/display contract is published here.`,
      sources
    })

  const manifests = all.filter((p) => p.endsWith('/manifest.json'))
  const profiles = []
  for (const manifestPath of manifests) {
    const dir = manifestPath.slice(0, -'/manifest.json'.length)
    const id = dir.slice(P.contractsRoot.length + 1)
    const raw = await readSourced(tree, manifestPath, sources)
    const parsed =
      raw === null
        ? { value: null, error: `${manifestPath} vanished mid-read` }
        : parseJson(raw, manifestPath)
    if (parsed.error) {
      profiles.push({ id, status: STATUS.ERROR, reason: parsed.error })
      continue
    }
    const manifest = /** @type {any} */ (parsed.value)
    const files = []
    for (const name of ['content-map.json', 'presentation-lock.json', 'multilingual-map.json']) {
      const buf = await tree.read(`${dir}/${name}`)
      if (buf === null) continue
      files.push({ name, bytes: buf.length, sha256: sha256(buf) })
      sources.push(source(`${dir}/${name}`, sha256(buf), buf.length))
    }
    const counts = await entityCounts(tree, `${dir}/content-map.json`)
    const lock = await lockSample(tree, `${dir}/presentation-lock.json`)
    profiles.push({
      id,
      status: STATUS.OK,
      reason: null,
      dir,
      mode: manifest.mode ?? null,
      platform: manifest.platform ?? null,
      template: manifest.template ?? null,
      coworkContractVersion: manifest.coworkContractVersion ?? null,
      quickstart: manifest.quickstart
        ? {
            release: manifest.quickstart.release ?? null,
            version: manifest.quickstart.version ?? null,
            platformVersion: manifest.quickstart.platformVersion ?? null,
            coworkVersion: manifest.quickstart.coworkVersion ?? null,
            writeDoor: manifest.quickstart.writeDoor ?? null
          }
        : null,
      files,
      entityCounts: counts.counts,
      entityTotal: counts.total,
      coverage: counts.error,
      lock
    })
  }
  return section(STATUS.OK, { data: { root: P.contractsRoot, profiles }, sources })
}

/**
 * How many entities of each kind a content map holds.
 *
 * Counted from the file, not quoted: the number is the one claim on the contract screen a reader
 * is most likely to take as gospel, and a stale constant would be indistinguishable from a true one.
 */
async function entityCounts(tree, path) {
  const raw = await tree.text(path)
  if (raw === null) return { counts: null, total: null, error: `No ${path}; entity coverage unknown.` }
  const parsed = parseJson(raw, path)
  if (parsed.error) return { counts: null, total: null, error: parsed.error }
  const entities = /** @type {any} */ (parsed.value).entities
  if (!Array.isArray(entities)) return { counts: null, total: null, error: `${path} has no entities array.` }
  /** @type {Record<string, number>} */
  const counts = {}
  for (const e of entities) counts[e?.kind ?? 'unknown'] = (counts[e?.kind ?? 'unknown'] ?? 0) + 1
  return { counts, total: entities.length, error: null }
}

/**
 * A bounded look inside the presentation lock, plus the real total.
 *
 * 🔒 BOUNDED AT GENERATION, NOT AT DISPLAY. The lock is 1.1 MB of raw Joomla records; shipping it
 * to a browser to show twenty rows would put a customer's whole site structure in a page that only
 * needs a sample. The total is the true count, so "25 of 197" is never mistaken for "197".
 */
/**
 * 🔒 SAMPLED ACROSS KINDS, NOT OFF THE TOP. The first version took the first 25 keys, and the first
 * 25 keys of a real lock are all `category-*` — so the screen showed a table whose Position and
 * Access columns were entirely `—`, on a contract whose whole point is that modules have fixed
 * positions and access levels. A sample that systematically excludes the interesting rows is worse
 * than a smaller one that does not.
 */
const LOCK_PER_KIND = 6
const LOCK_SAMPLE = 36

async function lockSample(tree, path) {
  const raw = await tree.text(path)
  if (raw === null)
    return {
      status: STATUS.MISSING,
      reason: `No ${path}; nothing is locked, or nothing says so.`,
      rows: null,
      total: null
    }
  const parsed = parseJson(raw, path)
  if (parsed.error) return { status: STATUS.ERROR, reason: parsed.error, rows: null, total: null }
  const entities = /** @type {any} */ (parsed.value).entities
  if (!entities || typeof entities !== 'object')
    return { status: STATUS.ERROR, reason: `${path} has no entities object.`, rows: null, total: null }
  const keys = Object.keys(entities)
  /** `module-169` -> `module`; anything unhyphenated is its own kind. */
  const kindOf = (k) => (k.includes('-') ? k.slice(0, k.lastIndexOf('-')) : k)
  const taken = new Map()
  const picked = []
  for (const key of keys) {
    const kind = kindOf(key)
    const n = taken.get(kind) ?? 0
    if (n >= LOCK_PER_KIND || picked.length >= LOCK_SAMPLE) continue
    taken.set(kind, n + 1)
    picked.push(key)
  }
  const rows = picked.map((key) => {
    const e = entities[key] ?? {}
    return {
      key,
      title: e.title ?? null,
      module: e.module ?? null,
      position: e.position ?? null,
      published: e.published ?? null,
      access: e.access ?? null,
      showtitle: e.showtitle ?? null,
      ordering: e.ordering ?? null,
      language: e.language ?? null,
      // `params` is a JSON string of arbitrary length; the screen needs to know it EXISTS and how
      // big it is, not to carry a site's whole template configuration into a browser.
      paramsBytes: typeof e.params === 'string' ? e.params.length : null
    }
  })
  return {
    status: STATUS.OK,
    reason: null,
    rows,
    total: keys.length,
    sampled: rows.length,
    sampledBy: `up to ${LOCK_PER_KIND} entries of each kind`
  }
}

// ── presets ──────────────────────────────────────────────────────────────────────────────────

/** The matrix people write, and the presets generated from it. */
export async function extractPresets(tree) {
  const sources = []
  const raw = await readSourced(tree, P.modeMatrix, sources)
  if (raw === null)
    return section(STATUS.MISSING, { reason: `Expected ${P.modeMatrix}, not found at this ref.`, sources })
  const { value, error } = parseJson(raw, P.modeMatrix)
  if (error) return section(STATUS.ERROR, { reason: error, sources })
  const m = /** @type {any} */ (value)

  const rowsRaw = await readSourced(tree, P.presetsFile, sources)
  const presets = rowsRaw === null ? await presetFolders(tree) : presetRows(rowsRaw)

  /**
   * 🔒 THE ARRAYS ARE CALLED `tools` AND `skills` IN THE MATRIX — `toolRows`/`skillRows` are what
   * the harness renames them to when it generates its own module. Reading the generated names off
   * the source file returns nothing, and "nothing" draws as a matrix with no rows: a screen that
   * confidently reports an agent carries no tools. So both spellings are accepted and an absence
   * of both is an error, never an empty list. (Measured: the first run of this extractor said
   * "0 tool rows" against a matrix holding 26.)
   */
  const toolRows = m.tools ?? m.toolRows
  const skillRows = m.skills ?? m.skillRows
  if (!Array.isArray(toolRows) || !Array.isArray(skillRows))
    return section(STATUS.ERROR, {
      reason: `${P.modeMatrix} has no tool/skill row arrays (looked for \`tools\`/\`skills\` and \`toolRows\`/\`skillRows\`).`,
      sources
    })

  /**
   * The rule that decides which preset a Build press opens its session under.
   *
   * 🔒 READ FROM THE REF, NOT RE-IMPLEMENTED. The screen lets somebody try the rule, and a screen
   * that answers with a copy of the policy is a screen that will keep answering after the policy
   * changes. So the two lists and the fallback role come out of `preset-for.mjs` AT THIS COMMIT;
   * a ref whose shape moved gets `null` and the panel says the rule is not readable rather than
   * guessing. gate `infra-contracts` runs the real module and asserts the extracted rule
   * reproduces it for every input.
   */
  const resolverRaw = await readSourced(tree, P.presetFor, sources)
  const resolver = resolverRaw === null ? null : parseResolver(resolverRaw)

  return section(STATUS.OK, {
    data: {
      resolver: resolver
        ? { path: P.presetFor, ...resolver }
        : {
            path: P.presetFor,
            unreadable:
              resolverRaw === null
                ? `No ${P.presetFor} at this ref.`
                : `${P.presetFor} has no readable ROLES/PLATFORMS lists; the rule is not being guessed.`
          },
      roles: (m.roles ?? []).map((r) => ({ id: r.id, label: r.label, description: r.description ?? null })),
      platforms: (m.platforms ?? []).map((p) => ({ id: p.id, label: p.label, letter: p.letter ?? null })),
      toolRows: toolRows.map(trimRow),
      skillRows: skillRows.map(trimRow),
      personas: m.personas ?? {},
      overlays: m.overlays ?? {},
      presets,
      presetsRoot: rowsRaw === null ? P.presetsRoot : P.presetsFile
    },
    sources
  })
}

/**
 * `const ROLES = [...]`, `const PLATFORMS = [...]` and the `?? 'fallback'` inside `presetFor`.
 *
 * Anchored on all three: a file that lost any one of them yields null, because a rule bench driven
 * by two-thirds of a rule answers confidently and wrongly.
 */
function parseResolver(text) {
  const list = (name) => {
    const m = new RegExp(`const\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]`).exec(text)
    return m ? [...m[1].matchAll(STRING_RE)].map((v) => v[1] ?? v[2]) : null
  }
  const roles = list('ROLES')
  const platforms = list('PLATFORMS')
  const body = between(text, 'export function presetFor(', '\n}')
  const fallback = body === null ? null : (/\?\?\s*'([^']+)'/.exec(body)?.[1] ?? null)
  if (!roles || !platforms || !fallback) return null
  return { roles, platforms, fallbackRole: fallback }
}

/**
 * The preset rows of `presets.patch.yml` (dsh ≥ 0.1.7), one entry each. The file has a fixed shape
 * (`scripts/gen-presets.ts`): every preset is a `    - id: preset-<id>` row under one `insert`, and
 * its text runs to the next such row. `path` is what the screen shows as the file it excerpts.
 */
function presetRows(text) {
  return text
    .split(/^(?= {4}- id: preset-)/m)
    .slice(1)
    .map((row) => {
      const rowId = /^ {4}- id: (\S+)/.exec(row)?.[1] ?? ''
      const id = /^ {8}id: (\S+)$/m.exec(row)?.[1] ?? rowId.slice('preset-'.length)
      const buf = Buffer.from(row)
      return {
        id,
        dir: null,
        path: `${P.presetsFile}#${rowId}`,
        /** The first lines of the row, and how many there are — enough to recognise the preset. */
        cordisExcerpt: excerpt(row.trimEnd()),
        files: [{ name: `presets.patch.yml (${rowId})`, bytes: buf.length, sha256: sha256(buf) }]
      }
    })
}

/** The preset folders of dsh ≤ 0.1.6 (`presets/<id>/{preset.yml,agent.cordis.yml}`). */
async function presetFolders(tree) {
  const dirs = (await tree.list(P.presetsRoot)).filter((p) => !p.endsWith('.md'))
  const presets = []
  for (const dir of dirs) {
    const id = dir.slice(P.presetsRoot.length + 1)
    const cordis = await tree.read(`${dir}/agent.cordis.yml`)
    const meta = await tree.read(`${dir}/preset.yml`)
    if (cordis === null && meta === null) continue
    presets.push({
      id,
      dir,
      path: `${dir}/agent.cordis.yml`,
      /**
       * The first lines of the generated file, and how many there are. Enough to recognise the
       * preset; not the whole of every persona prompt multiplied by twelve.
       */
      cordisExcerpt: cordis === null ? null : excerpt(cordis.toString('utf8')),
      files: [
        ...(meta ? [{ name: 'preset.yml', bytes: meta.length, sha256: sha256(meta) }] : []),
        ...(cordis ? [{ name: 'agent.cordis.yml', bytes: cordis.length, sha256: sha256(cordis) }] : [])
      ]
    })
  }
  return presets
}

const EXCERPT_LINES = 40

/** First lines plus the true total, so an excerpt can never be mistaken for a whole file. */
function excerpt(text) {
  const lines = text.split('\n')
  return {
    lines: lines.slice(0, EXCERPT_LINES),
    totalLines: lines.length,
    truncated: lines.length > EXCERPT_LINES
  }
}

/** Only the fields the screen draws. `note` is an internal aside and stays out of the API. */
function trimRow(r) {
  return {
    id: r.id,
    group: r.group ?? null,
    tools: r.tools ?? null,
    roles: r.roles ?? {},
    platforms: r.platforms ?? {}
  }
}

// ── questions ────────────────────────────────────────────────────────────────────────────────

/**
 * The questions a customer answers, read off the form that asks them.
 *
 * 🔒 PARSED FROM THE FORM, NOT RETYPED. Retyping is how a screen ends up describing last month's
 * form. The matcher is anchored on `standardQuestions(` and on the two literals beside it, and it
 * resolves each `t('form.x')` against the dictionary in the same package so the labels are the ones
 * a customer sees. Any anchor that moves produces `error` with the file named — never a partial
 * list, which would read as a complete one.
 */
export async function extractQuestions(tree) {
  const sources = []
  /** @type {Record<string, any>} */
  const byCms = {}
  for (const cms of CMS) {
    const path = P.questions(cms)
    const raw = await readSourced(tree, path, sources)
    if (raw === null) {
      byCms[cms] = {
        status: STATUS.MISSING,
        reason: `Expected ${path}, not found at this ref — every Build plugin ships its CMS's default questionnaire.`,
        path,
        questions: null
      }
      continue
    }
    const { value, error } = parseJson(raw, path)
    if (error) {
      byCms[cms] = { status: STATUS.ERROR, reason: error, path, questions: null }
      continue
    }
    byCms[cms] = { status: STATUS.OK, reason: null, path, ...summarise(value) }
  }

  // The questionnaires quickstarts declare in the catalogue — the same bytes the create door and
  // the fleet read. A quickstart with none falls back to its CMS's default; said per entry, so a
  // reader never has to infer it from an absence.
  /** @type {any[]} */
  const byQuickstart = []
  const catalogueRaw = await readSourced(tree, P.quickstarts, sources)
  if (catalogueRaw !== null) {
    const { value, error } = parseJson(catalogueRaw, P.quickstarts)
    if (!error)
      for (const [id, entry] of Object.entries(/** @type {Record<string, any>} */ (value))) {
        const platform = entry?.platform ?? 'joomla'
        byQuickstart.push(
          entry?.questions
            ? { id, platform, own: true, ...summarise(entry.questions) }
            : { id, platform, own: false, fallsBackTo: platform }
        )
      }
  }

  return section(STATUS.OK, {
    data: {
      schema: 'tracy-questions/v1',
      byCms,
      byQuickstart,
      /**
       * Who reads an answer — the `feeds` vocabulary a question may name. Read from the file, not
       * from the module that defines it: the extractor never executes what it reads.
       */
      feeds: FEEDS_DOC
    },
    sources
  })
}

/** The readers a `feeds` entry may name, with where each lives — the same list `questions.mjs` holds. */
const FEEDS_DOC = Object.freeze({
  agent: "the brief the customer's message carries into the chat",
  'site.name': 'the site label — POST /api/sites reads answers.name',
  'copy.about': "the copy stage's one line about the business",
  'copy.tone': "the copy stage's tone",
  'seed.pages': "the seed stage's page list",
  'site.languages': 'the languages the site is built in'
})

/** One questionnaire, drawn in English for the screen, every language it ships named. */
function summarise(doc) {
  const questions = Array.isArray(doc?.questions) ? doc.questions : []
  return {
    owner: doc?.owner ?? null,
    schemaVersion: doc?.schemaVersion ?? null,
    languages: Array.isArray(doc?.languages) ? doc.languages : [],
    count: questions.length,
    questions: questions.map((q) => ({
      id: q?.id ?? null,
      kind: q?.kind ?? null,
      label: q?.label?.en ?? null,
      hint: q?.hint?.en ?? null,
      options: Array.isArray(q?.options) ? q.options : null,
      feeds: Array.isArray(q?.feeds) ? q.feeds : []
    }))
  }
}

function between(text, start, end) {
  const i = text.indexOf(start)
  if (i < 0) return null
  const j = text.indexOf(end, i)
  return j < 0 ? text.slice(i) : text.slice(i, j)
}

// ── tools ────────────────────────────────────────────────────────────────────────────────────

/**
 * What stands between an agent and a customer's site.
 *
 * Two tables, both literals, both parsed: the argument fence (which arguments of which tool are
 * treated as paths) and the content-contract allowlist (which tools a site under a contract may
 * call at all). The refusal sentences are quoted from the source so the screen shows the words the
 * agent actually receives, not a paraphrase of them.
 */
export async function extractTools(tree) {
  const sources = []
  const fenceRaw = await readSourced(tree, P.fence, sources)
  const ccRaw = await readSourced(tree, P.contentContract, sources)
  if (fenceRaw === null && ccRaw === null)
    return section(STATUS.UNSUPPORTED, {
      reason: `Neither ${P.fence} nor ${P.contentContract} exists at this ref; no tool boundary is declared here.`,
      sources
    })

  const fence = fenceRaw === null ? null : parseFence(fenceRaw)
  const cc = ccRaw === null ? null : parseContentContract(ccRaw)
  if (fenceRaw !== null && fence === null)
    return section(STATUS.ERROR, {
      reason: `${P.fence} has no readable \`FS_TOOL_ARGS\` table; the fence is not being guessed.`,
      sources
    })

  return section(STATUS.OK, {
    data: {
      fence: fence ? { path: P.fence, tools: fence } : null,
      contentContract: cc ? { path: P.contentContract, ...cc } : null
    },
    sources
  })
}

/** `read: { paths: ['file_path'], content: [] },` inside `FS_TOOL_ARGS`. */
function parseFence(text) {
  const body = between(text, 'export const FS_TOOL_ARGS = Object.freeze({', '\n})')
  if (body === null) return null
  const tools = []
  for (const m of body.matchAll(/(\w+):\s*\{([\s\S]*?)\}/g)) {
    const [, name, inner] = m
    const paths = /paths:\s*\[([^\]]*)\]/.exec(inner)?.[1] ?? ''
    const content = /content:\s*\[([^\]]*)\]/.exec(inner)?.[1] ?? ''
    tools.push({
      name,
      paths: [...paths.matchAll(STRING_RE)].map((s) => s[1] ?? s[2]),
      content: [...content.matchAll(STRING_RE)].map((s) => s[1] ?? s[2])
    })
  }
  return tools.length > 0 ? tools : null
}

/**
 * The two allowlists and the two refusal sentences, taken from the functions that return them.
 *
 * 🔒 ANCHORED ON THE FUNCTION, NOT ON "A LONG QUOTED STRING". The first version collected every
 * single-quoted run of 40+ characters in the file, which is a sentence-shaped thing to look for and
 * catches prose in comments too — an apostrophe in "the session's site" opens a match that runs to
 * the next quote hundreds of characters later. Measured 12/09 on the QA cluster: the panel headed
 * "What an agent is told when it is refused" showed a fragment of `contentContractProtected`'s
 * source instead of the refusal. A reader would have taken that for the message an agent receives.
 *
 * So each sentence is read out of the one function that returns it, and a function whose shape
 * moved yields `null` — which the screen shows as "not readable at this ref" rather than as prose.
 */
function parseContentContract(text) {
  const set = (name) => {
    const m = new RegExp(`const\\s+${name}\\s*=\\s*new Set\\(\\[([^\\]]*)\\]\\)`).exec(text)
    return m ? [...m[1].matchAll(STRING_RE)].map((s) => s[1] ?? s[2]) : null
  }
  /** The last string literal inside one exported function — the branch that explains the refusal. */
  const refusalIn = (fn) => {
    const body = between(text, `export function ${fn}(`, '\n}')
    if (body === null) return null
    const found = [...body.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"))
    const sentence = found.filter((v) => v.length >= 30).at(-1)
    return sentence ?? null
  }
  return {
    fileTools: set('FILE_TOOLS'),
    doorTools: set('DOOR_TOOLS'),
    toolRefusal: refusalIn('contentContractToolReason'),
    pathRefusal: refusalIn('contentContractPathReason'),
    draftsOnly: /resolve\(siteRoot,\s*'docs',\s*'agents'\)/.test(text),
    // Since 26/09/2026 a contract locks nothing but a direct database write: the refusal is one
    // literal, `REASON`. Older refs have none and the fields above instead.
    dbWriteRefusal: /const\s+REASON\s*=\s*"((?:[^"\\\n]|\\.)*)"/.exec(text)?.[1] ?? null
  }
}

// ── the whole thing ──────────────────────────────────────────────────────────────────────────

/**
 * Every section, from one tree.
 *
 * A thrown extractor is a bug in this file, not a property of the ref — so each is caught and
 * turned into an `error` section naming itself. One broken reader must not cost the other seven.
 */
export async function extractAll(tree) {
  const jobs = {
    bases: extractBases,
    capabilities: extractCapabilities,
    stages: extractStages,
    designs: extractDesigns,
    contracts: extractContracts,
    presets: extractPresets,
    questions: extractQuestions,
    tools: extractTools
  }
  /** @type {Record<string, any>} */
  const sections = {}
  for (const [key, fn] of Object.entries(jobs)) {
    try {
      sections[key] = await fn(tree)
    } catch (e) {
      sections[key] = section(STATUS.ERROR, {
        reason: `extractor "${key}" threw: ${e instanceof Error ? e.message : String(e)}`
      })
    }
  }
  return sections
}
