/**
 * What an opportunity's build (Website Opportunities) writes into a page body of the source edition after its sweep, in
 * the same page write: the template's dish items no contract slot covers, and a mark on each of the page's sections.
 *
 * 🔒 A DEMO REPLACES, NEVER REMOVES (product owner, 22/10/2026). The JA Restaurant WP demo hid every dish item, price and
 * section nothing true was collected for, and its hand-off agent rewrote whole pages: the template looked broken. Each dish
 * item of the template stays — the restaurant's dishes first, every other one under the neutral item name with its
 * description, badge and price empty (`section-fills.mjs`; plan §7, 26/10/2026: no filler).
 * 🔒 A DISH ITEM'S PICTURE IS ITS OWN DISH'S (plan §7): the photo of that dish, its alt text the dish's name; an item with
 * none takes the build's neutral picture (a placeholder, or the place's own inside or outside) with a neutral alt text —
 * never another dish's photo under this dish's name, never the demo's.
 *
 * 🔒 THE MARK IS HOW A SECTION IS KNOWN LATER: `tracy-sec-<section>` on each top-level `<section>.root` block, in its
 * comment's `className` and its tag's `class` (the editor compares the two). The hand-off lists the sections per page and
 * the demo QA (`structure-kept`) checks none went. Like `wp-blocks.js`, nothing here re-serialises: every edit is a
 * replaced range of the original string.
 */
import { neutralItemName } from 'website-opportunities/domain/section-fills.mjs'
import { commentJson, leavesOf, memberAt, parseBlocks, withText } from './wp-blocks.js'

/** What a line takes with nothing true for it: nothing (`section-fills.mjs`). */
const UNSOURCED = ''
/** The name of a dish item with no dish of the restaurant, when the build names none for its trade and language. */
const NEUTRAL_ITEM = neutralItemName()

/** The field of a dish block's name (`menu.dish-price.3` → `price`), or null for any other block. */
const DISH_FIELD = /\.dish-(name|price|description|extra-class|image)\.\d+$/
/** A dish item of the template (`menu.item.3`). */
const DISH_ITEM = /\.item\.\d+$/

/** @typedef {import('./wp-blocks.js').Block} Block */

/** @param {Block} root @returns {Block[]} every block below it, in document order */
const descendants = (root) => {
  /** @type {Block[]} */
  const out = []
  const walk = (/** @type {Block} */ node) => {
    for (const child of node.children) {
      out.push(child)
      walk(child)
    }
  }
  walk(root)
  return out
}

/**
 * The body with each dish item of the template filled: the restaurant's dishes in page order, then neutral names. A block a
 * contract slot writes into (the first of its name on the page, named in `keep`) is the door's and stays as written, unless
 * `blank` names it: a slot pinned empty, which no door writes, is emptied here.
 * @param {string} markup
 * @param {{ keep?: Set<string>, blank?: Set<string>, dishes?: Array<{ name: string, description?: string, price?: string,
 *   picture?: string }>, neutralName?: string, neutralPicture?: string | null, neutralAlt?: string }} input - a dish's
 *   `picture`: the uploaded photo of that dish (a site path); `neutralName`: the item name of the business's trade in the
 *   site's language (`copyPinsOf`); `neutralPicture`: the uploaded picture an item with no photo of its own takes,
 *   `neutralAlt` its alt text (the business's name, or none)
 * @returns {{ markup: string, items: number, lines: number, pictures: number }}
 */
