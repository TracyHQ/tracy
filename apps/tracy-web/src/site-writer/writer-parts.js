// The site writer's first draft in parts written at the same time (2026-11-15, #633). Off by default: a run asks for it
// with harness.parallelPages (the number of parts, frozen with the run); without it, or at 1, round 0 is written exactly
// as before (writer-turns.js). Pure: inputs in, new values out.
//
// - The split (writingParts): the writing order (writer-input.js pagesInWritingOrder) cut into that many runs of
//   consecutive pages of about the same size, the heaviest part as light as it can be. A page's size is an estimate of
//   the characters written for it (pageWeights): the demo length of every text slot its kept blocks print (the length
//   W03 holds the text to), an alt per planned picture, a title and description per kept page, the body of a created
//   legal page and of the not-found page, and the shared turn's footer headings and menu dropdowns.
// - Each part's message is the same fixed part as a whole-site run (the same bytes, so the provider's prefix cache can
//   reuse it), then the part: its pages, the pages the other parts write, and how one site keeps one voice and no
//   repeats when no part sees the others' words (partMessages). The business's own phrases are shared out, each to one
//   part, so each is still used once on the site; the phrases the plan's notes use on pages of two parts are given to
//   the first of them, and the other is told to put them in other words. The copy check's W06 reads the merged copy
//   as one site, and the fix rounds correct what still repeats.
// - The answers are merged as writing turns are (writer-turns.js mergeTurnAnswers): every list in part order, which
//   is the writing order, the notebook by page.
import { hasPhrase, textOfValue, wordsOf } from '../lib/site-copy/text-tools.js'
import { pagesInWritingOrder } from './writer-input.js'
import { fixedPart } from './writer-turns.js'

const arr = (x) => (Array.isArray(x) ? x : [])
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x)

/** The most parts a run may write at the same time. */
export const MAX_PARALLEL_PAGES = 8

/** Why a parallel pages setting cannot run, or null. 1 is one part: the run writes as if it were not set. */
export const parallelPagesProblem = (value) =>
  Number.isInteger(value) && value >= 1 && value <= MAX_PARALLEL_PAGES
    ? null
    : `parallel pages must be a whole number from 1 to ${MAX_PARALLEL_PAGES}, not ${JSON.stringify(value)}`

/** Whether a run's harness writes the first draft in parts. */
export const writesInParts = (harness) =>
  Number.isInteger(harness?.parallelPages) && harness.parallelPages > 1

/** The characters a page's size counts for what has no kit slot to measure. */
export const PART_WEIGHTS = Object.freeze({
  slot: 80,
  alt: 80,
  seo: 220,
  legalBody: 2500,
  notFoundBody: 400,
  navLabel: 20
})

/** The block decisions a page of the writing order prints: the shared blocks for "shared", a kept page's own. */
function printedOn(plan, page) {
  const decisions =
    page === 'shared'
      ? arr(plan?.sharedBlocks)
      : arr(arr(plan?.pages).find((p) => isObject(p) && p.decision === 'keep' && p.id === page)?.blocks)
  return decisions.filter((d) => isObject(d) && d.decision !== 'hide')
}

const createdLegal = (plan) =>
  arr(plan?.site?.legalPages)
    .filter((l) => isObject(l) && l.use === 'create')
    .map((l) => ({ id: typeof l.id === 'string' ? l.id : `legal:${l.kind}`, page: l }))

/** The demo length of every text slot of the kit view, by slot id (the kit's limit when the demo has none). */
function slotChars(input) {
  const chars = new Map()
  const add = (s) => {
    if (isObject(s) && typeof s.id === 'string' && !chars.has(s.id))
      chars.set(s.id, s.demoChars?.total || s.maxCharacters || PART_WEIGHTS.slot)
  }
  for (const b of arr(input.blocks)) {
    arr(b.slots).forEach(add)
    for (const l of arr(b.lists)) {
      arr(l.rowSlots).forEach(add)
      for (const r of arr(l.rows)) arr(r.slots).forEach(add)
    }
  }
  return chars
}

