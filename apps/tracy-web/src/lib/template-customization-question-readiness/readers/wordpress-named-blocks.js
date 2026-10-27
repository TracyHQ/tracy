/**
 * The named WordPress blocks (`metadata.name`) that carry demo text and that no contract slot
 * targets: the text Tracy cannot rewrite, since it leaves named blocks to the contract and rewrites
 * only unnamed ones (`wp-leaves.js`, line 15). Read for ABOUT-2 (pages and template parts) and
 * HIDDEN-1 (legal pages).
 */

import { blocksOf } from '../site-pages/wordpress-blocks.js'
import { demoDatabase, wordpressPostsOf } from './demo-database-tables.js'
import { htmlTextPieces, isProse } from './joomla-row-text.js'

/**
 * The innermost named blocks of a post's content with their text, in order.
 * @param {unknown} content
 * @returns {{ name: string, text: string }[]}
 */
export function namedLeafTexts(content) {
  const source = String(content ?? '')
  const tokens = blocksOf(source)
  const out = []
  /** @type {{ token: any, inner: boolean }[]} */
  const stack = []
  for (const t of tokens) {
    if (t.close) {
      const open = stack.pop()
      if (open && !open.inner && open.token.attrs?.metadata?.name)
        out.push({
          name: open.token.attrs.metadata.name,
          text: htmlTextPieces(source.slice(open.token.end, t.at)).join(' ')
        })
      continue
    }
    for (const s of stack) s.inner = true
    if (!t.self) stack.push({ token: t, inner: false })
  }
  return out
}

/**
 * Demo text in named blocks of the contract's pages and of the header and footer parts that no slot
 * targets, one record per block: `entity` is the content-map key (`page-contact`) or the part
 * (`part-footer`), the id a contract's `keptText` names (`contract-copy.js`).
 * @param {import('../index.js').RuleContext} context
 * @param {import('./quickstart-contract.js').SealingContract} contract
 * @param {{ pages?: (entity: any) => boolean }} [opts] which page entities to read (default: all)
 * @returns {Promise<{ entity: string, where: string, name: string, text: string }[]>}
 */
export async function wordpressDemoBlocks(context, contract, opts = {}) {
  const db = await demoDatabase(context)
  const map = contract.json('content-map.json')
  const targets = new Set((map?.slots ?? []).map((s) => s.target?.block).filter(Boolean))
  /** @type {{ entity: string, where: string, content: unknown }[]} */
  const sources = []
  for (const entity of map?.entities ?? []) {
    if (entity.kind !== 'page' || (opts.pages && !opts.pages(entity))) continue
    for (const post of wordpressPostsOf(db, entity).slice(0, 1))
      sources.push({ entity: entity.key, where: `page ${entity.identity.slug}`, content: post.post_content })
  }
  if (!opts.pages) {
    const stylesheet = db.option('stylesheet')
    for (const part of ['header', 'footer']) {
      const rows = db
        .table('posts')
        .filter(
          (p) => p.post_type === 'wp_template_part' && p.post_name === part && p.post_status === 'publish'
        )
      if (rows.length)
        sources.push({ entity: `part-${part}`, where: `part ${part}`, content: rows[0].post_content })
      else {
        const file = stylesheet ? await context.content.themeFile(stylesheet, `parts/${part}.html`) : null
        if (file) sources.push({ entity: `part-${part}`, where: `part ${part} (theme file)`, content: file })
      }
    }
  }
  const found = []
  for (const { entity, where, content } of sources)
    for (const { name, text } of namedLeafTexts(content))
      if (isProse(text) && !targets.has(name)) found.push({ entity, where, name, text })
  return found
}

/**
 * The same blocks as `<where> <block>: "<text>"` lines.
 * @param {import('../index.js').RuleContext} context
 * @param {import('./quickstart-contract.js').SealingContract} contract
 * @param {{ pages?: (entity: any) => boolean }} [opts]
 */
export async function wordpressDemoParagraphs(context, contract, opts = {}) {
  return (await wordpressDemoBlocks(context, contract, opts)).map(
    (b) => `${b.where} ${b.name}: "${b.text.slice(0, 70)}"`
  )
}
