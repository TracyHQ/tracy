/**
 * What a quickstart can be asked about — read from what its release DECLARES, with provenance.
 *
 * Admin attention and the brief bindings do not look at a site. They look at this
 * snapshot (the questionnaire generator that first read it was removed 10/10/2026): the pages, blocks, fields, forms and languages a release carries, each tagged with the
 * source it was read from, the evidence that source gives, what a build may DO with it, and what
 * it MEANS when a checked rule can say so. Everything the reader could not resolve is listed
 * under `completeness.unresolved`, by name, so the generator and the administrator see the same
 * gap instead of a guessed number of pages.
 *
 * 🔒 DECLARED IS NOT OBSERVED, AND NEITHER IS WORKING. A menu item proves a route exists in the
 * archive; it does not prove a module renders on every viewport, and a slot whose sample says
 * "Book now" proves a link, not a booking system. So every capability carries three separate
 * readings — `evidence` (declared | observed | inferred | unknown), `can` (what a build may do
 * with it) and `works` (ui / backend: declared | unknown) — and a role (`meaning`) only when a
 * rule this file spells out matched the label. Nothing here upgrades a hint into a promise.
 *
 * 🔒 ONE READER, THREE ADAPTERS, NO TEMPLATE NAMED. Joomla reads the contract profile the
 * release is sealed by (`contracts.js`); WordPress reads its (small) content map; EmDash reads the
 * template's personalize map, site model and artifact card. `tracy-business`, Northgate, a slot
 * id — none is spelled here. A new quickstart with the same kind of files is read the same way.
 *
 * 🔒 THE SERVER RESOLVES THE SOURCES. The caller names a release; this file opens files under
 * directories THIS process shipped with (the image's `src/contracts`, `src/emdash-templates`, or
 * the checkout's packages). It never opens a path, URL or query somebody typed.
 *
 * The snapshot hashes to its content (`canonicalJson`, `readAt` excluded), and that hash is what a
 * generated set is later held to: a release re-cut with different files is a different snapshot.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { contractFor, readContracts } from './contracts.js'
import { canonicalJson, CONSUMERS } from './questions-schema.mjs'

export const CAPABILITIES_SCHEMA = 'tracy-capabilities/v1'
/** Bump when the reader's OUTPUT for the same inputs changes — it is part of the cache key. */
export const READER_VERSION = 2

/** Where the image puts EmDash template metadata (Dockerfile COPY); a checkout reads the packages. */
const EMDASH_IN_IMAGE = fileURLToPath(new URL('../emdash-templates', import.meta.url))
const EMDASH_IN_CHECKOUT = fileURLToPath(new URL('../../../../packages/cms', import.meta.url))
const EMDASH_FLEET_PERSONALIZE = fileURLToPath(
  new URL(
    '../../../../packages/fleet/tracy-fleet-operation/scripts/provision/emdash/personalize',
    import.meta.url
  )
)

const sha256 = (text) => createHash('sha256').update(text).digest('hex')

/**
 * What a block is FOR, decided by a rule on its label — and only then. The rule is a word list;
 * a label that matches none keeps `role: null, by: 'unknown'`. A model may suggest a role for
 * those, but its suggestion is recorded as `by: 'model'` and never turns into a write or a promise.
 */
const ROLE_RULES = [
  ['hero', /\bhero\b/i],
  // Before `pricing` and `testimonials`: a "Quote CTA" asks for a price quote, it is not a review.
  ['cta', /\b(cta|call to action|call-to-action)\b/i],
  ['pricing', /\b(pricing|price|plans?)\b/i],
  ['testimonials', /\b(testimonial|review)s?\b/i],
  ['team', /\b(team|staff|people)\b/i],
  ['contact', /\b(contact|address|phone|email)s?\b/i],
  ['faq', /\bfaq\b/i],
  ['services', /\bservices?\b/i],
  ['projects', /\b(project|portfolio|case stud)/i],
  ['news', /\b(news|blog|post|article)s?\b/i],
  ['gallery', /\b(gallery|photo)s?\b/i],
  ['about', /\babout\b/i],
  ['stats', /\b(stat|statistic|number|counter)s?\b/i],
  ['clients', /\b(client|partner|brand|logo)s?\b/i],
  ['navigation', /\b(menu|nav|breadcrumb|topbar|footer|header)\b/i],
  ['search', /\bsearch\b/i],
  ['language', /\blanguage\b/i]
]

