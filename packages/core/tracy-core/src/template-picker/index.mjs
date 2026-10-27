/** Cross-plugin request: the design gallery owns rendering; callers own the chosen build. */
export const TEMPLATE_PICK_EVENT = 'tracy:pick-template'

/** @typedef {{cms: string, quickstart: string, design: string}} TemplatePick */
/**
 * The template Tracy suggests for the place or business being built (`autoTemplate`): the person keeps it or picks
 * another. `reason` is the server's, worded by the caller.
 * @typedef {TemplatePick & { label?: string | null, reason?: string }} TemplateSuggestion
 */
/**
 * How the picker groups the cards for the business being built (tracy-web `templateRanking`): the ids of the cards
 * made for its trade (`recommended`, shown first), then those that suit any business (`generic`), then the rest.
 * @typedef {{ trade: string, recommended: string[], generic: string[] }} TemplateRanking
 */

/**
 * @param {Window} [target]
 * @param {{ ranking?: TemplateRanking | null }} [options] - no ranking: the catalogue as it is, ungrouped.
 * @returns {Promise<TemplatePick | null>} Null means cancelled, with no build side effect.
 */
export function requestTemplatePick(target = globalThis.window, options = {}) {
  return new Promise((resolve, reject) => {
    if (!target?.dispatchEvent) return reject(new Error('TEMPLATE_PICKER_UNAVAILABLE'))
    const event = new CustomEvent(TEMPLATE_PICK_EVENT, {
      cancelable: true,
      detail: { resolve, reject, ranking: options?.ranking ?? null }
    })
    target.dispatchEvent(event)
    if (!event.defaultPrevented) reject(new Error('TEMPLATE_PICKER_UNAVAILABLE'))
  })
}
