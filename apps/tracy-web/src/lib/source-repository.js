/**
 * The GitHub repository this code lives in. It moves from TracyHQ/tch to TracyHQ/tracy at cutover;
 * only these two homes are accepted, so a token configured for one never reaches another repository.
 * Cutover = set TRACY_SOURCE_REPO=TracyHQ/tracy (docs/references/public-repo-ci.md).
 */
export const SOURCE_REPOSITORIES = Object.freeze(
  ['https://github.com/TracyHQ/tch', 'https://github.com/TracyHQ/tracy'].map((url) =>
    new URL(url).pathname.slice(1)
  )
)
export const DEFAULT_SOURCE_REPOSITORY = SOURCE_REPOSITORIES[0]

/** @param {string | null | undefined} value  TRACY_SOURCE_REPO as set; empty means the default. */
export function readSourceRepository(value) {
  if (value == null || value === '') return DEFAULT_SOURCE_REPOSITORY
  if (!SOURCE_REPOSITORIES.includes(value))
    throw new Error(`TRACY_SOURCE_REPO must be one of ${SOURCE_REPOSITORIES.join(', ')} (got "${value}").`)
  return value
}