/** `{ role, by }` for a label, by the rules above. */
export function roleOf(label) {
  if (typeof label !== 'string') return { role: null, by: 'unknown' }
  for (const [role, re] of ROLE_RULES) if (re.test(label)) return { role, by: 'rule' }
  return { role: null, by: 'unknown' }
}

/**
 * Which consumers a build of this platform actually reads — by the stage code that exists today.
 * The file references are the readers; change them and this table lies.
 *
 *   joomla / wordpress: `stages-shared.mjs` copy stage reads about/tone; seed stage reads pages
 *                       ONLY when no contract binds the site (the seeder writes into the quickstart's
 *                       own pages, the content recommendation of ADR 0022);
 *                       the language stage of each plugin reads languages.
 *   emdash:             `tracy-site-build-emdash/src/host/stages.mjs` has check · personalize ·
 *                       shot — no copy stage, no seed stage. Answers reach the site through the
 *                       template's personalize map (`template`), which also reads languages.
 */
function consumersFor(platform, { sealed, personalize, multilingual, pageList }) {
  const rows = []
  const add = (id, available, why) => rows.push({ id, reads: CONSUMERS[id].reads, available, why })
  add('agent', true, 'the brief the agent reads (brief.json answers, and the customer’s message)')
  add('site.name', true, 'the site label, read by the create door')
  // The seven default questions (#1013): pictures go through the brand step on every CMS, and the
  // Pages question offers the release's own page list, so it feeds nothing without one.
  add('site.logo', true, 'the brand step writes the logo after the words (brief-engines/brand.js)')
  add('site.favicon', true, 'the brand step writes the favicon after the words (brief-engines/brand.js)')
  add(
    'site.pages',
    pageList,
    pageList
      ? 'the engines hide the pages of tracy_site_pages.json left unticked'
      : 'this release ships no tracy_site_pages.json, so every page is kept'
  )
  if (platform === 'joomla' || platform === 'wordpress') {
    add('copy.about', true, 'the copy stage prompt (stages-shared.mjs)')
    add('copy.tone', true, 'the copy stage prompt (stages-shared.mjs)')
    add(
      'seed.pages',
      !sealed,
      sealed
        ? // ⚠ `why` is inside the snapshot: this rewording (ADR 0022, 26/09/2026) changes the
          // capability hash of every Joomla/WordPress release with a contract, so a questionnaire
          // generated before it is STALE_SET when an administrator chooses it again (a set already
          // chosen keeps serving). Regenerate those sets from /ops.
          "the quickstart's content map fills its own pages; the build adds or removes none"
        : 'the seed stage builds the pages asked for'
    )
    // 🔒 NOT A CONSTANT. It read `true` for every Joomla release, so `ja_kinetic` — whose contract has
    // no multilingual profile, so the Claude Cowork plugin refuses a second language — was offered 53 of them
    // (measured 23/09/2026). WordPress keeps its seeder locales; Joomla needs the profile.
    if (platform === 'joomla')
      add(
        'site.languages',
        sealed,
        !sealed
          ? 'an unsealed quickstart skips the language stage; the agent adds a language in the chat'
          : multilingual
            ? 'the joomla language stage derives one edition per language from the source edition'
            : 'one language only: this release has no multilingual profile, so the site is built in the one language chosen — the seed writes in it and the language stage makes it the default for the site and the administrator'
      )
    else add('site.languages', true, `the ${platform} language stage installs the languages asked for`)
    add('template', false, 'no personalize map on this platform')
  } else if (platform === 'emdash') {
    add('copy.about', false, 'EmDash has no copy stage; `about` reaches the site through the template map')
    add('copy.tone', false, 'EmDash has no copy stage')
    add('seed.pages', false, 'EmDash has no seed stage; pages come with the template')
    add(
      'site.languages',
      personalize,
      personalize ? 'the personalize step keeps the locales asked for' : 'no personalize map to read them'
    )
    add(
      'template',
      personalize,
      personalize
        ? 'answers by id into the fields seed/personalize.json names'
        : 'this release ships no personalize map'
    )
  }
  return rows
}

