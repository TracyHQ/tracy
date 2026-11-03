// The only place the brand bench imports the product tools, the run file folders and the template font (brand step
// trial bench, #320). They are loaded when a run starts or is claimed, not when the server boots, so the tests, which
// pass fakes, never load them. The tools are brand-step/tools/index.js (`brandTools`), the folders
// brand-step/run-files.js (`diskRunFiles`), the font brand-step/template-font.js (`templateFont`).
import path from 'node:path'
import { kitImagesDirOf } from '../site-planner/kit-images.js'

const benchDirOf = (config) => path.join(path.dirname(kitImagesDirOf(config)), 'brand-bench')

/** Where a run's files live: `brand-bench/<run id>` beside the kit image cache. Never inside the repo. */
export const brandRunDir = (config, runId) => path.join(benchDirOf(config), String(runId))

/** Where the heading fonts fetched for the template are cached: one file per family and weight. */
export const brandFontDir = (config) => path.join(benchDirOf(config), 'fonts')

/** The ds-slot contract of a kit's template: `joomla-<product>-modes`, else `joomla-<product>` (as build_design_system). */
export function contractOfKit(library, kit) {
  const product = (kit.doc ?? kit).quickstart?.product
  for (const name of [`joomla-${product}-modes`, `joomla-${product}`]) {
    try {
      return library.loadContract(name)
    } catch {
      /* try the next name */
    }
  }
  return null
}

/**
 * @param {any} config the server's config (readinessDir locates the bench data folder)
 * @param {{ fetchImpl?: typeof fetch }} [deps] the network door of the font download; tests pass a fake
 */
export function productionWiring(config, { fetchImpl = fetch } = {}) {
  let loaded = null
  return async () => {
    if (loaded) return loaded
    const [{ brandTools }, { diskRunFiles }, { templateFont }, { dsSlotModule }] = await Promise.all([
      import('./tools/index.js'),
      import('./run-files.js'),
      import('./template-font.js'),
      import('../lib/ds-slot.js')
    ])
    loaded = {
      tools: brandTools,
      filesFor: (runId) => diskRunFiles(brandRunDir(config, runId)),
      /** The kit's heading font, or null with the reason in `refusal` when the template does not give it. */
      async fontFor(kit) {
        const library = await dsSlotModule('library')
        const contract = contractOfKit(library, kit)
        if (!contract) return null
        return templateFont({
          contract,
          fetchImpl,
          googleFontFaces: library.googleFontFaces,
          cacheDir: brandFontDir(config)
        })
      }
    }
    return loaded
  }
}
