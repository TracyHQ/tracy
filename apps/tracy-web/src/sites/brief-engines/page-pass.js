/**
 * What the one-pass page writer is told and judged by (spec TracyHQ/tracy#189, site build rules 1 to 3; seeder
 * `page-pass.mjs`). The copy writer writes each page in one call; this module gives that call, slot by slot, what the
 * writers that used to patch the page afterwards knew, and judges its answer by the very checks those writers use:
 *   - "shape": a sibling of a card list (`sibling-copy-shape.mjs`), judged by `fitsBand` and, for item lists, `aboutTitle`;
 *   - "describe": the line under a kept offering's name (`offering-description-writer.js` `descriptionAsks`);
 *   - "siblings": a line of a record page whose sibling pages hold the same place (`record-page-copy.mjs`);
 *   - "action": the message of a call-to-action band whose button action is already decided (`cta-bands.mjs`).
 * A line still breaking its rule after the planner's retry is handed to that rule's writer (the key's owner), which may
 * then write it; every other line the pass wrote is the pass's, and no later writer overwrites it (`slot-ownership.js`).
 * Rules by role, group and layout place, never by template, trade or business; the Joomla engine calls it.
 */
import {
  aboutTitle,
  fitsBand,
  plainText,
  siblingLists
} from 'website-opportunities/domain/sibling-copy-shape.mjs'
import {
  alignedSlots,
  recordFamilies,
  siblingRecordCopy
} from 'website-opportunities/domain/record-page-copy.mjs'
import { ctaBandMessageProblem, ctaBandsOf } from 'website-opportunities/domain/cta-bands.mjs'
import { descriptionAsks } from './offering-description-writer.js'
import { ctaMessageMax } from './cta-band-messages.js'

/** The writer that owns a rule a line of the pass still breaks. */
export const RULE_WRITERS = Object.freeze({
  shape: 'sibling',
  describe: 'offering',
  record: 'record-page',
  action: 'cta-band'
})

const same = (a, b) => plainText(a) === plainText(b)

/** Whether some length sits in a band's characters and takes its line count on every measured viewport. */
export function reachable(band) {
  const views = Object.values(band?.lines ?? {})
  for (let c = band.characters[0]; c <= band.characters[1]; c += 1)
    if (views.every(({ lines, perLine }) => Math.max(1, Math.ceil(c / perLine)) === lines)) return true
  return false
}

/**
 * @param {object} input
 * @param {any[]} input.slots - the slots a visitor reads (the pass writes some of them)
 * @param {any} input.contentMap - the content map (record pages, CTA bands)
 * @param {any} [input.honesty] - the site plan's honesty block (card names, name-only lines)
 * @param {any} [input.sitePlan] - the site plan (decided button actions)
 * @param {Set<string>} [input.apart] - keys shown one per page (a masthead intro): their list is no row of cards
 * @param {string} [input.briefText] - every word the business gave
 * @param {Record<string, string>} [input.fixed] - words a slot will hold whatever the pass writes (a card's name the site
 *   plan gives, a pinned line): a body is judged against its title as the visitor will read it
 * @returns {{hints: Record<string, any>, complain: (slots: any[], values: Record<string, unknown>,
 *   valueOf: (key: string) => string | undefined) => {message: string, keys: Record<string, string>} | null}}
 */
