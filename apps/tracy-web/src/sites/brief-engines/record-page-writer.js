/**
 * The words of sibling record pages, each for its own record (spec TracyHQ/tracy#189, site build rules 1 and 3,
 * `website-opportunities/domain/record-page-copy.mjs`). After the other writers of a brief build have spoken:
 *   - a section of a record page that repeats its sibling's section with only the name changed is written again for its
 *     own record, from the trade and the brief;
 *   - a card of a record page left without words (an outline part, an item) while the sibling's card has them is written
 *     in the same shape, one line per slot the template gives it (a cool-down after a workout, a towel after a bottle).
 * Editorial words are free; hard facts (prices, phones, addresses, hours, names, years, guarantees, numbers) only from
 * the sources. A line the model gives that breaks a rule is asked once more, then left out and reported.
 * Rules by role and layout place, never by template, trade or business; any CMS with a text model.
 */
import { sharedShare, siblingRecordCopy } from 'website-opportunities/domain/record-page-copy.mjs'
import { limitOf } from 'website-opportunities/domain/sibling-copy-shape.mjs'
import { jsonObjectIn } from './shared.js'
import { styleSheetRule } from 'website-opportunities/domain/site-style-sheet.mjs'

const ASK_CHUNK = 40
const ROUNDS = 2
/** A line written again must share less than this with each sibling it was told to differ from. */
const DIFFERENT_SHARE = 0.5

const SYSTEM =
  'You write lines of the record pages of a business website: several pages of the same layout, one per offering or ' +
  'record. Each line gives its key, the record its page is about, the role of the line, the task, and lines of sibling ' +
  'pages. Task "rewrite": the line repeated a sibling page with only the name changed; write it again about THIS record ' +
  'only, from the trade and the business description, saying what is particular to it, in the same length and sentence ' +
  'count as the sibling lines. Task "fill": the card of the layout was left empty on this page; write it for THIS record ' +
  'in the same shape as the sibling lines of that place (a short title for a title role, one short line for a bullet), ' +
  'about a part of this record a customer would expect (for an outline, a step such as a warm-up, a main part or a ' +
  'cool-down that this page does not have yet). Editorial words only: no number, price, phone, address, hour, name, age, ' +
  'year, guarantee or award the business description does not hold. Formal and plain, never an exclamation mark, never ' +
  'a sentence of another line. Answer JSON {"lines": {"<key>": "<text>"}}.'

const plain = (v) =>
  String(v ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const wordSet = (t) =>
  new Set(
    plain(t)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 1)
  )

/** Whether a line the model gave may be written. */
export function acceptsRecordLine(line, { slot, like = [], sourceText = '', task }) {
  const text = plain(line)
  if (!text || text.includes('!')) return false
  if ([...text].length > limitOf(slot)) return false
  // A number the sources do not hold is a hard fact nobody gave.
  for (const n of text.match(/\d+(?:[.,]\d+)?/g) ?? []) if (!String(sourceText).includes(n)) return false
  if (task === 'rewrite' || task === 'fill')
    if (like.some((other) => plain(other).toLowerCase() === text.toLowerCase())) return false
  if (task === 'rewrite')
    return like.every((other) => sharedShare(wordSet(text), wordSet(other)) < DIFFERENT_SHARE)
  return true
}

/**
 * @param {object} input
 * @param {{slots: any[], entities?: any[], recordPages?: any[]}} input.contentMap
 * @param {Record<string, string>} input.written
 * @param {Set<string>} [input.blanked]
 * @param {{business?: string, trade?: string, description?: string, sourceText?: string}} [input.about]
 * @param {{chat: (input: any) => Promise<string>} | null} [input.model]
 * @param {string} [input.locale]
 * @param {AbortSignal} [input.signal]
 * @returns {Promise<{values: Record<string, string>, unreached: string[], copied: number, missing: number}>}
 */
export async function writeRecordPages({
  contentMap,
  written,
  blanked = new Set(),
  about = {},
  model = null,
  locale = 'en',
  signal
}) {
  const { copied, missing } = siblingRecordCopy({ contentMap, written, blanked })
  const slotOf = new Map((contentMap?.slots ?? []).map((s) => [s.key, s]))
  let open = [
    ...copied.map((c) => ({ ...c, task: 'rewrite' })),
    ...missing.map((m) => ({ ...m, task: 'fill' }))
  ]
  /** @type {Record<string, string>} */
  const values = {}
  for (let round = 0; round < ROUNDS && model?.chat && open.length; round += 1) {
    /** @type {Record<string, string>} */
    const answers = {}
    for (let at = 0; at < open.length; at += ASK_CHUNK) {
      const lines = open.slice(at, at + ASK_CHUNK).map((l) => ({
        key: l.key,
        record: l.record,
        role: l.role,
        task: l.task,
        siblings: l.like.slice(0, 3),
        maxCharacters: Number.isFinite(limitOf(slotOf.get(l.key))) ? limitOf(slotOf.get(l.key)) : undefined,
        ...(round > 0
          ? {
              note: 'the line given before broke a rule: a number nobody gave, too long, or too close to a sibling'
            }
          : {})
      }))
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
                  trade: about.trade ?? '',
                  description: about.description ?? '',
                  lines
                })
              }
            ],
            maxTokens: 3000,
            temperature: 0.4,
            signal
          })
        )
        for (const [key, line] of Object.entries(answer?.lines ?? {}))
          if (typeof line === 'string') answers[key] = line.trim()
      } catch {
        // No answer for this chunk: its lines are asked again next round, else reported.
      }
    }
    open = open.filter((l) => {
      const ok = acceptsRecordLine(answers[l.key], {
        slot: slotOf.get(l.key),
        like: l.like,
        sourceText: `${about.sourceText ?? ''} ${about.description ?? ''}`,
        task: l.task
      })
      if (ok) values[l.key] = plain(answers[l.key])
      return !ok
    })
  }
  return { values, unreached: open.map((l) => l.key), copied: copied.length, missing: missing.length }
}
