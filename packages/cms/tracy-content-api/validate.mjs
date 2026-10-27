import schema from './schema.json' with { type: 'json' }

export { schema }
export const SCHEMA_VERSION = 'tracy-content/v1'
export const DESCRIBE_SCHEMA_VERSION = 'tracy-content-describe/v1'
export const PAGES_SCHEMA_VERSION = 'tracy-content-pages/v1'
export const CHANGES_SCHEMA_VERSION = 'tracy-content-changes/v1'
// Query types and the relay's discovery calls follow the content schema, not a second enum.
export const CONTENT_TYPES = Object.freeze([...schema.$defs.content.properties.type.enum])
// Optional keys a relay may attach to a v1 envelope; Claude Cowork plugins never produce them. The relay
// imports this list so the advertised names and the validated names cannot drift.
export const RELAY_EXTENSIONS = Object.freeze(['writable', 'constraints', 'next', 'protocol'])
export const DEFAULT_MAX_BYTES = 256 * 1024
const WRITE_CAPABILITY = 'ai.tracy.content.slot-write'
const CAPABILITY_PREFIX = 'ai.tracy.content.'

// Evaluate only the vocabulary used by our canonical schema, not arbitrary JSON Schema.
// A new keyword fails at load time instead of silently weakening validation. No second shape
// declaration lives in this module; PHP producers can run the same JSON corpus in their CI.
const KEYWORDS = new Set([
  '$schema',
  '$id',
  '$defs',
  '$ref',
  'title',
  'type',
  'properties',
  'required',
  'items',
  'anyOf',
  'allOf',
  'not',
  'if',
  'then',
  'const',
  'enum',
  'minimum',
  'maximum',
  'minLength',
  // Added for describe `guidance`: a length cap is shape, so it belongs in the schema that PHP
  // producers read, not only in this module. Counted in code points like minLength.
  'maxLength',
  'maxItems',
  'format'
])
export function assertSchemaVocabulary(node = schema) {
  for (const [key, value] of Object.entries(node)) {
    if (!KEYWORDS.has(key)) throw new Error(`Unsupported schema keyword: ${key}`)
    if (key === '$ref' && !schema.$defs[value.slice(8)]) throw new Error(`Unknown schema ref: ${value}`)
    if (key === 'format' && value !== 'date-time') throw new Error(`Unsupported format: ${value}`)
    if (['properties', '$defs'].includes(key)) Object.values(value).forEach(assertSchemaVocabulary)
    if (['items', 'not', 'if', 'then'].includes(key)) assertSchemaVocabulary(value)
    if (['anyOf', 'allOf'].includes(key)) value.forEach(assertSchemaVocabulary)
  }
}
assertSchemaVocabulary()

function matchesType(value, type) {
  if (type === 'null') return value === null
  if (type === 'array') return Array.isArray(value)
  if (type === 'integer') return Number.isSafeInteger(value)
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  return typeof value === type && (type !== 'number' || Number.isFinite(value))
}

function shape(value, rule, path = '$') {
  const errors = []
  const add = (message) => errors.push({ code: 'CONTENT_SCHEMA_INVALID', path, message })
  if (rule.$ref) return shape(value, schema.$defs[rule.$ref.slice(8)], path)
  if (rule.type && ![rule.type].flat().some((t) => matchesType(value, t))) {
    add(`Expected ${[rule.type].flat().join(' or ')}`)
    return errors
  }
  if ('const' in rule && value !== rule.const) add('Unexpected constant')
  if (rule.enum && !rule.enum.includes(value)) add('Unexpected enum value')
  if (rule.anyOf && !rule.anyOf.some((r) => shape(value, r, path).length === 0))
    add('No allowed shape matches')
  if (rule.allOf) for (const r of rule.allOf) errors.push(...shape(value, r, path))
  if (rule.not && shape(value, rule.not, path).length === 0) add('Forbidden shape')
  if (rule.if && shape(value, rule.if, path).length === 0) errors.push(...shape(value, rule.then, path))
  if (typeof value === 'number') {
    if (rule.minimum !== undefined && value < rule.minimum) add('Below minimum')
    if (rule.maximum !== undefined && value > rule.maximum) add('Above maximum')
  }
  if (typeof value === 'string') {
    if (rule.minLength !== undefined && [...value].length < rule.minLength) add('String too short')
    if (rule.maxLength !== undefined && [...value].length > rule.maxLength) add('String too long')
    if (rule.format === 'date-time' && !validTime(value)) add('Invalid date-time')
  }
  if (Array.isArray(value)) {
    if (rule.maxItems !== undefined && value.length > rule.maxItems) add('Too many items')
    if (rule.items) value.forEach((v, i) => errors.push(...shape(v, rule.items, `${path}[${i}]`)))
  }
  if (matchesType(value, 'object')) {
    for (const key of rule.required ?? []) if (!Object.hasOwn(value, key)) add(`Missing ${key}`)
    for (const [key, r] of Object.entries(rule.properties ?? {})) {
      if (Object.hasOwn(value, key)) errors.push(...shape(value[key], r, `${path}.${key}`))
    }
  }
  return errors
}

