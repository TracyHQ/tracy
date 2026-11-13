// The keys a field of the AI quickstart block store may carry beyond its type, and the rules they hold (#583). Pure
// helpers of the block store check (`ai-quickstart-contract.mjs`); every allowed value is listed here and documented
// in docs/references/ai-quickstart-contract.md, so no key can carry free text a build would have to guess at.
//
// - `storage` (icon fields): how the template keeps the icon.
// - `iconOf` (icon fields): what the icon stands for when it is not chosen for item content.
// - `textOf` (text fields): what the words name when they are not written for the content (#584): `network`, the
//   display name of the social network of the scope's link ("Facebook"), so they never carry a business's words.
// - `for` (icon fields): the text fields of the same scope the icon illustrates.
// - `variantOf` + `theme` (icon and image fields): the light and the dark version of one picture.
// - `transparent` (image and icon fields, #584): `true` when the template draws the picture on a transparent ground
//   (a cut-out over the hero, a logo, a signature): the build writes a PNG or WebP whose ground is transparent, and
//   the door refuses an opaque file there (SLOT_IMAGE_OPAQUE).
// - `derived`: what a field with no stored place is derived from, one of `DERIVED_FORMS`.
// - `keyAt` + `pageType`: a row keyed to a page, and where the key is stored.
// A scope is the block's own fields, the item fields (one item), or the fields of one child list (one row).

export const ICON_STORAGE = Object.freeze(['image-file', 'class-name'])
export const ICON_OF = Object.freeze(['network'])
export const TEXT_OF = Object.freeze(['network'])
export const THEMES = Object.freeze(['light', 'dark'])
/** The documented forms of `derived`. Anything else is a stored place left undeclared. */
export const DERIVED_FORMS = Object.freeze({
  'the item page address': 'the address of the page the build creates for the item',
  'the page address': 'the address of the page a menu item opens',
  'the page of the row': 'the page a stored row belongs to; the build writes that page at keyAt'
})
export const KEYED = 'the page of the row'

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const label = (value, index) => (isName(value) ? value : String(index))
const quoted = (list) => list.map((v) => JSON.stringify(v)).join(' or ')
const SCOPE_NOUN = { block: 'block', item: 'item', list: 'list' }

/** The record a stored place sits on: `article-16.15` and `module-163.12@/html/body/div/a[1]/@href` give theirs. */
export const recordOf = (place) =>
  String(place)
    .split('@')[0]
    .replace(/\.[^.]*$/, '')

/** The record of a block: the record the draft took it from, else the one record its own fields are stored on. */
export function blockRecordOf(block) {
  if (isName(block?.from?.entity)) return block.from.entity
  const records = new Set(
    (Array.isArray(block?.fields) ? block.fields : [])
      .filter((f) => isName(f?.slot))
      .map((f) => recordOf(f.slot))
  )
  return records.size === 1 ? [...records][0] : null
}

const isLocation = (loc) =>
  isObject(loc) &&
  isName(loc.entity) &&
  isName(loc.column) &&
  (loc.jsonPath === undefined || Array.isArray(loc.jsonPath))

/** The rows per parent place of a list: those of its first field with stored places, or null. */
function listRowsOf(list) {
  for (const f of Array.isArray(list?.fields) ? list.fields : []) {
    if (!Array.isArray(f?.slots) || !f.slots.every(Array.isArray)) continue
    return f.slots.map((rows) => rows.length)
  }
  return null
}

