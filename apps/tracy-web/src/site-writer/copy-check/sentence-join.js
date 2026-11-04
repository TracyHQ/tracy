// A sentence group (template-kit sentence-groups.mjs) as the page prints it: the written pieces in order, with the space
// the write step keeps by itself where the group says so (write-step stored-demo.js keepSpaceAround).
const arr = (x) => (Array.isArray(x) ? x : [])

/**
 * @param {{slots?: string[], joins?: string[], kept?: boolean[]}} group
 * @param {(slot: string) => string} textOf the written text of a slot, empty when nothing writes it
 * @returns {{text: string, pieces: {slot: string, at: number, text: string, printed: string}[], missing: number[]}}
 *   `missing`: the index in `pieces` of each piece whose join with the one before needs a space nothing supplies
 */
export function printedSentence(group, textOf) {
  const pieces = []
  const missing = []
  arr(group.slots).forEach((slot, at) => {
    const text = textOf(slot)
    if (text.trim() === '') return
    const last = pieces.at(-1)
    let printed = text
    if (last && !/\s$/.test(last.printed) && !/^\s/.test(text)) {
      const between = arr(group.joins).slice(last.at, at)
      const kept = arr(group.kept).slice(last.at, at)
      if (between.includes(' ') || at > last.at + 1) {
        if (kept.some(Boolean)) printed = ` ${text}`
        else missing.push(pieces.length)
      }
    }
    pieces.push({ slot, at, text, printed })
  })
  return { text: pieces.map((p) => p.printed).join(''), pieces, missing }
}

const CAPITALISED = /^["'(]?(\p{Lu}\p{Ll}[\p{L}'-]*)/u

/**
 * What breaks a sentence group when read joined: no space where two pieces meet and nothing puts one back, or a capital in the
 * middle. A capital stays when the sentence ended before it, when the template's own demo has one there, or when `isName` says
 * the word is a name. One function, so the copy check and the site check cannot judge the same sentence differently.
 * @param {{slots?: string[], joins?: string[], kept?: boolean[], pieces?: string[]}} group
 * @param {(slot: string) => string} textOf
 * @param {(word: string, piece: {slot: string}) => boolean} isName
 * @returns {{text: string, pieces: object[], faults: {cause: 'missing-space' | 'capital-mid-sentence', at: number, word?: string}[]}}
 */
export function sentenceFaults(group, textOf, isName) {
  const { text, pieces, missing } = printedSentence(group, textOf)
  const faults = missing.map((at) => ({ cause: 'missing-space', at }))
  pieces.forEach((piece, i) => {
    if (i === 0) return
    const word = CAPITALISED.exec(piece.text.trimStart())?.[1]
    if (!word || /[.!?:]["')]?\s*$/.test(pieces[i - 1].text)) return
    if (/^\p{Lu}/u.test(arr(group.pieces)[piece.at] ?? '')) return
    if (!isName(word, piece)) faults.push({ cause: 'capital-mid-sentence', at: i, word })
  })
  return { text, pieces, faults }
}
