/**
 * WHAT THE RELAY ADDS TO CONTENT API v1 — pure functions, no I/O.
 *
 * A Claude Cowork plugin answers what the site holds; it does not know who is asking or which contract seals
 * the site. The relay knows both (the seat's toolsets, the contract profile of the site's
 * quickstart), so everything that depends on them is decided here and added beside the Claude Cowork plugin's
 * answer: `writable`, `constraints` and `next` on a content.read envelope, and the whole
 * `tracy-content-describe/v1` document. None of it is ever taken from the agent's request.
 *
 * `null` means "nothing proves it either way" and is never guessed into `true` or `false`: a field
 * with no contract slot is `writable: null`, a count the Claude Cowork plugin could not give is `count: null`.
 * The shapes are `@tracy/content-api`'s (schema, validator and slot → block kind map), reached
 * through `lib/content-api.js`.
 */

import {
  CONTENT_TYPES,
  DESCRIBE_SCHEMA_VERSION,
  emdashBlockKinds,
  joomlaSlotField,
  RELAY_EXTENSIONS,
  SCHEMA_VERSION,
  slotBlockKinds,
  wordpressSlotField
} from '../lib/content-api.js'

export const CONTENT_PROTOCOL = SCHEMA_VERSION
export { CONTENT_TYPES, RELAY_EXTENSIONS }

/** One value when every slot agrees on it, otherwise null (disagreement is not evidence). */
function agreed(values) {
  const seen = new Set(values.map((value) => value ?? null))
  return seen.size === 1 ? [...seen][0] : null
}

/** The same rule `describe-map.mjs` states per block kind field, stated here per slot key. */
function constraintsOf(slots) {
  return {
    maxCharacters: agreed(slots.map((slot) => slot.maxCharacters)),
    requiresEvidence: agreed(slots.map((slot) => slot.requiresEvidence)),
    emptyAllowed: slots.every((slot) => slot.siteIdentity === true) ? true : null
  }
}

/**
 * slotKey → constraints, from a contract profile's `content-map.json`. A slot key listed more than
 * once (the WordPress map repeats some, one per occurrence on the page) keeps a value only where
 * every listing agrees.
 * @param {{slots?: Array<Record<string, unknown>>} | null} contentMap
 * @returns {Map<string, {maxCharacters: number|null, requiresEvidence: boolean|null, emptyAllowed: boolean|null}>}
 */
export function slotConstraints(contentMap) {
  /** @type {Map<string, Array<Record<string, unknown>>>} */
  const byKey = new Map()
  for (const slot of Array.isArray(contentMap?.slots) ? contentMap.slots : []) {
    if (typeof slot?.key !== 'string') continue
    byKey.set(slot.key, [...(byKey.get(slot.key) ?? []), slot])
  }
  return new Map([...byKey].map(([key, slots]) => [key, constraintsOf(slots)]))
}

/**
 * Block kinds for a describe, by `@tracy/content-api`'s own map (one implementation for the
 * Claude Cowork plugins' fixtures and this relay). A profile the map refuses (a slot naming no entity, a field
 * holding two value types) yields no kinds rather than a guessed shape.
 * @param {{platform: string|null, contentMap?: any, siteModel?: any, apply: boolean}} input
 */
export function describeBlockKinds({ platform, contentMap = null, siteModel = null, apply }) {
  try {
    if (platform === 'emdash') return siteModel ? emdashBlockKinds(siteModel) : []
    if (!contentMap) return []
    if (platform === 'joomla') return slotBlockKinds(contentMap, joomlaSlotField, { writable: apply })
    if (platform === 'wordpress') return slotBlockKinds(contentMap, wordpressSlotField, { writable: apply })
  } catch {
    return []
  }
  return []
}

/** A BCP 47 tag in canonical form, as the schema requires; Joomla's `*` ("all") is not a locale. */
function canonical(tag) {
  try {
    return Intl.getCanonicalLocales(tag)[0] === tag
  } catch {
    return false
  }
}

