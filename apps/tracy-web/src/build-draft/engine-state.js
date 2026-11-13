/**
 * The engine state the build chat's doors answer (#609, `EngineState` of `tracy_build`'s `doors.ts`), made from the
 * draft row at read time. Pure.
 *
 * 🔒 THE QUESTIONS COME ONLY FROM THE NEEDS PROFILE, AND THE ANSWERED ONES NEVER COME BACK. A finished research step
 * answers every question the needs profile issued (decision D35: the engine decides how many) and, as `ask`, the next
 * card: at most `MAX_QUESTIONS_AT_ONCE` of the ones the draft holds no answer for yet. The card is made from the
 * draft's answers each time it is read, so an answer stored through `PUT /answers` takes its question off the next card.
 *
 * 🔒 A FAULT IS NEVER A QUESTION. A stopped step carries one plain sentence (`say`) for the owner and nothing else
 * the owner sees; what went wrong is the draft's `fault`, for the team.
 *
 * 🔒 AN OPEN QUESTION IS NEVER A FAULT. A compose that needs the owner's answer first (the site name, `engine-asking.js`)
 * ends `asking`: its `result` carries the one question and its card, whatever the draft holds for it (an answer that
 * did not fit is replaced by the next one), and `say` the sentence that tells the owner why, when there is one.
 */
import { planProfileOf } from './engine-steps.js'

/** The chat card shows at most three questions at a time (`MAX_QUESTIONS_AT_ONCE` of `@tracy/core/build-chat`). */
export const MAX_QUESTIONS_AT_ONCE = 3

/** What a stopped step says to the owner, by why it stopped. Plain English, no dashes. */
export const SAY = Object.freeze({
  fault: 'Something went wrong on our side, so I stopped here. The team can see what happened.',
  research:
    'I could not read enough about your business from what you gave me, so I stopped here. The team can see what happened.',
  brand:
    'I could not read your own brand colour and logo yet, so I stopped before showing you a plan. The team can see what happened.',
  siteName:
    'I need a name to show on your site before I can plan it, and I could not find one I am allowed to use. The team can see what happened.',
  links:
    'Please give me at least one link to your website, your Google Maps listing or one of your social pages, so I can read about your business.',
  interrupted: 'My work on this was interrupted, so I stopped here. The team can see what happened.'
})

/** Said when the owner's site name is longer than the chosen design's name fields hold. Plain English, no dashes. */
export const siteNameTooLongSay = (limit) =>
  `That name is too long for this design. Please keep it to ${limit} characters or fewer.`

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The choice the question recommends, if any. */
const recommendedOf = (question) => list(question.choices).find((c) => c?.recommended === true) ?? null

/**
 * The `ask_user_question` request for the questions not answered yet, the same shape `askRequestOf`
 * (`@tracy/core/build-chat`) makes; null when nothing is left to ask.
 * @param {object[]} questions Contract B questions, most important first
 * @param {object[]} answers Contract B answers the draft holds
 */
export function askOf(questions, answers) {
  const done = new Set(list(answers).map((a) => a?.question))
  const open = list(questions)
    .filter((q) => !done.has(q.id))
    .slice(0, MAX_QUESTIONS_AT_ONCE)
  if (open.length === 0) return null
  return {
    questions: open.map((q) => {
      const recommended = recommendedOf(q)
      return {
        id: q.id,
        question: q.prompt,
        options: list(q.choices).map((c) =>
          c.detail ? { label: c.label, description: c.detail } : { label: c.label }
        ),
        multiSelect: false,
        ...(recommended ? { recommended: recommended.label } : {})
      }
    })
  }
}

/**
 * What research found, small: the business's name and how many facts and items of each kind it holds. Read from the
 * profile as the plan step reads it (`planProfileOf`): a held name goes by its neutral identity, and with none the
 * name is empty, so the model is never handed the name the owner keeps off the site.
 */
export function profileSummaryOf(profile) {
  const held = profile?.withheld?.name === true && !isText(profile.withheld.siteName)
  const names = held ? [] : list(profile?.facts?.['business.name'])
  const business = names.map((n) => n?.value).find(isText) ?? ''
  const counts = { facts: Object.keys(profile?.facts ?? {}).length }
  for (const [kind, items] of Object.entries(profile?.items ?? {})) counts[kind] = list(items).length
  return { business, counts }
}

/**
 * The engine state of a draft row (`engine-store.js readEngineRow`) as the doors answer it.
 * @param {object | null} row
 * @param {{kit?: {blockStore: object, library: object[]} | null}} [options] the chosen template's kit, when the draft
 *   names one: the site name question is held to its business name limit
 */
export function engineStateOf(row, { kit = null } = {}) {
  const engine = row?.engine
  if (!engine) return { step: null, state: 'idle' }
  const { step, state } = engine
  if (state === 'running') return { step, state }
  if (state === 'stopped')
    return { step, state, say: engine.say ?? SAY.fault, ...(engine.reason ? { reason: engine.reason } : {}) }
  if (state === 'asking') {
    const questions = engine.question ? [engine.question] : []
    const ask = askOf(questions, [])
    if (!ask) return { step, state: 'stopped', say: SAY.fault }
    return { step, state, ...(isText(engine.say) ? { say: engine.say } : {}), result: { questions, ask } }
  }
  if (step === 'research') {
    // The questions compose settles: none about what the owner keeps off the site (`planProfileOf`).
    const profile = planProfileOf(row.research, kit)
    const questions = list(profile?.questions)
    const ask = askOf(questions, row.answers)
    return {
      step,
      state,
      result: { profile: profileSummaryOf(profile), questions, ...(ask ? { ask } : {}) }
    }
  }
  // The brand step only prepares the look record the plan is composed from: nothing of it is answered but that it is there.
  if (step === 'brand') return { step, state, result: { look: 'ready' } }
  const lookSources = row.brand?.lookSources
  return { step, state, result: { plan: row.plan, brand: 'own', ...(lookSources ? { lookSources } : {}) } }
}
