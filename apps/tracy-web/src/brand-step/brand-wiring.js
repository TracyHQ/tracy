// The only place the brand bench imports the product tools, the run file folders and the template font (brand step
// trial bench, #320). They are loaded when a run starts or is claimed, not when the server boots, so the tests, which
// pass fakes, never load them. The tools are brand-step/tools/index.js (`brandTools`), the folders
// brand-step/run-files.js (`diskRunFiles`), the font brand-step/template-font.js (`templateFont`).
import path from 'node:path'
import { kitImagesDirOf } from '../lib/template-kit-images.js'
import { slotNamesOfKit } from './design-slot-of-kit.js'

const benchDirOf = (config) => path.join(path.dirname(kitImagesDirOf(config)), 'brand-bench')

/** Where a run's files live: `brand-bench/<run id>` beside the kit image cache. Never inside the repo. */
export const brandRunDir = (config, runId) => path.join(benchDirOf(config), String(runId))

/** Where the heading fonts fetched for the template are cached: one file per family and weight. */
export const brandFontDir = (config) => path.join(benchDirOf(config), 'fonts')

/**
 * The ds-slot contract of a kit's template, or null: Joomla `joomla-<product>-modes`, else `joomla-<product>` (as
 * build_design_system); WordPress the contract of its release by `wordpressSlotOf` (design-slot-of-kit.js), never a Joomla one.
 */
export function contractOfKit(library, kit, wordpressSlotOf) {
  for (const name of slotNamesOfKit(kit.doc ?? kit, wordpressSlotOf).names) {
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
 * @param {{ fetchImpl?: typeof fetch, prices?: object[], objects?: { get: Function } | null }} [deps] the network door of
 *   the font download, the price table of the models (brand-prices.js; the default table when left out) and the object
 *   store the brief's logo (`wo_media`) is read from (app.js placeMediaObjectsFor); tests pass fakes
 */
export function productionWiring(config, { fetchImpl = fetch, prices, objects = null } = {}) {
  let loaded = null
  return async () => {
    if (loaded) return loaded
    const [{ brandTools }, { diskRunFiles }, { templateFont }, { dsSlotModule, quickstartContractOf }] =
      await Promise.all([
        import('./tools/index.js'),
        import('./run-files.js'),
        import('./template-font.js'),
        import('../lib/ds-slot.js')
      ])
    loaded = {
      tools: brandTools,
      ...(prices ? { prices } : {}),
      /** Where a brief's logo media is read from (brand-logo.js); null when the server has no object store. */
      logoObjects: objects,
      /** The drawing door for make_icon: the picture door `seedImage` (brand-draw.js). */
      async drawFor({ pool, secret, fetchImpl: modelFetch, prices }) {
        const { createDraw } = await import('./brand-draw.js')
        return createDraw({ pool, secret, fetchImpl: modelFetch, prices })
      },
      filesFor: (runId) => diskRunFiles(brandRunDir(config, runId)),
      /** The kit's heading font, or null with the reason in `refusal` when the template does not give it. */
      async fontFor(kit) {
        const library = await dsSlotModule('library')
        const contract = contractOfKit(library, kit, quickstartContractOf)
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