/** The locales a contract profile's entities are written in, first-seen order. */
export function profileLocales(contentMap) {
  const seen = []
  for (const entity of Array.isArray(contentMap?.entities) ? contentMap.entities : []) {
    const language = entity?.identity?.language
    if (typeof language === 'string' && canonical(language) && !seen.includes(language)) seen.push(language)
  }
  return seen
}

/** The v1 content types an EmDash template's `content-api-map.json` maps its collections to. */
export function emdashContentTypes(contentApiMap) {
  const seen = []
  for (const collection of Object.values(contentApiMap?.collections ?? {})) {
    const type = /** @type {any} */ (collection)?.type
    if (CONTENT_TYPES.includes(type) && !seen.includes(type)) seen.push(type)
  }
  return seen
}

/**
 * The EmDash collection a v1 content type stands for, when the template's `content-api-map.json`
 * maps exactly ONE collection to it (Tracy Business: `service` → `services`, `article` → `posts`).
 * Null when none or several do — every singleton page of Business is a collection of its own, all
 * of type `page` — because the reader's envelope names no collection, and a guessed one writes the
 * wrong entry.
 * @param {{collections?: Record<string, {type?: string}>} | null} contentApiMap
 * @param {unknown} type
 * @returns {string | null}
 */
export function emdashCollectionOf(contentApiMap, type) {
  const named = Object.entries(contentApiMap?.collections ?? {})
    .filter(([, one]) => one?.type === type)
    .map(([name]) => name)
  return named.length === 1 ? named[0] : null
}

/** The `protocol` object both the envelope and the describe document carry. */
export function protocolOf(kind, capability) {
  return {
    selected: CONTENT_PROTOCOL,
    relayExtensions: [...RELAY_EXTENSIONS],
    cowork: { kind, capability }
  }
}

const list = (value) => (Array.isArray(value) ? value : [])

/** Every field of a block, its items' fields included. */
const blockFields = (block) => [
  ...list(block?.fields),
  ...list(block?.items).flatMap((item) => list(item?.fields))
]

/**
 * `writable` / `constraints` / `next` / `protocol` added to a content.read v1 envelope, in place.
 * An answer that is not a v1 envelope (an error) is returned untouched.
 *
 * `writable` is decided on three levels with one rule: without `apply` everything is false (a
 * parent that cannot be written has no child that can); with it, a field is writable when it names
 * a contract slot this seat may write (`slotOpen`: a content seat writes text, image and link slots,
 * a code seat any) — `false` for a slot it may not — and unknown otherwise; a block or content is
 * writable when it holds at least one writable field and unknown otherwise.
 *
 * EmDash has no contract: its entries are written whole-field through the site's own MCP, so its
 * road is `emdash` — `write` (this seat holds the `content` toolset) and the template's
 * `content-api-map.json` — and `emdashEnvelope` decides its fields instead.
 * @param {any} result
 * @param {{apply: boolean, slotOpen?: (slotKey: string) => boolean, slots: Map<string, object>,
 *   kind: string, emdash?: {write: boolean, contentApiMap: any} | null}} opts - `kind` is the site's CMS.
 */
export function extendEnvelope(result, { apply, slotOpen = () => true, slots, kind, emdash = null }) {
  if (result?.schemaVersion !== CONTENT_PROTOCOL) return result
  if (kind === 'emdash' && emdash) return emdashEnvelope(result, emdash)
  const decideField = (field) => {
    const slotKey = typeof field?.slotKey === 'string' && field.slotKey !== '' ? field.slotKey : null
    field.writable = apply ? (slotKey ? slotOpen(slotKey) : null) : false
    field.constraints = slotKey ? (slots.get(slotKey) ?? null) : null
    field.next =
      field.writable === true
        ? { tool: 'tracy_site', action: 'content.contract', operation: 'apply', changes: { [slotKey]: null } }
        : null
    return field.writable === true
  }
  /** Decide every field (all of them, not up to the first writable one), then the holder. */
  const holding = (fields) => {
    const anyWritable = fields.map(decideField).includes(true)
    return apply ? (anyWritable ? true : null) : false
  }
  for (const content of list(result.contents)) {
    const own = holding(list(content?.fields))
    const blocks = list(content?.blocks).map((block) => (block.writable = holding(blockFields(block))))
    content.writable = apply ? (own === true || blocks.includes(true) ? true : null) : false
  }
  result.protocol = protocolOf(kind, 'v1')
  return result
}

