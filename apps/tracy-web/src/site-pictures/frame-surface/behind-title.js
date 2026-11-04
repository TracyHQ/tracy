// An article picture the template ALSO paints dimmed behind the page title (ADR 0043 section 3e). On JA Boxing the
// class-article layout (html/com_content/article/classes.php) copies the article's own `.item-image img` into the page's
// `.bg-mask`, so the article's full text picture shows twice: in the article and, dimmed by the mask, behind the title.
// The kit does not record this. Found from the quickstart only: an article layout whose script copies `.item-image img`
// into `.bg-mask`, a menu item of the demo data that opens a category with that layout (its path), and a frame that is
// an article's full text image (content map) on a kit page under that path. Reading page data; nothing is drawn for it.
const arr = (x) => (Array.isArray(x) ? x : [])

const COPIES = /\.item-image img[\s\S]{0,300}\.bg-mask[\s\S]{0,120}background-image/

/**
 * @param {{ files: Map<string, string>, template: string, sql: string, kit: object, slots: Map<string, object> }} input
 * @returns {Map<string, { layout: string, menuPath: string }>} by frame id
 */
export function behindTitleFrames({ files, template, sql, kit, slots }) {
  const out = new Map()
  const prefix = `templates/${template}/html/com_content/article/`
  const layouts = [...files]
    .filter(([n, text]) => n.includes(prefix) && n.endsWith('.php') && COPIES.test(text))
    .map(([n]) => n.slice(n.lastIndexOf('/') + 1, -'.php'.length))
  if (!layouts.length) return out
  // Menu rows: (id, menutype, title, alias, note, path, link, ...)
  const menuPaths = []
  for (const m of String(sql ?? '').matchAll(
    /^,?\(\d+,'[^']*','[^']*','[^']*','[^']*','([^']*)','index\.php\?option=com_content&view=category&layout=[\w]+:([\w-]+)&id=\d+'/gm
  ))
    if (layouts.includes(m[2])) menuPaths.push({ path: `/${m[1].replace(/^\/+|\/+$/g, '')}/`, layout: m[2] })
  if (!menuPaths.length) return out
  const pagesOf = (blockId) =>
    arr(kit?.pages)
      .filter((p) => arr(p?.blocks?.['1440']).includes(blockId))
      .map((p) => String(p.path ?? ''))
  for (const b of arr(kit?.blocks))
    for (const f of arr(b?.frames)) {
      const slot = slots.get(String(f?.id ?? '').replace(/^block-/, 'module-'))
      const fulltext = slot?.column === 'images' && arr(slot.jsonPath)[0] === 'image_fulltext'
      if (!fulltext || !/^article-\d+$/.test(String(slot.entity))) continue
      const hit = menuPaths.find((mp) => pagesOf(b.id).some((p) => p.startsWith(mp.path)))
      if (hit) out.set(f.id, { layout: hit.layout, menuPath: hit.path })
    }
  return out
}
