// The look guard's judge of a WordPress navigation write (site-doors/wordpress-menu.js): a `content.update {kind: "post"}`
// is open only for a `wp_navigation` post this run read, and the new body may change only what a menu's words and the
// plan's hides change: an item's `label`, an item cut out, a dropdown left empty made a plain link with its own attributes.
// Every other block, attribute and byte between blocks stays. A post that is not such a navigation is a channel nobody
// listed, never sent. Pure.
import { blocksOf } from '../lib/template-customization-question-readiness/site-pages/wordpress-blocks.js'

const WRITE = 9
const LINK_BLOCKS = new Set(['core/navigation-link', 'core/navigation-submenu', 'core/home-link'])

/** A block's attributes without its label, as one comparable string. */
const shapeOf = (attrs) => {
  const { label: _label, ...rest } = attrs ?? {}
  return JSON.stringify(rest, Object.keys(rest).sort())
}

/**
 * Why a new navigation body changes more than labels and cut items, or null when it does not.
 * @param {string} before the body read @param {string} after the body to write
 */
export function navigationChange(before, after) {
  if (after.replace(/<!--[\s\S]*?-->/g, '').trim() !== '')
    return 'it adds words or markup between the menu blocks'
  const was = blocksOf(before).filter((t) => !t.close)
  const now = blocksOf(after).filter((t) => !t.close)
  let i = 0
  for (const t of now) {
    while (i < was.length) {
      const w = was[i]
      i += 1
      const same = w.name === t.name && shapeOf(w.attrs) === shapeOf(t.attrs)
      const flattened =
        w.name === 'core/navigation-submenu' &&
        t.name === 'core/navigation-link' &&
        t.self &&
        shapeOf(w.attrs) === shapeOf(t.attrs)
      if (same || flattened) {
        if (
          t.attrs?.label !== w.attrs?.label &&
          (!LINK_BLOCKS.has(t.name) || /[<>]/.test(String(t.attrs?.label)))
        )
          return `it changes the label of ${t.name} into something that is not words`
        t.matched = true
        break
      }
      if (!LINK_BLOCKS.has(w.name)) return `it takes off ${w.name}, which is not a menu item`
    }
    if (!t.matched) return `it adds or changes ${t.name}`
  }
  for (; i < was.length; i += 1)
    if (!LINK_BLOCKS.has(was[i].name)) return `it takes off ${was[i].name}, which is not a menu item`
  return null
}

/**
 * @param {{ id?: unknown, fields?: Record<string, unknown> }} params a `content.update {kind: "post"}`
 * @param {{ rows: Map<string, any> }} state what the guard read this run
 * @returns {{ step: number, what: string, reason: string, channel?: boolean }[]}
 */
export function navigationFaults(params, state) {
  const what = `post ${params.id}`
  const row = state.rows.get(`post:${params.id}`)
  if (row?.post_type !== 'wp_navigation' || typeof (row.post_content ?? row.content) !== 'string')
    return [
      {
        step: WRITE,
        what,
        reason:
          'only a navigation post read in this run is written, for its labels and the items it takes off',
        channel: true
      }
    ]
  const fields = Object.keys(params.fields ?? {})
  if (fields.join() !== 'post_content' || typeof params.fields.post_content !== 'string')
    return [{ step: WRITE, what, reason: 'a navigation post is written by its body alone', channel: true }]
  const why = navigationChange(String(row.post_content ?? row.content), params.fields.post_content)
  return why ? [{ step: WRITE, what, reason: `the navigation: ${why}` }] : []
}
