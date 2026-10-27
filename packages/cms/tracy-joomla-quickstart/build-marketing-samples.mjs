/**
 * Build the six marketing artifacts, light and dark, for the studio the website describes.
 *
 * Two sources meet here and neither may be guessed: the design comes from the inspiration's
 * tokens (the same brand adapter Design inspirations uses), and every word comes from
 * `content/tracy-editorial/content-plan.json` compiled against the site content contract. A field
 * that is not in the plan cannot reach an artifact, so a later rebuild says the same thing.
 */
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { buildBrandSystem } from '../../../vendor/tracy/od-brand-engine/dist/index.js'
import { compileContentPlan } from '../../../vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/scripts/content-contract.mjs'
import {
  brandFromSystem,
  seedOverridesFromSystem
} from '../../design/tracy-design-inspiration/src/host/library-brand.mjs'
import { studioContract, studioFact } from './studio-content.mjs'
import { ARTIFACTS, MARKETING_SURFACES, THEMES, scopeToMarketing, surfaceId } from './marketing-plan.mjs'
import { RENDERERS } from './marketing-artifacts.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const [id = 'apple', output] = process.argv.slice(2)
if (!output) throw new Error('Usage: node build-marketing-samples.mjs <inspiration> <output-directory>')

const library = path.join(root, 'vendor/tracy/od-design-system')
const catalog = JSON.parse(await readFile(path.join(library, 'catalog.json'), 'utf8'))
const row = catalog.systems.find((entry) => entry.id === id)
if (!row) throw new Error(`Unknown inspiration: ${id}`)
const source = path.join(library, 'systems', id)
const tokensCss = await readFile(path.join(source, 'tokens.css'), 'utf8')
const designMd = await readFile(path.join(source, 'DESIGN.md'), 'utf8')
const brand = brandFromSystem({ id, name: row.name, category: row.category, tokensCss, designMd })
const system = buildBrandSystem(brand, { slug: id, seed: seedOverridesFromSystem({ tokensCss }) })

const plan = JSON.parse(await readFile(path.join(here, 'content/tracy-editorial/content-plan.json'), 'utf8'))
// The compiler is the gate: a stale hash, an unknown reference or a missing disclosure stops the
// build before a single artifact is written.
const resolved = compileContentPlan(studioContract, scopeToMarketing(plan), MARKETING_SURFACES)
const bySurface = new Map(resolved.surfaces.map((surface) => [surface.id, surface.fields]))

await mkdir(output, { recursive: true })
const files = {}
for (const artifact of ARTIFACTS) {
  for (const theme of THEMES) {
    const fields = bySurface.get(surfaceId(artifact.kind, theme))
    if (!fields) throw new Error(`No compiled content for ${artifact.kind}-${theme}`)
    const tokens = system.themes[theme === 'light' ? 'default' : 'dark']
    const html = RENDERERS[artifact.kind](fields, tokens, brand, theme)
    const name = `${artifact.kind}-${theme}.html`
    await writeFile(path.join(output, name), html)
    files[name] = createHash('sha256').update(html).digest('hex')
  }
}

await writeFile(
  path.join(output, 'manifest.json'),
  JSON.stringify(
    {
      name: studioFact('company.name'),
      summary: studioFact('company.summary'),
      disclosure: studioFact('demo.disclosure'),
      contractId: resolved.contractId,
      contractHash: resolved.contractHash,
      inspiration: id,
      inspirationName: row.name,
      samples: ARTIFACTS,
      files,
      source: 'vendor/tracy/od-design-system',
      renderer: 'packages/cms/tracy-joomla-quickstart/marketing-artifacts.mjs',
      tokensSha256: createHash('sha256').update(tokensCss).digest('hex')
    },
    null,
    2
  ) + '\n'
)
for (const file of ['samples.css', 'samples.js'])
  await copyFile(path.join(here, file), path.join(output, file))
for (const file of ['LICENSE', 'NOTICE']) await copyFile(path.join(library, file), path.join(output, file))
console.log(
  `Built ${ARTIFACTS.length} artifacts in light and dark for ${studioFact(
    'company.name'
  )} (contract ${resolved.contractHash.slice(0, 12)}, ${resolved.surfaces.length} surfaces): ${output}`
)