/** The `languages` question of a questionnaire, when it has one — its options are installable tags. */
function languagesFrom(doc) {
  const q = doc?.questions?.find((x) => x.kind === 'languages' || x.id === 'languages')
  return Array.isArray(q?.options) ? q.options : null
}

/** A source row: what was read, where from, and the fingerprint of the bytes. */
function source(sources, kind, ref, text) {
  sources.push({ kind, ref, sha256: text === null ? null : sha256(text), evidence: 'declared' })
  return sources.length - 1
}

/** `page:` `block:` `slot:` keys are slugs of what the file named; nothing is renamed. */
const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// ── Joomla ──────────────────────────────────────────────────────────────────────────────────────

function readJoomla({ release, contracts, capabilities, sources, unresolved }) {
  const index = readContracts(contracts)
  const contract = contractFor(index, release.tag, release.setting?.version)
  if (!contract) {
    unresolved.push({
      what: 'contract profile',
      why: `no profile seals ${release.tag}@${release.setting?.version ?? '?'}; the site is installed as released and nothing declares its pages or slots`
    })
    return { sealed: false, pages: null, slots: null }
  }
  const dir = contract.dir
  const read = (name) => {
    const at = path.join(dir, name)
    return existsSync(at) ? readFileSync(at, 'utf8') : null
  }
  const manifestText = read('manifest.json')
  source(sources, 'contract-manifest', `${contract.id}/manifest.json`, manifestText)
  const mapText = read('content-map.json')
  if (mapText === null) {
    unresolved.push({
      what: 'content-map.json',
      why: `${contract.id} has no content map; pages and slots unknown`
    })
    return { sealed: true, multilingual: read('multilingual-map.json') !== null, pages: null, slots: null }
  }
  const at = source(sources, 'contract-content-map', `${contract.id}/content-map.json`, mapText)
  const map = JSON.parse(mapText)
  const mlText = read('multilingual-map.json')
  const mlAt =
    mlText === null
      ? null
      : source(sources, 'contract-multilingual', `${contract.id}/multilingual-map.json`, mlText)

  const entities = new Map((map.entities ?? []).map((e) => [e.key, e]))
  const pages = Array.isArray(map.pages) ? map.pages : []
  for (const p of pages) {
    const entity = entities.get(p.entity)
    capabilities.push({
      key: `page:${slug(p.route ?? p.entity)}`,
      kind: 'page',
      label: p.route ?? p.entity,
      route: p.route ?? null,
      layout: p.layout ?? null,
      entity: p.entity,
      blocks: (p.assignedModules ?? []).map((m) => `block:${m.entity}`),
      can: ['read'],
      evidence: 'declared',
      meaning: roleOf(p.route ?? entity?.identity?.path ?? ''),
      // A route in the archive is a page the CMS serves; whether every assigned module renders
      // on every viewport is exactly what `visibilityRequires` refuses to assert.
      works: { ui: 'declared', backend: 'declared' },
      source: at
    })
  }
  const slots = Array.isArray(map.slots) ? map.slots : []
  /** @type {Map<string, any>} */
  const blocks = new Map()
  for (const s of slots) {
    let block = blocks.get(s.entity)
    if (!block) {
      const entity = entities.get(s.entity)
      block = {
        key: `block:${s.entity}`,
        kind: entity?.kind === 'article' ? 'article' : entity?.kind === 'menuItem' ? 'menu-item' : 'block',
        label: s.label?.replace(/\s*\/.*$/, '') ?? s.entity,
        entity: s.entity,
        slots: [],
        counts: { text: 0, url: 0, image: 0 },
        limits: { text: 0, url: 0, image: 0 },
        requiresEvidence: false,
        can: ['replace'],
        evidence: 'declared',
        meaning: roleOf(s.label ?? ''),
        works: { ui: 'declared', backend: 'unknown' },
        source: at
      }
      blocks.set(s.entity, block)
    }
    block.slots.push(`slot:${s.key}`)
    if (block.counts[s.type] !== undefined) {
      block.counts[s.type] += 1
      block.limits[s.type] = Math.max(block.limits[s.type], Number(s.maxCharacters) || 0)
    }
    if (s.requiresEvidence) block.requiresEvidence = true
    capabilities.push({
      key: `slot:${s.key}`,
      kind: 'slot',
      label: s.label ?? s.key,
      block: `block:${s.entity}`,
      type: s.type,
      limit: Number(s.maxCharacters) || null,
      requiresEvidence: Boolean(s.requiresEvidence),
      can: ['replace'],
      evidence: 'declared',
      meaning: roleOf(s.label ?? ''),
      works: { ui: 'declared', backend: 'unknown' },
      source: at
    })
  }
  for (const block of blocks.values()) capabilities.push(block)

  if (mlAt !== null) {
    const ml = JSON.parse(mlText)
    capabilities.push({
      key: 'feature:multilingual',
      kind: 'feature',
      label: 'Content in more than one language',
      detail: ml.counts ?? null,
      can: ['choose'],
      evidence: 'declared',
      meaning: { role: 'language', by: 'rule' },
      works: { ui: 'declared', backend: 'declared' },
      source: mlAt
    })
  }
  unresolved.push({
    what: 'module visibility per viewport',
    why: 'the content map declares assignment, not rendering; only a render pass observes it'
  })
  unresolved.push({
    what: 'what each block does beyond its words',
    why: 'a slot proves a link or a text; forms, bookings or payments behind it are not declared'
  })
  return { sealed: true, multilingual: mlAt !== null, pages: pages.length, slots: slots.length }
}

