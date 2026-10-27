/**
 * THE QUICKSTART'S LENGTH ADVICE (ADR 0022, Lee 26/09/2026): a text slot's new words should stay
 * between 0.75× and 1.25× the length of the words the quickstart shipped there (`sample` in its
 * content map). A slogan of ten words replaced by a hundred breaks the design; one of three words
 * leaves a hole. This is a WARNING, never a refusal: the write goes through, and the answer names the
 * slots outside the band so the agent can tell the customer and offer a version that fits.
 *
 * Measured 26/09 on the local stand (round 4 after ADR 0022): a heading written at 2× its sample went
 * through with no word about it, although the rule had been stated in the prompts.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Lee's band, as fractions of the sample's length. */
export const LENGTH_BAND = Object.freeze({ min: 0.75, max: 1.25 })

/**
 * Samples shorter than this are not judged: "Home" → "Start here" is 2.5× and fine.
 * Counted in characters after tokens (`{contact.phone}`) are taken out.
 */
const MIN_SAMPLE_CHARS = 12

/** Characters a reader sees: identity tokens and markup-free whitespace runs count as nothing/one. */
const visible = (/** @type {string} */ s) =>
  s
    .replace(/\{[a-z]+\.[A-Za-z]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim().length

/**
 * The slots of one apply whose new text is outside the band of its quickstart sample.
 * @param {Record<string, unknown>} changes - the apply's `{slotKey: value}`.
 * @param {Map<string, string>} samples - slotKey → the quickstart's own text for that slot.
 * @returns {{ slot: string, sample: number, value: number, ratio: number }[]}
 */
export function lengthAdvice(changes, samples) {
  /** @type {{ slot: string, sample: number, value: number, ratio: number }[]} */
  const out = []
  for (const [slot, value] of Object.entries(changes ?? {})) {
    const sample = samples.get(slot)
    if (typeof value !== 'string' || typeof sample !== 'string') continue
    const base = visible(sample)
    if (base < MIN_SAMPLE_CHARS) continue
    const now = visible(value)
    if (now === 0) continue
    const ratio = Math.round((now / base) * 100) / 100
    if (ratio < LENGTH_BAND.min || ratio > LENGTH_BAND.max)
      out.push({ slot, sample: base, value: now, ratio })
  }
  return out
}

/**
 * The sentence an apply's answer carries when some slots are outside the band, or null.
 * @param {ReturnType<typeof lengthAdvice>} advice
 */
export function lengthAdviceNext(advice) {
  if (advice.length === 0) return null
  const list = advice
    .slice(0, 5)
    .map((a) => `${a.slot} (${a.value} chars, the quickstart's ${a.sample}: ${a.ratio}×)`)
    .join(', ')
  return `Written. Outside the quickstart's length band (0.75×–1.25× of its own text): ${list}${advice.length > 5 ? ` and ${advice.length - 5} more` : ''}. Tell the customer the design may look different there, and offer a version that fits.`
}

/** contract id → slotKey → sample, read once per process. */
const cache = new Map()

/**
 * The text samples of a contract profile the image carries, keyed by slot. Empty when the profile
 * is not there (a cowork-only profile, a test): no sample, no advice.
 * @param {string | null | undefined} contract - `tracy-business/j6/1.2.0`.
 * @param {string} [root] - where the image keeps contract profiles.
 * @returns {Map<string, string>}
 */
export function contractSamples(
  contract,
  root = process.env.TRACY_CONTRACTS_DIR ?? '/opt/tracy/cms/data/quickstart-contracts'
) {
  if (typeof contract !== 'string' || !/^[a-z0-9-]+\/[a-z0-9]+\/[0-9][0-9A-Za-z.-]*$/.test(contract))
    return new Map()
  const key = `${root}\n${contract}`
  if (cache.has(key)) return cache.get(key)
  /** @type {Map<string, string>} */
  const samples = new Map()
  try {
    const map = JSON.parse(readFileSync(path.join(root, contract, 'content-map.json'), 'utf8'))
    for (const slot of Array.isArray(map?.slots) ? map.slots : [])
      if (slot && slot.type === 'text' && typeof slot.key === 'string' && typeof slot.sample === 'string')
        samples.set(slot.key, slot.sample)
  } catch {
    // no profile here: no advice
  }
  cache.set(key, samples)
  return samples
}
