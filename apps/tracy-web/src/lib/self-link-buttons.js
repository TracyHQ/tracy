// Shared by the write step, its look guard and the site check (ADR 0044, decision 27, second use): a "more" button that leads to
// the page it sits on. Some templates print a section's "more" button from module settings no contract slot reaches (JA Boxing's
// section chrome prints `div.bottom-actions` from the module's `link-btn` param), so a demo button linked to the page it is on
// stays. The kit names, per template, the containers of such buttons (`site.selfLinkButtons`), and the write step puts CSS rules
// in the kit's head injection block that hide, on each kept page, a link in those containers whose address is that page's own.
// Each rule is scoped by the page's body classes (T4 prints the option, the view and the menu item id there) and names the
// page's own addresses exactly, so a link to any other page is never hidden.
import { markedBlockIn, withMarkedBlock } from './empty-video-buttons.js'

/** The write report line of the rules (write-step/self-link-buttons-stage.js), which the site check reads too. */
export const SELF_LINKS_SLOT = 'site:self-link-buttons'

export const SELF_LINKS_START = '<!-- tracy-self-links:start -->'
export const SELF_LINKS_END = '<!-- tracy-self-links:end -->'

export const MAX_CONTAINERS = 10
export const MAX_CONTAINER_CHARS = 100

// One compound selector: an optional tag, an optional id, classes; at least an id or a class. No combinator, comma, attribute
// or pseudo-class, so it cannot widen a rule past its container, and the site check can match it on the host's holders.
const CONTAINER = /^([a-z][a-z0-9]*)?(#[A-Za-z_][\w-]*)?((?:\.[A-Za-z_-][\w-]*)*)$/
const TOKEN = /^[\w-]+$/
// The characters a page address may carry into a rule's attribute value.
const PATH = /^\/[\w\-./~%]*$/

const each = (value) => (Array.isArray(value) ? value : [])

/** A container's parts, or null when it is not one plain compound selector with an id or a class. */
export function containerParts(selector) {
  if (typeof selector !== 'string' || selector.length > MAX_CONTAINER_CHARS) return null
  const match = CONTAINER.exec(selector)
  if (!match || (!match[2] && !match[3])) return null
  return {
    tag: match[1] ?? null,
    id: match[2] ? match[2].slice(1) : null,
    classes: match[3] ? match[3].slice(1).split('.') : []
  }
}

export const isSafeContainer = (selector) => containerParts(selector) !== null

/**
 * The kit's containers of "more" buttons that may lead to their own page, and what keeps an entry out.
 * @returns {{ containers: string[], problems: string[] }}
 */
export function selfLinkButtonsOf(kit) {
  const containers = []
  const problems = []
  for (const entry of each(kit?.site?.selfLinkButtons)) {
    const container = typeof entry?.container === 'string' ? entry.container.trim() : null
    if (!isSafeContainer(container))
      problems.push(
        `the kit's self link container ${JSON.stringify(entry?.container ?? null)} is not one plain compound selector`
      )
    else if (!containers.includes(container)) containers.push(container)
  }
  if (containers.length > MAX_CONTAINERS) {
    problems.push(`the kit names ${containers.length} self link containers, over ${MAX_CONTAINERS}`)
    return { containers: [], problems }
  }
  return { containers, problems }
}

/** The container a link's holders (the host's ancestors, nearest first) sit in, or null. */
export function holdersMatch(holders, containers) {
  for (const container of each(containers)) {
    const parts = containerParts(container)
    if (!parts) continue
    const found = each(holders).some(
      (h) =>
        (!parts.tag || String(h?.tag ?? '').toLowerCase() === parts.tag) &&
        (!parts.id || h?.id === parts.id) &&
        parts.classes.every((c) => each(h?.classes).includes(c))
    )
    if (found) return container
  }
  return null
}

/** The body classes T4 prints for a menu item (option, view, item id), or null when its link names no view. */
function bodyOf(row) {
  const id = Number(row?.id)
  if (!Number.isInteger(id) || id < 1) return null
  const query = new URLSearchParams(String(row?.link ?? '').split('?')[1] ?? '')
  const option = query.get('option')
  const view = query.get('view')
  // Without the view, the item id alone also matches an article opened under the item, where this address is another page.
  if (!view || !TOKEN.test(view) || (option && !TOKEN.test(option))) return null
  return `body${option ? `.${option}` : ''}.view-${view}.item-${id}`
}

/** A page's own addresses as a link in its content prints them. */
function ownHrefs(path, id) {
  const p = String(path ?? '').replace(/\/+$/, '') || '/'
  const paths = !PATH.test(p) ? [] : p === '/' ? ['/', '/index.php', '/index.php/'] : [p, `/index.php${p}`]
  return [...paths, `index.php?Itemid=${id}`, `/index.php?Itemid=${id}`]
}

/**
 * The hide selectors for the kept pages: one per page, menu item opening it, container and own address.
 * @param {{ path: string, rows: { id: number, link?: string }[] }[]} openings each kept page at the address it answers now
 * @param {string[]} containers
 */
export function selfLinkSelectorsFor(openings, containers) {
  const out = []
  for (const { path, rows } of each(openings))
    for (const row of each(rows)) {
      const body = bodyOf(row)
      if (!body) continue
      for (const container of containers)
        for (const href of ownHrefs(path, Number(row.id))) {
          const selector = `${body} ${container} a[href="${href}"]`
          if (!out.includes(selector)) out.push(selector)
        }
    }
  return out
}

const RULE_END = '{display:none!important}'

/** The marked block that carries the rules, or null when there is nothing to hide. */
export const selfLinkBlockFor = (selectors) =>
  selectors.length
    ? `${SELF_LINKS_START}<style>${selectors.join(',')}${RULE_END}</style>${SELF_LINKS_END}`
    : null

export const selfLinkBlockIn = (content) => markedBlockIn(content, SELF_LINKS_START, SELF_LINKS_END)

export const withSelfLinkBlock = (content, block) =>
  withMarkedBlock(content, block, SELF_LINKS_START, SELF_LINKS_END)

const SELECTOR = /^body((?:\.[\w-]+)+) (\S+) a\[href="([^"\\<>]*)"\]$/

/** Whether a block holds only self link rules on the kit's containers, scoped to one page each (the look guard's test). */
export function isSelfLinkBlock(block, containers) {
  const prefix = `${SELF_LINKS_START}<style>`
  const suffix = `${RULE_END}</style>${SELF_LINKS_END}`
  if (!block.startsWith(prefix) || !block.endsWith(suffix)) return false
  const list = block.slice(prefix.length, block.length - suffix.length).split(',')
  return list.every((s) => {
    const match = SELECTOR.exec(s)
    return Boolean(match && /\.item-\d+$/.test(match[1]) && containers.includes(match[2]))
  })
}
