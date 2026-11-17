// The intent a gated plan carries for the page writer (#575, plan stage restore of the step chain's site plan): the
// model's page and block intent read from its reply, held to the plan (`plan-intent-key-messages.mjs`), the search
// terms made by code (`plan-intent-seo.mjs`), the reviews ordered on purpose, and, while the composer has another
// attempt, the intent the prompt asks for and the model left out sent back (`intent_missing`). The step chain's planner
// had `visitorQuestion`, `keyMessage` and `seo` on every kept page and a `message` on every block decision
// (planner-prompt.md lines 339 to 343 and 357); its writer wrote from them (writer-prompt.md lines 30 to 31 and 205 to
// 208). Pure.
import { withoutLostEndActions } from './plan-intent-end-action.mjs'
import { withKeyMessages } from './plan-intent-key-messages.mjs'
import { withSearchTerms } from './plan-intent-seo.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The intent keys a page of the reply may carry, and those of a block (`plan-gate-reply.mjs`). */
export const PAGE_INTENT_KEYS = Object.freeze(['visitorQuestion', 'keyMessage', 'seo'])
export const BLOCK_INTENT_KEYS = Object.freeze(['message', 'carries'])

/** A page's intent as the reply gives it: its text notes and its search intents (code adds the terms). */
export function pageIntentOf(page) {
  const seo = page.seo
  const intents = {
    ...(isText(seo?.titleIntent) ? { titleIntent: seo.titleIntent.trim() } : {}),
    ...(isText(seo?.descriptionIntent) ? { descriptionIntent: seo.descriptionIntent.trim() } : {})
  }
  return {
    ...(isText(page.visitorQuestion) ? { visitorQuestion: page.visitorQuestion.trim() } : {}),
    ...(isText(page.keyMessage) ? { keyMessage: page.keyMessage.trim() } : {}),
    ...(Object.keys(intents).length ? { seo: intents } : {})
  }
}

/** A block's intent as the reply gives it. */
export function blockIntentOf(block) {
  return {
    ...(isText(block.message) ? { message: block.message.trim() } : {}),
    ...(list(block.carries).length ? { carries: [...new Set(block.carries)] } : {})
  }
}

/** Report the intent the prompt asks of each kept page and block the model left out (on a non final attempt). */
export function missingIntentProblems(composition, index, problem) {
  for (const i of new Set(index.values())) {
    const page = composition.pages[i]
    const missing = ['visitorQuestion', 'keyMessage'].filter((k) => !isText(page[k]))
    if (!isText(page.seo?.titleIntent) || !isText(page.seo?.descriptionIntent)) missing.push('seo')
    if (missing.length)
      problem(
        'intent_missing',
        `pages[${i}]`,
        `a kept page carries ${missing.join(', ')}: write each as a short note`
      )
    page.blocks.forEach((block, j) => {
      if ((block.data.length || block.basis) && !isText(block.message))
        problem(
          'intent_missing',
          `pages[${i}].blocks[${j}].message`,
          'a kept block carries its point in one line'
        )
    })
  }
}

/** The reviews of each reviews block on purpose (the step chain's row `proof`, planner-prompt.md lines 210 to 214 and
 * 426): a review that names a person of the plan or holds a key message's quote first, the rest in the model's
 * order. Count and choice stay the model's, within the template's slots. */
export function withReviewsOnPurpose(pages, { data, blocks, quotes = [] }) {
  const names = data.items
    .filter((i) => i.kind === 'person')
    .map((i) => String(i.label).trim().split(/\s+/)[0])
    .filter((n) => n.length >= 2)
    .map((n) => new RegExp(`\\b${escaped(n)}\\b`, 'i'))
  const said = list(quotes)
    .map((q) => String(q).trim().toLowerCase())
    .filter((q) => q.length >= 12)
  const strong = (id) => {
    const text = String(data.byId.get(id)?.source?.fields?.['quote.text']?.value ?? '')
    if (text.length < 12) return false
    return names.some((n) => n.test(text)) || said.some((q) => text.toLowerCase().includes(q))
  }
  return pages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => {
      if (blocks.get(block.block)?.type !== 'reviews' || block.data.length < 2) return block
      const ordered = [...block.data.filter(strong), ...block.data.filter((id) => !strong(id))]
      return ordered.join() === block.data.join() ? block : { ...block, data: ordered }
    })
  }))
}

/**
 * The final pages with their intent: key messages held and placed, search terms, reviews on purpose.
 * @param {object[]} pages the gate's final pages
 * @param {object} context the composer context (`keyMessages`, `keyMessageQuotes`, `sendBackIntent`)
 * @param {{fix: Function, problem: Function, index: Map<string, number>}} report
 */
export function withIntent(pages, context, report) {
  const placed = withKeyMessages(
    pages,
    {
      keyMessages: context.keyMessages,
      blocks: context.blocks,
      recipes: context.recipes,
      sendBack: Boolean(context.sendBackIntent)
    },
    report
  )
  const ordered = withReviewsOnPurpose(placed, {
    data: context.data,
    blocks: context.blocks,
    quotes: context.keyMessageQuotes
  })
  return withSearchTerms(ordered, context.data)
}

/**
 * The gate's intent step: the intent the model left out goes back while it has another attempt (runs with a brief,
 * `context.sendBackIntent`); the pages get their key messages, reviews and search terms; the plan gets its key
 * messages, main action (the facts the plan keeps) and later list.
 * @param {{fix: Function, problem: Function, index: Map<string, number>, kept: (entry: object) => boolean}} report
 * @returns {{pages: object[], fields: object}}
 */
export function planIntentOf(composition, pages, context, report) {
  if (context.sendBackIntent && context.brief)
    missingIntentProblems(composition, report.index, report.problem)
  const intended = withIntent(withoutLostEndActions(pages), context, report)
  const keptFacts = new Set(context.data.facts.filter(report.kept).map((f) => f.id))
  const action = list(context.primaryAction?.factIds).filter((id) => keptFacts.has(id))
  return {
    pages: intended,
    fields: {
      ...(list(context.keyMessages).length ? { keyMessages: context.keyMessages } : {}),
      ...(action.length ? { primaryAction: { factIds: action } } : {}),
      ...(list(context.later).length ? { later: context.later } : {})
    }
  }
}
