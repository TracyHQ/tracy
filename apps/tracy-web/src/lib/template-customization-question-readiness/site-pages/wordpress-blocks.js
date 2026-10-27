/**
 * WordPress block markup (`<!-- wp:name {attrs} -->`) read as tokens and as a tree, enough for a
 * navigation block and its links. Shared by every WordPress rule that walks a template part.
 */

const BLOCK = /<!--\s+(\/)?wp:([a-z][a-z0-9_/-]*)\s+(?:(\{[\s\S]*?\})\s+)?(\/)?-->/g

/**
 * @typedef {{ name: string, attrs: Record<string, any>, close: boolean, self: boolean, at: number, end: number }} BlockToken
 * @typedef {BlockToken & { children: BlockNode[] }} BlockNode
 */

/**
 * The block comments of a post's content, in order.
 * @param {unknown} content
 * @returns {BlockToken[]}
 */
export function blocksOf(content) {
  const out = []
  for (const m of String(content ?? '').matchAll(BLOCK)) {
    let attrs = {}
    if (m[3])
      try {
        attrs = JSON.parse(m[3])
      } catch {
        attrs = {}
      }
    out.push({
      name: m[2].includes('/') ? m[2] : `core/${m[2]}`,
      attrs,
      close: !!m[1],
      self: !!m[4],
      at: m.index,
      end: m.index + m[0].length
    })
  }
  return out
}

/**
 * A run of tokens as a tree: each opening block with the blocks nested inside it.
 * @param {BlockToken[]} tokens
 * @returns {BlockNode[]}
 */
export function blockTree(tokens) {
  /** @type {{ children: BlockNode[] }} */
  const root = { children: [] }
  /** @type {{ children: BlockNode[] }[]} */
  const stack = [root]
  for (const t of tokens) {
    if (t.close) {
      if (stack.length > 1) stack.pop()
      continue
    }
    const node = { ...t, children: [] }
    stack[stack.length - 1].children.push(node)
    if (!t.self) stack.push(node)
  }
  return root.children
}
