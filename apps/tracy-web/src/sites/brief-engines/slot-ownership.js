/**
 * Who wrote each slot of a brief build, so a later writer never overwrites the page pass (spec TracyHQ/tracy#189,
 * one-pass page writer). The copy writer's pass claims every line it wrote and met its page rules with; a line it handed
 * to a rule's own writer (`page-pass.js`) is that writer's to write. A claim holds only while the slot still holds the
 * words claimed: a guard that empties or replaces the line (a fact nobody gave, a demo word) frees it, and then the
 * writers that fill freed lines may write it as before. Pure; any CMS engine with several writers may use it.
 */

const PASS = 'page-copy'

export function slotOwnership() {
  /** @type {Map<string, {writer: string, value: string}>} */
  const claims = new Map()
  /** @type {Array<{key: string, writer: string, owner: string}>} */
  const refused = []
  return {
    /**
     * Records the lines a writer wrote; `owners` names, by key, a writer other than `writer` the line is handed to.
     * @param {Record<string, unknown>} values @param {string} [writer] @param {Record<string, string>} [owners]
     */
    claim(values, writer = PASS, owners = {}) {
      for (const [key, value] of Object.entries(values ?? {}))
        if (typeof value === 'string') claims.set(key, { writer: owners[key] ?? writer, value })
    },
    /** The writer holding a slot, given the words it holds now; null when nobody does. */
    ownerOf(key, current) {
      const claim = claims.get(key)
      return claim && claim.value === current ? claim.writer : null
    },
    /**
     * The values a later writer may write: every one but those of a line the pass still holds. The admitted ones are
     * claimed by that writer.
     * @param {Record<string, string>} values @param {string} writer @param {Record<string, string>} current
     * @param {{refines?: (held: string, value: string) => boolean}} [options] - `refines`: a change of a held line this
     *   writer may still make because it keeps the pass's words (a spelling aligned to the card's title)
     * @returns {Record<string, string>}
     */
    admit(values, writer, current, { refines } = {}) {
      /** @type {Record<string, string>} */
      const out = {}
      for (const [key, value] of Object.entries(values ?? {})) {
        const owner = this.ownerOf(key, current?.[key])
        if (owner === PASS && value !== current?.[key] && !refines?.(current[key], value)) {
          refused.push({ key, writer, owner })
          continue
        }
        out[key] = value
      }
      this.claim(out, writer)
      return out
    },
    /** The keys the pass still holds, given the words each slot holds now. */
    held(current) {
      return new Set([...claims.keys()].filter((key) => this.ownerOf(key, current?.[key]) === PASS))
    },
    /** Every later write refused because the pass held the line. */
    refused: () => [...refused]
  }
}