/** The rules of one scope: `scope` is {kind, fields, at(field, i), records, rows}. */
function scopeProblems(scope, report, { library }) {
  const fields = scope.fields.filter(isObject)
  const byName = new Map(fields.filter((f) => isName(f.name)).map((f) => [f.name, f]))
  const noun = SCOPE_NOUN[scope.kind]
  const hasText = fields.some((f) => f.type === 'text')
  const pairedBases = new Set(fields.filter((f) => isName(f.variantOf)).map((f) => f.variantOf))
  fields.forEach((field, i) => {
    const at = scope.at(field, i)
    const icon = field.type === 'icon'
    if (field.storage !== undefined && !icon)
      report(
        `${at}.storage`,
        'storage is a key of icon fields: only an icon field says how the template keeps it'
      )
    else if (field.storage !== undefined && !ICON_STORAGE.includes(field.storage))
      report(
        `${at}.storage`,
        `${JSON.stringify(field.storage)} is not a storage value: ${quoted(ICON_STORAGE)}`
      )
    else if (icon && !library && field.storage === undefined)
      report(
        `${at}.storage`,
        `an icon field says how the template keeps the icon: storage ${quoted(ICON_STORAGE)}`
      )
    if (field.iconOf !== undefined && (!icon || !ICON_OF.includes(field.iconOf)))
      report(
        `${at}.iconOf`,
        `${JSON.stringify(field.iconOf)} is not an iconOf value of an icon field: ${quoted(ICON_OF)}`
      )
    if (field.transparent !== undefined && (field.transparent !== true || (!icon && field.type !== 'image')))
      report(
        `${at}.transparent`,
        'transparent is true on an image or icon field the template draws on a transparent ground, and absent otherwise'
      )
    if (field.textOf !== undefined) {
      if (field.type !== 'text' || !TEXT_OF.includes(field.textOf))
        report(
          `${at}.textOf`,
          `${JSON.stringify(field.textOf)} is not a textOf value of a text field: ${quoted(TEXT_OF)}`
        )
      else if (!fields.some((f) => f.type === 'link'))
        report(
          `${at}.textOf`,
          `textOf "network" names the network of a link: no link field in the same ${noun}`
        )
    }
    if (field.for !== undefined) {
      if (!icon || !Array.isArray(field.for) || field.for.length === 0)
        report(`${at}.for`, 'for is a non-empty list of the text fields an icon field illustrates')
      else
        for (const name of field.for)
          if (byName.get(name)?.type !== 'text')
            report(`${at}.for`, `${JSON.stringify(name)} is not a text field of the same ${noun}`)
    }
    if (icon && field.iconOf === undefined && field.for === undefined && (scope.kind === 'block' || !hasText))
      report(
        at,
        scope.kind === 'block'
          ? 'an icon at block level names the text fields it illustrates (for), or stands for a network (iconOf): otherwise it has no content to be chosen from'
          : `no text field in the same ${noun}: name the text fields the icon illustrates (for), otherwise it has no content to be chosen from`
      )
    pairProblems(field, at, { byName, noun, pairedBases }, report)
    derivedProblems(field, at, scope, report)
  })
}

/** `variantOf` and `theme`: two versions of one picture, linked, each marked light or dark. */
function pairProblems(field, at, { byName, noun, pairedBases }, report) {
  const pictured = field.type === 'icon' || field.type === 'image'
  if (field.theme !== undefined && (!pictured || !THEMES.includes(field.theme)))
    report(
      `${at}.theme`,
      `${JSON.stringify(field.theme)} is not a theme of an icon or image field: ${quoted(THEMES)}`
    )
  const base = isName(field.variantOf) ? byName.get(field.variantOf) : null
  if (field.variantOf !== undefined) {
    if (!base || base === field)
      return report(
        `${at}.variantOf`,
        `${JSON.stringify(field.variantOf)} names no field of the same ${noun}`
      )
    if (base.variantOf !== undefined)
      report(
        `${at}.variantOf`,
        `${base.name} is itself a variant: a variant names the field of the pair without one`
      )
    if (base.type !== field.type || base.storage !== field.storage)
      report(`${at}.variantOf`, `a variant has the type and storage of ${base.name}`)
    if (JSON.stringify(base.frame ?? null) !== JSON.stringify(field.frame ?? null))
      report(`${at}.variantOf`, `a variant shares the frame of ${base.name}`)
    if (field.for !== undefined && JSON.stringify(field.for) !== JSON.stringify(base.for))
      report(`${at}.for`, `a variant illustrates what ${base.name} illustrates: the same for`)
    if (field.theme === undefined)
      report(`${at}.theme`, 'both versions of a pair carry a theme: "light" or "dark"')
    if (base.theme === undefined)
      report(
        `${at.replace(/\[[^\]]*\]$/, `[${base.name}]`)}.theme`,
        'both versions of a pair carry a theme: "light" or "dark"'
      )
    else if (field.theme === base.theme)
      report(`${at}.theme`, `same theme as ${base.name}: the two versions of a pair differ in theme`)
    return
  }
  if (field.theme !== undefined && !pairedBases.has(field.name))
    report(`${at}.theme`, 'a theme marks one version of a pair: name the other version with variantOf')
}