export function pagePass({
  slots,
  contentMap,
  honesty = null,
  sitePlan = null,
  apart = new Set(),
  briefText = '',
  fixed = {}
}) {
  /** @type {Record<string, any>} */
  const hints = {}
  const byKey = new Map((slots ?? []).map((s) => [s.key, s]))
  const hint = (key, add) => {
    hints[key] = { ...hints[key], ...add }
  }

  /** @type {Map<string, {band: any, items: boolean, title: string | null, list: string}>} */
  const shapes = new Map()
  for (const list of siblingLists(slots)) {
    if (list.siblings.some(({ slot }) => apart.has(slot.key))) continue
    // A band no length meets (its characters and its line count per viewport exclude each other) is no rule the pass
    // can keep: its list stays with the sibling writer, as before, and costs the pass no retry.
    if (!reachable(list.band)) continue
    for (const { slot, title } of list.siblings) {
      shapes.set(slot.key, { band: list.band, items: list.items, title: title?.key ?? null, list: list.id })
      hint(slot.key, {
        shape: {
          list: list.id,
          sentences: list.band.sentences,
          characters: list.band.characters,
          ...(title?.key ? { title: title.key } : {}),
          ...(title?.key && typeof fixed[title.key] === 'string' ? { titleText: fixed[title.key] } : {})
        }
      })
    }
  }

  const described = new Set(descriptionAsks({ slots, honesty, written: {} }).map((a) => a.key))
  // A line under an offering's name the demo left empty is written too (it is a card's body, site build rule 3).
  for (const key of described)
    hint(key, {
      describe: honesty?.cardNames?.[byKey.get(key)?.group?.id],
      ...(String(byKey.get(key)?.sample ?? '').trim() ? {} : { fill: true })
    })

  /** The keys of every record page slot at an aligned place, so the copy check reads only those. */
  const recordKeys = new Set()
  for (const family of recordFamilies(contentMap))
    for (const [, bySlot] of alignedSlots(contentMap, family)) {
      const keys = family.map((e) => bySlot.get(e)?.key).filter(Boolean)
      for (const key of keys) {
        recordKeys.add(key)
        if (keys.length > 1) hint(key, { siblings: keys.filter((k) => k !== key) })
      }
    }
  // 🔒 A CARD OF A RECORD PAGE THE DEMO LEFT EMPTY WHILE A SIBLING PAGE FILLS IT IS WRITTEN (site build rule 3): the pass may
  // write it, in the shape of the sibling lines.
  const samples = Object.fromEntries((contentMap?.slots ?? []).map((s) => [s.key, String(s.sample ?? '')]))
  const fills = new Set(siblingRecordCopy({ contentMap, written: samples }).missing.map((m) => m.key))
  for (const m of siblingRecordCopy({ contentMap, written: samples }).missing)
    if (byKey.has(m.key)) hint(m.key, { fill: true, like: m.like.slice(0, 3) })
  // The name slots of each record page tell its record apart (`siblingRecordCopy`).
  for (const slot of contentMap?.slots ?? [])
    if (
      String(slot.role ?? '').endsWith('.name') &&
      recordFamilies(contentMap).some((f) => f.includes(slot.entity))
    )
      recordKeys.add(slot.key)

  const decided = new Map(
    (sitePlan?.slots ?? [])
      .filter((s) => s?.decision === 'value' && s.reason === 'button-action')
      .map((s) => [s.key, String(s.value ?? '').trim()])
  )
  /** @type {Map<string, string>} */
  const actionOf = new Map()
  for (const band of ctaBandsOf(contentMap)) {
    const action = (band.buttons ?? []).map((k) => decided.get(k)).find(Boolean)
    if (!action) continue
    for (const m of band.message ?? [])
      if (byKey.get(m.key)?.type === 'text') {
        actionOf.set(m.key, action)
        hint(m.key, { action })
      }
  }

  /**
   * The lines of one answer that still break a page rule, with the writer each is handed to.
   * @param {any[]} batch @param {Record<string, unknown>} values @param {(key: string) => string | undefined} valueOf
   */
  const complain = (batch, values, valueOf) => {
    /** @type {Array<[string, string, string]>} key, rule, why */
    const broken = []
    const now = (key) => {
      const v = values?.[key]
      if (typeof v === 'string') return same(v, byKey.get(key)?.sample) ? undefined : v
      return valueOf(key)
    }
    const inBatch = new Set(batch.map((s) => s.key))
    for (const slot of batch) {
      const v = values?.[slot.key]
      if (typeof v !== 'string') continue
      const shape = shapes.get(slot.key)
      if (shape) {
        const text = now(slot.key) ?? ''
        const title = shape.title
          ? (fixed[shape.title] ?? now(shape.title) ?? byKey.get(shape.title)?.sample ?? '')
          : ''
        if (!fitsBand(text, shape.band) || (shape.items && !aboutTitle(text, title)))
          broken.push([
            slot.key,
            'shape',
            `${shape.band.sentences.join('-')} sentence(s), ${shape.band.characters.join('-')} characters, no exclamation mark${shape.items ? ', about its own title' : ''}`
          ])
      }
      const action = actionOf.get(slot.key)
      if (action) {
        const problem = ctaBandMessageProblem(v, { slot, max: ctaMessageMax(slot), briefText })
        if (problem) broken.push([slot.key, 'action', `${problem}, for the action "${action}"`])
      }
    }
    if (described.size) {
      // Only the lines this answer wrote: a line it left out is already sent back by the planner (`no-answer`).
      const written = Object.fromEntries(
        batch
          .filter((s) => described.has(s.key) && typeof values?.[s.key] === 'string')
          .map((s) => [s.key, now(s.key) ?? ''])
      )
      for (const ask of descriptionAsks({ slots: batch.filter((s) => s.key in written), honesty, written }))
        broken.push([ask.key, 'describe', `describe "${ask.assigned.label}", never only its name`])
    }
    if ([...inBatch].some((k) => recordKeys.has(k))) {
      const written = Object.fromEntries(
        [...recordKeys].map((k) => [k, fixed[k] ?? now(k)]).filter(([, v]) => typeof v === 'string')
      )
      const record = siblingRecordCopy({ contentMap, written })
      for (const c of record.copied)
        if (inBatch.has(c.key) && typeof values?.[c.key] === 'string')
          broken.push([
            c.key,
            'record',
            `it repeats a sibling page with the name swapped; write it for ${c.record || 'its own record'}`
          ])
      for (const m of record.missing)
        if (inBatch.has(m.key) && fills.has(m.key) && typeof values?.[m.key] === 'string')
          broken.push([
            m.key,
            'record',
            `its sibling pages fill this place; write it in their shape for ${m.record || 'its own record'}`
          ])
    }
    if (!broken.length) return null
    /** @type {Record<string, string>} */
    const keys = {}
    for (const [key, rule] of broken) keys[key] ??= RULE_WRITERS[rule]
    const listed = broken
      .slice(0, 12)
      .map(([key, , why]) => `${key} (${why})`)
      .join('; ')
    return {
      message: `These lines break a page rule: ${listed}. Write them again within their rule, every other line as it was.`,
      keys
    }
  }
  return { hints, complain }
}