/**
 * The `tracy_emdash content_update` that writes one field of one entry: `data` holds that field's
 * path with a null placeholder for the value, and nothing else. `status:"published"` because the
 * envelope read the published value and the words road changes and publishes in one call
 * (`EMDASH_WORDS_ROAD`, tracy-site-tools); Tracy fills `_rev` from its own read.
 * @param {string | null} collection @param {string} slug @param {unknown} locale
 * @param {Record<string, unknown>} data
 */
function emdashNext(collection, slug, locale, data) {
  return {
    tool: 'tracy_emdash',
    action: 'content_update',
    arguments: {
      collection,
      id: slug,
      locale: typeof locale === 'string' && locale !== '' ? locale : null,
      data,
      status: 'published'
    }
  }
}

/**
 * EmDash's writability: every field a seat holding `content` can change with ONE
 * `content_update` is `writable: true` with that call as `next`, from what the reader's own
 * projection proves (`tools/content-api/reader.mjs` in the template): an entry field is keyed by its
 * name, so `data:{<key>:…}` writes it; a repeater row's field is `<field>.<row index>.<key>` in the
 * list shape the words road takes (`{"<index>":{changed keys}}`). A text block of a rich-text field
 * (`<field>.<block key>`) and an entry with no slug have no such call: `null`, never a guess.
 * Without `write` every level is false, as a contract site without `apply`.
 * @param {any} result @param {{write: boolean, contentApiMap: any}} road
 */
function emdashEnvelope(result, { write, contentApiMap }) {
  for (const content of list(result.contents)) {
    const slug = typeof content?.slug === 'string' && content.slug !== '' ? content.slug : null
    const collection = emdashCollectionOf(contentApiMap, content?.type)
    /** @param {any} field @param {Record<string, unknown> | null} data */
    const decide = (field, data) => {
      const ready = write && slug !== null && data !== null
      field.writable = write ? (ready ? true : null) : false
      field.constraints = null
      field.next = ready ? emdashNext(collection, /** @type {string} */ (slug), content.locale, data) : null
      return field.writable === true
    }
    // An entry field's key is a key of the entry's data only when it names no text block.
    const own = list(content?.fields).map((field) =>
      decide(field, typeof field?.key === 'string' && !field.key.includes('.') ? { [field.key]: null } : null)
    )
    const blocks = list(content?.blocks).map((block) => {
      const decided = [
        ...list(block?.fields).map((field) => decide(field, null)),
        ...list(block?.items).flatMap((item) =>
          list(item?.fields).map((field) =>
            decide(
              field,
              typeof block?.key === 'string' &&
                Number.isInteger(item?.position) &&
                typeof field?.key === 'string'
                ? { [block.key]: { [String(item.position)]: { [field.key]: null } } }
                : null
            )
          )
        )
      ]
      block.writable = write ? (decided.includes(true) ? true : null) : false
      return block.writable === true
    })
    content.writable = write ? (own.includes(true) || blocks.includes(true) ? true : null) : false
  }
  result.protocol = protocolOf('emdash', 'v1')
  return result
}

/**
 * The guidance line of a describe document: how to read, and — only when this seat may — how to
 * write. English, short, and naming only tools and actions that exist. A quickstart's design is a
 * content recommendation (ADR 0022), never a lock: the only thing refused is writing the database
 * directly. Files and the shell are open there too, so the write sentence says why words still go
 * through this door (revisions and undo live here) — a preference the agent may weigh, not a rule.
 * The schema caps the line at 600 characters. Keep complete sentences: the conformance tests
 * check every variant rather than letting a slice hide an overlong instruction.
 *
 * EmDash has no contract apply, and never had a read-only door: its entries are written through
 * `tracy_emdash content_update` (`entryWrite`: this seat holds `content`). The line used to say
 * "no apply" and the note "reading only", and an agent took that as "this site cannot be written".
 * With no reader in the site's image (a Business image built without the switch) the read road is
 * the same MCP tool, named here rather than "the CMS content tools".
 */