/** `derived`, `keyAt` and `pageType`. */
function derivedProblems(field, at, scope, report) {
  if (field.derived !== undefined && !Object.hasOwn(DERIVED_FORMS, field.derived))
    report(
      `${at}.derived`,
      `${JSON.stringify(field.derived)} is not a documented form of derived: one of ${quoted(Object.keys(DERIVED_FORMS))}`
    )
  const keyed = field.derived === KEYED
  if (!keyed) {
    if (field.keyAt !== undefined)
      report(`${at}.keyAt`, `keyAt belongs to a field derived as ${JSON.stringify(KEYED)}`)
    if (field.pageType !== undefined)
      report(`${at}.pageType`, `pageType belongs to a field derived as ${JSON.stringify(KEYED)}`)
    return
  }
  if (field.type !== 'link') report(`${at}.type`, 'a field derived as the page of the row is a link')
  if (field.keyAt === undefined)
    return report(
      `${at}.keyAt`,
      'a field derived as the page of the row names where the key is stored (keyAt)'
    )
  const onRecord = (loc, p, where) => {
    const record = scope.records?.[p]
    if (isName(record) && loc.entity !== record)
      report(where, `key place on ${loc.entity} is not on record ${record} of parent place ${p}`)
  }
  if (scope.kind === 'block') {
    if (!isLocation(field.keyAt))
      return report(`${at}.keyAt`, 'keyAt is a location {entity, column, jsonPath}')
    return onRecord(field.keyAt, 0, `${at}.keyAt`)
  }
  const perPlace = scope.kind === 'item' ? field.keyAt?.map?.((loc) => [loc]) : field.keyAt
  if (!Array.isArray(perPlace) || !perPlace.every((rows) => Array.isArray(rows) && rows.every(isLocation)))
    return report(
      `${at}.keyAt`,
      scope.kind === 'item'
        ? 'keyAt lists one location per item'
        : 'keyAt lists, per parent place, one location per row'
    )
  const rows = perPlace.map((r) => r.length)
  if (scope.rows && JSON.stringify(rows) !== JSON.stringify(scope.rows))
    return report(
      `${at}.keyAt`,
      `rows per parent place ${rows.join(', ')} differ from the rows of the list: ${scope.rows.join(', ')}`
    )
  perPlace.forEach((locs, p) => {
    for (const loc of locs) onRecord(loc, p, `${at}.keyAt`)
  })
}

/** Every child slot sits on the record of its parent place. */
function recordProblems(list, listAt, records, report) {
  for (const [i, field] of (Array.isArray(list.fields) ? list.fields : []).entries()) {
    if (!Array.isArray(field?.slots)) continue
    field.slots.forEach((rows, p) => {
      const record = records?.[p]
      if (!isName(record) || !Array.isArray(rows)) return
      for (const place of rows)
        if (isName(place) && recordOf(place) !== record)
          report(
            `${listAt}.fields[${label(field.name, i)}].slots`,
            `${place} is not on record ${record} of parent place ${p}: a child field is stored on its parent's record`
          )
    })
  }
}

