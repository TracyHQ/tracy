// Shared by the write step and its look guard (ADR 0044, decision 29, fourth use; card AT): a block a template prints hard coded on
// every article page, which a page the write step creates must not show. JA Boxing's article file prints a share bar
// (`div.share-social`, Facebook, X and Reddit) with no setting to turn it off, and none of its article files lacks both that bar
// and the class pages' action bar, so a created privacy page printed share buttons. The kit names, per template, the selectors of
// such blocks (`site.createdPageHide`), and the write step puts one CSS rule in the kit's head injection block that hides them on
// the pages it created only: each selector is scoped by the body classes the framework prints on an article opened under the menu
// item that opens a created page (lib/self-link-buttons.js: T4 `item-<id>`, T3 `itemid-<id>`), so an article the owner writes
// later keeps its share bar.
import { markedBlockIn, withMarkedBlock } from './empty-video-buttons.js'
import { containerListOf, pageBodyOf, RULE_END } from './self-link-buttons.js'

/** The write report line of the rule (write-step/created-page-hide-stage.js). */
export const CREATED_HIDE_SLOT = 'site:created-page-hide'

export const CREATED_HIDE_START = '<!-- tracy-created-hide:start -->'
export const CREATED_HIDE_END = '<!-- tracy-created-hide:end -->'

const each = (value) => (Array.isArray(value) ? value : [])

/** The kit's selectors of blocks a created page must not show, and what keeps an entry out. */
export function createdPageHideOf(kit) {
  const { containers, problems } = containerListOf(
    kit?.site?.createdPageHide,
    'created page hide',
    'selector'
  )
  return { selectors: containers, problems }
}

/**
 * One selector per created page's menu item and kit selector; a page with no menu item gets none.
 * @param {{ id: string, itemId: number | null }[]} created the pages the write step created, each with the menu item opening it
 * @param {string[]} selectors
 * @param {string | null} [framework] `t3` or `t4` (lib/kit-framework.js), T4 when unknown
 */
export function createdHideSelectorsFor(created, selectors, framework = null) {
  const out = []
  for (const page of each(created)) {
    const body = pageBodyOf({ option: 'com_content', view: 'article', id: Number(page?.itemId), framework })
    if (!body) continue
    for (const selector of each(selectors)) {
      const scoped = `${body} ${selector}`
      if (!out.includes(scoped)) out.push(scoped)
    }
  }
  return out
}

/** The marked block that carries the rule, or null when there is nothing to hide. */
export const createdHideBlockFor = (selectors) =>
  selectors.length
    ? `${CREATED_HIDE_START}<style>${selectors.join(',')}${RULE_END}</style>${CREATED_HIDE_END}`
    : null

export const createdHideBlockIn = (content) => markedBlockIn(content, CREATED_HIDE_START, CREATED_HIDE_END)

export const withCreatedHideBlock = (content, block) =>
  withMarkedBlock(content, block, CREATED_HIDE_START, CREATED_HIDE_END)

const SELECTOR = /^body\.com_content\.view-article\.(?:item|itemid)-\d+ (\S+)$/

/** Whether a block holds only the hide rule on the kit's selectors, each scoped to a created page's item (the look guard's test). */
export function isCreatedHideBlock(block, selectors) {
  const prefix = `${CREATED_HIDE_START}<style>`
  const suffix = `${RULE_END}</style>${CREATED_HIDE_END}`
  if (!block.startsWith(prefix) || !block.endsWith(suffix)) return false
  return block
    .slice(prefix.length, block.length - suffix.length)
    .split(',')
    .every((s) => {
      const match = SELECTOR.exec(s)
      return Boolean(match && selectors.includes(match[1]))
    })
}
