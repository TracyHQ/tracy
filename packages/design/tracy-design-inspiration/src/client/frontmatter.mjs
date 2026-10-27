/**
 * YAML front matter, split off a DESIGN.md before anything reads or draws it.
 *
 * The 152 vendored systems' DESIGN.md files carry none — they open with `# Design System Inspired by …`
 * and a blockquote — so the reader and the Markdown renderer never had to know. The brand engine's
 * `brandToDesignMd` writes OpenDesign's newer shape, which opens with `---\nname: …\ncolors: …\n---`, and
 * the renderer showed that block as one grey paragraph under the palette on every brand inspiration
 * (Lee, 06/09 12:03: "this paragraph is inserted on every page"). No DOM here; `test/frontmatter.test.mjs`.
 *
 * @param {string} md
 * @returns {{ body: string, meta: Record<string, string> }} the document without the block, and its
 *   top-level scalar keys (`name: "x"` → `{ name: 'x' }`); nested keys are not read.
 */
export function splitFrontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md)
  if (!m) return { body: md, meta: {} }
  /** @type {Record<string, string>} */
  const meta = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.+)$/.exec(line)
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return { body: md.slice(m[0].length), meta }
}
