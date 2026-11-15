// The left out list as the customer reads it (#609 defects of a real run): every entry names what was left out in words
// the customer knows and says why in a plain sentence, with a stable reason `code` beside the sentence, so the plan
// card can translate an entry by its code. The model wrote "block-169 newsletter" and "No contact CTA URL was provided
// for its button." in a real plan: a block store id and build words a customer never sees.
// - An entry of the model that names a block of the store by its id is named by its section (`sectionLabelOf`, the
//   names of `plan-gate-fixes.mjs`), and its reason is the one code knows from the block and the data, when code knows
//   it (`derivedReasonOf`): a sign up form with no email to send to, a button with no booking link, a section with
//   nothing to show, what the section would show already shown elsewhere. A recorded fix (`left_out_internal_name`,
//   `left_out_reason_derived`): nothing the site shows changes, only the words of the entry.
// - A page entry named by a page type slug ("news-post page") is named in words ("News post page"); "main block" and
//   "block" in a model's reason read "main section" and "section" (`left_out_wording`, recorded).
// - A model reason carrying a build word (a block id, CTA, URL, field, id, schema), or one the plan contradicts, takes
//   the sentence code writes for it (`plan-left-out-plain.mjs`), a recorded fix: it never costs the owner a retry. A
//   build word in the name of a section the model wrote is still a problem (`left_out_internal_wording`).
// - A model sentence code cannot derive keeps its words with code `model_reason`. Pure.
import { sectionLabelOf } from './plan-gate-fixes.mjs'
import { BLOCK_TYPES } from './place-content-roles.mjs'
import { replacedReasonOf } from './plan-left-out-plain.mjs'
import { WITHHELD_REASON, withheldWhatOf } from './plan-withheld.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** The sentences of the reason codes this module derives. */
export const DERIVED_LEFT_OUT_REASONS = Object.freeze({
  no_email_for_form: 'Your business has no email address for its sign up form to send answers to.',
  no_booking_link: 'You have no booking or contact link for its button to open.',
  no_items_to_show: 'You have nothing yet for this section to show.',
  shown_in_other_sections: 'What this section would show is already shown in other sections of your plan.'
})
/** The code of a reason the model wrote and code could not derive: the sentence itself is what to translate. */
export const MODEL_REASON_CODE = 'model_reason'
/** The code of a code made entry that carries no code of its own (a revision's own entries). */
export const STATED_REASON_CODE = 'stated'

/** Build words a customer never reads in a left out reason. */
const INTERNAL_WORDS = /\b(?:block-\d+|cta|urls?|fields?|ids?|schema|data kinds?|item kinds?)\b/i
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1)
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The block of the store or library a text names by its id, or null. */
function namedBlockOf(text, blocks) {
  for (const [id, description] of blocks)
    if (new RegExp(`(?:^|[^\\w-])${escaped(id)}(?:$|[^\\w-])`, 'i').test(text)) return description
  return null
}

const hasFieldKind = (description, kind) =>
  [...list(description?.fields), ...list(description?.lists).flatMap((l) => list(l?.fields))].some(
    (f) => f?.type !== 'design' && f?.kind === kind
  )

/**
 * The reason code knows for a block left out, or null: true of the block's description, the data and the pages.
 * @param {object} description the block of the store or library
 * @param {{data: object, pages: object[]}} plan `pages`: the plan's final pages
 */
export function derivedReasonOf(description, { data, pages }) {
  const facts = new Set(list(data?.facts).map((f) => f.kind))
  if (description.type === 'newsletter' && !facts.has('contact.email')) return 'no_email_for_form'
  if (hasFieldKind(description, 'contact.cta_url') && !facts.has('contact.cta_url')) return 'no_booking_link'
  const kind = BLOCK_TYPES[description.type]?.itemKind
  if (!kind) return null
  if (!list(data?.items).some((i) => i.kind === kind)) return 'no_items_to_show'
  const shown = new Set(list(pages).flatMap((p) => list(p.blocks).flatMap((b) => list(b.data))))
  return list(data.items).some((i) => i.kind === kind && shown.has(i.id)) ? 'shown_in_other_sections' : null
}

/** A page entry's name without its page type slug: "news-post page" reads "News post page". */
function pageNameOf(what, recipes) {
  const slug = /^([a-z0-9]+(?:-[a-z0-9]+)+)\b/i.exec(what)?.[1]
  if (!slug || !recipes?.has(slug)) return what
  return capital(what.replace(slug, slug.replace(/-/g, ' ')))
}

const plainWords = (reason) =>
  reason
    .replace(/\bmain blocks?\b/gi, (m) => (m.endsWith('s') ? 'main sections' : 'main section'))
    .replace(/\bblocks\b/gi, 'sections')
    .replace(/\bblock\b/gi, 'section')

/**
 * The model's left out entries as the customer reads them, each with its `code`.
 * @param {Array<{item?: string, what: string, kind: string, reason: string}>} entries the model's entries, in their
 *   order, named already (`item`: the data id the entry reports, its `what` the data's own label)
 * @param {{data: object, blocks: Map<string, object>, recipes?: Map<string, object>, pages: object[],
 *   fix: (entry: object) => void, problem: (code: string, at: string, message: string) => void}} context
 */
