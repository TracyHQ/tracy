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