export function describeGuidance({
  platform,
  apply,
  designBaseline,
  readSupported = true,
  entryWrite = false
}) {
  const emdash = platform === 'emdash'
  const read = readSupported
    ? 'Read via types[].next, then content.read {id}. Use types[].type, not blockKinds.kind; blog posts are article. Add locale from site.locales. Page sections are blocks in order, named by role; sharedContentId marks site chrome.'
    : emdash
      ? 'This EmDash site has no working Content API reader: read an entry with tracy_emdash content_get {collection, id:<slug>}, never content.read again.'
      : 'This seat has no working Content API reader here; use the CMS content tools to read.'
  const write = apply
    ? ' writable:true fields carry next: content.contract apply changes{slotKey:value}, no inspect. For words prefer this door to files or CLI: it keeps revisions and undo. Respect maxCharacters and requiresEvidence. Never write the database directly.'
    : emdash
      ? entryWrite
        ? readSupported
          ? ' writable:true fields carry next: ONE tracy_emdash content_update changes and publishes the field. Words on a page: tracy_site content.replace. Never write the database directly.'
          : ' Change an entry with ONE tracy_emdash content_update {collection, id, data:{field:value}, status:"published"}; words on a page: tracy_site content.replace. Never write the database directly.'
        : ' This seat does not hold the content toolset: reading only.'
      : ' This seat or site has no contract apply: fields are read-only here.'
  const baseline = designBaseline
    ? ' Design recommendation: reuse sections and styles; new text 0.75×–1.25× the length it replaces.'
    : ''
  return read + write + baseline
}

const capabilityOf = (name) => ({ name: `ai.tracy.content.${name}`, version: '1' })

/**
 * The `tracy-content-describe/v1` document. What the Claude Cowork plugin said wins; what it could not say
 * falls back to the release's own files (`fallback`), and a count nobody could give is null.
 * @param {object} input
 * @param {string} input.siteKey
 * @param {Record<string, any>} input.site - the `site` row.
 * @param {any} input.probe - a v1 envelope from `content.read {limit:1}`, or null.
 * @param {Record<string, number|null>} input.counts - per content type.
 * @param {{id: string} | null} input.contract
 * @param {string | null} input.contractHash
 * @param {{state: 'locked'|'unlocked'|'unknown', reason: string|null}} input.presentation - `unlocked`
 *   with a reason when the quickstart's design is known as a baseline to keep (ADR 0022), else `unknown`.
 * @param {{role: string, toolsets: Record<string, boolean>, apply: boolean, entryWrite?: boolean}} input.permissions
 *   `entryWrite`: an EmDash seat that writes entries through `tracy_emdash` (`contentAuthority`).
 * @param {any[]} input.blockKinds
 * @param {{url: string|null, defaultLocale: string|null, locales: string[], types: string[]}} input.fallback
 * @param {any} [input.where] - the checked where-map of the site's quickstart, as `content-where.js`
 *   serves it, or null when none is proven for this release.
 */
