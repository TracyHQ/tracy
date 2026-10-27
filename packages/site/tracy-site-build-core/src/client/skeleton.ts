/**
 * The inspiration's own page as a skeleton that fills in (todo-build-with-experience.md, Lee's
 * point 2): not a generic spinner but `components.html` of the chosen inspiration with each text
 * slot turned into a grey bar the width of its words, so the customer watches the exact page they
 * will get being written. Roles the copy stage writes fill in first; labels, nav and buttons wait
 * for the pages; the brand name is never a bar — it is the one word the customer gave.
 *
 * `applyFill` and `planFill` are design-inspiration's, bundled in by relative path (the same way
 * `scripts/lib/od-slots-dom.mjs` travels): pure functions, no runtime import between plugins.
 */
import { applyFill } from '../../../../design/tracy-design-inspiration/src/client/fixture'
import { planFill } from '../../../../design/tracy-design-inspiration/src/client/fill.mjs'

import type { SitePreview, Slot } from './api'

const PULSE =
  '<style>@keyframes tskel{0%,100%{opacity:.10}50%{opacity:.24}}[data-skel]{display:inline-block;height:.85em;border-radius:.3em;background:currentColor;opacity:.14;animation:tskel 1.4s ease-in-out infinite;vertical-align:middle}</style>'

/** Roles the copy stage writes; everything else waits for the seed stage. */
const PROSE = new Set(['headline', 'paragraph', 'eyebrow', 'title', 'subtitle', 'quote'])

/**
 * Which slots already show their words at a given stage index. The prose comes in once the copy
 * stage is behind (the second-to-last stage runs the seeder), everything once the last one runs.
 * Counted from the end rather than from a fixed table, because the CMSes do not agree on how many
 * stages come before `copy`.
 */
export function filledAt(stageIndex: number, total: number): (role: string) => boolean {
  if (stageIndex >= total - 1) return () => true
  if (stageIndex >= total - 2) return (role) => PROSE.has(role)
  return () => false
}

const fillsOf = (slots: Slot[], site: SitePreview | null) =>
  site
    ? planFill(slots as never, { site: site.site, pages: site.pages, page: null, copy: null } as never)
    : []

/** The fixture wearing the site's words in the roles `filled` says, grey bars everywhere else. */
export function skeletonDoc(
  html: string,
  slots: Slot[],
  site: SitePreview | null,
  filled: (role: string) => boolean
): string {
  const fills = fillsOf(slots, site)
  const byId = new Map(fills.map((f) => [f.id, f]))
  const doc = new DOMParser().parseFromString(applyFill(html, fills), 'text/html')
  const byTag = new Map<string, Element[]>()
  for (const s of slots) {
    if (s.role === 'brand' || filled(s.role)) continue
    let list = byTag.get(s.tag)
    if (!list) {
      list = Array.from(doc.body.querySelectorAll(s.tag))
      byTag.set(s.tag, list)
    }
    const el = list[s.n]
    if (!el) continue
    const words = Math.max(1, byId.get(s.id)?.text.split(/\s+/).length ?? s.words)
    const bar = doc.createElement('span')
    bar.setAttribute('data-skel', '')
    bar.style.width = words > 12 ? '100%' : `${Math.min(words * 3.4, 60)}ch`
    el.textContent = ''
    el.append(bar)
  }
  doc.head.insertAdjacentHTML('beforeend', PULSE)
  return `<!doctype html>${doc.documentElement.outerHTML}`
}

/** The fixture with every word in — what the Built screen shows until the live site replaces it. */
export function filledDoc(html: string, slots: Slot[], site: SitePreview | null): string {
  return applyFill(html, fillsOf(slots, site))
}