// ── WordPress ───────────────────────────────────────────────────────────────────────────────────

function readWordPress({ release, contracts, capabilities, sources, unresolved }) {
  const index = readContracts(contracts)
  const contract = contractFor(index, release.tag, release.setting?.version)
  if (!contract) {
    unresolved.push({
      what: 'contract profile',
      why: `no profile seals ${release.tag}@${release.setting?.version ?? '?'}; nothing declares what a build may write`
    })
    return { sealed: false, pages: null, slots: null }
  }
  const dir = contract.dir
  const read = (name) => {
    const at = path.join(dir, name)
    return existsSync(at) ? readFileSync(at, 'utf8') : null
  }
  source(sources, 'contract-manifest', `${contract.id}/manifest.json`, read('manifest.json'))
  const mapText = read('content-map.json')
  if (mapText === null) {
    unresolved.push({ what: 'content-map.json', why: `${contract.id} has no content map` })
    return { sealed: true, pages: null, slots: null }
  }
  const at = source(sources, 'contract-content-map', `${contract.id}/content-map.json`, mapText)
  const map = JSON.parse(mapText)
  const slots = Array.isArray(map.slots) ? map.slots : []
  for (const s of slots)
    capabilities.push({
      key: `slot:${s.key}`,
      kind: 'slot',
      label: s.label ?? s.key,
      type: s.type,
      limit: Number(s.maxCharacters) || null,
      input: typeof s.input === 'string' ? s.input : null,
      can: ['replace'],
      evidence: 'declared',
      meaning: roleOf(`${s.label ?? ''} ${s.key}`),
      works: { ui: 'declared', backend: 'declared' },
      source: at
    })
  unresolved.push({
    what: 'pages, patterns and menus',
    why: 'the WordPress content map declares site identity only; everything else ships pre-built in the archive and is kept as-is'
  })
  return { sealed: true, pages: null, slots: slots.length }
}

// ── EmDash ──────────────────────────────────────────────────────────────────────────────────────

