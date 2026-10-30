/**
 * One shape for the sibling texts of one list (COO rules of 30/10/2026, spec TracyHQ/tracy#189,
 * `website-opportunities/domain/sibling-copy-shape.mjs`). After every other writer of the brief build has spoken, the
 * body texts of each repeated card list (offerings, people, features, items) are brought to the band the template's demo
 * gives them: its sentences, its length and the lines the demo takes in that box, the same line count for every sibling.
 *   - a sibling out of the band, with an exclamation mark, empty, or (item lists) about something other than its own
 *     title is rewritten by the text model from its own words (every figure and name kept, no new hard fact) or, when it
 *     has none, written from its title, the trade and the brief (editorial words are free);
 *   - a line the model gives out of the band, or with a fact nobody gave, is asked once more with the reason;
 *   - 🔒 never shortened to a short sibling and never emptied to match an empty one (the template's line layout is kept):
 *     a sibling still out of the band keeps its words and is reported (`unreached`), for the final check to name.
 * Rules by role and group, never by template, trade or business; any CMS with a text model (the Joomla engine calls it).
 */
import {
  acceptsSiblingRewrite,
  aboutTitle,
  alignSpelling,
  fitsBand,
  plainText,
  siblingLists
} from 'website-opportunities/domain/sibling-copy-shape.mjs'
import { jsonObjectIn } from './shared.js'
import { styleSheetRule } from 'website-opportunities/domain/site-style-sheet.mjs'

/** Lines asked of the model in one call: a list of 150 dishes is asked in several calls. */
const ASK_CHUNK = 40
/** Rounds of asking: the first, and one more for the lines the first left out of the band. */
const ROUNDS = 2

const SYSTEM =
  'You write the body text of cards in one list on a business website, so every card of the list has the same shape ' +
  "as the template's demo text. For each line you get the card title, the words it holds now (the business own words, " +
  'or empty) and a band: how many sentences and how many characters it must have (the characters keep the line count ' +
  'of the design). Write every line inside its band. Rewrite the words it holds into the band, keeping every fact, ' +
  'figure and name they state; you may add editorial words about the offering or item from your knowledge of the trade ' +
  'and the business description, but no hard fact: no number, price, phone, address, hour, name, age, level, year, ' +
  'guarantee or award the words do not hold. When it holds no words, or words about something other than its title, ' +
  'write the body about that title. Formal and plain: no slang, no advertising tone, never an exclamation mark. Speak ' +
  'of the card title, never of another card. Answer JSON {"lines": {"<key>": "<text>"}}.'

/**
 * @param {object} input
 * @param {any[]} input.slots - the content map slots the build fills
 * @param {Record<string, string>} input.written - the words each slot will hold
 * @param {{business?: string, description?: string, sourceText?: string}} [input.about]
 * @param {{chat: (input: any) => Promise<string>} | null} [input.model]
 * @param {string} [input.locale]
 * @param {AbortSignal} [input.signal]
 * @param {Set<string>} [input.apart] - keys shown one per page (a page's masthead intro, a hero line): a list holding one
 *   is a set of page mastheads, never cards side by side, and is left alone
 * @returns {Promise<{values: Record<string, string>, unreached: string[], lists: Array<{id: string, outcome: string}>}>}
 */
export async function shapeSiblingCopy({
  slots,
  written,
  about = {},
  model = null,
  locale = 'en',
  signal,
  apart = new Set()
}) {
  /** @type {Record<string, string>} */
  const values = {}
  const unreached = []
  const lists = []
  const work = []
  for (const list of siblingLists(slots)) {
    if (list.siblings.some(({ slot }) => apart.has(slot.key))) continue
    const cards = list.siblings.map(({ slot, title }) => ({
      key: slot.key,
      text: slot.key in written ? plainText(written[slot.key]) : '',
      title: title ? plainText(title.key in written ? written[title.key] : title.sample) : ''
    }))
    if (cards.every((c) => !c.text)) continue
    // 🔒 ONE SPELLING PER SITE: a body spells a word as its own title does ("Personalized" under "Personalized").
    for (const c of cards) {
      const aligned = alignSpelling(c.text, c.title)
      if (aligned !== c.text) values[c.key] = c.text = aligned
    }
    const good = (c) => fitsBand(c.text, list.band) && (!list.items || aboutTitle(c.text, c.title))
    if (cards.every(good)) continue
    work.push({ list, cards, open: cards.filter((c) => !good(c)) })
  }

  const accepts = (list, c, line) =>
    acceptsSiblingRewrite(line, {
      original: list.items && !aboutTitle(c.text, c.title) ? '' : c.text,
      sourceText: `${about.sourceText ?? ''} ${about.description ?? ''}`,
      band: list.band,
      title: c.title,
      items: list.items
    })
  for (let round = 0; round < ROUNDS && model?.chat; round += 1) {
    const asks = work.flatMap(({ list, open }) =>
      open.map((c) => ({
        key: c.key,
        title: c.title,
        holds: list.items && !aboutTitle(c.text, c.title) ? '' : c.text,
        band: { sentences: list.band.sentences, characters: list.band.characters },
        ...(round > 0
          ? { note: 'the line given before was outside the band or stated a fact nobody gave' }
          : {})
      }))
    )
    if (asks.length === 0) break
    /** @type {Record<string, string>} */
    const answers = {}
    for (let at = 0; at < asks.length; at += ASK_CHUNK) {
      try {
        const answer = jsonObjectIn(
          await model.chat({
            messages: [
              { role: 'system', content: SYSTEM + styleSheetRule(about.styleSheet) },
              {
                role: 'user',
                content: JSON.stringify({
                  locale,
                  business: about.business ?? '',
                  description: about.description ?? '',
                  lines: asks.slice(at, at + ASK_CHUNK)
                })
              }
            ],
            maxTokens: 3000,
            temperature: 0.3,
            signal
          })
        )
        for (const [key, line] of Object.entries(answer?.lines ?? {}))
          if (typeof line === 'string') answers[key] = line.trim()
      } catch {
        // No answer for this chunk: its lines are asked again next round, else reported.
      }
    }
    for (const job of work)
      job.open = job.open.filter((c) => {
        if (!accepts(job.list, c, answers[c.key])) return true
        values[c.key] = alignSpelling(plainText(answers[c.key]), c.title)
        return false
      })
  }
  for (const { list, open } of work) {
    unreached.push(...open.map((c) => c.key))
    lists.push({ id: list.id, outcome: open.length ? 'unreached' : 'band' })
  }
  return { values, unreached, lists }
}
