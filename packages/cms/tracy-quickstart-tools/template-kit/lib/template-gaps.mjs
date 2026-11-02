// `templateGaps[]`: real defects of the template or its demo, for /ops to judge (errors[] stays for measurements
// the kit could not make). Each gap has a stable id (a hash of its kind and where), the images that show it, and
// `accepted`: null, or a person's reason from gap-accepts.json (id -> {reason, by}). Nothing is accepted
// automatically.
//   page-without-h1          a page that shows no main title (h1), from the site part
//   dead-link                a link of a block whose target is empty, `#`, or a path that does not answer 200
//   dead-path                a page path of the content map that does not answer 200
//   sparse-row-left-packed   a proposed template fix: a card row whose short last row is packed to the left
import { createHash } from 'node:crypto'

export const gapId = (kind, where) =>
  `gap-${createHash('sha256')
    .update(`${kind}|${JSON.stringify(where)}`)
    .digest('hex')
    .slice(0, 12)}`

/**
 * @param {{kit: object, mainHeadings?: object[], dead?: {path: string, status: number, from?: string[]}[], fixes?: object[], accepts?: object}} o
 * @returns {object[]}
 */
export function templateGaps({ kit, mainHeadings = [], dead = [], fixes = [], accepts = {} }) {
  const gaps = []
  const seen = new Set()
  const add = (kind, where, detail, evidence) => {
    const id = gapId(kind, where)
    if (seen.has(id)) return
    seen.add(id)
    const a = accepts?.[id]
    gaps.push({
      id,
      kind,
      where,
      detail,
      evidence: evidence.filter(Boolean),
      accepted: a?.reason ? { reason: a.reason, by: a.by ?? null } : null
    })
  }
  const pageImages = new Map(kit.pages.map((p) => [p.id, Object.values(p.images ?? {})]))
  // Only pages the kit keeps: a showcase page left out (excludedPages) is not a gap of the template.
  const kept = new Set(kit.pages.map((p) => p.id))
  for (const h of mainHeadings)
    if (kept.has(h.pageId) && !h.via && /no h1/.test(h.reason ?? ''))
      add('page-without-h1', { pageId: h.pageId }, `${h.path}: ${h.reason}`, pageImages.get(h.pageId) ?? [])
  const deadPaths = new Map(dead.map((d) => [d.path, d]))
  for (const b of kit.blocks)
    for (const l of b.links ?? []) {
      const t = String(l.target ?? '').trim()
      const d = deadPaths.get(t)
      if (t && t !== '#' && !d) continue
      // A tab, a menu heading or a button that opens something on the page has no address and needs none.
      if (!d && l.opens?.kind) continue
      const why = d ? `answers ${d.status}` : t ? 'points nowhere (#)' : 'has no target'
      add(
        'dead-link',
        { blockId: b.id, path: t || null },
        `link "${l.label ?? ''}" ${why}`,
        Object.values(b.images ?? {})
      )
    }
  for (const d of dead)
    if ((d.from ?? []).includes('content-map'))
      add('dead-path', { path: d.path }, `a content map page answers ${d.status}`, [])
  for (const f of fixes)
    add(
      'sparse-row-left-packed',
      { selector: f.selector },
      `short last row packed left in ${f.lists.join(', ')}; proposed fix { ${f.rule} }${f.verified ? '' : ' (not verified)'}`,
      // The packed shots of the blocks the lists live in (the trial itself is read in the DOM, not shot).
      [...new Set(f.lists.map((l) => l.replace(/\.[^.]+$/, '')))].flatMap((id) =>
        Object.values(kit.blocks.find((b) => b.id === id)?.images ?? {})
      )
    )
  return gaps
}
