// The blank site contract (#584): the released contract restricted to the records the blank site keeps, each slot the
// blank site empties opened (its sample the blank value, `opensEmpty`), and the check that guards it. On the invented
// demo data fixture and the invented contract beside it. HTML pieces are emptied by the real `empty-html-places.php`.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { BLANK_SITE_STEPS, produceBlankSite } from '../scripts/blank-site.mjs'
import { blankSiteContract, blankSiteContractId } from '../scripts/blank-site-contract.mjs'
import { checkBlankSiteContract } from '../scripts/blank-site-contract-check.mjs'
import { blankSlot, emptiedSamples } from '../scripts/blank-site-contract-samples.mjs'
import { emptyDeclaredFieldsStep, emptyHtmlByPhp } from '../scripts/blank-site-empty-fields.mjs'
import { blockStoreFile, mappingFile, releasedContract } from './fixtures/blank-site/contract.mjs'

const DEMO = readFileSync(new URL('./fixtures/blank-site/custom.sql.txt', import.meta.url), 'utf8')
const SHAS = {
  'manifest.json': '1'.repeat(64),
  'content-map.json': '2'.repeat(64),
  'presentation-lock.json': '3'.repeat(64)
}
// The fixture's own places hold no HTML piece, so only the piece test runs php: it fails on CI without php, and skips
// with the reason on a laptop (as blank-site-empty-fields.test.mjs).
const emptyHtml = emptyHtmlByPhp
const needsPhp = {
  skip:
    spawnSync('php', ['-v']).status === 0
      ? false
      : process.env.CI
        ? assert.fail('empty-html-places.php runs under `php`, and this CI host has none on PATH')
        : 'empty-html-places.php runs under `php`, and this host has none on PATH'
}
const blockStore = blockStoreFile()

function make() {
  const released = releasedContract()
  const mapping = mappingFile()
  const steps = [...BLANK_SITE_STEPS, emptyDeclaredFieldsStep({ mapping, readFile: () => null, emptyHtml })]
  const after = produceBlankSite(DEMO, { steps }).sql
  const made = blankSiteContract({
    ...released,
    mapping,
    blockStore,
    before: DEMO,
    after,
    released: SHAS,
    emptyHtml
  })
  const blank = {
    manifest: JSON.parse(made.files['manifest.json']),
    contentMap: JSON.parse(made.files['content-map.json']),
    lock: JSON.parse(made.files['presentation-lock.json'])
  }
  return { released, mapping, made, blank }
}

const check = ({ released, mapping, blank }) =>
  checkBlankSiteContract({ mapping, blockStore, released: { ...released, sha256: SHAS }, blank, emptyHtml })

test('the id is the released one with -blank, under the plugin rule for a profile id', () => {
  assert.equal(blankSiteContractId('ja-bakery/j6/1.0.3'), 'ja-bakery-blank/j6/1.0.3')
  assert.throws(() => blankSiteContractId('Bad Id/j6/1'), /no valid blank site contract id/)
})

test('it keeps the records the blank site keeps and names none it removes', () => {
  const { made, blank } = make()
  assert.deepEqual(made.removed, ['article-1', 'category-8', 'menuItem-102'])
  assert.deepEqual(
    blank.contentMap.entities.map((e) => e.key),
    ['module-90', 'module-91']
  )
  assert.deepEqual(
    blank.contentMap.slots.map((s) => s.key),
    ['module-90.0', 'module-90.1', 'module-91.0']
  )
  assert.deepEqual(blank.contentMap.pages, [])
  assert.deepEqual(blank.contentMap.itemPages, {})
  assert.deepEqual(Object.keys(blank.lock.entities), ['module-90', 'module-91'])
  assert.match(
    blank.lock.entities['module-90'].params,
    /\\"title\\":\[\\"\\"\]/,
    'the hero row holds the emptied heading'
  )
  assert.doesNotMatch(JSON.stringify(blank.lock), /Bread, slowly/)
  assert.deepEqual(blank.lock.assignments, [], 'the blank site assigns its blocks to no page')
  assert.deepEqual(blank.lock.inventoryCounts, { module: 2, category: 0, article: 0, menuItem: 0 })
  assert.deepEqual(blank.lock.access.entityRules, { 'modules.90': '{}' })
  assert.equal(blank.manifest.id, 'ja-bakery-blank/j6/1.0.3')
  assert.deepEqual(blank.manifest.blankSiteOf.files, SHAS)
  assert.equal(blank.manifest.blankSiteOf.opened, 1)
})

