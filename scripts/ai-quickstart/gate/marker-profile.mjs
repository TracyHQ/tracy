// The marker build's input (ticket #585): a needs profile and a plan composition made from an AI quickstart's own
// declarations (block store, page recipes, mapping), never from a template name, so the gate runs on any kit. Every
// value carries a marker code (`marker-codec.mjs`) and the registry remembers what each code stands for. The
// composition places every block of every recipe once, with the most data its block declares, so the real chain
// (rules gate, page writer, picture step, write order) decides what reaches the site, and the gate accounts for it.
// Pure.
import { DATA_ROLES } from '../../../packages/wo/website-opportunities/domain/page-writer-roles.mjs'
import { idOf } from '../../../packages/wo/website-opportunities/domain/plan-data.mjs'
import { BLOCK_TYPES } from '../../../packages/wo/website-opportunities/domain/place-content-roles.mjs'
import { SOCIAL_NETWORKS } from '../../../packages/wo/website-opportunities/domain/icon-social.mjs'
import { itemKindOf, pageShapesOf } from './marker-composition.mjs'
import { questionsOf } from '../../../packages/wo/website-opportunities/domain/needs-profile-questions.mjs'
import {
  emailMarker,
  linkMarker,
  phoneMarker,
  pictureMarker,
  socialMarker,
  textMarker
} from './marker-codec.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const SOURCES = ['site']
/** The business facts a marker profile may hold, and how each is marked. */
const FACT_MARKS = {
  'business.name': (c) => textMarker(c),
  'business.founded_year': null,
  'contact.phone': phoneMarker,
  'contact.email': emailMarker,
  'contact.address': (c) => textMarker(c),
  'contact.hours': (c) => textMarker(c),
  'contact.cta_url': linkMarker
}
const SOCIAL = 'contact.social_url'
const PERSON_SOCIAL = 'person.social_url'
/** The most items or rows of one kind the marker profile holds: enough for every kit block measured so far. */
const MAX_ITEMS = 32
const MAX_ROWS = 4

const isPicture = (kind) => /(?:\.|_)(?:image|logo)$/.test(kind ?? '')
const isLink = (field) => field?.type === 'link' || String(field?.kind ?? '').endsWith('_url')
const fieldsOf = (block) => [
  ...list(block.fields),
  ...list(block.itemFields),
  ...list(block.lists).flatMap((l) => list(l?.fields)),
  ...list(block.itemLists).flatMap((l) => list(l?.fields))
]

/**
 * A code registry: `take(what)` gives the next code and remembers what it stands for; `rewind(n)` forgets every code
 * after the first `n` (a chain run that met a gap gives its codes back).
 */
export function markerRegistry(codeOf) {
  const entries = []
  return {
    entries,
    rewind(n) {
      entries.length = n
    },
    take(what) {
      const code = codeOf(entries.length)
      entries.push({ code, ...what })
      return code
    }
  }
}

/** The network hosts the kit draws an icon for (its `networkIconClasses`), in a fixed order. */
export function networkHostsOf(mapping) {
  const classes = Object.keys(mapping?.networkIconClasses?.classes ?? {})
  const hosts = SOCIAL_NETWORKS.filter((n) => classes.includes(n.network)).map((n) => n.hosts[0])
  return hosts.length ? hosts : [SOCIAL_NETWORKS[0].hosts[0]]
}

const field = (value) => ({ value, sources: SOURCES, confidence: 'single-source' })

function valueOf(f, code, hosts, n) {
  if (f.kind === PERSON_SOCIAL || f.kind === SOCIAL) return socialMarker(hosts[n % hosts.length], code)
  if (isPicture(f.kind)) return `${linkMarker(code)}${pictureMarker(code)}`
  if (isLink(f)) return linkMarker(code)
  if (f.kind === 'contact.phone') return phoneMarker(code)
  if (f.kind === 'contact.email') return emailMarker(code)
  return textMarker(code)
}

/** The data roles of one item kind across the store: item fields and item list fields the build copies from data. */
function itemRolesOf(blocks, kind) {
  const roles = new Map()
  const rowRoles = new Map()
  for (const b of blocks.filter((b) => itemKindOf(b) === kind)) {
    for (const f of list(b.itemFields))
      if ((DATA_ROLES.includes(f.kind) || isPicture(f.kind)) && f.type !== 'design') roles.set(f.kind, f)
    for (const l of [...list(b.itemLists), ...(BLOCK_TYPES[b.type]?.itemKind ? list(b.lists) : [])])
      for (const f of list(l?.fields))
        if (f.kind === PERSON_SOCIAL) roles.set(f.kind, f)
        else if (DATA_ROLES.includes(f.kind) && f.type !== 'design') rowRoles.set(f.kind, f)
    for (const f of list(b.fields))
      if (
        DATA_ROLES.includes(f.kind) &&
        f.kind.split('.')[0] !== 'business' &&
        !f.kind.startsWith('contact.')
      )
        roles.set(f.kind, f)
  }
  return { roles: [...roles.values()], rowRoles: [...rowRoles.values()] }
}

