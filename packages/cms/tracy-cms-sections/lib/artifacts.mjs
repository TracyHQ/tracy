/**
 * The engine's artifacts of a design system as pages a CMS theme can carry — the same documents
 * the preview dialog draws its Landing, Form and Typography chips on.
 *
 * WHY. `libraryArtifacts()` in the design-inspiration host builds these at serve time from the
 * system's tokens.css and DESIGN.md through `@tracy/od-brand-engine` (`buildBrandSystem`) plus
 * Tracy's own `renderTypography`. A site built from the choice must show the Landing chip pixel
 * for pixel, so the theme build runs the same functions, at the same engine version, and ships
 * each artifact's stylesheet fenced under `.tracy-artifact`; the seeder writes the body.
 *
 * Only the artifacts that are web pages: landing, form, typography. Email, newsletter, poster and
 * deck are other media and stay out (spec, slice 2).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildBrandSystem, renderTypography } from '../../../../vendor/tracy/od-brand-engine/dist/index.js'
import {
  brandFromSystem,
  seedOverridesFromSystem
} from '../../../design/tracy-design-inspiration/src/host/library-brand.mjs'
import { artifactSnippet } from './fixture.mjs'

export { artifactSnippet }

export const ARTIFACT_KINDS = Object.freeze(['landing', 'form', 'typography'])
export const ARTIFACT_WRAPPER = '.tracy-artifact'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

/**
 * The three artifact documents of one design system, keyed by kind.
 * @param {{ id: string, name: string, category: string, tokensCss: string, designMd: string }} system
 * @returns {Record<string, string>}
 */
export function buildArtifactDocs(system) {
  const brand = brandFromSystem(system)
  const built = buildBrandSystem(brand, { slug: system.id, seed: seedOverridesFromSystem(system) })
  const docs = {}
  for (const kind of ARTIFACT_KINDS) {
    if (kind === 'typography') {
      docs[kind] = renderTypography(brand, built.themes.default, { designMd: system.designMd })
      continue
    }
    const file = built.files[`artifacts/${kind}.html`]
    if (typeof file !== 'string') throw new Error(`${system.id}: the engine built no artifacts/${kind}.html`)
    docs[kind] = file
  }
  return docs
}

/**
 * Read a system from the vendored library and build its artifacts.
 * @param {string} id
 * @param {string} [vendorDir]
 */
export function buildArtifactDocsFor(id, vendorDir = path.join(ROOT, 'vendor', 'tracy', 'od-design-system')) {
  const catalog = JSON.parse(readFileSync(path.join(vendorDir, 'catalog.json'), 'utf8'))
  const row = catalog.systems.find((s) => s.id === id)
  if (!row) throw new Error(`${id} is not in the catalog`)
  const dir = path.join(vendorDir, 'systems', id)
  return buildArtifactDocs({
    id,
    name: row.name,
    category: row.category,
    tokensCss: readFileSync(path.join(dir, 'tokens.css'), 'utf8'),
    designMd: readFileSync(path.join(dir, 'DESIGN.md'), 'utf8')
  })
}
