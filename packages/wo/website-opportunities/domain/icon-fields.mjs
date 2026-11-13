// Every icon typed field of a build plan (ticket #595, spec #577): the fields Contract A types `icon` (data kind
// `editorial.item_icon`) on the placed blocks, at every depth (block, item and child list row,
// `picture-block-places.mjs`), each in its SCOPE, the item it illustrates. Pure: the plan's pages, the block
// descriptions and the plan data in, the fields grouped by scope out.
//
// A scope is one item a block shows (its item fields: JA Boxing's features block gives each of its four items two icon
// fields, the template's two theme files of one icon), one row of a child list (the row is the item: its own fields are
// its words), or the block level fields a field names in `for` (the text fields it illustrates). A block level icon
// field naming nothing has no item to match: it is hidden with `icon_item_undeclared`, never guessed.
//
// A SOCIAL icon is a field that declares `iconOf: "network"` (Contract A), whatever its name. In a child list row it
// stands for the `link` of that same row (a `contact.social_url` or `person.social_url` field): the row's rank among the
// links of its item (an `itemLists` row) or of its block (a `lists` row); the written copy of the row's link, when the
// writer gives one, wins (`icon-selection.mjs`). In an item it stands for that item's social link; at block level for
// the block's link of its rank among the block's network icons. Without the key, an icon field is a content icon.
//
// `for` names the text fields a content icon illustrates, at every depth: the words it is matched against.
//
// THEME. A light and dark pair is a base field and its other version, `variantOf: "<base name>"`, both declaring
// `theme` ("light" or "dark", different): the theme the file it stores is shown in. A field declaring it takes exactly
// that one version; a field without it takes both. A variant joins its base's scope, so both files take the same
// icon. A variant naming no field of its scope, or a pair without two different themes, throws `icon_variant_invalid`.
import { IconSelectionError } from './icon-ranking.mjs'
import {
  itemSocialUrlsOf,
  placesOfBlock,
  repeatedNames,
  SOCIAL_URL_KINDS,
  socialLinksOf
} from './picture-block-places.mjs'
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
    if (!base)
      throw new IconSelectionError(
        'icon_variant_invalid',
        `${id}: variantOf names no icon field of its scope`,
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

/** The text fields the content icons of an item or row name in `for`, or null when none names any. */
function forOf(content) {
  const names = [...new Set(content.flatMap((f) => list(f.for)))]
  return names.length ? names : null
}

/**
 * The social link of an item or row place: a footer row's shown link; an item's own first social link; a row's link of
 * its rank among its item's links (`itemLists`) or its block's (`lists`).
 */
function urlOf(at, block, data) {
  if (at.itemKind === 'social' && at.level === 'item') return at.url ?? null
  if (at.level === 'item') return itemSocialUrlsOf(data.byId.get(at.item))[0] ?? null
  const links = at.item
    ? itemSocialUrlsOf(data.byId.get(at.item))
    : socialLinksOf(block, data).map((l) => l.url)
  return links[at.rank - 1] ?? null
}
/** The name of a row's own link field: the social link the row's network icon stands for. */
const linkFieldOf = (at) => at.fields.find((f) => SOCIAL_URL_KINDS.includes(f?.kind))?.name ?? null

/**
 * The icon fields of a plan, by scope.
 * @param {object[]} pages the plan's pages
 * @param {Map<string, object>} blocks block id -> description (block store or library)
 * @param {{byId: Map<string, object>}} data the plan data (`plan-data.mjs`)
 * @returns {Array<{id: string, page: string, block: string, blockId: string, blockType: string,
 *   case: 'content' | 'social' | 'undeclared', item?: string, row?: string, for?: string[],
 *   social?: {url: string | null, linkField?: string}, fields: Array<{id: string, field: string, kind: string, storage: string | null,
 *   frame: {width: number, height: number} | null, theme?: 'light' | 'dark'}>}>}
 */
export function iconScopesOfPlan(pages, blocks, data) {
  const scopes = []
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
        if (at.level !== 'block') {
          const names = forOf(content)
          if (content.length)
            scope(at.prefix, at, { case: 'content', ...(names ? { for: names } : {}) }, content)
          const linkField = at.level === 'row' ? linkFieldOf(at) : null
          const social = { url: urlOf(at, block, data), ...(linkField ? { linkField } : {}) }
          if (network.length) scope(`${at.prefix}.network`, at, { case: 'social', social }, network)
          continue
        }
        // Block level: network icons pair with the block's link of their rank; content icons group by the text fields
        // they name, a variant with its base.
        const links = socialLinksOf(block, data)
        network.forEach((field, rank) => {
          scope(
            `${at.prefix}.${field.name}`,
            at,
            { case: 'social', social: { url: links[rank]?.url ?? null } },
            [field]
          )
        })
        for (const field of content) {
          const own = content.find((f) => f.name === field.variantOf) ?? field
          if (list(own.for).length)
            scope(`${at.prefix}.${list(own.for).join('+')}`, at, { case: 'content', for: [...own.for] }, [
              field
            ])
          else scope(`${at.prefix}.${own.name}`, at, { case: 'undeclared' }, [field])
        }
      }
    }
  // Block level fields naming the same text fields share one scope, as the two theme files of one item do.
  const merged = new Map()
  for (const s of scopes) {
    const known = merged.get(s.id)
    if (known) known.fields.push(...s.fields)
    else merged.set(s.id, s)
  }
  return [...merged.values()]
}
