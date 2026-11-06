// hidden-page-links (block; ADR 0044, decision 29, card AM): no kept page shows a clickable link to a page the plan hid (dropped,
// or its menu item unpublished). Read on the host's `shownLinks`, which say whether a link takes a click (`clickable`, its
// pointer events); hidden pages are the report's dropped pages and the menu items the site holds unpublished. The write step
// owes it: it sends such a link to a living page, or makes it plain text. A host from before the `clickable` read answers no
// `shownLinksClickable`, and the group is unmeasured.
import { deadTargetsOf, isDeadHref } from '../lib/hidden-page-links.js'
import { menuRows } from '../lib/joomla-menu-rows.js'
import { WRITE_STEP } from '../lib/site-build-steps.js'
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead, WIDTHS } from './host-pages.js'
import { pathOfMeasure } from './page-faults.js'

const each = (value) => (Array.isArray(value) ? value : [])

export const hiddenPageLinksGroup = {
  name: 'hidden-page-links',
  causingStep: WRITE_STEP,
  level: 'block',
  async run(context) {
    const read = await pagesRead(context)
    const known = read.measures.filter((m) => m.shownLinksClickable === true)
    if (!known.length)
      throw new GroupUnmeasured(
        'The host did not say which shown links take a click (`shownLinksClickable`), so this was not measured.'
      )
    const kitPages = new Map(each(context.kit?.pages).map((p) => [p?.id, p?.path]))
    const droppedPaths = each(context.report?.slots)
      .filter((l) => l?.part === 'page-drop' && l.status === 'hidden' && kitPages.has(l.slot))
      .map((l) => kitPages.get(l.slot))
    // The menu is read only when some shown link takes a click: a page with none has nothing to judge.
    const clickable = known.some((m) => each(m.shownLinks).some((l) => l?.clickable !== false))
    const rows = clickable ? await menuRows((action, params) => context.read(action, params)) : []
    const targets = deadTargetsOf({
      rows,
      droppedPaths,
      keptPaths: each(context.report?.keptPages).map((p) => p.path)
    })
    const failures = []
    const seen = new Set()
    let checked = 0
    for (const m of known)
      for (const l of each(m.shownLinks)) {
        checked++
        if (l?.clickable === false) continue
        let origin = null
        try {
          origin = new URL(l.href).origin
        } catch {}
        if (!isDeadHref(l.href, targets, origin)) continue
        const id = `${pathOfMeasure(m.path)} ${m.width} ${l.href} ${l.text}`
        if (seen.has(id)) continue
        seen.add(id)
        failures.push({
          page: m.path,
          width: m.width,
          measured: l.text || l.href,
          causingStep: WRITE_STEP,
          reason: `This link takes a click and leads to a page the plan hid (${l.href}).`
        })
      }
    return { checked, failures, widths: WIDTHS, calls: read.calls }
  }
}
