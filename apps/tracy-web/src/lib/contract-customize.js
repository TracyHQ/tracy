/**
 * 🔒 A SLOT MARKED `customize: "keep"` IS DECLARED, NOT REWRITTEN (TCH, 24/10/2026).
 *
 * `capture-contract.py --full-coverage` declares every piece of demo content a visitor reads: an article's
 * intro picture and its template extra fields (class schedules, exercise lists), a module's shown title and
 * its template fields, contacts, tags. Declared, the site agent can find and edit each one when the customer
 * asks. But Customize your site never rewrote any of them, and widening what it rewrites is a product
 * decision, not a side effect of a capture: a class time "6:00AM" written by a model is an invented fact.
 * So every slot those rules add carries `customize: "keep"`, and every path that plans or writes the
 * customer's words, pictures or links on Build reads this predicate first.
 *
 * Two exceptions, and only on Joomla, neither of which changes what a kept slot means: a declared demo
 * company name (`demoCompanyNames`) in a kept slot is renamed to the name the customer gave (ABOUT-3,
 * `brief-engines/joomla.js` `renamedKeep`), since the name is the demo's brand, not a fact the slot is kept
 * for; and on a site written in another language than the template's, a kept line a visitor reads is
 * translated from the template's words (LANG-2, `brief-engines/keep-words.js`, `translatedKeep`): "keep"
 * keeps the meaning, never the template's language.
 *
 * The seeder's planner (`packages/cms/tracy-seeder/src/plan-joomla-contract.mjs`) holds the same rule on its own
 * input, because it cannot import from this app.
 */

/**
 * Whether Customize may plan or write this slot.
 * @param {{ customize?: unknown } | null | undefined} slot
 */
export function customizable(slot) {
  return slot?.customize !== 'keep'
}

/**
 * The slots Customize may plan or write, in their order.
 * @template {{ customize?: unknown }} T
 * @param {T[]} slots
 * @returns {T[]}
 */
export function customizableSlots(slots) {
  return slots.filter(customizable)
}