/** Where EmDash template metadata lives, image first, then checkout, then the fleet's maps. */
export const EMDASH_TEMPLATE_DIRS = Object.freeze([
  EMDASH_IN_IMAGE,
  EMDASH_IN_CHECKOUT,
  EMDASH_FLEET_PERSONALIZE
])

/** The directory holding this template's metadata, found by `artifact.json`'s own `templateId`. */
export function emdashTemplateDir(templateId, dirs = EMDASH_TEMPLATE_DIRS) {
  for (const root of dirs) {
    let entries = []
    try {
      entries = readdirSync(root)
    } catch {
      continue
    }
    for (const entry of entries) {
      const dir = path.join(root, entry)
      const artifact = path.join(dir, 'artifact.json')
      if (existsSync(artifact)) {
        try {
          if (JSON.parse(readFileSync(artifact, 'utf8')).templateId === templateId)
            return { dir, packaged: true }
        } catch {
          // an unreadable artifact card is not this template
        }
      } else if (entry === templateId && existsSync(path.join(dir, 'personalize.json')))
        return { dir, packaged: false }
    }
  }
  return null
}

function readEmDash({ release, emdash, capabilities, sources, unresolved }) {
  const templateId = release.setting?.template ?? null
  const found = templateId ? emdashTemplateDir(templateId, emdash) : null
  if (!found) {
    unresolved.push({
      what: 'template metadata',
      why: templateId
        ? `no personalize map or artifact card for template ${templateId} on this server`
        : 'the release names no template'
    })
    return { personalize: false, pages: null, slots: null }
  }
  const { dir, packaged } = found
  const read = (rel) => {
    const at = path.join(dir, rel)
    return existsSync(at) ? readFileSync(at, 'utf8') : null
  }
  const artifactText = packaged ? read('artifact.json') : null
  /**
   * 🔒 READ FROM THE TEMPLATE'S OWN CARD, NOT DECLARED IN A CATALOGUE. EmDash cards cut before ADR
   * 0022 (which replaced ADR 0020: a quickstart's design is a recommendation, nothing is locked)
   * carry `contentOnly: true` — that key is the older template's wording, matched as released and
   * never written again. Kept so the snapshot of those releases, and the hash their generated
   * questionnaires were compared against, stay unchanged; never a flag copied by hand into
   * `quickstarts.json`, the shape ADR 0017 removed because it fails silently.
   */
  let sealed = false
  if (artifactText !== null) {
    const at = source(sources, 'emdash-artifact', `${templateId}/artifact.json`, artifactText)
    const artifact = JSON.parse(artifactText)
    sealed = artifact.contentOnly === true
    for (const f of Array.isArray(artifact.capabilities) ? artifact.capabilities : [])
      capabilities.push({
        key: `feature:${slug(f)}`,
        kind: 'feature',
        label: String(f),
        can: [],
        evidence: 'declared',
        meaning: { role: null, by: 'unknown' },
        works: { ui: 'declared', backend: 'declared' },
        source: at
      })
    for (const l of artifact.locales?.all ?? [])
      capabilities.push({
        key: `language:${l}`,
        kind: 'language',
        label: String(l),
        can: ['choose'],
        evidence: 'declared',
        meaning: { role: 'language', by: 'rule' },
        works: { ui: 'declared', backend: 'declared' },
        source: at
      })
  }
  const modelText = packaged ? read('seed/site-model.json') : null
  if (modelText !== null) {
    const at = source(sources, 'emdash-site-model', `${templateId}/seed/site-model.json`, modelText)
    const model = JSON.parse(modelText)
    for (const t of Array.isArray(model.types) ? model.types : [])
      capabilities.push({
        key: t.mode === 'list' ? `collection:${t.name}` : `page:${t.name}`,
        kind: t.mode === 'list' ? 'collection' : 'page',
        label: t.label ?? t.name,
        fields: (t.fields ?? []).map((f) => f.name),
        can: ['read'],
        evidence: 'declared',
        meaning: roleOf(`${t.label ?? ''} ${t.name}`),
        works: { ui: 'declared', backend: 'declared' },
        source: at
      })
  }
  const personalizeText = read(packaged ? 'seed/personalize.json' : 'personalize.json')
  if (personalizeText === null) {
    unresolved.push({
      what: 'personalize map',
      why: `${templateId} ships no personalize.json; answers cannot reach its fields`
    })
    return { sealed, personalize: false, pages: null, slots: null }
  }
  const at = source(sources, 'emdash-personalize', `${templateId}/personalize.json`, personalizeText)
  const p = JSON.parse(personalizeText)
  let fields = 0
  const field = (kind, entry, can, extra = {}) => {
    const key = `${kind}:${[entry.collection, entry.slug, entry.field].filter(Boolean).join('.')}`
    fields += 1
    capabilities.push({
      key,
      kind,
      label: entry.brief ?? entry.why ?? key,
      collection: entry.collection ?? null,
      can,
      evidence: 'declared',
      meaning: roleOf(`${entry.brief ?? ''} ${entry.field ?? ''} ${entry.collection ?? ''}`),
      works: { ui: 'declared', backend: 'declared' },
      source: at,
      ...extra
    })
  }
  for (const e of p.identity ?? []) field('field', e, ['replace'], { limit: null })
  for (const e of p.copy ?? [])
    field('field', e, ['replace'], { limit: e.maxWords ? { words: e.maxWords } : null })
  for (const e of p.blocks ?? []) field('block', e, ['repeat', 'replace'], { itemFields: e.itemFields ?? [] })
  for (const e of p.rewrite ?? [])
    field('collection-rewrite', { collection: e.collection }, ['repeat', 'replace'], {
      fields: e.fields ?? []
    })
  for (const e of p.hide ?? []) field('hide', e, ['choose'], { menu: e.menu ?? null })
  for (const e of p.forms ?? [])
    capabilities.push({
      key: `form:${e.slug}`,
      kind: 'form',
      label: e.brief ?? e.slug,
      fields: Object.keys(e.fields ?? {}),
      can: ['replace'],
      evidence: 'declared',
      meaning: { role: 'form', by: 'rule' },
      works: { ui: 'declared', backend: 'declared' },
      source: at
    })
  for (const e of p.facts ?? [])
    capabilities.push({
      key: `fact:${[e.collection, e.slug, e.field].filter(Boolean).join('.')}`,
      kind: 'fact',
      label: e.why ?? 'a claim the demo made',
      can: [],
      evidence: 'declared',
      meaning: { role: 'claim', by: 'rule' },
      works: { ui: 'declared', backend: 'unknown' },
      source: at,
      note: 'removed at personalize, never written — a customer’s own figures would need a field of their own'
    })
  if (!packaged)
    unresolved.push({
      what: 'artifact card and site model',
      why: `${templateId} is a packed release; only its fleet-side personalize map is on this server`
    })
  return { sealed, personalize: true, pages: null, slots: fields }
}