export function buildDescribe({
  siteKey,
  site,
  probe,
  counts,
  contract,
  contractHash,
  presentation,
  permissions,
  blockKinds,
  fallback,
  where = null
}) {
  const capability = probe?.schemaVersion === CONTENT_PROTOCOL ? 'v1' : 'unsupported'
  const told = capability === 'v1' ? (probe.site ?? {}) : {}
  const toldLocales = Array.isArray(told.locales) ? told.locales.filter((one) => typeof one === 'string') : []
  // No Claude Cowork plugin answer and no locale in the profile: the schema wants a string, and BCP 47 has one
  // for exactly this — `und`, undetermined — rather than a guessed language.
  const locales =
    toldLocales.length > 0 ? toldLocales : fallback.locales.length > 0 ? fallback.locales : ['und']
  const defaultLocale =
    typeof told.defaultLocale === 'string'
      ? told.defaultLocale
      : (fallback.defaultLocale ?? locales[0] ?? 'und')
  const platform = site?.platform ?? null
  const entryWrite = platform === 'emdash' && permissions.entryWrite === true
  const capabilities = [capabilityOf('read'), capabilityOf('describe')]
  if (permissions.apply) capabilities.push(capabilityOf('slot-write'))
  // EmDash's own road: fields written whole through the site's MCP, one entry at a time.
  if (entryWrite) capabilities.push(capabilityOf('entry-write'))
  if (where) capabilities.push(capabilityOf('where'))
  if (
    platform === 'emdash' &&
    list(probe?.completeness?.unresolved).some((issue) => issue?.code === 'SCALAR_PROJECTION_ONLY')
  )
    capabilities.push(capabilityOf('scalars'))
  // The Claude Cowork plugin paged the probe by the budget it was sent (`pagination.budget`): it takes maxBytes.
  // No Claude Cowork plugin declares this itself (rc.11 / wp rc.7 / EmDash #418), so the relay says it here.
  if (capability === 'v1' && Number.isInteger(probe?.pagination?.budget))
    capabilities.push(capabilityOf('budget'))
  const note = permissions.apply
    ? 'This seat may apply slot writes through tracy_site content.contract.'
    : platform === 'emdash'
      ? entryWrite
        ? 'EmDash has no content.contract: this seat writes entries with tracy_emdash content_update, one call per entry and language.'
        : 'This seat does not hold the content toolset: reading only.'
      : !contract
        ? 'No contract profile seals this site, so there are no slots to write through content.contract.'
        : 'This seat does not hold the code toolset: reading only.'
  // With no reader, an EmDash describe must not be followed by the listing a describe usually leads
  // to (tracy-site-tools `contentReadNext` adds `content.read {type}` to a describe that has no next
  // of its own): that read can only refuse. Its own next names the road that answers.
  const readRoad =
    platform === 'emdash' && capability !== 'v1'
      ? {
          next: 'No content map on this EmDash site: read the entry the request is about with tracy_emdash content_get {collection, id:<slug>}; do not call content.read again.'
        }
      : {}
  return {
    schemaVersion: DESCRIBE_SCHEMA_VERSION,
    view: 'authenticated',
    site: {
      id: typeof told.id === 'string' ? told.id : siteKey,
      name: typeof told.name === 'string' ? told.name : null,
      url: typeof told.url === 'string' ? told.url : fallback.url,
      defaultLocale,
      locales
    },
    provenance:
      site?.quickstart_tag && site?.quickstart_version
        ? {
            quickstartTag: site.quickstart_tag,
            quickstartVersion: site.quickstart_version,
            contractId: contract?.id ?? null,
            contractHash: contractHash ?? null
          }
        : null,
    protocol: protocolOf(platform, capability),
    scope: 'published',
    i18n: { mode: 'entity', defaultLocale, locales, fallback: null },
    presentation,
    permissions: {
      role: permissions.role,
      toolsets: permissions.toolsets,
      read: true,
      apply: permissions.apply,
      note
    },
    types: (fallback.types.length > 0 ? fallback.types : CONTENT_TYPES).map((type) => ({
      type,
      count: capability === 'v1' && Number.isInteger(counts?.[type]) ? counts[type] : null,
      // A ready-to-call read, derived from the same type as its count. Omit locale so it uses
      // the Claude Cowork plugin's default just like the count probe; a fallback `und` may not be readable.
      next: capability === 'v1' ? { tool: 'tracy_site', action: 'content.read', params: { type } } : null
    })),
    blockKinds,
    capabilities,
    guidance: describeGuidance({
      platform,
      apply: permissions.apply,
      readSupported: capability === 'v1',
      entryWrite,
      // A known presentation state means the quickstart's design baseline is known (ADR 0022).
      designBaseline: presentation.state !== 'unknown'
    }),
    links: { read: '/content.json', schema: 'urn:tracy:content:v1' },
    ...(where ? { where } : {}),
    ...readRoad
  }
}
