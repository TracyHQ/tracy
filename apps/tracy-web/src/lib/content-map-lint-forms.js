/**
 * The packing rule of forms (COO rule "content map gaps", 30/10/2026; spec TracyHQ/tracy#231 ticket #240): a brief build
 * keeps a form only when it sends somewhere real for the business, and hides it otherwise. The site plan reads the forms of
 * the template from its content map (`forms`, WO domain `form-blocks.mjs`); a form the map does not declare is still found by
 * its module type or words, but only a declaration says what it is for sure. Reported by the /ops content coverage for every
 * quickstart, so an admin declares each form once.
 */
import { formProblems } from 'website-opportunities/domain/form-blocks.mjs'

/** @type {Array<import('./content-map-lint.js').LintRule>} */
export const FORM_RULES = [
  {
    id: 'form-undeclared',
    severity: 'warning',
    checks:
      'every form of the template (a sign-up box, a booking widget, a login box, a contact form) is declared',
    fix: 'Declare each form in "forms": [{"entity": "<module or contact entity key>", "kind": "newsletter" | "booking" | "login" | "contact"}]. A brief build keeps a form only when the brief gives it a real destination (a verified email-marketing list, a verified booking link, the owner\'s email for a contact form) and hides it otherwise.',
    find: ({ map }) => formProblems(map).map((p) => ({ key: p.entity || 'forms', note: p.problem }))
  }
]