/** The estimated characters written for each page, in writing order. */
export function pageWeights(input) {
  const { plan } = input
  const chars = slotChars(input)
  const copyChars = (copy) =>
    arr(copy).reduce(
      (sum, c) => sum + (chars.get(c?.slot) ?? (Number(c?.maxCharacters) || PART_WEIGHTS.slot)),
      0
    )
  const pictures = (x) => arr(x?.pictures).length * PART_WEIGHTS.alt
  const legal = new Set(createdLegal(plan).map((l) => l.id))
  const weights = new Map()
  for (const page of pagesInWritingOrder(plan)) {
    let weight = 0
    for (const d of printedOn(plan, page)) {
      weight += copyChars(d.copy) + pictures(d)
      for (const l of arr(d.lists))
        for (const item of arr(l.items)) weight += copyChars(item?.copy) + pictures(item)
    }
    if (page === 'shared') {
      const dropdowns = arr(input.mainMenu).reduce((n, g) => n + arr(g?.dropdown).length, 0)
      weight += (arr(input.footerHeadings).length + dropdowns) * PART_WEIGHTS.navLabel
    } else if (page === 'notFound') weight += PART_WEIGHTS.notFoundBody
    else weight += PART_WEIGHTS.seo + (legal.has(page) ? PART_WEIGHTS.legalBody : 0)
    weights.set(page, weight)
  }
  return weights
}

/**
 * The writing order cut into `parallelPages` runs of consecutive pages whose heaviest is as light as it can be (fewer
 * when the site has fewer pages). Every page is in exactly one part; joined in order, the parts are the writing order.
 */
export function writingParts(input, parallelPages) {
  const weights = pageWeights(input)
  const pages = [...weights.keys()]
  const k = Math.max(1, Math.min(parallelPages, pages.length))
  if (k === 1) return [pages]
  const n = pages.length
  const before = [0]
  for (const page of pages) before.push(before.at(-1) + weights.get(page))
  // best[j][i]: the lightest heaviest part when the first i pages are cut into j parts; start[j][i]: where its last
  // part starts (the earliest such cut, so the same input always gives the same parts).
  const best = Array.from({ length: k + 1 }, () => Array(n + 1).fill(Infinity))
  const start = Array.from({ length: k + 1 }, () => Array(n + 1).fill(0))
  best[0][0] = 0
  for (let j = 1; j <= k; j++)
    for (let i = j; i <= n; i++)
      for (let m = j - 1; m < i; m++) {
        const heaviest = Math.max(best[j - 1][m], before[i] - before[m])
        if (heaviest < best[j][i]) {
          best[j][i] = heaviest
          start[j][i] = m
        }
      }
  const parts = []
  for (let j = k, i = n; j > 0; j--) {
    const m = start[j][i]
    parts.unshift(pages.slice(m, i))
    i = m
  }
  return parts
}

/** Every string of a value, however it is nested. */
const stringsIn = (value) => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsIn)
  if (isObject(value)) return Object.values(value).flatMap(stringsIn)
  return []
}

/**
 * The plan's notes for these pages: what the writer turns into sentences the copy check compares (W06). The `says` of
 * every copy entry of the kept blocks and their list rows (with each row's about, angle and proof), each kept page's
 * visitor question, key message, story, end action and search intents, the footer headings' points (shared turn),
 * and the `says` of a created legal page and of the not-found page. Labels, ids and picture wishes are left out.
 */
export function notesOf(plan, pages) {
  const notes = []
  const says = (copy) => arr(copy).flatMap((c) => stringsIn(c?.says))
  for (const page of pages) {
    for (const d of printedOn(plan, page)) {
      notes.push(...says(d.copy))
      for (const l of arr(d.lists))
        for (const item of arr(l.items))
          notes.push(...stringsIn([item?.about, item?.angle, item?.proof]), ...says(item?.copy))
    }
    if (page === 'shared')
      notes.push(...arr(plan?.site?.footerMenu).flatMap((m) => stringsIn(m?.heading?.says)))
    else if (page === 'notFound') notes.push(...stringsIn(plan?.site?.notFound?.says))
    const kept = arr(plan?.pages).find((p) => isObject(p) && p.decision === 'keep' && p.id === page)
    if (kept)
      notes.push(
        ...stringsIn([
          kept.visitorQuestion,
          kept.keyMessage,
          kept.story,
          kept.endAction,
          kept.seo?.titleIntent,
          kept.seo?.descriptionIntent
        ])
      )
    const legal = createdLegal(plan).find((l) => l.id === page)
    if (legal) notes.push(...stringsIn(legal.page.says))
  }
  return notes.filter((s) => s.trim() !== '')
}