// ── The reader ──────────────────────────────────────────────────────────────────────────────────

/**
 * Read the capabilities of one release into a snapshot.
 *
 * @param {object} args
 * @param {any} args.release a row of `readReleases` (tag, setting, platform)
 * @param {any} [args.standardDoc] the CMS's own set — its `languages` question is the declared list
 *   of installable languages (D11: a quickstart's own questionnaire is not read for it)
 * @param {string | string[]} [args.contracts] where contract profiles live (default: image, then checkout)
 * @param {string[]} [args.emdash] where EmDash template metadata lives (default: image, then checkout)
 * @param {string} [args.readAt] ISO time of the read — recorded, excluded from the hash
 */
export function readCapabilities({
  release,
  standardDoc = null,
  contracts = undefined,
  emdash = [...EMDASH_TEMPLATE_DIRS],
  readAt = new Date().toISOString()
}) {
  const platform = release.platform ?? release.setting?.platform ?? null
  /** @type {any[]} */
  const sources = []
  /** @type {any[]} */
  const capabilities = []
  /** @type {{ what: string, why: string }[]} */
  const unresolved = []

  const setting = release.setting ?? null
  const settingText = setting ? JSON.stringify(setting) : null
  const settingAt = source(sources, 'release-setting', `${release.tag}/tracy_setting.json`, settingText)
  const parts = {}
  for (const [part, spec] of Object.entries(setting?.install ?? {}))
    if (spec && typeof spec === 'object' && typeof spec.sha256 === 'string') parts[part] = spec.sha256

  // Core capabilities every build has, whatever the CMS: the answers the engine itself reads.
  const core = (key, label, role) =>
    capabilities.push({
      key: `core:${key}`,
      kind: 'core',
      label,
      can: ['replace'],
      evidence: 'declared',
      meaning: { role, by: 'rule' },
      works: { ui: 'declared', backend: 'declared' },
      source: settingAt
    })
  core('name', 'The business name — the site label and the words on every page', 'identity')
  core('about', 'What the business does, in the customer’s words', 'about')
  core('tone', 'The tone the copy is written in', 'tone')
  core('contact', 'How to reach the business', 'contact')

  let read = { sealed: false, personalize: false, pages: null, slots: null }
  if (platform === 'joomla') read = readJoomla({ release, contracts, capabilities, sources, unresolved })
  else if (platform === 'wordpress')
    read = readWordPress({ release, contracts, capabilities, sources, unresolved })
  else if (platform === 'emdash') read = readEmDash({ release, emdash, capabilities, sources, unresolved })
  else unresolved.push({ what: 'platform', why: `no adapter for ${String(platform)}` })

  // Languages: the CMS's own set (it is what the form offers — D11, every site is asked the
  // standard file of its CMS), else the setting's list. One list, one source, no merge. A released
  // tracy_site_question.json is no longer read here: it is not what a customer is asked.
  const languageSource = languagesFrom(standardDoc)
    ? {
        at: source(sources, 'standard-questions', `${platform}/questions.json`, JSON.stringify(standardDoc)),
        tags: languagesFrom(standardDoc)
      }
    : Array.isArray(setting?.languages) && setting.languages.length > 0
      ? { at: settingAt, tags: setting.languages }
      : null
  // A sealed Joomla release with no multilingual profile is built in ONE language — any one of the
  // catalog's, the one chosen — never in two. The whole list stays on offer; the snapshot says "one".
  const oneEdition = platform === 'joomla' && read.sealed && read.multilingual === false
  if (languageSource && !capabilities.some((c) => c.kind === 'language'))
    for (const tag of languageSource.tags)
      capabilities.push({
        key: `language:${tag}`,
        kind: 'language',
        label: String(tag),
        can: ['choose'],
        evidence: 'declared',
        meaning: { role: 'language', by: 'rule' },
        works: { ui: 'declared', backend: 'declared' },
        source: languageSource.at
      })
  else if (!languageSource)
    unresolved.push({ what: 'languages', why: 'no questionnaire or setting lists them' })

  /**
   * One key a language question can point at, beside the per-tag ones.
   *
   * 🔒 A QUESTION MUST NAME A CAPABILITY, AND "WHICH LANGUAGES" SERVES ALL OF THEM. Without this
   * the only honest reference for a `languages` question is the whole list — fifty-three keys on a
   * Joomla quickstart — so a model writes none and the validator refuses the question. Measured
   * 22/09 on `tracy-business/wp7`: the refusal cost a repair round, and the repair answered by
   * DROPPING the language question altogether, leaving a WordPress release that can install
   * forty-nine languages with no way for a customer to pick one.
   */
  const languageKeys = capabilities.filter((c) => c.kind === 'language')
  if (languageKeys.length > 0)
    capabilities.push({
      key: 'core:languages',
      kind: 'core',
      label: `The languages this release can be built in (${String(languageKeys.length)})`,
      can: ['choose'],
      evidence: 'declared',
      meaning: { role: 'language', by: 'rule' },
      works: { ui: 'declared', backend: 'declared' },
      source: languageKeys[0].source
    })

  const consumers = consumersFor(platform, {
    sealed: read.sealed,
    personalize: read.personalize,
    multilingual: read.multilingual,
    pageList: Array.isArray(release.pages) && release.pages.length > 0
  })
  const counts = {}
  for (const c of capabilities) counts[c.kind] = (counts[c.kind] ?? 0) + 1

  const snapshot = {
    schemaVersion: CAPABILITIES_SCHEMA,
    readerVersion: READER_VERSION,
    release: {
      tag: release.tag,
      platform,
      version: setting?.version ?? null,
      cms: setting?.cms ?? null,
      template: setting?.template ?? null,
      parts
    },
    sources,
    consumers,
    capabilities,
    completeness: {
      level: 'declared',
      pages: read.pages,
      slots: read.slots,
      counts,
      unresolved
    },
    // Only when it is one: absent means "as many as asked for", which is every other release.
    ...(oneEdition ? { languagesMode: 'one' } : {}),
    // An EmDash card cut before ADR 0022 that still says `contentOnly` (the older template's key,
    // named verbatim in `source`). Only when true, so the snapshot of every other release — and the
    // hash its generated questionnaires were compared against — is unchanged.
    ...(platform === 'emdash' && read.sealed
      ? { sealed: { by: 'template', source: 'artifact.json contentOnly' } }
      : {})
  }
  const hash = sha256(canonicalJson(snapshot))
  return { ...snapshot, hash, readAt }
}

