/**
 * The build chat's research line and questions as data (TracyHQ/tracy#604).
 *
 * Both pieces are drawn by dsh's own chat components: the research line by the tool row (`ui-tool` ToolRow),
 * the questions by the question card and its reply bubble (`ui-user-questions` QuestionComposer and
 * QuestionReplyBubble). These functions turn what the build session received into the props those
 * components read, so the same components draw the sample scenarios in tests and real tool results later.
 * Pure on purpose: no React, no DOM, no dsh import.
 *
 * Questions follow Contract B (`tracy-build-question/v1`, `tracy-build-answer/v1`): the choices are the
 * buttons, every question also takes a typed answer, and an answer names a choice id or carries the text.
 */

const ANSWER_SCHEMA = 'tracy-build-answer/v1'

/**
 * The English source of the build chat's own words (locale namespace of the plugin that draws them, #609).
 * A plain object, not frozen, so a bundle that never reads it drops it.
 * dsh's components bring their own words for everything else (Next, Submit, Type your answer, the reply label).
 */
export const BUILD_CHAT_STRINGS = {
  'research.title.one': 'Read {count} source',
  'research.title.other': 'Read {count} sources',
  'review.question': 'Approve this plan?',
  'review.summary': '{name}: {pages}, {services}',
  'review.pages.one': '{count} page',
  'review.pages.other': '{count} pages',
  'review.services.one': '{count} service',
  'review.services.other': '{count} services',
  'review.approve': 'Approve',
  'review.change': 'Request changes'
}

/** Translate with the English source; a plugin passes its bound locale instead. */
const english = (key, vars = {}) =>
  BUILD_CHAT_STRINGS[key].replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))

/** The most questions one card asks; the rest wait for the next card. */
export const MAX_QUESTIONS_AT_ONCE = 3

/**
 * @typedef {{ name: string, url: string, summary: string, found: string[] }} ResearchSource
 * @typedef {{ summary: string, sources: ResearchSource[] }} Research
 */

/**
 * The research line: one tool row, collapsed by default, that opens to what each source gave. The
 * result is the row's `title`, `summary` and `details` props.
 * @param {Research} research
 * @param {(key: string, vars?: Record<string, unknown>) => string} [t] - the drawing plugin's translator
 */
export function researchRowOf(research, t = english) {
  const sources = research?.sources ?? []
  const n = sources.length
  return {
    title: t(n === 1 ? 'research.title.one' : 'research.title.other', { count: n }),
    summary: research?.summary ?? '',
    // The open row: one entry per source, what it gave as lines (the tool row's read-only details card).
    details: {
      items: sources.map((s) => ({
        title: s.name,
        subtitle: s.summary,
        fields: [],
        lines: [...(s.found ?? [])]
      }))
    }
  }
}

/** The recommended choice of a question, or undefined. */
const recommendedOf = (question) => question.choices.find((c) => c.recommended === true)

/**
 * One `ask_user_question` request for the questions not answered yet, at most `MAX_QUESTIONS_AT_ONCE`;
 * null when nothing is left to ask. The card shows them one at a time.
 * @param {any[]} questions - Contract B questions
 * @param {any[]} answers - Contract B answers given so far
 */
export function askRequestOf(questions, answers) {
  const done = new Set((answers ?? []).map((a) => a.question))
  const open = (questions ?? []).filter((q) => !done.has(q.id)).slice(0, MAX_QUESTIONS_AT_ONCE)
  if (open.length === 0) return null
  return {
    questions: open.map((q) => {
      const recommended = recommendedOf(q)
      return {
        id: q.id,
        question: q.prompt,
        options: q.choices.map((c) =>
          c.detail ? { label: c.label, description: c.detail } : { label: c.label }
        ),
        multiSelect: false,
        ...(recommended ? { recommended: recommended.label } : {})
      }
    })
  }
}

/**
 * The Contract B answer for what the card sent back for one question: a picked button names its choice, a
 * typed answer carries its text; null when the card sent neither.
 * @param {any} question - Contract B question
 * @param {{ id: string, selected: string[], custom?: string }} item - one entry of the card's answer
 */
export function answerOf(question, item) {
  const text = item?.custom?.trim() ?? ''
  if (text !== '') return { schema: ANSWER_SCHEMA, question: question.id, text }
  const label = item?.selected?.[0]
  const choice = question.choices.find((c) => c.label === label)
  return choice ? { schema: ANSWER_SCHEMA, question: question.id, choice: choice.id } : null
}

/**
 * The reply bubble that keeps the given answers in the conversation, in the words the owner saw.
 * @param {any[]} questions - Contract B questions that were asked
 * @param {any[]} answers - Contract B answers
 * @param {string} [callId]
 */
export function replyOf(questions, answers, callId = 'build-questions') {
  const byId = new Map((answers ?? []).map((a) => [a.question, a]))
  const asked = (questions ?? []).filter((q) => byId.has(q.id))
  // The time of the reply is the latest real time an answer carries; Contract B answers carry none today, and then
  // the reply has no time at all, so nothing misleading (such as 1970) is shown.
  const times = asked.map((q) => byId.get(q.id).time).filter((n) => Number.isFinite(n) && n > 0)
  return {
    callId,
    outcome: 'answered',
    questions: asked.map((q) => ({
      id: q.id,
      question: q.prompt,
      options: q.choices.map((c) => ({ label: c.label }))
    })),
    answers: asked.map((q) => {
      const a = byId.get(q.id)
      if (a.text !== undefined) return { id: q.id, selected: [], custom: a.text }
      const choice = q.choices.find((c) => c.id === a.choice)
      return { id: q.id, selected: choice ? [choice.label] : [] }
    }),
    text: '',
    ...(times.length > 0 ? { time: Math.max(...times) } : {})
  }
}