/**
 * How many items of one kind the composition needs: the most a page shows at once (the sum of its blocks' maximums),
 * and at least one set per created block, since each created block shows items of its own (`marker-composition.mjs`).
 */
function itemCountOf(recipes, byId, kind) {
  const created = new Map()
  for (const b of byId.values())
    if (b.placement === 'created' && itemKindOf(b) === kind) created.set(b.id, b.items?.max ?? 1)
  let most = [...created.values()].reduce((sum, n) => sum + n, 0)
  for (const r of recipes) {
    const n = list(r.blocks)
      .map((id) => byId.get(id))
      .filter((b) => b && itemKindOf(b) === kind)
      .reduce((sum, b) => sum + (b.items?.max ?? 1), 0)
    most = Math.max(most, n)
  }
  return Math.min(most, MAX_ITEMS)
}

/**
 * The marker needs profile of a kit.
 * @param {{blockStore: object, pageRecipes: object, mapping?: object}} kit
 * @param {ReturnType<typeof markerRegistry>} registry
 */
export function markerProfile({ blockStore, pageRecipes, mapping }, registry) {
  const blocks = list(blockStore?.blocks)
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const recipes = pageShapesOf(pageRecipes, mapping)
  const hosts = networkHostsOf(mapping)
  const declared = new Set(blocks.flatMap(fieldsOf).map((f) => f.kind))
  const facts = {}
  for (const [kind, mark] of Object.entries(FACT_MARKS))
    if (mark && (kind === 'business.name' || declared.has(kind)))
      facts[kind] = [field(mark(registry.take({ what: 'fact', kind, id: idOf(kind) })))]
  const socialMost = Math.max(
    1,
    ...blocks.map((b) =>
      fieldsOf(b).some((f) => f.kind === SOCIAL) ? Math.max(b.items?.max ?? 1, MAX_ROWS) : 0
    )
  )
  facts[SOCIAL] = Array.from({ length: Math.min(socialMost, MAX_ITEMS) }, (_, n) =>
    field(
      socialMarker(
        hosts[n % hosts.length],
        registry.take({ what: 'fact', kind: SOCIAL, id: n === 0 ? idOf(SOCIAL) : `${idOf(SOCIAL)}-${n + 1}` })
      )
    )
  )
  const items = {}
  const kinds = [...new Set(blocks.map(itemKindOf).filter(Boolean))]
  for (const kind of kinds) {
    const { roles, rowRoles } = itemRolesOf(blocks, kind)
    const count = itemCountOf(recipes, byId, kind)
    items[kind] = Array.from({ length: count }, (_, n) => {
      const id = `${idOf(kind)}-marker-${n + 1}`
      const fields = {}
      for (const f of roles) {
        const code = registry.take({ what: 'item', item: id, kind: f.kind })
        fields[f.kind] = field(
          f.kind === PERSON_SOCIAL
            ? Array.from({ length: MAX_ROWS }, (_, r) =>
                socialMarker(
                  hosts[r % hosts.length],
                  r === 0 ? code : registry.take({ what: 'row', item: id, kind: f.kind })
                )
              )
            : valueOf(f, code, hosts, n)
        )
      }
      const rows = rowRoles.length
        ? Array.from({ length: MAX_ROWS }, (_, r) => ({
            id: `${id}-row-${r + 1}`,
            fields: Object.fromEntries(
              rowRoles.map((f) => [
                f.kind,
                field(valueOf(f, registry.take({ what: 'row', item: id, kind: f.kind }), hosts, r))
              ])
            ),
            sources: SOURCES
          }))
        : undefined
      return { id, kind, fields, sources: SOURCES, confidence: 'single-source', ...(rows ? { rows } : {}) }
    })
  }
  const language = { value: 'en', options: ['en'], mixed: false, bySource: { site: 'en' }, unread: [] }
  const sources = [{ id: 'site', origin: 'website', ref: linkMarker(registry.take({ what: 'source' })) }]
  return {
    schema: 'tracy-needs-profile/v1',
    roleVocabularyVersion: 'place-content-roles/3',
    prompt: null,
    trustOrder: ['website', 'answer', 'google', 'social'],
    sources,
    language,
    facts,
    items,
    conflicts: [],
    questions: questionsOf({ facts, items, conflicts: [], sources, language }).questions,
    dropped: []
  }
}
