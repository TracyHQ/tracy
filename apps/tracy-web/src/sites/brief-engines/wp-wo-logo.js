/**
 * WordPress: the business name as text in the logo spots of a site a Website Opportunities build made, when no logo was given
 * (ja-restaurant wp7 1.0.1, 22/10/2026: every page showed the demo's `jr-site-logo.png` beside the restaurant's name).
 *
 * The theme already prints the site name where `site_logo` is empty, but only in a Site Logo block that asks for it by class
 * (`inc/brand-logo.php`: `tracy-logo-fallback`, `*-logo--light`, or a dark spot, and never `tracy-logo-bare`). So the demo's
 * picture is taken off only when EVERY Site Logo block of the header and the footer asks for it: a spot that does not would
 * show nothing at all, which is worse than the demo's picture. A customer's build is not touched here: a logo left blank keeps
 * the template's own (LOGO-4 dropped, 09/10/2026); this applies to an opportunity's build only.
 */
import { parseBlocks } from './wp-blocks.js'

const DARK = /(?:^|\s)(?:tracy-logo-dark|[a-z0-9_-]*[_-]logo--dark)(?:\s|$)/
const FALLBACK = /(?:^|\s)(?:tracy-logo-fallback|[a-z0-9_-]*[_-]logo--light)(?:\s|$)/
const BARE = /(?:^|\s)tracy-logo-bare(?:\s|$)/

/**
 * Whether every Site Logo block in these bodies prints the site name when `site_logo` is empty; false when there is none.
 * @param {string[]} bodies
 */
export function logosFallBackToName(bodies) {
  /** @type {string[]} */
  const classes = []
  const walk = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    if (node.name === 'core/site-logo') classes.push(String(node.attrs?.className ?? ''))
    for (const child of node.children) walk(child)
  }
  for (const body of bodies) {
    const root = parseBlocks(body)
    if (!root) return false
    walk(root)
  }
  return classes.length > 0 && classes.every((c) => (DARK.test(c) || FALLBACK.test(c)) && !BARE.test(c))
}

/**
 * @param {object} input
 * @param {(action: string, params: Record<string, unknown>) => Promise<any>} input.call - the site's door
 * @param {string} input.applyId - the write is recorded under it, so `apply.revert` brings the picture back
 * @param {(note: string) => void} input.note
 * @returns {Promise<boolean>} whether `site_logo` was emptied
 */
export async function woNameAsLogo({ call, applyId, note }) {
  /** @type {(params: Record<string, unknown>) => Promise<{ item?: any } | { missing: true } | null>} */
  const get = async (params) => {
    const answer = await call('content.get', params).catch(() => null)
    if (answer?.ok === false) return answer.error === 'not_found' ? { missing: true } : null
    return answer?.item ? answer : null
  }
  const bodies = []
  for (const key of ['header', 'footer']) {
    // A part that could not be read may hold a logo spot that would show nothing: only a part the site says it does not
    // have is left out.
    const read = await get({ kind: 'templatePart', key })
    if (read === null) {
      note(`the template's logo stays: the ${key} could not be read`)
      return false
    }
    if ('missing' in read) continue
    const content = read.item.content
    if (typeof content !== 'string') {
      note(`the template's logo stays: the ${key} could not be read`)
      return false
    }
    if (content !== '') bodies.push(content)
  }
  if (bodies.length === 0 || !logosFallBackToName(bodies)) {
    note("the template's logo stays: a logo spot of this design would show nothing without it")
    return false
  }
  const option = await get({ kind: 'option', key: 'site_logo' })
  const value = option && 'item' in option ? option.item?.value : undefined
  if (value === undefined || value === null || value === '' || Number(value) === 0) return false
  // 🔒 AN OPTION IS SENT AS THE STRING WORDPRESS STORES (lrsweep rig round 6, 24/10/2026): the plugin logs the
  // value as sent and `apply.revert` compares it strictly with the option read back, always a string, so a number
  // 0 made this step's revert answer CONFLICT and the template's logo could never come back.
  const answer = await call('content.update', {
    apply_id: applyId,
    kind: 'option',
    id: 0,
    key: 'site_logo',
    fields: { value: '0' }
  }).catch((error) => ({ ok: false, message: error instanceof Error ? error.message : String(error) }))
  if (answer?.ok === false) {
    note(
      `the template's logo stays: the site refused site_logo (${answer.message ?? answer.error ?? 'no answer'})`
    )
    return false
  }
  return true
}
