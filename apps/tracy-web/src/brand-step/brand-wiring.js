// The only place the brand bench imports the product tools, the run file folders and the template font (brand step
// trial bench, #320). They are loaded when a run starts or is claimed, not when the server boots, so the tests, which
// pass fakes, never load them. The tools are brand-step/tools/index.js (`brandTools`), the folders
// brand-step/run-files.js (`diskRunFiles`) and the font brand-step/template-font.js.
import path from 'node:path'
import { kitImagesDirOf } from '../site-planner/kit-images.js'

/** Where a run's files live: `brand-bench/<run id>` beside the kit image cache. Never inside the repo. */
export const brandRunDir = (config, runId) =>
  path.join(path.dirname(kitImagesDirOf(config)), 'brand-bench', String(runId))

/** @param {any} config the server's config (readinessDir locates the bench data folder) */
export function productionWiring(config) {
  let loaded = null
  return async () => {
    if (loaded) return loaded
    const [{ brandTools }, { diskRunFiles }, fontModule] = await Promise.all([
      import('./tools/index.js'),
      import('./run-files.js'),
      import('./template-font.js')
    ])
    const fontOf = fontModule.templateFont ?? fontModule.default
    loaded = {
      tools: brandTools,
      filesFor: (runId) => diskRunFiles(brandRunDir(config, runId)),
      fontFor: async (kit) => fontOf(kit.doc ?? kit)
    }
    return loaded
  }
}
