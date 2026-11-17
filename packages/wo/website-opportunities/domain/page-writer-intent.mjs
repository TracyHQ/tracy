// What the plan says each block and page of a writer call is for (#575, page writer audit items 4 and 14): the step
// chain's writer read each line's `says`, each page's `visitorQuestion`, `keyMessage` and `endAction`, the site's
// `primaryAction` and each block's `look`. The build chat's plan carries a block `reason` (and, from the plan stage,
// `message` and `carries`), a page's question and message, and the template gives each section a `name`; each is
// passed when present and read defensively, so a plan without them asks what it always asked. Pure.
import { TRADE_CARD_KIND } from './trade-cards.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** Text values only; the plan fields another stage may add are read defensively. */
const textIfAny = (name, value) => (isText(value) ? { [name]: value } : {})
const textsIfAny = (name, value) => {
  const texts = list(value).filter(isText)
  return texts.length ? { [name]: texts } : {}
}

/**
 * What the plan says a block is for (#575 audit item 4, the step chain's `says` and `look`): the name the template gives
 * the section, the plan's `reason`, and `message` and `carries` when the plan gives them; for a block kept on trade
 * basis, `basis` and the facts that show the business does the activity (`factIds`).
 */
export function intentOf(block, description, view) {
  const trade = block.basis === 'trade'
  return {
    ...textIfAny('name', description?.name),
    ...textIfAny('reason', block.reason),
    ...textIfAny('message', block.message),
    ...(isText(block.carries) ? { carries: block.carries } : textsIfAny('carries', block.carries)),
    ...(trade
      ? {
          basis: 'trade',
          facts: list(block.factIds).map(view).filter(Boolean)
        }
      : {})
  }
}

/** The trade cards a block holds (`trade-cards.mjs`): their ids, the `item` of each card field. */
export function cardsOf(block, byId) {
  const cards = list(block.data).filter((id) => byId.get(id)?.kind === TRADE_CARD_KIND)
  return cards.length ? { cards } : {}
}

/** The page as the writer reads it: its name and type, and its question, message and end action when the plan gives them. */
export const pageView = (page) => ({
  id: page.id,
  name: page.name,
  pageType: page.pageType,
  ...textIfAny('visitorQuestion', page.visitorQuestion),
  ...(isText(page.keyMessage) ? { keyMessage: page.keyMessage } : textsIfAny('keyMessage', page.keyMessage)),
  ...textIfAny('endAction', page.endAction)
})

/** The plan's primary action as the writer reads it: its text, or the label of an object that names it. */
export const primaryActionOf = (plan) => {
  const action = plan.primaryAction
  if (isText(action)) return { primaryAction: action }
  if (action && typeof action === 'object' && isText(action.label ?? action.says))
    return { primaryAction: action.label ?? action.says }
  return {}
}
