/**
 * The brand profile row (`template-profiles.json`, read through `templateProfileOf`) of the EXACT
 * release version being checked, for the rules that hold a template to its row: REL-3, FAV-1,
 * LOGO-1, LOGO-2, LOGO-3. A row borrowed from a lower version (`fallbackFrom`) is not this
 * release's row: a re-release whose logo spot moved would inherit a stale answer, so it counts as
 * no row at all, as the `design-templates` gate already holds.
 *
 * The context may carry its own table as `profiles` (a test, or a draft table under review); the
 * check otherwise reads the table this deployment ships.
 */
import { TEMPLATE_PROFILES, templateProfileOf } from '../../template-profiles.js'

/**
 * @param {import('../index.js').RuleContext & { profiles?: any }} context
 * @returns {{ row: Record<string, any> | null, problem: string | null, tag: string | null }}
 */
export function exactBrandProfile(context) {
  const tag = context.release.tag
  if (!tag)
    return {
      row: null,
      tag: null,
      problem: 'the release is read without its tag, so its row in template-profiles.json cannot be found'
    }
  const version = context.release.version
  const found = templateProfileOf(tag, version, context.profiles ?? TEMPLATE_PROFILES)
  if (!found) return { row: null, tag, problem: `template-profiles.json has no row for ${tag} ${version}` }
  if (found.fallbackFrom)
    return {
      row: null,
      tag,
      problem: `template-profiles.json has no row of its own for ${tag} ${version}, only the older ${found.version} one`
    }
  return { row: found, tag, problem: null }
}

/** The fix for a missing or borrowed row: written by a Tracy developer in this repository. */
export const PROFILE_ROW_FIX =
  'Add the exact row for this version to apps/tracy-web/src/lib/template-profiles.json (repo tch), measured on this release.'
