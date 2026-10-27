/**
 * What OLDER sites answer when they refuse a structural write — the one place Tracy spells it.
 *
 * Until ADR 0022 (Lee, 26/09/2026) a quickstart's Claude Cowork plugin (claude-cowork `Engine.php`, Joomla and
 * WordPress) and a Tracy EmDash template's own guard refused structure with this code and message.
 * Nothing on a quickstart site is locked any more but a direct database write, yet sites already
 * running keep those releases until they are updated — so the lane still has to recognise the
 * answer, and name the road that works instead. These strings are theirs, read here only; no Tracy
 * code answers with them.
 */
export const LEGACY_STRUCTURE_CODE = 'content_only'

/** The Claude Cowork plugin's message when a whole site is bound to its quickstart contract. */
export const LEGACY_BOUND_MESSAGE = 'This site is bound to a content-only quickstart contract'

/**
 * Whether an answer is that older structural refusal, on `error` (the Claude Cowork plugin) or `code` (a relay
 * that renames, or the template's 403 body).
 * @param {Record<string, unknown>} a
 */
export function isLegacyStructureRefusal(a) {
  return a.error === LEGACY_STRUCTURE_CODE || a.code === LEGACY_STRUCTURE_CODE
}
