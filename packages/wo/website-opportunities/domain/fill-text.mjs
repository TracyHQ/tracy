// The fill plan's text substitutes (spec TracyHQ/tracy#132): the words a build writes in a text slot where the demo's
// words state something the brief does not, decided before any writer runs, the same on every build path.
//
//   numberless  a claim heading (`claim.heading`, ADR 0040) whose demo words carry a number: each number becomes the
//               brief's own for the same thing, or goes with the words that leaned on it (`numberlessSentence`)
//   signature   a text slot that holds a signature: the signer's name, else empty (`scriptSignature`)
//
// 🔒 A DEMO NUMBER NEVER STAYS, AND NONE IS INVENTED: the substitute is rule-built from the demo's words and the brief's
// accepted facts, never written by a model. A slot the copy path already pinned is the copy path's (`pinned`).
// 🔒 THE ROLE DECIDES (ADR 0040): a keep slot and every slot of a `demoOnly` entity are never touched.
import { keepDecisionOf } from './content-map-keep-decision.mjs'
import { scriptSignature } from './neutral-signature.mjs'
import { numberlessSentence } from './numberless-sentence.mjs'

/** The roles whose words state a claim a number can be invented in. */
const CLAIM_ROLES = new Set(['claim.heading'])
const SIGNATURE_WORDS = /\bsignature\b/i

/** The words of a text without its markup (`<span>No1</span> club` reads `No1 club`): a heading's tags style a number. */
function wordsOf(text) {
  let out = ''
  let at = 0
  while (at < text.length) {
    const open = text.indexOf('<', at)
    if (open < 0) return out + text.slice(at)
    out += text.slice(at, open)
    const close = text.indexOf('>', open)
    if (close < 0) return out + text.slice(open)
    at = close + 1
  }
  return out
}

/** Whether a text slot holds a signature: its Slot fit kind, else its label or field says so. */
function isSignatureSlot(slot) {
  if (slot.fit?.kind === 'signature') return true
  return SIGNATURE_WORDS.test(`${slot.label ?? ''} ${slot.field ?? ''}`)
}

/**
 * @param {object} input
 * @param {{slots?: any[], entities?: any[]}} input.contentMap - a version 3 map
 * @param {Record<string, string>} [input.texts] - the words each slot holds now, by slot key (else its `sample`)
 * @param {Array<{id: string, value: {amount: number, label: string, unit?: string}}>} [input.facts] - the brief's
 *   accepted number facts
 * @param {Array<{id?: string, value?: {name?: string, role?: string, relationship?: string}}>} [input.people] - who may
 *   sign: the owner or founder signs a signature slot
 * @param {Record<string, string>} [input.pinned] - slots the copy path already decided, by key
 * @param {string} [input.locale]
 * @returns {Array<{key: string, role: string | null, kind: 'numberless' | 'signature', state: string, text: string,
 *   factRefs: string[], dropped?: string[], reason?: string}>}
 */
export function textSubstitutesOf({
  contentMap,
  texts = {},
  facts = [],
  people = [],
  pinned = {},
  locale = 'en'
}) {
  const demoOnly = new Set((contentMap?.entities ?? []).filter((e) => e?.demoOnly === true).map((e) => e.key))
  const out = []
  for (const slot of contentMap?.slots ?? []) {
    if (slot?.type !== 'text' || demoOnly.has(slot.entity) || Object.hasOwn(pinned, slot.key)) continue
    const decision = keepDecisionOf(slot, contentMap)
    if (decision === null || decision === 'keep') continue
    const words = typeof texts[slot.key] === 'string' ? texts[slot.key] : String(slot.sample ?? '')
    const base = { key: slot.key, role: slot.role ?? null }
    if (isSignatureSlot(slot)) {
      const fit = slot.fit && typeof slot.fit === 'object' ? { ...slot.fit, kind: undefined } : null
      const signed = scriptSignature({ people, fit })
      out.push(
        signed.state === 'neutral'
          ? { ...base, kind: 'signature', state: 'neutral', text: signed.text, factRefs: signed.factRefs }
          : { ...base, kind: 'signature', state: 'empty', text: '', factRefs: [], reason: signed.reason }
      )
      continue
    }
    if (!CLAIM_ROLES.has(slot.role)) continue
    const fit = Number.isInteger(slot.fit?.maxCharacters)
      ? { maxCharacters: slot.fit.maxCharacters }
      : undefined
    const got = numberlessSentence({ text: wordsOf(words), facts, locale, fit })
    if (got.state === 'unchanged') continue
    out.push({
      ...base,
      kind: 'numberless',
      state: got.state,
      text: got.text,
      factRefs: got.factRefs,
      dropped: got.dropped,
      ...(got.reason ? { reason: got.reason } : {})
    })
  }
  return out
}
