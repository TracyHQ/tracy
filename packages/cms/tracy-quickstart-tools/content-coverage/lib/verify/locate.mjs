// Turn the coverage audit's findings into components: every slot the audit matched to a VISIBLE element gets that
// element's box (document space, per viewport); slots group by entity on the page where most of them show.
// Never guesses a position: a slot without a visible matched element is listed as not located, with the reason.
// A demo-only entity (a style-guide page, `../demo-only.mjs`) is located and shown like any other, never marked suspicious.

import { demoOnlyEntities } from '../demo-only.mjs'
import { suspicion } from './suspicion.mjs'

const PAD = { desktop: 20, phone: 10 }
const EXACTISH = /^(exact|exact ignoring spaces\/punctuation|path|href|video id|address slot)$/
const entityOf = (key) => String(key).replace(/\.[^.]+$/, '')
const GAP = 1200 // px: elements of one component further apart than this vertically are separate clusters
const BAND = 150
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

export function locate({ map, findings, isFactRole, mods = {} }) {
  const pages = findings.pages.map((p) => ({ n: p.n, url: p.url, title: p.title, shots: p.shots }))
  const demoOnly = demoOnlyEntities(map)
  const flagsOf = (slot, located) => (demoOnly.has(slot.entity) ? [] : suspicion(slot, located, isFactRole))
  /** key -> [{ page, rects:{desktop,phone}, by }] visible candidates; hidden: keys matched only to hidden elements */
  const cands = new Map()
  const hidden = new Set()
  for (const p of findings.pages)
    for (const it of p.items) {
      if (it.status !== 'matched' || !it.slots?.length) continue
      const vis = (vp) =>
        it.viewports?.[vp]?.visible && it.viewports[vp].rect?.w >= 2 ? it.viewports[vp].rect : null
      const rects = { desktop: vis('desktop'), phone: vis('phone') }
      for (const key of it.slots) {
        if (!rects.desktop && !rects.phone) {
          hidden.add(key)
          continue
        }
        const a = cands.get(key) ?? []
        a.push({
          page: p.n,
          rects,
          by: it.matchBy,
          kind: it.kind,
          ents: new Set(it.slots.map(entityOf)),
          sel: it.viewports?.desktop?.selector ?? it.selector ?? ''
        })
        cands.set(key, a)
      }
    }

  const byEntity = new Map()
  for (const s of map.slots) byEntity.set(s.entity, [...(byEntity.get(s.entity) ?? []), s])

  const blocks = new Map()
  const notLocated = []
  const notShown = []
  for (const [entity, slots] of byEntity) {
    // Home page of the component: the page where most of its slots show on desktop (first page on a tie).
    const tally = new Map()
    for (const s of slots)
      for (const pn of new Set((cands.get(s.key) ?? []).filter((c) => c.rects.desktop).map((c) => c.page)))
        tally.set(pn, (tally.get(pn) ?? 0) + 1)
    const home = [...tally].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0]
    for (const s of slots) {
      const all = cands.get(s.key) ?? []
      const desk = all.filter((c) => c.rects.desktop)
      const onHome = desk.filter((c) => c.page === home)
      const pool = onHome.length
        ? onHome
        : desk.length
          ? desk.filter((c) => c.page === desk[0].page)
          : all.filter((c) => c.page === all[0]?.page)
      if (!pool.length) {
        const row = { slot: s, reason: '' }
        if (s.fit && s.fit.measured === false) notShown.push(row)
        else {
          row.reason = hidden.has(s.key)
            ? 'Matches an element on the page, but that element is hidden on both desktop and phone (slide, tab, collapsed menu)'
            : s.type === 'url'
              ? 'No link on the audited pages points to this address'
              : 'No visible element on the audited pages matches this sample content'
          notLocated.push(row)
        }
        continue
      }
      const pageN = pool[0].page
      const id = `${entity}@${pageN}`
      const b = blocks.get(id) ?? {
        id,
        entity,
        page: pageN,
        home: pageN === home,
        demoOnly: demoOnly.has(entity),
        rows: []
      }
      b.rows.push({ slot: s, pool })
      blocks.set(id, b)
    }
  }

  // Inside a block: the component's own area is the densest vertical cluster of elements that only this component's
  // slots match (texts and links shared with other components are not evidence of where it sits). A shared candidate
  // outside that area is rejected rather than guessed.
  const components = []
  for (const b of blocks.values()) {
    const inside = (r, w, M = 4) =>
      r && r.x >= w.x - M && r.y >= w.y - M && r.x + r.w <= w.x + w.w + M && r.y + r.h <= w.y + w.h + M
    let wrap = mods[b.page]?.desktop?.[b.entity]
    if (!wrap && !b.entity.startsWith('module-')) {
      // An article, category or contact: the smallest article / blog item box that holds its own title.
      const titles = b.rows
        .filter((r) => r.slot.column === 'title')
        .flatMap((r) => r.pool)
        .map((c) => c.rects.desktop)
        .filter(Boolean)
      const boxes = (mods[b.page]?.desktop?.containers ?? []).filter((w) => titles.some((t) => inside(t, w)))
      wrap = boxes.sort((x, y) => x.w * x.h - y.w * y.h)[0]
    }
    const NAV = /#t4-megamenu|offcanvas|t4-header|navbar/
    const own = (c) => {
      const mod = /#Mod(\d+)\b/.exec(c.sel)
      if (mod && b.entity.startsWith('module-')) return `module-${mod[1]}` === b.entity
      return c.ents.size === 1
    }
    let inBand
    let mid
    // Trust the wrapper only when it really holds this component: most of the elements only it matches sit inside.
    if (wrap) {
      const owned = b.rows.flatMap((r) => r.pool.filter((c) => c.rects.desktop && own(c)))
      if (owned.length && owned.filter((c) => inside(c.rects.desktop, wrap)).length * 2 < owned.length)
        wrap = null
    }
    if (wrap && wrap.h >= 2) {
      // The module's own wrapper (or the article box holding its title) is on the page: that box is the component.
      inBand = (r) => inside(r, wrap)
      mid = wrap.y + wrap.h / 2
    } else {
      const all = b.rows.flatMap((r) => r.pool.filter((c) => c.rects.desktop))
      const pick = (f) => all.filter(f)
      const tiers = [
        (c) => own(c) && EXACTISH.test(c.by) && !NAV.test(c.sel),
        (c) => own(c) && !NAV.test(c.sel),
        (c) => !NAV.test(c.sel),
        () => true
      ]
      const seed = tiers.map(pick).find((x) => x.length) ?? []
      const band = densest(seed.map((c) => c.rects.desktop))
      inBand = (r) => r && r.y + r.h >= band.y0 - BAND && r.y <= band.y1 + BAND
      mid = (band.y0 + band.y1) / 2
    }
    const kept = []
    for (const r of b.rows) {
      const ok = r.pool.filter((c) => (c.rects.desktop ? inBand(c.rects.desktop) : true))
      if (!ok.length) {
        const twins = new Set((cands.get(r.slot.key) ?? []).flatMap((c) => [...c.ents]))
        twins.delete(b.entity)
        notLocated.push({
          slot: r.slot,
          reason: (cands.get(r.slot.key) ?? []).every((c) => c.ents.size > 1)
            ? `The sample is identical to slots of ${twins.size} other components (for example ${[...twins].slice(0, 3).join(', ')}), so it cannot be told which slot belongs to this component`
            : `Only matches the same text or link elsewhere on page ${b.page}, outside the area of this component, so it is not marked`
        })
        continue
      }
      const best = ok.sort(
        (x, y) =>
          Number(!own(x)) - Number(!own(y)) ||
          Number(!EXACTISH.test(x.by)) - Number(!EXACTISH.test(y.by)) ||
          Math.abs(center(x.rects.desktop ?? { y: mid, h: 0, x: 0, w: 0 }).y - mid) -
            Math.abs(center(y.rects.desktop ?? { y: mid, h: 0, x: 0, w: 0 }).y - mid)
      )[0]
      r.rects = best.rects
      r.by = best.by
      // Rule 4 asks for a box the text could be measured in: a slot shown only through a link or an attribute (a video
      // id inside an embed URL, an email inside its mailto) has none, and its fit honestly says not measured.
      r.flags = flagsOf(r.slot, best.kind === 'text' || best.kind === 'image')
      kept.push(r)
    }
    if (!kept.length) continue
    b.rows = kept
    b.rows.sort(
      (x, y) =>
        (x.rects.desktop?.y ?? 1e9) - (y.rects.desktop?.y ?? 1e9) ||
        (x.rects.desktop?.x ?? 0) - (y.rects.desktop?.x ?? 0)
    )
    b.rows.forEach((r, i) => (r.n = i + 1))
    b.region = {}
    for (const vp of ['desktop', 'phone']) {
      const rs = b.rows.map((r) => r.rects[vp]).filter(Boolean)
      if (!rs.length) continue
      const shot = pages.find((p) => p.n === b.page)?.shots?.[vp]
      const W = shot?.width ?? (vp === 'desktop' ? 1440 : 390)
      const x0 = Math.max(0, Math.min(...rs.map((r) => r.x)) - PAD[vp])
      const y0 = Math.max(0, Math.min(...rs.map((r) => r.y)) - PAD[vp])
      const x1 = Math.min(W, Math.max(...rs.map((r) => r.x + r.w)) + PAD[vp])
      const y1 = Math.max(...rs.map((r) => r.y + r.h)) + PAD[vp]
      b.region[vp] = { x: x0, y: y0, w: Math.max(40, x1 - x0), h: Math.max(30, y1 - y0) }
    }
    b.top = b.region.desktop?.y ?? b.region.phone?.y ?? 0
    components.push(b)
  }
  components.sort((a, b) => a.page - b.page || a.top - b.top)

  for (const r of notShown) r.flags = flagsOf(r.slot, false)
  for (const r of notLocated) r.flags = flagsOf(r.slot, false)
  const rows = components.flatMap((c) => c.rows)
  const counts = {
    components: components.length,
    located: rows.length,
    notLocated: notLocated.length,
    notShown: notShown.length,
    suspicious: [...rows, ...notLocated, ...notShown].filter((r) => r.flags.length).length
  }
  return { pages, components, notLocated, notShown, counts }
}

/** The vertical cluster (gaps under GAP px) holding the most rectangles; ties go to the taller cluster. */
function densest(rects) {
  if (!rects.length) return { y0: -1e9, y1: 1e9 }
  const rs = [...rects].sort((a, b) => a.y - b.y)
  const groups = []
  for (const r of rs) {
    const g = groups.at(-1)
    if (g && r.y <= g.y1 + GAP) {
      g.n++
      g.y1 = Math.max(g.y1, r.y + r.h)
    } else groups.push({ n: 1, y0: r.y, y1: r.y + r.h })
  }
  return groups.sort((a, b) => b.n - a.n || b.y1 - b.y0 - (a.y1 - a.y0))[0]
}
