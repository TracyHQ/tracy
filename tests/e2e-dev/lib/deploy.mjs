// The deploy manifest without the health script: which images the dev host runs, the source commit
// dsh says it was built from, the sidebar fork version installed in the dsh profile, and how many
// templates the catalogue offers. J13 measures the same pieces plus `check-server.sh`; the
// regression runner's dev profile reads only these, since it does not judge the stack's health.

import { Client } from './api.mjs'
import { devExec } from './dev.mjs'
import { ENV } from './env.mjs'

/**
 * @returns {Promise<{ measuredAt: string, images: Record<string, string>, env: Record<string, string | null>,
 *   plugins: Record<string, string | null>, templates: number | null }>}
 */
export async function readDeploy() {
  const deploy = {
    measuredAt: new Date().toISOString(),
    images: await devExec.images(),
    env: {
      APP_IMAGE_TAG: await devExec.env(ENV.containers.web, 'APP_IMAGE_TAG'),
      DSH_SOURCE_COMMIT: await devExec.env(ENV.containers.dsh, 'TRACY_SOURCE_COMMIT')
    },
    plugins: {},
    templates: null
  }
  for (const name of Object.keys(ENV.dshPlugins)) deploy.plugins[name] = await devExec.dshPluginVersion(name)
  const templates = await new Client({ name: 'public' }).get('/api/templates')
  deploy.templates = Array.isArray(templates.json?.templates) ? templates.json.templates.length : null
  return deploy
}

/**
 * What "the commit under test" is on dev: the tag of the web image that is deployed
 * (`app-<12 hex>`, a fingerprint of the web and host build contexts). Dev has no single source
 * commit — web/host and dsh are two build lines — so a result line names this tag and carries the
 * whole manifest beside it.
 * @param {{ images?: Record<string, string> }} deploy
 * @returns {string}
 */
export function deployCommit(deploy) {
  const image = deploy.images?.[ENV.containers.web] ?? ''
  const tag = image.includes(':') ? image.slice(image.lastIndexOf(':') + 1) : ''
  if (!tag) throw new Error(`no image tag for ${ENV.containers.web} in the deploy manifest`)
  return tag
}
