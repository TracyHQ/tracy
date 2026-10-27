/**
 * Desktop release notes describe what the user sees and never name a third party (Lee, 09/10/2026):
 * a PR that only bumps vendor code writes NONE, and a visible change is written as its effect
 * ("Faster sign-in", "Security updates"), not as "Bump dsh-passwords 2.7.7". This is the one list
 * of names that gives a line away, matched as whole words in any case — a regex, like the English
 * gate in `english.mjs`. Open-source licence notices are not release notes and are not checked.
 */
export const THIRD_PARTY_NAMES = [
  // the agent host and its plugins under vendor/tracy
  'dsh',
  'deepseek',
  'deepseek-harness',
  'cordis',
  'dsh-passwords',
  'dsh-better-sidebar',
  'dsh-better-locale',
  'dsh-locale-vi',
  'dsh-subscriptions',
  // the app's own runtime and update machinery
  'electron',
  'electron-updater',
  'electron-builder',
  'squirrel',
  'chromium',
  // projects the shell learned from or ports code out of
  'cherry',
  'upstream'
]

const escape = (name) => name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')
const PATTERN = new RegExp(`\\b(?:${THIRD_PARTY_NAMES.map(escape).join('|')})\\b`, 'i')

/**
 * @param {string} text
 * @returns {string[]} the lines that name a third party, trimmed.
 */
export function thirdPartyLines(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => PATTERN.test(line))
}