export function plainModelLeftOut(entries, context) {
  const { data, blocks, recipes, pages, look, carriedCodes, fix, problem } = context
  return entries.map((entry, i) => {
    const at = `leftOut[${i}]`
    let { what, kind, reason } = entry
    const ofData = entry.item !== undefined
    // A code a revision carries with its entry (`carriedLeftOutOf`, `context.carriedCodes`) stays: code wrote it.
    const carried = ofData ? carriedCodes?.get(entry.item) : undefined
    if (typeof carried === 'string' && carried !== MODEL_REASON_CODE)
      return { what, kind, reason, code: carried, item: entry.item }
    let code = MODEL_REASON_CODE
    const named = kind === 'page' || ofData ? null : namedBlockOf(what, blocks)
    if (named) {
      const label = sectionLabelOf(named) ?? capital(named.type.replace(/_/g, ' '))
      const rule = 'a left out block is named by its section, never by its block id'
      fix({ code: 'left_out_internal_name', at: `${at}.what`, rule, was: what, now: label })
      what = label
      kind = 'block'
      const derived = derivedReasonOf(named, { data, pages })
      if (derived) {
        code = derived
        const now = DERIVED_LEFT_OUT_REASONS[derived]
        const why = 'the reason of a left out block is the one code knows from the block and the data'
        if (now !== reason)
          fix({ code: 'left_out_reason_derived', at: `${at}.reason`, rule: why, was: reason, now })
        reason = now
      }
    } else if (kind === 'page') {
      const now = pageNameOf(what, recipes)
      if (now !== what)
        fix({
          code: 'left_out_internal_name',
          at: `${at}.what`,
          rule: 'a page is named in words',
          was: what,
          now
        })
      what = now
    }
    if (code === MODEL_REASON_CODE) {
      const now = plainWords(reason)
      if (now !== reason)
        fix({
          code: 'left_out_wording',
          at: `${at}.reason`,
          rule: 'a section is never a block',
          was: reason,
          now
        })
      reason = now
      const internal = INTERNAL_WORDS.test(reason)
      const derive = (d) => {
        const c = derivedReasonOf(d, { data, pages })
        return c ? { code: c, reason: DERIVED_LEFT_OUT_REASONS[c] } : null
      }
      const replaced = replacedReasonOf(
        { what, kind, reason, item: entry.item },
        { data, blocks, look, internal, derive }
      )
      if (replaced) {
        const fixCode = internal ? 'left_out_internal_wording' : 'left_out_reason_derived'
        fix({ code: fixCode, at: `${at}.reason`, rule: replaced.rule, was: reason, now: replaced.reason })
        ;({ code, reason } = replaced)
      }
      // A build word in the name of a section the model wrote has no sentence code knows: the model names it again.
      if (!ofData && INTERNAL_WORDS.test(what))
        problem(
          'left_out_internal_wording',
          `${at}.what`,
          `${JSON.stringify(what)} uses a build word the customer never reads (a block id, CTA, URL, field, id, schema): say it in plain words`
        )
    }
    return { what, kind, reason, code, ...(ofData ? { item: entry.item } : {}) }
  })
}

/**
 * The model's left out entries (`plainModelLeftOut`) and one per id the owner keeps off the site (`withheld`), each
 * entry of an id named by its label: the withheld one as `withheldWhatOf` names it, else the plan's own label of a
 * revision (`labels`) or the data's.
 */
export function modelLeftOutOf(entries, withheld, context) {
  const { data, labels, profile } = context
  const named = [
    ...entries,
    ...withheld.map((item) => ({ item, reason: WITHHELD_REASON, code: 'owner_withheld' }))
  ].map(({ item, what, kind, reason, code }) => {
    if (item === undefined) return { what, kind, reason }
    const record = data.byId.get(item)
    const label = data.withheld?.has(item)
      ? withheldWhatOf(record, profile?.withheld)
      : (labels?.get(item) ?? record.entry.label)
    const as = record.what === 'fact' ? 'feature' : 'item'
    return { item, what: label, kind: as, reason, ...(code ? { code } : {}) }
  })
  return [...plainModelLeftOut(named.slice(0, entries.length), context), ...named.slice(entries.length)]
}

/**
 * Every entry with a code (its own, else `STATED_REASON_CODE`) and with `item`, the id of the fact, item or row it
 * reports, only when the plan lists that id: the plan card then knows a fact it lists is not on the site.
 */
export function withReasonCodes(entries, plan) {
  const known = new Set([...list(plan.facts), ...list(plan.items), ...list(plan.rows)].map((d) => d.id))
  return entries.map(({ item, ...e }) => ({
    ...e,
    code: typeof e.code === 'string' ? e.code : STATED_REASON_CODE,
    ...(known.has(item) ? { item } : {})
  }))
}
