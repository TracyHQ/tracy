// The site writer's writing turns (#329, #330): the fixed part and one writing turn (the pages to write now and the
// copy notebook so far). Pages per turn is a run setting (harness.pagesPerTurn: a positive whole number, or "all" for
// the whole site in one turn) that cuts the writing order into turns. Each turn is a request of its own whose only
// user message is the fixed part followed by that turn: a later turn sees the notebook of the earlier turns, never
// their text, so its input grows with the notebook only (ADR 0042 section 2). The fixed part is the same bytes in every
// turn, so the provider's prefix cache reuses it. The partial answers are merged into one answer (mergeTurnAnswers)
// before code puts the copy file together.
import { pagesInWritingOrder } from './writer-input.js'

const block = (title, value) => [`## ${title}`, '', JSON.stringify(value), '']

/** The fixed part: the whole plan, the cited facts, the quoted reviews, the slim kit view and the name slots. */
export function fixedPart(input) {
  return [
    '# The fixed part of this run',
    '',
    'Each part below is one compact JSON value.',
    '',
    ...block('The site plan', input.plan),
    ...block('The brief facts the plan cites', input.facts),
    ...block('The reviews the plan quotes, in full', input.reviews),
    ...block('The kit: every block the plan uses', input.blocks),
    ...block('The kit: footer column headings', input.footerHeadings),
    ...block(
      'The name slots the brand step hands over (write them as the home page seo entry)',
      input.nameSlots
    )
  ].join('\n')
}

/**
 * One writing turn: which pages to write now, and the notebook so far.
 * @param {{ pages: string[], notebook: object[], turn: number, turns: number }} t
 */
export function turnMessage({ pages, notebook, turn, turns }) {
  return [
    `# Writing turn ${turn} of ${turns}`,
    '',
    `Write these pages now, in this order: ${pages.join(', ')}.`,
    '',
    'The copy notebook so far:',
    '',
    notebook.length ? JSON.stringify(notebook) : '(empty: this is the first turn)',
    '',
    'Answer with one JSON object: the slots, alts, seo, pages, notebook and returns of exactly these pages, nothing before or after it.'
  ].join('\n')
}

/** The first user message of a whole-site run: the fixed part, then the one turn naming every page. */
export function firstUserMessage(input) {
  const pages = pagesInWritingOrder(input.plan)
  return `${fixedPart(input)}\n${turnMessage({ pages, notebook: [], turn: 1, turns: 1 })}`
}

/** Pages per turn when a run does not say: the whole site in one turn, the behaviour of #329. */
export const DEFAULT_PAGES_PER_TURN = 'all'

/** Why a pages per turn setting cannot run, or null. */
export const pagesPerTurnProblem = (value) =>
  value === 'all' || (Number.isInteger(value) && value > 0)
    ? null
    : `pages per turn must be a positive whole number or "all", not ${JSON.stringify(value)}`

/** The writing order cut into turns of `pagesPerTurn` pages ("all": one turn). */
export function writingTurns(plan, pagesPerTurn = DEFAULT_PAGES_PER_TURN) {
  const pages = pagesInWritingOrder(plan)
  const size = pagesPerTurn === 'all' ? pages.length : pagesPerTurn
  const turns = []
  for (let i = 0; i < pages.length; i += size) turns.push(pages.slice(i, i + size))
  return turns.length ? turns : [[]]
}

const LISTS = ['slots', 'alts', 'seo', 'pages', 'returns']
const list = (x) => (Array.isArray(x) ? x : [])

/**
 * The copy notebook of the answers so far, one entry per page: a later entry for the same page replaces the earlier
 * one in its place, so a turn that repeats the notebook it was given does not double it.
 */
export function notebookOf(answers) {
  const byPage = new Map()
  const loose = []
  for (const answer of answers)
    for (const entry of list(answer?.notebook))
      if (typeof entry?.page === 'string') byPage.set(entry.page, entry)
      else loose.push(entry)
  return [...byPage.values(), ...loose]
}

/**
 * The partial answers of a run's writing turns as one answer: every list in turn order, the notebook by page. One
 * answer is returned as it is. Nothing the writer wrote is changed or dropped; an entry written twice stays twice, for
 * the copy check to report.
 */
export function mergeTurnAnswers(answers) {
  if (answers.length === 1) return answers[0]
  const merged = Object.fromEntries(LISTS.map((k) => [k, answers.flatMap((a) => list(a?.[k]))]))
  return { ...merged, notebook: notebookOf(answers) }
}

/**
 * The only user message of the next writing turn after `answers` (the parsed answers of the turns already written),
 * or null when every turn is written.
 */
export function nextTurnMessage(input, answers, pagesPerTurn) {
  const turns = writingTurns(input.plan, pagesPerTurn)
  const turn = answers.length
  if (turn >= turns.length) return null
  const notebook = notebookOf(answers)
  return `${fixedPart(input)}\n${turnMessage({ pages: turns[turn], notebook, turn: turn + 1, turns: turns.length })}`
}
