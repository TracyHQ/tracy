// The site writer's user messages (#329): the fixed part (given once, at the start of the conversation) and one
// writing turn (the pages to write now and the copy notebook so far). This ticket writes the whole site in one turn,
// so the first user message is the fixed part followed by the only turn. Pages per turn (#330) sends the later turns
// as user messages of their own after each answer; the fixed part stays the same bytes, so the provider's prefix cache
// reuses it.
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
