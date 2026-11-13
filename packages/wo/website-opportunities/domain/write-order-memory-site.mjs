// A fake write step (ticket #597): it applies a write order to a blank site kept in memory and reports in the shape the
// step chain's write step returns (`{report: {status: 'done', counts: {written, skipped}}}`). It refuses an order that
// fails `checkWriteOrder`, and a script makes chosen calls fail, so the engine's re-run rule can be tested. It doubles as
// the local trial tool until the real Joomla writer lands (#587, #584). Pure apart from its own memory.
import { checkWriteOrder, placesOfOrder } from './write-order-check.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const hasValue = (e) => e.value !== undefined && e.value !== null && e.value !== ''

/**
 * A failure of the memory site, scripted or because the order is invalid. An invalid order fails the same way on every
 * call (`noRerun: true`); a scripted failure stands for a write call that may pass when run again.
 */
export class MemorySiteError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`)
    this.code = code
    this.details = details
    this.noRerun = code === 'order_invalid'
  }
}

function valuesOf(place, counts) {
  const values = {}
  for (const e of list(place.fields)) {
    if (e.from === 'derived') values[e.field] = { page: e.target.page }
    else if (hasValue(e)) values[e.field] = e.value
    else {
      counts.skipped += 1
      continue
    }
    counts.written += 1
  }
  return values
}

/**
 * A blank site in memory.
 * @param {{failOn?: number | number[]}} [script] the calls of `apply` (from 1) that fail with `memory_site_failed`
 * @returns {{apply: (order: object) => Promise<{report: object, site: object}>, calls: number, site: object | null}}
 */
export function memorySite({ failOn = [] } = {}) {
  const failing = new Set(Array.isArray(failOn) ? failOn : [failOn])
  const state = { calls: 0, site: null }
  async function apply(order) {
    state.calls += 1
    if (failing.has(state.calls))
      throw new MemorySiteError('memory_site_failed', `scripted failure of call ${state.calls}`, {
        call: state.calls
      })
    const problems = checkWriteOrder(order)
    if (problems.length)
      throw new MemorySiteError('order_invalid', `${problems.length} problem(s)`, { problems })
    const counts = { written: 0, skipped: 0 }
    const pictures = new Map()
    for (const p of list(order.pictures))
      if (p.source === 'none') counts.skipped += 1
      else {
        pictures.set(p.frame, p.file ?? p.ref ?? { generate: p.generate })
        counts.written += 1
      }
    const icons = new Map()
    for (const i of list(order.icons))
      if (i.source === 'none') counts.skipped += 1
      else {
        icons.set(i.id, i.source === 'network' ? { network: i.network } : { icon: i.icon?.name })
        counts.written += 1
      }
    counts.skipped += list(order.hidden).length
    const blockOf = (block) => ({
      id: block.id,
      block: block.block,
      state: block.state,
      ...(block.fallback ? { fallback: block.fallback } : {}),
      fields: valuesOf(block, counts),
      items: list(block.items)
        .filter((i) => i.state === 'show')
        .map((item) => ({
          id: item.id,
          index: item.index,
          fields: valuesOf(item, counts),
          lists: rowsOf(item)
        })),
      lists: rowsOf(block),
      ...(block.library ? { html: block.library.html } : {})
    })
    const rowsOf = (owner) =>
      list(owner.lists)
        .filter((g) => g.state === 'show')
        .map((g) => ({
          list: g.list,
          rows: g.rows
            .filter((r) => r.state === 'show')
            .map((r) => ({ row: r.row, fields: valuesOf(r, counts) }))
        }))
    const site = {
      language: order.plan?.language ?? null,
      look: order.look,
      menu: list(order.pages).map((p) => ({ page: p.id, ...p.menu })),
      pages: list(order.pages).map((page) => ({
        id: page.id,
        home: page.home,
        seo: page.seo,
        blocks: list(page.blocks)
          .filter((b) => b.state !== 'hidden')
          .map(blockOf)
      })),
      pictures: Object.fromEntries(pictures),
      icons: Object.fromEntries(icons),
      places: placesOfOrder(order).filter(({ place }) => place.state === 'show').length
    }
    state.site = site
    return { report: { status: 'done', counts }, site }
  }
  return {
    apply,
    get calls() {
      return state.calls
    },
    get site() {
      return state.site
    }
  }
}