export function fillDishItems(
  markup,
  {
    keep = new Set(),
    blank = new Set(),
    dishes = [],
    neutralName = NEUTRAL_ITEM,
    neutralPicture = null,
    neutralAlt = ''
  } = {}
) {
  const root = parseBlocks(markup)
  if (!root) return { markup, items: 0, lines: 0, pictures: 0 }
  const all = descendants(root)
  /** The first block of each name: a slot's block when `keep` names it. */
  const firstOf = new Map()
  for (const node of all) {
    const name = node.attrs?.metadata?.name
    if (typeof name === 'string' && !firstOf.has(name)) firstOf.set(name, node)
  }
  const slotted = (/** @type {Block} */ node) => {
    const name = node.attrs?.metadata?.name
    return keep.has(name) && !blank.has(name) && firstOf.get(name) === node
  }
  const items = all.filter(
    (node) =>
      DISH_ITEM.test(String(node.attrs?.metadata?.name ?? '')) &&
      descendants(node).some((d) => /\.dish-name\.\d+$/.test(String(d.attrs?.metadata?.name ?? '')))
  )
  /** @type {Array<{ node: Block, text?: string, src?: string, alt?: string }>} */
  const edits = []
  /** The pictures this build uploaded: one already in a block is the door's. */
  const ours = [neutralPicture, ...dishes.map((d) => d?.picture)].filter(
    (p) => typeof p === 'string' && p !== ''
  )
  items.forEach((item, k) => {
    const dish = dishes[k]
    const says = {
      name: dish?.name || neutralName,
      description: dish?.description || '',
      price: dish?.price || UNSOURCED,
      // A badge ("Hot", "Sale") is never collected.
      'extra-class': ''
    }
    // The picture is called what the item shows: a name a slot wrote (the contract's own turn of neutral names) wins.
    const nameNode = descendants(item).find((d) =>
      /\.dish-name\.\d+$/.test(String(d.attrs?.metadata?.name ?? ''))
    )
    const shown = nameNode && slotted(nameNode) ? leavesOf(markup, nameNode).join(' ').trim() : ''
    // Its own photo when the dish has one; else the neutral picture, which names no dish.
    const own = dish?.picture && !(shown && shown !== dish.name) ? dish.picture : null
    const src = own ?? neutralPicture
    const alt = own ? shown || says.name : neutralAlt
    for (const node of descendants(item)) {
      const field = DISH_FIELD.exec(String(node.attrs?.metadata?.name ?? ''))?.[1]
      if (!field) continue
      if (field !== 'image') {
        if (!slotted(node)) edits.push({ node, text: says[/** @type {keyof typeof says} */ (field)] })
        continue
      }
      // A picture slot the build placed a photograph in is the door's; one still showing the demo's dish is not left so.
      if (src && !(slotted(node) && placedHere(markup, node, ours))) edits.push({ node, src, alt })
    }
  })
  // A demo price outside the dish items (JA Restaurant's weekly specials, `features-intro.price.N`) a slot does not cover.
  for (const node of all)
    if (
      /\.price\.\d+$/.test(String(node.attrs?.metadata?.name ?? '')) &&
      !DISH_FIELD.test(node.attrs.metadata.name) &&
      !slotted(node)
    )
      edits.push({ node, text: UNSOURCED })
  let out = markup
  let lines = 0
  let pictured = 0
  for (const edit of edits.sort((a, b) => b.node.start - a.node.start)) {
    if (edit.text !== undefined) {
      const next = withText(out, edit.node, edit.text)
      if (next !== null) {
        out = next
        lines += 1
      }
      // The theme paints `.badge` as a coloured pill even with no words in it, so an emptied badge loses the class too.
      if (
        edit.text === '' &&
        /\.dish-extra-class\.\d+$/.test(String(edit.node.attrs?.metadata?.name ?? ''))
      ) {
        const bare = withoutClass(out, edit.node, 'badge')
        if (bare !== null) out = bare
      }
    } else if (edit.src) {
      const next = withPicture(out, edit.node, edit.src, edit.alt ?? '')
      if (next !== null) {
        out = next
        pictured += 1
      }
    }
  }
  if (!parseBlocks(out)) return { markup, items: 0, lines: 0, pictures: 0 }
  return { markup: out, items: items.length, lines, pictures: pictured }
}

