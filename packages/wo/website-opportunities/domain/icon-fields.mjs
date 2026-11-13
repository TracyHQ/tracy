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
// A SOCIAL icon is a field that declares `iconOf: "network"` (Contract A), whatever its name. In an item or a row it
// stands for that item's social link; at block level it pairs with the social link field of its name prefix
// (`social-1-item-icon` beside `social-1-social-url`), else with the block's link of its rank among the block's network
// icons. Without the key, an icon field is a content icon.
//
// THEME. An icon field may declare `theme: "light"` or `theme: "dark"`: the theme the file it stores is shown in (the
// template's two files of one icon, `item-icon` and `item-icon-2`). A field declaring it takes exactly that one
// version; a field without it takes both, and twin fields of one scope without it are noted `icon_theme_undeclared`
// by the selection. Both twins of a scope always take the same icon.
import { IconSelectionError } from './icon-ranking.mjs'
import { placesOfBlock, repeatedNames, SOCIAL_URL, socialLinksOf } from './picture-block-places.mjs'
import { frameOfField } from './picture-frame-size.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const ICON_KIND = 'editorial.item_icon'
/** The themes an icon field may declare it stores. */
export const ICON_THEMES = Object.freeze(['light', 'dark'])

/** Whether a field is an icon typed field of Contract A. */
export const isIconField = (field) => field?.type === 'icon' || field?.kind === ICON_KIND
/** Whether an icon field stands for a social network (Contract A `iconOf: "network"`). */
export const isNetworkIcon = (field) => field?.iconOf === 'network'
/** The name prefix of a block level field: `social-1-item-icon` gives `social-1-`, `item-icon-3` gives ''. */
const prefixOf = (name) => /^(.*?-\d+-)/.exec(String(name))?.[1] ?? ''

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
    ...(f.theme ? { theme: f.theme } : {})
  }
}

/** The social link of an item or row place: the shown link itself, or the item's own social link field. */
function urlOf(at, data) {
  if (at.itemKind === 'social') return at.url ?? null
  if (at.level !== 'item') return null
  const url = data.byId.get(at.item)?.source?.fields?.[SOCIAL_URL]?.value
  return typeof url === 'string' && url.trim() ? url : null
}

/**
 * The icon fields of a plan, by scope.
 * @param {object[]} pages the plan's pages
 * @param {Map<string, object>} blocks block id -> description (block store or library)
 * @param {{byId: Map<string, object>}} data the plan data (`plan-data.mjs`)
 * @returns {Array<{id: string, page: string, block: string, blockId: string, blockType: string,
 *   case: 'content' | 'social' | 'undeclared', item?: string, row?: string, for?: string[],
 *   social?: {url: string | null}, fields: Array<{id: string, field: string, kind: string, storage: string | null,
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
        const content = icons.filter((f) => !isNetworkIcon(f))
        const network = icons.filter(isNetworkIcon)
        if (at.level !== 'block') {
          if (content.length) scope(at.prefix, at, { case: 'content' }, content)
          if (network.length)
            scope(`${at.prefix}.network`, at, { case: 'social', social: { url: urlOf(at, data) } }, network)
          continue
        }
        // Block level: network icons pair with a link; content icons group by the text fields they name.
        const links = socialLinksOf(block, data)
        const prefixes = [
          ...new Set(at.fields.filter((f) => f.kind === SOCIAL_URL).map((f) => prefixOf(f.name)))
        ]
        network.forEach((field, rank) => {
          const paired = prefixes.indexOf(prefixOf(field.name))
          const link = links[paired >= 0 && prefixOf(field.name) ? paired : rank]
          scope(`${at.prefix}.${field.name}`, at, { case: 'social', social: { url: link?.url ?? null } }, [
            field
          ])
        })
        for (const field of content)
          if (list(field.for).length)
            scope(`${at.prefix}.${list(field.for).join('+')}`, at, { case: 'content', for: [...field.for] }, [
              field
            ])
          else scope(`${at.prefix}.${field.name}`, at, { case: 'undeclared' }, [field])
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
