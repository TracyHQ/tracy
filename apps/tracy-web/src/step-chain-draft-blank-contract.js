// The blank site contract's content map of an AI quickstart kit (#597): the slots, limits and `opensEmpty` the draft
// write is planned and guarded against (`writePlanOf`), which the kit loader does not load. It sits beside the kit's
// other declarations, `<kits dir>/<slug>/<cms>/<version>/blank-site-contract/content-map.json` (the image copies the
// whole kits folder, `apps/tracy-web/Dockerfile`). Read once per kit version; a kit with none answers null, and the
// plan then stops `kit_missing`, typed.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/i
const CONTENT_MAP = path.join('blank-site-contract', 'content-map.json')

/**
 * @param {string} dir the folder of the kits (`build-draft/ai-quickstarts.js` `AI_QUICKSTARTS_DIR`)
 * @returns {(kit: {aiq?: {template?: {slug?: string, version?: string}}}) => object | null}
 */
export function blankContractReader(dir) {
  const read = new Map()
  return (kit) => {
    const { slug, version } = kit?.aiq?.template ?? {}
    if (!SEGMENT.test(String(slug ?? '')) || !SEGMENT.test(String(version ?? ''))) return null
    const key = `${slug}@${version}`
    if (!read.has(key)) {
      const root = path.join(dir, slug)
      const cms = existsSync(root)
        ? readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && SEGMENT.test(e.name))
        : []
      const file = cms.map((e) => path.join(root, e.name, version, CONTENT_MAP)).find((f) => existsSync(f))
      read.set(key, file ? JSON.parse(readFileSync(file, 'utf8')) : null)
    }
    return read.get(key)
  }
}
