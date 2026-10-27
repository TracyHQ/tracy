// foreign-words.mjs — the storage vocabulary of the three target CMSes (ADR 0016 §2).
//
// WHY THE LIST LIVES HERE AND NOT IN THE CONTRACT. It is the test's yardstick, and a yardstick
// kept inside the thing it measures cannot measure it: every word below would match the file that
// declares them. Keeping it in the test directory lets the grep cover scripts/contract/ whole.
//
// WHY EMDASH WORDS ARE ON THE LIST TOO. The contract is being written inside the EmDash skill, so
// EmDash is the CMS most likely to leak into it and make it un-neutral for the other two without
// anyone noticing. The guard points at its own author first.
export const FOREIGN_STORAGE_WORDS = [
  // Joomla / T4
  'acm',
  'com_content',
  'mod_custom',
  'itemid',
  // WordPress
  'wp_block',
  'wp_navigation',
  'post_content',
  'wp-content',
  'wp:paragraph',
  // EmDash
  'collection',
  'entry.data',
  'singleton',
  'widgetarea'
]
