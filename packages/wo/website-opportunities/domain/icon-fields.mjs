// Every icon typed field of a build plan (ticket #595, spec #577): the fields Contract A types `icon` (data kind
// `editorial.item_icon`) on the placed blocks, at every depth (block, item and child list row,
// `picture-block-places.mjs`), each in its SCOPE, the item it illustrates. Pure: the plan's pages, the block
// descriptions and the plan data in, the fields grouped by scope out.
//
// A scope is one content icon field with the other version of its pair, if it has one: each icon is matched on its own
// words. In an item or a child list row (the row is the item: its own fields are its words) an icon reads the text
// fields its `for` names, else every text of its item. At block level an icon reads the text fields its `for` names; a
// block level icon naming nothing has no item to match: it is hidden with `icon_item_undeclared`, never guessed.
//
// A SOCIAL icon is a field that declares `iconOf: "network"` (Contract A), whatever its name. In a child list row it
// stands for the `link` of that same row: the row's rank among the usable links of the row's own kind, from its item
// (`itemLists`) or its block (`lists`), the links that cannot fill a row left out with a note (`icon-row-links.mjs`).
// When the writer writes any row link of a list, the written links replace the plan's for that whole list
// (`icon-selection.mjs`). In an item it stands for that item's social link; at block level for the block's link of its
// rank among the block's network icons, a pair's variant taking its base's. Without the key, an icon is a content icon.
//
// `for` names the text fields a content icon illustrates, at every depth: the words it is matched against.
//
// THEME. A light and dark pair is a base field and its other version, `variantOf: "<base name>"`, both declaring
// `theme` ("light" or "dark", different): the theme the file it stores is shown in. A field declaring it takes exactly
// that one version; a field without it takes both. A variant joins its base's scope, so both files take the same
// icon. A variant naming no field of its scope, or a pair without two different themes, throws `icon_variant_invalid`.
import { IconSelectionError } from './icon-ranking.mjs'
import { itemSocialUrlsOf, placesOfBlock, repeatedNames, socialLinksOf } from './picture-block-places.mjs'
import { linkFieldOf, listLinksOf } from './icon-row-links.mjs'
import { frameOfField } from './picture-frame-size.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const ICON_KIND = 'editorial.item_icon'
/** The themes an icon field may declare it stores. */
export const ICON_THEMES = Object.freeze(['light', 'dark'])

/** Whether a field is an icon typed field of Contract A. */
export const isIconField = (field) => field?.type === 'icon' || field?.kind === ICON_KIND
/** Whether an icon field stands for a social network (Contract A `iconOf: "network"`). */
export const isNetworkIcon = (field) => field?.iconOf === 'network'

/** One icon field's record: its id, frame (Contract A's shape, else a typed error) and declared theme. */
function fieldOf(prefix, f) {
  const id = `${prefix}.${f.name}`
  const { frame, problem } = frameOfField(f)
  if (problem) throw new IconSelectionError('icon_frame_invalid', `${id}: ${problem}`, { at: id })
  if (f.theme !== undefined && !ICON_THEMES.includes(f.theme))
    throw new IconSelectionError('icon_theme_invalid', `${id}: theme is "light" or "dark"`, { at: id })
  return {
    id,
    field: f.name,
    kind: f.kind ?? ICON_KIND,
    storage: f.storage ?? null,
    frame,
    ...(f.theme ? { theme: f.theme } : {}),
    ...(f.variantOf ? { variantOf: f.variantOf } : {})
  }
}

/** A pair holds when its variant names an icon field of the same place and both declare different themes. */
function checkPairs(prefix, icons) {
  for (const f of icons.filter((i) => i.variantOf !== undefined)) {
    const base = icons.find((i) => i.name === f.variantOf && i !== f)
    const id = `${prefix}.${f.name}`
    if (!base || base.variantOf !== undefined)
      throw new IconSelectionError(
        'icon_variant_invalid',
        `${id}: variantOf names no base icon field of its scope`,
        { at: id }
      )
    if (!ICON_THEMES.includes(base.theme) || !ICON_THEMES.includes(f.theme) || base.theme === f.theme)
      throw new IconSelectionError(
        'icon_variant_invalid',
        `${id}: a pair declares a light and a dark theme`,
        { at: id }
      )
  }
}

