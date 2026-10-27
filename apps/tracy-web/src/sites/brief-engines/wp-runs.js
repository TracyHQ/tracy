/**
 * The identity tokens of a part's lines (`{year}`, `{site.title}`), kept through a model that rewrites the words around them.
 *
 * 🔒 AN ANSWER THAT RESPELLS A TOKEN IS MENDED, ASKED AGAIN, TRANSLATED, AND SAID; NEVER DROPPED IN SILENCE (LANG-2, measured
 * 10/10/2026 on dev g59-ess-wp-full, JA Essence WordPress 1.0.12, Vietnamese): the footer read "… All Rights Reserved." although
 * the same release read "Bảo lưu mọi quyền." the build before. `editRuns` writes an answer only when it carries the run's tokens
 * again, and the model had written the bakery's name where `{site.title}` stood, so the answer went with no retry and no note.
 * And `{year}` was no token at all, so an answer with "2026" in its place was written and would have frozen the year.
 *
 * So the model never sees a token: each is masked (`⟦1⟧`, `⟦2⟧`) before the line is planned and put back after. An answer that
 * writes the business's name or a year where a mask stood has the mask put back there (`remask`); one that still lacks a mask
 * is asked once more, then translated from the template's words, and what even that cannot carry keeps the template's words
 * and is said in the build report.
 */
import { tokensOf } from './wp-blocks.js'

/** The mask of the n-th token of a line, 1-based. */
const mask = (/** @type {number} */ n) => `⟦${n}⟧`
/** A mask however a model spells it back: `⟦1⟧`, `⟦ 1 ⟧`, `〚1〛`, `[[1]]`. */
const SPELT_MASK = /(?:⟦|〚|\[\[)\s*(\d{1,2})\s*(?:⟧|〛|\]\])/g
/** A four-digit year a model writes where `{year}` stood. */
const YEAR = /\b(?:19|20)\d{2}\b/
/** A token of the site's name, any of its spellings (`{site.title}`, `{site.name}`, `{site.legalName}`). */
const SITE_TOKEN = /^\{site\.(?:title|name|legalName)\}$/

/**
 * A line with each identity token masked, in order.
 * @param {string} text
 * @returns {{ masked: string, tokens: string[] }}
 */
export function maskRun(text) {
  const tokens = tokensOf(text)
  let at = 0
  let masked = text
  for (const token of tokens) {
    at += 1
    masked = masked.replace(token, mask(at))
  }
  return { masked, tokens }
}

/** `text` with its first `find` (compared without case) replaced by `by`, or null when it has none. */
function replaceOnce(/** @type {string} */ text, /** @type {string} */ find, /** @type {string} */ by) {
  if (find.trim() === '') return null
  const at = text.toLocaleLowerCase().indexOf(find.toLocaleLowerCase())
  return at < 0 ? null : `${text.slice(0, at)}${by}${text.slice(at + find.length)}`
}

/**
 * An answer with its masks put back where the model wrote something else in their place: a mask spelt another way, a token
 * written out (the right one, or another spelling of the site's name), the business's `name`, or a literal year.
 * @param {string} value - the model's answer for a masked line
 * @param {string[]} tokens - the line's tokens, in mask order (`maskRun`)
 * @param {{ name?: string | null }} [given]
 * @returns {string}
 */
