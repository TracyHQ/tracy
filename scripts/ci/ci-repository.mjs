import { SOURCE_REPOSITORIES, readSourceRepository } from '../../apps/tracy-web/src/lib/source-repository.js'

/**
 * The repository CI scripts read and write. In Actions the runner sets `GITHUB_REPOSITORY`; only the
 * two homes of this code are accepted, so a token never reaches another repository. Elsewhere (local
 * runs, tests, a fork) `TRACY_SOURCE_REPO` decides, TracyHQ/tch until cutover.
 */
export const CI_REPOSITORIES = SOURCE_REPOSITORIES

/** @param {Record<string, string | undefined>} env */
export function ciRepository(env = process.env) {
  const fromRunner = env.GITHUB_REPOSITORY
  return fromRunner && CI_REPOSITORIES.includes(fromRunner)
    ? fromRunner
    : readSourceRepository(env.TRACY_SOURCE_REPO)
}

export const CI_REPOSITORY = ciRepository()