/** The social link of an item place: a footer row's shown link, else the item's own first social link. */
function itemUrlOf(at, data) {
  if (at.itemKind === 'social') return at.url ?? null
  return itemSocialUrlsOf(data.byId.get(at.item))[0] ?? null
}

/** The field a pair's variant joins (its base), or the field itself. */
const ownOf = (fields, field) => fields.find((f) => f.name === field.variantOf) ?? field

/**
 * The icon fields of a plan, by scope.
 * @param {object[]} pages the plan's pages
 * @param {Map<string, object>} blocks block id -> description (block store or library)
 * @param {{byId: Map<string, object>}} data the plan data (`plan-data.mjs`)
 * @returns {Array<{id: string, page: string, block: string, blockId: string, blockType: string,
 *   case: 'content' | 'social' | 'undeclared', item?: string, row?: string, for?: string[],
 *   social?: {url: string | null, list?: string, linkField?: string, left?: Array<{link: string, reason: string}>},
 *   fields: Array<{id: string, field: string, kind: string, storage: string | null,
 *   frame: {width: number, height: number} | null, theme?: 'light' | 'dark'}>}>}
 */
export function iconScopesOfPlan(pages, blocks, data) {
  const scopes = []
  const lists = new Map()
  for (const page of list(pages))
    for (const block of list(page?.blocks)) {
      const d = blocks.get(block.block) ?? {}
      const scope = (id, at, extra, fields) =>
        scopes.push({
          id,
          page: page.id,
          block: block.id,
          blockId: block.block,
          blockType: block.type,
          ...(at.item ? { item: at.item } : {}),
          ...(at.row ? { row: at.row } : {}),
          ...extra,
          fields: fields.map((f) => fieldOf(at.prefix, f))
        })
      for (const at of placesOfBlock(page, block, d, data)) {
        const icons = at.fields.filter(isIconField)
        const repeated = repeatedNames(icons)
        if (repeated.length)
          throw new IconSelectionError(
            'icon_field_repeated',
            `${at.prefix} declares ${repeated.join(', ')} twice: two icon fields would share one id`,
            { at: at.prefix, fields: repeated }
          )
        checkPairs(at.prefix, icons)
        const content = icons.filter((f) => !isNetworkIcon(f))
        const network = icons.filter(isNetworkIcon)
        // Content icons: each is matched on its own `for`; only a pair's variant joins its base. At block level an icon
        // naming no text field has no item to match. A single content icon of an item or row keeps the place's id.
        const bases = content.filter((f) => f.variantOf === undefined)
        for (const field of content) {
          const own = ownOf(content, field)
          const names = list(own.for)
          const id = at.level !== 'block' && bases.length === 1 ? at.prefix : `${at.prefix}.${own.name}`
          if (at.level === 'block' && !names.length) scope(id, at, { case: 'undeclared' }, [field])
          else scope(id, at, { case: 'content', ...(names.length ? { for: [...names] } : {}) }, [field])
        }
        if (!network.length) continue
        if (at.level === 'item') {
          scope(`${at.prefix}.network`, at, { case: 'social', social: { url: itemUrlOf(at, data) } }, network)
          continue
        }
        if (at.level === 'row') {
          const place = at.prefix.replace(/\.\d+$/, '')
          if (!lists.has(place)) lists.set(place, listLinksOf(at, block, data))
          const { links, left } = lists.get(place)
          const linkField = linkFieldOf(at.fields)?.name
          const social = {
            url: links[at.rank - 1] ?? null,
            list: place,
            ...(linkField ? { linkField } : {}),
            ...(at.rank === 1 && left.length ? { left } : {})
          }
          scope(`${at.prefix}.network`, at, { case: 'social', social }, network)
          continue
        }
        // Block level: each network icon takes the block's link of its rank; a pair's variant takes its base's.
        const links = socialLinksOf(block, data)
        const netBases = network.filter((f) => f.variantOf === undefined)
        for (const field of network) {
          const own = ownOf(network, field)
          const url = links[netBases.indexOf(own)]?.url ?? null
          scope(`${at.prefix}.${own.name}`, at, { case: 'social', social: { url } }, [field])
        }
      }
    }
  // A pair's two fields share one scope: one decision, written in each field's theme.
  const merged = new Map()
  for (const s of scopes) {
    const known = merged.get(s.id)
    if (known) known.fields.push(...s.fields)
    else merged.set(s.id, s)
  }
  return [...merged.values()]
}