/**
 * The business's own phrases (`site.voice.ownWords`) shared out: each phrase to the first part whose notes name it,
 * the others to the parts in turn, so each phrase is one part's and is still used once on the site.
 */
export function ownWordsByPart(plan, parts) {
  const own = arr(plan?.site?.voice?.ownWords).filter((s) => typeof s === 'string' && s.trim() !== '')
  const notes = parts.map((pages) => notesOf(plan, pages).join('\n'))
  const out = parts.map(() => [])
  let next = 0
  for (const phrase of own) {
    let part = notes.findIndex((text) => hasPhrase(text, phrase))
    if (part < 0) part = next++ % parts.length
    out[part].push(phrase)
  }
  return out
}

/** How many words a run of the plan's notes holds; a run of fewer content words says too little to share. */
export const NOTE_RUN_WORDS = 3
/** The most shared phrases each list of a part's message names. */
export const NOTE_RUNS_SHOWN = 20
// A word of four letters or more stands for a content word, in any language, without a stop word list.
const contentWords = (words) => words.filter((w) => w.length >= 4).length
// The planner's words about the plan itself ("the brief names", "the heading over the list") never reach the copy, so a
// run holding one is not a phrase two parts could both write. An id in a note (page-about-us_contact, block-162.31)
// cuts the note there: its words are no phrase either.
const PLAN_WORDS = new Set(
  'brief plan page pages heading headings item items slot slots block blocks section sections link links button buttons label labels kit demo template says'.split(
    ' '
  )
)
/** A fact of at most this many words is a name: a run holding two of its words in a row is not shared out. */
export const SHORT_FACT_WORDS = 4
const ID = /^[\p{L}\p{N}]+(?:[-_:.][\p{L}\p{N}]+)+$/u
const phrasesOf = (note) => {
  const segments = [[]]
  for (const token of String(note).split(/\s+/))
    if (ID.test(token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))) segments.push([])
    else segments.at(-1).push(token)
  return segments.map((tokens) => wordsOf(tokens.join(' '))).filter((words) => words.length)
}

/**
 * The runs of three words the plan's notes use on pages of more than one part, as each part's two lists: `mine`, the
 * runs it is the first part to use (it may keep them), and `others`, the runs its notes share with a part that uses
 * them first (it puts them in other words). A run inside a cited fact's value (an address, opening hours) or inside one
 * of the business's own phrases is left out: W06 does not count the first, ownWordsByPart shares out the second. So are
 * runs of fewer than two words of four letters or more, runs holding a word about the plan itself or two words in a row
 * of a short fact (a name), and ids.
 */
export function sharedNoteRuns(input, parts) {
  const { plan } = input
  const facts = arr(input.facts).map((f) => wordsOf(textOfValue(f?.value)))
  const inside = [
    ...facts.map((words) => words.join(' ')),
    ...arr(plan?.site?.voice?.ownWords)
      .filter((s) => typeof s === 'string')
      .map((t) => wordsOf(t).join(' '))
  ].map((t) => ` ${t} `)
  // Two words in a row of a short fact (the business's name, a place, a person) are a name every part may write.
  const names = new Set(
    facts
      .filter((words) => words.length <= SHORT_FACT_WORDS)
      .flatMap((words) => words.slice(1).map((w, i) => `${words[i]} ${w}`))
  )
  const named = (run) => run.slice(1).some((w, i) => names.has(`${run[i]} ${w}`))
  const runsOf = (pages) => {
    const runs = new Map()
    for (const words of notesOf(plan, pages).flatMap(phrasesOf)) {
      for (let i = 0; i + NOTE_RUN_WORDS <= words.length; i++) {
        const run = words.slice(i, i + NOTE_RUN_WORDS)
        if (contentWords(run) < 2 || run.some((w) => PLAN_WORDS.has(w)) || named(run)) continue
        const key = run.join(' ')
        runs.set(key, (runs.get(key) ?? 0) + 1)
      }
    }
    return runs
  }
  const per = parts.map(runsOf)
  const first = new Map()
  const spread = new Map()
  per.forEach((runs, part) => {
    for (const [run, count] of runs) {
      if (!first.has(run)) first.set(run, part)
      const s = spread.get(run) ?? { parts: 0, count: 0 }
      spread.set(run, { parts: s.parts + 1, count: s.count + count })
    }
  })
  // Runs on the most parts first, then the most used, then in the order the parts first use them.
  const shared = [...spread]
    .filter(([run, s]) => s.parts >= 2 && !inside.some((t) => t.includes(` ${run} `)))
    .sort(([, a], [, b]) => b.parts - a.parts || b.count - a.count)
    .map(([run]) => run)
  return parts.map((_, part) => ({
    mine: shared.filter((run) => first.get(run) === part).slice(0, NOTE_RUNS_SHOWN),
    others: shared.filter((run) => first.get(run) !== part && per[part].has(run)).slice(0, NOTE_RUNS_SHOWN)
  }))
}

