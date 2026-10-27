/**
 * The sentences only the Joomla build says to a customer, keyed by a stable code — the plugin's
 * half of `@tracy/site-build-core/host-messages` (read its header for the rule).
 *
 * The host stages fill them for the English `detail`; `src/client/strings.ts` spreads them into
 * this plugin's namespace as `host.<code>`, where they are translated. Codes are part of the job
 * file: never rename one.
 */
export const JOOMLA_MESSAGES = Object.freeze({
  J_BASE_UNREACHABLE:
    'The restored Base Claude Cowork plugin could not be reached yet ({code}). Try that step again.',
  J_BASE_REFUSED: 'The restored Base Claude Cowork plugin refused ({code}): {reason}',
  J_CONTRACT_UNAVAILABLE: 'The quickstart content contract is unavailable',
  J_NO_CONTRACT: 'This site reports no quickstart content and display contract.',
  J_OTHER_CONTRACT: 'This site carries a different design contract than the one this build was planned for.',
  J_COMPONENT_TOO_OLD:
    "The site's Tracy Cowork component is too old to set its language (it needs 0.16.10); the site is still in English.",
  J_SWITCH_REFUSED: 'The site refused to switch to {locale}',
  J_RETIRE_REFUSED: 'The Claude Cowork plugin refused to hide the other languages',
  J_RETIRE_UNFINISHED: 'Hiding the other languages did not finish after 100 rounds.',
  J_SOURCE_READ_REFUSED: 'The Claude Cowork plugin refused to read the source language',
  J_SOURCE_SET_REFUSED: 'The Claude Cowork plugin refused to call the English edition {locale}',
  J_EDITION_STOPPED: 'The {locale} edition stopped.',
  J_NO_DESIGN_PLAN: 'This build carries no design plan.',
  J_INSPECT_FAILED: "The site's Claude Cowork plugin did not answer the inspection ({code}): {reason}",
  J_NO_REVIEW: 'The builder has not written template-review.json yet.',
  J_REVIEW_MISMATCH: 'template-review.json does not describe this build, its languages, routes or checks.',
  J_WRONG_PROFILE: 'The site is bound to {contract}, not to a {prefix}* profile of the requested design.'
})
