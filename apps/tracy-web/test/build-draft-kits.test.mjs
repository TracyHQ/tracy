// The AI quickstart catalogue of the build chat (#609, `build-draft/ai-quickstarts.js`): which templates the chat offers
// for a trade, and the kit the plan composer and the edit gate read. Kits are built in a scratch folder from the WO
// package's invented fixtures; nothing here is a real business or template.
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  AI_QUICKSTARTS_DIR,
  KIT_MANIFEST_FILE,
  aiQuickstartCatalogue
} from '../src/build-draft/ai-quickstarts.js'

const WO_FIXTURES = fileURLToPath(
  new URL('../../../packages/wo/website-opportunities/test/fixtures/', import.meta.url)
)
const root = mkdtempSync(path.join(tmpdir(), 'tracy-kits-'))
after(() => rmSync(root, { recursive: true, force: true }))

const manifest = (slug, extra = {}) => ({
  schema: 'tracy-ai-quickstart-kit/v1',
  released: true,
  template: { slug, name: `Example ${slug}`, version: '1.0.0' },
  trades: ['fitness'],
  picture: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E',
  reason: 'Built for invented clubs.',
  ...extra
})

/** A kit folder `<slug>/j6/1.0.0` holding the ai-quickstart fixture (block store, recipes, mapping) and a manifest. */
function kit(slug, { manifest: m = manifest(slug), files = 'ai-quickstart', pending = false } = {}) {
  const dir = path.join(root, slug, 'j6', '1.0.0')
  mkdirSync(dir, { recursive: true })
  cpSync(path.join(WO_FIXTURES, files), dir, { recursive: true })
  if (pending) {
    rmSync(path.join(dir, 'mapping.json'), { force: true })
    writeFileSync(path.join(dir, 'mapping.pending.json'), JSON.stringify({ ticket: '#1' }))
  }
  if (m) writeFileSync(path.join(dir, KIT_MANIFEST_FILE), JSON.stringify(m))
  return dir
}

kit('kit-released')
kit('kit-hidden', { manifest: manifest('kit-hidden', { released: false }) })
kit('kit-food', { manifest: manifest('kit-food', { trades: ['food'] }) })
kit('kit-no-manifest', { manifest: null })
kit('kit-no-picture', { manifest: manifest('kit-no-picture', { picture: '' }) })
kit('kit-bad-trade', { manifest: manifest('kit-bad-trade', { trades: ['boxing'] }) })
kit('kit-pending', { pending: true })
const broken = kit('kit-broken')
const store = JSON.parse(readFileSync(path.join(broken, 'block-store.json'), 'utf8'))
store.blocks[0].items = { min: 3, max: 1 }
writeFileSync(path.join(broken, 'block-store.json'), JSON.stringify(store))

const catalogue = aiQuickstartCatalogue({ root, library: [] })

test('only a released kit that fits the trade and passes its check is offered, in the card shape', () => {
  assert.deepEqual(catalogue.templatesFor('fitness'), [
    {
      slug: 'kit-released',
      name: 'Example kit-released',
      version: '1.0.0',
      picture: manifest('kit-released').picture,
      reason: 'Built for invented clubs.',
      quickstart: 'released',
      fits: true
    }
  ])
  assert.deepEqual(
    catalogue.templatesFor('food').map((t) => t.slug),
    ['kit-food']
  )
})

test('no fitting kit is an empty list', () => {
  assert.deepEqual(catalogue.templatesFor('auto'), [])
  assert.deepEqual(catalogue.templatesFor('not-a-trade'), [])
})

test('every kit left out says why, for the team', () => {
  const why = Object.fromEntries(catalogue.skipped().map((s) => [s.slug, s.reason]))
  assert.match(why['kit-hidden'], /not released/)
  assert.match(why['kit-no-manifest'], /manifest/)
  assert.match(why['kit-no-picture'], /picture/)
  assert.match(why['kit-bad-trade'], /boxing/)
  assert.match(why['kit-pending'], /mapping/)
  assert.match(why['kit-broken'], /min 3 is above max 1/)
  assert.equal(why['kit-released'], undefined)
})

test('loadKit answers the block store, the page recipes and the library the composer and the edit gate read', () => {
  const loaded = catalogue.loadKit('kit-released')
  assert.equal(loaded.blockStore.schema, 'tracy-ai-quickstart-block-store/v1')
  assert.equal(loaded.pageRecipes.schema, 'tracy-ai-quickstart-page-recipes/v1')
  assert.equal(loaded.mapping.schema, 'tracy-ai-quickstart-mapping/v1')
  assert.deepEqual(loaded.library, [])
  assert.deepEqual(loaded.template, { slug: 'kit-released', name: 'Example kit-released', version: '1.0.0' })
})

test('loadKit reads a kit whose mapping is still pending (the plan needs no mapping) but not a failing one', () => {
  assert.equal(catalogue.loadKit('kit-pending').mapping, null)
  assert.equal(catalogue.loadKit('kit-broken'), null)
  assert.equal(catalogue.loadKit('no-such-kit'), null)
  assert.equal(catalogue.loadKit('../kit-released'), null)
})

test('the default library is the Tracy library of the WO package', () => {
  const real = aiQuickstartCatalogue({ root })
  assert.ok(real.loadKit('kit-released').library.some((b) => b.source === 'library' || b.id))
})

test('the shipped tree: JA Boxing fits fitness, and is offered only once its kit is complete', () => {
  const shipped = aiQuickstartCatalogue({ root: AI_QUICKSTARTS_DIR })
  const boxing = JSON.parse(
    readFileSync(path.join(AI_QUICKSTARTS_DIR, 'ja-boxing', 'j6', '1.0.11', KIT_MANIFEST_FILE), 'utf8')
  )
  assert.equal(boxing.released, true)
  assert.deepEqual(boxing.trades, ['fitness'])
  assert.equal(boxing.reason, 'Built for sports clubs: classes, coaches and a booking button up front.')
  const skipped = shipped.skipped().find((s) => s.slug === 'ja-boxing')
  const offered = shipped.templatesFor('fitness').some((t) => t.slug === 'ja-boxing')
  assert.ok(offered !== Boolean(skipped), 'offered or skipped with a reason, never both')
  assert.ok(shipped.loadKit('ja-boxing')?.blockStore.blocks.length > 0)
})
