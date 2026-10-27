/**
 * BAND-1: a band the template paints on its own (a dark header, a hero, a call to action, a footer)
 * follows the worn system, or the contract says why it is kept whole.
 *
 * `keepScopes` keeps a band's rules in the template's colours so its text stays readable on its own
 * ground. Kept whole, it also stays the template's under every system: on WordPress Tracy Business
 * ~90% of the 1440×900 first screen looked the same before and after the press (12/10/2026:
 * "it is still the old UI"). A kept band counts as following when the contract recolours its ground —
 * `bands` (the ground takes a system colour every text of the band still reads on), `paletteBands`,
 * or a `followRules` selector inside it that sets a background — or as deliberately kept when
 * `keepWhole` names it with a reason (a small dark button, a photo overlay), like `keptText` in a
 * content contract.
 */
import { slotOf } from '../readers/slot.js'

/** Whether `selector` names the band `scope` (`.t4-footer`, `.t4-footer a`, `#t4-header .nav`). */
const inBand = (/** @type {string} */ selector, /** @type {string} */ scope) =>
  new RegExp(`${scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(selector)

/**
 * Whether a `bands` key IS the kept band `scope`, possibly narrowed on the same element by classes,
 * ids or `:not(…)` (`.wtb-cta:not(.wtb-cta--panel)`), the shape `@tracy/ds-slot` `src/bands.mjs`
 * reads. A key naming something INSIDE the band (`.t4-footer .promo`) does not recolour its ground.
 */
const isBandKey = (/** @type {string} */ key, /** @type {string} */ scope) =>
  key === scope || (key.startsWith(scope) && /^[.#:]/.test(key.slice(scope.length)) && !/\s/.test(key))

/** @type {import('../index.js').Rule} */
export const band1BandsFollow = {
  id: 'BAND-1',
  title: 'Bands the template paints follow the worn system',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: 'contract',
  async run(context) {
    const slot = await slotOf(context)
    if (!slot.contract) return { status: 'not-applicable', message: 'Waits for SLOT-1: no contract.' }
    const c = slot.contract
    const scopes = /** @type {string[]} */ ((c.keepScopes ?? []).filter((s) => typeof s === 'string'))
    if (scopes.length === 0)
      return {
        status: 'pass',
        message: 'The contract keeps no band whole: every part of the page follows the system.'
      }
    // An own-colour block outside the kept bands (`fill: true`, PR #1258: JA Impact's orange call
    // band) is not a kept band wearing the system: it never counts here.
    const bandKeys = Object.entries(c.bands ?? {})
      .filter(([, band]) => !(band && typeof band === 'object' && band.fill === true))
      .map(([key]) => key)
    const paletteBands = Object.keys(c.paletteBands ?? {})
    const follow = Object.entries(c.followRules ?? {})
      .filter(([, decls]) => Object.keys(decls ?? {}).some((p) => /^background(-color)?$/.test(p)))
      .map(([sel]) => sel)
    const declared = c.keepWhole && typeof c.keepWhole === 'object' ? c.keepWhole : {}
    const whole = scopes.filter(
      (s) =>
        !bandKeys.some((k) => isBandKey(k, s)) &&
        !paletteBands.some((k) => inBand(k, s)) &&
        !follow.some((sel) => inBand(sel, s)) &&
        !(typeof declared[s] === 'string' && declared[s].trim() !== '')
    )
    if (whole.length === 0)
      return {
        status: 'pass',
        message: `All ${scopes.length} kept bands recolour their ground under a system, or say why they stay.`
      }
    return {
      status: 'fail',
      message: `${whole.length} of ${scopes.length} bands keep the template's own colours under every system (${whole.slice(0, 8).join(', ')}${whole.length > 8 ? ', …' : ''}), so those parts of the page look the same whatever the customer picks.`,
      fix: `For each band, read its ground and text colours off the released page (scripts/discover.mjs) and declare it in "bands" of templates/${slot.name}.json, or name it in "keepWhole" with the reason it must stay; then measure with flow.mjs.`,
      details: whole
    }
  }
}
