// Shared by the write step, its look guard and the site check (ADR 0044, decision 27, third use; card AM): a link in a kept row
// that leads to a page the plan hides. Some templates print a card's name and photo as links to a profile page, and the plugin
// cannot empty a link slot inside a kept row (SLOT_NOT_HIDEABLE), so once the plan drops the profile page the card links to a
// 404. The write step sends such a slot to a living page of the plan instead (write-step/hidden-page-links-stage.js), and, for
// what is left, puts a rule in the head injection block that makes a link in the kit's containers (`site.hiddenPageLinks`)
// whose address is a hidden page's plain text. Both name hidden pages by their exact addresses, so a link to a living page is
// never touched.
import { markedBlockIn, withMarkedBlock } from './empty-video-buttons.js'
import { containerListOf } from './self-link-buttons.js'

/** The write report line of the rule, which the site check reads too. */
export const HIDDEN_LINKS_SLOT = 'site:hidden-page-links'

export const HIDDEN_LINKS_START = '<!-- tracy-hidden-links:start -->'
export const HIDDEN_LINKS_END = '<!-- tracy-hidden-links:end -->'

/** A link that cannot be clicked and reads as the words around it. */
export const INERT_RULE =
  '{pointer-events:none!important;cursor:default!important;text-decoration:none!important;color:inherit!important}'

const each = (value) => (Array.isArray(value) ? value : [])
const PATH = /^\/[\w\-./~%]*$/

/** A page address as a kept page says it: no `/index.php`, no trailing slash, `/` for the front page. */
export const pagePath = (value) => {
  const path = String(value ?? '')
    .replace(/^\/?index\.php(?=\/|$)/, '')
    .replace(/\/+$/, '')
  return path === '' ? '/' : path.startsWith('/') ? path : `/${path}`
}

/** The kit's containers of links that may lead to a hidden page, and what keeps an entry out. */
export const hiddenPageLinksOf = (kit) => containerListOf(kit?.site?.hiddenPageLinks, 'hidden page link')

/**
 * The hidden pages of a site: the menu items left unpublished or opening a page the plan drops, and the addresses of those pages.
 * An address a published item or a kept page still answers at is not one of them.
 * @param {{ rows: object[], droppedPaths: string[], keptPaths: string[] }} input
 * @returns {{ itemIds: number[], paths: string[] }}
 */
export function deadTargetsOf({ rows, droppedPaths, keptPaths }) {
  const dropped = new Set(each(droppedPaths).map(pagePath))
  const kept = new Set(each(keptPaths).map(pagePath))
  const rowPath = (row) => pagePath(row?.path)
  const live = new Set(
    each(rows)
      .filter((r) => Number(r?.published) === 1 && !dropped.has(rowPath(r)))
      .map(rowPath)
  )
  const itemIds = []
  for (const row of each(rows)) {
    const id = Number(row?.id)
    if (!Number.isInteger(id) || id < 2 || Number(row?.home) === 1) continue
    if (Number(row?.published) !== 1 || dropped.has(rowPath(row))) itemIds.push(id)
  }
  const paths = []
  const add = (path) => {
    if (path !== '/' && PATH.test(path) && !kept.has(path) && !live.has(path) && !paths.includes(path))
      paths.push(path)
  }
  for (const path of dropped) add(path)
  for (const row of each(rows)) if (Number(row?.published) !== 1) add(rowPath(row))
  return { itemIds, paths }
}

/** Whether an address leads to a hidden page. With `origin`, an absolute address of another site never does. */
export function isDeadHref(href, targets, origin = null) {
  let url
  try {
    url = new URL(String(href ?? ''), origin ?? 'http://site.invalid/')
  } catch {
    return false
  }
  if (origin && url.origin !== new URL(origin).origin) return false
  const keys = [...url.searchParams.keys()]
  if (keys.length) {
    // Only an address that names the menu item alone opens that item's page.
    const id = Number(url.searchParams.get('Itemid'))
    return (
      keys.length === 1 &&
      keys[0] === 'Itemid' &&
      pagePath(url.pathname) === '/' &&
      targets.itemIds.includes(id)
    )
  }
  return targets.paths.includes(pagePath(url.pathname))
}

/** The selectors of links in the kit's containers whose address is a hidden page's, as a page prints it. */
export function hiddenLinkSelectorsFor(targets, containers) {
  const forms = [
    ...each(targets?.itemIds).flatMap((id) => [`index.php?Itemid=${id}`, `/index.php?Itemid=${id}`]),
    ...each(targets?.paths).flatMap((path) => [path, `/index.php${path}`])
  ]
  return containers.flatMap((container) => forms.map((href) => `${container} a[href="${href}"]`))
}

/**
 * The kept page a link to a hidden page is sent to: the nearest kept page above it (a profile goes to the list of profiles), else
 * the first kept page of the plan that holds the link's block; null when there is none.
 */
export function livingPageFor({ deadPath, block, kit, plan }) {
  const kitPages = new Map(each(kit?.pages).map((p) => [p?.id, p]))
  const kept = each(plan?.pages)
    .filter((p) => p?.decision === 'keep' && kitPages.has(p.id))
    .map((p) => kitPages.get(p.id))
  const dead = pagePath(deadPath)
  const above = kept
    .filter((p) => pagePath(p.path) !== '/' && dead.startsWith(`${pagePath(p.path)}/`))
    .sort((a, b) => pagePath(b.path).length - pagePath(a.path).length)
  if (above.length) return above[0]
  return kept.find((p) => Object.values(p.blocks ?? {}).some((ids) => each(ids).includes(block))) ?? null
}

/** The marked block that carries the rule, or null when there is nothing to make inert. */
export const hiddenLinkBlockFor = (selectors) =>
  selectors.length
    ? `${HIDDEN_LINKS_START}<style>${selectors.join(',')}${INERT_RULE}</style>${HIDDEN_LINKS_END}`
    : null

export const hiddenLinkBlockIn = (content) => markedBlockIn(content, HIDDEN_LINKS_START, HIDDEN_LINKS_END)

export const withHiddenLinkBlock = (content, block) =>
  withMarkedBlock(content, block, HIDDEN_LINKS_START, HIDDEN_LINKS_END)

const SELECTOR = /^(\S+) a\[href="([^"\\<>]*)"\]$/

/** Whether a block holds only the inert rule on links in the kit's containers (the look guard's test). */
export function isHiddenLinkBlock(block, containers) {
  const prefix = `${HIDDEN_LINKS_START}<style>`
  const suffix = `${INERT_RULE}</style>${HIDDEN_LINKS_END}`
  if (!block.startsWith(prefix) || !block.endsWith(suffix)) return false
  return block
    .slice(prefix.length, block.length - suffix.length)
    .split(',')
    .every((s) => {
      const match = SELECTOR.exec(s)
      return Boolean(match && containers.includes(match[1]))
    })
}
