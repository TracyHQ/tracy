/**
 * Host half of `@tracy/dsh-site-build-joomla`: the Joomla Build. Everything a Build shares —
 * the engine, the routes, the tool, the task list, the retry question — is `@tracy/site-build-core`
 * (bundled into `lib/index.js`); what is Joomla's own is the stage list and `stages.mjs`.
 *
 *   POST /api/tracy-site-build-joomla/start · job · answers · rerun · home.png · ask
 *   tool tracy_site_build_joomla { action: ask | start | status | rerun }
 */
import { INJECT, makeSiteBuildHost } from '@tracy/site-build-core/host'

import { makeStages, STAGES } from './stages.mjs'
import capabilities from './capabilities.json' with { type: 'json' }
import { requests } from './requests.mjs'

/** Stable cordis plugin name — must match the row in `cordis.patch.yml` (LAW #2). */
export const name = 'tracy-site-build-joomla'

/**
 * 🔒 Every `ctx.<name>` the shared host reads must be listed here — cordis throws the moment a
 * property outside `inject` is READ. Spelled out as a literal (not `[...INJECT]`) because
 * `build-host.mjs` reads it off the source; `test/identity.test.mjs` holds it equal to core's.
 */
export const inject = ['webServer', 'tools']

export const apply = makeSiteBuildHost({
  name,
  platform: 'joomla',
  platformName: 'Joomla',
  stages: STAGES,
  tool: 'tracy_site_build_joomla',
  capabilities,
  requests,
  makeStages
})

/** For the identity test: what core expects, to compare with `inject` above. */
export const expectedInject: readonly string[] = INJECT

export {
  joinsTabBuild,
  parseRoute,
  rootForCwd,
  rootForRequest,
  sessionForRequest,
  siteFolderFrom,
  siteForRequest,
  sitesRootOf,
  tabStillOwes,
  unusableRoot
} from '@tracy/site-build-core/host'