/** The scopes of a block: its fields, its item fields, and every child list, with the records of their places. */
export function scopesOf(block, at) {
  const scopes = []
  const fieldAt = (key) => (f, i) => `${at}.${key}[${label(f?.name, i)}]`
  scopes.push({
    kind: 'block',
    fields: block.fields ?? [],
    at: fieldAt('fields'),
    records: [blockRecordOf(block)]
  })
  const itemFields = Array.isArray(block.itemFields) ? block.itemFields : []
  const itemRecords = (itemFields.find((f) => Array.isArray(f?.slots))?.slots ?? []).map((s) =>
    isName(s) ? recordOf(s) : null
  )
  if (itemFields.length)
    scopes.push({ kind: 'item', fields: itemFields, at: fieldAt('itemFields'), records: itemRecords })
  const lists = (owner, ownerAt, key, records) => {
    for (const [i, list] of (Array.isArray(owner?.[key]) ? owner[key] : []).entries()) {
      if (!isObject(list) || !Array.isArray(list.fields)) continue
      const listAt = `${ownerAt}.${key}[${label(list.name, i)}]`
      const rows = listRowsOf(list)
      scopes.push({
        kind: 'list',
        list,
        listAt,
        fields: list.fields,
        at: (f, j) => `${listAt}.fields[${label(f?.name, j)}]`,
        records,
        rows
      })
      const rowRecords = rows ? rows.flatMap((n, p) => Array(n).fill(records?.[p] ?? null)) : null
      lists(list, listAt, 'lists', rowRecords)
    }
  }
  lists(block, at, 'lists', [blockRecordOf(block)])
  lists(block, at, 'itemLists', itemRecords.length ? itemRecords : null)
  return scopes
}

/** The problems of the field keys of one block. */
export function fieldKeyProblems(block, at, report, { library = false } = {}) {
  for (const scope of scopesOf(block, at)) {
    scopeProblems(scope, report, { library })
    if (scope.kind === 'list') recordProblems(scope.list, scope.listAt, scope.records, report)
  }
}

/**
 * Every stored place more than one field uses, with the smallest text limit among them: the limit a build uses, so
 * the copy fits every block and page that draws the place.
 * @returns {Array<{place: string, limit?: number, uses: Array<{block: string, field: string, type: string, limit?: number, at?: string}>}>}
 */
export function sharedPlacesOf(blockStore, { withAt = false } = {}) {
  const uses = new Map()
  const blocks = Array.isArray(blockStore?.blocks) ? blockStore.blocks : []
  blocks.forEach((block, b) => {
    if (!isObject(block)) return
    for (const scope of scopesOf(block, `blocks[${label(block.id, b)}]`))
      scope.fields.forEach((field, i) => {
        if (!isObject(field) || field.type === 'design') return
        const places = new Set(
          [field.slot, ...(Array.isArray(field.slots) ? field.slots.flat(2) : [])].filter(isName)
        )
        for (const place of places) {
          const use = { block: block.id, field: field.name, type: field.type }
          if (Number.isInteger(field.limit)) use.limit = field.limit
          if (withAt) use.at = scope.at(field, i)
          uses.set(place, [...(uses.get(place) ?? []), use])
        }
      })
  })
  const shared = []
  for (const [place, list] of uses) {
    if (list.length < 2) continue
    const limits = list.map((u) => u.limit).filter(Number.isInteger)
    shared.push({ place, ...(limits.length ? { limit: Math.min(...limits) } : {}), uses: list })
  }
  return shared
}

/** One stored place has one type: a place typed differently by two fields is a problem at the second. */
export function sharedPlaceProblems(blockStore, report) {
  for (const { place, uses } of sharedPlacesOf(blockStore, { withAt: true })) {
    const first = uses[0]
    for (const use of uses.slice(1))
      if (use.type !== first.type)
        report(
          use.at,
          `${place} is typed ${first.type} by ${first.block}.${first.field} and ${use.type} here: one stored place has one type`
        )
  }
}
