// Every icon typed field of a build plan (ticket #595, spec #577): the fields Contract A types `icon` (data kind
// `editorial.item_icon`) on the placed blocks, each in its SCOPE, the item it illustrates. Pure: the plan's pages, the
// block descriptions and the plan data in, the fields grouped by scope out.
//
// A scope is one item a block shows (its item fields: JA Boxing's features block gives each of its four items two icon
// fields, the template's two theme files of one icon), or the block level fields a field names in `for` (the text fields
// it illustrates). A block level icon field naming nothing has no item to match: it is hidden with
// `icon_item_undeclared`, never guessed.
//
// A SOCIAL icon is a field beside a social link (`contact.social_url`): in the same item, or, at block level, among the
// fields of the same name prefix (`social-1-item-icon` beside `social-1-social-url`). It stands for the link's network.
const list = (value) => (Array.isArray(value) ? value : [])
const ICON_KIND = 'editorial.item_icon'
const SOCIAL_URL = 'contact.social_url'

/** Whether a field is an icon typed field of Contract A. */
export const isIconField = (field) => field?.type === 'icon' || field?.kind === ICON_KIND
/** The name prefix of a block level field: `social-1-item-icon` gives `social-1-`, `item-icon-3` gives ''. */
const prefixOf = (name) => /^(.*?-\d+-)/.exec(String(name))?.[1] ?? ''

/** The social links a placed block shows, in its data order: social link facts, and items holding one. */
function socialLinksOf(block, data) {
  const out = []
  for (const id of list(block.data)) {
    const entry = data.byId.get(id)
    if (entry?.what === 'fact' && entry.kind === SOCIAL_URL) out.push({ id, url: entry.entry.value })
    else if (entry?.what === 'item') {
      const url = entry.source?.fields?.[SOCIAL_URL]?.value
      if (typeof url === 'string' && url.trim()) out.push({ id, url })
    }
  }
  return out
}

/**
 * The icon fields of a plan, by scope.
 * @param {object[]} pages the plan's pages
 * @param {Map<string, object>} blocks block id -> description (block store or library)
 * @param {{byId: Map<string, object>}} data the plan data (`plan-data.mjs`)
 * @returns {Array<{id: string, page: string, block: string, blockId: string, blockType: string,
 *   case: 'content' | 'social' | 'undeclared', item?: string, for?: string[], social?: {url: string | null},
 *   fields: Array<{id: string, field: string, kind: string, storage: string | null,
 *   frame: {width: number, height: number} | null}>}>}
 */
export function iconScopesOfPlan(pages, blocks, data) {
  const scopes = []
  for (const page of list(pages))
    for (const block of list(page?.blocks)) {
      const d = blocks.get(block.block) ?? {}
      const base = `${page.id}.${block.id}`
      const scope = (key, extra, fields) =>
        scopes.push({
          id: `${base}.${key}`,
          page: page.id,
          block: block.id,
          blockId: block.block,
          blockType: block.type,
          ...extra,
          fields: fields.map((f) => ({
            id: `${base}${extra.item ? `.${extra.item}` : ''}.${f.name}`,
            field: f.name,
            kind: f.kind ?? ICON_KIND,
            storage: f.storage ?? null,
            frame: f.frame?.width && f.frame?.height ? { width: f.frame.width, height: f.frame.height } : null
          }))
        })
      const links = socialLinksOf(block, data)
      // Item fields: one scope per item the block shows; a social row's items are its social links.
      const itemIcons = list(d.itemFields).filter(isIconField)
      if (itemIcons.length) {
        const social = list(d.itemFields).some((f) => f.kind === SOCIAL_URL)
        const items = social
          ? links.map((l) => l.id)
          : list(block.data).filter((id) => data.byId.get(id)?.what === 'item')
        for (const item of items)
          scope(
            item,
            social
              ? { case: 'social', item, social: { url: links.find((l) => l.id === item)?.url ?? null } }
              : { case: 'content', item },
            itemIcons
          )
      }
      // Block level fields: grouped by the text fields they name, or by their social prefix.
      const own = list(d.fields).filter(isIconField)
      const prefixes = [
        ...new Set(
          list(d.fields)
            .filter((f) => f.kind === SOCIAL_URL)
            .map((f) => prefixOf(f.name))
        )
      ]
      for (const field of own) {
        const prefix = prefixOf(field.name)
        const at = prefix ? prefixes.indexOf(prefix) : -1
        if (at >= 0) scope(field.name, { case: 'social', social: { url: links[at]?.url ?? null } }, [field])
        else if (list(field.for).length)
          scope(list(field.for).join('+'), { case: 'content', for: [...field.for] }, [field])
        else scope(field.name, { case: 'undeclared' }, [field])
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