/** A dish's name as two spellings of it compare. */
const norm = (/** @type {unknown} */ name) =>
  String(name ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The pictures of the template's dish items no slot covers, from what this build placed (`pictureReport` receipts): each
 * dish its own photo — the one the slot plan bound to it (`pictureId`), or the one the planner placed as a photo of that
 * dish — and the neutral picture an item with none takes: a placeholder, else a photo of the place's inside or outside.
 * @param {{ receipts?: Record<string, { kind?: string, mediaId?: string, path?: string | null, dish?: string,
 *   subject?: string }> | null, dishes?: Array<{ name: string, description?: string, price?: string, pictureId?: string }> }} input
 * @returns {{ dishes: Array<{ name: string, description?: string, price?: string, picture?: string }>,
 *   neutralPicture: string | null }}
 */
export function dishItemPictures({ receipts, dishes = [] }) {
  const placed = Object.values(receipts ?? {}).filter(
    (r) => typeof r?.path === 'string' && /\.(jpe?g|png|webp)$/i.test(r.path)
  )
  const photo = (/** @type {{ name: string, pictureId?: string }} */ d) =>
    (d.pictureId ? placed.find((r) => r.kind === 'photo' && r.mediaId === d.pictureId) : null) ??
    placed.find((r) => r.kind === 'photo' && r.dish && norm(r.dish) === norm(d.name))
  const neutral =
    placed.find((r) => r.kind === 'placeholder') ??
    placed.find((r) => r.kind === 'photo' && ['interior', 'exterior', 'room'].includes(String(r.subject)))
  return {
    dishes: dishes.map(({ pictureId, ...d }) => {
      const own = photo({ ...d, pictureId })
      return own?.path ? { ...d, picture: own.path } : d
    }),
    neutralPicture: neutral?.path ?? null
  }
}

/** Whether an image block already shows one of the restaurant's pictures. */
const placedHere = (
  /** @type {string} */ markup,
  /** @type {Block} */ node,
  /** @type {string[]} */ pictures
) => {
  const src = /<img\b[^>]*\ssrc="([^"]*)"/.exec(markup.slice(node.innerStart, node.innerEnd))?.[1] ?? ''
  return /\/tracy-content\//.test(src) || pictures.some((p) => src.endsWith(p.replace(/^\/+/, '')))
}

/**
 * The body with an image block's picture replaced: its `<img>` takes the new address and words, and loses the demo's media
 * id (`"id":N` in the comment, `wp-image-N` on the tag), which would point the editor at the demo's file.
 * @param {string} markup
 * @param {Block} node
 * @param {string} path - a site path (`wp-content/uploads/…`) or an address
 * @param {string} alt
 * @returns {string | null}
 */
function withPicture(markup, node, path, alt) {
  const src = /^(https?:)?\//.test(path) ? path : `/${path}`
  const inner = markup.slice(node.innerStart, node.innerEnd)
  const tag = /<img\b[^>]*>/.exec(inner)
  if (!tag) return null
  const attr = (/** @type {string} */ s) =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  let img = tag[0].replace(/\ssrc="[^"]*"/, ` src="${attr(src)}"`)
  img = /\salt="/.test(img)
    ? img.replace(/\salt="[^"]*"/, ` alt="${attr(alt)}"`)
    : img.replace(/^<img/, `<img alt="${attr(alt)}"`)
  img = img
    .replace(/\s(srcset|sizes)="[^"]*"/g, '')
    .replace(/(\sclass="[^"]*?)\s*\bwp-image-\d+\b([^"]*")/, '$1$2')
    .replace(/\sclass=""/, '')
  const head = markup
    .slice(node.start, node.innerStart)
    .replace(/,\s*"id"\s*:\s*\d+(?=\s*[,}])|"id"\s*:\s*\d+\s*,\s*/, '')
  const at = node.innerStart + tag.index
  return (
    markup.slice(0, node.start) +
    head +
    markup.slice(node.innerStart, at) +
    img +
    markup.slice(at + tag[0].length)
  )
}

/**
 * The body with each top-level section of the template (`<section>.root`) marked `tracy-sec-<section>`, and the sections in
 * page order. A section already marked is left as it is.
 * @param {string} markup
 * @returns {{ markup: string, sections: string[], marked: number }}
 */
