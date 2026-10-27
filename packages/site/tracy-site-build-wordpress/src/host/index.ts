/**
 * Host half of `@tracy/dsh-site-build-wordpress`: the WordPress Build. Everything a Build shares —
 * the engine, the routes, the tool, the task list, the retry question — is `@tracy/site-build-core`
 * (bundled into `lib/index.js`); what is WordPress's own is the stage list and `stages.mjs`.
 *
 *   POST /api/tracy-site-build-wordpress/start · job · answers · rerun · home.png · ask
 *   tool tracy_site_build_wordpress { action: ask | start | status | rerun }
 */
import { INJECT, makeSiteBuildHost } from '@tracy/site-build-core/host'

import { requests } from './requests.mjs'
import { makeStages, STAGES } from './stages.mjs'

/** Stable cordis plugin name — must match the row in `cordis.patch.yml` (LAW #2). */
export const name = 'tracy-site-build-wordpress'

/**
 * 🔒 Every `ctx.<name>` the shared host reads must be listed here — cordis throws the moment a
 * property outside `inject` is READ. Spelled out as a literal (not `[...INJECT]`) because
 * `build-host.mjs` reads it off the source; `test/identity.test.mjs` holds it equal to core's.
 */
export const inject = ['webServer', 'tools']

export const apply = makeSiteBuildHost({
  name,
  platform: 'wordpress',
  platformName: 'WordPress',
  stages: STAGES,
  requests,
  tool: 'tracy_site_build_wordpress',
  makeStages,
  // The Admin view's settings: the two options every WordPress site has and the apply door writes
  // (`content.update {kind:'option', key}`, the seeder's own road in `site-ops.mjs`).
  workspace: {
    settings: [
      { id: 'setting:blogname', label: 'Site title', field: 'blogname' },
      { id: 'setting:blogdescription', label: 'Tagline', field: 'blogdescription' }
    ]
  }
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
