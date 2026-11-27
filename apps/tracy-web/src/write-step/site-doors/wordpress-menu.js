// The main menu of a WordPress site, written by the write step (site-doors/wordpress.js `writeMenu`). A block theme's main
// menu is a `wp_navigation` post the header's navigation block points at (lib/site-copy/main-menu-wordpress.js reads it
// from the release), and its labels are not content contract slots: the export hands them to step 9 with the menu. So the
// post is read and written whole through the plugin's own doors, `content.list` / `content.get` / `content.update {kind:
// "post"}`, held to the body that was read (`expected_body_revision`). No contract entity is that post (the release's
// presentation lock pins its template parts and pages, not its navigation), so the contract does not see the edit.
//
// What changes, and nothing else, byte for byte as WordPress stores it:
//   - the `label` of each item the plan keeps and the writer labelled;
//   - each item the plan does not keep is cut out, with what it holds;
//   - a dropdown that loses every item under it becomes a plain link with its own attributes, so no empty dropdown opens.
// An item is found by the page it leads to (its address's path), so a run over a menu an earlier run changed finds the same
// items; one found nowhere is said, never guessed. Pure apart from the calls it is given.
import { blocksOf } from '../../lib/template-customization-question-readiness/site-pages/wordpress-blocks.js'
import { pathOfUrl } from '../../lib/site-copy/main-menu-tree.js'

const LINK_BLOCKS = new Set(['core/navigation-link', 'core/navigation-submenu', 'core/home-link'])
const each = (value) => (Array.isArray(value) ? value : [])
const said = (answer) =>
  [answer?.error ?? answer?.code, answer?.message].filter(Boolean).join(': ') || 'the site gave no answer'

/**
 * A label as a member of a block comment: JSON, with what would end or confuse an HTML comment written as WordPress does
 * (`--`, `<`, `>`); the rest stays as written, so the stored body holds the label's own words.
 * @param {string} label
 */
export const labelMember = (label) =>
  `"label":${JSON.stringify(label)
    .replace(/--/g, '\\u002d\\u002d')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')}`

/**
 * The navigation's link blocks as a tree, each with the range it spans in the body: `[at, end)` from its opening comment
 * to the end of its closing one (its own comment when it closes itself), and `open` the range of its opening comment.
 * @param {string} body
 */
export function linkTree(body) {
  const root = { children: [] }
  const stack = [root]
  for (const token of blocksOf(body)) {
    if (token.close) {
      const node = stack.length > 1 ? stack.pop() : null
      if (node) node.end = token.end
      continue
    }
    const node = { ...token, open: [token.at, token.end], children: [] }
    stack[stack.length - 1].children.push(node)
    if (!token.self) stack.push(node)
  }
  if (stack.length > 1) return null
  const out = []
  const walk = (nodes, parent) => {
    for (const node of nodes) {
      if (!LINK_BLOCKS.has(node.name)) continue
      const link = { node, parent, path: pathOfUrl(node.attrs?.url), children: [] }
      out.push(link)
      parent?.children.push(link)
      walk(node.children, link)
    }
  }
  walk(root.children, null)
  return out
}

const pathKey = (path) => String(path ?? '').replace(/^\/+|\/+$/g, '')

/**
 * The body with the plan's menu applied: labels set, items cut, emptied dropdowns made links. Each item of `items` and
 * `hide` gets its outcome by item id.
 * @param {string} body the navigation post's content
 * @param {{ items: object[], hide: object[] }} menu the export's main menu (contract-mapping.js `mainMenuExport`)
 * @returns {{ body: string, outcomes: Map<string, { done: boolean, reason?: string, label?: string }> } | null} null when
 *   the body is not block markup that can be read
 */