function validTime(value) {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
      value
    )
  if (!m || !Number.isFinite(Date.parse(value))) return false
  const day = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`)
  return day.getUTCMonth() + 1 === Number(m[2]) && day.getUTCDate() === Number(m[3])
}

function jsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || ancestors.has(value)) return false
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false
  ancestors.add(value)
  const valid = (Array.isArray(value) ? Array.from(value) : Object.values(value)).every((v) =>
    jsonValue(v, ancestors)
  )
  ancestors.delete(value)
  return valid
}

function uniqueIn(rows, key, path, add) {
  const seen = new Set()
  rows.forEach((row, i) => {
    const id = row[key]
    if (seen.has(id)) add('CONTENT_DUPLICATE_ID', `${path}[${i}].${key}`, 'Duplicate identity in owner')
    seen.add(id)
  })
}

function canonicalLocale(tag, path, add) {
  if (tag === null) return
  try {
    if (Intl.getCanonicalLocales(tag)[0] !== tag) throw new Error('Noncanonical locale')
  } catch {
    add('CONTENT_LOCALE_INVALID', path, 'Expected canonical BCP 47 locale')
  }
}

function declaredLocales(locales, defaultLocale, path, add) {
  locales.forEach((l, i) => canonicalLocale(l, `${path}.locales[${i}]`, add))
  if (new Set(locales).size !== locales.length)
    add('CONTENT_LOCALE_INVALID', `${path}.locales`, 'Duplicate locale')
  canonicalLocale(defaultLocale, `${path}.defaultLocale`, add)
  if (defaultLocale !== null && !locales.includes(defaultLocale))
    add('CONTENT_LOCALE_INVALID', `${path}.defaultLocale`, 'Locale is not declared by site')
}

/** The keys from `data` down to its one null leaf, or null when it holds anything but one path. */
function placeholderPath(data) {
  const path = []
  let at = data
  while (at !== null && typeof at === 'object' && !Array.isArray(at)) {
    const keys = Object.keys(at)
    if (keys.length !== 1) return null
    path.push(keys[0])
    at = at[keys[0]]
  }
  return at === null && path.length > 0 ? path : null
}

/**
 * Relay extensions on one shape-valid content. `writable: false` on an owner makes every tier
 * below it `false`; `true` and `null` (not determined) impose nothing on children. Items carry no
 * writability of their own, so item fields inherit from their block.
 */
function relayExtensionErrors(content, path, add) {
  const field = (f, fp, readonlyOwner) => {
    if (readonlyOwner && f.writable !== false)
      add('WRITABLE_INHERITANCE', `${fp}.writable`, 'A readonly owner makes this field readonly')
    if (f.constraints != null && f.slotKey === null)
      add('CONSTRAINTS_WITHOUT_SLOT', `${fp}.constraints`, 'Constraints describe a slot; this field has none')
    if (f.next == null) return
    if (f.writable !== true)
      add('NEXT_WITHOUT_WRITABLE', `${fp}.next`, 'A next apply call needs a writable field')
    // EmDash (no contract): one `tracy_emdash content_update` whose `data` holds exactly one path,
    // ending at this field's own key with a null placeholder — `{key: null}` for an entry field,
    // `{list: {"<row>": {key: null}}}` for a repeater row's field.
    if (f.next.tool === 'tracy_emdash') {
      const path = placeholderPath(f.next.arguments.data)
      if (path === null || path.at(-1) !== f.key)
        add(
          'NEXT_FIELD_MISMATCH',
          `${fp}.next.arguments.data`,
          'The next write must name only this field, with a null placeholder'
        )
      return
    }
    const keys = Object.keys(f.next.changes)
    if (keys.length !== 1 || keys[0] !== f.slotKey)
      add('NEXT_SLOT_MISMATCH', `${fp}.next.changes`, 'The next apply call must name only this slot')
    if (Object.values(f.next.changes).some((v) => v !== null))
      add('CONTENT_SCHEMA_INVALID', `${fp}.next.changes`, 'A next change is a null placeholder')
  }
  const readonly = content.writable === false
  ;(content.fields ?? []).forEach((f, i) => field(f, `${path}.fields[${i}]`, readonly))
  for (const [bi, block] of (content.blocks ?? []).entries()) {
    const bp = `${path}.blocks[${bi}]`
    if (readonly && block.writable !== false)
      add('WRITABLE_INHERITANCE', `${bp}.writable`, 'A readonly content makes this block readonly')
    const blockReadonly = readonly || block.writable === false
    block.fields.forEach((f, i) => field(f, `${bp}.fields[${i}]`, blockReadonly))
    block.items.forEach((item, ii) =>
      item.fields.forEach((f, i) => field(f, `${bp}.items[${ii}].fields[${i}]`, blockReadonly))
    )
  }
}

/**
 * Validate one response: a `tracy-content/v1` envelope or error, or a describe document (routed
 * to validateDescribe by its schemaVersion). This proves no authentication, CMS mapping or
 * snapshot isolation.
 */
export function validateContent(value, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const errors = []
  const add = (code, path, message) => errors.push({ code, path, message })
  if (!jsonValue(value)) return [{ code: 'CONTENT_SCHEMA_INVALID', path: '$', message: 'Expected JSON data' }]
  if (value?.schemaVersion === DESCRIBE_SCHEMA_VERSION) return validateDescribe(value, { maxBytes })
  if (value?.schemaVersion === PAGES_SCHEMA_VERSION) return validatePages(value, { maxBytes })
  if (value?.schemaVersion === CHANGES_SCHEMA_VERSION) return validateChanges(value, { maxBytes })
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('maxBytes must be positive')
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxBytes)
    add('CONTENT_RESPONSE_TOO_LARGE', '$', 'Response exceeds byte budget')
  if (value && 'schemaVersion' in Object(value) && value.schemaVersion !== SCHEMA_VERSION) {
    add('CONTENT_VERSION_UNSUPPORTED', '$.schemaVersion', 'Unsupported schema version')
    return errors
  }
  // Success and error cannot coexist, even though consumers ignore unknown optional fields.
  if (value && Object.hasOwn(value, 'error') && Object.hasOwn(value, 'contents'))
    add('CONTENT_SCHEMA_INVALID', '$', 'Mixed success and error')
  // `ifVersion` answered by a relay that found nothing changed: the version, and nothing else.
  if (value?.notModified === true) {
    errors.push(...shape(value, schema.$defs.notModified))
    if (Object.hasOwn(value, 'contents'))
      add('CONTENT_SCHEMA_INVALID', '$.contents', 'notModified carries no contents')
    return errors
  }
  // A projected envelope (`fields=`, trimmed by the relay) keeps its envelope whole; each content
  // keeps only the keys asked for, and always the id that addresses it.
  if (value && Array.isArray(value.projection) && Array.isArray(value.contents)) {
    errors.push(...shape({ ...value, contents: [] }, schema))
    value.contents.forEach((content, i) => {
      if (typeof content?.id !== 'string' || content.id === '')
        add('CONTENT_SCHEMA_INVALID', `$.contents[${i}].id`, 'A projected content keeps its id')
    })
    uniqueIn(value.contents, 'id', '$.contents', add)
    return errors
  }
  const structural = shape(value, schema)
  errors.push(...structural)
  if (!structural.length && value?.error?.links) {
    const error = value.error
    if (error.code !== 'CONTENT_FIELD_TOO_LARGE' || error.field?.key !== 'bodyHtml' || !error.snapshot)
      add(
        'CONTENT_SCHEMA_INVALID',
        '$.error.links',
        'Block discovery requires an oversized body and its snapshot'
      )
    try {
      const url = new URL(error.links.firstBlock)
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.hash ||
        url.searchParams.get('id') !== error.field?.contentId ||
        !url.searchParams.get('blockId') ||
        !url.searchParams.get('blocksCursor') ||
        [...url.searchParams.keys()].some((key) => !['id', 'blockId', 'blocksCursor'].includes(key))
      )
        throw new Error('Invalid block discovery link')
    } catch {
      add(
        'CONTENT_SCHEMA_INVALID',
        '$.error.links.firstBlock',
        'Expected a credential-free snapshot-bound block link'
      )
    }
  }
  if (structural.length || !value?.contents) return errors
  const unique = (rows, key, path) => uniqueIn(rows, key, path, add)
  const locale = (tag, path) => canonicalLocale(tag, path, add)
  const pagination = (page, count, path) => {
    if (!page) return
    if (count > page.limit || (page.total !== null && page.total < count))
      add('CONTENT_PAGINATION_INVALID', path, 'Pagination contradicts returned count')
  }
  const locales = value.site.locales
  declaredLocales(locales, value.site.defaultLocale, '$.site', add)
  let origin
  try {
    const url = new URL(value.site.url)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error('Invalid origin')
    origin = url.origin
  } catch {
    add('CONTENT_LINK_INVALID', '$.site.url', 'Expected HTTP site URL')
  }
  unique(value.contents, 'id', '$.contents')
  value.contents.forEach((content, ci) => {
    const p = `$.contents[${ci}]`
    locale(content.locale, `${p}.locale`)
    if (content.locale !== null && !locales.includes(content.locale))
      add('CONTENT_LOCALE_INVALID', `${p}.locale`, 'Locale is not declared by site')
    for (const key of ['self', 'next']) {
      const link = content.links[key]
      if (typeof link !== 'string') continue // An unknown optional extension is not a link definition.
      try {
        const url = new URL(link, value.site.url)
        if (
          url.origin !== origin ||
          url.username ||
          url.password ||
          url.hash ||
          !['http:', 'https:'].includes(url.protocol)
        )
          throw new Error('Unsafe link')
      } catch {
        add('CONTENT_LINK_INVALID', `${p}.links.${key}`, 'Link must stay on site origin')
      }
    }
    unique(content.fields ?? [], 'key', `${p}.fields`)
    unique(content.blocks ?? [], 'id', `${p}.blocks`)
    unique(content.blocks ?? [], 'key', `${p}.blocks`)
    unique(content.blocks ?? [], 'position', `${p}.blocks`)
    unique(content.images ?? [], 'id', `${p}.images`)
    pagination(content.blocksPagination, (content.blocks ?? []).length, `${p}.blocksPagination`)
    if (content.detailState === 'complete' && content.blocksPagination?.nextCursor)
      add('CONTENT_PARTIAL_REQUIRED', p, 'Complete content has more blocks')
    for (const [bi, block] of (content.blocks ?? []).entries()) {
      const bp = `${p}.blocks[${bi}]`
      unique(block.fields, 'key', `${bp}.fields`)
      unique(block.items, 'id', `${bp}.items`)
      unique(block.items, 'position', `${bp}.items`)
      pagination(block.itemsPagination, block.items.length, `${bp}.itemsPagination`)
      for (const [ii, item] of block.items.entries()) unique(item.fields, 'key', `${bp}.items[${ii}].fields`)
      if (content.detailState === 'complete' && block.itemsPagination?.nextCursor)
        add('CONTENT_PARTIAL_REQUIRED', bp, 'Complete content has more items')
    }
    relayExtensionErrors(content, p, add)
  })
  if (value.contents.length > value.pagination.limit)
    add('CONTENT_PAGINATION_INVALID', '$.pagination', 'Limit exceeded')
  if (value.pagination.total !== null && value.pagination.total < value.contents.length)
    add('CONTENT_PAGINATION_INVALID', '$.pagination.total', 'Total below returned count')
  if (value.completeness.status === 'complete' && value.completeness.unresolved.length)
    add('CONTENT_COMPLETENESS_INVALID', '$.completeness', 'Complete coverage has unresolved entries')
  return errors
}

/**
 * Validate a fully collected, authorized reference scope supplied by the adapter/test harness.
 * Not every target must be on the current page. Scope may include summaries of readable targets
 * outside a filtered listing. Supplying scope is evidence from the caller, NOT an ACL check.
 */
export function validateContentGraph(contents) {
  const errors = []
  const add = (code, path, message) => errors.push({ code, path, message })
  if (!Array.isArray(contents) || !jsonValue(contents))
    return [{ code: 'CONTENT_SCHEMA_INVALID', path: '$', message: 'Expected contents array' }]
  contents.forEach((c, i) => errors.push(...shape(c, schema.$defs.content, `$[${i}]`)))
  if (errors.length) return errors
  const byId = new Map()
  contents.forEach((c, i) => {
    if (byId.has(c.id)) add('CONTENT_DUPLICATE_ID', `$[${i}].id`, 'Duplicate content across pages')
    byId.set(c.id, c)
  })
  const target = (id, path) => {
    const c = byId.get(id)
    if (!c) add('CONTENT_REFERENCE_INVALID', path, 'Target missing from authorized scope')
    return c
  }
  contents.forEach((c, i) => {
    relayExtensionErrors(c, `$[${i}]`, add)
    for (const [bi, b] of (c.blocks ?? []).entries()) {
      const path = `$[${i}].blocks[${bi}]`
      if (b.sharedContentId !== null) {
        const shared = target(b.sharedContentId, path)
        if (shared && (shared.type !== 'shared' || shared.id === c.id))
          add('CONTENT_SHARED_INVALID', path, 'Expected a separate shared content source')
      }
      for (const item of b.items) if (item.contentId !== null) target(item.contentId, path)
    }
    for (const r of c.relations ?? []) {
      const other = target(r.contentId, `$[${i}].relations`)
      if (
        other &&
        r.type === 'translation' &&
        (other.id === c.id ||
          c.locale === null ||
          other.locale === null ||
          c.locale === other.locale ||
          c.translationGroupId === null ||
          c.translationGroupId !== other.translationGroupId)
      )
        add(
          'CONTENT_TRANSLATION_INVALID',
          `$[${i}].relations`,
          'Translation needs distinct locales and a confirmed group'
        )
    }
    for (const media of c.images ?? [])
      for (const usage of media.usages) {
        const owner = target(usage.contentId, `$[${i}].images`)
        const block = owner?.blocks?.find((b) => b.id === usage.blockId)
        if (usage.blockId !== null && !block)
          add(
            'CONTENT_REFERENCE_INVALID',
            `$[${i}].images`,
            'Missing usage block; supply detail in reference scope'
          )
        if (usage.itemId !== null && !block?.items.some((item) => item.id === usage.itemId))
          add('CONTENT_REFERENCE_INVALID', `$[${i}].images`, 'Missing usage item')
      }
  })
  return errors
}

/**
 * Validate one `tracy-content-describe/v1` document: shape, the shared byte budget, canonical
 * declared locales, unique identities (types, block kinds, fields within a kind, capabilities),
 * the Tracy capability namespace, and that `permissions.apply` and the slot-write capability
 * agree. It proves nothing about the viewer's real seat or the Claude Cowork plugin's running code.
 */
export function validateDescribe(value, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const errors = []
  const add = (code, path, message) => errors.push({ code, path, message })
  if (!jsonValue(value)) return [{ code: 'CONTENT_SCHEMA_INVALID', path: '$', message: 'Expected JSON data' }]
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('maxBytes must be positive')
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxBytes)
    add('CONTENT_RESPONSE_TOO_LARGE', '$', 'Response exceeds byte budget')
  if (value?.schemaVersion !== DESCRIBE_SCHEMA_VERSION) {
    add('CONTENT_VERSION_UNSUPPORTED', '$.schemaVersion', 'Unsupported schema version')
    return errors
  }
  const structural = shape(value, schema.$defs.describe)
  errors.push(...structural)
  if (structural.length) return errors
  declaredLocales(value.site.locales, value.site.defaultLocale, '$.site', add)
  declaredLocales(value.i18n.locales, value.i18n.defaultLocale, '$.i18n', add)
  uniqueIn(value.types, 'type', '$.types', add)
  value.types.forEach((entry, i) => {
    if (entry.next == null) return
    const path = `$.types[${i}].next`
    if (value.protocol.cowork.capability !== 'v1')
      add('READ_NEXT_UNSUPPORTED', path, 'A read call requires a supported content Claude Cowork plugin')
    // The call is executable as advertised: no placeholder, locale guess, write action or
    // extra selector that could turn this type listing into a different query.
    if (
      entry.next.params.type !== entry.type ||
      Object.keys(entry.next.params).length !== 1 ||
      Object.keys(entry.next).some((key) => !['tool', 'action', 'params'].includes(key))
    )
      add('READ_NEXT_TYPE_MISMATCH', path, 'Expected a read call with only this content type')
  })
  uniqueIn(value.blockKinds, 'kind', '$.blockKinds', add)
  value.blockKinds.forEach((k, i) => uniqueIn(k.fields, 'key', `$.blockKinds[${i}].fields`, add))
  uniqueIn(value.capabilities, 'name', '$.capabilities', add)
  value.capabilities.forEach((c, i) => {
    if (!c.name.startsWith(CAPABILITY_PREFIX) || c.name.length === CAPABILITY_PREFIX.length)
      add('CAPABILITY_NAME_INVALID', `$.capabilities[${i}].name`, `Expected a ${CAPABILITY_PREFIX}* name`)
  })
  if (value.permissions.apply !== value.capabilities.some((c) => c.name === WRITE_CAPABILITY))
    add(
      'APPLY_CAPABILITY_MISMATCH',
      '$.permissions.apply',
      `Apply permission and the ${WRITE_CAPABILITY} capability must agree`
    )
  return errors
}

/**
 * Validate one `tracy-content-pages/v1` document (`content.read {view: "pages"}`): shape, the shared
 * byte budget, the site's declared locales, and one row per content id. Every row has an address:
 * a content without one is not a page a customer can name.
 */
export function validatePages(value, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const errors = []
  const add = (code, path, message) => errors.push({ code, path, message })
  if (!jsonValue(value)) return [{ code: 'CONTENT_SCHEMA_INVALID', path: '$', message: 'Expected JSON data' }]
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('maxBytes must be positive')
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxBytes)
    add('CONTENT_RESPONSE_TOO_LARGE', '$', 'Response exceeds byte budget')
  if (value?.schemaVersion !== PAGES_SCHEMA_VERSION) {
    add('CONTENT_VERSION_UNSUPPORTED', '$.schemaVersion', 'Unsupported schema version')
    return errors
  }
  const structural = shape(value, schema.$defs.pages)
  errors.push(...structural)
  if (structural.length) return errors
  declaredLocales(value.site.locales, value.site.defaultLocale, '$.site', add)
  uniqueIn(value.pages, 'id', '$.pages', add)
  return errors
}

/**
 * Validate one `tracy-content-changes/v1` document (`content.read {changedSince}`): shape, byte
 * budget, declared locales, one row per content id, and no id both changed and removed.
 */
export function validateChanges(value, { maxBytes = DEFAULT_MAX_BYTES } = {}) {
  const errors = []
  const add = (code, path, message) => errors.push({ code, path, message })
  if (!jsonValue(value)) return [{ code: 'CONTENT_SCHEMA_INVALID', path: '$', message: 'Expected JSON data' }]
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('maxBytes must be positive')
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > maxBytes)
    add('CONTENT_RESPONSE_TOO_LARGE', '$', 'Response exceeds byte budget')
  if (value?.schemaVersion !== CHANGES_SCHEMA_VERSION) {
    add('CONTENT_VERSION_UNSUPPORTED', '$.schemaVersion', 'Unsupported schema version')
    return errors
  }
  const structural = shape(value, schema.$defs.changes)
  errors.push(...structural)
  if (structural.length) return errors
  declaredLocales(value.site.locales, value.site.defaultLocale, '$.site', add)
  uniqueIn(value.changed, 'id', '$.changed', add)
  const changed = new Set(value.changed.map((row) => row.id))
  value.removed.forEach((id, i) => {
    if (changed.has(id))
      add('CONTENT_DUPLICATE_ID', `$.removed[${i}]`, 'A content is either changed or removed')
  })
  return errors
}
