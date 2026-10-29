import { mainMenuTargets, menuPath } from 'website-opportunities/domain/main-menu.mjs'
import { listAll } from './wp-residue.js'
import { parseBlocks } from './wp-blocks.js'
import { writeMainMenu } from './main-menu.js'

const walk = (node, visit) => {
  visit(node)
  for (const child of node.children) walk(child, visit)
}
const itemBlock = (node) => ['core/navigation-link', 'core/navigation-submenu'].includes(node.name)

/** Only navigation declared by the header, either inline blocks or referenced wp_navigation posts. */
export async function writeWordPressMainMenu({ call, sitePlan, model, locale, signal }) {
  let bodies = []
  const read = async () => {
    const header = await call('content.get', { kind: 'templatePart', key: 'header' })
    if (header?.ok === false) throw new Error('MAIN_MENU_HEADER_UNREADABLE')
    const original = header?.item?.content ?? ''
    let markup = original
    const root = parseBlocks(markup)
    if (!root) throw new Error('MAIN_MENU_HEADER_INVALID')
    const refs = new Set()
    walk(root, (node) => {
      if (node.name === 'core/navigation' && node.attrs?.ref) refs.add(Number(node.attrs.ref))
    })
    const navs = refs.size ? await listAll(call, 'wp_navigation', true) : []
    const pages = await listAll(call, 'page', false)
    // An empty navigation block is the template's declared automatic page-list placement. Materialize the kept pages
    // there, so WordPress cannot silently choose another menu or reuse page titles as labels.
    const automatic = []
    walk(root, (node) => {
      if (node.name === 'core/navigation' && !node.attrs?.ref && node.children.length === 0)
        automatic.push(node)
    })
    for (const node of automatic.sort((a, b) => b.start - a.start)) {
      const links = mainMenuTargets(sitePlan)
        .map((target) => {
          const page = pages.find(
            (p) => p.slug === target.id || (p.url && menuPath(p.url) === menuPath(target.path))
          )
          if (!page?.url) throw new Error(`MAIN_MENU_MISSING_PAGE: ${target.id}`)
          const attrs = { id: page.id, kind: 'post-type', type: 'page', url: page.url, label: page.title }
          return `<!-- wp:navigation-link ${JSON.stringify(attrs)} /-->`
        })
        .join('\n')
      const block = `<!-- wp:navigation ${JSON.stringify(node.attrs ?? {})} -->\n${links}\n<!-- /wp:navigation -->`
      markup = markup.slice(0, node.start) + block + markup.slice(node.end)
    }
    bodies = [
      { key: 'header', content: markup, original, revision: header.body_revision, kind: 'templatePart' },
      ...navs.filter((n) => refs.has(n.id)).map((n) => ({ ...n, key: `nav-${n.id}`, kind: 'post' }))
    ]
    const items = []
    for (const body of bodies) {
      const parsed = parseBlocks(body.content ?? '')
      if (!parsed) throw new Error(`MAIN_MENU_BLOCKS_INVALID: ${body.key}`)
      const positions = new Map()
      walk(parsed, (node) => positions.set(node, positions.size))
      walk(parsed, (node) => {
        if (!itemBlock(node)) return
        const page = pages.find((p) => p.id === Number(node.attrs?.id))
        const path = node.attrs?.url ?? page?.url
        if (!path) return
        items.push({
          key: `${body.key}:${positions.get(node)}`,
          path,
          label: String(node.attrs?.label ?? ''),
          parent: `${body.key}:${positions.get(node.parent) ?? ''}`,
          menu: body.key,
          node
        })
      })
    }
    return items
  }
  return writeMainMenu({
    sitePlan,
    read,
    model,
    locale,
    signal,
    write: async (items) => {
      for (const body of bodies) {
        let markup = body.content
        for (const item of items
          .filter((i) => i.menu === body.key)
          .sort((a, b) => b.node.start - a.node.start)) {
          const node = item.node
          const attrs = { ...node.attrs, label: item.label }
          const opening = `<!-- wp:${node.name.replace(/^core\//, '')} ${JSON.stringify(attrs)}${node.selfClosing ? ' /' : ''}-->`
          markup = markup.slice(0, node.start) + opening + markup.slice(node.innerStart)
        }
        if (markup === (body.original ?? body.content)) continue
        const result = await call('content.update', {
          apply_id: `main-menu-${Date.now().toString(36)}`,
          kind: body.kind,
          ...(body.kind === 'post' ? { id: body.id } : { key: 'header' }),
          ...(body.revision ? { expected_body_revision: body.revision } : {}),
          fields: body.kind === 'post' ? { post_content: markup } : { content: markup }
        })
        if (result?.ok === false) throw new Error(`MAIN_MENU_WRITE_REFUSED: ${body.key}`)
      }
    }
  })
}
