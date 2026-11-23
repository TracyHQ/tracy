// What a plan link leads to, as an address the site can hold (TracyHQ/tracy#371). `leadsTo` names a kept page, a contact fact
// (`<channel>:<factId>`), a legal page (`legal:<kind>`) or an address as it is. Nothing here makes up an address: whatever cannot
// be resolved comes back with the reason, and its line is failed.
import { articleOfPage, rowsOpening } from './page-meta-write.js'
import { readRow } from './settings-door.js'

const each = (value) => (Array.isArray(value) ? value : [])
const ADDRESS = /^(https?:|tel:|mailto:|\/|#)/
const FACT = /^(phone|whatsapp|email|social|map):(.+)$/

const failed = (reason) => ({ kind: 'failed', reason })
const digitsOf = (value) => String(value).replace(/[^0-9]/g, '')

/**
 * An address a visitor can open: the plugin names an article's address with the host the door reached it at, which on a
 * hosted site is a container name no browser can reach, so only its path is kept.
 */
function sitePath(url) {
  const absolute = /^https?:\/\/[^/]+(\/.*)?$/i.exec(url)
  return absolute ? (absolute[1] ?? '/') : url
}

/** The address of a kit page on this site and how to read that it is still there, or the reason there is none. */
function pageAddress(page, { kit, rows, articles }) {
  const [row] = rowsOpening(page, rows, null, kit)
  if (row) {
    const id = Number(row.id)
    return {
      kind: 'page',
      page,
      row: id,
      url: `index.php?Itemid=${id}`,
      alive: readRow('menuItem', id, 'published')
    }
  }
  const id = articleOfPage(page, kit)
  const article = id === null ? null : articles.get(id)
  if (typeof article?.url === 'string' && article.url)
    return { kind: 'page', page, url: sitePath(article.url), alive: readRow('article', id, 'state') }
  return failed(`no published menu item or article on the site opens ${page.id} (${page.path})`)
}

const socialUrl = (value) => (typeof value === 'object' ? value?.url : value)

/**
 * An address the plan names, in the one form the site's link slots take (the Joomla plugin's QuickstartContract checkValue:
 * `https://` with no space, `tel:` with digits, a path, an anchor): spaces are encoded, `http://` becomes `https://`, and a
 * phone number keeps its digits. Before (dev lat29, 23/11/2026), JA Diner's "Book a table" and "Get directions" buttons were
 * refused as "Unsupported CTA URL" and kept the template's addresses.
 * @param {string} target
 */
export function plainAddress(target) {
  const text = String(target ?? '').trim()
  if (/^tel:/i.test(text))
    return `tel:${text.slice(4).trim().startsWith('+') ? '+' : ''}${digitsOf(text.slice(4))}`
  if (/^https?:\/\//i.test(text)) return text.replace(/^http:\/\//i, 'https://').replace(/\s/g, '%20')
  return text.replace(/\s/g, '%20')
}

/** The address of a contact fact, or the reason it has none. */
function factAddress(channel, fact) {
  const words = `the fact ${fact.id}`
  if (channel === 'map') return { kind: 'map' }
  if (channel === 'phone') {
    const digits = digitsOf(fact.value)
    if (!digits) return failed(`${words} holds no phone number`)
    return { kind: 'phone', url: `tel:${String(fact.value).trim().startsWith('+') ? '+' : ''}${digits}` }
  }
  if (channel === 'email') {
    const address = String(fact.value ?? '').trim()
    return /^\S+@\S+$/.test(address)
      ? { kind: 'email', url: `mailto:${address}` }
      : failed(`${words} holds no e-mail address`)
  }
  const url = String(socialUrl(fact.value) ?? '').trim()
  if (/^https:\/\/\S+$/.test(url)) return { kind: channel, url }
  if (channel === 'whatsapp' && digitsOf(fact.value))
    return { kind: channel, url: `https://wa.me/${digitsOf(fact.value)}` }
  return failed(`${words} holds no https address for this ${channel} link`)
}

/**
 * @param {string} leadsTo
 * @param {{ plan: object, kit: object, facts: Map<string, object>, rows: object[], articles: Map<number, object>,
 *   createdPages?: Map<string, { url?: string, reason?: string }> }} site
 * @returns {{ kind: string, url?: string, page?: object, row?: number, alive?: object, reason?: string }} `kind` is "failed"
 *   with `reason` when there is no address; `alive` is how to read that a page is still there
 */
export function linkTarget(leadsTo, site) {
  const { plan, kit, facts } = site
  const target = String(leadsTo ?? '').trim()
  if (!target) return failed('the plan gives this link no target')
  const channel = FACT.exec(target)
  if (channel) {
    const fact = facts.get(channel[2])
    if (!fact) return failed(`${target} names no fact of the brief`)
    if (fact.onSite === false) return failed(`${target}: the brief keeps this fact off the site`)
    return factAddress(channel[1], fact)
  }
  if (target.startsWith('legal:')) {
    const legal = each(plan?.site?.legalPages).find((l) => l?.id === target || `legal:${l?.kind}` === target)
    if (!legal) return failed(`${target} is not a legal page of the plan`)
    if (legal.use === 'create') {
      const made = site.createdPages?.get(legal.id ?? `legal:${legal.kind}`)
      if (made?.url) return { kind: 'created', url: made.url }
      return failed(
        `the plan creates ${target}, and it was not created (${made?.reason ?? 'the run did not reach it'}), so this link has nowhere to go`
      )
    }
    return linkTarget(legal.use, site)
  }
  // A path the plan names that is a kept page's (its slug, or its path in the kit) is that page: the site serves it only at
  // its menu item's address, and a bare path answers 404 where the site has no URL rewriting. Before (dev lat30, 23/11/2026),
  // two JA Boxing buttons were written as "/memberships" and answered 404.
  const own = target.startsWith('/') && !target.startsWith('//') ? keptPageAt(target, site) : null
  if (own) return linkTarget(own, site)
  if (ADDRESS.test(target)) return { kind: 'address', url: plainAddress(target) }
  const planned = each(plan?.pages).find((p) => p?.id === target)
  if (planned && planned.decision !== 'keep')
    return failed(`the plan drops ${target}, so a link to it would die`)
  const page = each(kit?.pages).find((p) => p?.id === target)
  if (!page || !planned)
    return failed(`${target} is neither a kept page, a contact fact, a legal page nor an address`)
  return pageAddress(page, site)
}

/** The kept page a site path names: one whose plan slug is the path's last part, or whose kit path is the path. */
function keptPageAt(target, { plan, kit }) {
  const path = String(target)
    .split(/[?#]/, 1)[0]
    .replace(/^\/+|\/+$/g, '')
  if (!path) return null
  const kept = each(plan?.pages).filter((p) => p?.decision === 'keep')
  const last = path.split('/').at(-1)
  const bySlug = kept.filter((p) => typeof p.slug === 'string' && p.slug.replace(/^\/+|\/+$/g, '') === last)
  if (bySlug.length === 1) return bySlug[0].id
  const keptIds = new Set(kept.map((p) => p.id))
  const byPath = each(kit?.pages).filter(
    (p) => keptIds.has(p?.id) && String(p.path ?? '').replace(/^\/+|\/+$/g, '') === path
  )
  return byPath.length === 1 ? byPath[0].id : null
}

export { articleOfPage }
