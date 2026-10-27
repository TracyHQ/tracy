// Merge the items of one page across viewports, attach match + class, and count coverage.
import { normText, normPath } from './normalize.mjs'

const keyOf = (it, siteUrl) => {
  if (it.kind === 'image') return `image|${normPath(it.value, siteUrl)}`
  if (it.kind === 'link') return `link|${it.value}`
  return `${it.kind}|${it.attr ?? ''}|${normText(it.value)}`
}

/** Collapse repeated items (slider clones, menus rendered twice) per viewport, then union viewports. */
export function mergeViewports(byViewport, siteUrl) {
  const merged = new Map()
  for (const [vp, data] of Object.entries(byViewport)) {
    if (!data) continue
    for (const it of data.items) {
      const k = keyOf(it, siteUrl)
      let m = merged.get(k)
      if (!m) {
        m = {
          key: k,
          kind: it.kind,
          attr: it.attr,
          source: it.source,
          value: it.value,
          role: it.role,
          tag: it.tag,
          selector: it.selector,
          href: it.href,
          text: it.text,
          viewports: {}
        }
        merged.set(k, m)
      }
      const v = (m.viewports[vp] ??= { visible: false, count: 0, rect: null, selector: it.selector })
      v.count++
      // Keep the rectangle of the first VISIBLE instance; fall back to the first one.
      if (it.visible && !v.visible) {
        v.visible = true
        v.rect = it.rect
        v.selector = it.selector
      }
      if (!v.rect && it.rect) v.rect = it.rect
    }
  }
  return [...merged.values()]
}

export function annotate(items, match, classify) {
  for (const it of items) {
    const m = match(it)
    it.status = m.status
    if (m.by) it.matchBy = m.by
    if (m.slots) it.slots = m.slots
    if (m.reason) it.reason = m.reason
    if (m.path) it.path = m.path
    if (m.remainder) {
      it.remainder = m.remainder
      it.remainderParts = m.remainderParts
    }
    if (m.status === 'hole') {
      const c = classify(it, m)
      it.class = c.class
      it.classLabel = c.label
      it.evidence = c.evidence
      if (c.lockState) it.lockState = c.lockState
    }
    it.visibleAnywhere = Object.values(it.viewports).some((v) => v.visible)
  }
  return items
}

const bucketOf = (it) => (it.kind === 'image' ? 'images' : it.kind === 'link' ? 'links' : 'text')

export function emptyCounts() {
  const c = {}
  for (const b of ['text', 'images', 'links'])
    c[b] = { total: 0, matched: 0, locked: 0, a: 0, aLocked: 0, aUndeclared: 0, b: 0, c: 0, d: 0, ignored: 0 }
  return c
}

export function count(items, into = emptyCounts()) {
  for (const it of items) {
    const c = into[bucketOf(it)]
    if (it.status === 'ignored') {
      c.ignored++
      continue
    }
    c.total++
    if (it.status === 'matched') c.matched++
    else if (it.status === 'locked') c.locked++
    else {
      c[it.class ?? 'd']++
      if (it.class === 'a') c[it.lockState === 'locked' ? 'aLocked' : 'aUndeclared']++
    }
  }
  return into
}

/** Coverage = matched / (matched + holes that need a slot: a, b, d). Locked and core (c) are acceptable. */
export function coverage(c) {
  const need = c.matched + c.a + c.b + c.d
  return need ? Math.round((c.matched / need) * 1000) / 10 : 100
}