export function remask(value, tokens, { name = null } = {}) {
  let out = String(value).replace(SPELT_MASK, (_, n) => mask(Number(n)))
  const missing = () => tokens.map((_, i) => i + 1).filter((n) => !out.includes(mask(n)))
  // A token written out: its own mask when it is one of the line's, else the site-name mask still missing.
  out = out.replace(/\{[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*\}/g, (token) => {
    const own = tokens.findIndex((t, i) => t === token && !out.includes(mask(i + 1)))
    if (own >= 0) return mask(own + 1)
    const site = SITE_TOKEN.test(token) ? missing().find((n) => SITE_TOKEN.test(tokens[n - 1])) : undefined
    return site ? mask(site) : token
  })
  for (const n of missing()) {
    const token = tokens[n - 1]
    if (token === '{year}') {
      const year = YEAR.exec(out)
      if (year) out = `${out.slice(0, year.index)}${mask(n)}${out.slice(year.index + year[0].length)}`
    } else if (SITE_TOKEN.test(token) && name) out = replaceOnce(out, name, mask(n)) ?? out
  }
  return out
}

/**
 * An answer with its masks made tokens again, or null when it does not carry each of the line's masks exactly once (or carries
 * one the line does not have): such an answer would print the template's year or name, or none.
 * @param {string} value
 * @param {string[]} tokens
 * @returns {string | null}
 */
export function unmask(value, tokens) {
  const found = [...String(value).matchAll(/⟦(\d{1,2})⟧/g)].map((m) => Number(m[1]))
  const wanted = tokens.map((_, i) => i + 1)
  if (found.length !== wanted.length || wanted.some((n) => found.filter((f) => f === n).length !== 1))
    return null
  const out = String(value).replace(/⟦(\d{1,2})⟧/g, (_, n) => tokens[Number(n) - 1])
  return /⟦|⟧/.test(out) ? null : out
}

/**
 * @typedef {{ slug: string, masked: string, text: string, tokens: string[], block: string }} MaskedRun
 */

/**
 * The runs of the parts as the line planner is given them: masked, told to keep the masks.
 * @param {Array<{ slug: string, lines: Array<{ text: string, block: string }> }>} pages - `namedRuns` of each part
 * @returns {{ pages: Array<{ slug: string, lines: Array<{ text: string, block: string }> }>, runs: MaskedRun[] }}
 */
export function maskRuns(pages) {
  /** @type {MaskedRun[]} */
  const runs = []
  const masked = pages.map((page) => ({
    slug: page.slug,
    lines: page.lines.map((line) => {
      const { masked: text, tokens } = maskRun(line.text)
      const keep = tokens.length
        ? `, keep ${tokens.map((_, i) => mask(i + 1)).join(' ')} exactly as written, each once`
        : ''
      runs.push({ slug: page.slug, masked: text, text: line.text, tokens, block: line.block })
      return { text, block: `${line.block}${keep}` }
    })
  }))
  return { pages: masked, runs }
}

/**
 * The runs' answers with their tokens back, each run asked once more and then translated when its answer did not carry them
 * (or there was none, or it left the template's words), and the runs nothing could say counted in one note.
 * @param {object} input
 * @param {MaskedRun[]} input.runs
 * @param {Array<{ slug: string, text: string, value: string | null }>} input.said - what the planner said, by masked text
 * @param {(runs: MaskedRun[]) => Promise<Map<MaskedRun, string>>} input.retry - the runs asked once more (guarded)
 * @param {(runs: MaskedRun[]) => Promise<Map<MaskedRun, string>>} input.translate - the runs translated from their words
 * @param {string | null} [input.name] - the business's name
 * @param {(note: string) => void} input.note
 * @returns {Promise<Array<{ slug: string, text: string, value: string }>>} by the run's own text, tokens and all
 */
export async function finishRuns({ runs, said, retry, translate, name = null, note }) {
  /** @type {Map<MaskedRun, string>} */
  const done = new Map()
  const take = (/** @type {MaskedRun} */ run, /** @type {unknown} */ value) => {
    if (typeof value !== 'string' || value.trim() === '') return false
    const back = unmask(remask(value, run.tokens, { name }), run.tokens)
    if (back === null || back.trim() === run.text.trim()) return false
    done.set(run, back)
    return true
  }
  const answer = new Map(said.map((l) => [`${l.slug}\u0000${l.text}`, l.value]))
  for (const run of runs) take(run, answer.get(`${run.slug}\u0000${run.masked}`))
  const open = () => runs.filter((run) => !done.has(run))
  if (open().length > 0) for (const [run, value] of await safely(retry, open())) take(run, value)
  if (open().length > 0) for (const [run, value] of await safely(translate, open())) take(run, value)
  const left = open()
  if (left.length > 0)
    note(
      `${left.length} line(s) of the header or footer keep the template’s words: no answer kept their ${[
        ...new Set(left.flatMap((r) => r.tokens))
      ].join(' ')} (${left.map((r) => JSON.stringify(r.text)).join(', ')})`
    )
  return runs.flatMap((run) =>
    done.has(run) ? [{ slug: run.slug, text: run.text, value: String(done.get(run)) }] : []
  )
}

/** A step that answers nothing instead of throwing: a failed retry still leaves the translation to try. */
async function safely(
  /** @type {(runs: MaskedRun[]) => Promise<Map<MaskedRun, string>>} */ step,
  /** @type {MaskedRun[]} */ runs
) {
  try {
    return await step(runs)
  } catch {
    return new Map()
  }
}
