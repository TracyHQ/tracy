/**
 * Build-time gate: every planned field reaches the built artifact, and nothing else claims to be one.
 *
 * This is not the render audit — it reads files, not a browser — but it fails in the second the
 * renderer and the plan drift apart, instead of at the end of a live observation run.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'
import { compileContentPlan } from '../../../vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/scripts/content-contract.mjs'
import { studioContract } from './studio-content.mjs'
import { MARKETING_SURFACES, scopeToMarketing } from './marketing-plan.mjs'
import { extractFrom } from './marketing-observe.mjs'

const [built] = process.argv.slice(2)
if (!built) throw new Error('Usage: node check-marketing-samples.mjs <built-directory>')

const planFile = new URL('./content/tracy-editorial/content-plan.json', import.meta.url)
const plan = JSON.parse(await readFile(planFile, 'utf8'))
const resolved = compileContentPlan(studioContract, scopeToMarketing(plan), MARKETING_SURFACES)

let fields = 0
for (const surface of resolved.surfaces) {
  const file = path.join(built, path.basename(surface.id))
  const { document } = parseHTML(await readFile(file, 'utf8'))
  const observed = extractFrom(document)
  const expected = Object.keys(surface.fields).sort()
  assert.deepEqual(Object.keys(observed).sort(), expected, `Field markers differ in ${surface.id}`)
  for (const [key, value] of Object.entries(surface.fields))
    assert.equal(
      observed[key],
      value.replace(/\s+/g, ' ').trim(),
      `Rendered content differs at ${surface.id}:${key}`
    )
  // A demo artifact that lost its disclosure looks finished and is not.
  assert.ok(
    document.body.textContent.includes(studioContract.facts['demo.disclosure'].value),
    `${surface.id} does not show the demo disclosure`
  )
  fields += expected.length
}
console.log(
  `PASS: ${resolved.surfaces.length} artifacts, ${fields} planned fields rendered, disclosure on every surface.`
)