test('a place the blank site empties opens empty, at the kit limit; every other slot is the released one', () => {
  const { released, blank } = make()
  const [heading, title, footer] = blank.contentMap.slots
  assert.equal(heading.sample, '')
  assert.equal(heading.opensEmpty, true)
  assert.equal(heading.maxCharacters, 32, 'the kit limit of the heading, not the released cap of 40')
  assert.deepEqual(
    { ...heading, sample: 'Bread, slowly', opensEmpty: undefined, maxCharacters: 40 },
    { ...released.contentMap.slots[0], opensEmpty: undefined }
  )
  assert.deepEqual(title, released.contentMap.slots[1])
  assert.deepEqual(footer, released.contentMap.slots[2])
})

test(
  'pieces of an HTML slot leave the slot occupied: its sample is the emptied value, and it does not open empty',
  needsPhp,
  () => {
    const slot = {
      key: 'module-5.0',
      entity: 'module-5',
      column: 'content',
      type: 'text',
      sample: '<h2>Rye</h2><a href="#">More</a>'
    }
    const mapping = {
      entities: { 'module-5': { kind: 'module', sourceId: 5 } },
      blocks: {
        b: {
          fields: {
            title: [
              {
                entity: 'module-5',
                column: 'content',
                slot: 'module-5.0',
                xpath: '/html/body/div/h2',
                piece: true
              }
            ]
          }
        }
      }
    }
    const store = {
      blocks: [
        {
          id: 'b',
          fields: [{ name: 'title', type: 'text', limit: 20, slot: 'module-5.0@/html/body/div/h2' }]
        }
      ]
    }
    const emptied = emptiedSamples({ mapping, blockStore: store, slots: [slot], emptyHtml })
    // Only the named heading is emptied: the link text no mapping place names stays, and the door counts it with the
    // heading's limit (20, a space, and the 4 kept characters).
    assert.deepEqual(blankSlot(slot, emptied), {
      ...slot,
      sample: '<h2></h2><a href="#">More</a>',
      maxCharacters: 25
    })
  }
)

test('two runs give the same bytes', () => {
  assert.deepEqual(make().made.files, make().made.files)
})

test('the check passes on what the generator makes', () => {
  assert.deepEqual(check(make()), [])
})

test('the check names each way a blank site contract goes wrong', () => {
  const cases = [
    [
      'another id',
      (b) => (b.manifest.id = 'ja-bakery/j6/1.0.3'),
      /manifest.json id: must be ja-bakery-blank/
    ],
    [
      'a stale released file',
      (b) => (b.manifest.blankSiteOf.files['content-map.json'] = '9'.repeat(64)),
      /make the blank site contract again/
    ],
    [
      'the demo sample left in an emptied place',
      (b) => (b.contentMap.slots[0].sample = 'Bread, slowly'),
      /the blank site empties it/
    ],
    [
      'an emptied place that does not open',
      (b) => delete b.contentMap.slots[0].opensEmpty,
      /the blank site empties it/
    ],
    [
      'an opened place the door holds to a demo box',
      (b) => (b.contentMap.slots[0].maxCharacters = 8),
      /the door holds it to 8 characters, the kit's limit for the place is 32/
    ],
    [
      'an opened place that keeps a keep flag',
      (b) => (b.contentMap.slots[0].customize = 'keep'),
      /carries customize "keep"/
    ],
    [
      'a slot changed that the blank site keeps',
      (b) => (b.contentMap.slots[2].maxCharacters = 5),
      /differs from the released slot/
    ],
    [
      'a lock row that keeps demo text',
      (b) => (b.lock.entities['module-90'] = releasedContract().lock.entities['module-90']),
      /module-90: differs from the released row with the emptied places empty/
    ],
    [
      'a removed record named',
      (b) => (b.lock.entities['article-1'] = {}),
      /names article-1, a record the blank site removes/
    ],
    [
      'a slot of a kept record missing',
      (b) => b.contentMap.slots.splice(0, 1),
      /slot module-90.0 of a kept record is missing/
    ],
    [
      'a slot on a record the build creates',
      (b) => b.contentMap.slots.push({ key: 'article-1.0', entity: 'article-1' }),
      /article-1.0 is on a record the build creates/
    ]
  ]
  for (const [name, spoil, message] of cases) {
    const input = make()
    spoil(input.blank)
    const problems = check(input)
    assert.ok(
      problems.some((p) => message.test(`${p.file} ${p.at}: ${p.message}`)),
      `${name}: ${JSON.stringify(problems)}`
    )
  }
})
