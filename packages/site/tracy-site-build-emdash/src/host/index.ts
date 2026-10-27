/**
 * Host half of `@tracy/dsh-site-build-emdash`: the EmDash Build. Everything a Build shares — the
 * engine, the routes, the tool, the task list, the retry question — is `@tracy/site-build-core`
 * (bundled into `lib/index.js`); what is EmDash's own is the stage list and `stages.mjs`.
 *
 *   POST /api/tracy-site-build-emdash/start · job · answers · rerun · home.png · ask
 *   tool tracy_site_build_emdash { action: ask | start | status | rerun }
 */
import { INJECT, makeSiteBuildHost } from '@tracy/site-build-core/host'

import { requests } from './requests.mjs'
import { makeStages, STAGES } from './stages.mjs'

/** Stable cordis plugin name — must match the row in `cordis.patch.yml` (LAW #2). */
export const name = 'tracy-site-build-emdash'

/**
 * 🔒 Every `ctx.<name>` the shared host reads must be listed here — cordis throws the moment a
 * property outside `inject` is READ. Spelled out as a literal (not `[...INJECT]`) because
 * `build-host.mjs` reads it off the source; `test/identity.test.mjs` holds it equal to core's.
 */
export const inject = ['webServer', 'tools']

export const apply = makeSiteBuildHost({
  name,
  platform: 'emdash',
  platformName: 'EmDash',
  stages: STAGES,
  tool: 'tracy_site_build_emdash',
  makeStages,
  // What the chat may ask for after the build: another picture, another set of details. Fixed
  // recipes, so a sentence in the chat can never become a command on the site.
  requests,
  // No settings row: EmDash has no Claude Cowork plugin, so there is no apply door that writes an
  // option on the site. A row here would be a promise the agent cannot keep (types.ts, `workspace`).
  workspace: { settings: [] }
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
