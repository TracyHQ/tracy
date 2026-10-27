/**
 * The design record a TEMPLATE site is given when the create door provisions it (ADR 0023; plan
 * `tasks/plan-wo-design-follows-template.md`, council 19/10/2026).
 *
 * A template is installed as released, so what it wears is what its sealing profile says (`designOfRelease`), or
 * the catalogue system its card wears (`templateDesign`). Until 19/10/2026 that answer was computed at the claim
 * (`designRecordOf`) and then dropped: the fleet carries only the id, and the record is written only by the plugin
 * Build path. A site built through this door had no `site_design` row, so its agent was told "none bound" and
 * restyled freely (measured on stand wo2: three Tracy Base demos, custom.css overriding every `--ds-c-*`).
 *
 * PURE: the map and the catalogue names come in as functions, so the rules run without the generated map.
 *
 * 🔒 THE RULER IS NEVER GUESSED. A catalogue system's tokens are the map's (what Joomla and WordPress templates were
 * built from); on EmDash the template declares its own custom properties under other names (Tracy Base: 118, the
 * Apple map: 56), so only the NAME is bound here and the tokens are read from the site after it is up. A catalogue
 * id the map does not know is half a design and answers nothing, never a record with invented values.
 */

/** Where a catalogue record's token values came from: tracy-web's generated map, not a file on the site. */
export const CATALOG_TOKENS_FROM = 'tracy-web:design-tokens.json'

/**
 * @param {{ platform: string, templateDesign: import('../lib/contracts.js').ContractDesign | null }} q
 * @param {{ tokensFor: (id: string) => Record<string, string> | null, nameFor: (id: string) => string | null }} deps
 * @returns {{ record: import('../lib/site-design.js').DesignRecord } | { record: null, skipped: 'TEMPLATE_WEARS_NONE' | 'DESIGN_UNRESOLVED' }}
 */
export function provisionDesignRecord({ platform, templateDesign }, { tokensFor, nameFor }) {
  if (!templateDesign) return { record: null, skipped: 'TEMPLATE_WEARS_NONE' }
  if (templateDesign.source === 'quickstart') {
    const { id, name, tokens, tokensFrom } = templateDesign
    return { record: { id, source: 'quickstart', name, platform, tokens: { ...tokens }, tokensFrom } }
  }
  const name = nameFor(templateDesign.id)
  if (name === null) return { record: null, skipped: 'DESIGN_UNRESOLVED' }
  if (platform === 'emdash')
    return {
      record: { id: templateDesign.id, source: 'catalog', name, platform, tokens: null, tokensFrom: null }
    }
  const tokens = tokensFor(templateDesign.id)
  if (tokens === null) return { record: null, skipped: 'DESIGN_UNRESOLVED' }
  return {
    record: {
      id: templateDesign.id,
      source: 'catalog',
      name,
      platform,
      tokens,
      tokensFrom: CATALOG_TOKENS_FROM
    }
  }
}
