/** Compare the live native page with every block exported from the complete OpenDesign source. */
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { parseHTML } from 'linkedom'

const [manifest, url] = process.argv.slice(2)
if (!manifest || !url) throw new Error('Usage: node check-native-landing.mjs <blocks.json> <site-url>')
const { blocks } = JSON.parse(await readFile(manifest, 'utf8'))
const response = await fetch(url)
assert.equal(response.status, 200)
const { document } = parseHTML(await response.text())
const normalize = (text) => text.replace(/\s+/g, ' ').trim()
assert.equal(
  document.querySelectorAll('.tracy-native-landing iframe').length,
  0,
  'Landing must be native, not embedded'
)
for (const block of blocks) {
  const section = document.querySelector(`[data-od-block="${block.kind}"]`)
  assert.ok(section, `Missing OpenDesign block: ${block.kind}`)
  assert.deepEqual(
    [...section.querySelectorAll('h1,h2,h3')].map((node) => normalize(node.textContent)),
    block.sourceHeadings,
    `Missing or changed headings in ${block.kind}`
  )
  assert.equal(
    section.querySelectorAll('svg').length,
    block.svgCount,
    `Missing source visuals in ${block.kind}`
  )
}
assert.equal(
  document.querySelectorAll('[data-od-block]').length,
  blocks.length,
  'Duplicated or missing blocks'
)
assert.equal(document.querySelectorAll('h1').length, 1, 'Exactly one page heading')
assert.equal(
  document.querySelectorAll('[data-od-block] button:not([data-tracy-theme-toggle])').length,
  0,
  'CTAs must link to real site routes'
)
assert.equal(
  document.querySelectorAll('[data-od-block] a:not([href])').length,
  0,
  'All calls to action need destinations'
)
console.log(
  `PASS: ${blocks.length}/${blocks.length} native blocks, all source headings and SVGs, one H1, no embedded landing.`
)