export function markSections(markup) {
  const root = parseBlocks(markup)
  if (!root) return { markup, sections: [], marked: 0 }
  /** @type {string[]} */
  const sections = []
  /** @type {Array<{ node: Block, mark: string }>} */
  const marks = []
  for (const node of root.children) {
    const name = /^([a-z0-9-]+)\.root$/.exec(String(node.attrs?.metadata?.name ?? ''))?.[1]
    if (!name) continue
    sections.push(name)
    const mark = `tracy-sec-${name}`
    if (
      !String(node.attrs?.className ?? '')
        .split(/\s+/)
        .includes(mark)
    )
      marks.push({ node, mark })
  }
  let out = markup
  let marked = 0
  for (const { node, mark } of marks.sort((a, b) => b.node.start - a.node.start)) {
    const next = withMark(out, node, mark)
    if (next !== null) {
      out = next
      marked += 1
    }
  }
  if (!parseBlocks(out)) return { markup, sections, marked: 0 }
  return { markup: out, sections, marked }
}

/** One section marked in its comment and its tag, or null when either cannot be found. */
function withMark(markup, node, mark) {
  const before = typeof node.attrs?.className === 'string' ? node.attrs.className : null
  const comment = markup.slice(node.start, node.innerStart)
  let head
  if (before !== null) {
    const member = memberAt(markup, node, 'className', before)
    if (!member) return null
    const from = member.start - node.start
    const to = member.end - node.start
    head = `${comment.slice(0, from)}"className":${commentJson(`${before} ${mark}`.trim())}${comment.slice(to)}`
  } else {
    const brace = comment.indexOf('{')
    if (brace < 0) return null
    const rest = comment.slice(brace + 1).trimStart()
    head = `${comment.slice(0, brace + 1)}"className":${commentJson(mark)}${rest.startsWith('}') ? '' : ','}${comment.slice(brace + 1)}`
  }
  const inner = markup.slice(node.innerStart, node.innerEnd)
  const tag = /^\s*<[a-z][a-z0-9]*\b[^>]*>/i.exec(inner)
  if (!tag) return null
  const opened = /\sclass="([^"]*)"/.test(tag[0])
    ? tag[0].replace(/\sclass="([^"]*)"/, (_, cls) => ` class="${`${cls} ${mark}`.trim()}"`)
    : tag[0].replace(/^(\s*<[a-z][a-z0-9]*)/i, `$1 class="${mark}"`)
  return markup.slice(0, node.start) + head + opened + markup.slice(node.innerStart + tag[0].length)
}

/**
 * The body with one class taken off a block, in its comment and its tag alike (the editor compares the two). A member or
 * attribute left with no class goes; the block stays. Null when the block does not carry the class in both places.
 * @param {string} markup
 * @param {Block} node
 * @param {string} cls
 * @returns {string | null}
 */
function withoutClass(markup, node, cls) {
  const before = typeof node.attrs?.className === 'string' ? node.attrs.className : null
  const drop = (/** @type {string} */ list) =>
    list
      .split(/\s+/)
      .filter((c) => c && c !== cls)
      .join(' ')
  if (before === null || !before.split(/\s+/).includes(cls)) return null
  const member = memberAt(markup, node, 'className', before)
  if (!member) return null
  const comment = markup.slice(node.start, node.innerStart)
  const from = member.start - node.start
  const to = member.end - node.start
  const left = drop(before)
  let head
  if (left) head = `${comment.slice(0, from)}"className":${commentJson(left)}${comment.slice(to)}`
  else {
    // The member goes with the comma that joins it to its neighbour.
    const after = /^\s*,\s*/.exec(comment.slice(to))
    const ahead = /,\s*$/.exec(comment.slice(0, from))
    head = after
      ? comment.slice(0, from) + comment.slice(to + after[0].length)
      : ahead
        ? comment.slice(0, from - ahead[0].length) + comment.slice(to)
        : comment.slice(0, from) + comment.slice(to)
  }
  const rest = markup.slice(node.innerStart)
  const tag = /^\s*<[a-z][a-z0-9]*\b[^>]*>/i.exec(rest)
  if (!tag) return null
  const attr = /\sclass="([^"]*)"/.exec(tag[0])
  if (!attr || !attr[1].split(/\s+/).includes(cls)) return null
  const kept = drop(attr[1])
  const opened = tag[0].replace(attr[0], kept ? ` class="${kept}"` : '')
  return markup.slice(0, node.start) + head + opened + rest.slice(tag[0].length)
}

export { NEUTRAL_ITEM, UNSOURCED }
