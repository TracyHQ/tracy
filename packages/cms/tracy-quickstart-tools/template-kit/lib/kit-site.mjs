// The site part (lib/site, written to site.json) joined into the kit: `site` at the top level, its errors, each
// page's main title source (`pages[].h1`), what each list holds (`lists[].holds`) and what each link does
// (`links[].action`), and the sentences the CMS prints in each block (`blocks[].fixedText`). Logo frames are named by the site part too (`logoFrameIds`, applied when frames are built).
import { normText } from '../../content-coverage/lib/normalize.mjs'
import { neutralKey } from './ids.mjs'
import { indexMap, ownerOfPath } from './map-index.mjs'
import { linkAction, listHolds } from './site/helpers.mjs'

const ITEM_KINDS = /^(article|contact|user|userProfile)$/ // an entity with a page of its own in a collection

/**
 * @param {object} kit template-kit.json, changed in place
 * @param {{site: object, mainHeadings: object[], errors: object[]}|null} doc site.json, or null when it is missing
 * @param {object} map the content map
 */
export function mergeSite(kit, doc, map) {
  if (!doc) {
    kit.site = null
    kit.errors.push({ kind: 'missing', field: 'site', reason: 'the site part did not run (no site.json)' })
  } else {
    kit.site = doc.site
    kit.errors.push(...(doc.errors ?? []))
  }
  const idx = indexMap(map)
  const kindOf = new Map((map.entities ?? []).map((e) => [e.key, e.kind]))
  const heading = new Map((doc?.mainHeadings ?? []).map((h) => [h.pageId, h]))
  const itemPaths = new Set()
  const contactPaths = new Set()
  for (const p of kit.pages) {
    const owner = ownerOfPath(idx, p.path)?.owner
    if (ITEM_KINDS.test(kindOf.get(owner) ?? '')) itemPaths.add(p.path)
    if (kindOf.get(owner) === 'contact') contactPaths.add(p.path)
    const h = heading.get(p.id)
    if (h) {
      const { pageId: _pageId, path: _path, ...rest } = h
      p.h1 = rest
    } else p.h1 = doc ? { via: null, reason: 'the site part did not read this page' } : null
  }
  for (const f of doc?.site?.forms ?? [])
    if (f.kind === 'contact')
      for (const p of kit.pages)
        if (`body-${p.id.replace(/^page-/, '')}` === f.block) contactPaths.add(p.path)
  const roleOf = new Map((map.slots ?? []).map((s) => [neutralKey(s.key), s.role ?? null]))
  const fixedOf = (id) =>
    (doc?.site?.fixedTexts ?? []).filter((f) => f.block === id).map(({ block: _b, at: _a, ...f }) => f)
  const namedOf = (id) =>
    (doc?.site?.nameSlots ?? []).filter((n) => n.source && n.block === id).map((n) => n.text ?? n.sample)
  for (const b of kit.blocks) {
    // A line the CMS prints (or a piece of one: a link inside it) is said once, with its source; a line printing
    // the site name is a name slot, not fixed text.
    const cms = fixedOf(b.id)
    const said = [...cms.map((c) => c.text), ...namedOf(b.id)].map(normText).filter(Boolean)
    const plain = (b.fixedText ?? []).filter((t) => !said.some((x) => x.includes(normText(t.text))))
    b.fixedText = [...plain, ...cms]
    const blockRoles = [...b.lists.flatMap((l) => l.rowSlots ?? []), ...(b.frames ?? [])]
      .map((s) => s.role)
      .filter(Boolean)
    const inRow = new Set(b.lists.flatMap((l) => (l.rowSlots ?? []).map((s) => s.id)))
    for (const l of b.lists) l.holds = listHolds(l, { blockRoles, rowLinks: l.maxEvidence?.rowLinks ?? [] })
    for (const link of b.links)
      link.action = linkAction(
        { label: link.label, target: link.target, role: roleOf.get(link.id) ?? null },
        { itemPaths, contactPaths, inRow: inRow.has(link.id) }
      )
  }
  return kit
}