const listOf = (values) => values.map((v) => JSON.stringify(v)).join(', ')

/**
 * One part's turn: its pages, the other parts' pages, and how the parts keep one voice and no repeats.
 * @param {{ pages: string[][], part: number, voice: string | null, own: string[][], runs: { mine: string[], others: string[] }[] }} t
 */
export function partMessage({ pages, part, voice, own, runs }) {
  const total = pages.length
  const othersOwn = own.flatMap((list, p) => (p === part ? [] : list))
  const { mine, others } = runs[part]
  return [
    `# Writing part ${part + 1} of ${total}, written at the same time as the others`,
    '',
    `Write these pages now, in this order: ${pages[part].join(', ')}.`,
    '',
    `The site is written in ${total} parts at the same time, each in a conversation of its own from the same fixed part. Code puts the answers of the parts together into one copy file, and the copy check reads it as one site. The other parts write these pages, so write nothing for them:`,
    ...pages.flatMap((list, p) => (p === part ? [] : [`- part ${p + 1}: ${list.join(', ')}`])),
    '',
    'One site, one voice:',
    ...(voice ? [`- Write every page in the site voice: ${voice}`] : []),
    '- No part sees the words of the others, and the check counts a sentence of yours that shares five words in a row with a sentence of another part as a repeat. Give each block its own opening and its own call to action, and put the notes of the plan into words of your own: the other parts read the same notes.',
    ...(own[part].length || othersOwn.length
      ? [
          `- The business's own phrases are shared out, one part each, so each is still used once on the site. ${
            own[part].length ? `Yours: ${listOf(own[part])}.` : 'None is yours.'
          }${othersOwn.length ? ` The other parts are given ${listOf(othersOwn)}: do not use them.` : ''}`
        ]
      : []),
    ...(mine.length || others.length
      ? [
          `- Phrases the plan's notes use on your pages and on the pages of another part.${
            mine.length ? ` Yours to keep (the other parts are told to avoid them): ${listOf(mine)}.` : ''
          }${others.length ? ` Another part keeps these, so put them in other words: ${listOf(others)}.` : ''}`
        ]
      : []),
    ...(part === total - 1
      ? [
          "- Once the parts are put together, the check's failures for the whole site come back to you in this conversation: then correct every entry the list names, whichever part wrote it."
        ]
      : []),
    '',
    'The copy notebook so far:',
    '',
    '(empty: the parts are written at the same time)',
    '',
    'Answer with one JSON object: the slots, alts, seo, pages, notebook and returns of exactly these pages, nothing before or after it.'
  ].join('\n')
}

/** The first and only user message of each part: the fixed part of a whole-site run, then the part's turn. */
export function partMessages(input, pages) {
  const summary = input.plan?.site?.voice?.summary
  const voice = typeof summary === 'string' && summary.trim() ? summary.trim() : null
  const own = ownWordsByPart(input.plan, pages)
  const runs = sharedNoteRuns(input, pages)
  const fixed = fixedPart(input)
  return pages.map((_, part) => `${fixed}\n${partMessage({ pages, part, voice, own, runs })}`)
}

/** The plan narrowed to these pages' blocks: the shared blocks only for the part that writes "shared". */
export function planOfPages(plan, pages) {
  return {
    ...plan,
    sharedBlocks: pages.includes('shared') ? arr(plan?.sharedBlocks) : [],
    pages: arr(plan?.pages).filter((p) => isObject(p) && pages.includes(p.id))
  }
}
