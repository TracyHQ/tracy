// The HTML frame of a record the draft write creates (ticket #597): a created article has no stored HTML from the blank
// site (#584), so the nodes its pieces name are made first, the smallest HTML in which every xpath of the record's value
// names exactly one node (`/html/body/div/p/text()` gives `<p> </p>`, `.../a[2]/@href` two `a` elements with an
// `href`). The frame is reported `created_record_frame`: the template's own skeleton (classes, wrappers) is unproven.
// Pure.

const VOID = new Set(['br', 'img', 'hr', 'input'])

/** The frame of one HTML value from the xpaths written into it (each under `/html/body/div`, the plugin's wrapper). */
export function frameOf(xpaths) {
  const root = { children: [] }
  for (const xpath of xpaths) {
    const steps = String(xpath).split('/').filter(Boolean).slice(3)
    let node = root
    for (const step of steps) {
      const m = /^(text\(\)|@[\w-]+|[a-z][\w-]*)(?:\[(\d+)\])?$/i.exec(step)
      if (!m) break
      if (m[1].startsWith('@')) {
        node.attrs = [...new Set([...(node.attrs ?? []), m[1].slice(1)])]
        break
      }
      if (m[1] === 'text()') {
        node.texts = Math.max(node.texts ?? 0, Number(m[2]) || 1)
        break
      }
      const name = m[1].toLowerCase()
      const same = node.children.filter((c) => c.name === name)
      while (same.length < (Number(m[2]) || 1)) {
        const made = { name, children: [] }
        node.children.push(made)
        same.push(made)
      }
      node = same[(Number(m[2]) || 1) - 1]
    }
  }
  const html = (n) => {
    // Text nodes are kept apart by an empty element-free gap only through a comment, as a parser would merge them.
    const texts = Array.from({ length: n.texts ?? 0 }, () => ' ').join('<!---->')
    return `${texts}${n.children.map(element).join('')}`
  }
  const element = (n) => {
    const attrs = (n.attrs ?? []).map((a) => ` ${a}=""`).join('')
    return VOID.has(n.name) ? `<${n.name}${attrs}/>` : `<${n.name}${attrs}>${html(n)}</${n.name}>`
  }
  return html(root)
}