/** The set of keys a generated question may reference. */
export function capabilityKeys(snapshot) {
  return new Set((snapshot?.capabilities ?? []).map((c) => c.key))
}

/**
 * The snapshot as the model reads it: small, grouped, and honest about what is unknown. Slots are
 * folded into their blocks (a block says how many texts, links and pictures it holds); blocks
 * with no role keep `role: null`. This is the ONLY view of a site the generator ever gets.
 * @param {any} snapshot
 * @param {{ maxBlocks?: number }} [opts]
 */
export function summarizeForModel(snapshot, { maxBlocks = 80 } = {}) {
  const by = (kind) => snapshot.capabilities.filter((c) => c.kind === kind)
  const blocks = snapshot.capabilities
    .filter((c) =>
      ['block', 'article', 'menu-item', 'field', 'collection-rewrite', 'form', 'hide'].includes(c.kind)
    )
    .slice(0, maxBlocks)
    .map((c) => ({
      key: c.key,
      kind: c.kind,
      label: c.label,
      role: c.meaning?.role ?? null,
      can: c.can,
      ...(c.counts ? { holds: c.counts, limits: c.limits } : {}),
      ...(c.itemFields ? { itemFields: c.itemFields } : {}),
      ...(c.fields ? { fields: c.fields } : {}),
      ...(c.requiresEvidence ? { requiresEvidence: true } : {}),
      backend: c.works?.backend ?? 'unknown'
    }))
  return {
    release: snapshot.release,
    consumers: snapshot.consumers.filter((c) => c.available).map((c) => ({ id: c.id, reads: c.reads })),
    consumersUnavailable: snapshot.consumers
      .filter((c) => !c.available)
      .map((c) => ({ id: c.id, why: c.why })),
    core: by('core').map((c) => ({ key: c.key, label: c.label })),
    pages: [...by('page'), ...by('collection')].map((c) => ({
      key: c.key,
      label: c.label,
      role: c.meaning?.role ?? null
    })),
    blocks,
    blocksNotShown: Math.max(0, snapshot.capabilities.filter((c) => c.kind === 'block').length - maxBlocks),
    features: by('feature').map((c) => ({ key: c.key, label: c.label })),
    facts: by('fact').map((c) => ({ key: c.key, label: c.label, note: c.note })),
    languages: by('language').map((c) => c.key.slice('language:'.length)),
    ...(snapshot.languagesMode === 'one' ? { languagesMode: 'one' } : {}),
    unresolved: snapshot.completeness.unresolved
  }
}
