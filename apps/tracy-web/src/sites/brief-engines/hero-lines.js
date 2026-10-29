/**
 * The hero lines of a brief build's site plan (`website-opportunities/domain/hero-first-screen.mjs`, spec TracyHQ/tracy#189,
 * COO rule 29/10/2026): the subline that names what the business offers and where, and the main button's label and link.
 * They win over the copy writer's words for the same slots, and a line the left-demo sweep would empty is not emptied.
 *
 * 🔒 ONLY IN THE LANGUAGE THEY WERE MADE IN: the plan writes them from the brief in English; a site written in another
 * language leaves them to the copy writer, which writes in the site's language.
 */

const HERO_REASONS = new Set(['hero-what', 'hero-contact'])

/**
 * @param {any} sitePlan - the build's site plan (`receipt.sitePlan`)
 * @param {string} [locale] - the language the site is written in
 * @returns {Record<string, string>} slot key -> value
 */
export function heroSlotValues(sitePlan, locale = 'en') {
  if (
    !String(locale ?? 'en')
      .toLowerCase()
      .startsWith('en')
  )
    return {}
  return Object.fromEntries(
    (sitePlan?.slots ?? [])
      .filter(
        (s) =>
          s?.decision === 'value' &&
          HERO_REASONS.has(s.reason) &&
          typeof s.value === 'string' &&
          s.value.trim() !== ''
      )
      .map((s) => [s.key, s.value])
  )
}
