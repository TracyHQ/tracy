// What the plan says each block and page of a writer call is for (#575, page writer audit items 4 and 14): the step
// chain's writer read each line's `says`, each page's `visitorQuestion`, `keyMessage` and `endAction`, the site's
// `primaryAction` and each block's `look`. The build chat's plan (Contract B, `build-contract-plan-intent.mjs`) carries
// a block `reason`, `message` and `carries` (key message ids), a page's question, message, `seo` and `endAction
// {block, factIds}`, and the plan's `primaryAction {factIds}`; the template gives each section a `name`. The writer
// reads them in words: ids become the key message labels, the button words and the channel. Every one is optional (a
// plan stored before the plan stage has none), so a plan without them asks what it always asked. Pure.
import { WHATSAPP_FACT_ID } from './plan-composer-channels.mjs'
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
 * the section, the plan's `reason` and `message`, the key messages its `carries` ids name, by their labels (an id the
 * plan does not list is left out: the plan gate already takes those off); for a block kept on trade basis, `basis` and
 * the facts that show the business does the activity (`factIds`).
 * @param {Map<string, string>} labels key message id to its label (`keyMessageLabelsOf`)
 */
export function intentOf(block, description, view, labels = new Map()) {
  const trade = block.basis === 'trade'
  return {
    ...textIfAny('name', description?.name),
    ...textIfAny('reason', block.reason),
    ...textIfAny('message', block.message),
    ...textsIfAny(
      'keyMessages',
      list(block.carries).map((id) => labels.get(id))
    ),
    ...(trade
      ? {
          basis: 'trade',
          facts: list(block.factIds).map(view).filter(Boolean)
        }
      : {})
  }
}

/** The plan's key messages by id. */
export const keyMessageLabelsOf = (plan) => new Map(list(plan.keyMessages).map((m) => [m?.id, m?.label]))

/** The trade cards a block holds (`trade-cards.mjs`): their ids, the `item` of each card field. */
export function cardsOf(block, byId) {
  const cards = list(block.data).filter((id) => byId.get(id)?.kind === TRADE_CARD_KIND)
  return cards.length ? { cards } : {}
}

/** The plain name of the channel a main action leads to, by the kind of its fact (the words of prompt rule 7). */
const CHANNEL_NAMES = Object.freeze({
  'contact.cta_url': 'booking link',
  'contact.phone': 'call',
  'contact.email': 'email',
  'contact.social_url': 'message',
  'contact.address': 'visit'
})
const isWhatsapp = (id, value) =>
  id === WHATSAPP_FACT_ID || /(^|\/\/)(wa\.me|api\.whatsapp\.com)\//.test(value)

/**
 * A main action in words: the button words (its `contact.cta_label` fact) and the channel its other fact leads to
 * (`plan-composer-intent.mjs` `primaryActionOf`). Null without the button words.
 * @param {string[] | undefined} factIds
 * @param {Map<string, object>} byId the plan data
 * @returns {{label: string, channel?: string} | null}
 */
export function actionWordsOf(factIds, byId) {
  const facts = list(factIds)
    .map((id) => ({ id, entry: byId.get(id) }))
    .filter(({ entry }) => entry?.what === 'fact' && isText(entry.entry?.value))
  const label = facts.find(({ entry }) => entry.kind === 'contact.cta_label')?.entry.entry.value
  if (!label) return null
  const channel = facts
    .map(({ id, entry }) =>
      entry.kind === 'contact.social_url' && isWhatsapp(id, entry.entry.value)
        ? 'WhatsApp'
        : CHANNEL_NAMES[entry.kind]
    )
    .find(Boolean)
  return { label, ...(channel ? { channel } : {}) }
}

/**
 * The page as the writer reads it: its name and type, and from the plan when it gives them its question, message,
 * search intents and terms (`search`), and its end action (`{block, label, channel}`: the block that leads to the main
 * action, and that action in words).
 */
export function pageView(page, byId) {
  const { titleIntent, descriptionIntent, searchTerms } = page.seo ?? {}
  const search = {
    ...textIfAny('titleIntent', titleIntent),
    ...textIfAny('descriptionIntent', descriptionIntent),
    ...textsIfAny('searchTerms', searchTerms)
  }
  const end = isText(page.endAction?.block) ? actionWordsOf(page.endAction.factIds, byId) : null
  return {
    id: page.id,
    name: page.name,
    pageType: page.pageType,
    ...textIfAny('visitorQuestion', page.visitorQuestion),
    ...textIfAny('keyMessage', page.keyMessage),
    ...(Object.keys(search).length ? { search } : {}),
    ...(end ? { endAction: { block: page.endAction.block, ...end } } : {})
  }
}

/** The plan's main action in words (`actionWordsOf`), when the plan has one. */
export const primaryActionOf = (plan, byId) => {
  const words = actionWordsOf(plan.primaryAction?.factIds, byId)
  return words ? { primaryAction: words } : {}
}
