// What the plan composer knows of the site's intent before the model call (#575, plan stage restore of the step
// chain's site planner): the brief's key messages with their ids, and the main action the owner chose. The step chain's
// planner read both in its brief (`keyMessages[]`, `primaryAction`, planner-prompt.md lines 27 and 318); the build chat
// reads the key messages from the content brief and the main action from the owner's main button answer. Pure.
import { addBriefChannels, carryChannelFacts } from './plan-composer-channels.mjs'
import { laterOf } from './plan-later.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const short = (value, max) => {
  const text = String(value).trim().replace(/\s+/g, ' ')
  return [...text].length <= max
    ? text
    : `${[...text]
        .slice(0, max - 3)
        .join('')
        .trimEnd()}...`
}

/** The longest key message label the plan keeps (Contract B `label`). */
const LABEL_MAX = 80

/**
 * The brief's key messages with their ids, in the brief's order: what the model reads (`forModel`, a praise theme
 * said as praise) and what the plan keeps (`forPlan`, `{id, label}`).
 * @param {object | null | undefined} brief
 * @returns {{forModel: Array<{id: string, label: string}>, forPlan: Array<{id: string, label: string}>}}
 */
export function keyMessagesOf(brief) {
  const seen = new Set()
  const kept = list(brief?.keyMessages).filter((m) => {
    if (!isText(m?.id) || !isText(m?.label) || seen.has(m.id)) return false
    seen.add(m.id)
    return true
  })
  return {
    forModel: kept.map((m) => ({
      id: m.id,
      label: m.basis === 'praise' ? `Customers praise: ${m.label.trim()}` : m.label.trim()
    })),
    forPlan: kept.map((m) => ({ id: m.id, label: short(m.label, LABEL_MAX) }))
  }
}

/** The fact kind each main button choice leads to (`ctaChoices`, `needs-profile-questions.mjs`). */
export const MAIN_ACTION_CHANNELS = Object.freeze({
  book: 'contact.cta_url',
  call: 'contact.phone',
  email: 'contact.email',
  message: 'contact.social_url',
  visit: 'contact.address'
})

/** The main button choice: the owner's answer, else the recommended choice, else the first. */
function mainChoiceOf(profile, answers) {
  const question = list(profile?.questions).find((q) => q?.topic === 'main-button')
  if (!question) return null
  const answered = list(answers).find((a) => a?.question === question.id && isText(a?.choice))
  const ids = new Set(list(question.choices).map((c) => c?.id))
  if (answered && ids.has(answered.choice)) return answered.choice
  return (list(question.choices).find((c) => c?.recommended) ?? list(question.choices)[0])?.id ?? null
}

/**
 * The main action of the site (the step chain's `site.primaryAction`): the facts of the main button, its words
 * (`contact.cta_label`) first, then the channel the owner's choice leads to. Null without the main button's words.
 * @param {{profile: object, answers?: object[], data: object}} input `data`: the plan data (`planDataOf`)
 * @returns {{factIds: string[]} | null}
 */
export function primaryActionOf({ profile, answers, data }) {
  const shown = (fact) => !data.withheld?.has(fact.id) && !data.byId.get(fact.id)?.itemField
  const first = (kind) => data.facts.find((f) => f.kind === kind && shown(f))?.id
  const channel = MAIN_ACTION_CHANNELS[mainChoiceOf(profile, answers)]
  const label = first('contact.cta_label')
  if (!label) return null
  return { factIds: [...new Set([label, channel ? first(channel) : undefined].filter(Boolean))] }
}

/**
 * The intent inputs of the composer context. A revision (`fromPlan`, `plan-request.mjs`) reads no brief: it carries
 * the plan's key messages, main action, later list and the channel facts it holds from the brief.
 * @returns {{keyMessages: object[], keyMessageQuotes: string[], primaryAction: {factIds: string[]} | null,
 *   later: object[], channels: {placed: Set<string>, leftOut: object[]}}}
 */
export function intentContextOf({ brief, profile, answers, data, blocks, recipes, look, fromPlan }) {
  if (fromPlan) carryChannelFacts(fromPlan, data)
  const channels = addBriefChannels({ brief, profile, data, blocks, recipes })
  const shown = (id) => data.byId.has(id) && !data.withheld?.has(id)
  const carried = list(fromPlan?.primaryAction?.factIds).filter(shown)
  return {
    keyMessages: fromPlan ? list(fromPlan.keyMessages).map((m) => ({ ...m })) : keyMessagesOf(brief).forPlan,
    keyMessageQuotes: list(brief?.keyMessages).flatMap((m) => list(m?.quotes).map((q) => q?.text)),
    primaryAction: fromPlan
      ? carried.length
        ? { factIds: carried }
        : null
      : primaryActionOf({ profile, answers, data }),
    later: fromPlan ? list(fromPlan.later).map((e) => ({ ...e })) : laterOf({ brief, data, blocks, look }),
    channels
  }
}