export function menuEdit(body, { items, hide }) {
  const links = linkTree(body)
  if (!links) return null
  const outcomes = new Map()
  // An item is the one link that leads to its page; a page two links lead to is not guessed.
  const byPath = new Map()
  for (const link of links) byPath.set(link.path, [...(byPath.get(link.path) ?? []), link])
  const find = (item) => {
    const found = byPath.get(pathKey(item.path)) ?? []
    return found.length === 1 ? found[0] : null
  }
  const cuts = []
  for (const h of each(hide)) {
    const link = find(h)
    // Not in the menu (an earlier run took it off): what the plan asks holds already.
    if (!link) {
      const twice = (byPath.get(pathKey(h.path)) ?? []).length > 1
      outcomes.set(
        h.item,
        twice ? { done: false, reason: `${h.path} is linked twice in the menu` } : { done: true }
      )
      continue
    }
    cuts.push(link)
    outcomes.set(h.item, { done: true })
  }
  const cutNodes = new Set(cuts.map((c) => c.node))
  const under = (link) => {
    for (let p = link.parent; p; p = p.parent) if (cutNodes.has(p.node)) return true
    return false
  }
  /** @type {{ at: number, end: number, text: string }[]} */
  const edits = cuts.filter((c) => !under(c)).map((c) => ({ at: c.node.at, end: c.node.end, text: '' }))
  const gone = new Set(cuts.map((c) => c.node))
  for (const item of each(items)) {
    if (item.state === 'hidden' || typeof item.label !== 'string' || !item.label.trim()) continue
    const link = find(item)
    if (!link || gone.has(link.node) || under(link)) {
      outcomes.set(item.item, { done: false, reason: `the menu holds no single link to ${item.path}` })
      continue
    }
    const [from, to] = link.node.open
    const comment = body.slice(from, to)
    const member = /"label"\s*:\s*"(?:[^"\\]|\\.)*"/.exec(comment)
    const text = member
      ? comment.slice(0, member.index) +
        labelMember(item.label) +
        comment.slice(member.index + member[0].length)
      : comment.replace(/(<!--\s+wp:[a-z/-]+\s+\{)/, `$1${labelMember(item.label)},`)
    if (!member && !/^\s*<!--\s+wp:[a-z/-]+\s+\{/.test(comment)) {
      outcomes.set(item.item, { done: false, reason: 'the menu link has no attributes to label' })
      continue
    }
    edits.push({ at: from, end: to, text, keep: link })
    outcomes.set(item.item, { done: true, label: item.label })
  }
  // A dropdown left with no item under it is a plain link: its own opening comment, closed on itself.
  for (const link of links) {
    if (link.node.name !== 'core/navigation-submenu' || gone.has(link.node) || under(link)) continue
    const kids = link.children
    if (!kids.length || !kids.every((k) => gone.has(k.node))) continue
    const own = edits.find((e) => e.keep === link)
    const opening = own ? own.text : body.slice(...link.node.open)
    const asLink = opening
      .replace(/^(\s*<!--\s+)wp:navigation-submenu\b/, '$1wp:navigation-link')
      .replace(/\s*-->\s*$/, ' /-->')
    // The opening and everything to its close becomes the one link; the cuts inside go with it.
    for (let i = edits.length - 1; i >= 0; i -= 1)
      if (edits[i].at >= link.node.at && edits[i].end <= link.node.end) edits.splice(i, 1)
    edits.push({ at: link.node.at, end: link.node.end, text: asLink })
  }
  let out = body
  for (const e of [...edits].sort((a, b) => b.at - a.at)) {
    let to = e.end
    // A cut block takes its own line with it.
    if (e.text === '') while (to < out.length && (out[to] === '\n' || out[to] === '\r')) to += 1
    out = out.slice(0, e.at) + e.text + out.slice(to)
  }
  return linkTree(out) ? { body: out, outcomes } : null
}

/**
 * Reads the main menu's navigation post, applies the plan, writes it back once.
 * @param {{ apply: Function, siteKey: string, applyId: string, mainMenu: { menutype?: string | null, items?: object[],
 *   hide?: object[] } }} input
 * @returns {Promise<Map<string, object>>} the outcome of each item, by item id (`settled` of the write report): a label as
 *   `written` with its read-back, an item off the menu as `written` with `ordered: ''`, or `failed` with the reason
 */
export async function writeWordpressMenu({ apply, siteKey, applyId, mainMenu }) {
  const results = new Map()
  const items = each(mainMenu?.items).filter(
    (i) => i.state !== 'hidden' && typeof i.label === 'string' && i.label.trim()
  )
  const hide = each(mainMenu?.hide)
  const named = [...items.map((i) => [i.item, i.slot]), ...hide.map((h) => [h.item, h.item])]
  const failAll = (reason) => {
    for (const [, slot] of named) results.set(slot, { status: 'failed', reason })
    return results
  }
  if (!named.length) return results
  const slug = mainMenu?.menutype
  if (!slug) return failAll('the main menu names no navigation post')
  const listed = await apply({
    siteKey,
    action: 'content.list',
    params: { post_type: 'wp_navigation', name: slug, include_body: false, limit: 5 }
  })
  if (!listed || listed.ok === false) return failAll(`the navigation could not be listed: ${said(listed)}`)
  const posts = each(listed.items).filter(
    (p) => p?.slug === slug && (p.status === undefined || p.status === 'publish')
  )
  if (posts.length !== 1)
    return failAll(`the site holds ${posts.length} published navigation posts named ${slug}`)
  const id = Number(posts[0].id)
  const got = await apply({ siteKey, action: 'content.get', params: { kind: 'post', id } })
  const body = got?.item?.post_content ?? got?.item?.content
  if (!got || got.ok === false || typeof body !== 'string')
    return failAll(`the navigation ${slug} could not be read: ${said(got)}`)
  const edit = menuEdit(body, { items, hide })
  if (!edit) return failAll(`the navigation ${slug} is not block markup this step can edit`)
  if (edit.body !== body) {
    const wrote = await apply({
      siteKey,
      action: 'content.update',
      params: {
        apply_id: applyId,
        kind: 'post',
        id,
        fields: { post_content: edit.body },
        ...(typeof got.body_revision === 'string' ? { expected_body_revision: got.body_revision } : {})
      }
    })
    if (!wrote || wrote.ok === false) return failAll(`the navigation ${slug} was not written: ${said(wrote)}`)
  }
  const readFrom = {
    action: 'content.get',
    params: { kind: 'post', id },
    path: ['item', 'post_content'],
    type: 'contains'
  }
  for (const i of items) {
    const done = edit.outcomes.get(i.item)
    results.set(
      i.slot,
      done?.done
        ? {
            status: 'written',
            ordered: i.label,
            readFrom,
            reason: `the label of ${i.path} in the menu ${slug}`
          }
        : { status: 'failed', reason: done?.reason ?? 'the menu item was not found' }
    )
  }
  for (const h of hide) {
    const done = edit.outcomes.get(h.item)
    results.set(
      h.item,
      done?.done
        ? { status: 'written', ordered: '', reason: `${h.why}: the item was taken off the menu ${slug}` }
        : { status: 'failed', reason: `${h.why}, but ${done?.reason ?? 'the item was not found'}` }
    )
  }
  return results
}
