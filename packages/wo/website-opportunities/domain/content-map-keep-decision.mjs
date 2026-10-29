// Keep or replace: whether a slot of a quickstart content map keeps the demo's content (ADR 0040).
//
// In a `place-content-roles/3` map the slot's role is the only decider (`KEEP_DECISION_BY_ROLE`). The two fields that
// decided on their own before, `customize` (ADR 0038 era) and a picture's `fit.replace` (ADR 0039), stay on the slot so
// every reader keeps working, but they are derived from the role and the contract check refuses a map where they
// disagree with it. Slot fit then describes shape only: a trainer photo measured as an avatar is still replaced, because
// its role (`person.image`) is a fact.
//
// A version 2 map (every contract released before ADR 0040) keeps its old reading: `customize: "keep"` or a picture
// whose fit says `replace: "keep"` keeps the demo, a fact role is replaced, anything else may be rewritten.
import { slotFitOf } from './content-map-fit.mjs'
import { LOGO_ROLES, ROLE_VOCABULARY_V3, isFactRole, keepDecisionOfRole } from './place-content-roles.mjs'

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

/** Whether the role alone decides keep or replace in this content map (a version 3 map). */
export function roleDecidesKeep(contentMap) {
  return contentMap?.roleVocabularyVersion === ROLE_VOCABULARY_V3
}

/** The `customize` value a slot of `role` carries in a version 3 map: "keep" or null (no field). */
export function customizeOfRole(role) {
  return keepDecisionOfRole(role) === 'keep' ? 'keep' : null
}

/**
 * What a build may put in the place of a picture of `role` (Slot fit `replace`) in a version 3 map: "keep" when the
 * role keeps the template's picture, "logo" for a logo role, else "photo". Null for a string that is not a role.
 * @param {unknown} role
 * @returns {'keep' | 'logo' | 'photo' | null}
 */
export function pictureReplaceOfRole(role) {
  const decision = keepDecisionOfRole(role)
  if (decision === null) return null
  if (decision === 'keep') return 'keep'
  return LOGO_ROLES.includes(/** @type {string} */ (role)) ? 'logo' : 'photo'
}

/**
 * Why a slot of a version 3 map disagrees with its role's keep decision (empty: it agrees, or it has no known role,
 * which the role check reports on its own).
 * @param {any} slot
 * @returns {string[]}
 */
export function keepDerivationProblems(slot) {
  const role = slot?.role
  const decision = keepDecisionOfRole(role)
  if (decision === null) return []
  const out = []
  const kept = slot?.customize === 'keep'
  if (decision === 'keep' && !kept)
    out.push(`has role "${role}", which keeps the template's content, so it needs customize "keep"`)
  if (decision !== 'keep' && kept)
    out.push(`has role "${role}", which decides "${decision}", so it must not carry customize "keep"`)
  if (slot?.type === 'image' && isObject(slot.fit) && Object.hasOwn(slot.fit, 'replace')) {
    const replace = pictureReplaceOfRole(role)
    if (slot.fit.replace !== replace)
      out.push(
        `has role "${role}", so its fit replace must be "${replace}", got ${JSON.stringify(slot.fit.replace)}`
      )
  }
  return out
}

/**
 * Whether a slot keeps the demo's content: "replace" (the demo never stays), "rewrite" (a build may write over it) or
 * "keep" (the template's stays). In a version 3 map the role alone answers (null for a slot with no known role); in an
 * older map the old reading does.
 * @param {any} slot
 * @param {any} contentMap the map the slot belongs to (its `roleVocabularyVersion` picks the reading)
 * @returns {'replace' | 'rewrite' | 'keep' | null}
 */
export function keepDecisionOf(slot, contentMap) {
  if (roleDecidesKeep(contentMap)) return keepDecisionOfRole(slot?.role)
  if (slot?.customize === 'keep') return 'keep'
  if (slot?.type === 'image' && slotFitOf(slot)?.replace === 'keep') return 'keep'
  return isFactRole(slot?.role) ? 'replace' : 'rewrite'
}
